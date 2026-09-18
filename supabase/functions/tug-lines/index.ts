// 🧠 이슈별 줄다리기 말풍선 생성 — 딥시크로 이슈 주제·두 진영에 맞춘 대사를 한 번 만들어 issue_tug_lines 에 저장.
//   (26.9.19 사장님: 「그 주제에 대해서 자동으로 나오게」, 비용: 이슈당 1원 미만)
//   화면(js/vote-bar.js)은 이 대사 절반 + 공용 창고(js/vote-lines.js) 절반을 섞어 쓴다.
// ⚖️ 실존 인물 실명·비방·허위사실 금지(명예훼손), 지역·성별·장애·인종 비하 금지. 욕은 상황·진영을 향한 가벼운 것만(사장님 결정).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const DS_KEY = Deno.env.get("DEEPSEEK_API_KEY") || "";
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

/* 한 번 더 거르는 비하어(프롬프트를 뚫고 나오면 그 줄만 버린다) */
const BAN = /(병신|장애인|애자|틀딱|한남|김치녀|된장녀|짱깨|쪽바리|홍어|전라디언|개독|급식충|맘충|흑형|깜둥|정신병자|찐따|미개|늙은이|노인네|할망구|영감탱|틀니|잼민|년아|놈아 늙)/;
const SYS = `너는 한국 커뮤니티 감성의 병맛 드립 작가다. 여론 앱 '갈라'에서 이슈 하나를 두고 두 진영이 밧줄을 당긴다.
각 진영 사람들이 외치는 말풍선 한마디를 쓴다. 핵심은 "상대 진영을 긁는 것" — 약 올리고, 도발하고, 병맛으로 웃기게.
절대 점잖으면 안 된다. 토론·설명 문장 금지("기본 예의 지키자" 같은 말 = 실패). 커뮤 댓글처럼 짧고 세게.
말투 예시(이 정도 수위와 맛):
- "긁혔냐?ㅋㅋ 줄 떨리는 거 다 보여"
- "시발 전세 사기보다 이 줄이 더 무섭다"
- "니네 논리 방금 줄에 걸려 넘어짐ㅋ"
- "존나 억울하면 이기든가ㅋㅋ"
- "발작 버튼 눌렸네 부들부들"
- "우리 편 오면 사이다 무한리필"
규칙:
- 한 줄 22자 이내. 반말. 한국어만(영어 단어 금지). ㅋㅋ·ㅠㅠ·!! 자유롭게.
- 이슈의 구체적 소재(물건·장소·숫자·상황)를 비틀어 드립으로 넣어라. 절반 이상은 이슈 소재가 들어가야 한다.
- 욕(시발, 존나, 개-, 썅, 미친, 젠장)은 30% 정도 섞어라. 욕은 상황·진영·줄다리기를 향해서만.
- ⚠️ 실존 인물의 이름·직함·얼굴을 언급하지 마라. 실존 인물·단체를 욕하거나 사실처럼 단정하지 마라(명예훼손).
- ⚠️ 지역·성별·장애·인종·종교·나이·성적지향 비하 금지. 폭력·자해 조장 금지.
출력은 JSON 하나: {"pro_call":[12],"con_call":[12],"pro_lose":[12],"pro_win":[12],"con_lose":[12],"con_win":[12],"tie":[14],"duo":[[먼저,받아치기]x14]}
pro = 첫째 진영, con = 둘째 진영. *_call = 편 안 고른 구경꾼을 꼬시거나 상대 편을 긁으며 부르는 말, *_lose = 밀리며 열받거나 서러운 말, *_win = 이기며 상대를 긁는 말, tie = 팽팽해서 절박하고 웃긴 말, duo = 한쪽이 긁고 반대쪽이 더 세게 받아치는 대화.`;

