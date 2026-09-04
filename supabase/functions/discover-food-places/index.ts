// 웹에서 찾아 채운다 — 유튜브 메타데이터가 침묵하는 채널을 뚫는 경로
//
// 배경: 쯔양·또간집·맛있는녀석들 같은 채널은 제목·설명·댓글 어디에도 상호를 쓰지 않는다
//   (실측: 5개 채널 240편에서 0건). 자막은 공식 경로가 없다(소유자 인증 필요).
//   그런데 **개별 사실은 언론·블로그가 이미 보도했다**. 부산일보만 해도 쯔양 방문 맛집을
//   상호·주소까지 기사로 냈다. 사실은 누구의 소유도 아니다.
//
// ⚖️ 원칙: 특정 사이트의 집계를 복제하지 않는다. 여러 출처에서 **사실을 모으고**,
//   네이버 지역검색으로 **각 건을 독립 검증**해서 우리 집계를 만든다.
//   (맛집여지도든 쯔동여지도든, 한 사이트의 목록을 그대로 미러링하는 건 하지 않는다.)
//
// 🔑 같은 네이버 검색 키로 블로그·뉴스·웹문서를 다 쓴다. 지역검색과 동일 자격증명.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.4";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const S_ID = Deno.env.get("NAVER_SEARCH_ID") || Deno.env.get("NAVER_CLIENT_ID") || "";
const S_SEC = Deno.env.get("NAVER_SEARCH_SECRET") || Deno.env.get("NAVER_CLIENT_SECRET") || "";
const DS = Deno.env.get("DEEPSEEK_API_KEY") || "";
const CHAT_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-chat";
/* 🔴 예비 공급자 — DeepSeek 잔액이 마르면(402 Insufficient Balance) 추출이 통째로 0건이 된다.
   실측 2026-08-31: 스니펫 3,560건을 모으고도 후보 0건이었다. 이유가 보이지 않아서
   '스윕이 안 먹힌다'로 오진하기 딱 좋은 실패다. 키가 이미 있는 Gemini 로 자동으로 넘어간다. */
/* 🔴 구글로 **조용히** 넘어가지 않는다. DeepSeek 이 한 번 실패했을 뿐인데
   말없이 Gemini(구글 과금)로 붙는 구조였다 — 실측 2026-09-04 낮에 `deepseek 400` 이
   났고 그때마다 구글로 갔다. 같은 날 구글 클라우드에서 카드 결제 ₩200,000 이 나갔다.
   폴백은 이제 **명시적으로 켜야** 쓴다(GEMINI_FALLBACK=1). 기본은 꺼짐. */
const GEM = (Deno.env.get("GEMINI_FALLBACK") === "1")
  ? (Deno.env.get("GEMINI_API_KEY") || "") : "";


const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const aiErrors: string[] = [];
let dsDead = false;
const AIERR = (m: string) => { if (aiErrors.length < 8) aiErrors.push(m); };
const strip = (s: string) => String(s || "").replace(/<[^>]*>/g, "").replace(/&[a-z]+;/g, " ").trim();

/* 네이버 검색(블로그·뉴스·웹) — 사실을 모으는 창구 */
async function nsearch(kind: "blog" | "news" | "webkr", query: string, display = 30) {
  const u = new URL(`https://openapi.naver.com/v1/search/${kind}.json`);
  u.searchParams.set("query", query);
  u.searchParams.set("display", String(display));
  u.searchParams.set("sort", "sim");
  const r = await fetch(u, {
    headers: { "X-Naver-Client-Id": S_ID, "X-Naver-Client-Secret": S_SEC },
  });
  if (!r.ok) return { items: [], err: `${kind}_${r.status}` };
  const d = await r.json();
  return { items: (d?.items || []).map((it: any) => strip(it.title) + " — " + strip(it.description)) };
}

/* 모델 이름을 박아두면 구글이 단종시키는 날 조용히 404 로 죽는다
   (실측 2026-08-31: gemini-2.5-flash → "no longer available to new users").
   목록에서 generateContent 를 지원하는 flash 계열을 골라 캐시한다. */
