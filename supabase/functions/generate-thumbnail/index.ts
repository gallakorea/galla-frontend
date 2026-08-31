/* 🖼 generate-thumbnail — 갈비스 창작 대행: 콘텐츠 썸네일/커버 AI 생성.
   흐름: JWT → 프롬프트 검열(moderation+IP가드) → 플랫폼 일일캡 → 유저 일일한도 → gpt-image-1 → R2 → my_thumbnails.
   지금은 무료(완성형 우선) — 남용가드는 플랫폼 캡(ai_daily_caps.generate-thumbnail) + 유저 24h 한도.
   과금(GP)은 나중에 붙인다. 생성 권한은 이 함수에만(클라에 이미지생성/INSERT 권한 없음). */
import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

import { logSpendUnits } from "../_shared/spend.ts";

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
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY")!;
// 💸 이미지 생성을 Cloudflare Workers AI FLUX-1-schnell로(사실상 공짜, 기존 CF 인프라). 토큰 있으면 CF 우선, 없거나 실패 시 OpenAI 폴백.
//    레퍼런스 사진 편집(내 얼굴/제품 넣기)은 FLUX schnell 불가 → 그 경로만 gpt-image-1 edits 유지.
const CF_AI_TOKEN = Deno.env.get("CF_AI_TOKEN") || Deno.env.get("CF_WORKERS_AI_TOKEN") || "";
// 🧑‍🎨 레퍼런스 편집(내 얼굴/제품 넣기, 유료) — Google Gemini 나노바나나(얼굴보존 최강·저가·OpenAI 결제벽 우회).
//    키 있으면 Gemini 우선, 없거나 실패 시 gpt-image-1 edits 폴백.
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const GEMINI_IMG_MODEL = Deno.env.get("GEMINI_IMAGE_MODEL") || "gemini-3.1-flash-image";
// Gemini는 썸네일에 멋대로 영어 글자를 박는 습성 → 글자 금지를 강하게 못박는다(앱이 한글을 따로 덧씌움).
const GEMINI_NOTEXT = " ABSOLUTELY NO text, no letters, no words, no captions, no typography, no numbers, no watermark, no logo anywhere in the image. The image must be 100% text-free — leave clean empty space instead of any text.";
const R2_PUBLIC_URL = Deno.env.get("R2_PUBLIC_URL")!;
const r2 = new AwsClient({
  accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID")!,
  secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY")!,
  service: "s3", region: "auto",
});
const R2_BUCKET = Deno.env.get("R2_BUCKET")!;
const CF_ACCOUNT = Deno.env.get("CF_ACCOUNT_ID")!;
const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SVC_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const USER_DAILY_LIMIT = 12;   // 유저별 24시간 썸네일 생성 한도(남용 방지)


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

// 남의 IP·실존인물 차단(스티커와 동일 정책)
const BLOCKED = [
  "피카츄", "pikachu", "포켓몬", "pokemon", "마리오", "mario", "디즈니", "disney", "미키", "mickey",
  "짱구", "도라에몽", "doraemon", "카카오프렌즈", "라이언", "어피치", "라인프렌즈", "브라운", "코니",
  "산리오", "sanrio", "헬로키티", "hello kitty", "마블", "marvel", "스파이더맨", "spider-man", "배트맨",
  "batman", "슈퍼맨", "superman", "원피스", "루피", "나루토", "naruto", "귀멸", "케데헌",
  "대통령", "president", "김정은", "트럼프", "trump", "머스크", "musk",
  "bts", "방탄소년단", "블랙핑크", "blackpink", "뉴진스", "아이유", "손흥민",
];
function ipGuard(p: string): string | null {
  const s = p.toLowerCase();
  const hit = BLOCKED.find((w) => s.includes(w.toLowerCase()));
  return hit || null;
}
async function moderate(text: string): Promise<boolean> {
  try {
    const r = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "omni-moderation-latest", input: text }),
    });
    const d = await r.json();
    return !!d?.results?.[0]?.flagged;
  } catch { return false; }
}

// 썸네일 톤 — '스크롤을 멈추게 하는' 프리미엄 표지 아트. 글자 없음, 실존 유명인·로고 없음.
//   매력 천장을 올리려 아트디렉션 강화: 단일 강한 주제 + 과장된 감정/순간, 시네마틱 라이팅,
//   쨍한 채도·고대비·깊이감·샤프한 디테일. gpt-image-1 quality=high와 함께 씀.
const STYLE = "Ultra high-quality, scroll-stopping viral thumbnail art. "
  + "One bold focal subject with an exaggerated dramatic expression or a high-tension moment. "
  + "Dynamic composition with strong depth, leading lines, and a clear center of attention. "
  + "Cinematic rim lighting and moody key light, vivid saturated punchy color grade, high contrast, "
  + "glossy premium finish, razor-sharp crisp detail, subtle bokeh background. "
  + "Trending magnetic social-media cover aesthetic that stops the scroll. "
  + "No text, no letters, no words, no numbers, no watermark, no real brand logos, no real celebrity faces.";

