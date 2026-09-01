// 관광공사 음식점 13,499곳을 **가게로** 들인다. 외부 유료 호출 0.
//
// 🔑 DATA_GO_KR_KEY
//
// 배경: 같은 데이터를 ingest-tour-photos 가 이미 쓰고 있는데, 거기서는 우리 가게와
// 이름·좌표로 **맞춰서** 사진만 얹는다 — 1,287곳(11%)만 건지고 12,000곳을 버렸다.
// 이 데이터에는 상호·주소·좌표·대표사진이 다 있다. 맞출 게 아니라 들이면
// **사진 달린 가게가 공짜로 12,000곳** 늘어난다. 사진이 없어 비어 보이던 문제의 절반이다.
//
// ⚖️ 공공누리 Type1/Type3 만 사진을 쓴다(둘 다 상업적 이용 가능). 유형이 비면 가게만 들인다.
//    이미지는 복제하지 않고 관광공사 CDN URL 을 참조하며 출처를 화면에 띄운다.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const GOV = Deno.env.get("DATA_GO_KR_KEY") || "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const BASE = "https://apis.data.go.kr/B551011/KorService2";

const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

/* food_photos.url 은 '^https://' 만 받는다. 관광공사는 http 로 주는 게 섞여 있다. */
const https = (u: string) => String(u || "").trim().replace(/^http:\/\//, "https://");
const OK_RIGHTS = new Set(["Type1", "Type3"]);

Deno.serve(async (req) => {
  if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return j({ ok: false, reason: "unauthorized" }, 401);
  }
  if (!GOV) return j({ ok: false, reason: "no_gov_key" }, 500);

  const url = new URL(req.url);
  let page = Math.max(Number(url.searchParams.get("page") || "1"), 1);
  const pages = Math.max(Number(url.searchParams.get("pages") || "4"), 1);
  const rows = Math.min(Number(url.searchParams.get("rows") || "1000"), 1000);

  let total = 0, seen = 0, kept = 0, noCoord = 0, err = "";
  const acc = { created: 0, dup: 0, photos: 0 };
  const t0 = Date.now();

  for (let i = 0; i < pages; i++, page++) {
    if (Date.now() - t0 > 110_000) { err = "시간 상자(110초) 도달"; break; }
    const u = `${BASE}/areaBasedList2?serviceKey=${GOV}&numOfRows=${rows}&pageNo=${page}` +
              `&MobileOS=ETC&MobileApp=GALLA&_type=json&contentTypeId=39`;
    const r = await fetch(u);
    const body = await r.text();
    if (!r.ok) { err = `tour ${r.status} ${body.slice(0, 160)}`; break; }
    let d: any;
    try { d = JSON.parse(body); } catch { err = `parse ${body.slice(0, 160)}`; break; }
    const b = d?.response?.body;
    total = Number(b?.totalCount || total);
    const items: any[] = b?.items?.item || [];
    if (!items.length) break;
    seen += items.length;

    const batch = items.map((t) => {
      const lat = Number(t?.mapy), lon = Number(t?.mapx);
      /* 좌표가 없거나 한반도 밖이면 지도에 못 세운다 — 들이지 않는다 */
      if (!isFinite(lat) || !isFinite(lon) || lat < 33 || lat > 39.5 || lon < 124 || lon > 132) {
        noCoord++; return null;
      }
      const img = OK_RIGHTS.has(String(t?.cpyrhtDivCd || "")) ? https(t?.firstimage || "") : "";
      return {
        name: String(t?.title || "").trim(),
        address: String(t?.addr1 || "").trim(),
        lat: String(lat), lon: String(lon),
        category: null,
        image: /^https:\/\//.test(img) ? img : "",
      };
    }).filter((x) => x && x.name) as any[];
    kept += batch.length;

    for (let s = 0; s < batch.length; s += 300) {
      const { data, error } = await supa.rpc("food_tour_promote", { p_rows: batch.slice(s, s + 300) });
      if (error) { err = `promote ${error.message}`.slice(0, 200); break; }
      acc.created += Number(data?.created || 0);
      acc.dup += Number(data?.dup || 0);
      acc.photos += Number(data?.photos || 0);
    }
    if (err) break;
    if (items.length < rows) break;
  }

  return j({ ok: !err, total, seen, kept, noCoord, nextPage: page, ...acc, error: err || undefined });
});
