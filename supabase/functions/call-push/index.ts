/* 📞 call-push — 통화 발신 시 상대에게 VoIP 푸시(APNs) 전송 → 잠금화면 CallKit 벨.
   흐름: 발신자 JWT 검증 → 상대(iOS) VoIP 토큰 조회 → APNs(HTTP/2, apns-push-type:voip)로 발송.
   앱은 PushKit로 받아 CallKit reportNewIncomingCall → 잠금화면에서도 벨.

   ⚠️ 필요한 시크릿(사장님 발급):
     APNS_KEY_ID    — APNs 인증 키(.p8)의 Key ID
     APNS_TEAM_ID   — 494K4C92G6 (팀 ID)
     APNS_KEY       — .p8 파일 내용(-----BEGIN PRIVATE KEY----- ... 포함, 통째로)
     APNS_BUNDLE_ID — im.galla.app  (VoIP 토픽은 <bundle>.voip)
     APNS_ENV       — "production" | "sandbox" (개발 빌드는 sandbox)
   키가 없으면 { ok:false, reason:'not_configured' }를 돌려주고 조용히 넘어간다(통화 자체는 실시간 시그널로 진행). */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.4";
import { SignJWT, importPKCS8 } from "https://esm.sh/jose@5.9.6";

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

// APNs 인증 JWT(ES256) — 1시간 캐시(애플 권장: 20분~60분 재사용)
let _apnsJwt = { token: "", at: 0 };
async function apnsAuthToken(keyId: string, teamId: string, p8: string): Promise<string> {
  const now = Date.now();
  if (_apnsJwt.token && now - _apnsJwt.at < 50 * 60 * 1000) return _apnsJwt.token;
  const key = await importPKCS8(p8, "ES256");
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt()
    .sign(key);
  _apnsJwt = { token: jwt, at: now };
  return jwt;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return j({ ok: false, reason: "method" }, 405);

  const body = await req.json().catch(() => ({}));
  // 발신자 검증 — 단, service_role 키 + debug=true면 진단 우회(APNs 실제 응답 확인용).
  const authHeader = req.headers.get("Authorization") || "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "");
  const debug = body.debug === true && !!body.diagKey && body.diagKey === Deno.env.get("PUSH_DIAG");
  let from: string | undefined;
  if (debug) { from = "00000000-0000-0000-0000-000000000000"; }
  else { const { data: u } = await admin.auth.getUser(bearer); from = u?.user?.id; }
  if (!from) return j({ ok: false, reason: "unauthorized" }, 401);
  const to = String(body.to || "");
  const video = !!body.video;
  const callId = String(body.callId || "");
  const cancel = !!body.cancel;   // 📞 취소 푸시 — 발신자가 끊음 → 수신 CallKit 벨 종료
  if (!to) return j({ ok: false, reason: "no_target" }, 400);

  // 시크릿 준비 여부 — 없으면 조용히 스킵(실시간 시그널로 통화는 그대로 진행됨)
  const keyId = Deno.env.get("APNS_KEY_ID");
  const teamId = Deno.env.get("APNS_TEAM_ID");
  const p8 = Deno.env.get("APNS_KEY");
  const bundle = Deno.env.get("APNS_BUNDLE_ID") || "im.galla.app";
  const env = (Deno.env.get("APNS_ENV") || "production").toLowerCase();
  if (!keyId || !teamId || !p8) return j({ ok: false, reason: "not_configured" });

  // 발신자 이름 (취소 푸시엔 불필요 — 스킵)
  let name = "갈라 친구";
  if (!cancel) {
    try {
      const { data: me } = await admin.from("users").select("nickname").eq("id", from).maybeSingle();
      if (me?.nickname) name = me.nickname;
    } catch (_) {}
  }

  // 상대 iOS VoIP 토큰
  const { data: row } = await admin.from("call_device_tokens")
    .select("token").eq("user_id", to).eq("platform", "ios").maybeSingle();
  if (!row?.token) return j({ ok: true, sent: false, reason: "no_ios_token" });

  const host = env === "sandbox" ? "api.sandbox.push.apple.com" : "api.push.apple.com";
  const payload = {
    // PushKit → CallKit이 읽는 통화 정보
    callerId: from,
    callerName: name,
    video,
    callId,          // 📞 통화 UUID 고정 키 — 취소 푸시가 같은 CallKit 통화를 종료할 수 있게
    cancel,          // 📞 true면 네이티브가 해당 callId의 CallKit 벨을 즉시 종료
    // 🕒 발신 시각(ms) — 네이티브가 '낡은 벨(유령)'을 나이로 거른다. debug 진단 땐 옛 ts 주입 허용(스로틀 시뮬).
    ts: (debug && typeof body.ts === "number") ? body.ts : Date.now(),
    // aps는 VoIP 푸시엔 필수는 아니지만 일부 iOS 버전 호환 위해 넣음
    aps: {},
  };

  try {
    const authTok = await apnsAuthToken(keyId, teamId, p8);
    const res = await fetch(`https://${host}/3/device/${row.token}`, {
      method: "POST",
      headers: {
        "authorization": `bearer ${authTok}`,
        "apns-topic": `${bundle}.voip`,
        "apns-push-type": "voip",
        "apns-priority": "10",
        "apns-expiration": "0",
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const aid = res.headers.get("apns-id") || "";
    if (res.status === 200) return j({ ok: true, sent: true, env, host, apnsId: aid });
    const txt = await res.text().catch(() => "");
    // 토큰이 폐기됐으면(410/BadDeviceToken) 정리 — 단 debug 진단 중엔 삭제하지 않는다(토큰 보존).
    if (!debug && (res.status === 410 || /BadDeviceToken|Unregistered/.test(txt))) {
      try { await admin.from("call_device_tokens").delete().eq("user_id", to).eq("platform", "ios"); } catch (_) {}
    }
    return j({ ok: false, sent: false, status: res.status, env, host, detail: txt.slice(0, 200) });
  } catch (e) {
    return j({ ok: false, reason: "apns_error", detail: String(e).slice(0, 200) });
  }
});
