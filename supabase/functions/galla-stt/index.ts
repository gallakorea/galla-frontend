// 🎙 갈라 친구 음성 — 받아쓰기(STT). 녹음 오디오 → Whisper → 텍스트. 로그인 유저만(비용통제).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};
const OPENAI = Deno.env.get("STT_API_KEY") || Deno.env.get("OPENAI_API_KEY")!;
const STT_URL = Deno.env.get("STT_BASE_URL") || "https://api.openai.com/v1";
const STT_MODEL = Deno.env.get("STT_MODEL") || "whisper-1";
// 💸 Cloudflare Workers AI whisper(near-free) — CF_AI_TOKEN 있으면 우선, 실패 시 OpenAI 폴백.
const CF_AI_TOKEN = Deno.env.get("CF_AI_TOKEN") || Deno.env.get("CF_WORKERS_AI_TOKEN") || "";
const CF_ACCOUNT = Deno.env.get("CF_ACCOUNT_ID") || "";
const CF_STT_MODEL = Deno.env.get("CF_STT_MODEL") || "@cf/openai/whisper-large-v3-turbo";
const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// 오디오 바이트 → base64(청크로 안전 인코딩, 스택 폭주 방지)
function toB64(bytes: Uint8Array): string {
  let bin = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(bin);
}
// Cloudflare Workers AI whisper — base64 오디오 → 텍스트. 실패 시 null(→OpenAI 폴백).
async function cfWhisper(bytes: Uint8Array): Promise<string | null> {
  if (!CF_AI_TOKEN || !CF_ACCOUNT) return null;
  try {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/ai/run/${CF_STT_MODEL}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${CF_AI_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ audio: toB64(bytes), task: "transcribe", language: "ko" }),
    });
    const d = await r.json().catch(() => null);
    const text = d?.result?.text;
    if (!r.ok || text == null) { console.error("[stt] cf", r.status, JSON.stringify(d?.errors || d).slice(0, 200)); return null; }
    return String(text).trim();
  } catch (e) { console.error("[stt] cf ex", String(e).slice(0, 120)); return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("Authorization") || "";
    const { data: u } = await supa.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
    if (!u || !u.user) return json({ ok: false, reason: "auth" }, 401);

    const buf = await req.arrayBuffer();
    if (!buf || buf.byteLength < 800) return json({ ok: true, text: "" });   // 너무 짧음(무음)
    const ct = req.headers.get("Content-Type") || "audio/webm";
    const ext = ct.includes("mp4") || ct.includes("m4a") ? "m4a" : ct.includes("wav") ? "wav" : ct.includes("mpeg") ? "mp3" : "webm";

    // 1순위: Cloudflare Workers AI whisper(near-free). 실패 시 OpenAI 폴백.
    const cfText = await cfWhisper(new Uint8Array(buf));
    if (cfText != null) return json({ ok: true, text: cfText, via: "cf" });

    const form = new FormData();
    form.append("file", new Blob([buf], { type: ct }), "a." + ext);
    form.append("model", STT_MODEL);
    form.append("language", "ko");
    const r = await fetch(`${STT_URL}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI}` },
      body: form,
    });
    if (!r.ok) return json({ ok: false, reason: "stt_" + r.status, detail: (await r.text()).slice(0, 200) }, 200);
    const j = await r.json();
    return json({ ok: true, text: (j?.text || "").trim(), via: "openai" });
  } catch (e) {
    return json({ ok: false, reason: "error", detail: String(e).slice(0, 200) }, 500);
  }
  function json(o: any, status = 200) { return new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } }); }
});
