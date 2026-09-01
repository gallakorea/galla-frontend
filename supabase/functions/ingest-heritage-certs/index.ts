// 국가유산 인증 — 국보·보물·사적·명승·천연기념물 (2026-09-01)
//
// 사장님이 공공데이터포털에 로그인해 주셨는데, 정작 **신청할 게 없었다**:
//   · 한국관광 100선(15003416) → 파일이 **PNG(이미지)** 라 목록으로 못 쓴다.
//   · 국가유산 데이터 → 공공데이터포털엔 '외부 제공처'로만 걸려 있고,
//     국가유산청 API 는 **키 없이** 열려 있다(실측: 국보 369건 즉시 조회).
//   · 관광공사 TourAPI → 이미 승인돼 운영 중.
// 그래서 신청 대신 이 함수를 만들었다.
//
// ⚖️ 국가유산청 공개 API. 목록에 위경도가 같이 온다(숭례문 37.5599/126.9753 실측).
//    사진(imageUrl)은 국가유산청 CDN 을 참조만 하고 우리 서버에 복제하지 않는다.
// ⚠️ 종목별로 code 를 따로 둔다. '국가유산' 한 덩어리로 묶으면 화면에서 국보와
//    천연기념물이 같은 뱃지가 되는데, 그건 유저에게 다른 정보다.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const BASE = "https://www.khs.go.kr/cha/SearchKindOpenapiList.do";

const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

/* ccbaKdcd = 종목코드. 우리 화면에 뜻이 있는 것만 고른다 —
   무형유산·등록문화유산은 '가볼 곳'이 아니거나 좌표가 없다. */
const KINDS: Record<string, string> = {
  "11": "nt",        // 국보
  "12": "treasure",  // 보물
  "13": "historic",  // 사적
  "15": "scenic",    // 명승
  "16": "natmon",    // 천연기념물
};

function items(xml: string) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
    const o: Record<string, string> = {};
    for (const f of m[1].matchAll(/<(\w+)>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/\1>/g)) {
      o[f[1]] = (f[2] || "").trim();
    }
    return o;
  });
}

Deno.serve(async (req) => {
  const xcron = req.headers.get("x-cron-secret") || "";
  const auth = req.headers.get("authorization") || "";
  if (CRON_SECRET && xcron !== CRON_SECRET && !auth.includes(CRON_SECRET)) {
    return j({ ok: false, reason: "unauthorized" }, 401);
  }
  const url = new URL(req.url);
  const kd = url.searchParams.get("kind") || "11";
  const page = Math.max(Number(url.searchParams.get("page") || "1"), 1);
  const unit = Math.min(Number(url.searchParams.get("unit") || "100"), 200);
  const code = KINDS[kd];
  if (!code) return j({ ok: false, reason: "bad_kind", allowed: Object.keys(KINDS) }, 400);

  const u = `${BASE}?ccbaCncl=N&pageIndex=${page}&pageUnit=${unit}&ccbaKdcd=${kd}`;
  const r = await fetch(u);
  if (!r.ok) return j({ ok: false, reason: `khs_${r.status}` }, 502);
  const xml = await r.text();
  const total = Number((/<totalCnt>(\d+)<\/totalCnt>/.exec(xml) || [])[1] || 0);

  const rows = items(xml).map((it) => {
    const lat = Number(it.latitude), lon = Number(it.longitude);
    /* 좌표가 없거나 한반도 밖이면 지도에 못 올린다 — 그런 건 뱃지도 뜻이 없다. */
    if (!isFinite(lat) || !isFinite(lon) || lat < 33 || lat > 39.5 || lon < 124 || lon > 132) return null;
    const name = it.ccbaMnm1 || "";
    if (!name) return null;
    return {
      name,
      country_code: "KR",
      country: "대한민국",
      admin1: it.ccbaCtcdNm || null,
      city: it.ccsiName || null,
      lat: String(lat), lon: String(lon),
      category: it.ccmaName || null,          // 국보·보물·사적…
      photo: it.imageUrl || null,
      photo_credit: it.imageUrl ? "국가유산청" : null,
      /* 같은 유산이 다시 들어와도 한 행이게 — 국가유산 고유키를 ref 로 쓴다 */
      ref: `khs:${it.ccbaKdcd}-${it.ccbaCtcd}-${it.ccbaAsno}`,
    };
  }).filter(Boolean);

  const { data, error } = await supa.rpc("travel_heritage_ingest",
    { p_code: code, p_items: rows });
  if (error) return j({ ok: false, error: error.message.slice(0, 200) }, 500);

  const done = page * unit >= total;
  return j({ ok: true, kind: kd, code, page, unit, total, usable: rows.length,
             next: done ? null : page + 1, ...(data || {}) });
});
