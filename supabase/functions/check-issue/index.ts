/* 🛡️ check-issue — 발행 전 적합성 검사(무료). 유료 생성형 AI 미사용.
   ① 한국어 규칙 기반(개인정보 패턴·욕설·불법/도박 유도)
   ② OpenAI Moderation API(무료 엔드포인트 /v1/moderations — 혐오·폭력·선정성·자해·괴롭힘)
   → 위험도(안전/주의/위험) + 점수 + 문제항목[{field,severity,category,message,suggestion}].
   발행마다 1회만 호출(저빈도). 로그인 유저 검증 + 텍스트 길이 상한으로 남용 방지. */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI = Deno.env.get("OPENAI_API_KEY") || "";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

type Flag = { field: string; severity: "주의" | "위험"; category: string; message: string; suggestion: string };

/* ── 규칙 기반(무료) ── */
function ruleFlags(field: string, text: string): Flag[] {
  const out: Flag[] = [];
  const t = String(text || "");
  // 개인정보 노출 — 위험
  if (/\b\d{6}[-\s]?\d{7}\b/.test(t))
    out.push({ field, severity: "위험", category: "개인정보", message: "주민등록번호로 보이는 숫자가 있어요.", suggestion: "주민번호 등 개인 식별정보는 지워주세요." });
  if (/\b01[016-9][-\s]?\d{3,4}[-\s]?\d{4}\b/.test(t))
    out.push({ field, severity: "위험", category: "개인정보", message: "휴대폰 번호로 보이는 숫자가 있어요.", suggestion: "타인의 연락처는 공개하지 마세요." });
  if (/\b\d{2,3}[-\s]?\d{2,6}[-\s]?\d{2,6}\b/.test(t) && /(계좌|카드|입금|송금)/.test(t))
    out.push({ field, severity: "위험", category: "개인정보", message: "계좌·카드 번호로 보이는 정보가 있어요.", suggestion: "금융 정보는 공개하지 마세요." });
  // 불법·도박 유도 — 주의(갈라 자체 예측/GP는 오검 방지 위해 '실제 돈' 신호가 있을 때만)
  if (/(토토|사설|배당률).{0,20}(입금|충전|가입|계좌)|불법\s*도박|(마약|필로폰|대마)\s*(판매|삽니다|팝니다)/.test(t))
    out.push({ field, severity: "위험", category: "불법/도박", message: "불법 도박·거래 유도로 보이는 표현이 있어요.", suggestion: "불법 행위 유도는 발행할 수 없어요." });
  // 욕설·모욕 — 주의(대표적 비속어만; 문맥 판단은 Moderation이 보완)
  if (/(씨발|시발|개새끼|병신|좆|썅|지랄|엿먹|닥쳐)/.test(t))
    out.push({ field, severity: "주의", category: "욕설/모욕", message: "비속어가 포함돼 있어요.", suggestion: "표현을 순화하면 더 많은 사람에게 닿아요." });
  return out;
}

/* ── OpenAI Moderation(무료) ── */
const MOD_MAP: Record<string, { category: string; label: string }> = {
  "hate": { category: "혐오/차별", label: "혐오·차별 표현" },
  "hate/threatening": { category: "혐오/차별", label: "혐오·위협 표현" },
  "harassment": { category: "괴롭힘/모욕", label: "괴롭힘·모욕 표현" },
  "harassment/threatening": { category: "괴롭힘/모욕", label: "위협적 괴롭힘" },
  "sexual": { category: "선정성", label: "성적 표현" },
  "sexual/minors": { category: "선정성", label: "미성년 성적 표현(중대)" },
  "violence": { category: "폭력", label: "폭력적 표현" },
  "violence/graphic": { category: "폭력", label: "잔혹·유혈 묘사" },
  "self-harm": { category: "자해", label: "자해 관련 표현" },
  "self-harm/intent": { category: "자해", label: "자해 의도 표현" },
  "illicit": { category: "불법", label: "불법 행위 표현" },
};
async function moderationFlags(text: string): Promise<Flag[]> {
  if (!OPENAI || !text.trim()) return [];
  try {
    const r = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENAI}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "omni-moderation-latest", input: text.slice(0, 4000) }),
    });
    if (!r.ok) return [];
    const d = await r.json();
    const res = d?.results?.[0];
    if (!res) return [];
    const scores: Record<string, number> = res.category_scores || {};
    const out: Flag[] = [];
    const seen = new Set<string>();
    for (const [k, m] of Object.entries(MOD_MAP)) {
      const sc = scores[k] || 0;
      if (sc < 0.35) continue;
      if (seen.has(m.category)) continue;      // 카테고리당 1개(가장 강한 것)
      seen.add(m.category);
      const sev: "주의" | "위험" = (sc >= 0.6 || k === "sexual/minors") ? "위험" : "주의";
      out.push({ field: "전체", severity: sev, category: m.category, message: `${m.label}이(가) 감지됐어요 (${Math.round(sc * 100)}%).`, suggestion: sev === "위험" ? "해당 표현을 빼거나 순화해야 발행이 안전해요." : "표현을 다듬어 오해를 줄여보세요." });
    }
    return out;
  } catch (_) { return []; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return j({ ok: false, reason: "method" }, 405);

  const body = await req.json().catch(() => ({}));
  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u } = await admin.auth.getUser(bearer);
  if (!u?.user) return j({ ok: false, reason: "unauthorized" }, 401);

  const title = String(body.title || "").slice(0, 300);
  const one = String(body.one_line || "").slice(0, 300);
  const desc = String(body.description || "").slice(0, 4000);
  const all = [title, one, desc].filter(Boolean).join("\n");
  if (!all.trim()) return j({ ok: true, risk_level: "안전", risk_score: 0, flags: [] });

  const flags: Flag[] = [
    ...ruleFlags("title", title),
    ...ruleFlags("one_line", one),
    ...ruleFlags("description", desc),
    ...(await moderationFlags(all)),
  ];

  const hasWi = flags.some(f => f.severity === "위험");
  const hasJu = flags.some(f => f.severity === "주의");
  const risk_level = hasWi ? "위험" : hasJu ? "주의" : "안전";
  const risk_score = hasWi ? 70 + Math.min(29, flags.filter(f => f.severity === "위험").length * 12) : hasJu ? 30 + Math.min(29, flags.length * 8) : 3;

  return j({ ok: true, risk_level, risk_score, flags });
});
