// 여행 영상에서 '그 사람이 실제로 간 곳'을 만들어낸다.
//
// 맛집(harvest-creator-places)과 골격은 같고, **검증 관문이 다르다**.
//   맛집: 설명에 적힌 도로명 주소 → 네이버 지역검색
//   여행: 주소가 없다. 크리에이터는 "훈자마을", "기요미즈데라"처럼 이름만 말한다.
//         → LLM 이 현지어/영문 표기까지 함께 뽑고, 그 이름으로 실재를 확인한다.
//
// 🌍 검증 관문 (돈 안 드는 것만 쓴다 — 구글 Places 는 종량과금이라 아직 안 켠다)
//   ① 국내(KR) → 한국관광공사 TourAPI 키워드 검색(공공누리, 좌표+대표이미지까지 준다)
//   ② 해외     → OSM Nominatim 검색(초당 1회·하루 장부). 결과에 wikidata QID 가 붙어 오면
//                ③ 위키데이터(CC0)에서 좌표·한국어 표기·대표사진을 받아 **좌표 출처를 CC0 로 승격**한다.
//   ④ 어디에도 없으면 버린다. LLM 이 지어낸 장소가 들어가면 지도가 통째로 거짓말이 된다.
//
// ⚖️ 사진은 우리 서버에 복제하지 않는다. 커먼즈 원본 URL 을 참조하고 저작자·라이선스를
//    photo_credit 에 담아 화면에 띄운다(CC BY-SA 등은 표시가 의무다).
//
// ⚠️ 도장(harvested_at)은 **결과와 무관하게** 찍는다. 안 그러면 실패한 영상을 매 회차
//    다시 LLM 에 태운다 — 맛집에서 하루에 네 번 밟은 함정이다.
// ⚠️ 엣지 유휴 150초. Nominatim 은 정책상 1초에 한 번이라 이 함수의 시간은 거의 전부
//    지오코딩 대기다. 영상 수(n)를 작게 잡고 자주 도는 게 맞다.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const DS = Deno.env.get("DEEPSEEK_API_KEY") || "";
const GEM = Deno.env.get("GEMINI_API_KEY") || "";
const GOV = Deno.env.get("DATA_GO_KR_KEY") || "";
const CHAT_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-chat";
/* Nominatim 정책: 실명 연락처가 담긴 User-Agent 가 의무다. 없으면 차단된다. */
const UA = "GallaTravel/1.0 (https://galla.im; contact@galla.im)";

