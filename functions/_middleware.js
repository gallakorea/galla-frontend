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

// 경로 정규화: CF Pages가 /issue.html → /issue 로 308하므로 clean 경로 기준으로 매칭
const kind = (path) => {
  const p = path.replace(/\.html$/, "");
  if (p === "/issue") return "issue";
  if (p === "/news") return "news";
  if (p === "/plaza_detail") return "plaza";
  if (p === "/predict-market") return "predict";
  return null;
};

// 경로별 콘텐츠 → SEO 메타 객체 (canonical/og:url은 clean URL = 실제 200 페이지)
async function resolveSeo(path, params) {
  const k = kind(path);
  if (k === "issue" && params.get("id")) {
    const row = await sbOne(`issues?id=eq.${encodeURIComponent(params.get("id"))}&select=id,title,one_line,category,created_at,thumbnail_url`);
    if (!row) return null;
    const title = clip(row.title, 60), desc = clip(row.one_line || row.title, 150);
    const canonical = `${HOST}/issue?id=${row.id}`, image = row.thumbnail_url || DEF_IMG;
    return { title: `${title} · 갈라`, desc, canonical, image, ogType: "article",
      kicker: row.category ? `${row.category} · 여론 대결` : "여론 대결",
      h1: row.title, body: row.one_line || "", date: row.created_at,
      jsonld: articleLd(row.title, desc, image, canonical, row.created_at) };
  }
  if (k === "news" && params.get("gn")) {
    const row = await sbOne(`galla_news?id=eq.${encodeURIComponent(params.get("gn"))}&select=id,title,summary,category,hero_image,published_at,source_count`);
    if (!row) return null;
    const title = clip(row.title, 60), desc = clip(row.summary || row.title, 150);
    const canonical = `${HOST}/news?gn=${row.id}`, image = row.hero_image || DEF_IMG;
    return { title: `${title} · 갈라뉴스`, desc, canonical, image, ogType: "article",
      kicker: `${row.category || "뉴스"} · 갈라뉴스`,
      h1: row.title, body: row.summary || "", date: row.published_at,
      jsonld: newsLd(row.title, desc, image, canonical, row.published_at) };
  }
  if (k === "plaza" && params.get("id")) {
    const row = await sbOne(`plaza_posts?id=eq.${encodeURIComponent(params.get("id"))}&select=id,title,body,category,created_at,cover_image,thumbnail,nickname`);
    if (!row) return null;
    const title = clip(row.title, 60), desc = clip(plain(row.body) || row.title, 150);
    const canonical = `${HOST}/plaza_detail?id=${row.id}`, image = row.cover_image || row.thumbnail || DEF_IMG;
    return { title: `${title} · 갈라 광장`, desc, canonical, image, ogType: "article",
      kicker: `${row.category || "광장"} · 갈라 광장`,
      h1: row.title, body: plain(row.body), date: row.created_at,
      jsonld: articleLd(row.title, desc, image, canonical, row.created_at) };
  }
  if (k === "predict" && params.get("id")) {
    const row = await sbOne(`markets?id=eq.${encodeURIComponent(params.get("id"))}&select=id,question,description,category,image_url,created_at`);
    if (!row) return null;
    const title = clip(row.question, 60);
    const desc = clip(row.description || `${row.question} — 갈라예측에서 예/아니오에 GP를 걸고 결과를 맞혀보세요.`, 150);
    const canonical = `${HOST}/predict-market?id=${row.id}`, image = row.image_url || DEF_IMG;
    return { title: `${title} · 갈라예측`, desc, canonical, image, ogType: "article",
      kicker: `${row.category || "예측"} · 갈라예측`,
      h1: row.question, body: row.description || "", date: row.created_at,
      jsonld: articleLd(row.question, desc, image, canonical, row.created_at) };
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

// 검색결과에 "galla.im › 갈라뉴스 › 제목" 표시용 빵부스러기 구조화 데이터
function breadcrumbLd(seo) {
  const SEC = {
    "/issue": ["갈라 이슈", `${HOST}/`],
    "/news": ["갈라뉴스", `${HOST}/search.html`],
    "/plaza_detail": ["갈라 광장", `${HOST}/plaza.html`],
    "/predict-market": ["갈라예측", `${HOST}/galla-predict.html`],
  };
  let path = "/";
  try { path = new URL(seo.canonical).pathname; } catch {}
  const items = [{ "@type": "ListItem", position: 1, name: "GALLA 갈라", item: `${HOST}/` }];
  const sec = SEC[path];
  if (sec) items.push({ "@type": "ListItem", position: 2, name: sec[0], item: sec[1] });
  items.push({ "@type": "ListItem", position: items.length + 1, name: clip(seo.h1, 60), item: seo.canonical });
  return JSON.stringify({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items });
}

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
    `<script type="application/ld+json">${seo.jsonld}</script>` +
    `<script type="application/ld+json">${breadcrumbLd(seo)}</script>`;

  // 크롤러가 읽을 본문 스냅샷 — 화면엔 숨김(JS 앱이 실제 UI 렌더). aria-hidden으로 접근성 중복 방지.
  const snapshot =
    `<div id="seo-snapshot" aria-hidden="true" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">` +
    `<p>${esc(seo.kicker)}</p><h1>${esc(seo.h1)}</h1>` +
    (seo.body ? `<p>${esc(clip(seo.body, 500))}</p>` : "") +
    `</div>`;

  const rm = { element(el) { el.remove(); } };  // 원본 메타 제거(중복 방지)
  return new HTMLRewriter()
    .on("title", { element(el) { el.setInnerContent(seo.title); } })
    .on('meta[name="description"]', rm)
    .on('meta[name="keywords"]', rm)
    .on('link[rel="canonical"]', rm)
    .on('meta[property^="og:"]', rm)
    .on('meta[name^="twitter:"]', rm)
    .on("head", { element(el) { el.append(metaHtml, { html: true }); } })
    .on("body", { element(el) { el.prepend(snapshot, { html: true }); } })
    .transform(res);
}

export async function onRequest(context) {
  try {
    const { request, next } = context;
    if (request.method !== "GET") return next();
    const url = new URL(request.url);
    if (!kind(url.pathname)) return next();          // clean/.html 모두 kind()가 판별
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
