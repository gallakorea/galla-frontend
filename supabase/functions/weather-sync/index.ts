/* weather-sync — 시·도·시군구(+즐겨찾기된 동) '지금 날씨'를 받아 weather_obs 에 캐시한다.
   body {region} 이 오면 그 한 곳(주로 읍·면·동)만 받는다 — 동네 방을 열 때 DB(weather_room)가 부른다.
   ⚠️ 브라우저에서 외부 날씨 API 를 직접 부르지 않는다 — CSP connect-src 가 'self' 라 막히고,
      막히지 않더라도 방문자 수만큼 외부 호출이 나간다. 서버가 10분에 한 번만 받아 캐시한다.

   출처 우선순위
     1) 기상청 초단기실황(KMA) — KMA_SERVICE_KEY 가 있을 때.
        PTY(강수형태)가 '지금 실제로 비/눈이 오는지'를 직접 준다. 이 기능의 재미("기상청은
        안 온다는데 우리 동네는 쏟아짐")가 성립하려면 비교 대상이 기상청이어야 한다.
     2) 노르웨이 기상청(MET Norway, api.met.no) — 키 없이 동작하는 폴백. 모델 예측값이라 결이 다르지만 없는 것보단 낫다.
        ⚠️ 26.9.18 Open-Meteo 에서 바꿨다 — Open-Meteo 무료는 **비상업 전용**이라 출시하면 약관 위반이다.
           MET 는 상업 이용 가능(CC BY 4.0, 출처 표기), 대신 규칙이 있다:
           · User-Agent 에 앱과 연락처를 밝힐 것(없으면 403) · 좌표는 소수 4자리까지
           · 필요 이상 부르지 말 것 → 받은 지 25분 안 된 지점은 건너뛴다(10분 크론이라도 지점당 시간당 2회 남짓)
           · 초당 20회 넘기지 말 것 → 동시 10건씩 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.4";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const KMA_KEY = Deno.env.get("KMA_SERVICE_KEY") || "";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" };
const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

type Region = { code: string; name: string; lat: number; lon: number; nx?: number | null; ny?: number | null; kind?: string };

/* 위경도 → 기상청 격자(nx,ny). 기상청 공식 LCC(Lambert Conformal Conic) 변환.
   ⚠️ 도시별 격자표를 외워 넣지 않는다 — 표를 잘못 옮기면 엉뚱한 동네 날씨가 나온다. */
function toGrid(lat: number, lon: number) {
  const RE = 6371.00877, GRID = 5.0, SLAT1 = 30.0, SLAT2 = 60.0, OLON = 126.0, OLAT = 38.0, XO = 43, YO = 136;
  const DEGRAD = Math.PI / 180.0;
  const re = RE / GRID, slat1 = SLAT1 * DEGRAD, slat2 = SLAT2 * DEGRAD, olon = OLON * DEGRAD, olat = OLAT * DEGRAD;
  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = Math.pow(sf, sn) * Math.cos(slat1) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = re * sf / Math.pow(ro, sn);
  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
  ra = re * sf / Math.pow(ra, sn);
  let theta = lon * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;
  return { nx: Math.floor(ra * Math.sin(theta) + XO + 0.5), ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5) };
}

/* 기상청 초단기실황 기준시각 — 매시 정시 발표, 약 40분 뒤 제공. 안전하게 45분 여유. */
function kmaBaseTime(now: Date) {
  const kst = new Date(now.getTime() + 9 * 3600e3);
  kst.setUTCMinutes(kst.getUTCMinutes() - 45);
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    base_date: `${kst.getUTCFullYear()}${p(kst.getUTCMonth() + 1)}${p(kst.getUTCDate())}`,
    base_time: `${p(kst.getUTCHours())}00`,
  };
}

/* PTY(강수형태) → WMO 코드로 통일(프론트가 한 벌만 알면 되게).
   0 없음 / 1 비 / 2 비눈 / 3 눈 / 5 빗방울 / 6 빗방울눈날림 / 7 눈날림 */
const PTY_TO_WMO: Record<number, number> = { 0: 0, 1: 61, 2: 66, 3: 71, 5: 51, 6: 66, 7: 71 };

async function fromKMA(rs: Region[]) {
  const { base_date, base_time } = kmaBaseTime(new Date());
  const out: Record<string, any> = {};
  await Promise.all(rs.map(async (r) => {
    /* 동(읍·면·동)은 기상청 격자표의 nx·ny 를 그대로 쓴다 — 없으면(시도·시군구) 위경도에서 LCC 변환 */
    const { nx, ny } = (r.nx && r.ny) ? { nx: r.nx, ny: r.ny } : toGrid(r.lat, r.lon);
    const u = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst"
      + `?serviceKey=${KMA_KEY}&numOfRows=20&pageNo=1&dataType=JSON`
      + `&base_date=${base_date}&base_time=${base_time}&nx=${nx}&ny=${ny}`;
    try {
      const res = await fetch(u, { signal: AbortSignal.timeout(9000) });
      const d = await res.json();
      const items = d?.response?.body?.items?.item;
      if (!Array.isArray(items)) return;
      const g = (c: string) => items.find((x: any) => x.category === c)?.obsrValue;
      const pty = Number(g("PTY") ?? 0);
      out[r.code] = {
        temp: Number(g("T1H") ?? NaN), precip: Number(g("RN1") ?? 0),
        code: PTY_TO_WMO[pty] ?? 0, wind: Number(g("WSD") ?? NaN),
        obs_at: new Date().toISOString(),
      };
    } catch { /* 이 지역만 건너뛴다 — 하나 실패로 전체를 버리지 않는다 */ }
  }));
  return out;
}

