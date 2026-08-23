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

  /* 정적 랜딩 — ⚠️ clean URL만 쓴다. CF Pages가 /search.html → /search 로 308하므로
     .html 을 넣으면 사이트맵 전체가 리다이렉트 URL이 되고, 구글은 리다이렉트되는 URL을
     색인 대상에서 뺀다(실측: 정적 4개가 전부 308이었다). */
  parts.push(u(`${HOST}/`, now, "hourly", "1.0"));
  parts.push(u(`${HOST}/galla-predict`, now, "hourly", "0.9"));
  parts.push(u(`${HOST}/search`, now, "hourly", "0.9"));
  parts.push(u(`${HOST}/plaza`, now, "hourly", "0.8"));
  parts.push(u(`${HOST}/gallari`, now, "hourly", "0.8"));
  parts.push(u(`${HOST}/match`, now, "weekly", "0.8")); // 갈라 궁합 — 비로그인 유입 랜딩

  const [issues, plaza, markets, news, posts] = await Promise.all([
    sb("issues?select=id,created_at&order=created_at.desc&limit=2000"),
    sb("plaza_posts?select=id,created_at&order=created_at.desc&limit=2000"),
    sb("markets?select=id,created_at&order=created_at.desc&limit=2000"),
    sb("galla_news?select=id,published_at&status=eq.published&order=published_at.desc&limit=5000"),
    sb("posts?select=id,created_at&is_published=eq.true&order=created_at.desc&limit=2000"),
  ]);

  // clean URL(= 실제 200 페이지, 미들웨어가 SEO 메타 주입). .html은 308 리다이렉트되므로 clean 사용.
  (issues || []).forEach(r => parts.push(u(`${HOST}/issue?id=${r.id}`, iso(r.created_at), "daily", "0.8")));
  (plaza || []).forEach(r => parts.push(u(`${HOST}/plaza_detail?id=${r.id}`, iso(r.created_at), "weekly", "0.6")));
  (markets || []).forEach(r => parts.push(u(`${HOST}/predict-market?id=${r.id}`, iso(r.created_at), "daily", "0.7")));
  // 갈라뉴스는 AI가 여러 보도를 종합해 새로 쓴 오리지널 → 이슈와 같은 급으로 취급한다
  (news || []).forEach(r => parts.push(u(`${HOST}/news?gn=${r.id}`, iso(r.published_at), "weekly", "0.7")));
  (posts || []).forEach(r => parts.push(u(`${HOST}/gallari-post?id=${r.id}`, iso(r.created_at), "weekly", "0.6")));

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${parts.join("\n")}\n</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=21600",  // 6h
    },
  });
}
