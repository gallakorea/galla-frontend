/* 🎙 rtc-sfu — Cloudflare Calls SFU 프록시 (라이브 난장 다대다 음성)
   왜 서버에서: Calls 앱 시크릿(App Secret)은 클라이언트로 내려가면 안 된다.
   클라이언트가 SDP offer/answer·트랙 요청을 보내면, 여기서 시크릿을 붙여
   https://rtc.live.cloudflare.com/v1/apps/{APP_ID}{path} 로 그대로 중계한다.

   사전 준비(사장님, 1회): Cloudflare 대시보드 → Realtime/Calls → SFU 앱 생성 →
     App ID / App Secret 을 Supabase 시크릿 CF_CALLS_APP_ID / CF_CALLS_APP_SECRET 에 등록.
   미설정이면 {ok:false, reason:'unconfigured'} 로 우아하게 후퇴(프론트가 '준비중' 표시). */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

function callerUid(req: Request): string | null {
  try {
    const tok = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const p = JSON.parse(atob(tok.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return p.sub || null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return j({ ok: false, reason: "method" }, 405);

  // 로그인 유저만 (라이브 난장은 로그인 필수)
  if (!callerUid(req)) return j({ ok: false, reason: "auth" }, 401);

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

  const url = `https://rtc.live.cloudflare.com/v1/apps/${APP_ID}${path}`;
  try {
    const r = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${APP_SECRET}`, "Content-Type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify(payload.body ?? {}),
    });
    const text = await r.text();
    let data: unknown; try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return j({ ok: r.ok, status: r.status, data }, 200);
  } catch (e) {
    return j({ ok: false, reason: "upstream", detail: String(e) }, 200);
  }
});
