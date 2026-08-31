// 백년가게 — 중소벤처기업부·소상공인시장진흥공단이 지정한 전국 1,407곳.
//
// ⚖️ 이건 남의 편집물이 아니라 정부가 공개한 개방 데이터다(이용허락범위 제한 없음).
//    그대로 재배포하지 않고, 우리 서비스 화면에서 개별 점포로만 보여준다.
//
// ⚠️ 목록에 음식점만 있는 게 아니다 — 서점·전자상가·의료기·안전용품점이 섞여 있다.
//    (실측: 제일스포츠, 정우상사, 협신전자, 대한서림, 고려화문석 …)
//    그래서 이름을 그대로 믿지 않고 **네이버 지역검색으로 한 건씩 검증**해서
//    음식점 카테고리만 남기고 좌표까지 받아온다. 디스커버리와 같은 관문을 쓴다.
//
// ⚠️ 좌표가 원본에 없다. 주소만 있다. 지역검색이 좌표를 주는 건만 지도에 오른다.
//
// 🔑 DATA_GO_KR_KEY (공공데이터포털 일반 인증키), NAVER_CLIENT_ID / NAVER_CLIENT_SECRET

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const GOV = Deno.env.get("DATA_GO_KR_KEY") || "";
const S_ID = Deno.env.get("NAVER_SEARCH_ID") || Deno.env.get("NAVER_CLIENT_ID") || "";
const S_SEC = Deno.env.get("NAVER_SEARCH_SECRET") || Deno.env.get("NAVER_CLIENT_SECRET") || "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

const DATASET = "15132695";
const UDDI = "uddi:82fc1cc1-f636-46fc-ae0d-b1f2da5052b4";

const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const strip = (s: string) => String(s || "").replace(/<[^>]*>/g, "").replace(/&[a-z]+;/g, " ").trim();

/* 검증 관문 — discover-food-places 와 같은 가드(음식점만·지역일치·체인지점 금지) */
const FOOD_RE = /^(음식점|카페|제과|베이커리|술집|주점)/;
const isFood = (c: string) => FOOD_RE.test(c) || /음식|카페|한식|중식|일식|양식|분식|치킨|호프|주점|베이커리|제과/.test(c);
function pickCoord(mapx: string, mapy: string) {
  let lon = Number(mapx), lat = Number(mapy);
  if (!isFinite(lon) || !isFinite(lat)) return {} as { lat?: number; lon?: number };
  if (Math.abs(lon) > 1000) { lon /= 1e7; lat /= 1e7; }
  if (lat < 33 || lat > 39.5 || lon < 124 || lon > 132) return {};
  return { lat, lon };
}
/* 원본 주소에서 '시도 + 시군구'만 뽑아 지역 힌트로 쓴다 — 동명 상호를 가른다. */
function hintOf(addr: string) {
  const t = String(addr || "").trim().split(/\s+/);
  return t.slice(0, 2).join(" ");
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
  if (!r.ok) return null;
  const items = (await r.json())?.items || [];
  const norm = (s: string) => s.replace(/\s/g, "").toLowerCase();
  const want = norm(name);
  const best = items.find((it: any) => {
    const t = norm(strip(it.title));
    if (!(t.includes(want) || want.includes(t))) return false;
    if (!isFood(strip(it.category))) return false;          // 🔴 여기서 서점·전자상가가 떨어진다
    const a = strip(it.roadAddress) || strip(it.address);
    return !!a && regionOk(hint, a);
  });
  if (!best) return null;
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

Deno.serve(async (req) => {
  const xcron = req.headers.get("x-cron-secret") || "";
  const auth = req.headers.get("authorization") || "";
  if (CRON_SECRET && xcron !== CRON_SECRET && !auth.includes(CRON_SECRET)) {
    return j({ ok: false, reason: "unauthorized" }, 401);
  }
  if (!GOV) return j({ ok: false, reason: "no_gov_key" }, 500);
  if (!S_ID || !S_SEC) return j({ ok: false, reason: "no_search_key" }, 500);

  const url = new URL(req.url);
  /* ⚠️ 엣지 함수는 유휴 150초에서 끊긴다. 1,407건을 한 번에 검증하면 못 끝낸다
     (검증 1건당 ~90ms → 2분 이상). 구간을 잘라 여러 번 돈다. */
  const offset = Number(url.searchParams.get("offset") || "0");
  const limit = Math.min(Number(url.searchParams.get("limit") || "300"), 500);

  const api = new URL(`https://api.odcloud.kr/api/${DATASET}/v1/${UDDI}`);
  api.searchParams.set("page", String(Math.floor(offset / limit) + 1));
  api.searchParams.set("perPage", String(limit));
  api.searchParams.set("serviceKey", GOV);
  const g = await fetch(api);
  if (!g.ok) return j({ ok: false, reason: `gov_${g.status}`, body: (await g.text()).slice(0, 200) }, 502);
  const gd = await g.json();
  const rows = (gd?.data || []) as any[];

  let checked = 0, kept = 0, notFood = 0;
  const items: any[] = [];
  for (const r of rows) {
    const name = String(r["업체명"] || "").trim();
    const addr = String(r["업체주소"] || "").trim();
    if (name.length < 2 || !addr) continue;
    checked++;
    const v = await verify(name, addr);
    if (!v) { notFood++; await new Promise((s) => setTimeout(s, 70)); continue; }
    kept++;
    items.push({ ...v, channel: "baengnyeon", origin: "gov" });
    await new Promise((s) => setTimeout(s, 70));
  }

  let res: any = { new: 0, dup: 0 };
  if (items.length) {
    const { data } = await supa.rpc("food_ingest", { p_items: items });
    res = data || res;
  }
  return j({ ok: true, total: gd?.totalCount, offset, checked, kept, dropped: notFood, ...res });
});
