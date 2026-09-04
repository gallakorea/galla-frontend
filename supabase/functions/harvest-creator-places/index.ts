// 영상에서 가게를 만들어낸다 — 방향을 뒤집는 파이프라인.
//
// 지금까지는 '가게를 먼저 모으고 영상을 나중에 붙였다'. 그래서 8,724곳 중 영상이 붙은 건
// 420곳(5%)에서 멈췄다. 채널이 상호를 안 쓰면 붙일 방법이 없기 때문이다.
// 참조 서비스가 카드마다 영상 썸네일을 다는 건 **영상에서 가게를 뽑아 목록을 만들었기** 때문이다.
// 방향을 뒤집으면 새로 들어오는 집은 태어날 때부터 영상 ID 를 달고 온다.
//
// 흐름: 설명에 주소가 있는 영상 → LLM 으로 (상호, 주소) 추출 → **네이버 지역검색으로 실재 검증**
//       → food_ingest(가게 생성 + 출처·영상 연결을 한 번에)
//
// ⚠️ LLM 이 뱉은 걸 그대로 넣지 않는다. 네이버에 없거나 음식점이 아니거나 지역이 어긋나면 버린다.
//    지어낸 가게가 들어가면 지도가 통째로 거짓말이 된다.
// ⚠️ '성공했을 때만 도장 찍기'는 오늘만 네 번 밟은 함정이다. 결과와 무관하게 harvested_at 을 남긴다 —
//    안 그러면 실패한 영상을 매 회차 다시 LLM 에 태우고 네이버를 다시 부른다(유료 API 에서).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const S_ID = Deno.env.get("NAVER_SEARCH_ID") || Deno.env.get("NAVER_CLIENT_ID") || "";
const S_SEC = Deno.env.get("NAVER_SEARCH_SECRET") || Deno.env.get("NAVER_CLIENT_SECRET") || "";
const DS = Deno.env.get("DEEPSEEK_API_KEY") || "";
const GEM = Deno.env.get("GEMINI_API_KEY") || "";
const CHAT_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-chat";

const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const strip = (s: string) => String(s || "").replace(/<[^>]*>/g, "").replace(/&[a-z]+;/g, " ").trim();

/* ── 검증 관문 — ingest-baeknyeon 과 같은 가드를 쓴다(음식점만·지역일치).
      새로 짜면 두 경로의 기준이 조용히 갈라진다. ── */
const FOOD_RE = /^(음식점|카페|제과|베이커리|술집|주점)/;
const isFood = (c: string) => FOOD_RE.test(c) || /음식|카페|한식|중식|일식|양식|분식|치킨|호프|주점|베이커리|제과/.test(c);
function pickCoord(mapx: string, mapy: string) {
  let lon = Number(mapx), lat = Number(mapy);
  if (!isFinite(lon) || !isFinite(lat)) return {} as { lat?: number; lon?: number };
  if (Math.abs(lon) > 1000) { lon /= 1e7; lat /= 1e7; }
  if (lat < 33 || lat > 39.5 || lon < 124 || lon > 132) return {};
  return { lat, lon };
}
function hintOf(addr: string) {
  return String(addr || "").trim().split(/\s+/).slice(0, 2).join(" ");
}
/* 🔴 국내인지 먼저 가른다. 네이버 지역검색은 국내 전용이다.
   실측 2026-09-04: 버려진 것을 열어보니 오사카·청두·홍콩·도쿄·산세바스티안이 줄줄이 나왔다 —
   여행 간 크리에이터의 해외 맛집이다. 못 찾는 게 당연한데 한 건마다 네이버 호출을 한 번씩
   태우고 있었다(하루 예산이 유한하다). 부르기 전에 접는다.
   ⚠️ 화이트리스트가 아니라 블랙리스트로 짠다 — 국내 지명은 읍·면·동까지 수만 개라
      화이트리스트로 두면 멀쩡한 시골 맛집이 통째로 잘린다. */
const OVERSEAS =
  /(일본|도쿄|東京|오사카|교토|후쿠오카|삿포로|나고야|오키나와|긴자|신주쿠|중국|베이징|상하이|청두|시안|칭다오|홍콩|마카오|대만|타이베이|타이중|가오슝|베트남|하노이|호치민|다낭|나트랑|태국|방콕|치앙마이|푸켓|싱가포르|말레이시아|쿠알라룸푸르|필리핀|마닐라|세부|인도네시아|발리|자카르타|미국|뉴욕|la|엘에이|샌프란시스코|시애틀|하와이|괌|사이판|캐나다|밴쿠버|토론토|영국|런던|프랑스|파리|스페인|바르셀로나|마드리드|산세바스티안|이탈리아|로마|밀라노|나폴리|독일|베를린|뮌헨|스위스|네덜란드|암스테르담|체코|프라하|터키|튀르키예|이스탄불|호주|시드니|멜버른|뉴질랜드|인도|두바이|아랍|이집트|몽골|러시아|블라디보스토크|우즈베키스탄|카자흐|페루|멕시코|브라질|아르헨티나)/i;
