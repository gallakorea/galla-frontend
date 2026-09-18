// 🖼 예측 썸네일 채우기 — 진행 중인데 image_url 이 빈 예측에 사진을 넣는다(26.9.18 사장님: 「예측에도 썸네일 넣은 버전」).
//   ① 연결된 이슈(issue_id)의 썸네일이 있으면 그걸 쓴다(무료)
//   ② 없으면 딥시크로 문항 → 영어 장면 묘사 한 줄 → Cloudflare FLUX-1-schnell(가로) → R2 → markets.image_url
//   글자 없는 사진만(앱이 제목을 따로 얹는다). 크론·수동 호출(x-cron-secret).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const CF_ACCOUNT = Deno.env.get("CF_ACCOUNT_ID") || "";
const CF_AI_TOKEN = Deno.env.get("CF_AI_TOKEN") || Deno.env.get("CF_WORKERS_AI_TOKEN") || "";
const DS_KEY = Deno.env.get("DEEPSEEK_API_KEY") || "";
const R2_BUCKET = Deno.env.get("R2_BUCKET") || "";
const R2_PUBLIC_URL = Deno.env.get("R2_PUBLIC_URL") || "";
const r2 = new AwsClient({
  accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID") || "",
  secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY") || "",
  service: "s3", region: "auto",
});
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const NOTEXT = " Photorealistic editorial news photo, cinematic lighting, rich color, shallow depth of field. ABSOLUTELY NO text, letters, numbers, captions, logos or watermarks anywhere.";

async function scene(q: string, cat: string): Promise<string> {
  if (!DS_KEY) return `A dramatic scene representing: ${q}`;
  try {
    const r = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST", headers: { Authorization: `Bearer ${DS_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "deepseek-chat", temperature: 0.7, max_tokens: 90,
        messages: [
          { role: "system", content: "You write ONE short English visual scene description (max 35 words) for a news-style photo that illustrates a Korean prediction question. Concrete objects, place, mood. No text/signs in the image. No real people's faces or names; use anonymous figures or symbolic objects. Output the description only." },
          { role: "user", content: `Category: ${cat}\nQuestion: ${q}` },
        ],
      }),
    });
    const d = await r.json();
    const t = String(d?.choices?.[0]?.message?.content || "").trim().replace(/^"|"$/g, "");
    return t || `A dramatic scene representing: ${q}`;
  } catch { return `A dramatic scene representing: ${q}`; }
}

let LAST_ERR = "";
async function flux(prompt: string): Promise<Uint8Array | null> {
  if (!CF_AI_TOKEN || !CF_ACCOUNT) { LAST_ERR = "no_token"; return null; }
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/ai/run/@cf/black-forest-labs/flux-1-schnell`, {
        method: "POST", headers: { Authorization: `Bearer ${CF_AI_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.slice(0, 2000), steps: 8 }),   // 이 모델은 width·height 를 안 받는다(400) — 정사각형을 받아 카드에서 가로로 자른다
      });
      const d = await r.json().catch(() => null);
      const b64 = d?.result?.image;
      if (r.ok && b64) return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      LAST_ERR = r.status + " " + JSON.stringify(d?.errors || d).slice(0, 200);
      console.error("[predict-thumbs] flux", LAST_ERR);
    } catch (e) { LAST_ERR = "ex " + String(e).slice(0, 120); console.error("[predict-thumbs] flux ex", LAST_ERR); }
  }
  return null;
}

async function put(buf: Uint8Array, id: number) {
  const png = buf[0] === 0x89;
  const key = `predict/thumbs/${id}-${Date.now().toString(36)}.${png ? "png" : "jpg"}`;
  const r = await r2.fetch(`https://${CF_ACCOUNT}.r2.cloudflarestorage.com/${R2_BUCKET}/${key}`, {
    method: "PUT", headers: { "content-type": png ? "image/png" : "image/jpeg", "cache-control": "public, max-age=31536000, immutable",
      "x-amz-meta-ai-generated": "true", "x-amz-meta-generator": "flux-1-schnell" }   // 기계 판독용 생성물 표시(인공지능기본법) — 화면엔 안 보인다, body: buf.slice().buffer as ArrayBuffer,
  });
  return r.ok ? `${R2_PUBLIC_URL}/${key}` : null;
}

Deno.serve(async (req) => {
  const xc = req.headers.get("x-cron-secret") || "";
  if (!CRON_SECRET || xc !== CRON_SECRET) return j({ ok: false, reason: "unauthorized" }, 401);
  const n = Math.min(Math.max(Number(new URL(req.url).searchParams.get("n") || "6"), 1), 12);
  const { data: ms } = await sb.from("markets").select("id, question, category, issue_id")
    .is("image_url", null).eq("resolved", false).order("id", { ascending: false }).limit(n);
  const out: any[] = [];
  const t0 = Date.now();
  for (const m of ms || []) {
    if (Date.now() - t0 > 120_000) break;
    let url: string | null = null, via = "";
    if (m.issue_id) {
      const { data: is } = await sb.from("issues").select("card_thumb_url, thumbnail_url").eq("id", m.issue_id).maybeSingle();
      url = is?.card_thumb_url || is?.thumbnail_url || null; via = "issue";
    }
    if (!url) {
      const q = String(m.question || "").replace(/🔥|이슈 승패:\s*/g, "").trim();
      const img = await flux((await scene(q, m.category || "")) + NOTEXT);
      if (img) { url = await put(img, m.id); via = "flux"; }
    }
    if (url) await sb.from("markets").update({ image_url: url }).eq("id", m.id);
    out.push({ id: m.id, via, ok: !!url, ...(url ? {} : { err: LAST_ERR }) });
  }
  return j({ ok: true, done: out });
});