// 레퍼런스(유저 사진) 모드 — 그 사람/사물의 '얼굴·생김새·특징을 유지'하면서 어그로 썸네일로 재연출.
const REF_STYLE = "Use the person/subject in the provided reference photo(s) as the MAIN focal subject of the thumbnail, "
  + "keeping their real face, likeness, hairstyle, body and key features clearly recognizable (do NOT swap to a different person). "
  + "Re-stage them into a scroll-stopping viral thumbnail: exaggerated dramatic expression or high-tension moment, "
  + "cinematic rim lighting and moody key light, vivid saturated punchy color grade, high contrast, strong depth and bokeh, "
  + "razor-sharp premium finish, dynamic composition with a clear center of attention. "
  + "No added text, no letters, no words, no numbers, no watermark, no brand logos.";

const SIZES: Record<string, string> = { portrait: "1024x1536", landscape: "1536x1024", square: "1024x1024" };
// Cloudflare FLUX 치수(FLUX 친화 배수). schnell은 steps 1~8.
const FLUX_SIZES: Record<string, { w: number; h: number }> = {
  portrait: { w: 896, h: 1152 }, landscape: { w: 1152, h: 896 }, square: { w: 1024, h: 1024 },
};
// 🖼 Cloudflare Workers AI FLUX-1-schnell — 프롬프트→이미지(base64 JPEG). 토큰 없거나 실패 시 null(→OpenAI 폴백).
async function genCloudflareFlux(prompt: string, ratio: string): Promise<Uint8Array | null> {
  if (!CF_AI_TOKEN) return null;
  const sz = FLUX_SIZES[ratio] || FLUX_SIZES.portrait;
  const call = (extra: Record<string, unknown>) => fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
    { method: "POST", headers: { Authorization: `Bearer ${CF_AI_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: prompt.slice(0, 2048), steps: 8, ...extra }) });
  const once = async (): Promise<Uint8Array | null> => {
    let r = await call({ width: sz.w, height: sz.h });
    if (r.status === 400) r = await call({});   // 일부 버전은 width/height 미지원 → 정사각 폴백
    const d = await r.json().catch(() => null);
    /* 💰 CF FLUX — 기존 인프라라 한계원가가 낮지만 0 은 아니다. 단가 미측정이라
       0 으로 두고 '몇 장 뽑았나'만 남긴다(청구서 오면 여기만 고친다). */
    if (r.ok && d?.result?.image) logSpendUnits("generate-thumbnail", "cf-flux-1-schnell", null, 1, 0);
    const b64 = d?.result?.image;
    if (!r.ok || !b64) { console.error("[thumb] cf-flux", r.status, JSON.stringify(d?.errors || d).slice(0, 200)); return null; }
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  };
  // CF는 가끔 일시 실패 → 2회까지 재시도(그래야 막힌 OpenAI 폴백으로 안 샌다)
  for (let i = 0; i < 2; i++) {
    try { const out = await once(); if (out) return out; } catch (e) { console.error("[thumb] cf-flux ex", String(e).slice(0, 120)); }
  }
  return null;
}
function sniffImage(b: Uint8Array): { ct: string; ext: string } {
  if (b[0] === 0xFF && b[1] === 0xD8) return { ct: "image/jpeg", ext: "jpg" };
  if (b[0] === 0x89 && b[1] === 0x50) return { ct: "image/png", ext: "png" };
  return { ct: "image/png", ext: "png" };
}
// 바이트 → base64(청크 인코딩, 스택 폭주 방지)
function toB64(bytes: Uint8Array): string {
  let bin = ""; const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(bin);
}
// 🧑‍🎨 Gemini 나노바나나 — 레퍼런스 사진(얼굴·제품) 유지하며 어그로 썸네일로 재연출. 실패 시 null(→gpt-image-1 폴백).
const GEMINI_AR: Record<string, string> = { portrait: "3:4", landscape: "4:3", square: "1:1" };
async function genGeminiEdit(prompt: string, refs: { bytes: Uint8Array; mime: string }[], ratio: string): Promise<Uint8Array | null> {
  if (!GEMINI_KEY || !refs.length) return null;
  try {
    const parts: any[] = [{ text: prompt + GEMINI_NOTEXT }];
    for (const rf of refs) parts.push({ inline_data: { mime_type: rf.mime, data: toB64(rf.bytes) } });
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMG_MODEL}:generateContent?key=${GEMINI_KEY}`,
      { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: GEMINI_AR[ratio] || "3:4" } } }) });
    const d = await r.json().catch(() => null);
    if (r.ok) logSpendUnits("generate-thumbnail", GEMINI_IMG_MODEL, null, 1, 0);   // 💰 건수(단가 미측정)
    const outParts = d?.candidates?.[0]?.content?.parts || [];
    const img = outParts.find((p: any) => p?.inlineData?.data || p?.inline_data?.data);
    const b64 = img?.inlineData?.data || img?.inline_data?.data;
    if (!r.ok || !b64) { console.error("[thumb] gemini", r.status, JSON.stringify(d?.error || d).slice(0, 200)); return null; }
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  } catch (e) { console.error("[thumb] gemini ex", String(e).slice(0, 120)); return null; }
}
// 레퍼런스 이미지 바이트 가져오기(외부/R2 URL → Uint8Array + mime)
async function fetchRef(url: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.byteLength < 100 || buf.byteLength > 20 * 1024 * 1024) return null;   // 100B~20MB
    let mime = (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!/^image\/(png|jpe?g|webp)$/.test(mime)) mime = "image/png";
    return { bytes: buf, mime };
  } catch { return null; }
}