function clean(arr: unknown, max: number): string[] {
  if (!Array.isArray(arr)) return [];
  return arr.map((x) => String(x || "").trim().replace(/^["'「]|["'」]$/g, ""))
    .filter((x) => x.length >= 2 && x.length <= 26 && !BAN.test(x) && !/[A-Za-z]{3,}/.test(x)).slice(0, max);
}
function cleanDuo(arr: unknown): string[][] {
  if (!Array.isArray(arr)) return [];
  return arr.filter((p) => Array.isArray(p) && p.length >= 2)
    .map((p) => [String(p[0] || "").trim(), String(p[1] || "").trim()])
    .filter(([a, b]) => a.length >= 2 && b.length >= 2 && a.length <= 26 && b.length <= 26 && !BAN.test(a) && !BAN.test(b)).slice(0, 16);
}

async function gen(iss: any) {
  /* 온도가 높으면 가끔 JSON 이 깨진다(26.9.19 QA) — 제어문자 걸러 파싱, 실패하면 낮춰서 한 번 더 */
  let last: unknown = null;
  for (const temp of [1.2, 0.95]) {
    try { return await genOnce(iss, temp); } catch (e) { last = e; }
  }
  throw last;
}
async function genOnce(iss: any, temp: number) {
  const user = `이슈 제목: ${iss.title}
분야: ${iss.category || ""}
요약: ${String(iss.one_line || iss.summary || iss.description || "").slice(0, 400)}
첫째 진영(pro): ${iss.faction_a || "찬성"}
둘째 진영(con): ${iss.faction_b || "반대"}`;
  const r = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST", headers: { Authorization: `Bearer ${DS_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "deepseek-chat", temperature: temp, max_tokens: 2600, response_format: { type: "json_object" },
      messages: [{ role: "system", content: SYS }, { role: "user", content: user }] }),
    signal: AbortSignal.timeout(60000),
  });
  const d = await r.json();
  const txt = String(d?.choices?.[0]?.message?.content || "").replace(/[\u0000-\u001f]+/g, " ");
  const o = JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1));
  const lines = {
    pro_call: clean(o.pro_call, 14), con_call: clean(o.con_call, 14),
    pro_lose: clean(o.pro_lose, 14), pro_win: clean(o.pro_win, 14),
    con_lose: clean(o.con_lose, 14), con_win: clean(o.con_win, 14),
    tie: clean(o.tie, 16), duo: cleanDuo(o.duo),
  };
  const n = Object.values(lines).reduce((a, v) => a + (v as unknown[]).length, 0);
  return { lines, n };
}

Deno.serve(async (req) => {
  if (!CRON_SECRET || (req.headers.get("x-cron-secret") || "") !== CRON_SECRET) return j({ ok: false, reason: "unauthorized" }, 401);
  if (!DS_KEY) return j({ ok: false, reason: "no_key" });
  const n = Math.min(Math.max(Number(new URL(req.url).searchParams.get("n") || "6"), 1), 12);
  const { data: done } = await sb.from("issue_tug_lines").select("issue_id");
  const have = new Set((done || []).map((x: any) => x.issue_id));
  const { data: iss } = await sb.from("issues").select("id,title,category,one_line,summary,description,faction_a,faction_b")
    .eq("status", "normal").order("id", { ascending: false }).limit(300);
  const todo = (iss || []).filter((x: any) => !have.has(x.id)).slice(0, n);
  const out: any[] = [];
  const t0 = Date.now();
  for (const it of todo) {
    if (Date.now() - t0 > 115_000) break;
    try {
      const { lines, n: cnt } = await gen(it);
      if (cnt < 20) { out.push({ id: it.id, ok: false, n: cnt }); continue; }
      await sb.from("issue_tug_lines").upsert({ issue_id: it.id, lines, model: "deepseek-chat" });
      out.push({ id: it.id, ok: true, n: cnt });
    } catch (e) { out.push({ id: it.id, ok: false, err: String(e).slice(0, 80) }); }
  }
  return j({ ok: true, done: out, left: Math.max(0, (iss || []).filter((x: any) => !have.has(x.id)).length - out.filter((o) => o.ok).length) });
});
