/* 📮 send-push — DM/난장 메시지 Web Push 발송
   호출자: 메시지를 보낸 클라이언트(전송 직후). JWT 필수(게이트웨이 검증).
   남용 방지: 함수가 '정말 그 메시지의 발신자인가'를 서버에서 재확인한다 —
   임의 payload로 남의 기기에 푸시를 쏘는 건 불가능. 알림 내용도 DB에서 읽는다. */
import webpush from "npm:web-push@3.6.7";
import { verifiedUid, isServiceKey } from "../_shared/auth.ts";   // 🔒 서명 검증 인증(26.9.21)
import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import { importPKCS8, SignJWT } from "https://esm.sh/jose@5.9.6";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") || "mailto:blackid@gmail.com",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

// 📱 APNs 알림(alert) 푸시 — 네이티브 iOS 앱은 web-push를 못 받으므로(WKWebView) APNs로 잠금화면 알림.
//    call-push(VoIP)와 같은 ES256 JWT 인증, 단 topic=번들·push-type=alert.
const APNS = {
  keyId: Deno.env.get("APNS_KEY_ID") || "",
  teamId: Deno.env.get("APNS_TEAM_ID") || "",
  p8: Deno.env.get("APNS_KEY") || "",
  /* ⚠️ APNs 토픽 = **iOS 번들 ID**다. 2026-09-04 에 im.galla.app → `im.galla` 로 바뀌었다
     (법인 계정 전환 때 옛 번들을 잃었다). 안드로이드 패키지는 im.galla.app 그대로지만
     여기는 iOS 전용이다 — 헷갈려 옛 값을 넣으면 애플이 BadTopic 으로 조용히 거부한다. */
  bundle: Deno.env.get("APNS_BUNDLE_ID") || "im.galla",
  host: (Deno.env.get("APNS_ENV") || "production").toLowerCase() === "sandbox" ? "api.sandbox.push.apple.com" : "api.push.apple.com",
};
let _apnsJwt = { token: "", at: 0 };
async function apnsAuth(): Promise<string | null> {
  if (!APNS.keyId || !APNS.teamId || !APNS.p8) return null;
  const now = Date.now();
  if (_apnsJwt.token && now - _apnsJwt.at < 50 * 60 * 1000) return _apnsJwt.token;
  const key = await importPKCS8(APNS.p8, "ES256");
  const jwt = await new SignJWT({}).setProtectedHeader({ alg: "ES256", kid: APNS.keyId })
    .setIssuer(APNS.teamId).setIssuedAt().sign(key);
  _apnsJwt = { token: jwt, at: now };
  return jwt;
}
// 네이티브 토큰들에 alert 푸시 — 유저별 표준 APNs 토큰(native_push_tokens) 조회 후 발송.
async function pushApns(userIds: string[], payload: Record<string, unknown>) {
  const authTok = await apnsAuth();
  if (!authTok) return 0;   // APNs 미설정 시 스킵(웹푸시로 폴백)
  const { data: toks } = await sb.from("native_push_tokens")
    .select("user_id,token").in("user_id", userIds).eq("platform", "ios").limit(200);
  if (!toks?.length) return 0;
  const title = String(payload.title || "GALLA");
  const bodyTxt = String(payload.body || "");
  const subtitle = payload.subtitle ? String(payload.subtitle) : undefined;
  const alert: Record<string, string> = { title, body: bodyTxt };
  if (subtitle) alert.subtitle = subtitle;   // 프리뷰 부제(뉴스 헤드라인 등)
  const picked = await soundFor(userIds);
  const apsFor = (uid: string): Record<string, unknown> => ({
    /* 🔔 사용자가 고른 알림음 — 기본음이면 어느 앱 알림인지 소리로 구분이 안 된다(26.9.20 사장님) */
    aps: { alert, sound: `alert-${picked[uid] || "galla"}.caf`, "thread-id": String(payload.tag || "galla"), "mutable-content": 1 },
    url: payload.url || "/",
    ...(payload.image ? { image: String(payload.image) } : {}),
  });

  // dev 빌드=sandbox 토큰 / 배포=production 토큰. 환경 불일치(BadDeviceToken) 시 다른 호스트로 재시도 → 둘 다 커버.
  const hosts = [APNS.host, APNS.host === "api.push.apple.com" ? "api.sandbox.push.apple.com" : "api.push.apple.com"];
  const hdr = { "authorization": `bearer ${authTok}`, "apns-topic": APNS.bundle, "apns-push-type": "alert", "apns-priority": "10", "content-type": "application/json" };
  let sent = 0;
  await Promise.all(toks.map(async (t) => {
    for (const host of hosts) {
      try {
        const r = await fetch(`https://${host}/3/device/${t.token}`, { method: "POST", headers: hdr, body: JSON.stringify(apsFor(t.user_id)) });
        if (r.status === 200) { sent++; return; }
        const txt = await r.text().catch(() => "");
        if (/BadDeviceToken/.test(txt)) continue;   // 환경 불일치 → 다른 호스트 시도
        if (r.status === 410 || /Unregistered/.test(txt)) {
          await sb.from("native_push_tokens").delete().eq("user_id", t.user_id).eq("platform", "ios");
        }
        return;   // 그 외 에러 → 이 토큰 중단
      } catch (_) { /* 다음 호스트 */ }
    }
  }));
  return sent;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
};
const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

