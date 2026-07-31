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
const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

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
    return json({ ok: true, text: (j?.text || "").trim() });
  } catch (e) {
    return json({ ok: false, reason: "error", detail: String(e).slice(0, 200) }, 500);
  }
  function json(o: any, status = 200) { return new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } }); }
});
