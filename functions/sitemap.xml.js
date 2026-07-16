/**
 * GALLA 동적 사이트맵 (Cloudflare Pages Function → /sitemap.xml)
 * 정적 페이지 + 이슈·광장·예측 전체 + 최신 뉴스를 DB에서 뽑아 XML 생성.
 * 엣지 캐시(6h)로 DB 부하·응답속도 최적화. 구글/네이버/다음 공용.
 */
const SB = "https://bidqauputnhkqepvdzrr.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpZHFhdXB1dG5oa3FlcHZkenJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNzg1NDIsImV4cCI6MjA4MDg1NDU0Mn0.D-UGDPuBaNO8v-ror5-SWgUNLRvkOO-yrf2wDVZtyEM";
const HOST = "https://galla.im";

async function sb(query) {
  try {
    const r = await fetch(`${SB}/rest/v1/${query}`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
      cf: { cacheTtl: 3600, cacheEverything: true },
    });
    return r.ok ? await r.json() : [];
  } catch { return []; }
}
const iso = (d) => { try { return new Date(d).toISOString(); } catch { return new Date().toISOString(); } };
const u = (loc, lastmod, changefreq, priority) =>
  `<url><loc>${loc}</loc>` +
  (lastmod ? `<lastmod>${lastmod}</lastmod>` : "") +
  (changefreq ? `<changefreq>${changefreq}</changefreq>` : "") +
  (priority ? `<priority>${priority}</priority>` : "") +
  `</url>`;

export async function onRequest() {
  const now = iso(Date.now());
  const parts = [];

  // 정적 랜딩
  parts.push(u(`${HOST}/`, now, "hourly", "1.0"));
  parts.push(u(`${HOST}/galla-predict.html`, now, "hourly", "0.9"));
  parts.push(u(`${HOST}/search.html`, now, "hourly", "0.9"));
  parts.push(u(`${HOST}/plaza.html`, now, "hourly", "0.8"));

  const [issues, plaza, markets, news] = await Promise.all([
    sb("issues?select=id,created_at&order=created_at.desc&limit=2000"),
    sb("plaza_posts?select=id,created_at&order=created_at.desc&limit=2000"),
    sb("markets?select=id,created_at&order=created_at.desc&limit=2000"),
    sb("galla_news?select=id,published_at&status=eq.published&order=published_at.desc&limit=5000"),
  ]);

  // clean URL(= 실제 200 페이지, 미들웨어가 SEO 메타 주입). .html은 308 리다이렉트되므로 clean 사용.
  (issues || []).forEach(r => parts.push(u(`${HOST}/issue?id=${r.id}`, iso(r.created_at), "daily", "0.8")));
  (plaza || []).forEach(r => parts.push(u(`${HOST}/plaza_detail?id=${r.id}`, iso(r.created_at), "weekly", "0.6")));
  (markets || []).forEach(r => parts.push(u(`${HOST}/predict-market?id=${r.id}`, iso(r.created_at), "daily", "0.7")));
  (news || []).forEach(r => parts.push(u(`${HOST}/news?gn=${r.id}`, iso(r.published_at), "weekly", "0.6")));

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${parts.join("\n")}\n</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=21600",  // 6h
    },
  });
}
