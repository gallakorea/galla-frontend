/* 📮 갈비스 선톡 — 친구는 먼저 연락 오는 존재. 크론(하루 1회)이 호출.
   대상: 2~7일 안 온 유저 중 실제로 대화해본 사람(msg_count>=3), 삐짐 아님, 선톡 끔 아님,
        최근 3일 내 선톡 안 받음(주 2~3회 상한). 런당 상한으로 비용 통제.
   동작: 기억(팔로업·관심사) 기반 개인화 한 줄 생성 → 웹푸시 → pending_ping 저장
        (푸시를 무시해도 다음에 챗 열면 그 말로 시작 — friend.js consume_ping). */
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") || "mailto:blackid@gmail.com",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);
const _DS = Deno.env.get("DEEPSEEK_API_KEY") || "";
const BASE_URL = Deno.env.get("FRIEND_BASE_URL") || (_DS ? "https://api.deepseek.com" : "https://api.openai.com/v1");
const API_KEY = Deno.env.get("FRIEND_API_KEY") || (_DS || Deno.env.get("OPENAI_API_KEY")!);
const MODEL = Deno.env.get("FRIEND_MODEL") || (_DS ? "deepseek-chat" : "gpt-4o-mini");
const CRON_KEY = Deno.env.get("CRON_SECRET") || "";   // 있으면 헤더 검증(없으면 스킵)

const MAX_PER_RUN = 40;   // 런당 상한(비용·스팸 통제)

async function genPing(nick: string, name: string, mems: { kind: string; content: string }[]): Promise<string | null> {
  try {
    const memTxt = mems.map((m) => `- (${m.kind}) ${m.content}`).join("\n") || "(기억 없음)";
    const r = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL, temperature: 0.9, max_tokens: 60,
        messages: [
          { role: "system", content: `너는 '${name}'(갈라의 AI 친구). ${nick || "친구"}한테 먼저 카톡 보내듯 짧은 선톡 '한 줄'을 쓴다.
규칙: 반말, 1문장(최대 2문장), 이모지 X, 비서멘트 X. 기억에 일·약속(면접·시험 등)이 있으면 그 안부를 물어라("면접 어떻게 됐어? 궁금해서 ㅋㅋ"). 없으면 가볍게("야 살아있냐 ㅋㅋ 요즘 뭐함"). 무겁고 부정적인 건(싫은사람·힘든일) 먼저 꺼내지 마라. URL·링크 금지.
기억:\n${memTxt}` },
          { role: "user", content: "선톡 한 줄 생성" },
        ],
      }),
    });
    const j = await r.json();
    const t = (j?.choices?.[0]?.message?.content || "").trim().replace(/^["']|["']$/g, "");
    return t ? t.slice(0, 120) : null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (CRON_KEY && req.headers.get("x-cron-key") !== CRON_KEY) {
    // 크론 시크릿이 설정돼 있으면 검증 — 임의 호출로 푸시 남발 방지
    const auth = req.headers.get("Authorization") || "";
    if (!auth.includes(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "@@")) return new Response("forbidden", { status: 403 });
  }
  try {
    // 대상 선별
    // 🕐 친구다운 케이던스: 반나절(10h)~3주 미접속이면 대상. 2일 창은 너무 보수적이라 대상이 늘 0명이었음(사장님 "선톡 작동 안함").
    //    쿨다운 20h로 하루 1회 상한(스팸 방지). 저녁 크론(19:30 KST)이 '오늘 안 온 사람'에게 안부.
    const { data: rels } = await sb.from("friend_relationship")
      .select("user_id,friend_name,msg_count,mood,last_seen_at,last_ping_at,ping_off")
      .gte("msg_count", 3)
      .lt("last_seen_at", new Date(Date.now() - 10 * 3600000).toISOString())
      .gt("last_seen_at", new Date(Date.now() - 21 * 86400000).toISOString())
      .limit(200);
    const targets = (rels || []).filter((r) =>
      !r.ping_off && r.mood !== "sulky" &&
      (!r.last_ping_at || new Date(r.last_ping_at).getTime() < Date.now() - 20 * 3600000)
    ).slice(0, MAX_PER_RUN);

    let sent = 0;
    for (const rel of targets) {
      const uid = rel.user_id;
      // 닉 + 기억(팔로업 우선, 다음 관심사)
      const [{ data: u }, { data: fu }, { data: core }] = await Promise.all([
        sb.from("users").select("nickname").eq("id", uid).maybeSingle(),
        sb.from("friend_memory").select("kind,content").eq("user_id", uid).eq("status", "active")
          .in("kind", ["event", "promise"]).gte("created_at", new Date(Date.now() - 10 * 86400000).toISOString())
          .order("created_at", { ascending: false }).limit(2),
        sb.from("friend_memory").select("kind,content").eq("user_id", uid).eq("status", "active")
          .in("kind", ["preference", "profile"]).order("salience", { ascending: false }).limit(2),
      ]);
      const ping = await genPing(u?.nickname || "", rel.friend_name || "갈비스", [...(fu || []), ...(core || [])]);
      if (!ping) continue;
      // pending 저장(푸시 무시해도 다음 챗 오픈 때 이 말로 시작) + 상한 기록
      await sb.from("friend_relationship").update({
        pending_ping: ping, last_ping_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq("user_id", uid);
      // 웹푸시(구독 없는 유저는 pending만 남음 — 다음 접속 때 보임)
      const { data: subs } = await sb.from("push_subscriptions")
        .select("endpoint,p256dh,auth").eq("user_id", uid).limit(5);
      await Promise.all((subs || []).map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify({ title: `💬 ${rel.friend_name || "갈비스"}`, body: ping, url: "/app.html?frping=1" }),
            { TTL: 6 * 3600 },
          );
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) await sb.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        }
      }));
      sent++;
    }
    return new Response(JSON.stringify({ ok: true, targets: targets.length, sent }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e).slice(0, 200) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
