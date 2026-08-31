/* 🎓 자동 교사 증류 — 실유저가 불만 표시한 갈비스 응답(sft_samples.reward<=-2)을
   매일 교사 모델이 '이상적인 답'으로 재생성해 고품질 SFT 샘플로 변환(RLHF 라이트의 정답 생성부).
   교사 = Gemini(다른 모델 계열 = 자기증류 붕괴 회피) 우선, 실패 시 DeepSeek 자기비평 폴백.
   외부 도구 데이터(실제 가게명·영상제목)가 필요한 자리는 지어내지 않고 skip.
   크론(매일 UTC 20:00, 보상 갱신 크론 19:30 뒤)이 호출. 원본엔 tags+='distilled'로 재처리 방지. */
import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CRON_KEY = Deno.env.get("CRON_SECRET") || "";
const GEM_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const GEM_MODEL = Deno.env.get("DISTILL_MODEL") || "gemini-2.5-flash";
const _DS = Deno.env.get("DEEPSEEK_API_KEY") || "";
const DS_BASE = _DS ? "https://api.deepseek.com" : "https://api.openai.com/v1";
const DS_KEY = _DS || Deno.env.get("OPENAI_API_KEY") || "";
const DS_MODEL = _DS ? "deepseek-chat" : "gpt-4o-mini";
const MAX_PER_RUN = 20;   // 런당 상한(비용 통제)

const RULES = `너는 '갈비스'(한국 앱 갈라의 AI 친구) 대화 품질 교사다. 아래 대화의 마지막 갈비스 답이 유저 불만을 샀다(실사용 부정 반응).
마지막 갈비스 답 하나만 '이상적으로' 다시 써라. 갈비스 톤 규칙:
- 반말, 친구 말투, 짧게(1~3문장), ㅋㅋ 자연스럽게. 비서·상담사 말투 금지.
- "찾아볼게/잠깐만" 같은 미래약속 금지(할 거면 한 것처럼 결과로 말한다), "밑에 칩/버튼 눌러" UI지시 금지.
- 괄호 속마음·전략 노출 금지. 상대 기억에 없는 과거를 지어내 동조 금지. 같은 질문 반복 금지.
- 실제 가게명·영상제목·뉴스 같은 '외부 실데이터'가 반드시 필요한 답이면 지어내지 말고 skip=true.
JSON만 출력: {"skip":false,"reply":"...", "why":"한줄"} 또는 {"skip":true,"why":"한줄"}`;

function convoText(messages: any[]): string {
  return (messages || []).map((m: any) => (m.role === "user" ? "유저: " : "갈비스: ") + String(m.content || "")).join("\n");
}
function safeJson(t: string): any {
  try { return JSON.parse(t); } catch { /* */ }
  try { const m = (t || "").replace(/```(?:json)?/gi, "").match(/\{[\s\S]*\}/); if (m) return JSON.parse(m[0]); } catch { /* */ }
  return null;
}

async function teachGemini(convo: string, reward: number): Promise<any> {
  if (!GEM_KEY) return null;
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEM_MODEL}:generateContent?key=${GEM_KEY}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${RULES}\n\n[대화 — 마지막 답의 실사용 보상 ${reward}]\n${convo}\n\nJSON:` }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 400, responseMimeType: "application/json" },
      }),
    });
    const j = await r.json();
    return safeJson(j?.candidates?.[0]?.content?.parts?.[0]?.text || "");
  } catch { return null; }
}
async function teachDS(convo: string, reward: number): Promise<any> {
  if (!DS_KEY) return null;
  try {
    const r = await fetch(`${DS_BASE}/chat/completions`, {
      method: "POST", headers: { Authorization: `Bearer ${DS_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: DS_MODEL, temperature: 0.7, max_tokens: 400, response_format: { type: "json_object" },
        messages: [
          { role: "system", content: RULES },
          { role: "user", content: `[대화 — 마지막 답의 실사용 보상 ${reward}] json으로 답해.\n${convo}` },
        ],
      }),
    });
    const j = await r.json();
    return safeJson(j?.choices?.[0]?.message?.content || "");
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (CRON_KEY && req.headers.get("x-cron-key") !== CRON_KEY) {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.includes(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "@@")) return new Response("forbidden", { status: 403 });
  }
  try {
    const { data: rows } = await sb.from("sft_samples")
      .select("id, brain, ctx, messages, reward")
      .eq("source", "friend_chat").lte("reward", -2)
      .not("tags", "cs", "{distilled}")
      .order("reward", { ascending: true }).limit(MAX_PER_RUN);
    let done = 0, skipped = 0, failed = 0;
    for (const s of rows || []) {
      const msgs = Array.isArray(s.messages) ? s.messages : [];
      if (msgs.length < 2 || msgs[msgs.length - 1]?.role !== "assistant") { failed++; continue; }
      const convo = convoText(msgs).slice(0, 4000);
      const out = (await teachGemini(convo, s.reward)) || (await teachDS(convo, s.reward));
      // 원본은 결과와 무관하게 재처리 방지 마킹(교사 둘 다 죽은 실패만 다음 런에 재시도)
      if (out) {
        try { await sb.rpc("sft_mark_distilled", { p_id: s.id }); } catch { /* */ }
      }
      if (!out) { failed++; continue; }
      if (out.skip || !out.reply || String(out.reply).trim().length < 2) { skipped++; continue; }
      const better = [...msgs.slice(0, -1), { role: "assistant", content: String(out.reply).slice(0, 600) }];
      try {
        await sb.from("sft_samples").insert({
          source: "distill_auto", brain: s.brain || "companion",
          ctx: { ...(s.ctx || {}), orig_id: s.id, why: String(out.why || "").slice(0, 120) },
          messages: better, turns: better.length, quality_score: 92, reward: 0,
          tags: ["teacher", "auto"],
        });
        done++;
      } catch { failed++; }
    }
    return new Response(JSON.stringify({ ok: true, candidates: (rows || []).length, distilled: done, skipped, failed }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, detail: String(e).slice(0, 300) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
