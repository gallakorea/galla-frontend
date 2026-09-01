// 착한가격업소 → 메뉴·가격.
//
// 🔑 DATA_GO_KR_KEY (공공데이터포털 일반 인증키)
//
// 행정안전부_착한가격업소 현황(전국 12,645행)에는 업소명·주소와 **메뉴·가격이 컬럼으로** 있다.
// 우리가 메뉴를 못 붙이던 진짜 이유는 공급원이 없어서였다 — 네이버 지역검색은 메뉴 필드가
// 없고, 플레이스 페이지를 긁는 건 금지다. 여기는 정부가 정형으로 내주는 자리다.
//
// ⚠️ 여기서는 **가게를 새로 만들지 않는다**. 12,645행에는 이미용업·목욕업이 섞여 있고
//    좌표가 없어 한 건씩 네이버를 불러야 한다 — 오늘 하루 한도를 다 태운 게 정확히 그 짓이다.
//    이름·시군구가 맞는 기존 가게에만 메뉴를 얹는다. 외부 API 호출은 이 파일의 odcloud 뿐이다.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const GOV = Deno.env.get("DATA_GO_KR_KEY") || "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

const DATASET = "3045247";
const UDDI = "uddi:afd3af75-a7d4-403d-b6e0-823c848d935d";   // 2026-06-30 기준분, 분기 갱신

const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

/* 외식업만 남긴다. 데이터셋은 개인서비스업(이미용·목욕·세탁·숙박)을 같이 담고 있다. */
const FOOD = /한식|일식|중식|양식|분식|요식|외식|음식|식당|카페|커피|제과|제빵|치킨|피자|주점|뷔페|배달/;
/* ⚠️ NOT_FOOD 를 FOOD 보다 **먼저** 본다. '기타비요식업'에는 "요식" 이 들어 있어서
   FOOD 로만 거르면 당구장·미용실이 통과한다(실측 2026-09-01: 381건이 들어왔다). */
