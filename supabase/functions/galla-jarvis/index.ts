// 갈라비스 — 유저마다 붙는 개인 AI 에이전트(자비스). 플랫폼 데이터를 '툴'로 읽어
// 검색·여론분석·화면이동·창작초안까지. DB 쓰기는 절대 안 함(읽기 전용). 글 발행·예측 참여 같은
// 행동은 '작성창을 초안으로 미리 채워 여는 것'까지만 → 최종 확정은 유저 손으로.
//
// 모델 무관 설계: 기본은 기존 OPENAI_API_KEY(gpt-4o-mini). 저가형(DeepSeek 등 OpenAI-호환)으로
// 갈아끼우려면 env만: JARVIS_BASE_URL / JARVIS_API_KEY / JARVIS_MODEL.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};

// ── 모델 백엔드(OpenAI-호환) — env로 저가 API 교체 가능 ──
const _DS = Deno.env.get("DEEPSEEK_API_KEY") || "";
const BASE_URL = Deno.env.get("JARVIS_BASE_URL") || (_DS ? "https://api.deepseek.com" : "https://api.openai.com/v1");
const API_KEY  = Deno.env.get("JARVIS_API_KEY")  || (_DS || Deno.env.get("OPENAI_API_KEY")!);
const MODEL    = Deno.env.get("JARVIS_MODEL")    || (_DS ? "deepseek-chat" : "gpt-4o-mini");

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SVC_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supa = createClient(SUPA_URL, SVC_KEY);

