// 지역·도시 이름을 한국어로 정리한다 — 사장님: "크롤 끝나면 지역명 한글로 정리해"
//
// 화면에 'Gauteng'·'Kyoto'·'Tokashiki' 같은 영문이 섞여 있다. 정방향 지오코딩이
// 영어로 준 값이 그대로 저장된 자리다. 우리 유저가 읽는 이름은 한국어여야 한다.
//
// 🔤 두 관문 (둘 다 무료)
//   ① 위키데이터 — 이름으로 찾아 **P17(국가) 대조** 후 ko 라벨을 쓴다. 제일 정확하다.
//      ⚠️ 국가 대조를 안 하면 'Gauteng' 같은 흔한 지명이 딴 나라 것으로 걸린다.
//   ② OSM 역지오코딩(Accept-Language: ko) — 그 지역 장소들의 평균 좌표로 되묻는다.
//      위키데이터에 항목이 없는 소도시·읍면이 여기서 걸린다. 정책상 1초 1회.
//
// ⚠️ 못 찾은 것도 원장(travel_geo_ko)에 남긴다. 안 그러면 매 회차 같은 이름을 다시 물어본다.
// ⚠️ 이름을 바꾸면 지역 배너의 키(code='JP|교토부')도 같이 바뀌어야 한다 —
//    RPC(travel_localize_apply)가 그 이동까지 한다. 여기서 따로 건드리지 않는다.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const UA = "GallaTravel/1.0 (https://galla.im; contact@galla.im)";

const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hasHangul = (s: string) => /[가-힣]/.test(String(s || ""));

async function entity(qid: string) {
  const r = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`,
                        { headers: { "User-Agent": UA } });
  if (!r.ok) return null;
  return (await r.json())?.entities?.[qid] || null;
}
const claim = (e: any, p: string) => e?.claims?.[p]?.[0]?.mainsnak?.datavalue?.value ?? null;

/* 국가 QID → ISO2. 같은 나라를 반복해서 물어보지 않게 캐시한다. */
const ccCache = new Map<string, string | null>();
async function ccOf(qid: string) {
  if (ccCache.has(qid)) return ccCache.get(qid)!;
  const e = await entity(qid);
  const cc = (claim(e, "P297") as string) || null;
  ccCache.set(qid, cc);
  return cc;
}

async function koFromWikidata(name: string, cc: string) {
  const u = new URL("https://www.wikidata.org/w/api.php");
  u.searchParams.set("action", "wbsearchentities");
  u.searchParams.set("search", name);
  u.searchParams.set("language", "en");
  u.searchParams.set("uselang", "en");
  u.searchParams.set("format", "json");
  u.searchParams.set("limit", "5");
  const r = await fetch(u, { headers: { "User-Agent": UA } });
  if (!r.ok) return null;
  for (const h of ((await r.json())?.search || []).slice(0, 5)) {
    const e = await entity(h.id);
    if (!e) continue;
    const cQid = claim(e, "P17")?.id;
    if (!cQid) continue;
    if ((await ccOf(cQid)) !== cc) continue;      // 딴 나라의 동명 지역
    const ko = e?.labels?.ko?.value;
    if (ko && hasHangul(ko)) return ko as string;
    await sleep(80);
  }
  return null;
}

async function koFromOsm(lat: number, lon: number, kind: string) {
  const u = new URL("https://nominatim.openstreetmap.org/reverse");
  u.searchParams.set("lat", String(lat));
  u.searchParams.set("lon", String(lon));
  u.searchParams.set("format", "jsonv2");
  u.searchParams.set("addressdetails", "1");
  u.searchParams.set("zoom", kind === "admin1" ? "8" : "10");
  const r = await fetch(u, { headers: { "User-Agent": UA, "Accept-Language": "ko" } });
  if (!r.ok) return null;
  const a = (await r.json())?.address || {};
  const v = kind === "admin1"
    ? (a.state || a.province || a.region || a.county)
    : (a.city || a.town || a.village || a.municipality || a.county);
  return v && hasHangul(v) ? String(v) : null;
}

Deno.serve(async (req) => {
  const xcron = req.headers.get("x-cron-secret") || "";
  const auth = req.headers.get("authorization") || "";
  if (CRON_SECRET && xcron !== CRON_SECRET && !auth.includes(CRON_SECRET)) {
    return j({ ok: false, reason: "unauthorized" }, 401);
  }
  const url = new URL(req.url);
  const n = Math.min(Number(url.searchParams.get("n") || "20"), 40);

  const { data: todo } = await supa.rpc("travel_names_to_localize", { p_limit: n });
  const list = (todo || []) as any[];
  if (!list.length) return j({ ok: true, picked: 0, note: "한글화할 이름 없음" });

  const items: any[] = [];
  const log: string[] = [];
  for (const t of list) {
    const row: any = { country_code: t.country_code, raw: t.raw };
    try {
      let ko = await koFromWikidata(t.raw, t.country_code);
      if (ko) row.src = "wikidata";
      if (!ko && t.lat != null) {
        ko = await koFromOsm(Number(t.lat), Number(t.lon), t.kind);
        if (ko) row.src = "osm";
        await sleep(1100);                       // Nominatim 정책: 초당 1회
      }
      if (ko) row.ko = ko;
      if (log.length < 20) log.push(`${t.raw} → ${ko || "없음"}`);
    } catch (e) {
      if (log.length < 20) log.push(`${t.raw} 실패`);
    }
    items.push(row);          // 못 찾아도 남긴다 — 다음 회차에 또 물어보지 않게
  }

  const { data: res } = await supa.rpc("travel_localize_apply", { p_items: items });

  /* 광역이 아예 비어 있는 장소도 여기서 채운다.
     수확 경로에서 뺀 일이다 — 거기선 장소마다 1.1초가 붙어 회차를 잡아먹었다. */
  let a1 = 0;
  try {
    const { data: miss } = await supa.rpc("travel_places_missing_admin1", { p_limit: 12 });
    const rows: any[] = [];
    for (const m of ((miss || []) as any[])) {
      const v = await koFromOsm(Number(m.lat), Number(m.lon), "admin1");
      await sleep(1100);
      if (v) { rows.push({ id: m.id, admin1: v }); a1++; }
    }
    if (rows.length) await supa.rpc("travel_admin1_save", { p_items: rows });
  } catch (_) { /* 보강 실패가 한글화를 막지는 않는다 */ }

  return j({ ok: true, picked: list.length, ...(res || {}), admin1Filled: a1,
             localized: items.filter((i) => i.ko).length, log });
});