const NOT_FOOD = /비요식|이미용|미용업|이용업|목욕|세탁|숙박|사진|화원|자동차|학원|당구|서비스업\s*\(비/;

/** 컬럼 이름이 판마다 흔들린다(메뉴1/메뉴 1/menu1). 정규식으로 집는다. */
function pick(row: Record<string, unknown>, re: RegExp): string {
  for (const k of Object.keys(row)) {
    if (re.test(k.replace(/\s/g, ""))) {
      const v = row[k];
      if (v !== null && v !== undefined && String(v).trim() !== "") return String(v).trim();
    }
  }
  return "";
}

/** 메뉴N·가격N 을 짝지어 뽑는다. 가격이 숫자가 아니면(‘시가’·‘변동’) 버린다. */
function menusOf(row: Record<string, unknown>) {
  const out: { name: string; price: number }[] = [];
  for (let i = 1; i <= 12; i++) {
    const nm = pick(row, new RegExp(`^(메뉴|품목|대표품목)${i}$`));
    const pr = pick(row, new RegExp(`^(가격|금액)${i}$`));
    if (!nm) continue;
    const n = Number(pr.replace(/[^0-9]/g, ""));
    if (!n || n < 500 || n > 5_000_000) continue;      // 5백원 미만·5백만원 초과는 오타로 본다
    out.push({ name: nm.slice(0, 60), price: n });
  }
  return out;
}


/* ── 좌표 받아오기(resolve 모드) ─────────────────────────────────────────────
   정부 자료에는 상호·주소·메뉴·가격이 다 있는데 좌표만 없다. 그 한 칸을 네이버
   지역검색으로 채운다. 매칭 규칙은 harvest-creator-places 와 같게 맞춘다 —
   이름이 겹치고, 음식점 업종이고, 주소의 시도·시군이 맞을 때만 받는다. */
const S_ID = Deno.env.get("NAVER_SEARCH_ID") || Deno.env.get("NAVER_CLIENT_ID") || "";
const S_SEC = Deno.env.get("NAVER_SEARCH_SECRET") || Deno.env.get("NAVER_CLIENT_SECRET") || "";
const strip = (v: string) => String(v || "").replace(/<[^>]*>/g, "").replace(/&[a-z]+;/g, " ").trim();
const isFoodCat = (c: string) =>
  /음식|카페|한식|중식|일식|양식|분식|치킨|호프|주점|베이커리|제과|뷔페|국수|고기|해산물/.test(c);
const hintOf = (a: string) => String(a || "").trim().split(/\s+/).slice(0, 2).join(" ");
function regionOk(hint: string, addr: string) {
  const toks = (hint || "").split(/\s+/).filter((t) => t.length >= 2);
  if (!toks.length) return true;
  return toks.some((t) => addr.includes(t.replace(/(특별시|광역시|특별자치시|특별자치도|시|군|구)$/, "")));
}
function pickCoord(mapx: string, mapy: string) {
  let lon = Number(mapx), lat = Number(mapy);
  if (!isFinite(lon) || !isFinite(lat)) return {} as { lat?: number; lon?: number };
  if (Math.abs(lon) > 1000) { lon /= 1e7; lat /= 1e7; }
  if (lat < 33 || lat > 39.5 || lon < 124 || lon > 132) return {};   // 한반도 밖이면 버린다
  return { lat, lon };
}

/** 못 찾은 것(null)과 못 부른 것(throw)을 가른다 — 뒤엣것은 배치를 세운다. */
async function geocode(name: string, addr: string) {
  const hint = hintOf(addr);
  const u = new URL("https://openapi.naver.com/v1/search/local.json");
  u.searchParams.set("query", `${hint} ${name}`.trim());
  u.searchParams.set("display", "5");
  const r = await fetch(u, { headers: { "X-Naver-Client-Id": S_ID, "X-Naver-Client-Secret": S_SEC } });
  if (!r.ok) throw new Error(`naver_${r.status}:${(await r.text()).slice(0, 120)}`);
  const items = (await r.json())?.items || [];
  const norm = (v: string) => v.replace(/\s/g, "").toLowerCase();
  const want = norm(name);
  const best = items.find((it: any) => {
    const t = norm(strip(it.title));
    if (!(t.includes(want) || want.includes(t))) return false;
    if (!isFoodCat(strip(it.category))) return false;
    const a = strip(it.roadAddress) || strip(it.address);
    return !!a && regionOk(hint, a);
  });
  if (!best) return null;
  const c = pickCoord(best.mapx, best.mapy);
  if (c.lat == null) return null;                    // 좌표가 목적인데 없으면 의미가 없다
  return {
    name: strip(best.title) || name,
    address: strip(best.roadAddress) || strip(best.address) || addr,
    category: (strip(best.category).split(">").pop() || "").trim() || null,
    lat: String(c.lat), lon: String(c.lon),
  };
}

Deno.serve(async (req) => {
  if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return j({ ok: false, reason: "unauthorized" }, 401);
  }
  if (!GOV) return j({ ok: false, reason: "no_gov_key" }, 500);

  const url = new URL(req.url);

  /* resolve 모드 — 못 이은 행을 가게로 들인다. 좌표 한 칸을 위해서만 네이버를 쓴다. */
  if (url.searchParams.get("resolve") === "1") {
    const want = Math.min(Number(url.searchParams.get("n") || "60"), 200);
    const { data: allow } = await supa.rpc("naver_take", { p_want: want });
    const budget = Number(allow || 0);
    if (budget <= 0) return j({ ok: true, note: "네이버 하루 몫 소진" });

    const { data: todo } = await supa.rpc("food_goodprice_todo", { p_limit: budget });
    const rows = (todo || []) as any[];
    const t0 = Date.now();
    const out: any[] = [];
    const touched: number[] = [];
    let used = 0, halted = "", notFound = 0;

    for (const g of rows) {
      if (Date.now() - t0 > 110_000) { halted = "시간 상자(110초) 도달"; break; }
      touched.push(g.gid);
      let v: any = null;
      try { v = await geocode(g.name, g.address); used++; }
      catch (e) { halted = String(e).slice(0, 80); break; }
      if (!v) { notFound++; await new Promise((s) => setTimeout(s, 70)); continue; }
      /* 이름·주소는 **정부 값을 쓴다** — 네이버 표기가 지점명을 붙이는 등 흔들린다.
         좌표·업종만 받아 쓴다. 메뉴는 애초에 정부 것뿐이다. */
      out.push({ gid: g.gid, name: g.name, address: v.address || g.address,
                 lat: v.lat, lon: v.lon, category: v.category || g.cat || null,
                 phone: g.tel || null, menus: g.menus });
      await new Promise((s) => setTimeout(s, 70));
    }

    if (touched.length) await supa.rpc("food_goodprice_touch", { p_ids: touched });
    if (budget > used) await supa.rpc("naver_refund", { p_n: budget - used });
    const { data: made, error: perr } = out.length
      ? await supa.rpc("food_goodprice_promote", { p_rows: out })
      : { data: { created: 0, dup: 0, menus: 0 }, error: null } as any;

    return j({ ok: true, picked: rows.length, naver: used, notFound,
               promote: perr ? String(perr.message).slice(0, 160) : made,
               halted: halted || undefined });
  }

  const perPage = Math.min(Number(url.searchParams.get("per") || "500"), 1000);
  let page = Math.max(Number(url.searchParams.get("page") || "1"), 1);
  const pages = Math.max(Number(url.searchParams.get("pages") || "6"), 1);
  const linkOnly = url.searchParams.get("link") === "1";

  let total = 0, seen = 0, kept = 0, loaded = { new: 0, updated: 0 };
  let sample: unknown = null, err = "";

  if (!linkOnly) {
    for (let i = 0; i < pages; i++, page++) {
      const api = new URL(`https://api.odcloud.kr/api/${DATASET}/v1/${UDDI}`);
      api.searchParams.set("serviceKey", GOV);
      api.searchParams.set("page", String(page));
      api.searchParams.set("perPage", String(perPage));
      const r = await fetch(api, { headers: { accept: "application/json" } });
      const body = await r.text();
      if (!r.ok) { err = `odcloud ${r.status} ${body.slice(0, 200)}`; break; }
      let d: any;
      try { d = JSON.parse(body); } catch { err = `parse ${body.slice(0, 200)}`; break; }
      total = Number(d?.totalCount || total);
      const rows: Record<string, unknown>[] = d?.data || [];
      if (!rows.length) break;
      if (!sample) sample = Object.keys(rows[0]);
      seen += rows.length;

      const batch = rows.map((row) => {
        const cat = pick(row, /^(업종|업태|분류)$/);
        if (NOT_FOOD.test(cat) || !FOOD.test(cat)) return null;
        const name = pick(row, /^(업소명|상호|상호명|업체명)$/);
        if (!name) return null;
        return {
          sido: pick(row, /^(시도|시·도|광역)$/),
          sigun: pick(row, /^(시군|시군구|시·군·구)$/),
          cat, name,
          tel: pick(row, /^(연락처|전화|전화번호)$/),
          address: pick(row, /^(주소|소재지|도로명주소)$/),
          menus: menusOf(row),
        };
      }).filter(Boolean);
      kept += batch.length;

      for (let s = 0; s < batch.length; s += 300) {
        const { data, error } = await supa.rpc("food_goodprice_load", { p_rows: batch.slice(s, s + 300) });
        if (error) { err = `load ${error.message}`.slice(0, 200); break; }
        loaded.new += Number(data?.new || 0);
        loaded.updated += Number(data?.updated || 0);
      }
      if (err) break;
      if (rows.length < perPage) break;
    }
  }

  /* 잇기는 언제 돌려도 안전하다 — 이미 이은 행은 건너뛴다. 가게가 늘 때마다 다시 돌리면 된다. */
  const { data: link, error: lerr } = await supa.rpc("food_goodprice_link", { p_limit: 4000 });

  return j({ ok: !err, total, seen, kept, loaded, nextPage: page,
             link: lerr ? String(lerr.message).slice(0, 160) : link,
             columns: sample, error: err || undefined });
});
