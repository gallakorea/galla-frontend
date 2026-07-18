/* 📡 turn-cred — Cloudflare TURN 단기 자격증명 발급
   왜 서버에서: TURN 키(장기 비밀)는 절대 클라이언트로 내려가면 안 된다.
   여기서 1시간짜리 임시 자격증명만 만들어 준다(만료되면 무용지물).
   최초 1회 TURN 키가 없으면 CF API로 만들어 app_private_kv에 보관한다(부트스트랩).
   CF 토큰에 Calls 권한이 없으면 STUN 전용으로 우아하게 후퇴 — 통화는 여전히 된다. */
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
};
const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const STUN_ONLY = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

function callerUid(req: Request): string | null {
  try {
    const tok = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const p = JSON.parse(atob(tok.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return p.sub || null;
  } catch { return null; }
}

async function getTurnKey(): Promise<{ key_id: string; api_token: string } | null> {
  const { data } = await sb.from("app_private_kv").select("v").eq("k", "cf_turn_key").maybeSingle();
  if (data?.v?.key_id) return data.v as { key_id: string; api_token: string };
  // 부트스트랩: TURN 키 생성 시도
  const acc = Deno.env.get("CF_ACCOUNT_ID"), tok = Deno.env.get("CF_STREAM_TOKEN");
  if (!acc || !tok) return null;
  try {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${acc}/calls/turn_keys`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "galla-voice-turn" }),
    });
    const body = await r.json();
    const uid = body?.result?.uid, key = body?.result?.key;
    if (!body?.success || !uid || !key) {
      console.error("[turn] key create failed", JSON.stringify(body?.errors || body).slice(0, 300));
      return null;
    }
    const v = { key_id: uid, api_token: key };
    await sb.from("app_private_kv").upsert({ k: "cf_turn_key", v, updated_at: new Date().toISOString() });
    return v;
  } catch (e) { console.error("[turn] bootstrap", e); return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!callerUid(req)) return j({ error: "auth" }, 401);   // 로그인 유저만 — 무료 릴레이 남용 방지
  const key = await getTurnKey();
  if (!key) return j(STUN_ONLY);
  try {
    const r = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${key.key_id}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${key.api_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ttl: 3600 }),
      },
    );
    const body = await r.json();
    if (body?.iceServers) {
      const list = Array.isArray(body.iceServers) ? body.iceServers : [body.iceServers];
      return j({ iceServers: [...STUN_ONLY.iceServers, ...list] });
    }
    return j(STUN_ONLY);
  } catch (_) { return j(STUN_ONLY); }
});
