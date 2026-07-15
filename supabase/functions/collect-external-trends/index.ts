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

// 네이버 '많이 본 뉴스'(popularDay) — 언론사별로 묶여 있어 언론사당 1건만 뽑아 다양성 확보.
// 페이지는 EUC-KR 인코딩이라 디코딩 필수. 결과는 기사 제목 + 원문 링크.
type Row = { rank: number; keyword: string; traffic: string | null; link?: string | null };
async function fetchNaver(): Promise<Row[]> {
  const res = await fetch("https://news.naver.com/main/ranking/popularDay.naver", {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error("naver " + res.status);
  const html = new TextDecoder("euc-kr").decode(new Uint8Array(await res.arrayBuffer()));
  const re = /<a href="(https:\/\/n\.news\.naver\.com\/[^"]+)"[^>]*class="list_title[^"]*"[^>]*>\s*([^<]{3,90})/g;
  const seen = new Set<string>(); const out: Row[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const url = m[1], title = decode(m[2]);
    const press = (url.match(/article\/(\d+)\//) || [])[1] || url;
    if (!title || seen.has(press)) continue;   // 언론사당 1건
    seen.add(press);
    out.push({ rank: out.length + 1, keyword: title, traffic: null, link: url });
    if (out.length >= 12) break;
  }
  return out;
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

async function replace(source: string, rows: Row[]) {
  if (!rows.length) return 0;
  await supa.from("portal_search_trends").delete().eq("source", source);
  const { error } = await supa.from("portal_search_trends")
    .insert(rows.map((r) => ({ source, rank: r.rank, keyword: r.keyword, traffic: r.traffic, link: r.link ?? null })));
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
    fetchNaver().then((r) => replace("naver", r)).then((n) => (result.naver = n)).catch((e) => (result.naver = "err:" + e.message)),
  ]);
  return new Response(JSON.stringify({ ok: true, ...result }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
