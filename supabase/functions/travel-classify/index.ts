// 여행지 유형 분류 — '어디 갈래' 풀에 방콕 노점과 이태원역이 섞여 있었다 (2026-09-02)
//
// 🚧 아직 **배포도 크론 등록도 안 했다**(사장님 결정). 수확이 끝난 뒤에 돌린다 —
//    지금 돌리면 아직 안 들어온 장소를 나중에 또 분류해야 한다. 수확 완료 시점에
//    `supabase functions deploy travel-classify` + 크론 등록으로 시작한다.
//    스키마(travel_places.genre, travel_genre_defs, RPC 둘)는 이미 적용돼 있고 비어 있을 뿐이다.
//
// category 는 46%가 비고 나머지는 국가유산 종목명('보물'·'사적')이라 여행 유형과 무관하다.
// 이름만으로는 절과 국수집을 못 가른다 → 이름·나라·설명·영상 제목을 같이 주고 모델이 고른다.
//
// ⚠️ 모델이 없는 코드를 지어낼 수 있다. 검증은 **DB 에서** 한다(travel_genre_save 가
//    travel_genre_defs 에 없는 코드를 'etc' 로 떨어뜨린다) — 여기서만 막으면 언젠가 샌다.
// ⚠️ 한 번에 다 못 돈다. 5,700곳이라 크론으로 조금씩 문다. 이미 분류된 곳은 다시 안 묻는다
//    (travel_places_to_classify 가 genre is null 만 준다).
// 💰 배치 25곳씩. 장소당 토큰이 수십 개라 전량(5,700곳) 돌려도 몇백 원 수준이다.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const DS = Deno.env.get("DEEPSEEK_API_KEY") || "";
const GEM = Deno.env.get("GEMINI_API_KEY") || "";
const CHAT_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-chat";

const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

const CODES = ["nature", "heritage", "temple", "museum", "landmark", "theme",
               "spa", "market", "food", "stay", "transit", "etc"] as const;

const SYS = `너는 여행지를 유형으로 분류한다. 아래 코드 중 **정확히 하나**를 고른다.

nature   자연 — 산·바다·해변·섬·계곡·폭포·호수·국립공원·사막·동굴
heritage 유적·궁 — 성·궁궐·고성·유적지·고분·성벽·역사지구·고택
temple   사찰·성당 — 절·사원·성당·교회·모스크·신사
museum   박물관·미술관 — 박물관·미술관·기념관·전시관·과학관
landmark 전망·랜드마크 — 타워·전망대·다리·광장·기념비·스카이라인 명소
theme    테마파크·체험 — 놀이공원·워터파크·동물원·수족관·스키장·체험시설
spa      온천·휴양 — 온천·스파·리조트 부대 휴양시설
market   시장·거리 — 재래시장·야시장·상점가·번화가·쇼핑거리
food     식당·카페 — 식당·노점·카페·바·양조장·펍
stay     숙소 — 호텔·리조트·게스트하우스·료칸
transit  교통 — 역·공항·터미널·정류장·휴게소
etc      위 어디에도 안 맞거나 판단할 근거가 없을 때

판단 규칙:
- 이름이 가장 강한 근거다. '○○역'은 transit, '○○사'는 temple, '○○시장'은 market.
- 설명과 영상 제목은 보조로만 본다. 영상 제목은 그 장소가 아니라 여행기 전체를 가리킬 때가 많다.
- 애매하면 지어내지 말고 etc 를 쓴다. 틀린 라벨이 빈 라벨보다 나쁘다.

출력은 JSON 만: {"results":[{"id":"<받은 id 그대로>","genre":"<코드>"}]}`;

let dsDead = false;
const errs: string[] = [];

