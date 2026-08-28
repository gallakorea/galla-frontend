/* 📮 send-push — DM/난장 메시지 Web Push 발송
   호출자: 메시지를 보낸 클라이언트(전송 직후). JWT 필수(게이트웨이 검증).
   남용 방지: 함수가 '정말 그 메시지의 발신자인가'를 서버에서 재확인한다 —
   임의 payload로 남의 기기에 푸시를 쏘는 건 불가능. 알림 내용도 DB에서 읽는다. */
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";
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
  bundle: Deno.env.get("APNS_BUNDLE_ID") || "im.galla.app",
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
  const aps: Record<string, unknown> = {
    aps: { alert, sound: "default", "thread-id": String(payload.tag || "galla"), "mutable-content": 1 },
    url: payload.url || "/",
  };
  if (payload.image) aps.image = String(payload.image);   // 잠금화면 이미지 프리뷰 — NSE 확장이 이 URL을 첨부

  // dev 빌드=sandbox 토큰 / 배포=production 토큰. 환경 불일치(BadDeviceToken) 시 다른 호스트로 재시도 → 둘 다 커버.
  const hosts = [APNS.host, APNS.host === "api.push.apple.com" ? "api.sandbox.push.apple.com" : "api.push.apple.com"];
  const hdr = { "authorization": `bearer ${authTok}`, "apns-topic": APNS.bundle, "apns-push-type": "alert", "apns-priority": "10", "content-type": "application/json" };
  let sent = 0;
  await Promise.all(toks.map(async (t) => {
    for (const host of hosts) {
      try {
        const r = await fetch(`https://${host}/3/device/${t.token}`, { method: "POST", headers: hdr, body: JSON.stringify(aps) });
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

async function pushFcm(userIds: string[], payload: Record<string, unknown>): Promise<number> {
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
              title: String(payload.title || "GALLA"),
              body: String(payload.body || ""),
              ...(payload.image ? { image: String(payload.image) } : {}),
            },
            /* 탭했을 때 어디로 갈지 — 앱은 data.url 을 읽는다(iOS 의 aps.url 과 같은 규약) */
            data: { url: String(payload.url || "/"), tag: String(payload.tag || "galla") },
            android: { priority: "high", notification: { channel_id: "galla", sound: "default" } },
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
  pager:           { cat: "pager",    t: "📟 삐-삐- 삐삐 왔다",  b: (n) => pick([`${n.nick}이(가) 삐삐 쳤다 — 음성사서함 확인 ㄱㄱ`, `📟 띠리리- 누가 널 찾는다 — 삐삐 도착`, `${n.nick}한테서 삐삐 옴 — 90년대냐 ㅋㅋ`]) },
};
const NOTIFY_DEFAULT = { cat: "activity", t: "🔔 갈라 소식", b: (n: { message: string }) => n.message || "새 소식 떴다 — 확인 ㄱㄱ" };
const SKIP_NOTIFY = new Set(["follow"]);   // follow는 클라가 실시간 푸시함(중복 방지)

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

  const me = callerUid(req);
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
    .select("id,thread_id,sender_id,body,kind").eq("id", body.id).single();
  if (!m || m.sender_id !== me) return j({ error: "not sender" }, 403);
  const { data: t } = await sb.from("dm_threads")
    .select("user_lo,user_hi").eq("id", m.thread_id).single();
  if (!t) return j({ error: "no thread" }, 404);
  const peer = t.user_lo === me ? t.user_hi : t.user_lo;
  const { data: sender } = await sb.from("users").select("nickname").eq("id", me).single();
  const sent = await pushTo([peer], {
    title: sender?.nickname || "새 메시지",
    body: preview(m.kind, m.body),
    url: `/dm.html?dm=${me}`,
    tag: `dm-${m.thread_id}`,
  }, "dm");
  return j({ ok: true, sent });
});