/* 🤖 FCM v1 — 안드로이드 알림 푸시.
   ⚠️ 안드로이드는 여태 푸시가 '0' 이었다. APNs 분기만 있었고 FCM 분기가 아예 없어서
      native_push_tokens 에 platform='android' 행이 쌓여도 아무 데도 안 갔다.
   서비스 계정 JSON(FIREBASE_SERVICE_ACCOUNT) 하나만 시크릿에 넣으면 켜진다.
   없으면 조용히 0 을 돌려준다 — 키가 없다고 iOS·웹 발송까지 죽이면 안 된다. */
const FCM_SA = (function () {
  try { return JSON.parse(Deno.env.get("FIREBASE_SERVICE_ACCOUNT") || "null"); } catch (_) { return null; }
})();
let _fcmTok = { token: "", at: 0 };

async function fcmAuth(): Promise<string | null> {
  if (!FCM_SA?.client_email || !FCM_SA?.private_key) return null;
  const now = Math.floor(Date.now() / 1000);
  if (_fcmTok.token && now - _fcmTok.at < 3000) return _fcmTok.token;   // 1시간 만료 → 50분 캐시
  try {
    const key = await importPKCS8(String(FCM_SA.private_key).replace(/\\n/g, "\n"), "RS256");
    const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(FCM_SA.client_email).setAudience("https://oauth2.googleapis.com/token")
      .setIssuedAt(now).setExpirationTime(now + 3600).sign(key);
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    });
    if (!r.ok) { console.error("[fcm] token", r.status, (await r.text()).slice(0, 200)); return null; }
    const j = await r.json();
    _fcmTok = { token: j.access_token, at: now };
    return _fcmTok.token;
  } catch (e) { console.error("[fcm] auth", String(e).slice(0, 200)); return null; }
}

/* 🔊 사용자가 고른 알림음(notify_prefs.alert_sound) — 없으면 기본 galla.
   이름은 앱 번들 파일과 1:1(iOS: alert-<이름>.caf, 안드로이드: res/raw/alert_<이름>.ogg). */
const SOUND_OK = new Set(["galla", "space", "warp", "laser", "arcade", "pager", "bell", "boing", "quack"]);
async function soundFor(userIds: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  try {
    const { data } = await sb.from("notify_prefs").select("user_id,alert_sound").in("user_id", userIds);
    (data || []).forEach((r: { user_id: string; alert_sound: string }) => {
      if (SOUND_OK.has(r.alert_sound)) out[r.user_id] = r.alert_sound;
    });
  } catch (_) { /* 못 읽으면 기본음 */ }
  return out;
}

