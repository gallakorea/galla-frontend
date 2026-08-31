/* 📞 agora-token — Agora RTC 토큰 발급.
   흐름: 발신/수신자 JWT 검증 → 요청 channel/uid로 RTC 토큰 생성(App Certificate로 서명) → 반환.
   앱은 이 토큰으로 AgoraRTC client.join(appId, channel, token, uid).

   시크릿(콘솔에서 추출·저장 완료):
     AGORA_APP_ID          — 8f840fdde3034835aca160b777c87bf8 (공개)
     AGORA_APP_CERTIFICATE — (비밀, secret에만) */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.4";
import { RtcTokenBuilder, RtcRole } from "https://esm.sh/agora-token@2.0.5";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const APP_ID = Deno.env.get("AGORA_APP_ID");
    const APP_CERT = Deno.env.get("AGORA_APP_CERTIFICATE");
    if (!APP_ID || !APP_CERT) return j({ ok: false, reason: "not_configured" }, 200);

    const body = await req.json().catch(() => ({}));
    const channel = String(body.channel || "").slice(0, 64);
    // 🔬 연결 검증 전용 채널 하나만 무인증 허용(온디바이스 PoC용, 검증 후 제거 예정)
    const TEST_CH = "GALLA_AGORA_SELFTEST";
    if (channel !== TEST_CH) {
      // 인증 — 로그인 유저만 토큰 발급(통화는 로그인 필수)
      const auth = req.headers.get("Authorization") || "";
      const jwt = auth.replace(/^Bearer\s+/i, "");
      const { data: u } = await admin.auth.getUser(jwt);
      if (!u?.user) return j({ ok: false, reason: "unauthorized" }, 401);
    }
    // uid: 클라이언트가 자기 uint32 uid 전달(유저 id 해시). 0이면 와일드카드(누구나 사용).
    const uid = Number.isFinite(body.uid) ? (body.uid >>> 0) : 0;
    if (!channel) return j({ ok: false, reason: "no_channel" }, 400);

    const now = Math.floor(Date.now() / 1000);
    const expire = now + 3600; // 1시간
    const token = RtcTokenBuilder.buildTokenWithUid(
      APP_ID, APP_CERT, channel, uid, RtcRole.PUBLISHER, expire, expire,
    );
    return j({ ok: true, token, appId: APP_ID, channel, uid, expire });
  } catch (e) {
    return j({ ok: false, reason: "error", detail: String((e as Error)?.message || e) }, 500);
  }
});
