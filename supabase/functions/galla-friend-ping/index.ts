/* 📮 갈비스 선톡 — 친구는 먼저 연락 오는 존재. 크론(하루 1회)이 호출.
   대상: 10시간~3주 안 온 유저 중 실제로 대화해본 사람(msg_count>=3), 삐짐 아님, 선톡 끔 아님,
        쿨다운 20h(하루 1회 상한). 런당 상한으로 비용 통제.
   동작: 기억(팔로업·관심사) 기반 개인화 한 줄 생성 → notifications INSERT(→푸시) → pending_ping 저장
        (푸시를 무시해도 다음에 챗 열면 그 말로 시작 — friend.js consume_ping). */
import { createClient } from "npm:@supabase/supabase-js@2.112.4";

import { logSpend } from "../_shared/spend.ts";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const _DS = Deno.env.get("DEEPSEEK_API_KEY") || "";
const BASE_URL = Deno.env.get("FRIEND_BASE_URL") || (_DS ? "https://api.deepseek.com" : "https://api.openai.com/v1");
const API_KEY = Deno.env.get("FRIEND_API_KEY") || (_DS || Deno.env.get("OPENAI_API_KEY")!);
const MODEL = Deno.env.get("FRIEND_MODEL") || (_DS ? "deepseek-chat" : "gpt-4o-mini");
const CRON_KEY = Deno.env.get("CRON_SECRET") || "";   // 있으면 헤더 검증(없으면 스킵)

const MAX_PER_RUN = 40;   // 런당 상한(비용·스팸 통제)

/* 🎟 등급 게이트 — 선톡은 유료 전용이고 등급마다 하루 몫이 다르다(app_settings.ai_tiers 의
   windows['galla-friend-ambient']: 무료·게스트 0, 가끔 6/일 … 종일 20/일).
   ⚠️ 여태 이 함수는 ai_gate 를 한 번도 안 불렀다 = 그 설정이 통째로 죽은 값이었고,
      무료 유저에게도 선톡이 나갔다. 20h 쿨다운만 있었지 '유료 전용'은 코드에 없었다.
   장애로 게이트 판정이 실패하면 '안 보낸다'로 닫는다 — 선톡은 안 가도 아무도 안 다치지만
   잘못 나가면 돈이 나가고 무료 유저가 유료 기능을 받는다. */
async function ambientGate(uid: string): Promise<boolean> {
  try {
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/rpc/ai_gate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ p_fn: "galla-friend-ambient", p_subject: "u:" + uid, p_n: 1 }),
    });
    if (!r.ok) return false;
    const g = await r.json();
    return !(g && g.ok === false);
  } catch { return false; }
}

/* ⚠️ uid 를 받는 이유 — 선톡 원가는 '그 유저 몫'이다.
   크론이라고 uid=null 로 적으면 게스트 지갑(ai_guest_uid)에 쌓여, model_for 가 그 유저 예산을
   계산할 때 선톡이 통째로 빠진다. 선톡을 유료 전용으로 만들고 등급마다 하루 6~20개를 줬는데
   그 원가가 예산 밖에서 나가면 브레이크가 없는 것과 같다.
   유저에 귀속시켜야 많이 받는 사람일수록 자기 예산을 먼저 쓰고 모델이 내려간다. */
async function genPing(uid: string, nick: string, name: string, mems: { kind: string; content: string }[]): Promise<string | null> {
  try {
    const memTxt = mems.map((m) => `- (${m.kind}) ${m.content}`).join("\n") || "(기억 없음)";
    const r = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL, temperature: 0.9, max_tokens: 60,
        messages: [
          { role: "system", content: `너는 '${name}'(갈라의 AI 친구). ${nick || "친구"}한테 먼저 카톡 보내듯 짧은 선톡 '한 줄'을 쓴다.
규칙: 반말, 1문장(최대 2문장), 이모지 X, 비서멘트 X, URL·링크 금지.
· 기억에 일·약속·하다 만 얘기가 있으면 **그걸 콕 집어** 물어라(면접·시험·이사·새로 시작한 것 등).
· 기억에 관심사·취향이 있으면 그걸 실마리로 걸어라(예: 클라이밍을 시작했다면 그 근황).
· 무겁고 부정적인 건(싫은 사람·힘든 일) 먼저 꺼내지 마라.
⚠️ **아래 보기를 글자 그대로 베끼지 마라** — 여러 사람에게 똑같은 문자가 가면 봇 티가 난다.
   말투 감만 잡고 이 사람한테만 맞는 문장을 새로 써라. 기억이 하나도 없을 때만 안부형으로 가되,
   그때도 표현은 매번 다르게(살아있냐/뭐하고 지내/얼굴 잊겠다/요즘 조용하네… 식으로 매번 새로).
보기(베끼지 말 것): "면접 어떻게 됐어? 궁금해서 ㅋㅋ" / "야 살아있냐 ㅋㅋ 요즘 뭐함"
기억:\n${memTxt}` },
          { role: "user", content: "선톡 한 줄 생성" },
        ],
      }),
    });
    const j = await r.json();
    logSpend("galla-friend-ping", MODEL, uid, j?.usage);   // 💰 이 유저 예산에서 나간다
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
        // 📌 팔로업 — 실제로 쌓이는 kind에 맞춘다. open_loop(하다 만 얘기)가 56건으로 두 번째로 많은데
        //    조회에서 빠져 있었다. 선톡은 원래 "그거 어떻게 됐어?"가 제일 자연스럽다.
        sb.from("friend_memory").select("kind,content").eq("user_id", uid).eq("status", "active")
          .in("kind", ["event", "promise", "open_loop"]).gte("created_at", new Date(Date.now() - 10 * 86400000).toISOString())
          .order("created_at", { ascending: false }).limit(2),
        // 📌 코어 — preference/profile만 보던 탓에 개인화가 거의 불가능했다(실측: preference 2건 vs interest 61건).
        //    가장 많이 쌓이는 interest를 포함한다. disliked(싫은 사람·힘든 일)는 의도적으로 제외 —
        //    먼저 거는 말에 부정적인 걸 꺼내면 안 된다.
        sb.from("friend_memory").select("kind,content").eq("user_id", uid).eq("status", "active")
          .in("kind", ["interest", "preference", "profile", "person", "job", "fact"])
          .order("salience", { ascending: false }).limit(3),
      ]);
      // 🎟 등급 몫을 먼저 깎는다 — 생성(=돈)보다 앞이어야 한다
      if (!(await ambientGate(uid))) continue;
      const ping = await genPing(uid, u?.nickname || "", rel.friend_name || "갈비스", [...(fu || []), ...(core || [])]);
      if (!ping) continue;
      // pending 저장(푸시 무시해도 다음 챗 오픈 때 이 말로 시작) + 상한 기록
      await sb.from("friend_relationship").update({
        pending_ping: ping, last_ping_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq("user_id", uid);
      /* 🔔 알림 파이프라인에 태운다 — 직접 web-push 를 쏘면 '웹 구독자'만 받는다.
         실측: push_subscriptions 0건 / native_push_tokens 1건 — 즉 아무한테도 안 갔다.
         notifications INSERT → trg_notify_push → send-push 가 웹·APNs 둘 다 처리하고
         notify_prefs.friend 게이팅·방해금지도 거기서 걸린다. */
      await sb.from("notifications").insert({
        user_id: uid, type: "friend", message: ping, link: "app.html?frping=1",
      });
      sent++;
    }
    return new Response(JSON.stringify({ ok: true, targets: targets.length, sent }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e).slice(0, 200) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