/* 알림 종류별·소리별 채널 — 안드로이드는 채널마다 소리가 고정이라(8.0+ 규칙),
   사용자가 소리를 고르게 하려면 소리 수만큼 채널을 미리 만들어 두고 그 채널로 보내야 한다.
   앱(MainActivity.ensureNotificationChannels)이 만드는 채널 id 와 한 글자도 달라선 안 된다. */
function androidChannel(payload: Record<string, unknown>, sound?: string): string {
  const tag = String(payload.tag || "");
  if (/^call/.test(tag)) return "galla_call_v1";
  const s = sound && SOUND_OK.has(sound) ? sound : "galla";
  return `galla_${s}_v1`;
}

async function pushFcm(userIds: string[], payload: Record<string, unknown>): Promise<number> {
  const pickedA = await soundFor(userIds);
  const tok = await fcmAuth();
  if (!tok) return 0;                                   // 미설정 — 조용히 건너뛴다
  const { data: toks } = await sb.from("native_push_tokens")
    .select("user_id,token").in("user_id", userIds).eq("platform", "android").limit(200);
  if (!toks?.length) return 0;
  const project = FCM_SA.project_id;
  let sent = 0;
  await Promise.all(toks.map(async (t: { user_id: string; token: string }) => {
    try {
      const r = await fetch(`https://fcm.googleapis.com/v1/projects/${project}/messages:send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            token: t.token,
            notification: {
              title: String(payload.title || "GALLA") + (payload.subtitle && payload.tag && /^dm-/.test(String(payload.tag)) ? " · " + String(payload.subtitle) : ""),   // 갈라톡은 「보낸 사람 · 갈라톡」(안드로이드엔 부제 칸이 없다)
              body: String(payload.body || ""),
              ...(payload.image ? { image: String(payload.image) } : {}),
            },
            /* 탭했을 때 어디로 갈지 — 앱은 data.url 을 읽는다(iOS 의 aps.url 과 같은 규약) */
            data: { url: String(payload.url || "/"), tag: String(payload.tag || "galla") },
            /* 채널 id 는 앱이 만든 것과 정확히 같아야 한다(MainActivity.ensureNotificationChannels).
               예전엔 만들지도 않은 "galla" 로 보내 채널 설정이 통째로 무시됐다(26.9.20 전수 조사).
               sound 는 res/raw 의 파일 이름(확장자 없이) — 채널 소리와 같은 것을 가리킨다. */
            android: { priority: "high", notification: { channel_id: androidChannel(payload, pickedA[t.user_id]) } },
          },
        }),
      });
      if (r.ok) { sent++; return; }
      const txt = await r.text();
      /* 지워진 앱·갱신된 토큰은 청소한다 — 죽은 토큰에 계속 쏘면 발송 전체가 느려진다 */
      if (r.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(txt)) {
        await sb.from("native_push_tokens").delete().eq("user_id", t.user_id).eq("platform", "android");
      } else {
        console.error("[fcm] send", r.status, txt.slice(0, 160));
      }
    } catch (_) { /* 한 기기 실패가 나머지를 막지 않는다 */ }
  }));
  return sent;
}

function callerUid(req: Request): string | null {
  try {
    const tok = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const p = JSON.parse(atob(tok.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return p.sub || null;
  } catch { return null; }
}

const preview = (kind: string, body: string) =>
  kind === "e2e" ? "🔒 비밀 메시지"
  : kind === "image" ? "📷 사진 보냄"
  : kind === "gif" ? "🎬 이모티콘 날림"
  : kind === "voice" ? "🎤 음성 메시지 (귀 기울여봐)"
  : kind === "share" ? "🔗 뭔가 공유함 — 열어봐"
  : (body || "").slice(0, 80);

// notify 브릿지 인증 — 트리거(Vault)와 공유하는 전용 시크릿. (서비스키는 신구 체계로 불일치할 수 있어 분리)
const BRIDGE_SECRET = Deno.env.get("PUSH_BRIDGE_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
/* 🔑 브릿지 인증 — Authorization 은 '플랫폼용 유효 JWT' 자리다.
   브릿지 시크릿이 JWT가 아니면(신형 sb_secret_… 키) Authorization 에 실을 수가 없다:
   실으면 플랫폼이 401 UNAUTHORIZED_INVALID_JWT_FORMAT, JWT를 실으면 여기서 403.
   두 조건이 서로 배타적이라 알림→푸시 브릿지가 통째로 죽어 있었다(2026-08-21 발견).
   → 시크릿은 전용 헤더(x-push-key)로 받는다. 기존 방식(Authorization 안에 포함)도 계속 허용. */
function bridgeOk(req: Request): boolean {
  if (!BRIDGE_SECRET) return false;
  const auth = req.headers.get("Authorization") || "";
  if (auth.includes(BRIDGE_SECRET)) return true;
  return (req.headers.get("x-push-key") || "") === BRIDGE_SECRET;
}
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
// 🤪 기능별 병맛 알림 카피 — 카톡식 건조함 금지, 갈라답게. n = {nick, message}
const NOTIFY: Record<string, { cat: string; t: string; b: (n: { nick: string; message: string }) => string }> = {
  duel:            { cat: "duel",     t: "⚔️ 결투 신청장 도착", b: (n) => pick([`${n.nick}이(가) 일기토 걸었다 — 튈래 붙을래?`, `${n.nick} 왈: "나랑 한판 뜨자" ⚔️`, `도전장 날아옴 — ${n.nick}이 너 콕 집음`]) },
  comment:         { cat: "activity", t: "💬 누가 입 턴다",     b: (n) => pick([`${n.nick}이 네 글에 댓글 박음`, `누가 시비 검 ㅋㅋ 확인 ㄱㄱ`, `${n.nick} 등판 — 댓글 달렸다`]) },
  vote:            { cat: "activity", t: "🔥 판이 커진다",     b: (n) => pick([`누가 네 진영에 참전함 — 불붙는다`, `${n.nick}이 네 이슈에 한 표 던짐`]) },
  donation:        { cat: "activity", t: "💸 돈벼락 감지",      b: (n) => pick([`${n.nick}이 너 후원함 — 개이득 ㅊㅋ`, `현질 들어옴 — ${n.nick}이 쐈다 💸`]) },
  market_resolved: { cat: "activity", t: "🎲 판가름 났다",      b: () => pick([`네 예측 결과 나옴 — 땄나 잃었나?`, `예측 정산 완료 — 안 보면 밤에 궁금해서 잠 못 잠`]) },
  plaza_comment:   { cat: "activity", t: "💬 광장에 댓글",      b: (n) => `${n.nick}이 네 광장글에 한마디 얹음` },
  plaza_vote:      { cat: "activity", t: "👍 광장 반응 옴",     b: (n) => `${n.nick}이 네 광장글 밀어줌` },
  /* 🫂 갈비스 선톡 — 문구는 갈비스가 그 사람 기억으로 이미 썼다.
     여기서 병맛 카피로 덮어쓰면 개인화가 통째로 날아간다. message 를 그대로 쓴다. */
  friend:          { cat: "friend",    t: "🫂 갈비스",          b: (n) => n.message || "잘 지내냐고 물어보러 옴" },
  /* ── 26.9.21 알림 전수 점검 — 아래 종류들은 표에 없어서 전부 「🔔 갈라 소식」으로 나가고 있었다 ── */
  reply:           { cat: "activity", t: "💬 답글 달림",         b: (n) => `${n.nick}이 네 댓글에 답글 닮 — 확인 ㄱㄱ` },
  like:            { cat: "activity", t: "❤️ 좋아요 받음",       b: (n) => pick([`${n.nick}이 네 글 좋아함`, `${n.nick}한테 하트 받음 ❤️`]) },
  plaza_like:      { cat: "activity", t: "👍 광장 반응 옴",     b: (n) => `${n.nick}이 네 광장글 밀어줌` },
  follow_request:  { cat: "activity", t: "🙋 팔로우 요청",       b: (n) => `${n.nick}이 팔로우 요청함 — 수락할래?` },
  follow_accept:   { cat: "activity", t: "🤝 팔로우 수락",       b: (n) => `${n.nick}이 네 요청 받아줌 — 이제 서로 봄` },
  attack:          { cat: "activity", t: "⚔️ 네 댓글 공격당함",  b: (n) => `${n.nick}이 네 댓글 때림 — 반격 ㄱ?` },
  defend:          { cat: "activity", t: "🛡️ 지원군 도착",       b: (n) => `${n.nick}이 네 댓글 지켜줌` },
  issue_win:       { cat: "activity", t: "🏆 네 진영 승리",      b: (n) => n.message || "네가 고른 쪽이 이겼다 — 확인 ㄱㄱ" },
  support:         { cat: "activity", t: "💸 후원 도착",         b: (n) => `${n.nick}이 널 밀어줌 💸` },
  duel_challenge:  { cat: "duel",     t: "⚔️ 결투 신청장 도착", b: (n) => `${n.nick}이(가) 일기토 걸었다 — 튈래 붙을래?` },
  duel_accept:     { cat: "duel",     t: "⚔️ 결투 수락",         b: (n) => `${n.nick}이 결투 받았다 — 준비해` },
  duel_decline:    { cat: "duel",     t: "🏳️ 결투 거절",         b: (n) => `${n.nick}이 이번 결투는 피했다` },
  duel_live:       { cat: "duel",     t: "🔴 일기토 시작",       b: (n) => n.message || "지금 붙는다 — 입장 ㄱㄱ" },
  duel_voting:     { cat: "duel",     t: "🗳️ 일기토 판정 시작",  b: (n) => n.message || "누가 이겼는지 한 표 던져줘" },
  duel_result:     { cat: "duel",     t: "🏁 일기토 결과",       b: (n) => n.message || "결과 나왔다 — 확인 ㄱㄱ" },
  duel_extend:     { cat: "duel",     t: "⏱️ 일기토 연장",       b: (n) => n.message || "시간이 늘어났다" },
  duel_forfeit:    { cat: "duel",     t: "🏳️ 상대 기권",         b: (n) => n.message || "상대가 기권했다" },
  duel_watch:      { cat: "duel",     t: "👀 관전 중인 일기토",  b: (n) => n.message || "보던 일기토에 소식 있음" },
  duel_cheer_win:  { cat: "duel",     t: "📣 응원한 쪽 승리",    b: (n) => n.message || "네가 밀어준 쪽이 이겼다" },
  /* 관리자 전용 — 위기(자살·자해)는 즉시 알려야 하고, 신고·버그는 알되 조용히 */
  crisis:          { cat: "admin",    t: "🆘 위기 감지",          b: (n) => n.message || "위기 신호 — 관제센터 확인" },
  report:          { cat: "admin",    t: "🚨 신고 접수",          b: (n) => n.message || "새 신고 — 관제센터 확인" },
  bug_report:      { cat: "admin",    t: "🐞 버그 신고 접수",     b: (n) => n.message || "새 버그 신고" },
  pager:           { cat: "pager",    t: "📟 삐-삐- 삐삐 왔다",  b: (n) => pick([`${n.nick}이(가) 삐삐 쳤다 — 음성사서함 확인 ㄱㄱ`, `📟 띠리리- 누가 널 찾는다 — 삐삐 도착`, `${n.nick}한테서 삐삐 옴 — 90년대냐 ㅋㅋ`]) },
};
const NOTIFY_DEFAULT = { cat: "activity", t: "🔔 갈라 소식", b: (n: { message: string }) => n.message || "새 소식 떴다 — 확인 ㄱㄱ" };
/* 앱이 직접 보내는 종류는 브릿지에서 건너뛴다(같은 알림이 두 번 온다).
   · follow — 팔로우 즉시 푸시(kind:"follow")
   · dm — 갈라톡 메시지·부재중 전화는 발신 앱이 kind:"dm" 으로 보낸다. 여기서도 보내면 「🔔 갈라 소식」으로
     한 번 더 왔다(26.9.21 두 폰 QA, 사장님: 「갈라톡이 왜 갈라 소식으로 오지」)
   · bug_hunt — 자동 버그 스캔은 관리자 페이지로만(26.9.19 결정). 30분마다 폰이 울렸다 */
const SKIP_NOTIFY = new Set(["follow", "dm", "bug_hunt"]);

// 🔔 카테고리별 수신거부·방해금지(DND) 반영 — 서버가 발송 직전 걸러낸다.
// push_allowed(uid, cat): 설정 없으면 true(기본 수신). 실패해도 보수적으로 발송(끊김 방지).
async function filterAllowed(userIds: string[], cat: string): Promise<string[]> {
  const out = await Promise.all(userIds.map(async (u) => {
    try {
      const { data, error } = await sb.rpc("push_allowed", { p_user: u, p_cat: cat });
      if (error) return u;                 // RPC 에러 시 발송(기존 동작 유지)
      return data === false ? null : u;
    } catch { return u; }
  }));
  return out.filter((u): u is string => !!u);
}

async function pushTo(userIds: string[], payload: Record<string, unknown>, cat = "dm") {
  userIds = await filterAllowed(userIds, cat);
  if (!userIds.length) return 0;
  // 📱 네이티브 iOS(APNs) — 웹푸시와 병행 발송(같은 유저가 앱·웹 둘 다 구독 가능). 실패해도 웹푸시엔 영향 없음.
  const apnsSent = await pushApns(userIds, payload).catch(() => 0);
  // 🤖 안드로이드(FCM) — iOS·웹과 병행. 미설정이면 0 이라 아무 영향 없다.
  const fcmSent = await pushFcm(userIds, payload).catch(() => 0);
  const { data: subs } = await sb.from("push_subscriptions")
    .select("endpoint,p256dh,auth,user_id").in("user_id", userIds).limit(200);
  let sent = apnsSent + fcmSent;
  await Promise.all((subs || []).map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 3600 },
      );
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      // 만료·해지된 구독은 청소 — 죽은 endpoint에 계속 쏘면 발송 전체가 느려진다
      if (code === 404 || code === 410) {
        await sb.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
      }
    }
  }));
  return sent;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let body: { kind?: string; id?: string; video?: boolean };
  try { body = await req.json(); } catch { return j({ error: "bad json" }, 400); }
  if (!body.id) return j({ error: "id required" }, 400);

  // 🔔 시스템 알림 → 푸시 브릿지 — notifications INSERT 트리거가 서비스키로 호출(유저 JWT 없음).
  //    인앱 알림(🔔)이 생기면 그 카테고리·병맛 카피로 푸시도 함께 나간다(push_allowed로 카테고리 게이팅).
  if (body.kind === "notify") {
    if (!bridgeOk(req)) return j({ error: "forbidden" }, 403);
    const { data: n } = await sb.from("notifications")
      .select("user_id,from_user,type,message,link").eq("id", body.id).maybeSingle();
    if (!n) return j({ error: "no notif" }, 404);
    if (SKIP_NOTIFY.has(n.type)) return j({ ok: true, skipped: true });
    // 🛰 관리자 알림은 갈라 앱으로 보내지 않는다 — 관제 앱(ops_alerts → kind:ops)만(26.9.22 사장님)
    if ((NOTIFY[n.type]?.cat) === "admin") return j({ ok: true, skipped: "ops-only" });
    const { data: fu } = await sb.from("users").select("nickname").eq("id", n.from_user).maybeSingle();
    const st = NOTIFY[n.type] || NOTIFY_DEFAULT;
    const sent = await pushTo([n.user_id], {
      title: st.t,
      body: st.b({ nick: fu?.nickname || "누군가", message: n.message || "" }),
      url: "/" + String(n.link || "").replace(/^\//, ""),
      tag: `n-${n.type}`,
    }, st.cat);
    return j({ ok: true, sent });
  }

  // 🛰 관제 앱 전용 — ops_alerts INSERT 트리거가 호출. 갈라 앱(APNs·FCM·일반 웹푸시)엔 절대 안 보낸다.
  if (body.kind === "ops") {
    if (!bridgeOk(req)) return j({ error: "forbidden" }, 403);
    const { data: a } = await sb.from("ops_alerts").select("id,kind,message").eq("id", body.id).maybeSingle();
    if (!a) return j({ error: "no alert" }, 404);
    const { data: subs } = await sb.from("ops_push_subs").select("endpoint,p256dh,auth").limit(50);
    const title = a.kind === "crisis" ? "🆘 위기 감지" : a.kind === "report" ? "🚨 신고 접수" : "🐞 버그 신고";
    const payload = JSON.stringify({ title, body: a.message, url: "/ops/#/" + (a.kind === "crisis" ? "crisis" : "alerts"), tag: "ops-" + a.kind, urgent: a.kind === "crisis" });
    let sent = 0;
    await Promise.all((subs || []).map(async (s) => {
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400, urgency: "high" }); sent++; }
      catch (e) { const code = (e as { statusCode?: number }).statusCode; if (code === 404 || code === 410) await sb.from("ops_push_subs").delete().eq("endpoint", s.endpoint); }
    }));
    return j({ ok: true, sent });
  }

  // 📰 뉴스 속보 브로드캐스트 — 크론(generate-galla-news)이 서비스키로 호출. '뉴스 알림 켠' 유저에게만.
  //    발송 빈도는 크론 쪽에서 스로틀(퍼플렉시티식 하루 1~2회) — 여기선 순수 브로드캐스트만.
  if (body.kind === "news") {
    if (!bridgeOk(req)) return j({ error: "forbidden" }, 403);
    const gn = String(body.id || "");
    // 프리뷰용 실제 뉴스 내용(제목·요약·히어로 이미지)을 DB에서 읽는다 — 없으면 넘어온 title로 폴백
    let headline = String((body as { title?: string }).title || "").slice(0, 90);
    let summary = "", image = "";
    if (gn) {
      const { data: nrow } = await sb.from("galla_news")
        .select("title,summary,hero_image").eq("id", gn).maybeSingle();
      if (nrow) {
        headline = String(nrow.title || headline).slice(0, 90);
        summary = String(nrow.summary || "").slice(0, 120);
        image = String(nrow.hero_image || "");
      }
    }
    if (!headline) return j({ error: "no title" }, 400);
    // 구독자(네이티브+웹) 전부 모아 뉴스 게이팅(push_allowed 'news')으로 거른다
    const [{ data: nat }, { data: web }] = await Promise.all([
      sb.from("native_push_tokens").select("user_id").limit(5000),
      sb.from("push_subscriptions").select("user_id").limit(5000),
    ]);
    const ids = [...new Set([...(nat || []), ...(web || [])].map((r) => r.user_id))];
    if (!ids.length) return j({ ok: true, sent: 0 });
    // 프리뷰: 제목=병맛 훅, 부제=헤드라인, 본문=한 줄 요약, 이미지=히어로(웹 big-picture / 네이티브는 NSE 시)
    const sent = await pushTo(ids, {
      title: pick(["📰 갈라뉴스 속보", "📰 이거 봤냐 속보", "📰 지금 이 얘기 나옴"]),
      subtitle: headline,
      body: summary || headline,
      image: image || undefined,
      url: gn ? `/news.html?gn=${gn}` : "/news.html",
      tag: "news-breaking",
    }, "news");
    return j({ ok: true, sent });
  }

  const me = await verifiedUid(req);   // 🔒 발신자 사칭 방지(서명 검증)
  if (!me) return j({ error: "auth" }, 401);

  // 📞 통화 벨 푸시 — 메시지 행이 없는 유일한 종류라 '둘 사이에 스레드가 있는가'로 남용을 막는다
  if (body.kind === "call") {
    const peer = String(body.id);
    const lo = me < peer ? me : peer, hi = me < peer ? peer : me;
    const { data: t } = await sb.from("dm_threads")
      .select("id").eq("user_lo", lo).eq("user_hi", hi).maybeSingle();
    if (!t) return j({ error: "no thread" }, 403);
    const { data: sender } = await sb.from("users").select("nickname").eq("id", me).single();
    const video = body.video === true;
    const sent = await pushTo([peer], {
      title: `📞 ${sender?.nickname || "갈라 친구"}`,
      body: video ? "면상톡이 왔어요 — 면상 까라" : "육성톡이 왔어요 — 탭해서 받기",
      url: `/dm.html?dm=${me}`,
      tag: `call-${me}`,
    }, "call");
    return j({ ok: true, sent });
  }

  if (body.kind === "room") {
    const { data: m } = await sb.from("open_messages")
      .select("id,room_id,sender_id,body,kind").eq("id", body.id).single();
    if (!m || m.sender_id !== me) return j({ error: "not sender" }, 403);
    const [{ data: room }, { data: mem }, { data: sender }] = await Promise.all([
      sb.from("open_rooms").select("title").eq("id", m.room_id).single(),
      sb.from("open_room_members").select("user_id").eq("room_id", m.room_id).limit(100),
      sb.from("users").select("nickname").eq("id", me).single(),
    ]);
    const targets = (mem || []).map((x) => x.user_id).filter((u) => u !== me);
    const sent = await pushTo(targets, {
      title: room?.title || "단체 채팅",
      body: `${sender?.nickname || "누군가"}: ${preview(m.kind, m.body)}`,
      url: "/dm.html",
      tag: `room-${m.room_id}`,
    }, "room");
    return j({ ok: true, sent });
  }

  // 👥 팔로우 — 팔로우 당한 사람에게 즉시 푸시(앱을 안 보고 있어도 도착)
  //    남용 방지: 함수가 '정말 내가 그를 팔로우했는가'를 서버에서 재확인한다.
  if (body.kind === "follow") {
    const target = String(body.id);
    const { data: rel } = await sb.from("follows")
      .select("follower").eq("follower", me).eq("following", target).maybeSingle();
    if (!rel) return j({ error: "not following" }, 403);
    const { data: sender } = await sb.from("users").select("nickname").eq("id", me).single();
    const nk = sender?.nickname || "갈라 친구";
    const sent = await pushTo([target], {
      title: "🧡 새 팬 등장",
      body: pick([`${nk}이(가) 널 팔로우함 ㅋㅋ 인기인 다 됐네`, `${nk}이(가) 널 찜함 — 맞팔 각?`, `${nk} 입장 — 네 팬 됐다`]),
      url: `/mypage.html?user=${me}`,
      tag: `follow-${me}`,
    }, "activity");
    return j({ ok: true, sent });
  }

  // 기본: 1:1 DM
  const { data: m } = await sb.from("dm_messages")
    .select("id,thread_id,sender_id,body,kind,meta").eq("id", body.id).single();
  if (!m || m.sender_id !== me) return j({ error: "not sender" }, 403);
  const { data: t } = await sb.from("dm_threads")
    .select("user_lo,user_hi").eq("id", m.thread_id).single();
  if (!t) return j({ error: "no thread" }, 404);
  const peer = t.user_lo === me ? t.user_hi : t.user_lo;
  const { data: sender } = await sb.from("users").select("nickname").eq("id", me).single();
  /* 💬 갈라톡 — 제목은 보낸 사람, 부제는 「갈라톡」(어느 기능 알림인지 한눈에). 부재중 전화는 '전화' 분류로. */
  const isCall = m.kind === "call";
  const video = !!(m.meta && (m.meta as Record<string, unknown>).video);
  const sent = await pushTo([peer], {
    title: sender?.nickname || "새 메시지",
    subtitle: isCall ? (video ? "면상톡" : "육성톡") : "갈라톡",
    body: isCall ? (video ? "📹 부재중 면상톡 — 다시 걸어볼래?" : "📞 부재중 육성톡 — 다시 걸어볼래?") : preview(m.kind, m.body),
    url: `/dm.html?dm=${me}`,
    tag: `dm-${m.thread_id}`,
  }, isCall ? "call" : "dm");
  return j({ ok: true, sent });
});
