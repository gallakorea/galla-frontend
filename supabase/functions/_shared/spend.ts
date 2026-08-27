/* 💰 AI 원가 계측 — 공용 모듈
 *
 * 왜 공용으로 뺐나: 2026-08-28 기준 AI 를 부르는 엣지 함수 18개 중 **16개가 원가를 안 적고
 * 있었다**. galla-friend 와 reel-agent 만 적었다. 그래서 ai_spend 를 아무리 들여다봐도
 * "갈라뉴스가 한 달에 얼마 썼나"에 답할 수 없었다 — 크론은 유저 귀속이 없어 model_for 의
 * 예산 가드도 못 막는다. 브레이크도 계기판도 없는 경로가 16개였다는 뜻이다.
 *
 * 지금은 볼륨이 작아 안 아프지만, 갈라뉴스가 대량생산 시절(25,396건)로 돌아가면
 * 보이지 않는 곳에서 터진다. 그때도 ai_spend 는 ₩0 으로 찍힌다.
 *
 * 사용:
 *   import { logSpend } from "../_shared/spend.ts";
 *   const out = await r.json();
 *   logSpend("generate-galla-news", MODEL, null, out?.usage);
 *
 * ⚠️ await 하지 않는다 — 계측이 응답을 늦추면 안 된다. 실패는 조용히 삼킨다.
 * ⚠️ uid 는 유저 귀속이 있을 때만. 크론처럼 주인이 없으면 null 로 둔다(플랫폼 비용).
 */

const SUPA_URL = Deno.env.get("SUPABASE_URL") || "";
const SVC_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

/** OpenAI 호환 usage 를 받아 ai_spend 에 적는다. 캐시 히트는 따로 센다(원가가 1/10). */
export function logSpend(fn: string, model: string, uid: string | null, usage: any): void {
  if (!usage || !SUPA_URL || !SVC_KEY) return;
  const cache =
    Number(usage.prompt_cache_hit_tokens ?? usage.prompt_tokens_details?.cached_tokens ?? 0) || 0;
  const inTok = Math.max(0, (Number(usage.prompt_tokens ?? 0) || 0) - cache);
  const outTok = Number(usage.completion_tokens ?? 0) || 0;
  if (!inTok && !cache && !outTok) return;
  fetch(`${SUPA_URL}/rest/v1/rpc/ai_spend_add`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SVC_KEY, Authorization: `Bearer ${SVC_KEY}` },
    body: JSON.stringify({ p_fn: fn, p_model: model, p_uid: uid, p_in: inTok, p_cache: cache, p_out: outTok }),
  }).catch(() => { /* best effort — 계측 실패가 기능을 막으면 안 된다 */ });
}

/** Gemini 정식 창구(usageMetadata) → OpenAI 형태로 맞춰 적는다. */
export function logSpendGemini(fn: string, model: string, uid: string | null, meta: any): void {
  if (!meta) return;
  logSpend(fn, model, uid, {
    prompt_tokens: meta.promptTokenCount ?? 0,
    completion_tokens: (meta.candidatesTokenCount ?? 0) + (meta.thoughtsTokenCount ?? 0),
    prompt_tokens_details: { cached_tokens: meta.cachedContentTokenCount ?? 0 },
  });
}

/** 토큰이 없는 생성물(이미지·음성) — 건당 고정 원가를 '출력 토큰'으로 환산해 적는다.
 *  ⚠️ 토큰이 아니라 '건수'가 원가인 경로다. 안 적으면 제일 비싼 호출이 장부에서 사라진다. */
export function logSpendUnits(fn: string, model: string, uid: string | null, units: number, usdPerUnit = 0): void {
  // ⚠️ usdPerUnit 이 0 이어도 보낸다 — 단가를 모르는 경로는 '몇 번 돌았나'라도 남겨야
  //    나중에 청구서로 곱할 수 있다. "모르니 안 적는다"가 계측 공백의 정체였다.
  if (!units || !SUPA_URL || !SVC_KEY) return;
  fetch(`${SUPA_URL}/rest/v1/rpc/ai_spend_add_usd`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SVC_KEY, Authorization: `Bearer ${SVC_KEY}` },
    body: JSON.stringify({ p_fn: fn, p_model: model, p_uid: uid, p_usd: units * (usdPerUnit || 0), p_units: units }),
  }).catch(() => { /* best effort */ });
}
