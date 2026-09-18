/* air-sync — 에어코리아(한국환경공단) 미세먼지 실시간 → air_obs 캐시. 사장님 26.9.18 「미세먼지 정보도 얹자 지도랑 다른데도」.
   body {probe:true} 이면 API 두 개(실시간 측정값·측정소 정보)가 우리 키로 열려 있는지만 보고 돌아온다. */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.4";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const KEY = Deno.env.get("DATA_GO_KR_KEY") || "";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" };
const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

async function call(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  const txt = await res.text();
  let d: any = null; try { d = JSON.parse(txt); } catch { /* XML 오류 응답 */ }
  return { status: res.status, d, head: txt.slice(0, 300) };
}
const RT = (n: number) => `https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty?serviceKey=${encodeURIComponent(KEY)}&returnType=json&numOfRows=${n}&pageNo=1&sidoName=${encodeURIComponent("전국")}&ver=1.0`;
const ST = (n: number) => `https://apis.data.go.kr/B552584/MsrstnInfoInqireSvc/getMsrstnList?serviceKey=${encodeURIComponent(KEY)}&returnType=json&numOfRows=${n}&pageNo=1`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let b: any = {}; try { b = await req.json(); } catch { /* */ }
  if (!KEY) return j({ ok: false, reason: "no_key" }, 500);
  if (b?.probe2) {
    /* 기상청 초단기실황(같은 공공데이터포털 키로 열려 있나) + 에어코리아 시군구 평균 */
    const now = new Date(Date.now() + 9 * 3600e3 - 45 * 60e3);
    const p2 = (n: number) => String(n).padStart(2, "0");
    const bd = `${now.getUTCFullYear()}${p2(now.getUTCMonth() + 1)}${p2(now.getUTCDate())}`, bt = `${p2(now.getUTCHours())}00`;
    const kma = await call(`https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst?serviceKey=${encodeURIComponent(KEY)}&numOfRows=10&pageNo=1&dataType=JSON&base_date=${bd}&base_time=${bt}&nx=60&ny=127`);
    const sgg = await call(`https://apis.data.go.kr/B552584/ArpltnStatsSvc/getCtprvnMesureSidoLIst?serviceKey=${encodeURIComponent(KEY)}&returnType=json&numOfRows=5&pageNo=1&sidoName=${encodeURIComponent("서울")}&searchCondition=HOUR`);
    return j({ kma: { status: kma.status, code: kma.d?.response?.header?.resultCode, items: kma.d?.response?.body?.items?.item?.slice?.(0, 4), head: kma.d ? undefined : kma.head },
               sgg: { status: sgg.status, total: sgg.d?.response?.body?.totalCount, sample: sgg.d?.response?.body?.items?.[0], head: sgg.d ? undefined : sgg.head } });
  }
  if (b?.probe) {
    const [rt, st] = await Promise.all([call(RT(3)), call(ST(3))]);
    return j({ ok: true,
      realtime: { status: rt.status, total: rt.d?.response?.body?.totalCount ?? null, sample: rt.d?.response?.body?.items?.[0] ?? null, head: rt.d ? undefined : rt.head },
      stations: { status: st.status, total: st.d?.response?.body?.totalCount ?? null, sample: st.d?.response?.body?.items?.[0] ?? null, head: st.d ? undefined : st.head } });
  }
  /* 정기 수집 — 전국 측정소 실시간을 한 번에(약 670곳). 에어코리아는 시간 단위라 크론은 30분마다면 충분 */
  /* ⚠️ '전국' 1000건 한 번에는 에어코리아가 504(SERVICETIMEOUT) — 시도별 17번으로 나눈다(4개씩 동시) */
  const SIDO = ["서울","부산","대구","인천","광주","대전","울산","경기","강원","충북","충남","전북","전남","경북","경남","제주","세종"];
  const RTS = (sido: string) => `https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty?serviceKey=${encodeURIComponent(KEY)}&returnType=json&numOfRows=200&pageNo=1&sidoName=${encodeURIComponent(sido)}&ver=1.0`;
  const items: any[] = []; const fail: string[] = [];
  /* 에어코리아는 동시 요청에 약하다(4개 동시 → 7개 시도 504). 2개씩, 실패하면 1.5초 쉬고 3번까지 */
  for (let i = 0; i < SIDO.length; i += 2) {
    await Promise.all(SIDO.slice(i, i + 2).map(async (sd) => {
      for (let t = 0; t < 3; t++) {
        try { const r = await call(RTS(sd)); const it = r.d?.response?.body?.items; if (Array.isArray(it) && it.length) { items.push(...it); return; } } catch { /* 재시도 */ }
        await new Promise((z) => setTimeout(z, 1500));
      }
      fail.push(sd);
    }));
  }
  if (!items.length) return j({ ok: false, reason: "empty", fail }, 502);
  const num = (v: any) => { const n = Number(v); return Number.isFinite(n) && v !== "-" && v !== "" && v != null ? n : null; };
  const rows = items.filter((x) => x.stationName && x.sidoName).map((x) => ({
    station: String(x.stationName), sido: String(x.sidoName),
    pm10: num(x.pm10Value), pm25: num(x.pm25Value), khai: num(x.khaiValue),
    data_time: x.dataTime || null, updated_at: new Date().toISOString(),
  }));
  const { error } = await sb.from("air_station_obs").upsert(rows, { onConflict: "sido,station" });
  if (error) return j({ ok: false, reason: "db", detail: error.message }, 500);
  /* 새로 생긴 측정소만 시군구에 연결(air_station_region) — 이미 연결된 곳은 건드리지 않는다 */
  let mapped: any = null;
  try { const { data } = await sb.rpc("air_refresh"); mapped = data; } catch { /* 다음 회차에 */ }
  return j({ ok: true, updated: rows.length, mapped, data_time: rows[0]?.data_time, fail });
});
