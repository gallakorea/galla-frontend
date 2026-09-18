/* travel-weather — 여행지(전 세계) 지금 날씨 + 7일 예보. 사장님 26.9.18 「해외 날씨도」.
   · 소스: 노르웨이 기상청(MET Norway) locationforecast — 전 세계·무료·상업 이용 가능(CC BY 4.0, 출처 표기).
   · 좌표를 0.1°(약 11km) 칸으로 묶어 travel_wx_cache 에 한 시간 저장 — 같은 도시 장소 수백 곳이 같은 캐시를 쓴다.
   · MET 규칙: User-Agent 에 앱·연락처, 좌표 소수 4자리 이하, 필요 이상 부르지 않기. */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.4";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info" };
const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const UA = "GallaApp/1.0 https://galla.im admin@galla.im";
const TTL_MIN = 60;

function metToWmo(sym: string): number {
  const k = String(sym || "").replace(/_(day|night|polartwilight)$/, "");
  if (!k) return 3;
  if (k.includes("thunder")) return 95;
  const T: Record<string, number> = {
    clearsky: 0, fair: 1, partlycloudy: 2, cloudy: 3, fog: 45,
    lightrainshowers: 80, rainshowers: 81, heavyrainshowers: 82, lightrain: 61, rain: 63, heavyrain: 65,
    lightsleetshowers: 66, sleetshowers: 66, heavysleetshowers: 67, lightsleet: 66, sleet: 66, heavysleet: 67,
    lightsnowshowers: 85, snowshowers: 85, heavysnowshowers: 86, lightsnow: 71, snow: 73, heavysnow: 75,
  };
  return T[k] ?? 3;
}

/* 현지 날짜로 묶는다 — 시간대 DB 없이 경도로 근사(±1시간 오차는 일 단위 요약에 영향이 작다) */
function summarize(d: any, lon: number) {
  const ts: any[] = d?.properties?.timeseries || [];
  if (!ts.length) return null;
  const off = Math.round(lon / 15) * 3600e3;
  const t0 = ts[0].data;
  const now = {
    temp: Number(t0.instant?.details?.air_temperature),
    code: metToWmo(t0.next_1_hours?.summary?.symbol_code || t0.next_6_hours?.summary?.symbol_code || ""),
    precip: Number(t0.next_1_hours?.details?.precipitation_amount ?? 0),
    wind: Number(t0.instant?.details?.wind_speed),
  };
  const days: Record<string, { min: number; max: number; sym: string; symDist: number; rain: number }> = {};
  for (const x of ts) {
    const local = new Date(new Date(x.time).getTime() + off);
    const date = local.toISOString().slice(0, 10), hour = local.getUTCHours();
    const t = Number(x.data?.instant?.details?.air_temperature);
    const s6 = x.data?.next_6_hours?.summary?.symbol_code || x.data?.next_1_hours?.summary?.symbol_code || "";
    const r6 = Number(x.data?.next_6_hours?.details?.precipitation_amount ?? 0);
    const dd = days[date] ||= { min: Infinity, max: -Infinity, sym: "", symDist: 99, rain: 0 };
    if (Number.isFinite(t)) { dd.min = Math.min(dd.min, t); dd.max = Math.max(dd.max, t); }
    /* 그날의 대표 하늘 = 현지 정오에 가장 가까운 예보 */
    const dist = Math.abs(hour - 12);
    if (s6 && dist < dd.symDist) { dd.sym = s6; dd.symDist = dist; }
    if (x.data?.next_6_hours && [0, 6, 12, 18].includes(hour)) dd.rain += r6;
  }
  const list = Object.entries(days).filter(([, v]) => Number.isFinite(v.min)).slice(0, 7).map(([date, v]) => ({
    date, min: Math.round(v.min), max: Math.round(v.max), code: metToWmo(v.sym), rain: Math.round(v.rain * 10) / 10,
  }));
  return { now, days: list, updated: d?.properties?.meta?.updated_at || null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let b: any = {};
  try { b = await req.json(); } catch { /* */ }
  const lat = Number(b?.lat), lon = Number(b?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 85 || Math.abs(lon) > 180) return j({ ok: false, reason: "bad_coord" }, 400);
  const la = Math.round(lat * 10) / 10, lo = Math.round(lon * 10) / 10, key = `${la}|${lo}`;

  const { data: hit } = await sb.from("travel_wx_cache").select("data,fetched_at").eq("key", key).maybeSingle();
  if (hit && Date.now() - new Date(hit.fetched_at).getTime() < TTL_MIN * 60e3) return j({ ok: true, cached: true, ...hit.data });

  try {
    const res = await fetch(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${la}&lon=${lo}`,
      { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error("met_" + res.status);
    const sum = summarize(await res.json(), lo);
    if (!sum) throw new Error("met_empty");
    await sb.from("travel_wx_cache").upsert({ key, data: sum, fetched_at: new Date().toISOString() });
    return j({ ok: true, cached: false, ...sum });
  } catch (e) {
    /* 실패하면 오래된 캐시라도 준다 — 빈칸보다 낫다 */
    if (hit) return j({ ok: true, cached: true, stale: true, ...hit.data });
    return j({ ok: false, reason: String(e).slice(0, 80) }, 502);
  }
});
