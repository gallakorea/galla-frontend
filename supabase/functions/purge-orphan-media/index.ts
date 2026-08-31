/* 🧹 고아 미디어 청소 — 아무 행에서도 참조되지 않는 R2 객체를 지운다.

   왜 필요한가:
     미디어는 '고르는 즉시' R2로 올라간다(초안 복원을 위해 의도된 설계).
     그래서 유저가 발행하지 않고 나가면 그 파일은 영원히 남는다. 지우는 주체가 없었다.
     저장 단가는 싸지만(GB당 월 $0.015) 누적은 멈추지 않는다.

   안전 원칙 — 이 순서를 지킨다:
     ① 기본은 dry-run. 지우려면 apply=true 를 명시해야 한다.
     ② '살릴 목록'은 media_referenced_keys() 가 public 의 모든 text/jsonb 컬럼을
        동적으로 훑어 만든다. 하드코딩 목록은 테이블이 늘면 뒤처져 산 파일을 지운다.
     ③ 유예기간(기본 7일) — 방금 올려 아직 draft 에 안 붙은 파일을 지우지 않는다.
        (업로드 → 폼 저장 사이의 창)
     ④ 안전장치: 참조 키가 0개거나, 지울 비율이 과반이면 중단한다.
        스캔이 조용히 실패했을 때 전량 삭제로 이어지는 것을 막는다.
     ⑤ 한 번에 지우는 상한(기본 500) — 사고가 나도 피해가 유한하다.
*/
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.4";