const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const strip = (s: string) => String(s || "").replace(/<[^>]*>/g, "").replace(/&[a-z]+;/g, " ").trim();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (s: string) => String(s || "").replace(/[\s·・'"`.,\-()]/g, "").toLowerCase();

/* ── LLM — 딥시크 우선, 402/401 이면 제미나이(다른 함수와 같은 규약) ──
   ⚠️ 잔액이 마르면 추출이 통째로 0건이 되는데 리포트에 흔적이 없어 '수집이 안 된다'로
      오진하기 딱 좋다(맛집 실측). AI 에러는 반드시 응답에 실어 올린다. */
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

/* 추출 규약 — 사장님: "설명란과 번역 뒤지면 충분".
   실측이 이 프롬프트를 두 층으로 만들었다(2026-09-01):
     · 한국 채널  : 제목·설명이 지역에서 멈춘다("방글라데시","에티오피아") → scale=country/city 로만 잡힌다
     · 영어권 채널: 설명에 "📍 Super Shinwari Restaurant, Kabul, Afghanistan" 처럼 상호를 그대로 적는다
                    (제휴 링크 관행 덕이다) → scale=spot 으로 알짜가 나온다
   두 층을 다 받는다. 지역만 나오는 영상도 '그 크리에이터가 어디를 갔나'는 남는다.

   ⚠️ '현지 표기/영문 표기'가 이 파이프라인의 생명줄이다 — OSM·위키데이터는
      '기요미즈데라'로는 안 걸리고 'Kiyomizu-dera'·'清水寺'로는 걸린다.
   ⚠️ 번역 방향: 검증은 영문/현지 표기로 하고, **한국어 표기(name)는 만들어 준다**.
      우리 유저가 읽는 건 한국어여야 한다. 위키데이터에 ko 라벨이 있으면 그걸로 덮어쓴다. */
const SYS = [
  "너는 여행 유튜브 영상의 제목과 설명(한국어 또는 영어)에서 '그 영상에서 실제로 방문한 곳'을 뽑는 추출기다.",
  "규칙:",
  "1) 두 종류를 뽑는다.",
  "   · scale='spot'   : 구체적인 장소(식당·사찰·전망대·시장·호텔·마을 등). 있으면 이게 제일 중요하다.",
  "   · scale='city'/'region'/'country' : 구체 장소가 없더라도, 그 영상이 다녀온 도시·지역·나라는 남긴다.",
  "     (영상 한 편에 지역은 최대 2개까지. 나라만 알면 country 하나로 충분하다)",
  "2) name_local 또는 name_en 을 **반드시** 채운다(清水寺, Bánh Mì Phượng, Super Shinwari Restaurant).",
  "   확실하지 않으면 그 항목을 아예 빼라. 지어내지 않는다.",
  "3) name 은 **한국어 표기**로 쓴다. 영어 설명이면 한국에서 통용되는 표기로 옮긴다",
  "   (Kabul→카불, Kiyomizu-dera→기요미즈데라, Super Shinwari Restaurant→수퍼 신와리 레스토랑).",
  "4) country_code 는 ISO 2자리 대문자(JP, VN, KR, AF …), city 는 영문 도시명.",
  "5) kind: 식당·카페·음식 = food, 숙소 = stay, 투어·액티비티 = activity, 그 외 = spot.",
  "6) 협찬사·항공사·보험·유심·카메라 장비·제휴 상품은 장소가 아니다. 제외한다.",
  "7) 한 영상에서 최대 5개. 확실하지 않으면 빈 배열.",
  'JSON 만: {"places":[{"scale":"spot","name":"한국어 표기","name_local":"현지 표기","name_en":"영문 표기",' +
    '"city":"영문 도시명","country_code":"AF","country":"아프가니스탄","kind":"food"}]}',
].join("\n");

/* 지도에 점으로 찍을 수 없는 것들 — 대륙·대양·극지방.
   ⚠️ 실측 사고: LLM 이 '북극'을 country_code=AE 로 줬고, 두바이 안에서 'Arctic' 이라는
      업소가 걸려 **북극이 두바이에 꽂혔다**. 이런 이름은 검증을 통과해도 뜻이 없다.
      (남극은 실제 목적지지만 나라 좌표계가 없어 마찬가지로 제외한다 — 나중에 별도로 다룬다.) */
const MACRO = /^(북극|남극|arctic|antarctic(a)?|유럽|아시아|아프리카|아메리카|오세아니아|중동|동남아(시아)?|북미|남미|중남미|서유럽|동유럽|남미대륙|태평양|대서양|인도양|지중해|europe|asia|africa|america|oceania|middle\s*east|pacific|atlantic|indian\s+ocean)$/i;

/* ── ② 해외: OSM Nominatim ────────────────────────────
   ⚖️ ODbL 이다. 실재 확인과 좌표 용도로만 쓰고 화면에 출처를 표시한다.
      QID 가 딸려 오면 좌표를 위키데이터(CC0) 것으로 갈아끼운다(geo_source 로 구분).  */
async function nominatim(q: string, cc: string | null) {
  const u = new URL("https://nominatim.openstreetmap.org/search");
  u.searchParams.set("q", q);
  u.searchParams.set("format", "jsonv2");
  u.searchParams.set("limit", "1");
  u.searchParams.set("extratags", "1");
  u.searchParams.set("namedetails", "1");
  u.searchParams.set("addressdetails", "1");
  if (cc) u.searchParams.set("countrycodes", cc.toLowerCase());
  const r = await fetch(u, { headers: { "User-Agent": UA, "Accept-Language": "ko,en" } });
  if (!r.ok) throw new Error(`nominatim_${r.status}`);
  const d = await r.json();
  return Array.isArray(d) && d[0] ? d[0] : null;
}

/* 광역(도·주·현) 보강 — 이 한 번이 '도쿄'를 살린다.
   ⚠️ 실측: 롯폰기 좌표를 zoom=10 으로 물으면 address 에 city='미나토구' 뿐이고 광역이 없다.
      zoom=8 로 물어야 province='도쿄도' 가 나온다. 검색(forward) 결과만 믿으면
      일본 장소가 전부 '○○구'로 흩어져 사장님이 말한 "일본 → 도쿄"가 화면에서 사라진다.
   정방향 검색에 광역이 이미 있으면 부르지 않는다(공짜 호출이 아니다). */
async function admin1Of(lat: number, lon: number) {
  const u = new URL("https://nominatim.openstreetmap.org/reverse");
  u.searchParams.set("lat", String(lat));
  u.searchParams.set("lon", String(lon));
  u.searchParams.set("format", "jsonv2");
  u.searchParams.set("addressdetails", "1");
  u.searchParams.set("zoom", "8");
  const r = await fetch(u, { headers: { "User-Agent": UA, "Accept-Language": "ko,en" } });
  if (!r.ok) return null;
  const a = (await r.json())?.address || {};
  return a.state || a.province || a.region || a.county || null;
}

/* ── ③ 위키데이터(CC0) — 좌표·한국어 표기·대표사진 ──── */
async function wikidata(qid: string) {
  const r = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`,
                        { headers: { "User-Agent": UA } });
  if (!r.ok) return null;
  const ent = (await r.json())?.entities?.[qid];
  if (!ent) return null;
  const claim = (p: string) => ent?.claims?.[p]?.[0]?.mainsnak?.datavalue?.value;
  const coord: any = claim("P625");
  const img: any = claim("P18");
  const ccQid: any = ent?.claims?.["P17"]?.[0]?.mainsnak?.datavalue?.value?.id || null;
  const types: string[] = (ent?.claims?.["P31"] || [])
    .map((c: any) => c?.mainsnak?.datavalue?.value?.id).filter(Boolean);
  return {
    ko: ent?.labels?.ko?.value || null,
    en: ent?.labels?.en?.value || null,
    lat: coord?.latitude ?? null,
    lon: coord?.longitude ?? null,
    file: typeof img === "string" ? img : null,
    countryQid: ccQid,
    types,
  };
}

/* 위키데이터 항목 + 국가 ISO 코드(P17 → P297). 국가 대조에 쓴다. */
const ccCache = new Map<string, string | null>();
async function wikidataFull(qid: string) {
  const w = await wikidata(qid);
  if (!w) return null;
  let cc: string | null = null;
  if (w.countryQid) {
    if (ccCache.has(w.countryQid)) cc = ccCache.get(w.countryQid)!;
    else {
      try {
        const r = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${w.countryQid}.json`,
                              { headers: { "User-Agent": UA } });
        const ent = r.ok ? (await r.json())?.entities?.[w.countryQid] : null;
        cc = ent?.claims?.["P297"]?.[0]?.mainsnak?.datavalue?.value || null;
      } catch (_) { cc = null; }
      ccCache.set(w.countryQid, cc);
    }
  }
  return { ...w, cc };
}