/* 상호가 통째로 로마자·한자·가나면 국내 검색으로 못 잡는다 */
const NOT_KR_NAME = /^[^가-힣]*[A-Za-z\u3040-\u30ff\u4e00-\u9fff][^가-힣]*$/;
function abroad(name: string, region: string) {
  if (OVERSEAS.test(region || "")) return true;
  if (NOT_KR_NAME.test(String(name || "").trim())) return true;
  return false;
}
function regionOk(hint: string, addr: string) {
  const toks = (hint || "").split(/\s+/).filter((t) => t.length >= 2);
  if (!toks.length) return true;
  return toks.some((t) => addr.includes(t.replace(/(특별시|광역시|특별자치시|특별자치도|시|군|구)$/, "")));
}
async function verify(name: string, addr: string) {
  const hint = hintOf(addr);
  const u = new URL("https://openapi.naver.com/v1/search/local.json");
  u.searchParams.set("query", `${hint} ${name}`.trim());
  u.searchParams.set("display", "5");
  const r = await fetch(u, { headers: { "X-Naver-Client-Id": S_ID, "X-Naver-Client-Secret": S_SEC } });
  /* 🔴 '못 찾았다'와 '못 불렀다'를 가른다. 둘 다 null 로 두면 한도가 소진된 뒤
     멀쩡한 식당이 '물어봤음'으로 박혀 영구히 건너뛰기가 된다(실측 2026-09-01, 9,086건). */
  if (!r.ok) {
    /* 본문까지 실어 올린다 — 네이버는 errorCode 로 한도 종류를 구분해준다
       (012 호출한도 초과 / 024 인증실패 등). 상태코드만 보면 '무슨 한도인지' 를 못 가른다. */
    throw new Error(`naver_${r.status}:${(await r.text()).slice(0, 160)}`);
  }
  const items = (await r.json())?.items || [];
  const norm = (s: string) => s.replace(/\s/g, "").toLowerCase();
  const want = norm(name);
  const best = items.find((it: any) => {
    const t = norm(strip(it.title));
    if (!(t.includes(want) || want.includes(t))) return false;
    if (!isFood(strip(it.category))) return false;
    const a = strip(it.roadAddress) || strip(it.address);
    return !!a && regionOk(hint, a);
  });
  if (!best) {
    /* 진단용 — 왜 떨어졌는지 남긴다. 추측으로 고치면 엉뚱한 곳을 만진다. */
    (globalThis as any).__lastMiss = {
      want: name, region,
      got: items.slice(0, 3).map((it: any) =>
        `${strip(it.title)}|${(strip(it.category).split(">").pop() || "").trim()}|${strip(it.roadAddress) || strip(it.address)}`),
    };
    return null;
  }
  const c = pickCoord(best.mapx, best.mapy);
  return {
    name: strip(best.title) || name,
    address: strip(best.roadAddress) || strip(best.address) || addr,
    category: (strip(best.category).split(">").pop() || "").trim() || null,
    phone: strip(best.telephone) || null,
    lat: c.lat != null ? String(c.lat) : null,
    lon: c.lon != null ? String(c.lon) : null,
  };
}

/* ── LLM — 딥시크 우선, 잔액·키 문제면 제미나이로 내려간다(다른 함수와 같은 규약) ── */
let dsDead = false;
const aiErrors: string[] = [];
async function chatJson(sys: string, user: string): Promise<string | null> {
  if (DS && !dsDead) {
    const r = await fetch(CHAT_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${DS}` },
      body: JSON.stringify({
        model: MODEL, temperature: 0, response_format: { type: "json_object" },
        messages: [{ role: "system", content: sys }, { role: "user", content: user }],
      }),
    });
    if (r.ok) return (await r.json())?.choices?.[0]?.message?.content || null;
    if (r.status === 402 || r.status === 401) dsDead = true;
    if (aiErrors.length < 4) aiErrors.push(`deepseek ${r.status}`);
  }
  if (!GEM) return null;
  const u = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEM}`;
  const g = await fetch(u, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: sys }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    }),
  });
  if (!g.ok) { if (aiErrors.length < 6) aiErrors.push(`gemini ${g.status}`); return null; }
  return (await g.json())?.candidates?.[0]?.content?.parts?.[0]?.text || null;
}

