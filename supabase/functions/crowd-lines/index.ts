// 🏳️ 예측 깃발 진영 말풍선 생성 — 딥시크로 그 예측의 주제·선택지에 맞춘 대사를 한 번 만들어 market_crowd_lines 에 저장.
//   (26.9.20 사장님: 「말풍선 예시 다양하게, 기왕이면 주제에 해당하는 대화들이 오갈 수 있는 시스템」)
//   화면(js/predict-crowd.js)은 이 대사와 공용 창고(js/predict-lines.js)를 섞어 쓴다.
//   이슈 줄다리기의 tug-lines 와 같은 구조 — 다른 점은 선택지가 여럿이라 「선택지별 대사(by_label)」가 있다는 것.
// ⚖️ 실존 인물 실명·비방·허위사실 금지(명예훼손), 지역·성별·장애·인종 비하 금지. 센 욕은 초성만(스토어 심사).
// ⚠️ 돈 거는 말투(판돈·배당·올인 등)는 쓰지 않는다 — 스토어 용어 정책.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const DS_KEY = Deno.env.get("DEEPSEEK_API_KEY") || "";
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

/* 한 번 더 거르는 비하어(프롬프트를 뚫고 나오면 그 줄만 버린다) */
const BAN = /(애미|애비|느금|니미|엠창|장애인|애자|틀딱|한남|김치녀|된장녀|짱깨|쪽바리|홍어|전라디언|개독|급식충|맘충|흑형|깜둥|정신병자|찐따|미개|늙은이|노인네|할망구|영감탱|틀니|잼민|치매|정신병|사이코|싸이코|장애)/;
/* 사행성 어휘 — 스토어 심사에서 걸린다(memory: 스토어 용어 정책) */
const GAMBLE = /(판돈|배당|올인|베팅|배팅|도박|잭팟|한탕|먹튀|따먹|칩스택|환전)/;

const SYS = `너는 한국 커뮤니티 감성의 병맛 드립 작가다. 여론 앱 '갈라'의 예측 화면에서, 선택지마다 깃발이 하나씩 서 있고
그 깃발 아래 사람들이 모여 "우리 쪽으로 오라"고 호객하며 서로를 긁는다.
너는 그 사람들이 외치는 말풍선 한마디들을 쓴다. 핵심은 예측 주제를 비틀어 웃기게 만드는 것.
점잖으면 실패다. 설명·분석 문장 금지. 커뮤 댓글처럼 짧고 세게.
말투 예시(이 정도 수위와 맛):
- "이쪽 안 오면 내일 후회한다"
- "저 깃발은 이미 접었더라ㅋㅋ"
- "긁혔냐? 깃발 떨리는 거 다 보인다"
- "ㅈㄴ 확신하는데 여기야"
- "우리 편 오면 밤새 자랑거리 생김"
규칙:
- 한 줄 22자 이내. 반말. 한국어만(영어 단어 금지). ㅋㅋ·ㅠㅠ·!! 자유롭게.
- 예측 질문의 구체적 소재(사람 수·날짜·장소·상황·선택지 이름)를 비틀어 드립으로 넣어라. 절반 이상은 소재가 들어가야 한다.
- 욕은 초성으로만 30% 정도: ㅅㅂ, ㅈㄴ, ㅆ, ㅈㄹ, ㅁㅊ. ⚠️ 풀어 쓴 욕(시발·존나·썅·씹·좆·개새끼·지랄 등) 금지. 부모 욕은 초성으로도 금지.
- ⚠️ 돈·도박 말투 금지: 판돈, 배당, 올인, 베팅, 잭팟, 한탕, 환전 같은 단어를 쓰지 마라. "걸었다" 대신 "골랐다/섰다/붙었다"로 쓴다.
- ⚠️ 실존 인물의 이름·직함을 언급하지 마라. 실존 인물·단체를 욕하거나 사실처럼 단정하지 마라(명예훼손).
- ⚠️ 지역·성별·장애·인종·종교·나이·성적지향 비하 금지. 폭력·자해 조장 금지.
출력은 JSON 객체 하나만. 형태(값은 예시일 뿐, 반드시 새로 써라):
{"call":["이쪽으로 와"],"top":["거봐 내가 맞지"],"mid":["아직 안 끝났다"],"low":["아무도 없네"],
 "defect_leave":["나 저쪽 간다"],"defect_stay":["배신자!!"],"defect_welcome":["잘 왔어"],
 "duo":[["긁는 말","더 세게 받아치는 말"]],
 "by_label":{"선택지이름":["그 선택지 얘기하는 말"]}}
개수: call 14개, top·mid·low 각 12개, defect_* 각 8개, duo 14쌍, by_label 은 선택지마다 6개.
call = 아직 아무 데도 안 선 사람을 꼬시는 말 / top = 가장 붐비는 깃발이 우쭐대는 말 / mid = 중간에서 힘내는 말 /
low = 텅 빈 깃발에서 서럽고 웃긴 말 / defect_leave = 다른 깃발로 갈아타며 남기는 말 / defect_stay = 떠나는 사람 등 뒤에 던지는 야유 /
defect_welcome = 갈아타 온 사람을 맞는 말 / duo = 한 깃발이 긁고 다른 깃발이 더 세게 받아치는 대화 /
by_label = 선택지 이름별로, 그 선택지를 고른 사람들이 자기 선택지 내용을 들먹이며 하는 말(주어진 선택지 이름을 키로 그대로 쓸 것).`;

