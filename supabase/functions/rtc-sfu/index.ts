import { verifiedUid } from "../_shared/auth.ts";   // 🔒 서명 검증 인증(26.9.21) — 가짜 토큰으로 라이브 방 SFU 사용 차단
/* 🎙 rtc-sfu — Cloudflare Calls SFU 프록시 (라이브 난장 다대다 음성)
   왜 서버에서: Calls 앱 시크릿(App Secret)은 클라이언트로 내려가면 안 된다.
   클라이언트가 SDP offer/answer·트랙 요청을 보내면, 여기서 시크릿을 붙여
   https://rtc.live.cloudflare.com/v1/apps/{APP_ID}{path} 로 그대로 중계한다.

   사전 준비(사장님, 1회): Cloudflare 대시보드 → Realtime/Calls → SFU 앱 생성 →
     App ID / App Secret 을 Supabase 시크릿 CF_CALLS_APP_ID / CF_CALLS_APP_SECRET 에 등록.
   미설정이면 {ok:false, reason:'unconfigured'} 로 우아하게 후퇴(프론트가 '준비중' 표시). */
import { createClient } from "npm:@supabase/supabase-js@2.112.4";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return j({ ok: false, reason: "method" }, 405);

  // 로그인 유저만 (라이브 난장은 로그인 필수)
  const uid = await verifiedUid(req);
  if (!uid) return j({ ok: false, reason: "auth" }, 401);

  const APP_ID = Deno.env.get("CF_CALLS_APP_ID");
  const APP_SECRET = Deno.env.get("CF_CALLS_APP_SECRET");
  if (!APP_ID || !APP_SECRET) return j({ ok: false, reason: "unconfigured" }, 200);

  let payload: { path?: string; method?: string; body?: unknown };
  try { payload = await req.json(); } catch { return j({ ok: false, reason: "badjson" }, 400); }

  // path 는 /sessions... 만 허용(임의 프록시 차단)
  const path = String(payload.path || "");
  if (!/^\/sessions(\/|$)/.test(path)) return j({ ok: false, reason: "badpath" }, 400);
  const method = (payload.method || "POST").toUpperCase();
  if (!["POST", "PUT", "GET"].includes(method)) return j({ ok: false, reason: "badmethod" }, 400);

  /* 🔒 세션 주인만(26.10.11 감사): 세션 id 는 방에 방송돼 누구나 알 수 있었고, 로그인만 되면 남의 세션 트랙을
     닫거나 갈아끼울 수 있었다. /sessions/new 로 만든 세션을 만든 사람에게 묶고, 이후 경로는 주인만 통과.
     배포 전에 만들어진(기록 없는) 세션은 처음 쓰는 사람에게 묶는다 — 진행 중인 통화를 끊지 않으려는 이행 규칙. */
  const sm = path.match(/^\/sessions\/([^/?]+)/);
  const sid = sm && sm[1] !== "new" ? decodeURIComponent(sm[1]) : null;
  if (sid) {
    const { data: own } = await admin.from("rtc_sessions").select("user_id").eq("session_id", sid).maybeSingle();
    if (own && own.user_id !== uid) return j({ ok: false, reason: "not_owner" }, 403);
    if (!own) await admin.from("rtc_sessions").insert({ session_id: sid, user_id: uid });
  }

  const url = `https://rtc.live.cloudflare.com/v1/apps/${APP_ID}${path}`;
  try {
    const r = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${APP_SECRET}`, "Content-Type": "application/json" },
      // 본문 없이 여는 세션(아이폰: 오퍼 없는 /sessions/new)은 본문을 아예 안 보낸다 — "{}" 는 CF 가 decoding_error 로 거절
      body: (method === "GET" || payload.body === null) ? undefined : JSON.stringify(payload.body ?? {}),
    });
    const text = await r.text();
    let data: unknown; try { data = JSON.parse(text); } catch { data = { raw: text }; }
    // 새 세션이면 주인 기록
    const newSid = (!sid && r.ok) ? (data as { sessionId?: string })?.sessionId : null;
    if (newSid) { try { await admin.from("rtc_sessions").insert({ session_id: newSid, user_id: uid }); } catch { /* */ } }
    return j({ ok: r.ok, status: r.status, data }, 200);
  } catch (e) {
    return j({ ok: false, reason: "upstream", detail: String(e) }, 200);
  }
});
