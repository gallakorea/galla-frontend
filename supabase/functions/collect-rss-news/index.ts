// 뉴스 수집 다변화 — 네이버 API 단일 의존 탈피. 한국 언론사 RSS 병렬 수집.
// RSS는 키/쿼터 없고 잘 안 막히며 원본 기사 URL을 직접 준다. 네이버가 막혀도 계속 유입.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const FEEDS: [string, string][] = [
  ["연합뉴스", "https://www.yna.co.kr/rss/news.xml"],
  ["연합뉴스", "https://www.yna.co.kr/rss/politics.xml"],
  ["연합뉴스", "https://www.yna.co.kr/rss/economy.xml"],
  ["연합뉴스", "https://www.yna.co.kr/rss/international.xml"],
  ["경향신문", "https://www.khan.co.kr/rss/rssdata/total_news.xml"],
  ["한겨레", "https://www.hani.co.kr/rss/"],
  ["머니투데이", "https://rss.mt.co.kr/mt_news.xml"],
  ["전자신문", "https://rss.etnews.com/Section901.xml"],
  ["오마이뉴스", "http://rss.ohmynews.com/rss/ohmynews.xml"],
  ["SBS", "https://news.sbs.co.kr/news/headlineRssFeed.do?plink=RSSREADER"],
  ["국민일보", "https://www.kmib.co.kr/rss/data/kmibRssAll.xml"],
];

const UA = "Mozilla/5.0 (compatible; GallaBot/1.0; +https://galla-frontend.pages.dev)";
const MAX_PER_FEED = 40;

function unwrap(s: string): string {
  return (s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ").trim();
}
const pick = (block: string, tag: string): string => {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1] : "";
};
function pickImg(block: string): string | null {
  let m = block.match(/<(?:media:thumbnail|media:content|enclosure)[^>]*\burl="([^"]+)"/i);
  if (m) return m[1];
  m = block.match(/<img[^>]*\bsrc="([^"]+)"/i);
  return m ? m[1] : null;
}

async function parseFeed(name: string, url: string) {
  const out: any[] = [];
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 12000);
    const res = await fetch(url, { redirect: "follow", signal: ctl.signal, headers: { "User-Agent": UA, "Accept": "application/rss+xml,application/xml,text/xml,*/*" } });
    clearTimeout(t);
    if (!res.ok) return out;
    const xml = await res.text();
    const items = xml.split(/<item[\s>]/i).slice(1, MAX_PER_FEED + 1);
    for (const raw of items) {
      const block = raw.slice(0, raw.search(/<\/item>/i) >= 0 ? raw.search(/<\/item>/i) : raw.length);
      const link = unwrap(pick(block, "link")) || unwrap(pick(block, "guid"));
      const title = unwrap(pick(block, "title"));
      if (!/^https?:\/\//.test(link) || !title) continue;
      const pub = unwrap(pick(block, "pubDate"));
      const d = pub ? new Date(pub) : null;
      out.push({
        source: "rss",
        press_name: name,
        url: link,
        title: title.slice(0, 300),
        description: unwrap(pick(block, "description")).slice(0, 500) || null,
        thumbnail_url: pickImg(block),
        published_at: d && !isNaN(d.getTime()) ? d.toISOString() : new Date().toISOString(),
        processed: false,
      });
    }
  } catch (_e) { /* 피드 하나 실패해도 나머지는 계속 */ }
  return out;
}

Deno.serve(async (req) => {
  const started = Date.now();
  const all = (await Promise.all(FEEDS.map(([n, u]) => parseFeed(n, u)))).flat();

  // url 기준 중복 제거(요청 내부)
  const seen = new Set<string>();
  const rows = all.filter((r) => (seen.has(r.url) ? false : (seen.add(r.url), true)));

  let inserted = 0;
  // DB 중복은 url unique 인덱스로 무시하고 삽입
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const { error, count } = await supa
      .from("news_articles_raw")
      .upsert(chunk, { onConflict: "url", ignoreDuplicates: true, count: "exact" });
    if (!error) inserted += count ?? 0;
  }

  return new Response(JSON.stringify({
    ok: true, feeds: FEEDS.length, fetched: rows.length, inserted, ms: Date.now() - started,
  }), { headers: { "Content-Type": "application/json" } });
});
