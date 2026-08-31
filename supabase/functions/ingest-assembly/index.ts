// 국회의원이 정치자금으로 밥 먹은 집 — 갈라만 할 수 있는 축.
//
// 📚 출처: 오마이뉴스가 중앙선관위에 정보공개청구해 받은 국회의원 정치자금 수입지출보고서를
//    경향신문·뉴스타파와 공동 분석해 정리한 데이터(2012~2024).
//    github.com/OhmyNews/KA-money · **MIT 라이선스**("자유롭게 이용하실 수 있습니다").
//    ⚖️ 맛집 지도 사이트를 복제한 게 아니라 그 사이트가 쓴 것과 같은 **원본 데이터**다.
//
// ⚠️ 사용처 표기에 식당이 아닌 것이 섞여 있다(국회후생복지위원회, 하나로마트, 호텔 등 3.6%).
//    이름을 믿지 않고 **네이버 지역검색으로 한 건씩 검증**해 음식점만 남긴다 —
//    백년가게·관광공사와 같은 관문이다. 좌표도 여기서 얻는다.
//
// ⚠️ 집계는 우리가 다시 세지 않는다. 클라이언트(로컬 스크립트)가 계산해 보내고
//    이 함수는 검증·적재만 한다 — 130만 행을 엣지에서 돌릴 수는 없다(150초 제한).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const S_ID = Deno.env.get("NAVER_SEARCH_ID") || Deno.env.get("NAVER_CLIENT_ID") || "";
const S_SEC = Deno.env.get("NAVER_SEARCH_SECRET") || Deno.env.get("NAVER_CLIENT_SECRET") || "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const strip = (s: string) => String(s || "").replace(/<[^>]*>/g, "").replace(/&[a-z]+;/g, " ").trim();

const FOOD_RE = /^(음식점|카페|제과|베이커리|술집|주점)/;
const isFood = (c: string) =>
  FOOD_RE.test(c) || /음식|카페|한식|중식|일식|양식|분식|치킨|호프|주점|베이커리|제과|뷔페/.test(c);

/* 사용처 표기 정리 — 원본은 '가시리여의도점', '엘에스씨푸드(국회의사당)' 처럼 붙어 있다 */
function cleanName(s: string) {
  return String(s || "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/(주식회사|㈜|\(주\))/g, " ")
    .replace(/\s+/g, " ").trim();
}

async function verify(name: string) {
  const u = new URL("https://openapi.naver.com/v1/search/local.json");
  u.searchParams.set("query", name);
  u.searchParams.set("display", "5");
  const r = await fetch(u, { headers: { "X-Naver-Client-Id": S_ID, "X-Naver-Client-Secret": S_SEC } });
  if (!r.ok) return null;
  const items = (await r.json())?.items || [];
  const norm = (s: string) => s.replace(/\s/g, "").toLowerCase();
  const want = norm(name);
  const best = items.find((it: any) => {
    const t = norm(strip(it.title));
    if (!(t.includes(want) || want.includes(t))) return false;
    return isFood(strip(it.category));           // 🔴 여기서 위원회·마트·호텔이 떨어진다
  });
  if (!best) return null;
  let lon = Number(best.mapx), lat = Number(best.mapy);
  if (Math.abs(lon) > 1000) { lon /= 1e7; lat /= 1e7; }
  if (!(lat > 33 && lat < 39.5 && lon > 124 && lon < 132)) return null;
  return {
    name: strip(best.title) || name,
    address: strip(best.roadAddress) || strip(best.address),
    category: (strip(best.category).split(">").pop() || "").trim() || null,
    phone: strip(best.telephone) || null,
    lat: String(lat), lon: String(lon),
  };
}

Deno.serve(async (req) => {
  /* 이 함수는 크론이 아니라 **로컬 스크립트가 적재 페이로드를 밀어 넣는** 통로다.
     130만 행을 엣지에서 읽을 수 없어 집계는 밖에서 하고 여기로 보낸다.
     그래서 크론 시크릿뿐 아니라 service_role 키도 받는다(둘 다 서버 전용 자격). */
  const xcron = req.headers.get("x-cron-secret") || "";
  const auth = req.headers.get("authorization") || "";
  const SRV = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const ok = (CRON_SECRET && (xcron === CRON_SECRET || auth.includes(CRON_SECRET))) ||
             (SRV && auth.includes(SRV));
  if (!ok) return j({ ok: false, reason: "unauthorized" }, 401);
  if (!S_ID || !S_SEC) return j({ ok: false, reason: "no_search_key" }, 500);

  const body = await req.json().catch(() => null);
  const items = (body?.items || []) as any[];
  if (!items.length) return j({ ok: false, reason: "no_items" }, 400);

  let checked = 0, kept = 0, dropped = 0;
  const ingest: any[] = [], stats: any[] = [], rows: any[] = [];
  const nameToRaw = new Map<string, any>();

  for (const it of items) {
    checked++;
    const nm = cleanName(it.name);
    if (nm.length < 2) { dropped++; continue; }
    const v = await verify(nm);
    await new Promise((s) => setTimeout(s, 70));
    if (!v) { dropped++; continue; }
    kept++;
    ingest.push({ ...v, channel: "assembly", origin: "gov" });
    nameToRaw.set(v.name, it);
  }

  let res: any = { new: 0, dup: 0 };
  if (ingest.length) {
    const { data } = await supa.rpc("food_ingest", { p_items: ingest });
    res = data || res;
  }

  /* 방금 넣은 장소의 id 를 되받아 집계·개별내역을 붙인다 */
  const names = [...nameToRaw.keys()];
  for (let i = 0; i < names.length; i += 100) {
    const chunk = names.slice(i, i + 100);
    const { data: places } = await supa.from("food_places").select("id,name").in("name", chunk);
    for (const p of (places || []) as any[]) {
      const raw = nameToRaw.get(p.name);
      if (!raw) continue;
      stats.push({ place_id: p.id, raw_name: raw.name, mps: raw.mps, visits: raw.visits,
                   amount: raw.amount, parties: raw.parties || {}, y0: raw.y0, y1: raw.y1 });
      for (const r of (raw.rows || [])) {
        rows.push({ place_id: p.id, mp: r.mp, party: r.party, spent_on: r.date,
                    amount: r.amount, memo: r.memo, category: r.cat });
      }
    }
  }
  if (stats.length) await supa.rpc("food_assembly_set", { p_items: stats });
  let added = 0;
  for (let i = 0; i < rows.length; i += 400) {
    const { data } = await supa.rpc("food_assembly_rows_add", { p_items: rows.slice(i, i + 400) });
    added += (data?.n ?? 0);
  }
  return j({ ok: true, checked, kept, dropped, stats: stats.length, rows: added, ...res });
});
