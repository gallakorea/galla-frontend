// 🍚 혜자식당 씨앗에 좌표를 붙여 가게로 올린다.
//
// 🔑 NCP_MAPS_KEY_ID / NCP_MAPS_KEY (네이버 클라우드 Maps, 지오코딩 하루 300만 건 무료)
//
// 이 목록은 외부에서 제공받은 저가 식당 자료다. 상호·주소·대표메뉴·가격이 있고 좌표만 없다.
// 상호로 찾는 지역검색은 등록 안 된 집을 통째로 놓치므로, 주소 지오코딩을 쓴다
// (실측: 지역검색 76% vs 지오코딩 오차 중앙값 5m).

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

const SIDO = /^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충청|충북|충남|전라|전북|전남|경상|경북|경남|제주)/;

/** 주소 표기가 제각각이라 다듬는다. */
function query(sido: string, addr: string) {
  let a = String(addr || "").replace(/\s+/g, " ").trim();
  /* ⚠️ 주소가 이미 시도로 시작하면 시도를 또 붙이면 안 된다 —
     '성남시' + '경기도 성남시 분당구…' = '성남시 경기도 성남시…' 가 되어 못 찾는다. */
  if (SIDO.test(a)) return a;
  /* '강남 개포로22길 49' 처럼 구 이름에 '구'가 빠진 경우만 붙인다.
     ⚠️ 첫 토큰이 도로명이면 붙이면 안 된다 — '도동천로' → '도동천로구' 가 되어 못 찾는다. */
  const t = a.split(" ");
  if (t.length > 1 && !/(구|시|군|읍|면|동|로|길|가)$/.test(t[0])) {
    a = t[0] + "구 " + t.slice(1).join(" ");
  }
  return `${String(sido || "").trim()} ${a}`.trim();
}

async function geocode(q: string) {
  const r = await fetch(`${GEO}?query=${encodeURIComponent(q)}`, {
    headers: { "x-ncp-apigw-api-key-id": KID, "x-ncp-apigw-api-key": KEY, accept: "application/json" },
  });
  if (!r.ok) throw new Error(`ncp_${r.status}:${(await r.text()).slice(0, 120)}`);
  const a = ((await r.json())?.addresses || [])[0];
  if (!a) return null;
  const lat = Number(a.y), lon = Number(a.x);
  if (!isFinite(lat) || !isFinite(lon)) return null;
  if (lat < 33 || lat > 39.5 || lon < 124 || lon > 132) return null;   // 한반도 밖은 버린다
  return { lat: String(lat), lon: String(lon), address: a.roadAddress || a.jibunAddress || q };
}

Deno.serve(async (req) => {
  const xcron = req.headers.get("x-cron-secret") || "";
  const auth = req.headers.get("authorization") || "";
  if (CRON_SECRET && xcron !== CRON_SECRET && !auth.includes(CRON_SECRET)) {
    return j({ ok: false, reason: "unauthorized" }, 401);
  }
  if (!KID || !KEY) return j({ ok: false, reason: "no_ncp_key" }, 500);

  const n = Math.min(Number(new URL(req.url).searchParams.get("n") || "200"), 400);
  const { data: todo } = await supa.rpc("food_cheap_todo", { p_limit: n });
  const rows = (todo || []) as any[];
  if (!rows.length) return j({ ok: true, picked: 0, note: "대상 없음" });

  const t0 = Date.now();
  const out: any[] = [];
  const touched: number[] = [];
  let found = 0, miss = 0, halted = "";

  for (const c of rows) {
    if (Date.now() - t0 > 110_000) { halted = "시간 상자(110초) 도달"; break; }
    touched.push(c.cid);
    let v: any = null;
    try { v = await geocode(query(c.sido, c.address)); }
    catch (e) { halted = String(e).slice(0, 90); break; }
    if (!v) { miss++; continue; }
    found++;
    /* 상호·메뉴·가격은 **원본 값**을 쓴다. 지오코더는 좌표만 준다. */
    out.push({ cid: c.cid, name: c.name, address: v.address,
               lat: v.lat, lon: v.lon, menu: c.menu, price: c.price });
    await new Promise((s) => setTimeout(s, 40));
  }

  if (touched.length) await supa.rpc("food_cheap_touch", { p_ids: touched });
  const { data: made, error } = out.length
    ? await supa.rpc("food_cheap_promote", { p_rows: out })
    : { data: { created: 0, dup: 0, menus: 0 }, error: null } as any;

  return j({ ok: true, picked: rows.length, found, miss,
             promote: error ? String(error.message).slice(0, 160) : made,
             halted: halted || undefined });
});
