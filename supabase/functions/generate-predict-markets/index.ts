// 🔮 매일 재밌고 자극적인 예측 마켓 5개 자동 생성
// gpt-4o-mini가 예/아니오 예측 질문 생성 → admin_create_market으로 삽입.
// 안전: 실존인물 명예훼손·혐오·불법·성인·자살 소재 배제. 위트있고 참여욕구 자극.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type" };
const OPENAI = Deno.env.get("OPENAI_API_KEY");

const CATS = ["정치·사회", "경제·투자", "직장·경력", "연애·결혼", "생활·일상", "패션·뷰티", "엔터·스포츠", "세계·여행", "음식·맛집", "기타"];

const SYS = `너는 한국 예측시장 '갈라예측'의 에디터다. 사람들이 포인트로 예/아니오 베팅하며 즐기는, 재밌고 도발적이고 지금 당장 궁금한 예측 질문을 만든다.
규칙:
- ★핵심: 반드시 '마감일(1~14일 내)'에 실제로 결과가 판가름 나는 주제만. 몇 달 뒤에나 결과가 나오는 주제(연말·크리스마스·다음 시즌 등) 절대 금지.
  좋은 예) "이번 주말 프로야구 관중 OO만 돌파?" "다음 주 발표 CPI 3%대?" "이번 주 개봉 영화 100만 관객?" "○○ 신곡 멜론 1위?" "이번 주 서울 낮 최고 35도 넘을까?"
- SNS에서 갑론을박할 만큼 도발적이고 위트있게. 찬반이 팽팽히 갈릴수록 좋다. 밈·바이럴·연예·스포츠·경제지표·날씨·테크 신제품·화제의 이벤트 등.
- 각 질문은 '예/아니오'로 명확히 판정 가능하고, description에 '무엇이 충족되면 예인지' 구체 기준(수치·날짜)을 적는다.
- 아래 금지: (1)특정 실존 인물 명예훼손·허위사실·사생활 (2)지역/성별/장애/인종 혐오 (3)정치 극단·선동 (4)불법·도박조장·성인 (5)자살·자해 (6)특정인의 사망·질병·범죄 예측.
- category는 다음 중 하나: ${CATS.join(" / ")}. 서로 다른 카테고리로 다양하게 정확히 5개.
- 반드시 아래 JSON만 출력:
  {"markets":[{"question":"...(예/아니오로 답하는 40자 내 질문)","description":"정산 기준 한 문장(수치·날짜 포함)","category":"...","close_days":5}, ... 정확히 5개]}`;

/* AI 일일 상한 — 플랫폼 전체 하루 예산(app_settings.ai_daily_caps)에서 1건 당긴다.
   한도 초과면 false로 AI 호출을 건너뛴다. DB가 죽었을 땐 통과시킨다(예산 조회 실패로 기능을 멈추지 않게). */
const AI_FN = "generate-predict-markets";
async function aiBudgetOk(n = 1): Promise<boolean> {
  try {
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/rpc/ai_budget_take`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ p_fn: AI_FN, p_n: n }),
    });
    if (!r.ok) return true;
    const j = await r.json();
    if (j && j.ok === false) { console.warn("[ai-budget] blocked", AI_FN, JSON.stringify(j)); return false; }
    return true;
  } catch { return true; }
}

async function gen(headlines: string[]) {
  if (!(await aiBudgetOk())) return null;
  const newsBlock = headlines.length
    ? `\n\n[참고: 최근 인기 뉴스 헤드라인 — 이 중 '베팅으로 즐길 만하고 근시일 내 판가름 나는' 주제를 골라 시의성 있게 활용해라(민감·비극·특정인 사건 헤드라인은 피하고, 경제지표·스포츠·날씨·연예·테크·트렌드 위주로)]\n- ${headlines.join("\n- ")}`
    : "";
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI}` },
    body: JSON.stringify({
      model: "gpt-4o-mini", temperature: 0.9, response_format: { type: "json_object" },
      messages: [{ role: "system", content: SYS }, { role: "user", content: `오늘 날짜: ${new Date().toISOString().slice(0, 10)}. 오늘의 예측 5개를 만들어줘.${newsBlock}` }],
    }),
  });
  const j = await r.json();
  try { return JSON.parse(j.choices[0].message.content); } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!OPENAI) return new Response(JSON.stringify({ ok: false, reason: "no_openai_key" }), { headers: { ...cors, "Content-Type": "application/json" } });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // 최근 인기 뉴스(갈라뉴스) 헤드라인을 참고자료로 → 시의성 있는 예측
  let headlines: string[] = [];
  try {
    const { data: news } = await sb.from("galla_news")
      .select("title").order("created_at", { ascending: false }).limit(30);
    const seen = new Set<string>();
    headlines = (news || []).map((n: any) => String(n.title || "").trim())
      .filter((t: string) => t && !seen.has(t) && seen.add(t)).slice(0, 24);
  } catch (_) {}

  const out = await gen(headlines);
  const rows = Array.isArray(out?.markets) ? out.markets.slice(0, 5) : [];
  let created = 0; const made: string[] = [];
  for (const m of rows) {
    const q = String(m?.question || "").trim();
    if (!q) continue;
    const cat = CATS.includes(m?.category) ? m.category : "기타";
    const days = Math.min(Math.max(parseInt(m?.close_days, 10) || 7, 1), 14);
    const closeAt = new Date(Date.now() + days * 86400e3);
    // 마감 시각을 그 날 21:00 KST(=12:00 UTC)로 정렬
    closeAt.setUTCHours(12, 0, 0, 0);
    // 매일 첫 마켓은 '오늘의 잭팟' — 플랫폼 보너스 5000GP 주입으로 몰입 유도
    const isJackpot = created === 0;
    const { data, error } = await sb.rpc("admin_create_market", {
      p_question: q.slice(0, 120),
      p_description: (m?.description ? String(m.description) : "").slice(0, 400) || null,
      p_category: cat,
      p_close_at: closeAt.toISOString(),
      p_is_jackpot: isJackpot,
      p_jackpot: isJackpot ? 5000 : 0,
    });
    if (!error && data) { created++; made.push(q); }
  }
  return new Response(JSON.stringify({ ok: true, created, news_used: headlines.length, made }), { headers: { ...cors, "Content-Type": "application/json" } });
});
