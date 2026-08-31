/* 🎬→📦 Cloudflare Stream HLS를 R2로 미러링
 *
 *  왜: Stream은 **시청 1,000분당 $1**이다. 영상 시청은 무료 기능이라 GC로 회수되지 않는데,
 *      MAU 1만이면 월 $3,000 규모가 된다. R2는 egress가 무료라 같은 트래픽이 $0다.
 *      이관은 영상당 1회만 delivered로 과금된다(1.5분짜리면 $0.0015).
 *
 *  왜 MP4가 아니라 HLS 미러링인가: 지금 재생이 HLS다. 세그먼트를 그대로 옮기면
 *  **재생 경험이 100% 같다**(같은 파일, 같은 플레이어, 같은 적응형 화질).
 *  MP4로 바꾸면 moov 위치(faststart)에 따라 재생 시작이 느려질 수 있는데 그걸 확인할 방법이 없었다.
 *
 *  ⚠️ 원본은 여기서 지우지 않는다. 미러가 실제로 재생되는 걸 확인한 뒤 따로 지운다.
 *     지우고 나면 되돌릴 수 없다.
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.4";

const CF_ACCOUNT_ID = Deno.env.get("CF_ACCOUNT_ID")!;
const CF_SUBDOMAIN = Deno.env.get("CF_STREAM_SUBDOMAIN")!;   // customer-xxxx.cloudflarestream.com
const R2_ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID")!;
const R2_SECRET = Deno.env.get("R2_SECRET_ACCESS_KEY")!;
const R2_BUCKET = Deno.env.get("R2_BUCKET")!;
const R2_PUBLIC_URL = Deno.env.get("R2_PUBLIC_URL")!;         // https://cdn.galla.im

const r2 = new AwsClient({
  accessKeyId: R2_ACCESS_KEY_ID,
  secretAccessKey: R2_SECRET,
  service: "s3",
  region: "auto",
});

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

const r2Url = (key: string) =>
  `https://${R2_BUCKET}.${CF_ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`;

/* 세그먼트는 캐시가 목적이라 아주 길게 잡는다(내용이 바뀌지 않는 불변 파일).
   ⚠️ 매니페스트는 짧게 — 나중에 화질을 추가/수정하면 반영돼야 한다. */
async function putR2(key: string, body: ArrayBuffer | string, type: string, immutable: boolean) {
  const res = await r2.fetch(r2Url(key), {
    method: "PUT",
    body,
    headers: {
      "Content-Type": type,
      "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "public, max-age=300",
    },
  });
  if (!res.ok) throw new Error(`R2 PUT ${key} ${res.status} ${await res.text().catch(() => "")}`);
}

/* Stream 세그먼트 URI를 R2용 상대경로로 바꾼다.
   원본: ../../<uid>/video/1280/seg_1.mp4?p=...&s=...   (서명 쿼리가 붙어 있다)
   결과: video/1280/seg_1.mp4                            (매니페스트와 같은 폴더 기준)
   ⚠️ 서명 쿼리를 떼지 않으면 R2에 그 이름 그대로 저장돼 키가 지저분해지고 캐시도 안 먹는다. */
