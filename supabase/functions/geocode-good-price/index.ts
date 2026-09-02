// 착한가격업소 중 네이버 '지역검색'이 못 찾은 집을 **주소 지오코딩**으로 세운다.
//
// 🔑 NCP_MAPS_KEY_ID / NCP_MAPS_KEY (네이버 클라우드 Maps 애플리케이션 'galla')
//
// 왜 남았나: 2,147곳은 데이터가 나빠서가 아니다. 2,037곳(95%)이 멀쩡한 도로명 주소를 갖고
// 있고 2,142곳은 메뉴까지 있다. 원인은 도구를 잘못 고른 것이다 — 지역검색은 **상호**로 찾는다.
// 네이버 플레이스에 그 상호 등록이 없으면 주소가 정확해도 0건이다(실측: 주소를 질의해도 0건).
//
// 지오코딩은 주소 → 좌표라 상호와 무관하다. 무료 한도 **하루 300만 건**이라 2,147곳은 티도 안 난다.
// (키 없이 되는 Nominatim 은 오차 중앙값 293m·최악 6.2km 라 맛집 핀으로 못 쓴다.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const KID = Deno.env.get("NCP_MAPS_KEY_ID") || "";
const KEY = Deno.env.get("NCP_MAPS_KEY") || "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const GEO = "https://maps.apigw.ntruss.com/map-geocode/v2/geocode";

const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

/* 정부 원본에 박힌 오타를 고친다. 22곳이 이것 때문에 끝까지 안 세워졌다(실측 2026-09-03).
   '광주광역시광역시'(6곳)·'구로굴'·'전북틀별자치도'·'전라남도순천시'·'인천광역시 인천 계양구'.
   ⚠️ '서광주광역시로' 는 원본 어딘가에서 '광주'→'광주광역시' 일괄치환을 하다 도로명까지
      물든 흔적이다 — 도로명 안의 치환은 되돌려야 한다('서광주로'). */
const FIX: [RegExp, string][] = [
  [/(광역시|특별시|특별자치시|특별자치도)\1+/g, "$1"],   // 광역시광역시 → 광역시
  [/([가-힣])광역시로/g, "$1로"],                        // 서광주광역시로 → 서광주로
  [/구로굴/g, "구로구"],
  [/틀별자치도/g, "특별자치도"],
  [/^(인천광역시)\s+인천\s+/g, "$1 "],                  // 인천광역시 인천 계양구 → 인천광역시 계양구
  [/^(서울특별시)\s+서울\s+/g, "$1 "],
  [/(도|시)(?=[가-힣]+(?:시|군)\s)/g, "$1 "],            // 전라남도순천시 → 전라남도 순천시
];

/** 정부 주소는 표기가 제각각이다 — 지오코더가 먹을 수 있게 다듬는다. */
function norm(a: string) {
  let s = String(a || "");
  for (const [re, to] of FIX) s = s.replace(re, to);
  s = s.replace(/\([^)]*\)/g, " ");                 // (문현동) 같은 법정동 괄호 제거
  s = s.replace(/([로길])(\d)/g, "$1 $2");           // '문화로308' → '문화로 308'
  s = s.replace(/\s+/g, " ").trim();
  /* 층·호·상가명은 지오코딩을 방해한다. 도로명+본번(-부번)까지만 남긴다.
     '시장로 지하10 부평중앙지하상가 가동 지하 28호' → '시장로 지하10' 은 못 살리므로
     번지 패턴이 없으면 원문을 그대로 넘겨 지오코더가 알아서 하게 둔다. */
  const m = s.match(/^(.*?[로길]\s*\d+(?:-\d+)?)(?:\s|$)/);
  return m ? m[1] : s;
}

async function geocode(query: string) {
  const u = `${GEO}?query=${encodeURIComponent(query)}`;
  const r = await fetch(u, {
    headers: { "x-ncp-apigw-api-key-id": KID, "x-ncp-apigw-api-key": KEY, accept: "application/json" },
  });
  if (!r.ok) throw new Error(`ncp_${r.status}:${(await r.text()).slice(0, 120)}`);
  const d = await r.json();
  const a = (d?.addresses || [])[0];
  if (!a) return null;
  const lat = Number(a.y), lon = Number(a.x);
  if (!isFinite(lat) || !isFinite(lon)) return null;
  if (lat < 33 || lat > 39.5 || lon < 124 || lon > 132) return null;   // 한반도 밖은 버린다
  return { lat: String(lat), lon: String(lon), address: a.roadAddress || a.jibunAddress || query };
}

Deno.serve(async (req) => {
  const xcron = req.headers.get("x-cron-secret") || "";
  const auth = req.headers.get("authorization") || "";
  if (CRON_SECRET && xcron !== CRON_SECRET && !auth.includes(CRON_SECRET)) {
    return j({ ok: false, reason: "unauthorized" }, 401);
  }
  if (!KID || !KEY) return j({ ok: false, reason: "no_ncp_key" }, 500);

  const url = new URL(req.url);
  const n = Math.min(Number(url.searchParams.get("n") || "200"), 500);
  const dry = url.searchParams.get("dry") === "1";

  const { data: todo } = await supa.rpc("food_goodprice_todo", { p_limit: n });
  const rows = (todo || []) as any[];
  if (!rows.length) return j({ ok: true, picked: 0, note: "대상 없음" });

  const t0 = Date.now();
  const out: any[] = [];
  const touched: number[] = [];
  const sample: any[] = [];
  let found = 0, miss = 0, halted = "";

  for (const g of rows) {
    if (Date.now() - t0 > 110_000) { halted = "시간 상자(110초) 도달"; break; }
    touched.push(g.gid);
    let v: any = null;
    try { v = await geocode(norm(g.address)); }
    catch (e) { halted = String(e).slice(0, 90); break; }
    if (!v) { miss++; continue; }
    found++;
    if (sample.length < 5) sample.push({ name: g.name, q: norm(g.address), lat: v.lat, lon: v.lon });
    /* 이름·주소는 **정부 값**을 쓴다 — 지오코더는 좌표만 준다 */
    out.push({ gid: g.gid, name: g.name, address: g.address,
               lat: v.lat, lon: v.lon, category: g.cat || null,
               phone: g.tel || null, menus: g.menus });
    await new Promise((s) => setTimeout(s, 40));
  }

  if (dry) return j({ ok: true, dry: true, picked: rows.length, found, miss, sample, halted: halted || undefined });

  if (touched.length) await supa.rpc("food_goodprice_touch", { p_ids: touched });
  const { data: made, error } = out.length
    ? await supa.rpc("food_goodprice_promote", { p_rows: out })
    : { data: { created: 0, dup: 0, menus: 0 }, error: null } as any;

  return j({ ok: true, picked: rows.length, found, miss,
             promote: error ? String(error.message).slice(0, 160) : made,
             halted: halted || undefined });
});