/* 풀어 쓴 욕 → 초성(프롬프트를 뚫고 나와도 화면엔 초성만) */
const soft = (t: string) => t
  .replace(/씨발|시발|씨바|시바|ㅆㅂ/g, "ㅅㅂ").replace(/존나|존내|졸라/g, "ㅈㄴ").replace(/썅|씹/g, "ㅆ")
  .replace(/개새끼|개새기|개색기/g, "ㄱㅅㄲ").replace(/새끼|색기/g, "ㅅㄲ").replace(/좆|좃/g, "ㅈ")
  .replace(/지랄/g, "ㅈㄹ").replace(/병신/g, "ㅂㅅ").replace(/미친놈|미친년/g, "ㅁㅊㄴ").replace(/염병/g, "ㅇㅂ");

const okLine = (x: string) => x.length >= 2 && x.length <= 26 && !BAN.test(x) && !GAMBLE.test(x) && !/[A-Za-z]{3,}/.test(x);
function clean(arr: unknown, max: number): string[] {
  if (!Array.isArray(arr)) return [];
  return arr.map((x) => soft(String(x || "").trim().replace(/^["'「]|["'」]$/g, ""))).filter(okLine).slice(0, max);
}
function cleanDuo(arr: unknown): string[][] {
  if (!Array.isArray(arr)) return [];
  return arr.filter((p) => Array.isArray(p) && p.length >= 2)
    .map((p) => [soft(String(p[0] || "").trim()), soft(String(p[1] || "").trim())])
    .filter(([a, b]) => okLine(a) && okLine(b)).slice(0, 16);
}
function cleanByLabel(o: unknown, labels: string[]) {
  const out: Record<string, string[]> = {};
  if (!o || typeof o !== "object") return out;
  for (const lb of labels) {
    const v = clean((o as any)[lb], 8);
    if (v.length) out[lb] = v;
  }
  return out;
}

async function gen(m: any, labels: string[]) {
  /* 온도가 높으면 가끔 JSON 이 깨진다(tug-lines 와 같은 함정) — 실패하면 낮춰서 한 번 더 */
  let last: unknown = null;
  for (const temp of [1.15, 0.9]) {
    try { return await genOnce(m, labels, temp); } catch (e) { last = e; }
  }
  throw last;
}
async function genOnce(m: any, labels: string[], temp: number) {
  const user = `예측 질문: ${m.question}
분야: ${m.category || ""}
설명: ${String(m.description || "").slice(0, 400)}
선택지: ${labels.join(" / ")}
마감: ${m.close_at || ""}`;
  const r = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST", headers: { Authorization: `Bearer ${DS_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "deepseek-chat", temperature: temp, max_tokens: 2800, response_format: { type: "json_object" },
      messages: [{ role: "system", content: SYS }, { role: "user", content: user }] }),
    signal: AbortSignal.timeout(60000),
  });
  const d = await r.json();
  const txt = String(d?.choices?.[0]?.message?.content || "").replace(/[\u0000-\u001f]+/g, " ");
  const o = JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1));
  const lines = {
    call: clean(o.call, 16), top: clean(o.top, 14), mid: clean(o.mid, 14), low: clean(o.low, 14),
    defect_leave: clean(o.defect_leave, 10), defect_stay: clean(o.defect_stay, 10), defect_welcome: clean(o.defect_welcome, 10),
    duo: cleanDuo(o.duo), by_label: cleanByLabel(o.by_label, labels),
  };
  const n = clean(o.call, 16).length + lines.top.length + lines.mid.length + lines.low.length + lines.duo.length +
    Object.values(lines.by_label).reduce((a, v) => a + v.length, 0);
  return { lines, n };
}

Deno.serve(async (req) => {
  if (!CRON_SECRET || (req.headers.get("x-cron-secret") || "") !== CRON_SECRET) return j({ ok: false, reason: "unauthorized" }, 401);
  if (!DS_KEY) return j({ ok: false, reason: "no_key" });
  const n = Math.min(Math.max(Number(new URL(req.url).searchParams.get("n") || "6"), 1), 12);
  const { data: done } = await sb.from("market_crowd_lines").select("market_id");
  const have = new Set((done || []).map((x: any) => x.market_id));
  /* 아직 안 끝난 예측만 — 끝난 판에 대사를 만들어 봐야 아무도 안 본다 */
  const { data: mk } = await sb.from("markets").select("id,question,category,description,close_at,resolved")
    .eq("resolved", false).order("id", { ascending: false }).limit(300);
  const todo = (mk || []).filter((x: any) => !have.has(x.id)).slice(0, n);
  const out: any[] = [];
  const t0 = Date.now();
  for (const m of todo) {
    if (Date.now() - t0 > 115_000) break;      // 엣지 150초 제한 — 남기고 다음 회차에(엣지 조용한 죽음 방지)
    try {
      const { data: ocs } = await sb.from("market_outcomes").select("label").eq("market_id", m.id).order("sort_order");
      const labels = (ocs || []).map((x: any) => String(x.label || "")).filter(Boolean);
      if (labels.length < 2) { out.push({ id: m.id, ok: false, reason: "no_outcomes" }); continue; }
      const { lines, n: cnt } = await gen(m, labels);
      if (cnt < 20) { out.push({ id: m.id, ok: false, n: cnt }); continue; }
      await sb.from("market_crowd_lines").upsert({ market_id: m.id, lines, model: "deepseek-chat" });
      out.push({ id: m.id, ok: true, n: cnt });
    } catch (e) { out.push({ id: m.id, ok: false, err: String(e).slice(0, 80) }); }
  }
  return j({ ok: true, done: out, left: Math.max(0, (mk || []).filter((x: any) => !have.has(x.id)).length - out.filter((o) => o.ok).length) });
});