function cleanUri(uri: string, uid: string): string | null {
  if (!uri || uri.startsWith("#")) return null;
  const noQuery = uri.split("?")[0];
  const i = noQuery.indexOf(`${uid}/`);
  if (i >= 0) return noQuery.slice(i + uid.length + 1);   // <uid>/ 뒤부터
  return noQuery.replace(/^\.\.\//g, "");                  // 같은 폴더 파일(렌디션 m3u8 등)
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*" } });
  try {
    // 관리자 또는 service_role만 — 남의 영상을 이관시킬 수 있으면 안 된다.
    // ⚠️ 키 문자열을 직접 비교하지 않는다. 키가 회전되거나 형식이 바뀌면 조용히 막힌다
    //    (실제로 그렇게 막혔다). 게이트웨이가 이미 JWT 서명을 검증하므로 role 클레임만 본다.
    const auth = req.headers.get("Authorization") || "";
    const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    let isService = false;
    /* 🔑 서비스 키가 신형(sb_secret_…)이면 JWT 가 아니라 payload 디코드가 던진다.
       그러면 관리자 검사로 떨어져 'forbidden' → 이관 워커가 20회 재시도 후 실패했다
       (실측: video_migrations 에 forbidden × 20, 영상 2편이 깨진 채 남음).
       그래서 환경변수와 직접 대조하는 경로를 먼저 둔다 — 구형 JWT·신형 키 모두 통과. */
    const SRK_ENV = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (jwt && SRK_ENV && jwt === SRK_ENV) isService = true;
    if (!isService) {
      try {
        const p = JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
        isService = p?.role === "service_role";
      } catch { /* 사용자 토큰이면 아래 관리자 검사로 */ }
    }
    if (!isService) {
      const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: auth } } });
      const { data: ok } = await supa.rpc("_is_admin");
      if (!ok) return json({ ok: false, reason: "forbidden" }, 403);
    }

    const { uid, limit } = await req.json();
    if (!uid || !/^[a-f0-9]{20,}$/i.test(uid)) return json({ ok: false, reason: "bad_uid" }, 400);
    const MAX_FILES = Math.min(Number(limit) || 400, 400);

    const base = `https://${CF_SUBDOMAIN}/${uid}/manifest`;
    const prefix = `hls/${uid}`;

    // ── 1) 마스터 매니페스트. 렌디션·오디오 m3u8 이름은 상대경로라 그대로 쓴다.
    const masterRes = await fetch(`${base}/video.m3u8`);
    if (!masterRes.ok) return json({ ok: false, reason: "master_fetch", status: masterRes.status }, 502);
    const master = await masterRes.text();

    const childNames = new Set<string>();
    for (const line of master.split("\n")) {
      const t = line.trim();
      if (t.startsWith("#EXT-X-MEDIA")) {
        const m = t.match(/URI="([^"]+)"/);
        if (m) childNames.add(m[1].split("?")[0]);
      } else if (t && !t.startsWith("#")) {
        childNames.add(t.split("?")[0]);
      }
    }
    if (!childNames.size) return json({ ok: false, reason: "no_renditions" }, 502);

    // ── 2) 렌디션·오디오 플레이리스트를 받아 세그먼트 목록을 모으고, URI를 R2용으로 고쳐 쓴다
    const files: { src: string; key: string }[] = [];
    const rewritten: { name: string; body: string }[] = [];

    for (const name of childNames) {
      const res = await fetch(`${base}/${name}`);
      if (!res.ok) return json({ ok: false, reason: "child_fetch", name, status: res.status }, 502);
      const text = await res.text();
      const out: string[] = [];
      for (const raw of text.split("\n")) {
        const line = raw.trimEnd();
        if (line.startsWith("#EXT-X-MAP")) {
          const m = line.match(/URI="([^"]+)"/);
          const c = m ? cleanUri(m[1], uid) : null;
          if (m && c) {
            files.push({ src: new URL(m[1], `${base}/`).toString(), key: `${prefix}/${c}` });
            out.push(line.replace(/URI="[^"]+"/, `URI="${c}"`));
            continue;
          }
        } else if (line && !line.startsWith("#")) {
          const c = cleanUri(line, uid);
          if (c) {
            files.push({ src: new URL(line, `${base}/`).toString(), key: `${prefix}/${c}` });
            out.push(c);
            continue;
          }
        }
        out.push(line);
      }
      rewritten.push({ name, body: out.join("\n") });
    }

    if (files.length > MAX_FILES) {
      return json({ ok: false, reason: "too_many_files", files: files.length, max: MAX_FILES }, 413);
    }

    // ── 3) 세그먼트 복사. 동시 6개 — 너무 늘리면 엣지 메모리가 터지고,
    //       너무 줄이면 실행 시간 제한에 걸린다.
    let bytes = 0;
    const CONC = 6;
    for (let i = 0; i < files.length; i += CONC) {
      await Promise.all(files.slice(i, i + CONC).map(async (f) => {
        const r = await fetch(f.src);
        if (!r.ok) throw new Error(`seg fetch ${f.key} ${r.status}`);
        const buf = await r.arrayBuffer();
        bytes += buf.byteLength;
        await putR2(f.key, buf, "video/mp4", true);
      }));
    }

    // ── 4) 매니페스트는 세그먼트가 다 올라간 뒤에 올린다.
    //       순서를 뒤집으면 이관 도중 플레이어가 없는 파일을 찾아 재생이 깨진다.
    for (const c of rewritten) await putR2(`${prefix}/${c.name}`, c.body, "application/x-mpegURL", false);
    await putR2(`${prefix}/video.m3u8`, master, "application/x-mpegURL", false);

    /* ── 5) 썸네일도 같이 옮긴다.
       ⚠️ 이걸 빼먹으면 나중에 Stream에서 영상을 지우는 순간 피드 썸네일이 전부 깨진다.
          (영상은 R2라 잘 나오는데 썸네일만 X표가 뜬다 — 원인 찾기 제일 어려운 종류다) */
    let thumb: string | null = null;
    try {
      const tRes = await fetch(`https://${CF_SUBDOMAIN}/${uid}/thumbnails/thumbnail.jpg?time=1s&height=720`);
      if (tRes.ok) {
        await putR2(`${prefix}/thumbnail.jpg`, await tRes.arrayBuffer(), "image/jpeg", true);
        thumb = `${R2_PUBLIC_URL}/${prefix}/thumbnail.jpg`;
      }
    } catch { /* 썸네일 실패가 영상 이관을 막지는 않는다 */ }

    return json({
      ok: true, uid, files: files.length, bytes,
      url: `${R2_PUBLIC_URL}/${prefix}/video.m3u8`,
      thumb,
    });
  } catch (e) {
    return json({ ok: false, reason: String(e).slice(0, 300) }, 500);
  }
});