let gemPick: string | null = null;
async function gemModel(): Promise<string | null> {
  if (gemPick) return gemPick;
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEM}&pageSize=200`);
    if (!r.ok) { AIERR(`gemini_models ${r.status}:${(await r.text()).slice(0, 100)}`); return null; }
    const ms = ((await r.json())?.models || []) as any[];
    const ok = ms.filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
                 .map((m) => String(m.name || "").replace(/^models\//, ""))
                 .filter((n) => !/embedding|aqa|image|tts|vision|live|native-audio/i.test(n));
    /* 싸고 빠른 flash 우선, 없으면 아무거나 */
    gemPick = ok.find((n) => /flash/.test(n) && !/lite/.test(n)) || ok.find((n) => /flash/.test(n)) || ok[0] || null;
    if (!gemPick) AIERR("gemini_no_model");
    return gemPick;
  } catch (e) { AIERR("gemini_models " + String(e).slice(0, 100)); return null; }
}

/* JSON 한 덩어리를 받아오는 단일 관문. DeepSeek → (실패 시) Gemini.
   어느 쪽이 왜 죽었는지는 aiErrors 에 남겨 리포트로 올린다 — 조용한 0건이 제일 나쁘다. */
async function chatJson(sys: string, user: string): Promise<string | null> {
  if (DS && !dsDead) {
    const r = await fetch(CHAT_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${DS}` },
      body: JSON.stringify({
        model: MODEL, temperature: 0,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: sys }, { role: "user", content: user }],
      }),
    });
    if (r.ok) return (await r.json())?.choices?.[0]?.message?.content || null;
    const msg = (await r.text()).slice(0, 120);
    /* 402(잔액)·401(키) 은 이번 실행 내내 계속 실패한다 — 한 번만 기록하고 바로 예비로 간다. */
    if (r.status === 402 || r.status === 401) dsDead = true;
    if (aiErrors.length < 4) aiErrors.push(`deepseek ${r.status}:${msg}`);
  }
  if (!GEM) return null;
  const model = await gemModel();
  if (!model) return null;
  const u = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEM}`;
  const g = await fetch(u, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: sys }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    }),
  });
  if (!g.ok) {
    if (aiErrors.length < 6) aiErrors.push(`gemini ${g.status}:${(await g.text()).slice(0, 120)}`);
    return null;
  }
  const d = await g.json();
  return d?.candidates?.[0]?.content?.parts?.map((x: any) => x.text).join("") || null;
}

/* 스니펫 → 상호 후보. 지역까지 같이 뽑아야 동명이인을 줄일 수 있다. */
async function extractNames(channel: string, snippets: string[]): Promise<{ name: string; region?: string }[]> {
  if (!snippets.length || (!DS && !GEM)) return [];
  const sys =
    `너는 '${channel}' 에 소개된 **식당 이름**만 뽑는 추출기다.\n` +
    "규칙:\n" +
    "1. 주어진 텍스트에 실제로 적힌 상호만 뽑는다. 지어내지 마라.\n" +
    `2. '${channel}' 과 무관해 보이면 버린다. 광고·홍보 글의 업체도 버린다.\n` +
    "3. 상호는 간판 이름만. '맛집','님','편','후기' 같은 수식은 제거한다.\n" +
    "4. region 은 텍스트에 드러난 지역만(예: '부산 해운대', '서울 중구'). 없으면 빈 문자열.\n" +
    "5. 사람 이름·채널명·프랜차이즈 본사명은 식당이 아니다. 버린다.\n" +
    '6. 출력은 JSON 만: {"items":[{"name":"","region":""}]}\n' +
    '7. 확실하지 않으면 넣지 마라. 빈 배열이 틀린 값보다 낫다.';
  const body = snippets.join("\n---\n").slice(0, 12000);
  const t = await chatJson(sys, body);
  if (!t) return [];
  try {
    const p = JSON.parse(t);
    return (p.items || [])
      .filter((x: any) => x && String(x.name || "").trim().length >= 2)
      .map((x: any) => ({ name: String(x.name).trim(), region: String(x.region || "").trim() }))
      .slice(0, 60);
  } catch { return []; }
}

/* 지역검색으로 독립 검증 — 이 단계를 통과해야 우리 데이터가 된다.
   해소 워커와 같은 가드를 쓴다(음식점만·지역일치·체인지점 금지). */
const FOOD_RE = /^(음식점|카페|제과|베이커리|술집|주점)/;
const isFood = (c: string) => FOOD_RE.test(c) || /음식|카페|한식|중식|일식|양식|분식|치킨|호프|주점|베이커리/.test(c);
function regionOk(hint: string, addr: string) {
  const toks = (hint || "").split(/\s+/).filter((t) => t.length >= 2);
  if (!toks.length) return true;
  return toks.some((t) => addr.includes(t.replace(/(특별시|광역시|시|군|구)$/, "")));
}
function branchOk(hint: string, q: string, title: string) {
  if (hint) return true;
  if (!/[가-힣A-Za-z0-9]{2,}\s*점$/.test(title.trim())) return true;
  return /점$/.test(q.trim());
}
function pickCoord(mapx: string, mapy: string) {
  let lon = Number(mapx), lat = Number(mapy);
  if (!isFinite(lon) || !isFinite(lat)) return {};
  if (Math.abs(lon) > 1000) { lon /= 1e7; lat /= 1e7; }
  if (lat < 33 || lat > 39.5 || lon < 124 || lon > 132) return {};
  return { lat, lon };
}
async function verify(name: string, hint: string) {
  const u = new URL("https://openapi.naver.com/v1/search/local.json");
  u.searchParams.set("query", (hint ? hint + " " : "") + name);
  u.searchParams.set("display", "5");
  /* 💰 네이버 몫을 한 건씩 받아 쓴다. 하루치가 없으면 아예 안 부른다 —
     2026-09-01 에 크론·루프가 동시에 때려 25,000 을 다 태우고, 그 뒤 실패한 집들이
     '물어봤음' 으로 박혀 영구 제외될 뻔했다. 장부가 429 전에 세운다. */
  const { data: allow } = await supa.rpc("naver_take", { p_want: 1 });
  if (Number(allow || 0) <= 0) throw new Error("naver_budget");
  const r = await fetch(u, { headers: { "X-Naver-Client-Id": S_ID, "X-Naver-Client-Secret": S_SEC } });
  /* 못 찾은 것과 못 부른 것을 가른다 — 후자는 위로 올려 배치를 멈춘다 */
  if (!r.ok) throw new Error(`naver_${r.status}`);
  const items = (await r.json())?.items || [];
  const norm = (s: string) => s.replace(/\s/g, "").toLowerCase();
  const want = norm(name);
  const best = items.find((it: any) => {
    const t = norm(strip(it.title));
    if (!(t.includes(want) || want.includes(t))) return false;
    if (!isFood(strip(it.category))) return false;
    if (!branchOk(hint, name, strip(it.title))) return false;
    const a = strip(it.roadAddress) || strip(it.address);
    return !!a && regionOk(hint, a);
  });
  if (!best) return null;
  const c = pickCoord(best.mapx, best.mapy);
  return {
    name: strip(best.title) || name,
    address: strip(best.roadAddress) || strip(best.address),
    category: (strip(best.category).split(">").pop() || "").trim() || null,
    phone: strip(best.telephone) || null,
    lat: c.lat != null ? String(c.lat) : null,
    lon: c.lon != null ? String(c.lon) : null,
  };
}

Deno.serve(async (req) => {
  const xcron = req.headers.get("x-cron-secret") || "";
  const auth = req.headers.get("authorization") || "";
  if (CRON_SECRET && xcron !== CRON_SECRET && !auth.includes(CRON_SECRET)) {
    return j({ ok: false, reason: "unauthorized" }, 401);
  }
  if (!S_ID || !S_SEC) return j({ ok: false, reason: "no_search_key" }, 500);
  if (!DS && !GEM) return j({ ok: false, reason: "no_ai_key" }, 500);

  const url = new URL(req.url);
  const only = url.searchParams.get("channel");
  const extra = url.searchParams.get("q") || "";
  /* 다각도 수집 — 한 줄만 치면 상위 몇 개만 본다.
     표현 × 지역으로 갈라 훑으면 같은 채널에서 훨씬 넓게 긁힌다.
     네이버 검색은 일 25,000회라 이 정도 조합은 여유롭다. */
  /* 다각도 수집 — 한 줄만 치면 상위 몇 개만 본다.
     표현 × 지역으로 갈라 훑으면 같은 채널에서 훨씬 넓게 긁힌다.
     네이버 검색은 일 25,000회라 이 정도 조합은 여유롭다.

     ⚠️ 예전엔 매 실행 **똑같은 조합**(표현 4 × 시도 17)만 돌았다. 한 번 긁고 나면
        두 번째부터는 같은 결과라 새 장소가 거의 안 늘었다(그래서 데이터가 멈췄다).
        → 채널마다 회차(discover_wave)를 세고, 그 값으로 표현·지역 창을 민다.
          한 실행의 비용은 그대로인데 며칠에 걸쳐 훨씬 넓게 덮인다. */
  const SIDO = ["", "서울", "부산", "대구", "인천", "광주", "대전", "울산",
                "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"];
  /* 시군구까지 내려가면 같은 채널에서도 새 이름이 계속 나온다 —
     블로그는 '강남 맛집'처럼 구 단위로 쓰지 시도 단위로 안 쓴다. */
  const GU = [
    "서울 강남", "서울 강북", "서울 마포", "서울 종로", "서울 중구", "서울 성동", "서울 광진",
    "서울 송파", "서울 영등포", "서울 서초", "서울 용산", "서울 노원", "서울 은평", "서울 관악",
    "부산 해운대", "부산 서면", "부산 남포동", "부산 광안리", "부산 기장",
    "대구 중구", "대구 수성", "인천 중구", "인천 부평", "광주 동구", "대전 유성",
    "경기 수원", "경기 성남", "경기 고양", "경기 용인", "경기 부천", "경기 안양", "경기 파주",
    "강원 강릉", "강원 속초", "강원 춘천", "충남 천안", "전북 전주", "전남 여수", "전남 순천",
    "경북 경주", "경북 포항", "경남 창원", "경남 통영", "제주 서귀포", "제주 제주시",
  ];
  const PHRASES = ["맛집", "다녀간 맛집", "나온 식당", "방문 맛집",
                   "소개된 맛집", "추천 맛집", "출연 맛집", "가본 곳", "노포", "웨이팅"];
  const deep = url.searchParams.get("deep") === "1";

  /* 회차로 창을 민다. 지역은 시도(항상) + 시군구 일부(회차마다 다른 구간). */
  function windowFor(wave: number) {
    const pn = deep ? 4 : 2;
    const ph: string[] = [];
    for (let i = 0; i < pn; i++) ph.push(PHRASES[(wave * pn + i) % PHRASES.length]);
    const sido = deep ? SIDO : SIDO.slice(0, 9);
    const gn = deep ? 12 : 6;
    const gu: string[] = [];
    for (let i = 0; i < gn; i++) gu.push(GU[(wave * gn + i) % GU.length]);
    return { phrases: ph, regions: [...sido, ...gu] };
  }

  /* 🔁 회전 — 채널을 지정하지 않으면 '가장 오래 안 돈 N개'만 돈다.
     전 채널을 한 번에 돌리면 검색 API 에서 서로 굶는다(실측: 21개 동시 → 스니펫 0~75,
     단독일 땐 570). 매 실행 몇 개씩 돌리면 며칠에 걸쳐 전체가 고르게 갱신된다. */
  const rotN = Number(url.searchParams.get("n") || "4");
  let slugs: string[] | null = null;
  const waveOf = new Map<string, number>();
  if (!only) {
    const { data: qd } = await supa.rpc("food_discover_queue", { p_n: rotN });
    const rows = (qd || []) as any[];
    slugs = rows.map((r) => (typeof r === "string" ? r : r.slug));
    for (const r of rows) if (typeof r !== "string") waveOf.set(r.slug, Number(r.wave) || 0);
  }
  const forceWave = url.searchParams.get("wave");

  const { data: chans } = await supa.from("food_channels")
    .select("slug,name,active,discover_wave").eq("active", true).order("sort");

  const report: any[] = [];
  let naverHalt = "";

  /* 🔎 진단용: 네이버의 **진짜** 남은 한도를 잰다. 장부(우리가 세는 숫자)와 실제가
     어긋나면 수확이 공짜로 굶는다. 호출 1건이라 장부를 태우지 않고 그냥 부른다.
     ?q= 로 임의 질의도 던져볼 수 있다 — 이걸로 '주소로 검색하면 찾아지나'를 재봤고
     **안 된다**는 걸 확인했다(지역검색은 순수 상호 검색이다). 실측 2026-09-03:
     '대구광역시 서구 문화로 308' 같은 멀쩡한 도로명 4건이 전부 결과 0. */
  if (new URL(req.url).searchParams.get("probe") === "1") {
    const q = new URL(req.url).searchParams.get("q") || "김밥천국";
    const pu = "https://openapi.naver.com/v1/search/local.json?query=" +
               encodeURIComponent(q) + "&display=5";
    const pr = await fetch(pu, {
      headers: { "X-Naver-Client-Id": S_ID, "X-Naver-Client-Secret": S_SEC },
    });
    return j({ ok: true, probe: pr.status, body: (await pr.text()).slice(0, 200) });
  }
  let added = 0;

  for (const c of (chans || []) as any[]) {
    if (only && c.slug !== only) continue;
    if (!only && slugs && !slugs.includes(c.slug)) continue;
    try {
      /* 표현 × 지역 스윕. 스니펫은 한데 모으고, 상호는 이름으로 중복을 걷은 뒤
         **한 번씩만** 검증한다 — 검증이 제일 비싼 단계라 여기서 아껴야 한다. */
      const wave = forceWave != null ? Number(forceWave) : (waveOf.get(c.slug) ?? c.discover_wave ?? 0);
      const { phrases, regions } = windowFor(wave);
      const snips: string[] = [];
      for (const ph of phrases) {
        for (const rg of regions) {
          const q = `${c.name} ${rg} ${ph}${extra ? " " + extra : ""}`.replace(/\s+/g, " ").trim();
          const b = await nsearch("blog", q, 30);
          snips.push(...(b.items || []));
          if (!rg) {
            /* 시도·구 없는 '전국' 질의에서만 다른 코퍼스도 함께 본다 —
               뉴스는 방송 직후 기사를, 웹문서는 블로그가 못 잡는 정리글을 준다.
               (webkr 은 지금까지 한 번도 안 쓰던 창구였다) */
            const n = await nsearch("news", q, 15);
            snips.push(...(n.items || []));
            const w = await nsearch("webkr", q, 20);
            snips.push(...(w.items || []));
          }
          await new Promise((s) => setTimeout(s, 40));
        }
      }
      if (!snips.length) {
        /* 🚨 결과가 0건이어도 도장은 찍는다. 안 찍으면 그 채널이 큐 맨 앞에 영원히 남아
           매 실행 슬롯을 잡아먹는다(실측: meokbosa 가 도장 없이 계속 1번이었다). */
        await supa.rpc("food_discover_stamp", { p_slug: c.slug });
        report.push({ ch: c.slug, snippets: 0 }); continue;
      }

      /* 스니펫이 많으면 AI 한 번에 다 못 넣는다 — 덩어리로 나눠 뽑고 이름으로 합친다.
         ⚠️ 스윕을 넓히자 한 채널에서 3,600건이 나왔다. 앞에서부터 14덩어리만 읽으면
            **84%를 버린다** — 게다가 앞쪽은 같은 질의의 연속이라 중복이 몰려 있다.
            중복을 걷고 전체에서 고르게 뽑아 읽는다. */
      const uniq = Array.from(new Set(snips));
      const CHUNK_CAP = 14;
      const step = Math.max(1, Math.floor(uniq.length / (CHUNK_CAP * 40)));
      const spread = step > 1 ? uniq.filter((_, i) => i % step === 0) : uniq;
      const chunks: string[][] = [];
      for (let i = 0; i < spread.length; i += 40) chunks.push(spread.slice(i, i + 40));
      const seen = new Set<string>();
      const cands: { name: string; region?: string }[] = [];
      for (const ck of chunks.slice(0, CHUNK_CAP)) {
        for (const x of await extractNames(c.name, ck)) {
          const k = x.name.replace(/\s/g, "").toLowerCase();
          if (seen.has(k)) continue;
          seen.add(k); cands.push(x);
        }
      }
      const items: any[] = [];
      for (const cd of cands) {
        /* 네이버 몫 소진·인프라 실패면 조용히 멈춘다 — 500 으로 죽으면 크론 이력만
           지저분해지고, 계속 부르면 한도만 더 태운다. 다음 회차에 이어서 한다. */
        let v: any = null;
        try { v = await verify(cd.name, cd.region || ""); }
        catch (e) { naverHalt = String(e).slice(0, 60); break; }
        if (v) items.push({ ...v, channel: c.slug, origin: "yt" });
        await new Promise((s) => setTimeout(s, 90));
      }
      let res: any = { new: 0, dup: 0 };
      if (items.length) {
        const { data } = await supa.rpc("food_ingest", { p_items: items });
        res = data || res;
      }
      added += res.new || 0;
      await supa.rpc("food_discover_stamp", { p_slug: c.slug });   // 회전 도장
      report.push({ ch: c.slug, wave, snippets: snips.length, read: Math.min(chunks.length, CHUNK_CAP) * 40,
                    cands: cands.length, verified: items.length, ...res,
                    ai: aiErrors.slice(0, 3) });
    } catch (e) {
      report.push({ ch: c.slug, err: String(e).slice(0, 140) });
    }
  }
  return j({ ok: true, added, report, halted: naverHalt || undefined });
});
