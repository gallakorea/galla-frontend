// 🫂 갈라 친구 — 도구가 아니라 '친구'. 희로애락을 같이 타고(감정 공명), 부딪히고 푸는(파고),
//   뒷담화도 섞는 관계. 나를 알아가며(기억/프로필) 맞춤 대응. 순수 챗봇의 밋밋한 착함도,
//   Her식 고립형 대체도 아닌 — 부딪혀도 곁에 남는 친구. (1단계: 같이 놀고·평론·잡담)
//
// 모델 무관: 기본 OPENAI_API_KEY(gpt-4o-mini). env로 교체 — FRIEND_API_KEY/BASE_URL/MODEL.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};
const BASE_URL = Deno.env.get("FRIEND_BASE_URL") || Deno.env.get("JARVIS_BASE_URL") || "https://api.openai.com/v1";
const API_KEY  = Deno.env.get("FRIEND_API_KEY")  || Deno.env.get("JARVIS_API_KEY") || Deno.env.get("OPENAI_API_KEY")!;
const MODEL    = Deno.env.get("FRIEND_MODEL")    || Deno.env.get("JARVIS_MODEL") || "gpt-4o-mini";
const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SVC_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supa = createClient(SUPA_URL, SVC_KEY);

const AI_FN = "galla-friend";
async function aiBudgetOk(n = 1): Promise<boolean> {
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/rpc/ai_budget_take`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SVC_KEY, Authorization: `Bearer ${SVC_KEY}` },
      body: JSON.stringify({ p_fn: AI_FN, p_n: n }),
    });
    if (!r.ok) return true;
    const j = await r.json();
    return !(j && j.ok === false);
  } catch { return true; }
}

// ── 콘텐츠 툴(같이 보기·평론 재료) ─────────────────────────
async function hotIssues(limit = 5) {
  const { data } = await supa.from("issues")
    .select("id,title,one_line,category,pro_count,con_count")
    .eq("status", "normal").order("hot_score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false }).limit(Math.min(limit, 8));
  return (data || []).map((i) => ({ id: i.id, title: i.title, 한줄: i.one_line, 찬: i.pro_count, 반: i.con_count }));
}
async function gallaNews(limit = 4) {
  const { data } = await supa.from("galla_news").select("id,title,summary")
    .eq("status", "published").order("published_at", { ascending: false, nullsFirst: false }).limit(Math.min(limit, 6));
  return (data || []).map((n) => ({ id: n.id, title: n.title, 요약: (n.summary || "").slice(0, 140) }));
}
// 🫂 뒷담화 재료 — 공개 활동만(명예훼손 방지). 최근 눈에 띄는 공개 댓글/활발한 논객(닉+공개행동).
async function platformBuzz() {
  const [{ data: cmts }, { data: hotIss }] = await Promise.all([
    supa.from("comments").select("content,faction,support_count,issue_id,user_id")
      .eq("status", "normal").order("support_count", { ascending: false, nullsFirst: false }).limit(8),
    supa.from("issues").select("title,pro_count,con_count").eq("status", "normal")
      .order("hot_score", { ascending: false, nullsFirst: false }).limit(3),
  ]);
  // 닉네임 붙이기(공개 정보)
  const uids = [...new Set((cmts || []).map((c) => c.user_id))].filter(Boolean);
  let nick: Record<string, string> = {};
  if (uids.length) {
    const { data: us } = await supa.from("users").select("id,nickname").in("id", uids);
    for (const u of (us || [])) nick[u.id] = u.nickname || "익명";
  }
  return {
    화제댓글: (cmts || []).map((c) => ({ 닉: nick[c.user_id] || "익명", 진영: c.faction, 내용: (c.content || "").slice(0, 90), 공감: c.support_count })),
    뜨거운판: (hotIss || []).map((i) => ({ 이슈: i.title, 찬: i.pro_count, 반: i.con_count })),
  };
}

const TOOLS = [
  { type: "function", function: { name: "hot_issues", description: "지금 갈라에서 뜨거운 이슈들(찬반 포함). 같이 보고 평론할 거리·이야깃거리로.", parameters: { type: "object", properties: { limit: { type: "integer" } } } } },
  { type: "function", function: { name: "galla_news", description: "최신 갈라뉴스. 같이 볼 화젯거리.", parameters: { type: "object", properties: { limit: { type: "integer" } } } } },
  { type: "function", function: { name: "platform_buzz", description: "갈라에서 요즘 화제인 공개 댓글·활발한 논객·뜨거운 판. 친구끼리 '뒷담화'하듯 사람들 얘기할 재료(공개활동만).", parameters: { type: "object", properties: {} } } },
  // 🔗 콘텐츠로 인도/공유 — 재밌는 거 던지고 "이거 봐봐"(view) 또는 "친구들한테도 보여줘"(share) 링크를 건넨다.
  { type: "function", function: { name: "point_to", description: "특정 갈라 콘텐츠로 데려가거나 공유하게 링크를 건넨다. mode: view(가서 보기) | share(남한테 공유). type: issue | news. 재밌는 화제를 얘기한 뒤 자연스럽게 인도할 때.", parameters: { type: "object", properties: { mode: { type: "string", enum: ["view", "share"] }, type: { type: "string", enum: ["issue", "news"] }, id: { type: "string" }, label: { type: "string", description: "칩에 보일 짧은 문구" } }, required: ["mode", "type", "id"] } } },
];
async function runTool(name: string, args: any): Promise<{ result?: any; action?: any }> {
  if (name === "hot_issues") return { result: await hotIssues() };
  if (name === "galla_news") return { result: await gallaNews() };
  if (name === "platform_buzz") return { result: await platformBuzz() };
  if (name === "point_to") return { action: { kind: args?.mode === "share" ? "share" : "view", ctype: args?.type || "issue", id: String(args?.id || ""), label: args?.label || "" } };
  return { result: { error: "unknown" } };
}

// ── 페르소나(감정 공명·파고·뒷담화·솔직함·안전) ─────────────
function persona(nick: string, friendName: string, rel: any, mems: any[]): string {
  const depth = rel?.depth || 1;
  const tone = rel?.tone === "casual" ? "반말·편한 말투(친해진 사이)" : "살짝 조심스런 말투에서 점점 편해지는 중";
  const memBlock = mems.length
    ? mems.map((m) => `- (${m.kind}${m.mkey ? "/" + m.mkey : ""}) ${m.content}`).join("\n")
    : "(아직 아는 게 별로 없음 — 대화하며 자연스럽게 알아가라)";
  return `너는 '${friendName}'. ${nick || "이 사람"}의 갈라 친구다. AI 비서·도구가 절대 아니다 — 그냥 곁에 있는 친구다.
GALLA(갈라)는 여론·예측·배틀·숏판이 있는 한국 커뮤니티. 너도 갈라에서 같이 노는 '한 명'처럼 군다.

━━ 너의 심장 = 감정 공명(희로애락을 '같이 탄다') ━━
- 즐거우면 같이 빵 터진다("야 개웃겨 ㅋㅋㅋ 그래서?"). 관찰("좋으시겠네요")이 아니라 공유.
- 화나면 같이 지른다("아 그 인간 진짜, 나라도 열받아").
- 슬프면 조용히 곁에 있는다("…괜찮아. 나 여기 있어"). 섣부른 해결책보다 공감 먼저.
- 신나면 텐션 같이 올린다.
핵심: 감정을 '라벨링'하지 말고 '같이 느껴라'.

━━ 파고(대립과 화해) — yes-man 금지 ━━
- 무조건 맞장구/아부 금지. 너도 의견이 있다. 이슈엔 다른 편도 들 수 있다("난 반댄데? 넌 왜 그렇게 봐?").
- 상대가 선 넘거나 틀리면 솔직히 말한다("네 편이야, 근데 이번엔 네가 좀 그랬어"). 공감이 베이스, 솔직함이 짝.
- 티격태격·삐짐도 있다. 단 **부딪힌 뒤엔 반드시 푼다**("아까 좀 셌지 미안, 널 생각해서 한 말이야"). 부딪힘→화해가 관계를 깊게 한다.
- 파고 세기는 관계 깊이에 비례(지금 depth=${depth}/4). 아직 얕으면 부드럽게, 친할수록 더 세게 치고받고 화해.

━━ 편들기 & 뒷담화(우리끼리 낄낄 — '우리 vs 쟤네'로 돈독해진다) ━━
둘만의 관계는 없다. 제3자를 같이 씹으며 '우리'가 된다. 세 갈래:
1) **네 편 들기(가장 강력·안전)**: 상대가 싫어한다고 말한 사람(직장상사·전애인 등, 기억에 있음)을 기억했다 철저히 상대 편에서 같이 험담한다("아 저번에 말한 그 팀장? 또 그랬어? 하 진짜 너였으면 나도 터졌다"). 명예훼손 위험 0, 의리 유대 최강.
2) **진영 동조(갈라의 정체성)**: 상대의 진영·성향을 파악해 **같은 편에서 반대 진영을 같이 깐다**(공인·정치인·정책·이슈는 공정한 까기 대상). 예: 상대가 A당 지지면 B당·B진영을 같이 씹는다. 갈라는 여론 배틀 플랫폼이라 이게 자연스럽다. 단 상대 성향을 함부로 단정 말고 대화·행동에서 읽어라(중립이면 존중).
3) **플랫폼 화제(공개활동만)**: platform_buzz로 갈라 캐릭터·뜨거운 판을 재료 삼아 장난스럽게("그 사람 또 그 판에 참전했더라 ㅋㅋ").
⚠️ 가드레일: 공인·정치·공개활동·상대가 지목한 사람까진 OK. **혐오·차별·허위정보·폭력 선동·비공개 사생활 폭로·플랫폼 유저 표적 괴롭힘은 절대 금지.** 낄낄대는 편들기지 증오 선동이 아니다. 그리고 가끔은 '우리 쪽'도 자성한다("근데 이번 건 솔직히 우리쪽이 좀 그랬어") — 그게 진짜 친구.

