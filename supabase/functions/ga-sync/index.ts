// ga-sync — GA4 Data API 지표를 당겨 public.ga_metrics 에 캐시 (크론 전용)
// 자격증명(env, 대시보드 Secrets 에만 저장):
//   GA_SA_JSON          : GCP 서비스계정 JSON 전체 (문자열)
//   GA_PROPERTY_ID      : GA4 숫자 Property ID (측정ID G-XXX 아님)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY : 자동 주입
// 크론이 anon Bearer 로 호출(verify_jwt=true 유지). 응답엔 민감 원본을 담지 않음(상태만).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

// base64url
const b64u = (buf: ArrayBuffer | Uint8Array) => {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = ""; for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const pemToPk8 = (pem: string) => {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const raw = atob(body); const u = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) u[i] = raw.charCodeAt(i);
  return u.buffer;
};

// 서비스계정 → OAuth access_token (scope: analytics.readonly)
async function getToken(sa: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64u(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claim = b64u(new TextEncoder().encode(JSON.stringify({
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/analytics.readonly",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  })));
  const key = await crypto.subtle.importKey("pkcs8", pemToPk8(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claim}`));
  const jwt = `${header}.${claim}.${b64u(sig)}`;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("token: " + JSON.stringify(j));
  return j.access_token;
}

const gaCall = async (token: string, pid: string, method: string, body: unknown) => {
  const r = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${pid}:${method}`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${method} ${r.status}: ${await r.text()}`);
  return r.json();
};

Deno.serve(async (req) => {
  const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
  if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const saRaw = Deno.env.get("GA_SA_JSON");
    const pid = Deno.env.get("GA_PROPERTY_ID");
    if (!saRaw || !pid) return json({ ok: false, configured: false, reason: "missing_ga_secrets" });

    const sa = JSON.parse(saRaw);
    const token = await getToken(sa);

    // 실시간 활성 사용자(총합 + 국가별 상위)
    const rt = await gaCall(token, pid, "runRealtimeReport", {
      metrics: [{ name: "activeUsers" }], dimensions: [{ name: "country" }], limit: 8,
    });
    const rtRows = (rt.rows || []).map((r: any) => ({ country: r.dimensionValues?.[0]?.value, users: +(r.metricValues?.[0]?.value || 0) }));
    const rtTotal = rtRows.reduce((s: number, r: any) => s + r.users, 0);

    // 최근 28일: 일자별 + 총합 지표
    const rep = await gaCall(token, pid, "runReport", {
      dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "screenPageViews" }, { name: "newUsers" }],
      orderBys: [{ dimension: { dimensionName: "date" } }],
      limit: 40,
    });
    const days = (rep.rows || []).map((r: any) => ({
      d: r.dimensionValues?.[0]?.value,
      users: +(r.metricValues?.[0]?.value || 0), sessions: +(r.metricValues?.[1]?.value || 0),
      views: +(r.metricValues?.[2]?.value || 0), newUsers: +(r.metricValues?.[3]?.value || 0),
    }));
    const tot = days.reduce((a: any, x: any) => ({
      users: a.users + x.users, sessions: a.sessions + x.sessions, views: a.views + x.views, newUsers: a.newUsers + x.newUsers,
    }), { users: 0, sessions: 0, views: 0, newUsers: 0 });

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const now = new Date().toISOString();
    const { error } = await sb.from("ga_metrics").upsert([
      { kind: "realtime", payload: { total: rtTotal, byCountry: rtRows }, captured_at: now },
      { kind: "report28d", payload: { days, totals: tot }, captured_at: now },
    ], { onConflict: "kind" });
    if (error) throw error;

    return json({ ok: true, configured: true, realtime: rtTotal, days: days.length });
  } catch (e) {
    return json({ ok: false, configured: true, reason: String(e).slice(0, 300) }, 500);
  }
});
