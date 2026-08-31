// 🧠 이슈 찬반 논점 생성 — 이슈 상세의 "AI 논점 카드"(양측 핵심 논거 한 줄씩)를 만들어 ai_news(mode='argument')에 저장.
// ⚠️ 리포에 소스가 없던 레거시 배포 함수(2026-08-08 QA에서 500 발견) — DeepSeek 우선/OpenAI 폴백으로 재작성.
import { createClient } from "jsr:@supabase/supabase-js@2.112.4";

import { logSpend } from "../_shared/spend.ts";

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const API_KEY = Deno.env.get("DEEPSEEK_API_KEY") || Deno.env.get("OPENAI_API_KEY") || "";
const BASE_URL = Deno.env.get("DEEPSEEK_API_KEY") ? "https://api.deepseek.com" : "https://api.openai.com/v1";
const MODEL = Deno.env.get("DEEPSEEK_API_KEY") ? "deepseek-chat" : "gpt-4o-mini";
const supa = createClient(SUPA_URL, SERVICE);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};


/* 💰 일일 예산 상한. app_settings.ai_daily_caps 의 이 함수 이름 항목을 읽고,
   ai_budget_usage 에 행 잠금으로 카운트를 올린다(동시 호출에도 천장을 안 넘는다).
   ⚠️ 2026-08-31 감사에서 이 함수가 상한을 **한 번도 안 읽고 있었다**는 걸 발견했다.
   ai_daily_caps 에 항목은 있는데 코드가 부르지 않아, 설정만 있고 실제로는 무제한이었다.
   유저가 직접 트리거하는 경로라 반복 호출로 원가가 무한히 늘 수 있었다. */
async function aiBudgetOk(fn: string, n = 1): Promise<boolean> {
  try {
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/rpc/ai_budget_take`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ p_fn: fn, p_n: n }),
    });
    if (!r.ok) return true;              // 예산 확인 실패로 기능을 멈추지는 않는다
    const j = await r.json();
    return j?.ok !== false;
  } catch { return true; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const issueId = Number(body?.issue_id);
    if (!Number.isFinite(issueId)) return json({ error: "issue_id required" }, 400);

    // 이미 있으면 재생성 안 함(폴링 스팸 방지)
    const { data: exist } = await supa.from("ai_news").select("stance").eq("issue_id", issueId).eq("mode", "argument");
    const hasPro = exist?.some((d) => d.stance === "pro"), hasCon = exist?.some((d) => d.stance === "con");
    if (hasPro && hasCon) return json({ ok: true, cached: true });

    if (!(await aiBudgetOk("generate-ai-arguments"))) return json({ ok: false, reason: "daily_cap" }, 429);

    const title = String(body?.title || "").slice(0, 200);
    const desc = String(body?.description || body?.one_line || "").slice(0, 800);
    if (!title) return json({ error: "title required" }, 400);

    const r = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL, temperature: 0.6, max_tokens: 220,
        messages: [
          { role: "system", content: `너는 찬반 토론 플랫폼의 중립 진행자다. 이슈의 찬성 측과 반대 측 각각의 '가장 설득력 있는 핵심 논점'을 한 문장씩 써라. 사실 날조·인신공격 금지, 각 60자 이내, 서로 진짜 대립되게. JSON만 출력: {"pro":"찬성 측 논점 한 문장","con":"반대 측 논점 한 문장"}` },
          { role: "user", content: `이슈: ${title}\n배경: ${desc}` },
        ],
      }),
    });
    if (!r.ok) return json({ error: "llm_" + r.status }, 502);
    const _j = await r.json();
    logSpend("generate-ai-arguments", MODEL, null, _j?.usage);   // 💰 원가 장부
    const m = /\{[\s\S]*\}/.exec(_j?.choices?.[0]?.message?.content || "");
    const o = m ? JSON.parse(m[0]) : null;
    if (!o?.pro || !o?.con) return json({ error: "parse" }, 502);

    const rows = [];
    if (!hasPro) rows.push({ issue_id: issueId, mode: "argument", stance: "pro", title: String(o.pro).slice(0, 200), summary: "", source: "AI" });
    if (!hasCon) rows.push({ issue_id: issueId, mode: "argument", stance: "con", title: String(o.con).slice(0, 200), summary: "", source: "AI" });
    const { error } = await supa.from("ai_news").insert(rows);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e).slice(0, 200) }, 500);
  }
});

function json(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
}