/* ── ②-b 위키데이터 검색 폴백 ─────────────────────────
   OSM 은 '가게'에 강하고 위키데이터는 '알려진 곳'에 강하다. 서로 구멍이 다르다.
   실측(2026-09-01): Nominatim 단독은 마크 위언스 6편에서 16건 중 3건만 통과했다.
   ⚠️ 이름만 같고 딴 나라인 항목이 흔하다 — P17(국가)로 반드시 대조한다. */
/* ⚠️ scale='spot' 인데 도시가 걸려 오는 사고를 막는다.
   실측: "Tokyo Station" 이 도쿄시(Q1490)로, "Hiroshima Station" 이 히로시마시로 들어왔다.
   역·명소를 찾는 자리에 도시가 앉으면 목록에 같은 도시가 여러 번 뜬다. */
const CITYISH = new Set(["Q515","Q3957","Q532","Q486972","Q1549591","Q15284","Q6256","Q7930989","Q1637706"]);
async function wikidataSearch(name: string, cc: string | null, scale = "spot") {
  const u = new URL("https://www.wikidata.org/w/api.php");
  u.searchParams.set("action", "wbsearchentities");
  u.searchParams.set("search", name);
  u.searchParams.set("language", "en");
  u.searchParams.set("uselang", "en");
  u.searchParams.set("format", "json");
  u.searchParams.set("limit", "5");
  const r = await fetch(u, { headers: { "User-Agent": UA } });
  if (!r.ok) return null;
  const hits = (await r.json())?.search || [];
  for (const h of hits.slice(0, 3)) {
    const qid = h?.id;
    if (!/^Q\d+$/.test(qid || "")) continue;
    const e = await wikidataFull(qid);
    if (!e || e.lat == null) continue;
    if (cc && e.cc && e.cc !== cc) continue;          // 다른 나라의 동명이인
    if (scale === "spot" && e.types.some((t) => CITYISH.has(t))) continue;
    return { qid, ...e };
  }
  return null;
}