/* ⚠️ 메뉴는 여기서 같이 뽑는다 — 별도 API 가 없기 때문이다.
   네이버 지역검색에도 구글 플레이스에도 메뉴 항목이 없고, 네이버 플레이스 페이지를
   긁는 건 안 하기로 한 경로다. 반면 크리에이터는 설명에 '한돈 생삼겹 16,000원' 처럼
   가격을 자주 적는다. 이미 LLM 을 한 번 부르므로 여기 얹으면 추가 비용이 0이다. */
const SYS = [
  "너는 한국 음식 유튜브 영상의 제목과 설명에서 '그 영상이 다녀온 음식점'과 '거기서 파는 메뉴'를 뽑는 추출기다.",
  "규칙:",
  "1) 설명에 적힌 도로명 주소와 짝이 되는 가게만 뽑는다. 주소가 없는 가게는 뽑지 않는다.",
  "2) 협찬사·광고주·본인 채널·굿즈·쿠팡 링크 같은 건 가게가 아니다. 제외한다.",
  "3) 지점명이 있으면 상호에 포함한다(예: '○○식당 본점').",
  "4) 메뉴는 **설명에 값이 적혀 있는 것만** 뽑는다. 가격이 없으면 그 메뉴는 넣지 않는다.",
  "5) price 는 숫자만 넣는다(원 단위). '16,000원' → 16000. 범위나 '시가'는 넣지 않는다.",
  "6) 지어내지 않는다. 확실하지 않으면 빈 배열을 준다.",
  'JSON 만: {"shops":[{"name":"상호","address":"도로명 주소","menus":[{"name":"메뉴명","price":16000}]}]}',
].join("\n");


/* 제목 경로 전용 프롬프트 — 주소가 없다. 상호와 '어느 동네인지'만 뽑는다.
   ⚠️ 지역이 없으면 네이버가 같은 이름의 딴 동네 가게를 준다. 지역을 못 찾으면 버린다. */
const SYS_TITLE = [
  "너는 한국 음식 유튜브 영상의 제목·설명에서 '그 영상이 다녀온 음식점'을 뽑는 추출기다.",
  "이 영상들은 설명에 주소가 없다. 그래서 **상호와 지역**만 뽑는다.",
  "규칙:",
  "1) 제목이나 설명에 **고유한 상호**가 있을 때만 뽑는다.",
  "   '수원칼국수'·'8개월냉면'·'팔선' 처럼 검색되는 이름이어야 한다.",
  "2) 상호가 아닌 것은 뽑지 않는다: '동네 중국집'·'노포'·'분식집'·'그 집' 같은 보통명사,",
  "   '초저가 식당 3곳' 같은 기획 문구, 협찬사·굿즈·쿠팡·본인 채널.",
  "3) region 에는 시·군·구나 널리 쓰이는 동네 이름을 넣는다(예: '수원', '서울 강남', '강릉').",
  "   **제목이나 설명에 근거가 있을 때만** 넣는다. 없으면 그 가게는 뽑지 않는다.",
  "4) 프랜차이즈 지점(빽다방·홍콩반점 등)은 지점명이 함께 있을 때만 뽑는다.",
  "5) 한 영상에서 최대 3곳. 확실하지 않으면 빈 배열을 준다. **지어내지 않는다.**",
  'JSON 만: {"shops":[{"name":"상호","region":"지역"}]}',
].join("\n");

/* 이름만으로 찾는다 — 주소가 없으니 검증 기준을 더 조인다.
   ⚠️ 부분일치를 허용하면 '팔선' 이 '팔선생' 을 잡는다. 정규화 후 **완전일치**만 받는다. */
