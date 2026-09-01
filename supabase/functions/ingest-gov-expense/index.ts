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
const GG = Deno.env.get("GG_OPENAPI_KEY") || "";

/* ⚠️ 경기 openapi.gg.go.kr 는 WAF 가 붙어 있다. User-Agent 가 없으면 JSON 대신
      euc-kr HTML("보안 정책에 의해 차단되었습니다")을 200 으로 돌려준다(실측).
      브라우저 UA 를 반드시 실어보낸다. */
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
           "(KHTML, like Gecko) Chrome/140.0 Safari/537.36";
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

/* 서울: '상호(주소)' 를 가른다. 괄호는 반각·전각 둘 다 온다.
   ⚠️ 주소에 '서울'이 빠진 값이 흔하다('중구 다동길13'). 지역 힌트가 '중구 다동길13' 이 되면
      hintOf 가 엉뚱한 두 토큰을 잡는다 — 본청 데이터이므로 서울을 앞에 채워준다. */
function parseSeoul(loc: string) {
  const m = String(loc || "").trim().match(/^(.*?)\s*[(（]\s*(.+?)\s*[)）]\s*$/);
  if (!m) return null;
  const name = m[1].trim();
  let addr = m[2].trim().replace(/,\s*$/, "");
  if (!/^(서울|서울특별시)/.test(addr)) addr = "서울 " + addr;
  if (name.length < 2 || addr.length < 6) return null;
  return { name, addr };
}

/* 경기: USE_LOC 에 **상호만** 온다(실측 40건 중 주소 0건).
   ⚠️ 주소가 없으면 동명 상호를 못 가른다. 짧은 상호는 아예 안 묻는다 —
      '본당' '온담' 같은 두 글자는 전국에 널렸고, 엉뚱한 집을 붙이면 '누가 갔나'가 거짓말이 된다.
      지역 힌트 '경기'로 검색하고, 돌려받은 주소에 '경기'가 없으면 regionOk 가 버린다. */
function parseGg(loc: string) {
  const name = String(loc || "").trim().replace(/\s+/g, " ");
  if (name.replace(/\s/g, "").length < 4) return null;
  return { name, addr: "경기" };
}

/* 소스별 설정 — 새 지자체는 여기 한 줄만 는다 */
const SOURCES: Record<string, {
  cursor: string; channel: string; key: () => string;
  url: (k: string, s: number, e: number) => string;
  rows: (b: any) => { list: any[]; total: number };
  loc: (r: any) => string;
  parse: (loc: string) => { name: string; addr: string } | null;
}> = {
  seoul: {
    cursor: "seoul_odExpense", channel: "seoul_gov", key: () => SEOUL,
    url: (k, s, e) => `http://openapi.seoul.go.kr:8088/${k}/json/odExpense/${s}/${e}/`,
    rows: (b) => ({ list: b?.odExpense?.row || [], total: Number(b?.odExpense?.list_total_count || 0) }),
    loc: (r) => r?.EXEC_LOC || "", parse: parseSeoul,
  },
  gg: {
    cursor: "gg_TBGGHPEXECDESCM", channel: "gg_gov", key: () => GG,
    /* 경기는 offset 이 아니라 페이지 번호다 — 커서를 pSize 로 나눠 페이지로 바꾼다 */
    url: (k, s, e) => `https://openapi.gg.go.kr/TBGGHPEXECDESCM?KEY=${k}&Type=json` +
                      `&pSize=${e - s + 1}&pIndex=${Math.floor((s - 1) / (e - s + 1)) + 1}`,
    rows: (b) => {
      const box = b?.TBGGHPEXECDESCM;
      return { list: box?.[1]?.row || [],
               total: Number(box?.[0]?.head?.[0]?.list_total_count || 0) };
    },
    loc: (r) => r?.USE_LOC || "", parse: parseGg,
  },
};

Deno.serve(async (req) => {
  const xcron = req.headers.get("x-cron-secret") || "";
  const auth = req.headers.get("authorization") || "";
  if (CRON_SECRET && xcron !== CRON_SECRET && !auth.includes(CRON_SECRET)) {
    return j({ ok: false, reason: "unauthorized" }, 401);
  }
  if (!S_ID || !S_SEC) return j({ ok: false, reason: "no_search_key" }, 500);

  const url = new URL(req.url);
  const src = url.searchParams.get("source") || "seoul";
  const cfg = SOURCES[src];
  if (!cfg) return j({ ok: false, reason: "unknown_source" }, 400);
  const key = cfg.key();
  if (!key) return j({ ok: false, reason: `no_key_${src}` }, 500);

  const n = Math.min(Number(url.searchParams.get("n") || "300"), 1000);
  const cap = Math.min(Number(url.searchParams.get("cap") || "110"), 200);

  const { data: cur } = await supa.from("gov_ingest_cursor").select("next_offset")
    .eq("source", cfg.cursor).maybeSingle();
  const start = Math.max(Number(cur?.next_offset || 1), 1);
  const end = start + n - 1;

  /* ⚠️ UA 를 반드시 싣는다 — 경기 WAF 는 UA 없는 요청에 euc-kr HTML 을 200 으로 돌려준다. */
  const r = await fetch(cfg.url(key, start, end), { headers: { "User-Agent": UA } });
  if (!r.ok) return j({ ok: false, reason: `${src} ${r.status}` }, 502);
  const text = await r.text();
  let body: any;
  try { body = JSON.parse(text); }
  catch { return j({ ok: false, reason: `${src}_not_json`, head: text.slice(0, 120) }, 502); }
  const { list: rows, total } = cfg.rows(body);
  if (!rows.length) return j({ ok: true, source: src, start, note: "더 없음", total });

  /* 배치 안에서 먼저 접는다 — 한 부서가 같은 집을 계속 간다 */
  const cand = new Map<string, { name: string; addr: string }>();
  for (const row of rows) {
    const p = cfg.parse(cfg.loc(row));
    if (!p) continue;
    cand.set(`${src}|${p.name}|${p.addr}`.replace(/\s/g, "").toLowerCase(), p);
  }
  const keys = [...cand.keys()];

  /* 배치 사이 중복 제거 — 이미 물어본 장소는 건너뛴다 */
  const seen = new Set<string>();
  for (let i = 0; i < keys.length; i += 200) {
    const { data } = await supa.from("gov_expense_seen").select("loc_key")
      .in("loc_key", keys.slice(i, i + 200));
    for (const x of (data || []) as any[]) seen.add(x.loc_key);
  }
  const todo = keys.filter((k) => !seen.has(k)).slice(0, cap);

  const items: any[] = [];
  const stamp: any[] = [];
  for (const k of todo) {
    const p = cand.get(k)!;
    const v = await verify(p.name, p.addr);
    await new Promise((s) => setTimeout(s, 70));
    stamp.push({ loc_key: k, resolved: !!v });
    if (v) items.push({ ...v, channel: cfg.channel, origin: "gov" });
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
    .upsert({ source: cfg.cursor, next_offset: end + 1, total,
              updated_at: new Date().toISOString() }, { onConflict: "source" });

  return j({ ok: true, source: src, start, end, total, rows: rows.length,
             locs: keys.length, fresh: todo.length, verified: items.length, ...res });
});