/* 커먼즈 사진의 저작자·라이선스. 표시가 의무인 라이선스가 대부분이라 credit 없이 쓰면 안 된다.
   한 회차의 파일을 모아 **한 번에** 물어본다(최대 50개). */
async function commonsCredits(files: string[]) {
  const out = new Map<string, string>();
  if (!files.length) return out;
  const u = new URL("https://commons.wikimedia.org/w/api.php");
  u.searchParams.set("action", "query");
  u.searchParams.set("titles", files.slice(0, 50).map((f) => "File:" + f).join("|"));
  u.searchParams.set("prop", "imageinfo");
  u.searchParams.set("iiprop", "extmetadata");
  u.searchParams.set("format", "json");
  u.searchParams.set("origin", "*");
  try {
    const r = await fetch(u, { headers: { "User-Agent": UA } });
    if (!r.ok) return out;
    const pages = (await r.json())?.query?.pages || {};
    for (const p of Object.values<any>(pages)) {
      const meta = p?.imageinfo?.[0]?.extmetadata || {};
      const artist = strip(meta?.Artist?.value || "").slice(0, 80);
      const lic = strip(meta?.LicenseShortName?.value || "").slice(0, 40);
      const title = String(p?.title || "").replace(/^File:/, "");
      const credit = [artist, lic].filter(Boolean).join(" · ");
      if (title) out.set(title, credit ? `${credit} / Wikimedia Commons` : "Wikimedia Commons");
    }
  } catch (_) { /* 크레딧 실패가 수집을 막지는 않는다 — 기본 문구로 간다 */ }
  return out;
}

/* ── ① 국내: 한국관광공사 TourAPI ─────────────────────
   국내는 OSM 보다 관광공사가 압도적으로 정확하다(좌표+대표이미지+분류를 한 번에 준다).
   ⚖️ 공공누리. cpyrhtDivCd 가 Type1/Type3 인 사진만 쓴다 — 비어 있으면 권리관계가 불분명하다. */
async function tourapi(name: string) {
  if (!GOV) return null;
  const u = `https://apis.data.go.kr/B551011/KorService2/searchKeyword2?serviceKey=${GOV}` +
            `&numOfRows=5&pageNo=1&MobileOS=ETC&MobileApp=GALLA&_type=json` +
            `&keyword=${encodeURIComponent(name)}`;
  const r = await fetch(u);
  if (!r.ok) throw new Error(`tourapi_${r.status}`);
  const body: any = await r.json();
  const items = body?.response?.body?.items?.item;
  const list = Array.isArray(items) ? items : items ? [items] : [];
  const want = norm(name);
  /* 🚨 여기가 국내 데이터를 통째로 오염시킨 자리다(실측 2026-09-01).
     searchKeyword2 는 **제목에 그 글자가 들어간 아무거나**를 돌려준다:
       '부산' → 감천사(부산) / '서울' → 가치서울 롯데백화점 / '남해' → 계남해변
       '제주' → 강촌제주산흑돼지 / '대한민국' → 광명마당극축제X대한민국마당극축제
     `title.includes(query)` 로 받으면 전부 통과한다. 관문을 셋으로 조인다:
       ⓐ 두 글자 이하 질의는 아예 안 받는다(부산·서울·제주가 여기서 걸린다)
       ⓑ 제목이 질의로 **시작**하거나 완전히 같아야 한다('계남해변'은 '남해'로 시작하지 않는다)
       ⓒ 질의가 제목보다 훨씬 짧으면(절반 미만) 다른 가게다 */
  if (want.length < 3) return null;
  const hit = list.find((it: any) => {
    const t = norm(it?.title);
    if (!t) return false;
    if (t === want) return true;
    return t.startsWith(want) && want.length >= t.length * 0.5;
  });
  if (!hit) return null;
  const lat = Number(hit.mapy), lon = Number(hit.mapx);
  if (!isFinite(lat) || !isFinite(lon)) return null;
  const okPhoto = hit.cpyrhtDivCd === "Type1" || hit.cpyrhtDivCd === "Type3";
  const addr1 = strip(hit.addr1) || "";
  return {
    name: strip(hit.title) || name,
    admin1: addr1.split(/\s+/)[0] || null,      /* '서울특별시 종로구 …' → 서울특별시 */
    city: addr1.split(/\s+/)[1] || null,
    address: addr1 || null,
    lat, lon,
    photo: okPhoto && hit.firstimage ? String(hit.firstimage) : null,
    photo_credit: okPhoto && hit.firstimage ? "한국관광공사" : null,
    photo_source: okPhoto && hit.firstimage ? "tour" : null,
  };
}

