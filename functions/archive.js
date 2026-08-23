/**
 * 갈라 아카이브 (Cloudflare Pages Function → /archive)
 *
 * 왜 있나: 갈라의 목록 화면은 전부 JS 버튼이라 로봇 눈엔 <a href> 가 0개다. 그렇다고
 * 앱 화면 밑에 링크를 수십 개 깔면 사람 쓰는 화면이 망가진다(한 번 해봤다가 되돌렸다).
 * → 크롤 경로는 앱이 아니라 여기가 맡는다. 페이지네이션 있는 진짜 목록 페이지 하나.
 *   사람이 봐도 쓸 만한 '전체 콘텐츠' 페이지이고, 홈 푸터에서 링크 한 줄로 들어온다.
 *
 *   /archive              5개 영역 최근 12건씩 + 각 영역 전체보기
 *   /archive?t=news&p=2   영역별 목록(60건/페이지) + 이전·다음
 *
 * ⚠️ 갈라뉴스는 출처 2곳 이상만 싣는다 — 단일 출처 기사는 미들웨어가 noindex 를 붙인다.
 */
const SB = "https://bidqauputnhkqepvdzrr.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpZHFhdXB1dG5oa3FlcHZkenJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNzg1NDIsImV4cCI6MjA4MDg1NDU0Mn0.D-UGDPuBaNO8v-ror5-SWgUNLRvkOO-yrf2wDVZtyEM";
const HOST = "https://galla.im";
const PER = 60, HUB = 12, MAX_PAGE = 60;

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clip = (s, n) => { s = String(s ?? "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const day = (d) => { try { return new Date(d).toISOString().slice(0, 10); } catch { return ""; } };

// 영역 정의 — 한 곳에서만 고치면 되게
const TYPES = {
  issue:   { label: "이슈",     q: "issues?select=id,title,created_at&status=eq.normal&order=created_at.desc",                       href: (r) => `/issue?id=${r.id}`,           t: (r) => r.title,    d: (r) => r.created_at },
  news:    { label: "갈라뉴스", q: "galla_news?select=id,title,published_at&status=eq.published&source_count=gte.2&order=published_at.desc", href: (r) => `/news?gn=${r.id}`,      t: (r) => r.title,    d: (r) => r.published_at },
  plaza:   { label: "광장",     q: "plaza_posts?select=id,title,created_at&order=created_at.desc",                                   href: (r) => `/plaza_detail?id=${r.id}`,    t: (r) => r.title,    d: (r) => r.created_at },
  predict: { label: "갈라예측", q: "markets?select=id,question,created_at&order=created_at.desc",                                     href: (r) => `/predict-market?id=${r.id}`,  t: (r) => r.question, d: (r) => r.created_at },
  gallari: { label: "숏판·롱판", q: "posts?select=id,title,caption,created_at&is_published=eq.true&order=created_at.desc",            href: (r) => `/gallari-post?id=${r.id}`,    t: (r) => r.title || clip(r.caption, 60), d: (r) => r.created_at },
};

async function fetchPage(spec, offset, limit) {
  try {
    const r = await fetch(`${SB}/rest/v1/${spec.q}&limit=${limit}&offset=${offset}`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, Prefer: "count=exact", Range: `${offset}-${offset + limit - 1}` },
      cf: { cacheTtl: 900, cacheEverything: true },
    });
    if (!r.ok) return { rows: [], total: 0 };
    const rows = await r.json();
    const total = Number((r.headers.get("content-range") || "").split("/")[1]) || rows.length;
    return { rows: Array.isArray(rows) ? rows : [], total };
  } catch { return { rows: [], total: 0 }; }
}

const CSS = `
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:#000;color:#e8ecf3;font:15px/1.6 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Pretendard",system-ui,sans-serif}
.wrap{max-width:760px;margin:0 auto;padding:28px 18px 64px}
a{color:inherit}
.top{display:flex;align-items:baseline;gap:12px;padding-bottom:16px;border-bottom:1px solid #171b24}
.top a.home{font-size:18px;font-weight:800;text-decoration:none;letter-spacing:-.3px}
.top span{color:#6b7488;font-size:13px}
h1{font-size:20px;margin:24px 0 4px;letter-spacing:-.3px}
.lede{color:#6b7488;font-size:13px;margin:0 0 22px}
h2{font-size:14px;color:#9aa6bd;margin:26px 0 2px;display:flex;justify-content:space-between;align-items:baseline;gap:12px}
h2 a{font-size:12px;color:#5f6a80;text-decoration:none;font-weight:500;white-space:nowrap}
ul{list-style:none;margin:0;padding:0}
li{border-bottom:1px solid #101318}
li a{display:flex;gap:12px;justify-content:space-between;padding:11px 0;text-decoration:none;color:#c3cbd9;font-size:14px}
li a:hover{color:#fff}
li time{color:#4e576b;font-size:12px;flex:0 0 auto;font-variant-numeric:tabular-nums}
.pager{display:flex;justify-content:space-between;gap:12px;margin-top:26px}
.pager a{padding:9px 16px;border:1px solid #1b1f2a;border-radius:999px;text-decoration:none;color:#9aa6bd;font-size:13px}
.pager span{color:#3f4757;font-size:13px;align-self:center}
.nav{display:flex;flex-wrap:wrap;gap:8px;margin:22px 0 0}
.nav a{padding:7px 14px;border:1px solid #1b1f2a;border-radius:999px;text-decoration:none;color:#8b94a8;font-size:13px}
.nav a[aria-current]{border-color:#4b5570;color:#fff}
footer{margin-top:44px;padding-top:18px;border-top:1px solid #171b24;color:#4e576b;font-size:12px}
`;