async function uploadR2(bytes: Uint8Array, key: string, contentType = "image/png") {
  const url = `https://${CF_ACCOUNT}.r2.cloudflarestorage.com/${R2_BUCKET}/${key}`;
  const res = await r2.fetch(url, {
    method: "PUT",
    headers: { "content-type": contentType, "cache-control": "public, max-age=31536000, immutable" },
    body: bytes,
  });
  if (!res.ok) throw new Error(`r2_${res.status}`);
  return `${R2_PUBLIC_URL}/${key}`;
}
async function aiBudgetOk(): Promise<boolean> {
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/rpc/ai_budget_take`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SVC_KEY, Authorization: `Bearer ${SVC_KEY}` },
      body: JSON.stringify({ p_fn: "generate-thumbnail", p_n: 1 }),
    });
    if (!r.ok) return true;
    const d = await r.json();
    return !(d && d.ok === false);
  } catch { return true; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const me = callerUid(req);
  if (!me) return j({ error: "auth" }, 401);

  let body: { prompt?: string; ratio?: string; image_urls?: string[] };
  try { body = await req.json(); } catch { return j({ error: "bad_json" }, 400); }
  const prompt = String(body.prompt || "").trim().slice(0, 300);
  const size = SIZES[String(body.ratio || "portrait")] || SIZES.portrait;
  if (prompt.length < 2) return j({ error: "prompt_short" }, 400);
  // 🧑‍🎨 레퍼런스 이미지(유저 사진·얼굴·제품) — 있으면 gpt-image-1 edits로 '그 사람/사물'을 실제로 넣는다(최대 4장).
  const refUrls = Array.isArray(body.image_urls)
    ? body.image_urls.filter((u) => typeof u === "string" && /^https?:\/\//i.test(u)).slice(0, 4)
    : [];

  const ip = ipGuard(prompt);
  if (ip) return j({ error: "blocked_ip", word: ip }, 400);
  if (await moderate(prompt)) return j({ error: "blocked_moderation" }, 400);

  // 유저 24h 한도
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await sb.from("my_thumbnails").select("id", { count: "exact", head: true })
    .eq("user_id", me).gte("created_at", since);
  if ((count || 0) >= USER_DAILY_LIMIT) return j({ error: "user_daily_limit", limit: USER_DAILY_LIMIT }, 429);
  // 플랫폼 일일 캡
  if (!(await aiBudgetOk())) return j({ error: "ai_daily_cap" }, 429);

  // 💰 GP 선차감 (호출자 권한으로 auth.uid()) — 실패 시 아래서 환불
  const asUser = createClient(SUPA_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization")! } },
  });
  // 🎟 등급 게이트 — 무료/프렌드/프로별 생성 한도(app_settings.ai_tiers). GP 차감보다 먼저 본다.
  { const g = await aiGate("u:" + me, "generate-thumbnail");
    if (g && g.ok === false) return j({ error: "tier_limit", gate: g }, 429); }
  const chargeKey = await fingerprint(["thumb", prompt, String(body.ratio || ""), refUrls.join(",")]);
  const { data: charge, error: cErr } = await asUser.rpc("ai_creation_charge",
    { p_kind: "thumbnail", p_n: 1, p_key: chargeKey });
  if (cErr || !charge?.ok) return j({ error: charge?.reason || "charge_failed", detail: charge }, 402);
  const paid = (charge.charged as number) || 0;
  // 생성이 실패하면 환불 + 자물쇠 해제 — 안 그러면 같은 프롬프트로 재시도할 때 "이미 청구됨"에 막힌다
  const refund = async () => { try { await sb.rpc("ai_creation_refund", { p_user: me, p_amount: paid, p_key: chargeKey }); } catch (_) {} };

  // 🧠 크리에이터 브레인 — 검증된 썸네일 구도 공식 주입(어그로 클릭률↑). 없으면 기본 STYLE만.
  let patternText = "";
  try {
    const { data: pats } = await sb.from("creator_patterns").select("formula")
      .eq("kind", "thumbnail").eq("active", true).order("weight", { ascending: false }).limit(2);
    if (pats && pats.length) patternText = " Composition rules: " + pats.map((p: any) => p.formula).join("; ") + ".";
  } catch { /* */ }

  // 레퍼런스 이미지 로드(있으면) — 유저 얼굴/제품을 실제로 넣는 edits 경로용
  const refs: { bytes: Uint8Array; mime: string }[] = [];
  if (refUrls.length) {
    for (const u of refUrls) { const rr = await fetchRef(u); if (rr) refs.push(rr); }
  }
  const useEdit = refs.length > 0;

  // OpenAI 경로(레퍼런스 편집 / CF 폴백)에서 b64 이미지 하나 얻기
  async function openaiImage(): Promise<Uint8Array | null> {
    let r: Response;
    if (useEdit) {
      // 🧑‍🎨 gpt-image-1 edits — 레퍼런스 사진의 인물/사물을 유지하며 어그로 썸네일로 재연출(FLUX schnell 불가)
      const form = new FormData();
      form.append("model", "gpt-image-1");
      form.append("prompt", `${prompt}.${patternText} ${REF_STYLE}`);
      form.append("size", size);
      form.append("quality", "high");
      form.append("n", "1");
      refs.forEach((rf, i) => {
        const ext = rf.mime.includes("png") ? "png" : rf.mime.includes("webp") ? "webp" : "jpg";
        form.append("image[]", new Blob([rf.bytes], { type: rf.mime }), `ref${i}.${ext}`);
      });
      r = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_KEY}` },   // ⚠️ multipart는 Content-Type 수동 설정 금지(boundary 자동)
        body: form,
      });
    } else {
      r = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-image-1",
          prompt: `${prompt}.${patternText} ${STYLE}`,
          n: 1, size, quality: "high", output_format: "png", moderation: "auto",
        }),
      });
    }
    const d = await r.json();
    /* 💰 여기가 비싼 폴백이다(gc_prices.thumbnail 주석: "얼굴·제품 편집 경로만 OpenAI 폴백 → 훨씬 비쌈").
       스티커와 같은 실측 기준 $0.04/장. */
    if (r.ok && d?.data?.length) logSpendUnits("generate-thumbnail", "gpt-image-1", null, d.data.length, 0.04);
    if (!r.ok || !d?.data?.length) {
      console.error("[thumb] openai", useEdit ? "edit" : "gen", r.status, JSON.stringify(d?.error || d).slice(0, 300));
      return null;
    }
    return Uint8Array.from(atob(d.data[0].b64_json as string), (c) => c.charCodeAt(0));
  }

  try {
    let bytes: Uint8Array | null = null;
    let via = "openai";
    if (useEdit) {
      // 🧑‍🎨 레퍼런스 편집: Gemini 나노바나나 우선(얼굴보존·저가·결제벽 우회), 폴백 gpt-image-1 edits
      bytes = await genGeminiEdit(`${prompt}.${patternText} ${REF_STYLE}`, refs, String(body.ratio || "portrait"));
      if (bytes) via = "gemini";
    } else {
      // 💸 일반 생성 1순위: Cloudflare FLUX(near-free). 실패면 OpenAI 폴백.
      bytes = await genCloudflareFlux(`${prompt}.${patternText} ${STYLE}`, String(body.ratio || "portrait"));
      if (bytes) via = "cf-flux";
    }
    if (!bytes) { bytes = await openaiImage(); if (bytes) via = useEdit ? "openai-edit" : "openai"; }
    if (!bytes) { await refund(); return j({ error: "generate_failed" }, 502); }

    const { ct, ext } = sniffImage(bytes);
    const key = `thumbnails/${me}/${crypto.randomUUID()}.${ext}`;
    const url = await uploadR2(bytes, key, ct);
    try { await sb.from("my_thumbnails").insert({ user_id: me, url, prompt, kind: "thumbnail" }); } catch (_) {}
    return j({ ok: true, url, ref: useEdit, via });
  } catch (e) {
    console.error("[thumb]", e);
    await refund();
    return j({ error: "server", detail: String(e).slice(0, 200) }, 500);
  }
});
