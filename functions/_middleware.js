/**
 * GALLA SEO 엣지 미들웨어 (Cloudflare Pages Functions)
 * 콘텐츠 상세 페이지(이슈·뉴스·광장·예측)는 본문이 JS로 클라이언트 렌더돼
 * 검색로봇(특히 네이버 Yeti·다음 Daumoa, JS 미실행)이 빈 껍데기만 봄.
 * → 엣지에서 실제 제목/요약/OG/canonical/JSON-LD + 본문 스냅샷을 <head>/<body>에 주입.
 *   사람은 그대로 JS 앱이 하이드레이트하고, 로봇은 실제 콘텐츠를 읽는다.
 *
 * 안전 원칙: 대상 경로 + id 파라미터가 있을 때만 개입. 그 외/에러는 즉시 통과(사이트 절대 안 깨짐).
 */
const SB = "https://bidqauputnhkqepvdzrr.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpZHFhdXB1dG5oa3FlcHZkenJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNzg1NDIsImV4cCI6MjA4MDg1NDU0Mn0.D-UGDPuBaNO8v-ror5-SWgUNLRvkOO-yrf2wDVZtyEM";
const HOST = "https://galla.im";
const DEF_IMG = `${HOST}/assets/og/og-default.png`;

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clip = (s, n) => { s = String(s ?? "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
// 광장 본문 마커([IMAGE]·마크다운) 제거해 순수 텍스트만
const plain = (s) => String(s ?? "")
  .replace(/^\[(IMAGE|VIDEO|EMBED)\].*$/gim, " ")
  .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
  .replace(/[#>*_~`\-]/g, " ").replace(/\s+/g, " ").trim();

async function sbOne(query) {
  try {
    const r = await fetch(`${SB}/rest/v1/${query}`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
      cf: { cacheTtl: 300, cacheEverything: true },
    });
    if (!r.ok) return null;
    const a = await r.json();
    return Array.isArray(a) && a.length ? a[0] : null;
  } catch { return null; }
}

// 경로별 콘텐츠 → SEO 메타 객체
async function resolveSeo(path, params) {
  if (path === "/issue.html" && params.get("id")) {
    const row = await sbOne(`issues?id=eq.${encodeURIComponent(params.get("id"))}&select=id,title,one_line,category,created_at,thumbnail_url`);
    if (!row) return null;
    const title = clip(row.title, 60);
    const desc = clip(row.one_line || row.title, 150);
    return {
      title: `${title} · 갈라`, desc,
      canonical: `${HOST}/issue.html?id=${row.id}`, image: row.thumbnail_url || DEF_IMG,
      ogType: "article", kicker: row.category ? `${row.category} · 여론 대결` : "여론 대결",
      h1: row.title, body: row.one_line || "", date: row.created_at,
      jsonld: articleLd(row.title, desc, row.thumbnail_url || DEF_IMG, `${HOST}/issue.html?id=${row.id}`, row.created_at),
    };
  }
  if (path === "/news.html" && params.get("gn")) {
    const row = await sbOne(`galla_news?id=eq.${encodeURIComponent(params.get("gn"))}&select=id,title,summary,category,hero_image,published_at,source_count`);
    if (!row) return null;
    const title = clip(row.title, 60);
    const desc = clip(row.summary || row.title, 150);
    return {
      title: `${title} · 갈라뉴스`, desc,
      canonical: `${HOST}/news.html?gn=${row.id}`, image: row.hero_image || DEF_IMG,
      ogType: "article", kicker: `${row.category || "뉴스"} · 갈라뉴스`,
      h1: row.title, body: row.summary || "", date: row.published_at,
      jsonld: newsLd(row.title, desc, row.hero_image || DEF_IMG, `${HOST}/news.html?gn=${row.id}`, row.published_at),
    };
  }
  if (path === "/plaza_detail.html" && params.get("id")) {
    const row = await sbOne(`plaza_posts?id=eq.${encodeURIComponent(params.get("id"))}&select=id,title,body,category,created_at,cover_image,thumbnail,nickname`);
    if (!row) return null;
    const title = clip(row.title, 60);
    const desc = clip(plain(row.body) || row.title, 150);
    return {
      title: `${title} · 갈라 광장`, desc,
      canonical: `${HOST}/plaza_detail.html?id=${row.id}`, image: row.cover_image || row.thumbnail || DEF_IMG,
      ogType: "article", kicker: `${row.category || "광장"} · 갈라 광장`,
      h1: row.title, body: plain(row.body), date: row.created_at,
      jsonld: articleLd(row.title, desc, row.cover_image || row.thumbnail || DEF_IMG, `${HOST}/plaza_detail.html?id=${row.id}`, row.created_at),
    };
  }
  if (path === "/predict-market.html" && params.get("id")) {
    const row = await sbOne(`markets?id=eq.${encodeURIComponent(params.get("id"))}&select=id,question,description,category,image_url,created_at`);
    if (!row) return null;
    const title = clip(row.question, 60);
    const desc = clip(row.description || `${row.question} — 갈라예측에서 예/아니오에 GP를 걸고 결과를 맞혀보세요.`, 150);
    return {
      title: `${title} · 갈라예측`, desc,
      canonical: `${HOST}/predict-market.html?id=${row.id}`, image: row.image_url || DEF_IMG,
      ogType: "article", kicker: `${row.category || "예측"} · 갈라예측`,
      h1: row.question, body: row.description || "", date: row.created_at,
      jsonld: articleLd(row.question, desc, row.image_url || DEF_IMG, `${HOST}/predict-market.html?id=${row.id}`, row.created_at),
    };
  }
  return null;
}

function articleLd(title, desc, image, url, date) {
  return JSON.stringify({
    "@context": "https://schema.org", "@type": "Article",
    headline: clip(title, 110), description: desc, image: [image],
    datePublished: safeIso(date), dateModified: safeIso(date),
    mainEntityOfPage: url,
    author: { "@type": "Organization", name: "GALLA 갈라" },
    publisher: { "@type": "Organization", name: "GALLA 갈라", logo: { "@type": "ImageObject", url: `${HOST}/assets/app-icons/icon-512.png` } },
  });
}
function newsLd(title, desc, image, url, date) {
  const o = JSON.parse(articleLd(title, desc, image, url, date));
  o["@type"] = "NewsArticle";
  return JSON.stringify(o);
}
function safeIso(d) { try { return new Date(d).toISOString(); } catch { return new Date().toISOString(); } }

// HTMLRewriter로 <head> 메타 교체 + 본문 스냅샷 주입
function rewrite(res, seo) {
  const metaHtml =
    `<meta name="description" content="${esc(seo.desc)}">` +
    `<meta name="robots" content="index,follow,max-image-preview:large">` +
    `<link rel="canonical" href="${esc(seo.canonical)}">` +
    `<meta property="og:type" content="${seo.ogType}">` +
    `<meta property="og:site_name" content="GALLA 갈라">` +
    `<meta property="og:title" content="${esc(seo.title)}">` +
    `<meta property="og:description" content="${esc(seo.desc)}">` +
    `<meta property="og:image" content="${esc(seo.image)}">` +
    `<meta property="og:url" content="${esc(seo.canonical)}">` +
    `<meta name="twitter:card" content="summary_large_image">` +
    `<meta name="twitter:title" content="${esc(seo.title)}">` +
    `<meta name="twitter:description" content="${esc(seo.desc)}">` +
    `<meta name="twitter:image" content="${esc(seo.image)}">` +
    `<script type="application/ld+json">${seo.jsonld}</script>`;

  // 크롤러가 읽을 본문 스냅샷 — 화면엔 숨김(JS 앱이 실제 UI 렌더). aria-hidden으로 접근성 중복 방지.
  const snapshot =
    `<div id="seo-snapshot" aria-hidden="true" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">` +
    `<p>${esc(seo.kicker)}</p><h1>${esc(seo.h1)}</h1>` +
    (seo.body ? `<p>${esc(clip(seo.body, 500))}</p>` : "") +
    `</div>`;

  return new HTMLRewriter()
    .on("title", { element(el) { el.setInnerContent(seo.title); } })
    .on("head", { element(el) { el.append(metaHtml, { html: true }); } })
    .on("body", { element(el) { el.prepend(snapshot, { html: true }); } })
    .transform(res);
}

const TARGETS = new Set(["/issue.html", "/news.html", "/plaza_detail.html", "/predict-market.html"]);

export async function onRequest(context) {
  try {
    const { request, next } = context;
    if (request.method !== "GET") return next();
    const url = new URL(request.url);
    if (!TARGETS.has(url.pathname)) return next();
    // id/gn 파라미터 없으면 개입 안 함
    if (!url.searchParams.get("id") && !url.searchParams.get("gn")) return next();

    const res = await next();
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("text/html")) return res;

    const seo = await resolveSeo(url.pathname, url.searchParams);
    if (!seo) return res;

    const out = rewrite(res, seo);
    // 크롤러 재방문 대비 짧은 엣지 캐시(원본 HTML은 no-cache지만 변형본은 잠깐 캐시)
    const headers = new Headers(out.headers);
    headers.set("Cache-Control", "public, max-age=300, must-revalidate");
    return new Response(out.body, { status: out.status, headers });
  } catch {
    return context.next();  // 무슨 일이 있어도 원본 서빙(사이트 보호)
  }
}