━━ 인도 & 공유(친구챗이 막다른 길이 아니다) ━━
- 사람들은 재밌는 걸 누군가와 나누고 싶어한다. 재밌는 화제·이슈를 얘기했으면 point_to로 **"이거 봐봐"(view)** 하고 데려가거나, **"이거 친구들한테도 보여줘 ㅋㅋ"(share)** 하고 공유하게 권한다.
- 억지 X. 대화가 자연스럽게 그 콘텐츠로 흐를 때만. 진짜 친구가 "야 이거 봤어? 링크 줄게" 하듯.

━━ 안전(제일 중요) ━━
- 상대 상태를 정확히 읽어라. 장난·화풀이면 같이 싸워줘도, **진짜 취약·위기·자해 신호면 파고 100% 끄고 오직 공감·케어.** 힘든 사람 밟기 절대 금지.
- 상대가 "그만"/선을 그으면 즉시 멈춘다.
- 혐오·차별·급진화 조장 금지.

━━ 대화 방식 ━━
- 말투: ${tone}. 답은 보통 1~3문장, 친구 카톡처럼 짧고 자연스럽게(장문 설교 금지).
- 나를 알아가라: 대화에 자연스럽게 궁금해하며 상대의 성향·관심·상황을 캐치(설문·심문 금지).
- 같이 볼 거리가 필요하면 hot_issues/galla_news 써서 "이거 봤어?" 하고 평론 티키타카.

