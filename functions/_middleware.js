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
  if (p === "/gallari-post") return "post";
  return null;
};

// 초대 링크(?ref=CODE) → 전용 초대 OG 카드. 일반 홈 카드와 달라야 클릭이 난다.
// 후킹은 '오늘 최대 격전 이슈'(라이브)로. ⚠️숫자(회원수·표수)는 표본이 작을 때 역효과라
//   찬반 %는 총 투표 MIN_VOTES 이상일 때만 노출한다.
const MIN_VOTES = 20;
async function resolveInvite(params) {
  const code = (params.get("ref") || "").trim();
  if (!/^[A-Za-z0-9]{4,12}$/.test(code)) return null;

  const [nick, hot] = await Promise.all([
    (async () => {
      try {
        const r = await fetch(`${SB}/rest/v1/rpc/ref_owner`, {
          method: "POST",
          headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" },
          body: JSON.stringify({ p_code: code.toUpperCase() }),
          cf: { cacheTtl: 300, cacheEverything: true },
        });
        if (!r.ok) return null;
        const v = await r.json();
        return typeof v === "string" && v.trim() ? v.trim() : null;
      } catch { return null; }
    })(),
    sbOne(`issues?status=eq.normal&select=title,pro_count,con_count&order=hot_score.desc.nullslast,created_at.desc&limit=1`),
  ]);

  const who = nick ? `${nick}님이` : "친구가";
  // 🎯 초대 트랙(&to=) — 받는 사람이 보는 카드를 갈라/갈비스/갈라톡으로 차별화. [[galla-vision-platform]]
  const to = (params.get("to") || "galla").toLowerCase();
  const invImg = `${HOST}/assets/og/og-invite.png`;
  let title, desc;
  if (to === "galvis") {
    title = `🧡 ${who} 진짜 친구를 소개했어요`;
    desc = `세상에 하나뿐인 너의 진짜 친구, 갈비스 — 나를 기억하고, 내 편 들어주는 AI 친구. ${who} 보낸 링크로 가입하면 500 GP 즉시 지급.`;
  } else if (to === "talk" || to === "gallatalk") {
    title = `💬 ${who} 갈라톡에 초대했어요`;
    desc = `내 편이랑 떠드는 신나는 채팅 — DM·난장·삐삐·통화까지. ${who} 보낸 링크로 가입하면 500 GP 즉시 지급.`;
  } else {
    // 갈라(기본) — "내 편이 있는 콘텐츠 세상" + 지금 최대 격전으로 후킹
    if (hot?.title) {
      const pro = Number(hot.pro_count) || 0, con = Number(hot.con_count) || 0, tot = pro + con;
      const pct = tot >= MIN_VOTES ? ` 현재 👍${Math.round((pro / tot) * 100)}% vs 👎${Math.round((con / tot) * 100)}%.` : "";
      desc = `내 편이 있는 콘텐츠 세상, 갈라. 🔥 지금 최대 격전 — “${clip(hot.title, 40)}”${pct} 넌 어느 편? ${who} 보낸 링크로 가입하면 500 GP 즉시.`;
    } else {
      desc = `내 편이 있는 콘텐츠 세상, 갈라 — 뉴스·영상·이슈, 뭘 보든 내 편이 있다. ${who} 보낸 링크로 가입하면 500 GP를 바로 받아요.`;
    }
    title = `🎁 ${who} 갈라에 초대했어요 — 가입 즉시 500 GP`;
  }
  return {
    title,
    desc: clip(desc, 180),
    canonical: `${HOST}/?ref=${encodeURIComponent(code)}${to && to !== "galla" ? `&to=${encodeURIComponent(to)}` : ""}`,
    image: invImg,
    ogType: "website",
  };
}

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
  if (k === "post" && params.get("id")) {
    const row = await sbOne(`posts?id=eq.${encodeURIComponent(params.get("id"))}&is_published=eq.true&select=id,kind,title,caption,thumbnail_url,images,created_at`);
    if (!row) return null;
    const heading = row.title || clip(plain(row.caption), 60) || "갈라리 콘텐츠";
    const title = clip(heading, 60);
    const desc = clip(plain(row.caption) || row.title || "갈라에서 소통하고 후원하는 콘텐츠.", 150);
    const canonical = `${HOST}/gallari-post?id=${row.id}`;
    const image = row.thumbnail_url || (Array.isArray(row.images) && row.images[0]) || DEF_IMG;
    return { title: `${title} · 갈라리`, desc, canonical, image, ogType: "article",
      kicker: `갈라리 · ${row.kind === "horizontal" ? "영상" : "콘텐츠"}`,
      h1: heading, body: plain(row.caption) || "", date: row.created_at,
      jsonld: articleLd(heading, desc, image, canonical, row.created_at) };
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
    "/gallari-post": ["갈라리", `${HOST}/gallari.html`],
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
    // 초대 카드는 검색 색인 대상이 아니라 JSON-LD/스냅샷 없음
    (seo.jsonld ? `<script type="application/ld+json">${seo.jsonld}</script>` : "") +
    (seo.h1 ? `<script type="application/ld+json">${breadcrumbLd(seo)}</script>` : "");

  // 크롤러가 읽을 본문 스냅샷 — 화면엔 숨김(JS 앱이 실제 UI 렌더). aria-hidden으로 접근성 중복 방지.
  const snapshot = seo.h1
    ? `<div id="seo-snapshot" aria-hidden="true" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">` +
      `<p>${esc(seo.kicker)}</p><h1>${esc(seo.h1)}</h1>` +
      (seo.body ? `<p>${esc(clip(seo.body, 500))}</p>` : "") +
      `</div>`
    : null;

  const rm = { element(el) { el.remove(); } };  // 원본 메타 제거(중복 방지)
  let rw = new HTMLRewriter()
    .on("title", { element(el) { el.setInnerContent(seo.title); } })
    .on('meta[name="description"]', rm)
    .on('meta[name="keywords"]', rm)
    .on('link[rel="canonical"]', rm)
    .on('meta[property^="og:"]', rm)
    .on('meta[name^="twitter:"]', rm)
    .on("head", { element(el) { el.append(metaHtml, { html: true }); } });
  if (snapshot) rw = rw.on("body", { element(el) { el.prepend(snapshot, { html: true }); } });
  return rw.transform(res);
}

