// 맛집 사진 채우기 — 한국관광공사 국문 관광정보(TourAPI)에서 대표이미지를 가져온다.
//
// 배경: 4,076곳 중 사진이 **0곳**이었다(실측 2026-08-31). 카드가 전부 🍜 플레이스홀더라
//   목록이 통째로 비어 보였다. 유저 제보만 기다리면 영원히 안 채워진다.
//
// ⚖️ 원칙
//   · 관광공사 데이터는 공공누리다. cpyrhtDivCd 가 Type1/Type3 인 것만 쓴다
//     (둘 다 상업적 이용 가능, Type3 는 변경금지 — 우리는 원본 URL 을 그대로 참조하니 해당 없음).
//     유형이 비어 있는 건 권리관계가 불분명하므로 **쓰지 않는다**.
//   · 이미지를 우리 서버에 복제하지 않는다. 관광공사 CDN URL 을 참조한다.
//   · 출처 표시가 의무라 credit 에 담아 화면에 띄운다.
//
// ⚠️ 건별 조회(locationBasedList)로 4,076번 부르면 일 트래픽을 넘긴다.
//    전국 음식점 13,499건을 14번 호출로 통째로 받아 메모리에서 매칭한다.
//
// ⚠️ 동명이인 방지: 이름이 같아도 좌표가 2km 넘게 떨어지면 다른 집이다.

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
const norm = (s: string) => String(s || "").replace(/[\s()\[\]·,\-]/g, "").toLowerCase();

type Tour = { title: string; firstimage: string; mapx: string; mapy: string;
              contentid: string; cpyrhtDivCd?: string; addr1?: string };

async function fetchAll(): Promise<Tour[]> {
  const out: Tour[] = [];
  for (let page = 1; page <= 20; page++) {
    const u = `${BASE}/areaBasedList2?serviceKey=${GOV}&numOfRows=1000&pageNo=${page}` +
              `&MobileOS=ETC&MobileApp=GALLA&_type=json&contentTypeId=39`;
    const r = await fetch(u);
    if (!r.ok) break;
    const b = (await r.json())?.response?.body;
    const raw = b?.items?.item;
    if (!raw) break;
    const arr = Array.isArray(raw) ? raw : [raw];
    out.push(...arr);
    if (out.length >= (b.totalCount || 0)) break;
  }
  return out;
}

Deno.serve(async (req) => {
  const xcron = req.headers.get("x-cron-secret") || "";
  const auth = req.headers.get("authorization") || "";
  if (CRON_SECRET && xcron !== CRON_SECRET && !auth.includes(CRON_SECRET)) {
    return j({ ok: false, reason: "unauthorized" }, 401);
  }
  if (!GOV) return j({ ok: false, reason: "no_gov_key" }, 500);

  const tour = await fetchAll();
  /* 권리관계가 분명한 것만 남긴다 */
  const usable = tour.filter((t) =>
    t.firstimage && (t.cpyrhtDivCd === "Type1" || t.cpyrhtDivCd === "Type3"));

  /* ⚠️ 처음엔 '이름 완전일치'만 봤다. 그런데 관광공사와 우리 표기가 미묘하게 다르다
     ('여원찜갈비 월성직영점' vs '여원찜갈비'). 실측하니 완전일치로 놓치는 게 185곳이었다.
     → 좌표(약 1km 격자)로 후보를 먼저 좁히고, 그 안에서 이름을 세 단계로 본다:
       ① 완전일치 ② 지점명 뗀 뒤 일치 ③ 3글자 이상 부분일치.
     좌표가 먼저라 동명이인이 섞일 위험은 오히려 줄어든다. */
  const cell = (la: number, lo: number) => `${Math.round(la * 100)}:${Math.round(lo * 100)}`;
  const grid = new Map<string, Tour[]>();
  for (const t of usable) {
    const la = Number(t.mapy), lo = Number(t.mapx);
    if (!isFinite(la) || !isFinite(lo)) continue;
    const k = cell(la, lo);
    (grid.get(k) || grid.set(k, []).get(k)!).push(t);
  }
  const nearby = (la: number, lo: number) => {
    const out: Tour[] = [];
    for (const dy of [-0.01, 0, 0.01]) for (const dx of [-0.01, 0, 0.01]) {
      const g = grid.get(cell(la + dy, lo + dx));
      if (g) out.push(...g);
    }
    return out;
  };
  /* 지점명을 뗀 상호 — 붙어 있는 '○○점'은 상호의 일부일 수 있으니 공백을 요구한다 */
  const baseName = (s: string) =>
    norm(String(s || "").replace(/\([^)]*\)/g, "")
      .replace(/\s+(본점|직영점|[가-힣A-Za-z0-9]{1,6}점)$/, "").trim());

  /* 사진이 아직 없는 곳만 대상.
     ⚠️ PostgREST 는 기본 1,000행에서 자른다 — 그냥 부르면 4,000곳 중 1,000곳만 봤다.
        RPC 에 limit/offset 을 두고 끝까지 페이징한다. */
  const places: any[] = [];
  for (let off = 0; off < 20000; off += 1000) {
    const { data } = await supa.rpc("food_places_without_photo", { p_limit: 1000, p_offset: off });
    const arr = (data || []) as any[];
    places.push(...arr);
    if (arr.length < 1000) break;
  }
  const rows: any[] = [];
  let seen = 0;
  for (const p of places) {
    const la = Number(p.lat), lo = Number(p.lon);
    if (!isFinite(la) || !isFinite(lo)) continue;
    const cands = nearby(la, lo);
    if (!cands.length) continue;
    const pn = norm(p.name), pb = baseName(p.name);
    const hit =
      cands.find((t) => norm(t.title) === pn) ||
      (pb.length >= 2 ? cands.find((t) => baseName(t.title) === pb) : null) ||
      (pb.length >= 3 ? cands.find((t) => {
        const tb = baseName(t.title);
        return tb.length >= 3 && (tb.includes(pb) || pb.includes(tb));
      }) : null);
    if (!hit) continue;
    seen++;
    /* ⚠️ 관광공사가 주는 URL 은 http:// 다. food_photos 는 https 만 받고(CHECK),
       앱 CSP 도 img-src 가 https: 라 그대로 넣으면 저장도 표시도 안 된다.
       같은 CDN 이 https 로 정상 서빙하는 걸 확인했으므로 올려서 넣는다. */
    const url = String(hit.firstimage).replace(/^http:\/\//, "https://");
    if (!/^https:\/\//.test(url)) continue;
    rows.push({
      place_id: p.id, user_id: null, url, status: "live",
      source: "tour", ext_key: "tour:" + hit.contentid,
      credit: "한국관광공사",
    });
  }

  /* ⚠️ upsert(onConflict) 를 쓰면 안 된다 — 유니크 인덱스가 부분 인덱스(where ext_key is not null)라
     PostgREST 가 충돌 대상을 추론하지 못하고 조용히 0건이 된다(실측: 150건 매칭 → 0건 저장).
     대상 자체가 '사진 없는 곳'이라 중복이 날 일이 없으므로 그냥 insert 하고 에러를 드러낸다. */
  let inserted = 0; const errs: string[] = [];
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await supa.from("food_photos").insert(chunk);
    if (error) { if (errs.length < 3) errs.push(String(error.message).slice(0, 160)); }
    else inserted += chunk.length;
  }
  return j({ ok: true, tour: tour.length, usable: usable.length,
             targets: places.length, name_hit: seen, matched: rows.length, inserted, errs });
});