async function chatJson(user: string): Promise<string | null> {
  if (DS && !dsDead) {
    try {
      const r = await fetch(CHAT_URL, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${DS}` },
        body: JSON.stringify({
          model: MODEL, temperature: 0,
          response_format: { type: "json_object" },
          messages: [{ role: "system", content: SYS }, { role: "user", content: user }],
        }),
      });
      if (r.ok) return (await r.json())?.choices?.[0]?.message?.content || null;
      /* 402(잔액)·401(키)은 이번 실행 내내 계속 실패한다 — 한 번만 적고 예비로 넘어간다.
         이걸 안 하면 잔액이 마른 날 '분류가 0건'인 이유가 안 보인다. */
      if (r.status === 402 || r.status === 401) dsDead = true;
      if (errs.length < 4) errs.push(`deepseek ${r.status}:${(await r.text()).slice(0, 100)}`);
    } catch (e) { if (errs.length < 4) errs.push(`deepseek ${String(e).slice(0, 80)}`); }
  }
  if (!GEM) return null;
  try {
    const u = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEM}`;
    const g = await fetch(u, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYS }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json" },
      }),
    });
    if (!g.ok) { if (errs.length < 4) errs.push(`gemini ${g.status}`); return null; }
    return (await g.json())?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (e) { if (errs.length < 4) errs.push(`gemini ${String(e).slice(0, 80)}`); return null; }
}

Deno.serve(async (req) => {
  const xcron = req.headers.get("x-cron-secret") || "";
  const auth = req.headers.get("authorization") || "";
  if (CRON_SECRET && xcron !== CRON_SECRET && !auth.includes(CRON_SECRET)) {
    return j({ ok: false, reason: "unauthorized" }, 401);
  }
  if (!DS && !GEM) return j({ ok: false, reason: "no_ai_key" }, 500);

  const url = new URL(req.url);
  const want = Math.min(Number(url.searchParams.get("n") || "50"), 200);
  const BATCH = 25;
  /* 엣지 함수는 150초 놀면 흔적 없이 사라진다 — 시간을 재서 스스로 끝낸다. */
  const DEADLINE = Date.now() + 110_000;

  let picked = 0, saved = 0, rounds = 0;
  const counts: Record<string, number> = {};

  while (picked < want && Date.now() < DEADLINE) {
    const { data: todo } = await supa.rpc("travel_places_to_classify",
      { p_limit: Math.min(BATCH, want - picked) });
    const list = (todo || []) as any[];
    if (!list.length) break;
    picked += list.length;
    rounds++;

    const user = list.map((p) => {
      const bits = [
        `id=${p.id}`,
        `이름=${p.name}`,
        p.name_en ? `영문=${p.name_en}` : "",
        p.country ? `나라=${p.country}` : "",
        p.area ? `지역=${p.area}` : "",
        p.category ? `기존분류=${p.category}` : "",
        p.summary ? `설명=${String(p.summary).slice(0, 140)}` : "",
        p.videos ? `영상=${String(p.videos).slice(0, 120)}` : "",
      ].filter(Boolean);
      return bits.join(" | ");
    }).join("\n");

    const raw = await chatJson(user);
    if (!raw) break;                       // 공급자가 죽었으면 더 물어봐야 소용없다

    let items: any[] = [];
    try { items = JSON.parse(raw)?.results || []; } catch { items = []; }
    const byId = new Map(list.map((p) => [String(p.id), p]));
    const clean = items
      .filter((x) => x && byId.has(String(x.id)))
      .map((x) => ({
        id: String(x.id),
        genre: CODES.includes(String(x.genre) as any) ? String(x.genre) : "etc",
      }));
    /* 모델이 빠뜨린 것도 남겨야 한다 — 안 그러면 다음 회차에 같은 곳을 또 물어보고
       영원히 안 끝난다. 빠진 건 etc 로 못 박는다. */
    for (const p of list) {
      if (!clean.some((c) => c.id === String(p.id))) clean.push({ id: String(p.id), genre: "etc" });
    }
    clean.forEach((c) => { counts[c.genre] = (counts[c.genre] || 0) + 1; });

    const { data: res } = await supa.rpc("travel_genre_save", { p_items: clean });
    saved += Number(res?.saved || 0);
  }

  return j({ ok: true, picked, saved, rounds, counts, errors: errs.slice(0, 4) });
});