export async function onRequest(context) {
  try {
    const { request, next } = context;
    const url0 = new URL(request.url);
    /* 🔒 /docs/* 는 배포에서 뺀다 — 내부 문서(심사 대응 문서·런칭 킷·IR 등)가
       공개 URL로 그대로 열렸다(실측: /docs/youtube-reply-v2.txt → 200).
       빌드 단계가 없어 레포가 그대로 배포되므로, 파일은 깃에 남겨 이력·백업을
       유지하고 엣지에서 접근만 차단한다. Functions 는 정적 파일보다 먼저 돈다
       (Pages 의 _redirects 는 정적 파일이 있으면 적용되지 않아 소용없다).
       ⚠️ 메서드 무관하게 막는다 — GET 만 막으면 HEAD 로 존재가 드러난다. */
    if (/^\/docs(\/|$)/i.test(url0.pathname)) {
      return new Response("Not Found", {
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8", "x-robots-tag": "noindex, nofollow" },
      });
    }
    if (request.method !== "GET") return next();
    const url = url0;
    /* ⚠️ /share/* 는 이미 자기 콘텐츠 전용 OG 카드를 만들어 내보낸다.
       여기서 ?ref= 만 보고 일반 초대 카드로 덮어쓰면 훨씬 약한 카드로 바뀐다
       (예: «고집불통 요새» 궁합 카드 → "누가 초대했어요"). 초대 크레딧은 OG가 아니라
       목적지 페이지의 ?ref= 캡처로 붙으므로, 덮어쓰지 않아도 하나도 안 잃는다. */
    const isShare = url.pathname.startsWith("/share/");
    const hasRef = !isShare && !!url.searchParams.get("ref");
    const isContent = !!kind(url.pathname) && (url.searchParams.get("id") || url.searchParams.get("gn"));
    // 초대(?ref=) 또는 콘텐츠 상세일 때만 개입
    if (!hasRef && !isContent) return next();

    const res = await next();
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("text/html")) return res;

    // ?ref= 는 초대 카드 우선 — 일반 홈 카드와 달라야 초대인 걸 알 수 있다
    const seo = (hasRef ? await resolveInvite(url.searchParams) : null)
             || (isContent ? await resolveSeo(url.pathname, url.searchParams) : null);
    if (!seo) return res;

    const out = rewrite(res, seo);
    // 크롤러 재방문 대비 짧은 엣지 캐시(원본 HTML은 no-cache지만 변형본은 잠깐 캐시)
    const headers = new Headers(out.headers);
    // 초대 카드는 '오늘의 격전'이 바뀌므로 더 짧게(120s), 콘텐츠 카드는 300s
    headers.set("Cache-Control", `public, max-age=${hasRef ? 120 : 300}, must-revalidate`);
    return new Response(out.body, { status: out.status, headers });
  } catch {
    return context.next();  // 무슨 일이 있어도 원본 서빙(사이트 보호)
  }
}