const row = (spec, r) =>
  `<li><a href="${spec.href(r)}">${esc(clip(spec.t(r), 90))}<time>${day(spec.d(r))}</time></a></li>`;

const shell = (title, desc, canonical, body, prevNext) => `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="index,follow">
<link rel="canonical" href="${esc(canonical)}">
${prevNext || ""}
<meta property="og:type" content="website"><meta property="og:site_name" content="GALLA 갈라">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}"><meta property="og:image" content="${HOST}/assets/og/og-default.png">
<link rel="icon" href="/favicon.ico">
<style>${CSS}</style></head>
<body><div class="wrap">
<div class="top"><a class="home" href="/">GALLA 갈라</a><span>아카이브</span></div>
${body}
<footer>© 2026 GALLA 갈라 · <a href="/">홈</a> · <a href="/terms">이용약관</a> · <a href="/privacy">개인정보처리방침</a></footer>
</div></body></html>`;

const navHtml = (cur) =>
  `<nav class="nav"><a href="/archive"${cur ? "" : ' aria-current="page"'}>전체</a>` +
  Object.entries(TYPES).map(([k, v]) => `<a href="/archive?t=${k}"${cur === k ? ' aria-current="page"' : ""}>${esc(v.label)}</a>`).join("") +
  `</nav>`;

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const t = url.searchParams.get("t");
  const page = Math.min(Math.max(parseInt(url.searchParams.get("p") || "1", 10) || 1, 1), MAX_PAGE);

  // ── 영역별 목록 ──
  if (t && TYPES[t]) {
    const spec = TYPES[t];
    const { rows, total } = await fetchPage(spec, (page - 1) * PER, PER);
    const last = Math.max(1, Math.min(MAX_PAGE, Math.ceil(total / PER)));
    const canonical = `${HOST}/archive?t=${t}${page > 1 ? `&p=${page}` : ""}`;
    const link =
      (page > 1 ? `<link rel="prev" href="${HOST}/archive?t=${t}${page > 2 ? `&p=${page - 1}` : ""}">` : "") +
      (page < last ? `<link rel="next" href="${HOST}/archive?t=${t}&p=${page + 1}">` : "");
    const body =
      `<h1>${esc(spec.label)} 아카이브</h1>` +
      `<p class="lede">전체 ${total.toLocaleString("ko-KR")}건 · ${page} / ${last} 페이지</p>` +
      navHtml(t) +
      `<ul>${rows.map((r) => row(spec, r)).join("")}</ul>` +
      `<div class="pager">` +
        (page > 1 ? `<a href="/archive?t=${t}${page > 2 ? `&p=${page - 1}` : ""}">‹ 이전</a>` : `<span></span>`) +
        (page < last ? `<a href="/archive?t=${t}&p=${page + 1}">다음 ›</a>` : `<span></span>`) +
      `</div>`;
    return html(shell(
      `${spec.label} 아카이브 ${page > 1 ? `(${page}페이지) ` : ""}· 갈라`,
      `갈라의 ${spec.label} 전체 목록 ${page}페이지. 대한민국 실시간 여론·예측 플랫폼 갈라.`,
      canonical, body, link));
  }

  // ── 허브 ──
  const packs = await Promise.all(Object.entries(TYPES).map(async ([k, spec]) => {
    const { rows, total } = await fetchPage(spec, 0, HUB);
    return { k, spec, rows, total };
  }));
  const body =
    `<h1>갈라 전체 콘텐츠</h1>` +
    `<p class="lede">갈라에 올라온 이슈·갈라뉴스·광장 글·예측 마켓·숏판/롱판을 한 곳에서 훑어봅니다.</p>` +
    navHtml(null) +
    packs.map(({ k, spec, rows, total }) =>
      `<h2>${esc(spec.label)}<a href="/archive?t=${k}">전체 ${total.toLocaleString("ko-KR")}건 ›</a></h2>` +
      `<ul>${rows.map((r) => row(spec, r)).join("")}</ul>`).join("");
  return html(shell(
    "갈라 전체 콘텐츠 아카이브",
    "갈라의 이슈·갈라뉴스·광장·갈라예측·숏판/롱판 전체 목록. 대한민국 실시간 여론·예측 플랫폼 갈라.",
    `${HOST}/archive`, body, ""));
}

const html = (s) => new Response(s, {
  headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=1800" },
});
