// ⚖️ 갈라예측 자동 정산 (매시 40분 크론)
//  1) 이슈 연계 마켓: 마감 시점 투표수 판정 — 다수 진영 승리('예'=faction_a 승), 동률=환불
//  2) 일반 마켓: AI 심판(gpt-4o-mini) — 최근 뉴스 헤드라인을 근거로 예/아니오 판정.
//     '모름'이면 보류(다음 시간 재시도), 마감 48시간 경과에도 불가면 전액 환불.
//  predict_resolve(p_outcome_id null) = 환불 정산. 수동(관리자/생성자) 정산은 오버라이드로 유지.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type" };
// 💸 DEEPSEEK_API_KEY 시크릿만 넣으면 채팅이 DeepSeek(deepseek-chat)로 자동 전환(OpenAI 호환).
const _DS = Deno.env.get("DEEPSEEK_API_KEY") || "";
const CHAT_URL = _DS ? "https://api.deepseek.com/chat/completions" : "https://api.openai.com/v1/chat/completions";
const MODEL = _DS ? "deepseek-chat" : "gpt-4o-mini";
const OPENAI = _DS || Deno.env.get("OPENAI_API_KEY");
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const GRACE_MS = 48 * 3600e3;   // 판정 불가 유예

function tokenize(s: string): string[] {
  return (s || "").replace(/[^가-힣A-Za-z0-9 ]/g, " ").split(/\s+/)
    .filter((t) => t.length >= 2 && t.length <= 14).slice(0, 12);
}

/* 질문 토큰과 겹치는 최신 뉴스 헤드라인 수집 (AI 판정 근거) */
async function evidenceFor(question: string): Promise<string[]> {
  const toks = tokenize(question);
  const { data } = await sb.from("news_articles_raw")
    .select("title,published_at").order("published_at", { ascending: false }).limit(800);
  const scored = (data || []).map((n: any) => {
    const t = String(n.title || "");
    const hit = toks.filter((k) => t.includes(k)).length;
    return { t, hit };
  }).filter((x) => x.hit >= 1).sort((a, b) => b.hit - a.hit).slice(0, 14);
  return scored.map((x) => x.t);
}

/* AI 심판: '예' | '아니오' | '모름' */
/* AI 일일 상한 — 플랫폼 전체 하루 예산(app_settings.ai_daily_caps)에서 1건 당긴다.
   한도 초과면 false로 AI 호출을 건너뛴다. DB가 죽었을 땐 통과시킨다(예산 조회 실패로 기능을 멈추지 않게). */
const AI_FN = "predict-auto-resolve";
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

async function judge(question: string, description: string, closeAt: string, evidence: string[]): Promise<string> {
  if (!(await aiBudgetOk())) return "모름";
  if (!OPENAI) return "모름";
  const r = await fetch(CHAT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI}` },
    body: JSON.stringify({
      model: MODEL, temperature: 0, response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `너는 예측시장 정산 심판이다. 질문의 실제 결과를 '근거 뉴스'에 비추어 판정한다.
- 근거가 명확히 '예'를 지지하면 "예", 명확히 '아니오'를 지지하면 "아니오".
- 근거가 부족하거나 애매하면 반드시 "모름" (추측 금지 — 틀린 판정보다 보류가 낫다).
- 마감이 이미 지났는데 사건 발생 근거가 전혀 없으면, '~할까?'류 발생형 질문은 "아니오"로 판정해도 된다.
- JSON만 출력: {"verdict":"예|아니오|모름","why":"한 문장"}` },
        { role: "user", content: `오늘: ${new Date().toISOString().slice(0, 10)}
질문: ${question}
정산 기준: ${description || "(없음)"}
마감: ${closeAt}
근거 뉴스:
${evidence.length ? evidence.map((e) => "- " + e).join("\n") : "(관련 뉴스 없음)"}` },
      ],
    }),
  });
  const j = await r.json();
  try {
    const v = JSON.parse(j.choices[0].message.content)?.verdict;
    return ["예", "아니오"].includes(v) ? v : "모름";
  } catch { return "모름"; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  // 🔒 크론 전용 게이트 — pg_cron이 보내는 x-cron-secret과 불일치면 거부(anon의 비용·무결성 남용 차단).
  //    ⚠️ CRON_SECRET env 미설정 시엔 통과(안전망): 시크릿 유실로 크론이 통째로 죽는 사고 방지.
  const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
  if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
  }
  const now = Date.now();
  const { data: due } = await sb.from("markets")
    .select("id,question,description,close_at,issue_id,market_type")
    .eq("resolved", false).lte("close_at", new Date(now).toISOString())
    .order("close_at").limit(20);

  const results: Record<string, unknown>[] = [];
  for (const m of due || []) {
    try {
      const { data: outs } = await sb.from("market_outcomes")
        .select("id,label,sort_order").eq("market_id", m.id).order("sort_order");
      const yes = (outs || []).find((o: any) => o.sort_order === 0);
      const no = (outs || []).find((o: any) => o.sort_order === 1);
      let outcomeId: number | null = null;
      let how = "";

      if (m.issue_id) {
        // 이슈 연계: 마감 시점 다수 진영 (질문 = "faction_a 진영이 이길까?")
        const { data: iss } = await sb.from("issues").select("pro_count,con_count").eq("id", m.issue_id).maybeSingle();
        const pro = iss?.pro_count || 0, con = iss?.con_count || 0;
        if (pro === con) { outcomeId = null; how = `issue_tie ${pro}:${con}`; }
        else { outcomeId = pro > con ? yes?.id : no?.id; how = `issue_votes ${pro}:${con}`; }
      } else if (m.market_type === "binary" && yes && no) {
        // AI 심판 (이진만 — 다중은 근거 판정이 어려워 유예 후 환불)
        const ev = await evidenceFor(m.question);
        const v = await judge(m.question, m.description, m.close_at, ev);
        if (v === "예") { outcomeId = yes.id; how = "ai:예"; }
        else if (v === "아니오") { outcomeId = no.id; how = "ai:아니오"; }
        else if (now - new Date(m.close_at).getTime() > GRACE_MS) { outcomeId = null; how = "ai:모름→환불"; }
        else { results.push({ id: m.id, skip: "ai:모름(유예)" }); continue; }
      } else {
        // 다중 선택지: 자동 판정 불가 → 유예 후 환불 (생성자 수동 정산 우선)
        if (now - new Date(m.close_at).getTime() > GRACE_MS) { outcomeId = null; how = "multi→환불"; }
        else { results.push({ id: m.id, skip: "multi(유예)" }); continue; }
      }

      const { data: r, error } = await sb.rpc("predict_resolve", { p_market_id: m.id, p_outcome_id: outcomeId });
      results.push({ id: m.id, how, r: error ? String(error.message) : r });
    } catch (e) {
      results.push({ id: m.id, err: String(e).slice(0, 120) });
    }
  }
  return new Response(JSON.stringify({ ok: true, due: (due || []).length, results }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