const AI_FN = "galla-jarvis";
async function aiBudgetOk(n = 1): Promise<boolean> {
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/rpc/ai_budget_take`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SVC_KEY, Authorization: `Bearer ${SVC_KEY}` },
      body: JSON.stringify({ p_fn: AI_FN, p_n: n }),
    });
    if (!r.ok) return true;
    const j = await r.json();
    if (j && j.ok === false) return false;
    return true;
  } catch { return true; }
}

// ── 서버 실행 툴(읽기 전용) ────────────────────────────────
async function hotIssues(limit = 6) {
  const { data } = await supa.from("issues")
    .select("id,title,one_line,category,pro_count,con_count,view_count,hot_score")
    .eq("status", "active").in("moderation_status", ["ok", "approved", "clean"])
    .order("hot_score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false }).limit(Math.min(limit, 10));
  return (data || []).map((i) => ({
    id: i.id, title: i.title, one_line: i.one_line, category: i.category,
    찬성: i.pro_count, 반대: i.con_count, 조회: i.view_count,
  }));
}

async function searchContent(query: string, kinds?: string[]) {
  const q = (query || "").trim().slice(0, 60);
  if (!q) return { results: [] };
  const want = (k: string) => !kinds || kinds.length === 0 || kinds.includes(k);
  const like = `%${q}%`;
  const jobs: Promise<any>[] = [];
  if (want("issue")) jobs.push(supa.from("issues").select("id,title,one_line,pro_count,con_count")
    .or(`title.ilike.${like},description.ilike.${like},one_line.ilike.${like}`)
    .eq("status", "active").limit(5).then((r) => (r.data || []).map((x: any) =>
      ({ type: "issue", id: x.id, title: x.title, snippet: x.one_line, meta: `찬${x.pro_count}·반${x.con_count}` }))));
  if (want("predict")) jobs.push(supa.from("markets").select("id,question,category,total_pool,status")
    .or(`question.ilike.${like},description.ilike.${like}`).neq("resolved", true).limit(4)
    .then((r) => (r.data || []).map((x: any) =>
      ({ type: "predict", id: x.id, title: x.question, snippet: x.category, meta: `풀 ${x.total_pool || 0}GP` }))));
  if (want("news")) jobs.push(supa.from("galla_news").select("id,title,summary,category")
    .or(`title.ilike.${like},summary.ilike.${like}`).eq("status", "published").limit(4)
    .then((r) => (r.data || []).map((x: any) =>
      ({ type: "news", id: x.id, title: x.title, snippet: x.summary, meta: x.category }))));
  if (want("post")) jobs.push(supa.from("posts").select("id,title,caption,kind,like_count")
    .or(`title.ilike.${like},caption.ilike.${like}`).eq("is_published", true).limit(4)
    .then((r) => (r.data || []).map((x: any) =>
      ({ type: "post", id: x.id, title: x.title || (x.caption || "").slice(0, 40), snippet: x.kind, meta: `♥${x.like_count}` }))));
  const parts = await Promise.all(jobs);
  return { results: parts.flat().slice(0, 12) };
}

async function issuePulse(id?: string, title?: string) {
  let iss: any = null;
  if (id) iss = (await supa.from("issues").select("id,title,one_line,summary,category,pro_count,con_count,sup_pro,sup_con,view_count,like_count").eq("id", id).maybeSingle()).data;
  if (!iss && title) iss = (await supa.from("issues").select("id,title,one_line,summary,category,pro_count,con_count,sup_pro,sup_con,view_count,like_count").ilike("title", `%${title.slice(0, 40)}%`).order("hot_score", { ascending: false, nullsFirst: false }).limit(1).maybeSingle()).data;
  if (!iss) return { found: false };
  const { data: cmts } = await supa.from("comments").select("content,faction,support_count")
    .eq("issue_id", iss.id).eq("status", "active").order("support_count", { ascending: false, nullsFirst: false }).limit(6);
  const total = (iss.pro_count || 0) + (iss.con_count || 0);
  return {
    found: true, id: iss.id, title: iss.title, one_line: iss.one_line, summary: iss.summary,
    category: iss.category, 찬성: iss.pro_count, 반대: iss.con_count,
    찬성비율: total ? Math.round((iss.pro_count / total) * 100) : null,
    조회: iss.view_count, 좋아요: iss.like_count,
    대표댓글: (cmts || []).map((c) => ({ 진영: c.faction, 내용: (c.content || "").slice(0, 120) })),
  };
}

async function listPredictions(limit = 5) {
  const { data } = await supa.from("markets").select("id,question,category,total_pool,close_at,status")
    .neq("resolved", true).order("total_pool", { ascending: false, nullsFirst: false }).limit(Math.min(limit, 8));
  return (data || []).map((m) => ({ id: m.id, 질문: m.question, category: m.category, 풀: m.total_pool, 마감: m.close_at }));
}

async function gallaNews(limit = 5) {
  const { data } = await supa.from("galla_news").select("id,title,summary,category,published_at")
    .eq("status", "published").order("published_at", { ascending: false, nullsFirst: false }).limit(Math.min(limit, 8));
  return (data || []).map((n) => ({ id: n.id, title: n.title, summary: (n.summary || "").slice(0, 160), category: n.category }));
}

// 크리에이터 소재 브리핑 — 지금 뜨는 이슈+뉴스+인기 태그를 한 번에 긁어 '창작 재료'로.
async function creatorBrief(topic?: string) {
  const [hot, news, tagRows] = await Promise.all([
    topic ? searchContent(topic, ["issue", "news"]).then((r) => r.results) : hotIssues(6),
    gallaNews(4),
    supa.from("issues").select("tags").eq("status", "active").order("hot_score", { ascending: false, nullsFirst: false }).limit(40),
  ]);
  const freq: Record<string, number> = {};
  for (const r of (tagRows.data || [])) for (const t of (r.tags || [])) { const k = String(t).trim(); if (k) freq[k] = (freq[k] || 0) + 1; }
  const hotTags = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t]) => t);
  return { topic: topic || null, 뜨는것: hot, 최신뉴스: news, 인기태그: hotTags };
}

// ── 툴 스키마(OpenAI function-calling) ──────────────────────
const TOOLS = [
  { type: "function", function: { name: "hot_issues", description: "지금 갈라에서 가장 뜨거운 이슈 목록(찬반 수 포함). '오늘 핫이슈' 류 질문에.", parameters: { type: "object", properties: { limit: { type: "integer" } } } } },
  { type: "function", function: { name: "search_content", description: "플랫폼 전체 검색(이슈/예측/뉴스/갈라리 글). 특정 키워드·주제를 찾을 때.", parameters: { type: "object", properties: { query: { type: "string" }, kinds: { type: "array", items: { type: "string", enum: ["issue", "predict", "news", "post"] } } }, required: ["query"] } } },
  { type: "function", function: { name: "issue_pulse", description: "특정 이슈의 여론(찬반 비율·대표 댓글) 상세. id 또는 제목으로.", parameters: { type: "object", properties: { id: { type: "string" }, title: { type: "string" } } } } },
  { type: "function", function: { name: "list_predictions", description: "진행 중인 예측(베팅) 마켓 목록.", parameters: { type: "object", properties: { limit: { type: "integer" } } } } },
  { type: "function", function: { name: "galla_news", description: "최신 갈라뉴스(AI 종합 기사) 목록.", parameters: { type: "object", properties: { limit: { type: "integer" } } } } },
  { type: "function", function: { name: "creator_brief", description: "창작 재료 브리핑 — 지금 뜨는 이슈+최신 뉴스+인기 해시태그를 한 번에. 소재추천·글감·제목 아이디어를 낼 때 먼저 호출.", parameters: { type: "object", properties: { topic: { type: "string", description: "특정 주제로 좁힐 때(선택)" } } } } },
  // ── 클라이언트 행동(실행은 프론트에서, 서버는 요청만 반환) ──
  { type: "function", function: { name: "open_screen", description: "유저를 특정 화면으로 데려간다. target: 홈=home, 예측=predict, 검색=search, 메시지=dm, 마이=mypage, 특정이슈=issue:<id>, 특정예측=market:<id>, 특정뉴스=news:<id>.", parameters: { type: "object", properties: { target: { type: "string" }, label: { type: "string", description: "버튼에 보일 짧은 문구" } }, required: ["target"] } } },
  { type: "function", function: { name: "start_creation", description: "작성창을 완성 초안으로 채워 연다(발행은 유저가 확인). 크리에이터 요청('글 써줘/이슈 만들어줘/예측 만들어줘')엔 반드시 이 툴로 '진짜 완성된 초안'을 넣어라 — 제목·한줄·본문을 실제로 다 써서. kind: 갈라이슈=galla, 광장글=plaza, 예측=predict.", parameters: { type: "object", properties: {
      kind: { type: "string", enum: ["galla", "plaza", "predict"] },
      title: { type: "string", description: "제목(최종 1안)" },
      oneLine: { type: "string", description: "한줄요약(갈라이슈용, 선택)" },
      body: { type: "string", description: "본문 전체. 자연스러운 완성글. 마지막 줄에 추천 해시태그 3~5개를 #형식으로." },
      category: { type: "string", description: "카테고리(선택)" },
      tags: { type: "array", items: { type: "string" }, description: "추천 해시태그(# 없이)" },
    }, required: ["kind", "title", "body"] } } },
];

async function runTool(name: string, args: any): Promise<{ result?: any; action?: any }> {
  switch (name) {
    case "hot_issues": return { result: await hotIssues(args?.limit) };
    case "search_content": return { result: await searchContent(args?.query, args?.kinds) };
    case "issue_pulse": return { result: await issuePulse(args?.id, args?.title) };
    case "list_predictions": return { result: await listPredictions(args?.limit) };
    case "galla_news": return { result: await gallaNews(args?.limit) };
    case "creator_brief": return { result: await creatorBrief(args?.topic) };
    case "open_screen": return { action: { kind: "navigate", target: String(args?.target || ""), label: args?.label || "" } };
    case "start_creation": return { action: { kind: "compose", composeKind: args?.kind, title: args?.title || "", oneLine: args?.oneLine || "", body: args?.body || "", category: args?.category || "", tags: Array.isArray(args?.tags) ? args.tags.slice(0, 6) : [] } };
    default: return { result: { error: "unknown_tool" } };
  }
}

const SYS = `너는 '갈라비스'. GALLA(갈라) 플랫폼 안에 상주하는 유저 개인 AI 에이전트다.
GALLA는 여론·예측·커뮤니티가 섞인 한국 플랫폼: 이슈(찬반 배틀), 예측(GP 베팅), 갈라뉴스, 광장/갈라리(글·영상).
성격: 똑똑하고 빠르고 살짝 능글맞은 갈라 톤. 말은 짧고 명료하게. 존댓말+반말 섞인 친근체, 이모지는 최소.
원칙:
- 숫자·사실은 반드시 툴로 확인해서 말한다. 지어내지 마라.
- 질문에 답할 땐 관련 화면으로 데려다주는 open_screen을 적극 제안·호출해라.
- 답변은 3~5문장 이내. 필요하면 불릿. 장황 금지.
- 모르면 검색(search_content)부터. 그래도 없으면 솔직히 없다고.

크리에이터 모드(가장 중요):
너는 갈라 크리에이터의 창작 파트너다. "글감 없어" "뭐 쓰지" "이걸로 글 써줘" "이슈/예측 만들어줘" 류가 오면:
1) 먼저 creator_brief(필요시 topic)로 지금 뜨는 소재·인기 태그를 파악한다.
2) 채팅엔 짧게: 추천 소재 1~2개 + 제목 후보 3안을 불릿으로 제시한다.
3) 그리고 start_creation을 호출해 '진짜 완성된 초안'을 작성창에 넣는다 — 제목(최종 1안), (갈라이슈면)한줄요약, 본문 전체(도입-쟁점-양쪽 입장-질문 순으로 자연스럽게, 갈라 톤), 마지막 줄 해시태그 3~5개, 카테고리, tags까지 실제로 다 채워서.
4) 본문은 절대 뼈대만 주지 마라. 바로 발행해도 될 완성도로 써라. 발행 버튼은 유저가 누른다고 한 줄 덧붙여라.
- 갈라이슈(galla)는 찬반이 갈리는 논쟁 주제, 광장(plaza)은 자유글, 예측(predict)은 미래 결과 베팅 질문에 맞춰 형식을 잡아라.`;

async function chatOnce(messages: any[]) {
  const r = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages, tools: TOOLS, temperature: 0.5, max_tokens: 700 }),
  });
  if (!r.ok) throw new Error("llm_" + r.status + ":" + (await r.text()).slice(0, 200));
  return await r.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    // 로그인 유저만(비용 통제). Authorization 베어러 검증.
    const auth = req.headers.get("Authorization") || "";
    const jwt = auth.replace(/^Bearer\s+/i, "");
    const { data: u } = await supa.auth.getUser(jwt);
    if (!u || !u.user) return new Response(JSON.stringify({ ok: false, reason: "auth" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });

    if (!(await aiBudgetOk())) return new Response(JSON.stringify({ ok: false, reason: "budget", reply: "오늘 갈라비스가 좀 지쳤어. 잠시 뒤에 다시 불러줘." }), { headers: { ...cors, "Content-Type": "application/json" } });

    const body = await req.json().catch(() => ({}));
    const userMsg = String(body?.message || "").slice(0, 1200);
    const history = Array.isArray(body?.history) ? body.history.slice(-8) : [];
    if (!userMsg) return new Response(JSON.stringify({ ok: false, reason: "empty" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });

    // 유저 컨텍스트(닉네임)
    let nick = "";
    try { const { data: p } = await supa.from("users").select("nickname").eq("id", u.user.id).maybeSingle(); nick = p?.nickname || ""; } catch { /* noop */ }

    const messages: any[] = [
      { role: "system", content: SYS + (nick ? `\n지금 대화 상대 닉네임: ${nick}` : "") },
      ...history.filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
                .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 800) })),
      { role: "user", content: userMsg },
    ];

    const actions: any[] = [];
    let reply = "";
    for (let step = 0; step < 6; step++) {
      const j = await chatOnce(messages);
      const msg = j?.choices?.[0]?.message;
      if (!msg) break;
      messages.push(msg);
      const calls = msg.tool_calls || [];
      if (!calls.length) { reply = msg.content || ""; break; }
      for (const c of calls) {
        let args: any = {}; try { args = JSON.parse(c.function?.arguments || "{}"); } catch { /* noop */ }
        const out = await runTool(c.function?.name, args);
        if (out.action) actions.push(out.action);
        messages.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(out.action ? { queued: true } : (out.result ?? {})) });
      }
    }
    if (!reply) reply = "음, 잠깐 헷갈렸어. 다시 물어봐 줄래?";

    return new Response(JSON.stringify({ ok: true, reply, actions }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, reason: "error", detail: String(e).slice(0, 300) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
