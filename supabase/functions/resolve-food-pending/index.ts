// 대기열 해소 — 상호만 있고 주소가 없는 건을 살려 지도에 올린다
//
// 배경: 수집기가 영상에서 상호는 뽑았는데 주소가 없어 food_pending 에 쌓인 게 63건이다.
//   NCP Geocoding 은 '주소→좌표'라 상호로는 못 찾는다.
//
// 🔑 설계: 상호로는 **주소만** 얻고, 좌표는 이미 검증된 NCP Geocoding 에 맡긴다.
//   지역검색이 주는 mapx/mapy 는 좌표계 표기가 버전마다 달라 함정이다
//   (TM128 인지 WGS84×10^7 인지 응답만 봐선 확신할 수 없다).
//   주소를 한 번 거치면 그 모호함을 통째로 피하고, 이미 돌아가는 코드를 재사용한다.
//
// ⚖️ 네이버 플레이스는 **공식 지역검색 API 로만** 쓴다.
//   플레이스 페이지를 긁어 메뉴·사진·리뷰를 가져오는 건 하지 않는다 —
//   약관이 금지하고, 리뷰·사진은 작성자의 저작물이다.
//
// 🔑 시크릿
//   NAVER_SEARCH_ID / NAVER_SEARCH_SECRET   ← 네이버 개발자센터(openapi.naver.com)
//   NAVER_CLIENT_ID / NAVER_CLIENT_SECRET   ← NCP Maps(지오코딩). 검색과 **다른 키**다.
//   둘이 다르다는 걸 매번 헷갈려서, 검색 키가 없으면 NCP 키로도 한 번 시도하고
//   무엇이 실패했는지 응답에 남긴다.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const S_ID = Deno.env.get("NAVER_SEARCH_ID") || Deno.env.get("NAVER_CLIENT_ID") || "";
const S_SEC = Deno.env.get("NAVER_SEARCH_SECRET") || Deno.env.get("NAVER_CLIENT_SECRET") || "";
const USING_FALLBACK = !Deno.env.get("NAVER_SEARCH_ID");
const NCP_ID = Deno.env.get("NAVER_CLIENT_ID") || "";
const NCP_SEC = Deno.env.get("NAVER_CLIENT_SECRET") || "";

const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

const strip = (s: string) => String(s || "").replace(/<[^>]*>/g, "").trim();

type Found = { name: string; address: string; category?: string; phone?: string };

/* 상호 → 주소. 지역힌트를 붙이면 동명이인(체인·같은 이름 다른 동네)을 줄인다. */
async function findPlace(name: string, hint: string | null): Promise<{ hit: Found | null; err?: string }> {
  const q = (hint ? hint + " " : "") + name;
  const u = new URL("https://openapi.naver.com/v1/search/local.json");
  u.searchParams.set("query", q);
  u.searchParams.set("display", "5");
  const r = await fetch(u, {
    headers: { "X-Naver-Client-Id": S_ID, "X-Naver-Client-Secret": S_SEC },
  });
  if (!r.ok) {
    const body = (await r.text()).slice(0, 160);
    return { hit: null, err: `search_${r.status}: ${body}` };
  }
  const d = await r.json();
  const items = d?.items || [];
  if (!items.length) return { hit: null };

  /* 이름이 실제로 맞는 것만 고른다 — 지역검색은 느슨하게 매칭해서
     "김밥천국"으로 검색해도 엉뚱한 집이 1위로 올 수 있다. */
  const norm = (s: string) => s.replace(/\s/g, "").toLowerCase();
  const want = norm(name);
  const best = items.find((it: any) => {
    const t = norm(strip(it.title));
    return t.includes(want) || want.includes(t);
  });
  if (!best) return { hit: null };

  const addr = strip(best.roadAddress) || strip(best.address);
  if (!addr) return { hit: null };
  return {
    hit: {
      name: strip(best.title) || name,
      address: addr,
      category: (strip(best.category).split(">").pop() || "").trim() || undefined,
      phone: strip(best.telephone) || undefined,
    },
  };
}

/* 주소 → 좌표 (NCP Geocoding). 수집기에서 이미 돌고 있는 경로를 그대로 쓴다. */
async function geocode(addr: string): Promise<{ lat?: number; lon?: number; address?: string }> {
  if (!NCP_ID || !NCP_SEC) return {};
  const u = new URL("https://maps.apigw.ntruss.com/map-geocode/v2/geocode");
  u.searchParams.set("query", addr);
  const r = await fetch(u, {
    headers: {
      "x-ncp-apigw-api-key-id": NCP_ID,
      "x-ncp-apigw-api-key": NCP_SEC,
      Accept: "application/json",
    },
  });
  if (!r.ok) return {};
  const a = (await r.json())?.addresses?.[0];
  if (!a) return {};
  return { lat: Number(a.y), lon: Number(a.x), address: a.roadAddress || a.jibunAddress || addr };
}

Deno.serve(async (req) => {
  const xcron = req.headers.get("x-cron-secret") || "";
  const auth = req.headers.get("authorization") || "";
  if (CRON_SECRET && xcron !== CRON_SECRET && !auth.includes(CRON_SECRET)) {
    return j({ ok: false, reason: "unauthorized" }, 401);
  }
  if (!S_ID || !S_SEC) return j({ ok: false, reason: "no_search_key" }, 500);

  const url = new URL(req.url);
  const cap = Number(url.searchParams.get("limit") || "40");

  const { data: rows } = await supa.rpc("food_pending_take", { p_limit: cap });
  const list = (rows || []) as any[];
  if (!list.length) return j({ ok: true, taken: 0, resolved: 0 });

  let resolved = 0, missed = 0, geoOk = 0;
  const errs: string[] = [];

  for (const it of list) {
    const { hit, err } = await findPlace(it.name, it.region_hint);
    if (err && errs.length < 3) errs.push(err);
    if (!hit) {
      missed++;
      await supa.rpc("food_pending_settle", { p_id: it.id, p_place: null });
      continue;
    }
    const g = await geocode(hit.address);
    if (g.lat) geoOk++;
    await supa.rpc("food_pending_settle", {
      p_id: it.id,
      p_place: {
        name: hit.name,
        address: g.address || hit.address,
        category: hit.category || null,
        phone: hit.phone || null,
        lat: g.lat != null ? String(g.lat) : null,
        lon: g.lon != null ? String(g.lon) : null,
      },
    });
    resolved++;
    // 지역검색 일 25,000회. 63건엔 여유롭지만 예의상 간격을 둔다.
    await new Promise((s) => setTimeout(s, 120));
  }

  return j({
    ok: true, taken: list.length, resolved, missed, geocoded: geoOk,
    search_key: USING_FALLBACK ? "NCP키로_대체시도" : "NAVER_SEARCH_ID",
    errors: errs,
  });
});