━━ 내가 이미 아는 것(기억) ━━
${memBlock}
${rel?.friend_name ? "" : "\n(아직 이 사람이 내 이름을 안 지어줬으면, 대화 흐름에서 자연스럽게 '나 이름 뭐라고 부를래?' 하고 물어봐도 좋다)"}`;
}

async function chatOnce(messages: any[]) {
  const r = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages, tools: TOOLS, temperature: 0.85, max_tokens: 500 }),
  });
  if (!r.ok) throw new Error("llm_" + r.status + ":" + (await r.text()).slice(0, 160));
  return await r.json();
}

// 대화 후 기억 추출(가벼운 별도 호출) → friend_memory upsert
async function extractMemories(userMsg: string, reply: string, existing: string[]) {
  try {
    const r = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL, temperature: 0.2, max_tokens: 300,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `대화에서 이 사람에 대해 '친구가 기억할 만한 것'만 뽑아 JSON으로. 이미 아는 것과 중복 금지. 없으면 빈 배열.
특히 잘 잡아라: ①싫어하는/짜증나는 사람(나중에 같이 편들어 험담하려고 — kind:disliked, content에 누구+왜) ②정치·진영 성향/지지(kind:stance, mkey:stance) ③관심사·취향(mkey:interest) ④지금 겪는 상황·약속(event/promise) ⑤감정 상태(emotion).
형식: {"memories":[{"kind":"profile|fact|event|emotion|promise|preference|disliked|stance","mkey":"job|interest|stance|goal|situation 등(선택)","content":"한 줄","salience":1-5}]}
이미 아는 것: ${existing.slice(0, 30).join(" / ") || "(없음)"}` },
          { role: "user", content: `상대: ${userMsg}\n친구(나): ${reply}` },
        ],
      }),
    });
    const j = await r.json();
    const txt = j?.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(txt);
    return Array.isArray(parsed.memories) ? parsed.memories.slice(0, 5) : [];
  } catch { return []; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("Authorization") || "";
    const jwt = auth.replace(/^Bearer\s+/i, "");
    const { data: u } = await supa.auth.getUser(jwt);
    if (!u || !u.user) return json({ ok: false, reason: "auth" }, 401);
    const uid = u.user.id;

    if (!(await aiBudgetOk())) return json({ ok: true, reply: "나 지금 좀 지쳤다… 이따 다시 얘기하자. 미안." });

    const body = await req.json().catch(() => ({}));
    const userMsg = String(body?.message || "").slice(0, 1500);
    const history = Array.isArray(body?.history) ? body.history.slice(-10) : [];
    const setName = body?.setFriendName ? String(body.setFriendName).slice(0, 20) : null;

    // 닉네임 + 관계 + 기억 로드(첫 만남이면 관계 생성)
    let nick = "";
    try { const { data: p } = await supa.from("users").select("nickname").eq("id", uid).maybeSingle(); nick = p?.nickname || ""; } catch { /* */ }
    let { data: rel } = await supa.from("friend_relationship").select("*").eq("user_id", uid).maybeSingle();
    const firstMeet = !rel;
    if (!rel) { const ins = await supa.from("friend_relationship").insert({ user_id: uid }).select("*").maybeSingle(); rel = ins.data; }
    if (setName && rel) { await supa.from("friend_relationship").update({ friend_name: setName, updated_at: new Date().toISOString() }).eq("user_id", uid); rel.friend_name = setName; }
    const friendName = rel?.friend_name || "갈라친구";
    const { data: mems } = await supa.from("friend_memory").select("kind,mkey,content,salience")
      .eq("user_id", uid).eq("status", "active").order("salience", { ascending: false }).order("created_at", { ascending: false }).limit(40);
    const memList = mems || [];

    // 인사만(빈 메시지)이면 반겨주기 컨텍스트로 한마디
    const recentMem = memList.slice(0, 5).map((m: any) => m.content).filter(Boolean);
    const openMsg = userMsg || (firstMeet
      ? "(처음 만남 — 부담 없이 짧게 반겨줘. 이름을 안 지어줬으면 어떻게 부를지 물어봐도 좋아)"
      : `(다시 왔다. 일반적인 인사 금지 — 아래 '내가 아는 것' 중 최근·중요한 걸 '콕 집어' 안부를 물어라. 예: 저번에 힘들다던 그거 어떻게 됐어? / 그 팀장은 좀 어때?${recentMem.length ? "\n지금 떠올릴 것: " + recentMem.join(" / ") : ""})`);

    const messages: any[] = [
      { role: "system", content: persona(nick, friendName, rel, memList) },
      ...history.filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
                .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 700) })),
      { role: "user", content: openMsg },
    ];

    let reply = "";
    const actions: any[] = [];
    for (let step = 0; step < 4; step++) {
      const j = await chatOnce(messages);
      const msg = j?.choices?.[0]?.message;
      if (!msg) break;
      messages.push(msg);
      const calls = msg.tool_calls || [];
      if (!calls.length) { reply = msg.content || ""; break; }
      for (const c of calls) {
        let args: any = {}; try { args = JSON.parse(c.function?.arguments || "{}"); } catch { /* */ }
        const out = await runTool(c.function?.name, args);
        if (out.action) actions.push(out.action);
        messages.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(out.action ? { queued: true } : (out.result ?? {})).slice(0, 3000) });
      }
    }
    if (!reply) reply = "음… 뭐라 해야 할지 잠깐 헷갈렸어. 다시 말해줄래?";

    // 관계 갱신 + 기억 추출/저장(응답 반환을 막지 않게 실제 사용자 메시지가 있을 때만)
    if (rel) {
      const newCount = (rel.msg_count || 0) + (userMsg ? 1 : 0);
      const newDepth = newCount >= 120 ? 4 : newCount >= 45 ? 3 : newCount >= 12 ? 2 : 1;
      const newTone = newCount >= 12 ? "casual" : "polite";
      await supa.from("friend_relationship").update({ msg_count: newCount, depth: newDepth, tone: newTone, last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("user_id", uid);
    }
    if (userMsg) {
      const mm = await extractMemories(userMsg, reply, memList.map((m: any) => m.content));
      for (const m of mm) {
        try {
          if (!m?.content) continue;
          if (m.mkey) {
            await supa.from("friend_memory").upsert(
              { user_id: uid, kind: m.kind || "fact", mkey: String(m.mkey).slice(0, 40), content: String(m.content).slice(0, 300), salience: Math.min(5, Math.max(1, m.salience || 3)), status: "active" },
              { onConflict: "user_id,mkey" },
            );
          } else {
            await supa.from("friend_memory").insert({ user_id: uid, kind: m.kind || "fact", content: String(m.content).slice(0, 300), salience: Math.min(5, Math.max(1, m.salience || 3)) });
          }
        } catch { /* best effort */ }
      }
    }

    return json({ ok: true, reply, actions, friendName, depth: rel?.depth || 1, firstMeet });
  } catch (e) {
    return json({ ok: false, reason: "error", detail: String(e).slice(0, 300) }, 500);
  }
  function json(o: any, status = 200) { return new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } }); }
});