/* MET symbol_code → WMO 코드(프론트는 WMO 한 벌만 안다). 접미사 _day/_night/_polartwilight 는 떼고 본다 */
function metToWmo(sym: string): number {
  const k = String(sym || "").replace(/_(day|night|polartwilight)$/, "");
  if (!k) return 3;
  if (k.includes("thunder")) return 95;
  const T: Record<string, number> = {
    clearsky: 0, fair: 1, partlycloudy: 2, cloudy: 3, fog: 45,
    lightrainshowers: 80, rainshowers: 81, heavyrainshowers: 82,
    lightrain: 61, rain: 63, heavyrain: 65,
    lightsleetshowers: 66, sleetshowers: 66, heavysleetshowers: 67,
    lightsleet: 66, sleet: 66, heavysleet: 67,
    lightsnowshowers: 85, snowshowers: 85, heavysnowshowers: 86,
    lightsnow: 71, snow: 73, heavysnow: 75,
  };
  return T[k] ?? 3;
}
const MET_UA = "GallaApp/1.0 https://galla.im admin@galla.im";

export async function metNow(lat: number, lon: number) {
  const u = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`;
  const res = await fetch(u, { headers: { "User-Agent": MET_UA }, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error("met_" + res.status);
  const d = await res.json();
  const t0 = d?.properties?.timeseries?.[0]?.data;
  if (!t0) throw new Error("met_empty");
  const sym = t0.next_1_hours?.summary?.symbol_code || t0.next_6_hours?.summary?.symbol_code || "";
  return {
    temp: Number(t0.instant?.details?.air_temperature),
    precip: Number(t0.next_1_hours?.details?.precipitation_amount ?? 0),
    code: metToWmo(sym), wind: Number(t0.instant?.details?.wind_speed),
    obs_at: new Date().toISOString(),
  };
}

async function fromMet(rs: Region[], skip: Set<string>) {
  const out: Record<string, any> = {};
  const todo = rs.filter((r) => !skip.has(r.code));
  const N = 10;
  for (let i = 0; i < todo.length; i += N) {
    await Promise.all(todo.slice(i, i + N).map(async (r) => {
      try { out[r.code] = await metNow(r.lat, r.lon); } catch { /* 이 지점만 건너뛴다 */ }
    }));
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let body: any = {};
  try { body = await req.json(); } catch { /* 크론은 '{}' 를 보낸다 */ }
  const COLS = "code,name,lat,lon,nx,ny,kind";

  let rs: Region[] = [];
  if (body?.region) {
    /* 🏘 동네 한 곳만 — 3,564곳을 10분마다 다 받을 수는 없다(기상청 개발계정 하루 1만 회). 필요할 때만 받는다. */
    const { data } = await sb.from("weather_regions").select(COLS).eq("code", String(body.region)).limit(1);
    rs = (data || []) as Region[];
    if (!rs.length) return j({ ok: false, reason: "bad_region" }, 400);
  } else {
    /* 정기 수집 = 시도·시군구 + 누군가 즐겨찾기한 동. 동 전체를 넣으면 3,800곳이 되어 150초 제한에 걸린다. */
    const { data: base } = await sb.from("weather_regions").select(COLS).in("kind", ["sido", "city"]).order("sort");
    const { data: favs } = await sb.from("weather_favs").select("region");
    const have = new Set((base || []).map((r: any) => r.code));
    const extra = [...new Set((favs || []).map((f: any) => f.region))].filter((c) => !have.has(c));
    let more: any[] = [];
    if (extra.length) { const { data } = await sb.from("weather_regions").select(COLS).in("code", extra.slice(0, 300)); more = data || []; }
    rs = [...(base || []), ...more] as Region[];
  }
  if (!rs.length) return j({ ok: false, reason: "no_regions" }, 500);

  let src = "kma", obs: Record<string, any> = {};
  if (KMA_KEY) { try { obs = await fromKMA(rs as Region[]); } catch { /* 폴백 */ } }
  // 기상청이 없거나 절반도 못 받으면 MET 로 (부분 실패에 화면이 비지 않게)
  if (Object.keys(obs).length < rs.length / 2) {
    src = KMA_KEY ? "met(kma-fallback)" : "met";
    /* 정기 수집이면 25분 안에 받은 지점은 건너뛴다(MET 호출 절약). 한 곳 요청(동네 방)은 항상 받는다 */
    const skip = new Set<string>();
    if (!body?.region) {
      const { data: fresh } = await sb.from("weather_obs").select("region")
        .in("region", rs.map((r) => r.code)).gt("updated_at", new Date(Date.now() - 25 * 60e3).toISOString());
      (fresh || []).forEach((x: any) => skip.add(x.region));
    }
    try { obs = { ...(await fromMet(rs as Region[], skip)), ...obs }; } catch (e) {
      return j({ ok: false, reason: "fetch_failed", detail: String(e).slice(0, 120) }, 502);
    }
    if (!Object.keys(obs).length && skip.size) return j({ ok: true, source: src, updated: 0, fresh: skip.size });
  }

  const rows = Object.entries(obs).map(([region, v]: [string, any]) => ({
    region, temp: Number.isFinite(v.temp) ? v.temp : null,
    precip: Number.isFinite(v.precip) ? v.precip : null,
    code: v.code ?? null, wind: Number.isFinite(v.wind) ? v.wind : null,
    obs_at: v.obs_at, updated_at: new Date().toISOString(),
  }));
  if (!rows.length) return j({ ok: false, reason: "empty" }, 502);
  const { error } = await sb.from("weather_obs").upsert(rows, { onConflict: "region" });
  if (error) return j({ ok: false, reason: "db", detail: error.message }, 500);
  return j({ ok: true, source: src, updated: rows.length });
});
