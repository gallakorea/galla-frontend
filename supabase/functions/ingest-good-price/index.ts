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
const NOT_FOOD = /이미용|미용업|이용업|목욕|세탁|숙박|사진|화원|자동차|학원|서비스업\s*\(비/;

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

Deno.serve(async (req) => {
  if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return j({ ok: false, reason: "unauthorized" }, 401);
  }
  if (!GOV) return j({ ok: false, reason: "no_gov_key" }, 500);

  const url = new URL(req.url);
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
