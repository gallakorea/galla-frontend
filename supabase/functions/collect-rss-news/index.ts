// 뉴스 수집 다변화 — 네이버 API 단일 의존 탈피. 한국 언론사 RSS 병렬 수집.
// RSS는 키/쿼터 없고 잘 안 막히며 원본 기사 URL을 직접 준다. 네이버가 막혀도 계속 유입.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const FEEDS: [string, string][] = [
  // 통신/종합
  ["연합뉴스", "https://www.yna.co.kr/rss/news.xml"],
  ["연합뉴스", "https://www.yna.co.kr/rss/politics.xml"],
  ["연합뉴스", "https://www.yna.co.kr/rss/economy.xml"],
  ["연합뉴스", "https://www.yna.co.kr/rss/international.xml"],
  ["뉴시스", "https://www.newsis.com/RSS/politics.xml"],
  ["뉴시스", "https://www.newsis.com/RSS/economy.xml"],
  ["뉴시스", "https://www.newsis.com/RSS/society.xml"],
  ["연합뉴스TV", "https://www.yonhapnewstv.co.kr/browse/feed/"],
  // 조선일보 (전체 + 카테고리)
  ["조선일보", "https://www.chosun.com/arc/outboundfeeds/rss/?outputType=xml"],
  ["조선일보", "https://www.chosun.com/arc/outboundfeeds/rss/category/politics/?outputType=xml"],
  ["조선일보", "https://www.chosun.com/arc/outboundfeeds/rss/category/economy/?outputType=xml"],
  ["조선일보", "https://www.chosun.com/arc/outboundfeeds/rss/category/national/?outputType=xml"],
  ["조선일보", "https://www.chosun.com/arc/outboundfeeds/rss/category/international/?outputType=xml"],
  ["조선일보", "https://www.chosun.com/arc/outboundfeeds/rss/category/culture-life/?outputType=xml"],
  ["조선일보", "https://www.chosun.com/arc/outboundfeeds/rss/category/sports/?outputType=xml"],
  // 동아일보 (전체 + 카테고리)
  ["동아일보", "https://rss.donga.com/total.xml"],
  ["동아일보", "https://rss.donga.com/politics.xml"],
  ["동아일보", "https://rss.donga.com/national.xml"],
  ["동아일보", "https://rss.donga.com/economy.xml"],
  ["동아일보", "https://rss.donga.com/international.xml"],
  ["동아일보", "https://rss.donga.com/culture.xml"],
  ["동아일보", "https://rss.donga.com/sports.xml"],
  // 종합일간
  ["경향신문", "https://www.khan.co.kr/rss/rssdata/total_news.xml"],
  ["경향신문", "https://www.khan.co.kr/rss/rssdata/politic_news.xml"],
  ["한겨레", "https://www.hani.co.kr/rss/"],
  ["한겨레", "https://www.hani.co.kr/rss/politics/"],
  ["국민일보", "https://www.kmib.co.kr/rss/data/kmibRssAll.xml"],
  ["서울신문", "https://www.seoul.co.kr/xml/rss/rss_politics.xml"],
  ["세계일보", "https://www.segye.com/Articles/RSSList/segye_recent.xml"],
  ["오마이뉴스", "http://rss.ohmynews.com/rss/ohmynews.xml"],
  // 경제
  ["매일경제", "https://www.mk.co.kr/rss/30000001/"],
  ["한국경제", "https://www.hankyung.com/feed/all-news"],
  ["머니투데이", "https://rss.mt.co.kr/mt_news.xml"],
  // 방송
  ["SBS", "https://news.sbs.co.kr/news/headlineRssFeed.do?plink=RSSREADER"],
  // IT
  ["전자신문", "https://rss.etnews.com/Section901.xml"],
  ["ZDNet", "https://feeds.feedburner.com/zdkorea"],
  ["아이뉴스24", "https://www.inews24.com/rss/news_all.xml"],
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
// RSS <link>URL</link> (+CDATA), Atom <link href="URL"/>, guid URL 모두 대응
const decEnt = (s: string) => s.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").trim();
function pickLink(block: string): string {
  let m = block.match(/<link>([\s\S]*?)<\/link>/i);
  if (m) { const u = decEnt(m[1]); if (/^https?:/.test(u)) return u; }
  const atom = [...block.matchAll(/<link\b[^>]*\bhref="([^"]+)"[^>]*\/?>/gi)];
  for (const l of atom) { if (/^https?:/.test(l[1])) return l[1]; }
  m = block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i);
  if (m) { const u = decEnt(m[1]); if (/^https?:/.test(u)) return u; }
  return "";
}
function pickImg(block: string): string | null {
  let m = block.match(/<(?:media:thumbnail|media:content|enclosure)[^>]*\burl="([^"]+)"/i);
  if (m) return m[1];
  m = block.match(/<img[^>]*\bsrc="([^"]+)"/i);
  return m ? m[1] : null;
}

const diag: Record<string, string> = {};
async function parseFeed(name: string, url: string) {
  const out: any[] = [];
  const key = `${name}:${url.slice(-24)}`;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 12000);
    const res = await fetch(url, { redirect: "follow", signal: ctl.signal, headers: { "User-Agent": UA, "Accept": "application/rss+xml,application/xml,text/xml,*/*" } });
    clearTimeout(t);
    if (!res.ok) { diag[key] = `http ${res.status}`; return out; }
    const buf = await res.arrayBuffer();
    // 한국 언론 RSS는 EUC-KR 인 경우가 있어 charset 감지 후 디코드
    let xml = new TextDecoder("utf-8").decode(buf);
    const cs = xml.match(/encoding="([^"]+)"/i)?.[1]?.toLowerCase();
    if (cs && (cs.includes("euc-kr") || cs.includes("ks_c") || cs.includes("cp949"))) {
      try { xml = new TextDecoder("euc-kr").decode(buf); } catch { /* keep utf8 */ }
    }
    const atomFeed = /<entry[\s>]/i.test(xml) && !/<item[\s>]/i.test(xml);
    const items = xml.split(atomFeed ? /<entry[\s>]/i : /<item[\s>]/i).slice(1, MAX_PER_FEED + 1);
    const closeTag = atomFeed ? /<\/entry>/i : /<\/item>/i;
    for (const raw of items) {
      const end = raw.search(closeTag);
      const block = raw.slice(0, end >= 0 ? end : raw.length);
      const link = pickLink(block);
      const title = unwrap(pick(block, "title"));
      if (!/^https?:\/\//.test(link) || !title) continue;
      const pub = unwrap(pick(block, "pubDate")) || unwrap(pick(block, "published")) || unwrap(pick(block, "updated"));
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
    diag[key] = `${out.length} items`;
  } catch (e) { diag[key] = `err ${String(e).slice(0, 40)}`; }
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
    ok: true, feeds: FEEDS.length, fetched: rows.length, inserted, ms: Date.now() - started, diag,
  }), { headers: { "Content-Type": "application/json" } });
});
