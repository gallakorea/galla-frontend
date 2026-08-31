/* 🎬 generate-video — 갈비스 창작 대행: 자동편집형 영상(이미지+자막+음악 → 숏판 mp4).
   외부 렌더 API(Shotstack)로 합성. 엣지는 ffmpeg를 못 돌리므로 렌더는 Shotstack이 하고,
   완성 mp4는 R2로 복사해 영구 보관(Shotstack 호스팅 URL은 임시).

   흐름: op:"submit"(이미지·자막·음악·비율 → Shotstack 타임라인 제출 → renderId 반환)
        op:"status"(renderId → 진행상태; done이면 mp4를 R2로 복사해 영구 url 반환)
   클라가 submit 후 status를 폴링(렌더 ~15~60s). 엣지 타임아웃 회피 위해 폴링은 클라가.

   가드: JWT 필수, 플랫폼 일일캡(ai_daily_caps.generate-video), 유저 24h 한도(my_thumbnails kind='video').
   키: SHOTSTACK_API_KEY(필수), SHOTSTACK_ENV(stage=무료·워터마크 / v1=유료·무워터마크, 기본 stage). */
import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

// 🎟 등급 게이트 — app_settings.ai_tiers 의 롤링 윈도우. 장애 시 통과(게이트가 서비스를 죽이면 안 된다).
async function aiGate(subject: string, fn: string, n = 1): Promise<any> {
  try {
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/rpc/ai_gate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}` },
      body: JSON.stringify({ p_fn: fn, p_subject: subject, p_n: n }),
    });
    if (!r.ok) return { ok: true };
    return await r.json();
  } catch { return { ok: true }; }
}

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SVC_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SHOTSTACK_KEY = Deno.env.get("SHOTSTACK_API_KEY") || "";
const SHOTSTACK_ENV = Deno.env.get("SHOTSTACK_ENV") || "stage";   // stage(무료·샌드박스) | v1(유료·프로덕션)
const SS_BASE = `https://api.shotstack.io/edit/${SHOTSTACK_ENV}`;  // Shotstack Edit API: /edit/{env}/render
const R2_PUBLIC_URL = Deno.env.get("R2_PUBLIC_URL")!;
const CF_ACCOUNT = Deno.env.get("CF_ACCOUNT_ID")!;
const R2_BUCKET = Deno.env.get("R2_BUCKET")!;
const r2 = new AwsClient({ accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID")!, secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY")!, service: "s3", region: "auto" });


/* 🔁 요청 지문 — 같은 요청이 두 번 들어와도 한 번만 청구되게 서버에 넘긴다.
   프론트 중복 실행·네트워크 재시도·갈비스가 한 턴에 두 번 호출한 경우를 모두 덮는다.
   프롬프트가 다르면 지문도 달라 정상 과금된다("다른 느낌으로 다시"는 새 주문이 맞다). */
