// 🎨 창작 품질 벤치 — 고정 주제로 '원샷 vs 파이프라인' 초안을 만들어 편집장 루브릭으로 채점, 주간 추이 기록.
// 파이프라인 개악(프롬프트 수정으로 점수 하락)을 감으로 안 보고 수치로 잡는다. 크론(주1회, x-cron-key) 전용.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_KEY = Deno.env.get("CRON_SECRET") || "";
const API_KEY = Deno.env.get("DEEPSEEK_API_KEY") || Deno.env.get("OPENAI_API_KEY") || "";
const BASE_URL = Deno.env.get("DEEPSEEK_API_KEY") ? "https://api.deepseek.com" : "https://api.openai.com/v1";
const MODEL = Deno.env.get("DEEPSEEK_API_KEY") ? "deepseek-chat" : "gpt-4o-mini";
const supa = createClient(SUPA_URL, SERVICE);

const TOPICS = [
  "주4일제 도입", "배달앱 팁 문화", "국민연금 개혁", "AI가 그린 그림의 저작권",
  "지하철 노약자석 임산부 양보", "월급 300 직장인 vs 사장님 마인드",
];
const FIELDS = `{"title":"이슈 제목(80자, 중립·논쟁유발)","one_line":"한 줄 요약","description":"배경 3~4문장","faction_a":"찬성 라벨(20자)","faction_b":"반대 라벨(20자)"}`;
const RUBRIC = "①제목 훅(스크롤 멈춤·구체성) ②찬반 팽팽함(51:49) ③참여 유발(한마디 얹고 싶은가) ④안전(루머·인신공격 0)";
const STYLES = ["훅 극대화 — 제목·첫 문장을 더 세게", "선명함 극대화 — 쟁점 첨예하게·라벨 찰지게", "공감·구어체 극대화 — 밈·일상 언어로"];

async function llm(system: string, user: string, temp: number, maxTok: number): Promise<any | null> {
  try {
    const r = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST", headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, temperature: temp, max_tokens: maxTok, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
    });
    if (!r.ok) return null;
    const m = /\{[\s\S]*\}/.exec((await r.json())?.choices?.[0]?.message?.content || "");
    return m ? JSON.parse(m[0]) : null;
  } catch { return null; }
}
const writerSys = `너는 갈라(찬반 여론 플랫폼)의 콘텐츠 작가다. JSON만 출력: ${FIELDS}`;

async function score(draft: any): Promise<number> {
  const s = await llm(`너는 갈라 편집장이다. 초안을 루브릭(${RUBRIC})으로 0~10 채점해라. JSON만: {"score": 숫자}`,
    JSON.stringify(draft).slice(0, 800), 0, 30);
  const n = Number(s?.score);
  return Number.isFinite(n) ? Math.max(0, Math.min(10, n)) : 0;
}

Deno.serve(async (req) => {
  if (CRON_KEY && req.headers.get("x-cron-key") !== CRON_KEY) return new Response("nope", { status: 401 });
  const detail: any[] = [];
  let sumP = 0, sumB = 0, n = 0;
  for (const topic of TOPICS) {
    try {
      const baseline = await llm(writerSys, `주제: ${topic}. 이슈 초안을 써라.`, 0.8, 450);
      const cands = (await Promise.all(STYLES.map((st) =>
        llm(writerSys, `주제: ${topic}. 이슈 초안을 써라. 방향: ${st}`, 1.0, 450)))).filter(Boolean);
      const judged = cands.length
        ? await llm(`너는 갈라 편집장이다. 후보를 루브릭(${RUBRIC})으로 채점해 최고안을 다듬어 완성해라. JSON만: {"best": ${FIELDS}}`,
          cands.map((c, i) => `후보${i}: ${JSON.stringify(c).slice(0, 600)}`).join("\n"), 0.2, 500)
        : null;
      const pipe = judged?.best || baseline;
      if (!baseline || !pipe) continue;
      const [sb, sp] = [await score(baseline), await score(pipe)];
      sumB += sb; sumP += sp; n++;
      detail.push({ topic, baseline: sb, pipeline: sp, title: pipe?.title });
    } catch { /* 주제 하나 실패해도 계속 */ }
  }
  const avg = n ? +(sumP / n).toFixed(2) : null, base = n ? +(sumB / n).toFixed(2) : null;
  await supa.from("craft_bench_runs").insert({ avg_score: avg, baseline_score: base, detail });
  return new Response(JSON.stringify({ ok: true, n, pipeline: avg, baseline: base }), { headers: { "Content-Type": "application/json" } });
});
