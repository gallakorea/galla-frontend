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

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
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

/* 스니펫 → 상호 후보. 지역까지 같이 뽑아야 동명이인을 줄일 수 있다. */
async function extractNames(channel: string, snippets: string[]): Promise<{ name: string; region?: string }[]> {
  if (!snippets.length || !DS) return [];
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
  const r = await fetch(CHAT_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${DS}` },
    body: JSON.stringify({
      model: MODEL, temperature: 0,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: sys },
                 { role: "user", content: snippets.join("\n---\n").slice(0, 12000) }],
    }),
  });
  if (!r.ok) return [];
  try {
    const t = (await r.json())?.choices?.[0]?.message?.content || "{}";
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
  const r = await fetch(u, { headers: { "X-Naver-Client-Id": S_ID, "X-Naver-Client-Secret": S_SEC } });
  if (!r.ok) return null;
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
  if (!DS) return j({ ok: false, reason: "no_ai_key" }, 500);

  const url = new URL(req.url);
  const only = url.searchParams.get("channel");
  const extra = url.searchParams.get("q") || "";
  /* 다각도 수집 — 한 줄만 치면 상위 몇 개만 본다.
     표현 × 지역으로 갈라 훑으면 같은 채널에서 훨씬 넓게 긁힌다.
     네이버 검색은 일 25,000회라 이 정도 조합은 여유롭다. */
  const REGIONS = ["", "서울", "부산", "대구", "인천", "광주", "대전", "울산",
                   "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"];
  const PHRASES = ["맛집", "다녀간 맛집", "나온 식당", "방문 맛집"];
  const deep = url.searchParams.get("deep") === "1";
  const regions = deep ? REGIONS : REGIONS.slice(0, 9);
  const phrases = deep ? PHRASES : PHRASES.slice(0, 2);

  const { data: chans } = await supa.from("food_channels")
    .select("slug,name,active").eq("active", true).order("sort");

  const report: any[] = [];
  let added = 0;

  for (const c of (chans || []) as any[]) {
    if (only && c.slug !== only) continue;
    try {
      /* 표현 × 지역 스윕. 스니펫은 한데 모으고, 상호는 이름으로 중복을 걷은 뒤
         **한 번씩만** 검증한다 — 검증이 제일 비싼 단계라 여기서 아껴야 한다. */
      const snips: string[] = [];
      for (const ph of phrases) {
        for (const rg of regions) {
          const q = `${c.name} ${rg} ${ph}${extra ? " " + extra : ""}`.replace(/\s+/g, " ").trim();
          const b = await nsearch("blog", q, 30);
          snips.push(...(b.items || []));
          if (!rg) { const n = await nsearch("news", q, 15); snips.push(...(n.items || [])); }
          await new Promise((s) => setTimeout(s, 40));
        }
      }
      if (!snips.length) { report.push({ ch: c.slug, snippets: 0 }); continue; }

      /* 스니펫이 많으면 AI 한 번에 다 못 넣는다 — 덩어리로 나눠 뽑고 이름으로 합친다 */
      const chunks: string[][] = [];
      for (let i = 0; i < snips.length; i += 40) chunks.push(snips.slice(i, i + 40));
      const seen = new Set<string>();
      const cands: { name: string; region?: string }[] = [];
      for (const ck of chunks.slice(0, 8)) {
        for (const x of await extractNames(c.name, ck)) {
          const k = x.name.replace(/\s/g, "").toLowerCase();
          if (seen.has(k)) continue;
          seen.add(k); cands.push(x);
        }
      }
      const items: any[] = [];
      for (const cd of cands) {
        const v = await verify(cd.name, cd.region || "");
        if (v) items.push({ ...v, channel: c.slug, origin: "yt" });
        await new Promise((s) => setTimeout(s, 90));
      }
      let res: any = { new: 0, dup: 0 };
      if (items.length) {
        const { data } = await supa.rpc("food_ingest", { p_items: items });
        res = data || res;
      }
      added += res.new || 0;
      report.push({ ch: c.slug, snippets: snips.length, cands: cands.length,
                    verified: items.length, ...res });
    } catch (e) {
      report.push({ ch: c.slug, err: String(e).slice(0, 140) });
    }
  }
  return j({ ok: true, added, report });
});