const CF_ACCOUNT_ID = Deno.env.get("CF_ACCOUNT_ID")!;
const R2_BUCKET     = Deno.env.get("R2_BUCKET")!;
const SUPA_URL      = Deno.env.get("SUPABASE_URL")!;
const SVC_KEY       = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const r2 = new AwsClient({
  accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID")!,
  secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY")!,
  service: "s3",
  region: "auto",
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o, null, 1), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const BASE = `https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}`;

/* R2 객체 전량 나열(페이지네이션). key + 최종수정시각 + 크기 */
async function listAll(): Promise<{ key: string; at: number; size: number }[]> {
  const out: { key: string; at: number; size: number }[] = [];
  let token: string | null = null;
  for (let page = 0; page < 200; page++) {          // 상한 = 20만 객체
    const u = new URL(BASE);
    u.searchParams.set("list-type", "2");
    u.searchParams.set("max-keys", "1000");
    if (token) u.searchParams.set("continuation-token", token);
    const res = await r2.fetch(u.toString());
    if (!res.ok) throw new Error(`list_failed_${res.status}`);
    const xml = await res.text();
    for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const b = m[1];
      const key  = b.match(/<Key>([\s\S]*?)<\/Key>/)?.[1] ?? "";
      const lm   = b.match(/<LastModified>([\s\S]*?)<\/LastModified>/)?.[1] ?? "";
      const size = Number(b.match(/<Size>(\d+)<\/Size>/)?.[1] ?? 0);
      if (key) out.push({ key, at: Date.parse(lm) || 0, size });
    }
    const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
    token = truncated ? (xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/)?.[1] ?? null) : null;
    if (!token) break;
  }
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const body = await req.json().catch(() => ({} as any));

    /* 🔒 호출자 검증 — 이 저장소 관례를 따른다(video-migrate-worker 와 동일):
       크론은 x-cron-secret, 사람/스크립트는 service_role JWT.
       ⚠️ 키 문자열 == 비교는 하지 않는다 — 게이트웨이가 헤더를 바꿔 넣는 경우가 있어
          실제로 403 으로 막혔다. JWT 의 role 클레임을 본다. */
    const sbAuth = createClient(SUPA_URL, SVC_KEY);
    let allowed = false;
    const secretHdr = req.headers.get("x-cron-secret");
    if (secretHdr) {
      const { data } = await sbAuth.rpc("cron_secret_matches", { p_secret: secretHdr });
      allowed = data === true;
    }
    if (!allowed) {
      const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer /, "");
      try {
        const p = JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
        allowed = p?.role === "service_role";
      } catch (_) { /* 형식이 아니면 거부 */ }
    }
    if (!allowed) return j({ error: "forbidden" }, 403);

    const apply    = body?.apply === true;                       // ① 기본 dry-run
    const graceDays = Math.max(1, Number(body?.grace_days) || 7); // ③ 유예기간
    const maxDelete = Math.min(2000, Math.max(1, Number(body?.max_delete) || 500)); // ⑤ 상한

    /* 참조 목록은 캐시(media_ref_cache)에서 읽는다.
       실시간 스캔은 ~27초라 PostgREST statement_timeout 에 걸렸다(실측).
       크론(media_ref_refresh, 매일 04:40 KST)이 DB 안에서 미리 채운다. */
    const sb = createClient(SUPA_URL, SVC_KEY);
    const referenced = new Set<string>();
    let refAt: string | null = null;
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from("media_ref_cache")
        .select("key,refreshed_at").range(from, from + 999);
      if (error) return j({ error: "ref_cache_failed", detail: error.message }, 500);
      for (const r of data || []) { referenced.add((r as any).key); refAt = (r as any).refreshed_at; }
      if (!data || data.length < 1000) break;
    }

    // ④ 안전장치 0 — 캐시가 낡으면 그 사이 올라온 파일이 '고아'로 보인다. 중단한다.
    const ageH = refAt ? (Date.now() - Date.parse(refAt)) / 3600000 : Infinity;
    if (ageH > 48) {
      return j({ error: "abort_stale_cache", cache_age_hours: Math.round(ageH),
                 hint: "refresh_media_refs() 를 먼저 돌려라." }, 500);
    }
    const objects = await listAll();

    // ④ 안전장치 1 — 참조가 하나도 안 잡혔다면 스캔이 깨진 것이다. 절대 지우지 않는다.
    if (referenced.size === 0 && objects.length > 0) {
      return j({ error: "abort_no_references", objects: objects.length,
                 hint: "참조 스캔이 0건. 지우면 전량 삭제가 된다 — 중단했다." }, 500);
    }

    /* 🎬 HLS 는 '폴더 단위'로 살린다.
       DB 에는 hls/<id>/video.m3u8 하나만 저장되는데, 실제 폴더에는 렌디션 m3u8 과
       세그먼트(.m4s)가 수천 개 들어 있다. 키 단위로만 보면 세그먼트가 전부 고아로 잡혀
       영상이 통째로 깨진다(실측: 유예 1일 기준 고아 91.8% = 2,787개, 대부분 세그먼트).
       그래서 참조된 키가 hls/<id>/... 이면 그 <id> 폴더 전체를 보호 목록에 넣는다. */
    const keepPrefix = new Set<string>();
    for (const k of referenced) {
      const m = k.match(/^(hls\/[^/]+)\//);
      if (m) keepPrefix.add(m[1] + "/");
    }
    const isKept = (key: string) => {
      if (referenced.has(key)) return true;
      for (const p of keepPrefix) if (key.startsWith(p)) return true;
      return false;
    };

    const cutoff = Date.now() - graceDays * 86400000;
    const orphans = objects.filter(o => !isKept(o.key) && o.at > 0 && o.at < cutoff);

    // ④ 안전장치 2 — 전체의 과반을 지우려 한다면 뭔가 잘못됐다.
    const ratio = objects.length ? orphans.length / objects.length : 0;
    const suspicious = ratio > 0.5;

    const bytes = orphans.reduce((s, o) => s + o.size, 0);
    const report = {
      ok: true,
      mode: apply ? "APPLY" : "dry-run",
      objects_total: objects.length,
      referenced_keys: referenced.size,
      protected_hls_folders: keepPrefix.size,
      cache_age_hours: Math.round(ageH * 10) / 10,
      grace_days: graceDays,
      orphans: orphans.length,
      orphan_bytes: bytes,
      orphan_mb: Math.round(bytes / 1048576 * 10) / 10,
      ratio: Math.round(ratio * 1000) / 10,
      sample: orphans.slice(0, 10).map(o => ({ key: o.key, mb: Math.round(o.size / 1048576 * 100) / 100,
                                               age_days: Math.round((Date.now() - o.at) / 86400000) })),
    };

    if (!apply) return j({ ...report, note: "삭제하지 않았다. 지우려면 apply:true" });
    if (suspicious) {
      return j({ ...report, error: "abort_ratio", hint: "고아 비율이 과반이다 — 참조 스캔을 먼저 확인하라." }, 500);
    }

    let deleted = 0, failed = 0;
    for (const o of orphans.slice(0, maxDelete)) {
      const res = await r2.fetch(`${BASE}/${o.key}`, { method: "DELETE" });
      if (res.ok || res.status === 404) deleted++; else failed++;
    }
    return j({ ...report, deleted, failed, capped: orphans.length > maxDelete });
  } catch (e) {
    return j({ error: String(e) }, 500);
  }
});