/* OSM 분류 → 우리 kind·category */
function classify(cat: string, type: string) {
  const t = `${cat}/${type}`;
  if (/^amenity\/(restaurant|fast_food|food_court|ice_cream)/.test(t)) return { kind: "food", category: "식당" };
  if (/^amenity\/(cafe|bar|pub|biergarten)/.test(t)) return { kind: "food", category: "카페·바" };
  if (/^tourism\/(hotel|hostel|guest_house|motel|apartment)/.test(t)) return { kind: "stay", category: "숙소" };
  if (/^tourism\/(museum|gallery)/.test(t)) return { kind: "spot", category: "박물관·미술관" };
  if (/^tourism\/(viewpoint)/.test(t)) return { kind: "spot", category: "전망대" };
  if (/^amenity\/place_of_worship/.test(t)) return { kind: "spot", category: "사찰·성당" };
  if (/^(historic|tourism\/attraction|tourism\/theme_park)/.test(t)) return { kind: "spot", category: "명소" };
  if (/^natural\/(beach|peak|water|waterfall)/.test(t)) return { kind: "spot", category: "자연" };
  if (/^leisure\/park/.test(t)) return { kind: "spot", category: "공원" };
  if (/^shop\/|^amenity\/marketplace/.test(t)) return { kind: "spot", category: "시장·상점" };
  return { kind: "spot", category: null as string | null };
}