async function verifyByName(name: string, region: string) {
  const u = new URL("https://openapi.naver.com/v1/search/local.json");
  u.searchParams.set("query", `${region} ${name}`.trim());
  u.searchParams.set("display", "5");
  const r = await fetch(u, { headers: { "X-Naver-Client-Id": S_ID, "X-Naver-Client-Secret": S_SEC } });
  if (!r.ok) throw new Error(`naver_${r.status}:${(await r.text()).slice(0, 160)}`);
  const items = (await r.json())?.items || [];
  const norm = (x: string) => x.replace(/\s/g, "").toLowerCase();
  const want = norm(name);
  /* 🔴 예전엔 완전일치만 받았다. 그런데 네이버는 지점명을 붙여서 준다 —
     영상이 '본가설렁탕'이라 해도 네이버엔 '본가설렁탕 강남점'으로 있다.
     실측 2026-09-04: 추출 59건 중 42건(71%)이 여기서 버려졌다.
     → 뒤에 붙은 꼬리가 **지점 표기일 때만** 같은 집으로 본다. 지역·업종 검사는 그대로라
       '김밥천국' 같은 흔한 이름이 엉뚱한 동네로 새지 않는다. */
  const BRANCH = /^[가-힣A-Za-z0-9]{0,7}(점|본점|직영점|지점|스토어|store)$|^\(.{0,12}\)$/;
  const sameShop = (t: string) => {
    if (t === want) return true;
    if (t.startsWith(want) && BRANCH.test(t.slice(want.length))) return true;
    if (want.startsWith(t) && BRANCH.test(want.slice(t.length))) return true;
    /* 영상은 지역을 상호 앞에 붙여 말한다 — '광양시장국밥' vs 네이버 '시장국밥'.
       떼어낸 조각이 우리가 이미 알고 있는 그 지역명일 때만 인정한다. */
    const rg = norm(region);
    if (rg && want === rg + t) return true;
    if (rg && t === rg + want) return true;
    return false;
  };
  const best = items.find((it: any) => {
    const t = norm(strip(it.title));
    if (!sameShop(t)) return false;
    if (!isFood(strip(it.category))) return false;
    const a = strip(it.roadAddress) || strip(it.address);
    return !!a && regionOk(region, a);                  // 지역도 맞아야 한다
  });
  if (!best) {
    /* 진단용 — 왜 떨어졌는지 남긴다. 추측으로 고치면 엉뚱한 곳을 만진다. */
    (globalThis as any).__lastMiss = {
      want: name, region,
      got: items.slice(0, 3).map((it: any) =>
        `${strip(it.title)}|${(strip(it.category).split(">").pop() || "").trim()}|${strip(it.roadAddress) || strip(it.address)}`),
    };
    return null;
  }
  const c = pickCoord(best.mapx, best.mapy);
  return {
    name: strip(best.title) || name,
    address: strip(best.roadAddress) || strip(best.address) || "",
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

  const url = new URL(req.url);
  const channel = url.searchParams.get("channel") || "";
  const n = Math.min(Number(url.searchParams.get("n") || "20"), 60);
  /* mode=title: 설명에 주소가 없는 영상을 제목의 상호로 찾는다(채널 지정 불필요).
     dry=1 이면 **아무것도 쓰지 않고** 무엇이 들어갈지만 돌려준다 — 정밀도부터 눈으로 본다. */
  const TITLE = url.searchParams.get("mode") === "title";
  const DRY = url.searchParams.get("dry") === "1";
  if (!channel && !TITLE) return j({ ok: false, reason: "no_channel" }, 400);

  const { data: vids } = TITLE
    ? await supa.rpc("food_videos_to_harvest_title", { p_limit: n, p_channel: channel || null })
    : await supa.rpc("food_videos_to_harvest", { p_channel: channel, p_limit: n });
  const list = (vids || []) as any[];
  if (!list.length) return j({ ok: true, channel, picked: 0, note: "수확할 영상 없음" });

  /* 💰 네이버 몫을 먼저 받는다. 영상 하나에 최대 3곳까지 물어보므로 그만큼 잡아두고,
     안 쓴 몫은 끝에 돌려준다. 오늘 하루치를 다 태운 뒤라 이 관문 없이는 다시 못 돈다. */
  const { data: allow } = await supa.rpc("naver_take", { p_want: list.length * 3 });
  const budget = Number(allow || 0);
  if (budget <= 0) return j({ ok: true, channel, picked: 0, note: "네이버 하루 몫 소진" });

  const items: any[] = [];
  const done: string[] = [];
  let extracted = 0, verified = 0, dropped = 0, naverCalls = 0;
  const misses: any[] = [];

  let halted = "";
  /* ⚠️ 엣지는 150초에 끊는다. 영상 하나에 LLM 3초 + 네이버 3회가 붙어
     n 이 크면 상자를 넘긴다. 넘기면 그 회차가 통째로 날아간다. */
  const t0 = Date.now();
  for (const v of list) {
    if (halted) break;
    if (Date.now() - t0 > 110_000) { halted = "시간 상자(110초) 도달"; done.pop(); break; }
    done.push(v.video_id);                       // 결과와 무관하게 '물어봤다'를 남긴다
    let shops: any[] = [];
    try {
      const raw = await chatJson(
        TITLE ? SYS_TITLE : SYS,
        `제목: ${v.title}\n\n설명:\n${String(v.description || "").slice(0, 2600)}`,
      );
      shops = raw ? (JSON.parse(raw)?.shops || []) : [];
    } catch (_) { shops = []; }
    extracted += shops.length;

    for (const s of shops.slice(0, 3)) {         // 한 영상에서 셋까지만 — 그 이상은 광고 나열일 확률이 높다
      const name = String(s?.name || "").trim();
      const addr = String(s?.address || "").trim();
      const region = String(s?.region || "").trim();
      if (TITLE && abroad(name, region)) {      // 해외 — 네이버를 부르지 않는다
        dropped++;
        if (misses.length < 25) misses.push({ want: name, region, got: ["(해외)"] });
        continue;
      }
      if (TITLE ? (name.length < 2 || region.length < 2) : (name.length < 2 || addr.length < 6)) {
        dropped++;
        if (misses.length < 25) misses.push({ want: name, region, got: ["(규격미달)"] });
        continue;
      }
      let ok: any = null;
      if (naverCalls >= budget) { halted = "budget"; done.pop(); break; }
      naverCalls++;
      try { ok = TITLE ? await verifyByName(name, region) : await verify(name, addr); }
      catch (e) {
        /* 인프라 실패 — 이 영상은 도장을 빼고 중단한다(다음 회차에 다시 온다) */
        halted = String(e).slice(0, 60);
        done.pop();
        break;
      }
      await new Promise((r) => setTimeout(r, 70));   // 네이버 호출 간격
      if (!ok) {
        dropped++;
        if (misses.length < 25) misses.push((globalThis as any).__lastMiss || { want: name, region, got: [] });
        continue;
      }
      verified++;
      /* 메뉴는 네이버 검증을 통과한 가게에만 딸려 보낸다 —
         존재가 확인 안 된 집에 메뉴까지 붙으면 거짓말이 두 겹이 된다. */
      const menus = Array.isArray(s?.menus)
        ? s.menus
            .map((m: any) => ({ name: String(m?.name || "").trim(), price: Number(m?.price) }))
            .filter((m: any) => m.name.length >= 1 && Number.isFinite(m.price)
                                && m.price > 0 && m.price < 1000000)
            .slice(0, 20)
        : [];
      items.push({ ...ok, channel: v.channel || channel, origin: TITLE ? "yt-title" : "yt", menus,
                   video_id: v.video_id, video_title: v.title, aired_at: v.published_at });
    }
  }

  if (budget > naverCalls) await supa.rpc("naver_refund", { p_n: budget - naverCalls });

  if (DRY) {
    return j({ ok: true, dry: true, misses, picked: list.length, extracted, verified, dropped,
               would: items.map((x: any) => ({ name: x.name, addr: x.address, cat: x.category,
                                               title: String(x.video_title || "").slice(0, 40) })),
               halted: halted || undefined, ai: aiErrors.slice(0, 3) });
  }

  let res: any = { new: 0, dup: 0 };
  let ingestErr = "";
  if (items.length) {
    /* 🔴 오류를 삼키면 안 된다. 2026-09-04: origin 체크 제약이 'yt-title' 을 막아
       food_ingest 가 통째로 예외로 돌아왔는데, 여기서 data 만 보고 기본값을 유지한 채
       harvested_at 도장을 그대로 찍었다 — 검증 통과한 16곳이 사라지고 영상은 '처리됨'이 됐다.
       이제 실패하면 도장을 찍지 않고 오류를 그대로 올린다(다음 회차에 다시 온다). */
    const { data, error } = await supa.rpc("food_ingest", { p_items: items });
    if (error) {
      ingestErr = String(error.message || error).slice(0, 200);
      return j({ ok: false, reason: "ingest_failed", detail: ingestErr,
                 channel, picked: list.length, extracted, verified, dropped }, 500);
    }
    res = data || res;
  }
  for (let i = 0; i < done.length; i += 200) {
    await supa.rpc("food_videos_mark_harvested", { p_ids: done.slice(i, i + 200) });
  }
  return j({ ok: true, channel, picked: list.length, extracted, verified, dropped, ...res,
             halted: halted || undefined, ai: aiErrors.slice(0, 3) });
});
