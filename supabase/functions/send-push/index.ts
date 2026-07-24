/* 📮 send-push — DM/난장 메시지 Web Push 발송
   호출자: 메시지를 보낸 클라이언트(전송 직후). JWT 필수(게이트웨이 검증).
   남용 방지: 함수가 '정말 그 메시지의 발신자인가'를 서버에서 재확인한다 —
   임의 payload로 남의 기기에 푸시를 쏘는 건 불가능. 알림 내용도 DB에서 읽는다. */
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") || "mailto:blackid@gmail.com",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
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

const preview = (kind: string, body: string) =>
  kind === "e2e" ? "🔒 비밀 메시지"
  : kind === "image" ? "📷 사진"
  : kind === "gif" ? "🎬 이모티콘"
  : kind === "voice" ? "🎤 음성 메시지"
  : kind === "share" ? "🔗 콘텐츠 공유"
  : (body || "").slice(0, 80);

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
  const { data: subs } = await sb.from("push_subscriptions")
    .select("endpoint,p256dh,auth,user_id").in("user_id", userIds).limit(200);
  let sent = 0;
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
  const me = callerUid(req);
  if (!me) return j({ error: "auth" }, 401);
  let body: { kind?: string; id?: string };
  try { body = await req.json(); } catch { return j({ error: "bad json" }, 400); }
  if (!body.id) return j({ error: "id required" }, 400);

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
