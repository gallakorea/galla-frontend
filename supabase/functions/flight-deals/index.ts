/* flight-deals — 트래블페이아웃(Aviasales) 항공권 최저가 → flight_deals 캐시.
   사장님 26.9.24 「현재 항공권 시세나 환율이랑 연동해서 저렴한 나라들 보여주면서」.
   body {probe:true} 이면 응답 원형만 보고 돌아온다(필드 이름 확인용). */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.4";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const TOKEN = Deno.env.get("TRAVELPAYOUTS_TOKEN") || "";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, x-cron-secret" };
const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

async function api(path: string) {
  const res = await fetch(`https://api.travelpayouts.com/${path}`, {
    headers: { "X-Access-Token": TOKEN, "Accept-Encoding": "gzip" },
    signal: AbortSignal.timeout(20000),
  });
  const txt = await res.text();
  let d: any = null; try { d = JSON.parse(txt); } catch { /* 오류 본문 */ }
  return { status: res.status, d, head: txt.slice(0, 300) };
}

/* 국내선·인접 중복을 빼기 위한 한국 공항(출발지 주변) */
const KR = new Set(["SEL", "ICN", "GMP", "CJU", "PUS", "TAE", "KWJ", "CJJ", "RSU", "USN", "HIN", "KUV", "WJU", "YNY", "MWX"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!TOKEN) return j({ ok: false, reason: "no_token" }, 500);
  let b: any = {}; try { b = await req.json(); } catch { /* 크론은 본문 없음 */ }

  if (b?.probe) {
    const r = await api("v2/prices/latest?currency=krw&origin=SEL&limit=3&sorting=price&period_type=year&show_to_affiliates=true");
    return j({ status: r.status, sample: r.d?.data?.slice?.(0, 3) ?? r.d, head: r.d ? undefined : r.head });
  }

  /* 1) 서울 출발 최근 실거래 최저가 — 넉넉히 받아 나라별로 추린다 */
  const r = await api("v2/prices/latest?currency=krw&origin=SEL&limit=500&sorting=price&period_type=year&one_way=false&show_to_affiliates=true");
  const rows: any[] = Array.isArray(r.d?.data) ? r.d.data : [];
  if (!rows.length) return j({ ok: false, reason: "empty", status: r.status, head: r.head }, 502);

  /* 2) 코드 → 한국어 도시·나라 이름 */
  const [cityRes, ctryRes] = await Promise.all([
    fetch("https://api.travelpayouts.com/data/ko/cities.json", { signal: AbortSignal.timeout(30000) }).then((x) => x.json()).catch(() => []),
    fetch("https://api.travelpayouts.com/data/ko/countries.json", { signal: AbortSignal.timeout(20000) }).then((x) => x.json()).catch(() => []),
  ]);
  const cityMap = new Map<string, any>();
  for (const c of (cityRes || [])) cityMap.set(c.code, c);
  const ctryMap = new Map<string, string>();
  for (const c of (ctryRes || [])) ctryMap.set(c.code, c.name || c.code);

  /* 3) 목적지별 최저가 하나씩(국내선 제외), 가격순 */
  const best = new Map<string, any>();
  for (const row of rows) {
    const dest = row.destination || row.destination_airport;
    const price = Number(row.value ?? row.price ?? 0);
    if (!dest || KR.has(dest) || !price) continue;
    const prev = best.get(dest);
    if (!prev || price < prev.price) {
      const city = cityMap.get(dest);
      /* '옌타이 시' 같은 접미사·앞뒤 공백 정리 */
      const cname = String(city?.name || dest).replace(/\s*(시|市)$/, "").trim();
      best.set(dest, {
        dest,
        city: cname,
        country_code: city?.country_code || null,
        country: city?.country_code ? (ctryMap.get(city.country_code) || null) : null,
        price,
        depart_date: row.depart_date || null,
        return_date: row.return_date || null,
        airline: null, /* gate 는 판매처(러시아어)라 쓰지 않는다 */
        changes: Number(row.number_of_changes ?? 0),
        found_at: row.found_at || null,
        updated_at: new Date().toISOString(),
      });
    }
  }
  const list = [...best.values()].filter((x) => x.country).sort((a, b) => a.price - b.price).slice(0, 60);
  if (!list.length) return j({ ok: false, reason: "no_named", total: rows.length }, 502);

  const { error } = await sb.from("flight_deals").upsert(list, { onConflict: "dest" });
  if (error) return j({ ok: false, error: error.message }, 500);
  /* 오래된 줄만 정리(방금 넣은 건 updated_at 이 지금) */
  const cut = new Date(Date.now() - 7 * 864e5).toISOString();
  const { count: stale } = await sb.from("flight_deals").select("dest", { count: "exact", head: true }).lt("updated_at", cut);
  if (stale) await sb.from("flight_deals").delete().lt("updated_at", cut);

  return j({ ok: true, fetched: rows.length, saved: list.length, removed: stale || 0, cheapest: list.slice(0, 3) });
});
