// 다른 유명 페이지들의 실시간 검색어 수집
//  - google: 구글 트렌드 realtime RSS (KR) — 키워드 + 대략 검색량
//  - signal: signal.bz 집계(네이트·줌 등 포털 실시간 검색어) top10
// 소스별로 전체 삭제 후 최신 스냅샷을 넣는다. 서비스롤로 실행(RLS 우회).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const decode = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&amp;/g, "&").trim();

// 구글 트렌드 approx_traffic("20,000+", "100+") → 한글 축약("2만+")
function krTraffic(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.replace(/[,\s]/g, "").match(/^(\d+)(\+?)/);
  if (!m) return raw;
  const n = parseInt(m[1], 10), plus = m[2] || "";
  if (n >= 100000000) return (n / 100000000).toFixed(0) + "억" + plus;
  if (n >= 10000) return (n / 10000).toFixed(0) + "만" + plus;
  if (n >= 1000) return (n / 1000).toFixed(0) + "천" + plus;
  return n + plus;
}

async function fetchGoogle(): Promise<{ rank: number; keyword: string; traffic: string | null }[]> {
  const res = await fetch("https://trends.google.com/trending/rss?geo=KR", {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; GallaBot/1.0)" },
  });
  if (!res.ok) throw new Error("google " + res.status);
  const xml = await res.text();
  const items = xml.split(/<item>/).slice(1);
  const out: { rank: number; keyword: string; traffic: string | null }[] = [];
  items.forEach((chunk, i) => {
    const t = chunk.match(/<title>([\s\S]*?)<\/title>/);
    const traf = chunk.match(/<ht:approx_traffic>([\s\S]*?)<\/ht:approx_traffic>/);
    const kw = t ? decode(t[1]) : "";
    if (kw && i < 20) out.push({ rank: out.length + 1, keyword: kw, traffic: krTraffic(traf ? traf[1] : null) });
  });
  return out.slice(0, 10);
}

async function fetchSignal(): Promise<{ rank: number; keyword: string; traffic: string | null }[]> {
  const res = await fetch("https://api.signal.bz/news/realtime", {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; GallaBot/1.0)", "Accept": "application/json" },
  });
  if (!res.ok) throw new Error("signal " + res.status);
  const j = await res.json();
  const list = (j?.top10 || []) as { rank: number; keyword: string }[];
  return list.filter((x) => x?.keyword).slice(0, 10)
    .map((x, i) => ({ rank: x.rank ?? i + 1, keyword: String(x.keyword).trim(), traffic: null }));
}

async function replace(source: string, rows: { rank: number; keyword: string; traffic: string | null }[]) {
  if (!rows.length) return 0;
  await supa.from("portal_search_trends").delete().eq("source", source);
  const { error } = await supa.from("portal_search_trends")
    .insert(rows.map((r) => ({ source, rank: r.rank, keyword: r.keyword, traffic: r.traffic })));
  if (error) throw error;
  return rows.length;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const result: Record<string, unknown> = {};
  // 한 소스가 실패해도 다른 소스는 살린다
  await Promise.all([
    fetchGoogle().then((r) => replace("google", r)).then((n) => (result.google = n)).catch((e) => (result.google = "err:" + e.message)),
    fetchSignal().then((r) => replace("signal", r)).then((n) => (result.signal = n)).catch((e) => (result.signal = "err:" + e.message)),
  ]);
  return new Response(JSON.stringify({ ok: true, ...result }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
