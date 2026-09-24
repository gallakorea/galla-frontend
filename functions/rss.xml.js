/**
 * GALLA RSS 2.0 피드 (Cloudflare Pages Function → /rss.xml)
 * 네이버는 RSS로 새 글을 가장 빠르게 수집한다(사이트맵=전체 목록, RSS=새 글 알림).
 * 오리지널(이슈·광장·예측·숏판) + 양질 뉴스(출처 2곳+)의 최신을 병합해 최근 50건만 싣는다.
 * ⚠️ 뉴스 대량생산이 품질을 깎는 문제는 RSS엔 없다(항상 최신 50건 상한). 그래도 오리지널 우선.
 * 엣지 캐시 30분. sitemap.xml.js 와 같은 anon REST 패턴.
 */
const SB = "https://bidqauputnhkqepvdzrr.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpZHFhdXB1dG5oa3FlcHZkenJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNzg1NDIsImV4cCI6MjA4MDg1NDU0Mn0.D-UGDPuBaNO8v-ror5-SWgUNLRvkOO-yrf2wDVZtyEM";
const HOST = "https://galla.im";

async function sb(query) {
  try {
    const r = await fetch(`${SB}/rest/v1/${query}`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
      cf: { cacheTtl: 900, cacheEverything: true },
    });
    return r.ok ? await r.json() : [];
  } catch { return []; }
}

const esc = (s) => String(s || "").replace(/[<>&'"]/g, (c) =>
  ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));
const plain = (s) => String(s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const clip = (s, n) => { const t = plain(s); return t.length > n ? t.slice(0, n) + "…" : t; };
const rfc822 = (d) => { try { return new Date(d).toUTCString(); } catch { return new Date().toUTCString(); } };
const ts = (d) => { try { return new Date(d).getTime() || 0; } catch { return 0; } };

export async function onRequest() {
  const [issues, news, plaza, markets, posts] = await Promise.all([
    sb("issues?status=eq.normal&select=id,title,one_line,created_at&order=created_at.desc&limit=25"),
    sb("galla_news?status=eq.published&source_count=gte.2&select=id,title,summary,published_at&order=published_at.desc&limit=25"),
    sb("plaza_posts?select=id,title,body,created_at&order=created_at.desc&limit=25"),
    sb("markets?select=id,question,description,created_at&order=created_at.desc&limit=25"),
    sb("posts?is_published=eq.true&select=id,title,caption,created_at&order=created_at.desc&limit=25"),
  ]);

  const items = [];
  const push = (title, link, desc, date, cat) =>
    title && items.push({ title, link, desc: clip(desc || title, 200), date, cat, t: ts(date) });

  (issues || []).forEach(r => push(r.title, `${HOST}/issue?id=${r.id}`, r.one_line || r.title, r.created_at, "이슈"));
  (news || []).forEach(r => push(r.title, `${HOST}/news?gn=${r.id}`, r.summary || r.title, r.published_at, "갈라뉴스"));
  (plaza || []).forEach(r => push(r.title, `${HOST}/plaza_detail?id=${r.id}`, r.body || r.title, r.created_at, "광장"));
  (markets || []).forEach(r => push(r.question, `${HOST}/predict-market?id=${r.id}`, r.description || r.question, r.created_at, "예측"));
  (posts || []).forEach(r => push(r.title || clip(r.caption, 60), `${HOST}/gallari-post?id=${r.id}`, r.caption || r.title, r.created_at, "숏판"));

  items.sort((a, b) => b.t - a.t);
  const top = items.slice(0, 50);

  const now = rfc822(Date.now());
  const body = top.map(it =>
    `<item>` +
    `<title>${esc(it.title)}</title>` +
    `<link>${esc(it.link)}</link>` +
    `<guid isPermaLink="true">${esc(it.link)}</guid>` +
    `<category>${esc(it.cat)}</category>` +
    `<description>${esc(it.desc)}</description>` +
    `<pubDate>${rfc822(it.date)}</pubDate>` +
    `</item>`
  ).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n<channel>\n` +
    `<title>GALLA 갈라 · 내 편이 있는 콘텐츠 세상</title>\n` +
    `<link>${HOST}</link>\n` +
    `<atom:link href="${HOST}/rss.xml" rel="self" type="application/rss+xml"/>\n` +
    `<description>갈라의 최신 이슈·갈라뉴스·광장·예측·숏판</description>\n` +
    `<language>ko</language>\n` +
    `<lastBuildDate>${now}</lastBuildDate>\n` +
    `${body}\n</channel>\n</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=1800",  // 30m
    },
  });
}
