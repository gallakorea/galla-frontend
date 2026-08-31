/* weather-sync — 17개 시·도 '지금 날씨'를 받아 weather_obs 에 캐시한다.
   ⚠️ 브라우저에서 외부 날씨 API 를 직접 부르지 않는다 — CSP connect-src 가 'self' 라 막히고,
      막히지 않더라도 방문자 수만큼 외부 호출이 나간다. 서버가 10분에 한 번만 받아 캐시한다.

   출처 우선순위
     1) 기상청 초단기실황(KMA) — KMA_SERVICE_KEY 가 있을 때.
        PTY(강수형태)가 '지금 실제로 비/눈이 오는지'를 직접 준다. 이 기능의 재미("기상청은
        안 온다는데 우리 동네는 쏟아짐")가 성립하려면 비교 대상이 기상청이어야 한다.
     2) Open-Meteo — 키 없이 동작하는 폴백. 모델 예측값이라 결이 다르지만 없는 것보단 낫다. */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.4";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const KMA_KEY = Deno.env.get("KMA_SERVICE_KEY") || "";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" };
const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

type Region = { code: string; name: string; lat: number; lon: number };

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
    const { nx, ny } = toGrid(r.lat, r.lon);
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

async function fromOpenMeteo(rs: Region[]) {
  /* 한 요청에 좌표를 여러 개 넣을 수 있다(실측 229개 OK). 지점이 244곳(시도 17 + 시군구 227)이라
     URL 길이·타임아웃 여유를 두고 100개씩 끊는다 — 한 덩이가 실패해도 나머지는 살아남는다. */
  const out: Record<string, any> = {};
  const CH = 100;
  for (let i = 0; i < rs.length; i += CH) {
    const part = rs.slice(i, i + CH);
    const u = "https://api.open-meteo.com/v1/forecast"
      + `?latitude=${part.map((r) => r.lat).join(",")}&longitude=${part.map((r) => r.lon).join(",")}`
      + "&current=temperature_2m,precipitation,weather_code,wind_speed_10m&timezone=Asia%2FSeoul";
    try {
      const res = await fetch(u, { signal: AbortSignal.timeout(20000) });
      const arr = await res.json();
      const list = Array.isArray(arr) ? arr : [arr];
      list.forEach((x: any, k: number) => {
        const c = x?.current; if (!c || !part[k]) return;
        out[part[k].code] = {
          temp: c.temperature_2m, precip: c.precipitation,
          code: c.weather_code, wind: c.wind_speed_10m,
          obs_at: new Date().toISOString(),
        };
      });
    } catch { /* 이 덩이만 건너뛴다 */ }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const { data: rs } = await sb.from("weather_regions").select("code,name,lat,lon").order("sort");
  if (!rs?.length) return j({ ok: false, reason: "no_regions" }, 500);

  let src = "kma", obs: Record<string, any> = {};
  if (KMA_KEY) { try { obs = await fromKMA(rs as Region[]); } catch { /* 폴백 */ } }
  // 기상청이 없거나 절반도 못 받으면 Open-Meteo 로 (부분 실패에 화면이 비지 않게)
  if (Object.keys(obs).length < rs.length / 2) {
    src = KMA_KEY ? "openmeteo(kma-fallback)" : "openmeteo";
    try { obs = { ...(await fromOpenMeteo(rs as Region[])), ...obs }; } catch (e) {
      return j({ ok: false, reason: "fetch_failed", detail: String(e).slice(0, 120) }, 502);
    }
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