async function fingerprint(parts: unknown[]): Promise<string> {
  const raw = parts.map((p) => (p == null ? "" : String(p))).join("|");
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info" };
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

function callerUid(req: Request): string | null {
  try {
    const tok = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const p = JSON.parse(atob(tok.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return p.sub || null;
  } catch { return null; }
}

// 무료(unminus, 상업이용가능) 배경음 — Shotstack 공개 샘플. 나중에 자체 라이브러리로 교체 가능.
const MUSIC: Record<string, string> = {
  upbeat: "https://shotstack-assets.s3.amazonaws.com/music/unminus/berlin.mp3",
  chill: "https://shotstack-assets.s3.amazonaws.com/music/unminus/lit.mp3",
  dramatic: "https://shotstack-assets.s3.amazonaws.com/music/unminus/palace.mp3",
};
const SIZES: Record<string, { width: number; height: number }> = {
  "9:16": { width: 720, height: 1280 }, "16:9": { width: 1280, height: 720 }, "1:1": { width: 1080, height: 1080 },
};

async function aiBudgetOk(): Promise<boolean> {
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/rpc/ai_budget_take`, {
      method: "POST", headers: { "Content-Type": "application/json", apikey: SVC_KEY, Authorization: `Bearer ${SVC_KEY}` },
      body: JSON.stringify({ p_fn: "generate-video", p_n: 1 }),
    });
    if (!r.ok) return true;
    const d = await r.json();
    return !(d && d.ok === false);
  } catch { return true; }
}

function buildTimeline(images: string[], captions: string[], music: string, size: { width: number; height: number }, per: number) {
  const imgClips = images.map((src, i) => ({
    asset: { type: "image", src },
    start: +(i * per).toFixed(2), length: per, fit: "cover",
    effect: i % 2 === 0 ? "zoomIn" : "zoomOut",
    transition: { in: "fade", out: "fade" },
  }));
  const capClips = captions.filter(Boolean).map((text, i) => ({
    asset: { type: "title", text: String(text).slice(0, 90), style: "subtitle", size: "large", color: "#ffffff", background: "#00000088" },
    start: +(i * per).toFixed(2), length: per, position: "bottom", offset: { y: 0.08 },
    transition: { in: "fade", out: "fade" },
  }));
  const soundtrack = MUSIC[music] ? { soundtrack: { src: MUSIC[music], effect: "fadeInFadeOut" } } : {};
  return {
    timeline: { background: "#000000", ...soundtrack, tracks: [{ clips: capClips }, { clips: imgClips }] },
    output: { format: "mp4", size, fps: 25 },
  };
}

async function copyToR2(mp4Url: string, uid: string): Promise<string> {
  const res = await fetch(mp4Url);
  if (!res.ok) throw new Error(`fetch_mp4_${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const key = `videos/${uid}/${crypto.randomUUID()}.mp4`;
  const put = await r2.fetch(`https://${CF_ACCOUNT}.r2.cloudflarestorage.com/${R2_BUCKET}/${key}`, {
    method: "PUT", headers: { "content-type": "video/mp4", "cache-control": "public, max-age=31536000, immutable" }, body: bytes,
  });
  if (!put.ok) throw new Error(`r2_${put.status}`);
  return `${R2_PUBLIC_URL}/${key}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const me = callerUid(req);
  if (!me) return j({ error: "auth" }, 401);
  if (!SHOTSTACK_KEY) return j({ error: "no_shotstack_key" }, 503);

  let body: any;
  try { body = await req.json(); } catch { return j({ error: "bad_json" }, 400); }
  const op = body?.op || "submit";

  // 🎬 숏폼 자동영상 오픈(사장님 2026-08-07): stage(sandbox)에서도 제출 허용(워터마크 감수) — 단 '세로 숏폼 10초 이내'만.
  //    가로(16:9) 자동생성은 계속 잠금(롱폼은 사용자 촬영 + 기획·대본 지원 정책).
  if (op === "submit" && String(body.ratio || "9:16") !== "9:16" && SHOTSTACK_ENV !== "v1") return j({ error: "feature_locked_horizontal" }, 503);

  if (op === "submit") {
    // ⏱ 10초 캡(숏폼 정책): 장면 최대 3개 × 장면당 초 클램프 → 총 길이 ≤ 10s.
    const images: string[] = Array.isArray(body.images) ? body.images.filter((u: any) => typeof u === "string" && /^https?:\/\//.test(u)).slice(0, 3) : [];
    if (images.length < 1) return j({ error: "no_images" }, 400);
    const captions: string[] = Array.isArray(body.captions) ? body.captions.map((c: any) => String(c || "")).slice(0, 3) : [];
    const size = SIZES[String(body.ratio || "9:16")] || SIZES["9:16"];
    let per = Math.min(Math.max(Number(body.per) || 3, 2), 6);
    per = Math.min(per, +(9.9 / images.length).toFixed(2));   // 총합 ≤ 10초 강제(인코딩 오버헤드 ~0.1s 마진, 실측 10.005s→9.9x)
    const music = String(body.music || "upbeat");

    // 유저 24h 영상 한도(썸네일 테이블 재사용, kind='video')
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count } = await sb.from("my_thumbnails").select("id", { count: "exact", head: true }).eq("user_id", me).eq("kind", "video").gte("created_at", since);
    if ((count || 0) >= 6) return j({ error: "user_daily_limit", limit: 6 }, 429);
    if (!(await aiBudgetOk())) return j({ error: "ai_daily_cap" }, 429);

    // 💰 GP 선차감 (호출자 권한) — 제출 실패 시 환불
    const asUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization")! } },
    });
    // 🎟 등급 게이트 — 무료/프렌드/프로별 생성 한도(app_settings.ai_tiers). GP 차감보다 먼저 본다.
    { const g = await aiGate("u:" + me, "generate-video");
      if (g && g.ok === false) return j({ error: "tier_limit", gate: g }, 429); }
    const chargeKey = await fingerprint(["video", String(body.ratio || ""), per, music, images.join(","), captions.join("|")]);
    const { data: charge, error: cErr } = await asUser.rpc("ai_creation_charge",
      { p_kind: "video", p_n: 1, p_key: chargeKey });
    if (cErr || !charge?.ok) return j({ error: charge?.reason || "charge_failed", detail: charge }, 402);
    const paid = (charge.charged as number) || 0;
    const refund = async () => { try { await sb.rpc("ai_creation_refund", { p_user: me, p_amount: paid, p_key: chargeKey }); } catch (_) {} };

    const edit = buildTimeline(images, captions, music, size, per);
    const r = await fetch(`${SS_BASE}/render`, { method: "POST", headers: { "x-api-key": SHOTSTACK_KEY, "Content-Type": "application/json" }, body: JSON.stringify(edit) });
    const d = await r.json();
    if (!r.ok || !d?.response?.id) { console.error("[video] submit", r.status, JSON.stringify(d).slice(0, 300)); await refund(); return j({ error: "submit_failed", detail: d?.message || `http_${r.status}` }, 502); }
    return j({ ok: true, id: d.response.id });
  }

  if (op === "status") {
    const id = String(body.id || "");
    if (!id) return j({ error: "no_id" }, 400);
    const r = await fetch(`${SS_BASE}/render/${id}`, { headers: { "x-api-key": SHOTSTACK_KEY } });
    const d = await r.json();
    if (!r.ok) return j({ error: "status_failed", detail: `http_${r.status}` }, 502);
    const status = d?.response?.status;
    if (status === "done") {
      try {
        const url = await copyToR2(d.response.url, me);
        try { await sb.from("my_thumbnails").insert({ user_id: me, url, kind: "video" }); } catch (_) {}
        return j({ ok: true, status, url });
      } catch (e) {
        return j({ ok: true, status, url: d.response.url, r2: false, warn: String(e).slice(0, 80) });   // R2 실패 시 임시 url이라도
      }
    }
    if (status === "failed") return j({ ok: false, status, error: "render_failed", detail: String(d?.response?.error || "").slice(0, 200) });   // Shotstack 원인 노출(디버깅)
    return j({ ok: true, status });   // queued | fetching | rendering | saving
  }

  return j({ error: "bad_op" }, 400);
});