Deno.serve(async (req) => {
  const xcron = req.headers.get("x-cron-secret") || "";
  const auth = req.headers.get("authorization") || "";
  if (CRON_SECRET && xcron !== CRON_SECRET && !auth.includes(CRON_SECRET)) {
    return j({ ok: false, reason: "unauthorized" }, 401);
  }

  const url = new URL(req.url);
  let channel = url.searchParams.get("channel") || "";
  const n = Math.min(Number(url.searchParams.get("n") || "8"), 20);

  if (!channel) {
    const { data } = await supa.rpc("travel_channel_to_harvest");
    channel = (data || [])[0]?.slug || "";
  }
  if (!channel) return j({ ok: true, picked: 0, note: "수확할 채널 없음" });

  const { data: vids } = await supa.rpc("travel_videos_to_harvest", { p_channel: channel, p_limit: n });
  const list = (vids || []) as any[];
  if (!list.length) return j({ ok: true, channel, picked: 0, note: "수확할 영상 없음" });

  /* 💰 지오코딩 하루 몫을 먼저 받는다. 영상당 최대 5곳 × (1차 + 도시명 뗀 재시도) 이라
        넉넉히 잡고 안 쓴 몫은 끝에 돌려준다.
        ⚠️ 3배로 잡았더니 6편짜리 한 회차가 'budget' 으로 중간에 끊겼다(실측 2026-09-01). */
  const { data: allow } = await supa.rpc("travel_geo_take", { p_want: list.length * 8 });
  const budget = Number(allow || 0);
  if (budget <= 0) return j({ ok: true, channel, picked: 0, note: "지오코딩 하루 몫 소진" });

  /* ⏱ 시간 상자 — 엣지 유휴 150초를 넘기면 회차가 **통째로 날아간다**(응답도 안 남는다).
     실측: n=45 회차가 그렇게 사라졌다. 편수로 조절하면 영상마다 걸리는 시간이 달라
     매번 아슬아슬하다(LLM 2~4초 + 지오코딩 1.1초씩). 그래서 편수가 아니라 **시계**로 끊는다.
     110초에 도달하면 하던 것까지 저장하고 정상 종료한다 — 남은 영상은 다음 회차가 가져간다. */
  const DEADLINE = Date.now() + 110_000;

  const items: any[] = [];
  const done: string[] = [];
  const wantCredit = new Map<string, any[]>();     // 커먼즈 파일명 → 그 파일을 쓰는 item 들
  let extracted = 0, verified = 0, dropped = 0, geoCalls = 0;
  const dropSamples: string[] = [];   // 검증에 떨어진 이름 — 왜 안 들어오는지 눈으로 봐야 고친다
  let halted = "";

  for (const v of list) {
    if (halted) break;
    if (Date.now() > DEADLINE) { halted = "시간 상자(110초) 도달"; break; }
    done.push(v.video_id);                        // 결과와 무관하게 '물어봤다'를 남긴다
    let places: any[] = [];
    try {
      const raw = await chatJson(
        SYS, `제목: ${v.title}\n\n설명:\n${String(v.description || "").slice(0, 2500)}`);
      places = raw ? (JSON.parse(raw)?.places || []) : [];
    } catch (_) { places = []; }
    extracted += places.length;

    for (const p of places.slice(0, 5)) {         // 한 영상에서 다섯까지 — 그 이상은 나열일 확률이 높다
      const ko = String(p?.name || "").trim();
      const local = String(p?.name_local || "").trim();
      const en = String(p?.name_en || "").trim();
      const city = String(p?.city || "").trim();
      const cc = String(p?.country_code || "").trim().toUpperCase();
      const scale = ["country", "region", "city", "spot"].includes(p?.scale) ? p.scale : "spot";
      const query = en || local;
      if (ko.length < 2 || !query) { dropped++; continue; }
      if (MACRO.test(ko.trim()) || MACRO.test(query.trim())) {
        dropped++;
        if (dropSamples.length < 10) dropSamples.push(ko + " (대륙·극지 등 점으로 못 찍음)");
        continue;
      }
      if (geoCalls >= budget) { halted = "budget"; done.pop(); break; }

      let hit: any = null;
      try {
        if (cc === "KR" && scale === "spot") {
          /* ⚠️ 관광공사는 **개별 장소 검색기**다. '서울'·'제주' 같은 지역명을 던지면
             그 글자가 든 엉뚱한 가게를 돌려준다. 지역 단위는 OSM/위키데이터로 보낸다. */
          geoCalls++;
          const t = await tourapi(ko || query);
          if (t) {
            hit = { ...t, name_ko: t.name, geo_source: "tour", category: null, kind: p?.kind || "spot" };
          } else {
            /* 관광공사에 없는 국내 장소(식당·카페가 대부분)는 OSM 으로 한 번 더 본다 */
            await sleep(1100);
            geoCalls++;
            const o = await nominatim([query, city, "South Korea"].filter(Boolean).join(", "), "KR");
            if (o && nameLooksSame(o, query)) hit = fromOsm(o, ko, scale);
          }
        } else {
          geoCalls++;
          /* 지역(도시·나라)은 도시명을 덧붙이면 오히려 안 걸린다 — 이름 하나로 묻는다. */
          const q = scale === "spot" ? [query, city].filter(Boolean).join(", ") : query;
          const o = await nominatim(q, cc || null);
          await sleep(1100);                       // Nominatim 정책: 초당 1회
          if (o && nameLooksSame(o, query)) hit = fromOsm(o, ko, scale);
          /* 1차 실패 — 도시명을 떼고 이름 하나로 한 번 더. OSM 의 도시 경계 밖(교외·시장 안)에
             찍힌 가게가 이 한 번에 걸린다. */
          if (!hit && scale === "spot" && city && geoCalls < budget) {
            geoCalls++;
            const o2 = await nominatim(query, cc || null);
            await sleep(1100);
            if (o2 && nameLooksSame(o2, query)) hit = fromOsm(o2, ko, scale);
          }
        }
        /* 2차 실패 — 위키데이터 검색(OSM 과 구멍이 다르다: OSM 은 가게에, 위키데이터는
           알려진 곳에 강하다). 무료 API 라 지오코딩 장부는 쓰지 않는다. */
        if (!hit) {
          const w = await wikidataSearch(query, cc || null, scale);
          if (w) {
            hit = {
              name_ko: w.ko || ko, name_en: w.en || en || null,
              address: null, city: city || null, country_code: cc || w.cc || null,
              lat: w.lat, lon: w.lon, category: null, kind: "spot",
              qid: w.qid, osm_ref: null, geo_source: "wikidata",
              photo: null, photo_credit: null, photo_source: null,
            };
          }
        }
      } catch (e) {
        /* 인프라 실패('못 불렀다')와 '못 찾았다'를 가른다. 이 영상은 도장을 빼고 중단한다 —
           둘을 뭉개면 한도가 막힌 동안 멀쩡한 장소가 '물어봤음'으로 영구히 박힌다. */
        halted = String(e).slice(0, 60);
        done.pop();
        break;
      }
      if (!hit) {
        /* ⚠️ 버리지 않는다. '이 크리에이터가 이 도시에서 여길 갔다'까지는 이미 사실이고,
           없는 건 좌표뿐이다 → status='pending' 으로 남겨 **지도에는 안 올리고** 목록·상세에서만 쓴다.
           맛집은 여기서 통째로 버렸고 그래서 무명 가게가 영원히 안 들어왔다.
           단 지어낸 이름이 섞일 수 있으므로 live 로는 절대 올리지 않는다(정밀도는 나중에 측정). */
        dropped++;
        if (dropSamples.length < 10) dropSamples.push(`${query}${city ? " / " + city : ""}`);
        items.push({
          name: ko, name_local: local || null, name_en: en || null,
          country_code: cc || null, country: String(p?.country || "").trim() || null,
          city: city || null,
          kind: ["spot","food","stay","activity"].includes(p?.kind) ? p.kind : "spot",
          scale, status: "pending", origin: "yt", channel,
          video_id: v.video_id, video_title: v.title, aired_at: v.published_at,
        });
        continue;
      }

      /* 광역이 비었으면 한 번 더 물어 채운다(도쿄·마카오처럼 광역이 안 딸려오는 곳). */
      /* ⚠️ 나라·광역 단위 행은 좌표가 '나라 중심점'이라 역지오코딩이 엉뚱한 주를 준다
         (우간다 → Nakasongola, 페루 → Huánuco). 스팟·도시에만 묻는다. */
      if (!hit.admin1 && hit.lat != null && geoCalls < budget
          && (scale === "spot" || scale === "city")) {
        geoCalls++;
        try { hit.admin1 = await admin1Of(hit.lat, hit.lon); } catch (_) {}
        await sleep(1100);
      }

      /* QID 가 있으면 위키데이터(CC0)에서 좌표·한국어 표기·사진을 받아 승격한다. */
      if (hit.qid) {
        const w = await wikidata(hit.qid);
        if (w) {
          if (w.lat != null && w.lon != null) { hit.lat = w.lat; hit.lon = w.lon; hit.geo_source = "wikidata"; }
          if (w.ko) hit.name_ko = w.ko;
          if (w.en && !hit.name_en) hit.name_en = w.en;
          if (w.file) {
            hit.photo = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(w.file)}?width=800`;
            hit.photo_source = "commons";
            hit._file = w.file;
          }
        }
      }

      verified++;
      const item: any = {
        name: hit.name_ko || ko,
        name_local: local || null,
        name_en: hit.name_en || en || null,
        country_code: hit.country_code || cc || null,
        country: String(p?.country || "").trim() || null,
        admin1: hit.admin1 || null,
        city: hit.city || city || null,
        address: hit.address || null,
        lat: hit.lat != null ? String(hit.lat) : null,
        lon: hit.lon != null ? String(hit.lon) : null,
        category: hit.category || null,
        kind: ["spot", "food", "stay", "activity"].includes(p?.kind) ? p.kind : (hit.kind || "spot"),
        scale,
        wikidata_qid: hit.qid || null,
        osm_ref: hit.osm_ref || null,
        geo_source: hit.geo_source || null,
        photo: hit.photo || null,
        photo_credit: hit.photo_credit || null,
        photo_source: hit.photo_source || null,
        origin: "yt",
        channel,
        video_id: v.video_id, video_title: v.title, aired_at: v.published_at,
      };
      items.push(item);
      if (hit._file) {
        const arr = wantCredit.get(hit._file) || [];
        arr.push(item); wantCredit.set(hit._file, arr);
      }
    }
  }

  /* 커먼즈 크레딧을 한 번에 받아 붙인다(파일 50개까지 한 호출). */
  if (wantCredit.size) {
    const credits = await commonsCredits([...wantCredit.keys()]);
    for (const [file, arr] of wantCredit) {
      const c = credits.get(file) || "Wikimedia Commons";
      for (const it of arr) it.photo_credit = c;
    }
  }

  if (budget > geoCalls) await supa.rpc("travel_geo_refund", { p_n: budget - geoCalls });

  let res: any = { new: 0, dup: 0 };
  if (items.length) {
    const { data, error } = await supa.rpc("travel_ingest", { p_items: items });
    if (error) return j({ ok: false, channel, error: error.message.slice(0, 200) }, 500);
    res = data || res;
  }
  for (let i = 0; i < done.length; i += 200) {
    await supa.rpc("travel_videos_mark_harvested", { p_ids: done.slice(i, i + 200) });
  }
  await supa.from("travel_channels").update({ last_harvest_at: new Date().toISOString() }).eq("slug", channel);

  return j({ ok: true, channel, picked: list.length, extracted, verified, dropped,
             geoCalls, took: Math.round((Date.now() - (DEADLINE - 110_000)) / 1000),
             ...res, halted: halted || undefined,
             misses: dropSamples, ai: aiErrors.slice(0, 3) });
});

/* Nominatim 응답 → 우리 모양. 여기서 걸러야 할 것:
   · 좌표 없는 결과
   · 나라/광역 행정구역 자체(place=country|state) — '일본' 핀이 지도에 꽂히는 걸 막는다 */
/* 우리가 찾던 이름과 결과의 이름이 서로 남남이면 버린다.
   ⚠️ 이 관문이 없으면 나라를 잘못 짚은 질의가 그 나라 안의 **아무 업소**로 확정된다
      (북극 → 두바이의 'Arctic'). 국내 관광공사 경로엔 이미 같은 관문이 있다. */
function nameLooksSame(o: any, query: string) {
  const n = (x: string) => String(x || "").toLowerCase().replace(/[\s'".,()\-·]/g, "");
  const want = n(query);
  if (want.length < 3) return true;                 // 너무 짧으면 이름으로 못 가른다
  const nd = o?.namedetails || {};
  const cands = [nd.name, nd["name:en"], nd["name:ko"], nd.official_name,
                 String(o?.display_name || "").split(",")[0]];
  return cands.some(function (c: any) {
    const g = n(c);
    return g && (g.includes(want) || want.includes(g));
  });
}

function fromOsm(o: any, ko: string, scale = "spot") {
  const lat = Number(o.lat), lon = Number(o.lon);
  if (!isFinite(lat) || !isFinite(lon)) return null;
  const cat = String(o.category || o.class || ""), type = String(o.type || "");
  /* 나라·광역 행정구역은 **여행지 층에서만** 허용한다. scale='spot' 인데 나라가 걸려 오면
     그건 추출 실패다 — 지도에 '일본' 핀 하나가 꽂히고 목록 맨 위를 차지하게 된다. */
  const isArea = (cat === "place" && /^(country|state|region|province|city|town|village|island|suburb)$/.test(type))
                 || cat === "boundary";
  if (isArea && scale === "spot") return null;
  const cls = classify(cat, type);
  const addr = o.address || {};
  /* ⚠️ city 만 저장하면 '도쿄'가 화면에서 사라진다 — Nominatim 의 city 는 기초자치단체라
     도쿄가 '지요다구'·'미나토구'로 흩어지고 교토가 '교토시'가 된다(실측).
     유저가 찾는 축은 광역(state/prefecture)이다. 둘 다 저장하고 화면은 광역으로 묶는다. */
  const admin1 = addr.state || addr.province || addr.region || addr["state_district"] || null;
  return {
    name_ko: o?.namedetails?.["name:ko"] || ko,
    name_en: o?.namedetails?.["name:en"] || null,
    address: String(o.display_name || "").slice(0, 300),
    admin1: admin1,
    city: addr.city || addr.town || addr.village || addr.municipality || addr.county || null,
    country_code: String(addr.country_code || "").toUpperCase() || null,
    lat, lon,
    category: cls.category,
    kind: cls.kind,
    qid: o?.extratags?.wikidata && /^Q\d+$/.test(o.extratags.wikidata) ? o.extratags.wikidata : null,
    osm_ref: o.osm_type && o.osm_id ? `${o.osm_type}/${o.osm_id}` : null,
    geo_source: "osm",
    photo: null, photo_credit: null, photo_source: null,
  };
}
