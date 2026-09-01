// 지자체 업무추진비 → '공무원이 다녀간 집'.
//
// 서울시 본청 odExpense 는 EXEC_LOC 에 '상호(도로명주소)' 가 한 칸으로 들어온다.
//   실측: 40건 중 38건(95%)에 도로명 주소 포함. 국회 데이터(상호만)보다 낫다 —
//         주소가 같이 오니 네이버 검증의 지역 대조가 정확해진다.
// 총 167,768건. 라이선스는 공공누리 1유형(출처표시·상업적 이용 및 변경 가능).
//
// ⚠️ 같은 가게가 수십 번 나온다(한 부서가 단골집을 계속 간다). 배치 안에서 한 번,
//    배치 사이엔 gov_expense_seen 으로 걸러 **네이버를 두 번 부르지 않는다**.
// ⚠️ 물어본 사실은 성공 여부와 무관하게 남긴다. 오늘만 네 번 밟은 함정이다 —
//    실패한 장소를 안 남기면 매 회차 같은 걸 다시 묻는다.
// ⚠️ 음식점이 아닌 결제가 많다(쿠팡·비즈플레이·호텔 등). 네이버 카테고리 가드가 걸러낸다.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const SEOUL = Deno.env.get("SEOUL_OPENAPI_KEY") || "";
const S_ID = Deno.env.get("NAVER_SEARCH_ID") || Deno.env.get("NAVER_CLIENT_ID") || "";
const S_SEC = Deno.env.get("NAVER_SEARCH_SECRET") || Deno.env.get("NAVER_CLIENT_SECRET") || "";

const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const strip = (s: string) => String(s || "").replace(/<[^>]*>/g, "").replace(/&[a-z]+;/g, " ").trim();

/* ── 검증 관문 — ingest-baeknyeon·harvest-creator-places 와 같은 가드를 쓴다.
      새로 짜면 세 경로의 기준이 조용히 갈라진다. ── */
const FOOD_RE = /^(음식점|카페|제과|베이커리|술집|주점)/;
const isFood = (c: string) => FOOD_RE.test(c) || /음식|카페|한식|중식|일식|양식|분식|치킨|호프|주점|베이커리|제과/.test(c);
function pickCoord(mapx: string, mapy: string) {
  let lon = Number(mapx), lat = Number(mapy);
  if (!isFinite(lon) || !isFinite(lat)) return {} as { lat?: number; lon?: number };
  if (Math.abs(lon) > 1000) { lon /= 1e7; lat /= 1e7; }
  if (lat < 33 || lat > 39.5 || lon < 124 || lon > 132) return {};
  return { lat, lon };
}
const hintOf = (a: string) => String(a || "").trim().split(/\s+/).slice(0, 2).join(" ");
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
    if (!isFood(strip(it.category))) return false;
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

/* '상호(주소)' 를 가른다. 괄호는 반각·전각 둘 다 온다.
   ⚠️ 주소에 '서울'이 빠진 값이 흔하다('중구 다동길13'). 지역 힌트가 '중구 다동길13' 이 되면
      hintOf 가 엉뚱한 두 토큰을 잡는다 — 본청 데이터이므로 서울을 앞에 채워준다. */
function parseLoc(loc: string) {
  const m = String(loc || "").trim().match(/^(.*?)\s*[(（]\s*(.+?)\s*[)）]\s*$/);
  if (!m) return null;
  const name = m[1].trim();
  let addr = m[2].trim().replace(/,\s*$/, "");
  if (!/^(서울|서울특별시)/.test(addr)) addr = "서울 " + addr;
  if (name.length < 2 || addr.length < 6) return null;
  return { name, addr };
}

Deno.serve(async (req) => {
  const xcron = req.headers.get("x-cron-secret") || "";
  const auth = req.headers.get("authorization") || "";
  if (CRON_SECRET && xcron !== CRON_SECRET && !auth.includes(CRON_SECRET)) {
    return j({ ok: false, reason: "unauthorized" }, 401);
  }
  if (!SEOUL) return j({ ok: false, reason: "no_seoul_key" }, 500);
  if (!S_ID || !S_SEC) return j({ ok: false, reason: "no_search_key" }, 500);

  const url = new URL(req.url);
  const source = "seoul_odExpense";
  const n = Math.min(Number(url.searchParams.get("n") || "300"), 1000);
  const cap = Math.min(Number(url.searchParams.get("cap") || "110"), 200);

  const { data: cur } = await supa.from("gov_ingest_cursor").select("next_offset")
    .eq("source", source).maybeSingle();
  const start = Math.max(Number(cur?.next_offset || 1), 1);
  const end = start + n - 1;

  const r = await fetch(`http://openapi.seoul.go.kr:8088/${SEOUL}/json/odExpense/${start}/${end}/`);
  if (!r.ok) return j({ ok: false, reason: `seoul ${r.status}` }, 502);
  const body = await r.json();
  const box = body?.odExpense;
  const rows: any[] = box?.row || [];
  const total = Number(box?.list_total_count || 0);
  if (!rows.length) {
    return j({ ok: true, source, start, note: "더 없음", total });
  }

  /* 배치 안에서 먼저 접는다 — 한 부서가 같은 집을 계속 간다 */
  const cand = new Map<string, { name: string; addr: string }>();
  for (const row of rows) {
    const p = parseLoc(row?.EXEC_LOC || "");
    if (!p) continue;
    cand.set(`${p.name}|${p.addr}`.replace(/\s/g, "").toLowerCase(), p);
  }
  const keys = [...cand.keys()];

  /* 배치 사이 중복 제거 — 이미 물어본 장소는 건너뛴다 */
  const seen = new Set<string>();
  for (let i = 0; i < keys.length; i += 200) {
    const { data } = await supa.from("gov_expense_seen").select("loc_key")
      .in("loc_key", keys.slice(i, i + 200));
    for (const s of (data || []) as any[]) seen.add(s.loc_key);
  }
  const todo = keys.filter((k) => !seen.has(k)).slice(0, cap);

  const items: any[] = [];
  const stamp: any[] = [];
  for (const k of todo) {
    const p = cand.get(k)!;
    const v = await verify(p.name, p.addr);
    await new Promise((s) => setTimeout(s, 70));
    stamp.push({ loc_key: k, resolved: !!v });
    if (v) items.push({ ...v, channel: "seoul_gov", origin: "gov" });
  }

  let res: any = { new: 0, dup: 0 };
  if (items.length) {
    const { data } = await supa.rpc("food_ingest", { p_items: items });
    res = data || res;
  }
  for (let i = 0; i < stamp.length; i += 200) {
    await supa.from("gov_expense_seen").upsert(stamp.slice(i, i + 200), { onConflict: "loc_key" });
  }
  /* 커서는 '읽은 행 수' 만큼 민다. cap 에 걸려 못 본 장소는 어차피 뒤에서 또 나온다
     (같은 집을 계속 가는 데이터라 유실이 아니다). */
  await supa.from("gov_ingest_cursor")
    .upsert({ source, next_offset: end + 1, total, updated_at: new Date().toISOString() },
            { onConflict: "source" });

  return j({ ok: true, source, start, end, total, rows: rows.length,
             locs: keys.length, fresh: todo.length, verified: items.length, ...res });
});
