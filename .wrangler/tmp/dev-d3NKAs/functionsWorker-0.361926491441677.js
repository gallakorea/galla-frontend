var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-Qv7MEP/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// ../../../.wrangler/tmp/pages-NH9cnI/functionsWorker-0.361926491441677.mjs
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
var urls2 = /* @__PURE__ */ new Set();
function checkURL2(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls2.has(url.toString())) {
      urls2.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL2, "checkURL");
__name2(checkURL2, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL2(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});
var SB = "https://bidqauputnhkqepvdzrr.supabase.co";
var ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpZHFhdXB1dG5oa3FlcHZkenJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNzg1NDIsImV4cCI6MjA4MDg1NDU0Mn0.D-UGDPuBaNO8v-ror5-SWgUNLRvkOO-yrf2wDVZtyEM";
var MIN_VOTES = 20;
var esc = /* @__PURE__ */ __name2((s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"), "esc");
var clip = /* @__PURE__ */ __name2((s, n) => {
  s = String(s ?? "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1) + "\u2026" : s;
}, "clip");
var short = /* @__PURE__ */ __name2((n) => {
  n = Number(n) || 0;
  if (n >= 1e8) return (n / 1e8).toFixed(1).replace(/\.0$/, "") + "\uC5B5";
  if (n >= 1e4) return (n / 1e4).toFixed(1).replace(/\.0$/, "") + "\uB9CC";
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "\uCC9C";
  return String(n);
}, "short");
async function sbOne(query) {
  try {
    const r = await fetch(`${SB}/rest/v1/${query}`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
    if (!r.ok) return null;
    const a = await r.json();
    return Array.isArray(a) && a.length ? a[0] : null;
  } catch {
    return null;
  }
}
__name(sbOne, "sbOne");
__name2(sbOne, "sbOne");
async function sbAll(query) {
  try {
    const r = await fetch(`${SB}/rest/v1/${query}`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
    if (!r.ok) return [];
    const a = await r.json();
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}
__name(sbAll, "sbAll");
__name2(sbAll, "sbAll");
function withParams(dest, url) {
  const keep = ["ref", "utm_source", "utm_medium", "utm_campaign"];
  const sp = new URLSearchParams();
  for (const k of keep) {
    const v = url.searchParams.get(k);
    if (v) sp.set(k, v);
  }
  const q = sp.toString();
  if (!q) return dest;
  return dest + (dest.includes("?") ? "&" : "?") + q;
}
__name(withParams, "withParams");
__name2(withParams, "withParams");
function landingPage({
  url,
  origin,
  badge,
  ogTitle,
  ogDesc,
  ogImage,
  ogType = "article",
  heading,
  sub,
  bodyHtml = "",
  ctaText,
  ctaHref,
  subText = "\uAC08\uB77C \uB458\uB7EC\uBCF4\uAE30",
  subHref
}) {
  subHref = subHref || withParams(`${origin}/index.html`, url);
  const html = `<!doctype html><html lang="ko"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(ogTitle)} \xB7 GALLA</title>
<meta name="description" content="${esc(ogDesc)}">
<meta property="og:type" content="${esc(ogType)}">
<meta property="og:site_name" content="GALLA \uAC08\uB77C">
<meta property="og:title" content="${esc(ogTitle)}">
<meta property="og:description" content="${esc(ogDesc)}">
<meta property="og:image" content="${esc(ogImage)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="${esc(url.href)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(ogTitle)}">
<meta name="twitter:description" content="${esc(ogDesc)}">
<meta name="twitter:image" content="${esc(ogImage)}">
<link rel="icon" type="image/png" sizes="32x32" href="${origin}/assets/app-icons/favicon-32.png">
<style>
  *{box-sizing:border-box}
  html,body{margin:0;background:#08080b;color:#fff;
    font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
  .wrap{max-width:480px;margin:0 auto;min-height:100dvh;display:flex;flex-direction:column}
  .bar{display:flex;align-items:center;gap:8px;padding:14px 16px}
  .bar .brand{height:17px;width:auto;display:block}
  .bar span{margin-left:auto;font-size:11px;color:#8a909c}
  .hero{padding:22px 16px 6px}
  .hero h1{margin:0;font-size:22px;font-weight:900;line-height:1.3}
  .hero p{margin:10px 0 0;font-size:13.5px;color:#aeb5c2;line-height:1.6}
  .body{padding:6px 16px}
  .hook{margin:16px 16px 0;padding:16px;border-radius:16px;
    background:linear-gradient(135deg,rgba(255,77,103,.14),rgba(61,107,255,.14));
    border:1px solid rgba(255,255,255,.08)}
  .hook h2{margin:0;font-size:15px;font-weight:900;line-height:1.4}
  .hook p{margin:7px 0 0;font-size:12.5px;color:#aeb5c2;line-height:1.55}
  .cta{margin:auto 16px calc(20px + env(safe-area-inset-bottom));padding-top:20px;display:flex;flex-direction:column;gap:9px}
  .go{display:flex;align-items:center;justify-content:center;min-height:52px;border-radius:14px;
    background:#fff;color:#0a0a0c;font-size:15px;font-weight:900;text-decoration:none}
  .go:active{transform:scale(.98)}
  .sub{display:flex;align-items:center;justify-content:center;min-height:44px;border-radius:14px;
    background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#aeb5c2;font-size:12.5px;font-weight:700;text-decoration:none}
  .gift{margin:12px 16px 0;font-size:12px;color:#f5cf6b;text-align:center;font-weight:800}
  /* \uD2B8\uB80C\uB4DC \uB7AD\uD0B9 */
  .rank{margin:4px 16px 0;display:flex;flex-direction:column;gap:8px}
  .ri{display:flex;align-items:center;gap:11px;padding:12px 13px;border-radius:13px;
    background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.07);text-decoration:none;color:#fff}
  .ri:active{transform:scale(.99)}
  .ri .n{flex:0 0 24px;font-size:16px;font-weight:900;color:#f5cf6b;text-align:center}
  .ri .tt{flex:1;font-size:13.5px;font-weight:700;line-height:1.35}
  .ri .vs{flex:0 0 auto;font-size:10.5px;color:#8a909c;font-weight:800}
</style>
</head><body>
<div class="wrap">
  <div class="bar"><img class="brand" src="${origin}/assets/brand/wordmark-white.png" alt="GALLA"><span>${esc(badge || "\uAC08\uB77C")}</span></div>
  <div class="hero"><h1>${esc(heading)}</h1>${sub ? `<p>${esc(sub)}</p>` : ""}</div>
  ${bodyHtml ? `<div class="body">${bodyHtml}</div>` : ""}
  <div class="cta">
    <a class="go" href="${esc(ctaHref)}">${esc(ctaText)} \u2192</a>
    <a class="sub" href="${esc(subHref)}">${esc(subText)}</a>
  </div>
</div>
</body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=180" } });
}
__name(landingPage, "landingPage");
__name2(landingPage, "landingPage");
function videoLanding({ origin, url, id, row, defImg }) {
  const title = clip(row.title, 70);
  const ch = clip(row.channel_title || "", 30);
  const image = row.thumbnail || defImg;
  const ogTitle = `\u{1F3AC} ${title}`;
  const ogDesc = `\uC9C0\uAE08 \uD55C\uAD6D\uC5D0\uC11C \uAC00\uC7A5 \uB728\uAC70\uC6B4 \uC601\uC0C1 \xB7 \uC870\uD68C ${short(row.view_count)} \u2014 \uAC08\uB77C\uC5D0\uC11C \uBCF4\uACE0, \uD55C\uB9C8\uB514 \uB0A8\uAE30\uACE0, \uD55C \uD310\uAE4C\uC9C0.`;
  const dest = withParams(`${origin}/search.html?video=${encodeURIComponent(id)}`, url);
  const home = withParams(`${origin}/index.html`, url);
  const html = `<!doctype html><html lang="ko"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(ogTitle)} \xB7 GALLA</title>
<meta name="description" content="${esc(ogDesc)}">
<meta property="og:type" content="video.other">
<meta property="og:site_name" content="GALLA \uAC08\uB77C">
<meta property="og:title" content="${esc(ogTitle)}">
<meta property="og:description" content="${esc(ogDesc)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="1280">
<meta property="og:image:height" content="720">
<meta property="og:url" content="${esc(url.href)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(ogTitle)}">
<meta name="twitter:description" content="${esc(ogDesc)}">
<meta name="twitter:image" content="${esc(image)}">
<link rel="icon" type="image/png" sizes="32x32" href="${origin}/assets/app-icons/favicon-32.png">
<style>
  *{box-sizing:border-box}
  html,body{margin:0;background:#08080b;color:#fff;font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
  .wrap{max-width:480px;margin:0 auto;min-height:100dvh;display:flex;flex-direction:column}
  .bar{display:flex;align-items:center;gap:8px;padding:14px 16px}
  .bar .brand{height:17px;width:auto;display:block}
  .bar span{margin-left:auto;font-size:11px;color:#8a909c}
  .stage{position:relative;width:100%;aspect-ratio:16/9;background:#000;overflow:hidden}
  .stage iframe{width:100%;height:100%;border:0;display:block}
  .info{padding:16px}
  .t{font-size:17px;font-weight:800;line-height:1.35}
  .m{margin-top:6px;font-size:12px;color:#8a909c}
  .hook{margin:18px 16px 0;padding:16px;border-radius:16px;background:linear-gradient(135deg,rgba(255,77,103,.14),rgba(61,107,255,.14));border:1px solid rgba(255,255,255,.08)}
  .hook h2{margin:0;font-size:15px;font-weight:900;line-height:1.4}
  .hook p{margin:7px 0 0;font-size:12.5px;color:#aeb5c2;line-height:1.55}
  .cta{margin:auto 16px calc(20px + env(safe-area-inset-bottom));padding-top:20px;display:flex;flex-direction:column;gap:9px}
  .go{display:flex;align-items:center;justify-content:center;min-height:52px;border-radius:14px;background:#fff;color:#0a0a0c;font-size:15px;font-weight:900;text-decoration:none}
  .go:active{transform:scale(.98)}
  .sub{display:flex;align-items:center;justify-content:center;min-height:44px;border-radius:14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#aeb5c2;font-size:12.5px;font-weight:700;text-decoration:none}
</style>
</head><body>
<div class="wrap">
  <div class="bar"><b>GALLA</b><span>\uD56B\uC601\uC0C1</span></div>
  <div class="stage">
    <iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0&playsinline=1"
      title="${esc(title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
  </div>
  <div class="info">
    <div class="t">${esc(title)}</div>
    <div class="m">${esc(ch)} \xB7 \uC870\uD68C ${short(row.view_count)}</div>
  </div>
  <div class="hook">
    <h2>\uC774 \uC601\uC0C1, \uB2F9\uC2E0\uC740 \uC5B4\uB290 \uD3B8\uC785\uB2C8\uAE4C?</h2>
    <p>\uAC08\uB77C\uC5D0\uC120 \uADF8\uB0E5 \uBCF4\uACE0 \uB05D\uB098\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. \uC88B\uC544\uC694\uB97C \uB204\uB974\uACE0, \uD55C\uB9C8\uB514 \uB0A8\uAE30\uACE0, \uAC08\uB77C\uB85C \uD310\uC744 \uD0A4\uC6B0\uC138\uC694. \uC9C0\uAE08 \uB728\uB294 \uC601\uC0C1 \uC804\uBD80\uAC00 \uCE74\uD14C\uACE0\uB9AC\uBCC4\uB85C \uC815\uB9AC\uB3FC \uC788\uC2B5\uB2C8\uB2E4.</p>
  </div>
  <div class="cta">
    <a class="go" href="${esc(dest)}">\uAC08\uB77C\uC5D0\uC11C \uC774\uC5B4\uBCF4\uAE30</a>
    <a class="sub" href="${esc(home)}">\uAC08\uB77C \uB458\uB7EC\uBCF4\uAE30</a>
  </div>
</div>
</body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
}
__name(videoLanding, "videoLanding");
__name2(videoLanding, "videoLanding");
var CMT = {
  issue: { table: "comments", fk: "issue_id", content: "content", parent: "issues", ptitle: "title", dest: /* @__PURE__ */ __name2((o, id) => `${o}/issue.html?id=${id}`, "dest"), emoji: "\u{1F5EF}\uFE0F", label: "\uC774\uC288 \uB313\uAE00" },
  news: { table: "galla_news_comments", fk: "news_id", content: "content", parent: "galla_news", ptitle: "title", dest: /* @__PURE__ */ __name2((o, id) => `${o}/news.html?gn=${id}`, "dest"), emoji: "\u{1F5EF}\uFE0F", label: "\uB274\uC2A4 \uB313\uAE00" },
  market: { table: "market_comments", fk: "market_id", content: "content", parent: "markets", ptitle: "question", dest: /* @__PURE__ */ __name2((o, id) => `${o}/predict-market.html?id=${id}`, "dest"), emoji: "\u{1F5EF}\uFE0F", label: "\uC608\uCE21 \uB313\uAE00" },
  plaza: { table: "plaza_comments", fk: "post_id", content: "body", parent: "plaza_posts", ptitle: "title", dest: /* @__PURE__ */ __name2((o, id) => `${o}/plaza_detail.html?id=${id}`, "dest"), emoji: "\u{1F5EF}\uFE0F", label: "\uAD11\uC7A5 \uB313\uAE00" },
  post: { table: "post_comments", fk: "post_id", content: "body", parent: "posts", ptitle: "title", dest: /* @__PURE__ */ __name2((o, id) => `${o}/gallari-post.html?id=${id}`, "dest"), emoji: "\u{1F5EF}\uFE0F", label: "\uC20F\uD310/\uB871\uD310 \uB313\uAE00" },
  video: { table: "video_comments", fk: "video_id", content: "body", parent: "youtube_hot", ptitle: "title", dest: /* @__PURE__ */ __name2((o, id) => `${o}/search.html?video=${id}`, "dest"), emoji: "\u{1F5EF}\uFE0F", label: "\uC601\uC0C1 \uB313\uAE00" }
};
async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const origin = url.origin;
  const seg = (context.params.path || []).filter(Boolean);
  const type = seg[0];
  const id = decodeURIComponent(seg[1] || "");
  const defImg = `${origin}/assets/og/og-default.png`;
  if (type === "trend") {
    const rows = await sbAll(`issues?status=eq.normal&select=id,title,faction_a,faction_b,pro_count,con_count&order=hot_score.desc.nullslast,created_at.desc&limit=8`);
    const top = rows.slice(0, 3).map((r) => clip(r.title, 20)).filter(Boolean);
    const ogDesc = top.length ? `\u{1F525} ${top.map((t, i) => `${i + 1}\uC704 ${t}`).join(" \xB7 ")}\u2026 \uC9C0\uAE08 \uC81C\uC77C \uB728\uAC70\uC6B4 \uAC08\uB77C \uD2B8\uB80C\uB4DC TOP. \uB10C \uC5B4\uB290 \uD3B8?` : "\uC9C0\uAE08 \uAC08\uB77C\uC5D0\uC11C \uC81C\uC77C \uB728\uAC70\uC6B4 \uC774\uC288 TOP \u2014 \uC9C4\uC601\uC744 \uC815\uD558\uACE0 \uCC38\uC804\uD558\uC138\uC694.";
    const rankHtml = `<div class="rank">` + rows.map((r, i) => {
      const a = clip(r.faction_a || "\uCC2C\uC131", 6), b = clip(r.faction_b || "\uBC18\uB300", 6);
      const href = withParams(`${origin}/issue.html?id=${encodeURIComponent(r.id)}`, url);
      return `<a class="ri" href="${esc(href)}"><span class="n">${i + 1}</span><span class="tt">${esc(clip(r.title, 44))}</span><span class="vs">${esc(a)} vs ${esc(b)}</span></a>`;
    }).join("") + `</div>`;
    return landingPage({
      url,
      origin,
      badge: "\uC2E4\uC2DC\uAC04 \uD2B8\uB80C\uB4DC",
      ogTitle: "\u{1F525} \uC9C0\uAE08 \uAC08\uB77C \uC2E4\uC2DC\uAC04 \uD2B8\uB80C\uB4DC",
      ogDesc,
      ogImage: defImg,
      heading: "\uC9C0\uAE08 \uAC08\uB77C\uC5D0\uC11C \uC81C\uC77C \uB728\uAC70\uC6B4 \uD310",
      sub: "\uC624\uB298 \uD130\uC9C4 \uC774\uC288\uC5D0 \uC9C4\uC601\uC744 \uC815\uD558\uACE0, \uB313\uAE00\uB85C \uD55C\uD310 \uBD99\uC5B4\uBCF4\uC138\uC694.",
      bodyHtml: rankHtml,
      ctaText: "\uAC08\uB77C\uC5D0\uC11C \uCC38\uC804\uD558\uAE30",
      ctaHref: withParams(`${origin}/index.html`, url)
    });
  }
  if (type === "room" && id) {
    const row = await sbOne(`open_rooms?id=eq.${encodeURIComponent(id)}&select=title,topic,is_live,kind`);
    const title2 = clip(row?.title || "\uC721\uC131 \uB09C\uC7A5", 40);
    const topic = clip(row?.topic || "", 60);
    const liveTxt = row?.is_live ? "\uC9C0\uAE08 \uC0DD\uBC29 \uC911" : "\uC5F4\uB9B0 \uBC29";
    const dest2 = withParams(`${origin}/dm.html?room=${encodeURIComponent(id)}`, url);
    return landingPage({
      url,
      origin,
      badge: "\uB09C\uC7A5",
      ogTitle: `\u{1F399} ${title2}`,
      ogDesc: `${topic ? topic + " \xB7 " : ""}${liveTxt} \uC721\uC131 \uB09C\uC7A5 \u2014 \uB4E4\uC5B4\uC640\uC11C \uAC19\uC774 \uB5A0\uB4E4\uC790. \uAC08\uB77C \uAC00\uC785\uD558\uBA74 \uBC14\uB85C \uC785\uC7A5.`,
      ogImage: defImg,
      heading: `\u{1F399} ${title2}`,
      sub: topic || `${liveTxt} \uC721\uC131 \uB09C\uC7A5\uC5D0 \uCD08\uB300\uBC1B\uC558\uC5B4\uC694.`,
      ctaText: "\uB09C\uC7A5 \uC785\uC7A5\uD558\uAE30",
      ctaHref: dest2
    });
  }
  if (type === "u" && id) {
    const row = await sbOne(`users?id=eq.${encodeURIComponent(id)}&select=nickname,avatar_url`);
    const nick = clip(row?.nickname || "\uAC08\uB77C \uCE5C\uAD6C", 20);
    const img = row?.avatar_url || defImg;
    const dest2 = withParams(`${origin}/dm.html?dm=${encodeURIComponent(id)}`, url);
    return landingPage({
      url,
      origin,
      badge: "\uB9D0 \uAC78\uAE30",
      ogTitle: `\u{1F4AC} ${nick}\uC5D0\uAC8C \uB9D0 \uAC78\uAE30`,
      ogDesc: `\uAC08\uB77C\uC5D0\uC11C ${nick}\uC640 1:1 \uB300\uD654 \uC2DC\uC791 \u2014 \uC624\uD508\uD504\uB85C\uD544. \uAC00\uC785\uD558\uACE0 \uBC14\uB85C \uB9D0 \uAC78\uC5B4\uBD10.`,
      ogImage: img,
      heading: `\u{1F4AC} ${nick}\uC5D0\uAC8C \uB9D0 \uAC78\uAE30`,
      sub: "\uAC08\uB77C\uC5D0\uC11C 1:1\uB85C \uB300\uD654\uB97C \uC2DC\uC791\uD560 \uC218 \uC788\uC5B4\uC694. \uAC00\uC785\uD558\uBA74 \uBC14\uB85C \uC5F0\uACB0\uB3FC\uC694.",
      ctaText: `${nick}\uC5D0\uAC8C \uB9D0 \uAC78\uAE30`,
      ctaHref: dest2
    });
  }
  if (type === "comment") {
    const scope = seg[1];
    const cid = decodeURIComponent(seg[2] || "");
    const cfg = CMT[scope];
    if (cfg && cid) {
      const row = await sbOne(`${cfg.table}?id=eq.${encodeURIComponent(cid)}&select=${cfg.content},${cfg.fk},user_id,parent_id`);
      if (row) {
        const text = clip(row[cfg.content] || "", 70);
        const pid = row[cfg.fk];
        const [parent, who] = await Promise.all([
          sbOne(`${cfg.parent}?${cfg.parent === "youtube_hot" ? "video_id" : "id"}=eq.${encodeURIComponent(pid)}&select=${cfg.ptitle}&limit=1`),
          row.user_id ? sbOne(`users?id=eq.${encodeURIComponent(row.user_id)}&select=nickname`) : Promise.resolve(null)
        ]);
        const nick = clip(who?.nickname || "\uB204\uAD70\uAC00", 16);
        const ptitle = clip(parent?.[cfg.ptitle] || "\uAC08\uB77C", 34);
        const isReply = !!row.parent_id;
        const dest2 = withParams(cfg.dest(origin, encodeURIComponent(pid)), url) + `#c${encodeURIComponent(cid)}`;
        return landingPage({
          url,
          origin,
          badge: cfg.label,
          ogTitle: `\u{1F5EF}\uFE0F \u201C${text}\u201D`,
          ogDesc: `${nick}\uC758 ${isReply ? "\uB300\uB313\uAE00" : "\uD55C\uB9C8\uB514"} \u2014 \u201C${ptitle}\u201D\uC5D0\uC11C \uD130\uC84C\uB2E4. \uC6D0\uD310 \uBCF4\uACE0 \uB108\uB3C4 \uD55C\uB9C8\uB514 \u3131\u3131.`,
          ogImage: defImg,
          heading: `\u{1F5EF}\uFE0F \u201C${text}\u201D`,
          sub: `\u2014 ${nick} \xB7 \u201C${ptitle}\u201D`,
          bodyHtml: `<div class="hook"><h2>\uC774 ${isReply ? "\uB300\uB313\uAE00" : "\uB313\uAE00"}, \uADF8\uB0E5 \uB118\uAE38 \uAC70\uC57C?</h2><p>\uAC08\uB77C\uB294 \uB313\uAE00\uC774 \uACE7 \uC804\uD22C\uC785\uB2C8\uB2E4. \uC6D0\uD310\uC73C\uB85C \uAC00\uC11C \uBC1B\uC544\uCE58\uAC70\uB098 \uD3B8\uB4E4\uC5B4 \uC8FC\uC138\uC694. \uC9C0\uAE08 \uAC00\uC785\uD558\uBA74 500 GP\uB3C4 \uB364.</p></div>`,
          ctaText: "\uC6D0\uD310 \uBCF4\uB7EC \uAC00\uAE30",
          ctaHref: dest2
        });
      }
    }
  }
  let title = "GALLA \xB7 \uC5EC\uB860\uC774 \uC5D0\uB108\uC9C0\uAC00 \uB418\uB294 \uACF3";
  let desc = "\uCC2C\uC131\uC774\uB0D0 \uBC18\uB300\uB0D0, \uB2F9\uC2E0\uC758 \uC9C4\uC601\uC740? \uC9C0\uAE08 \uAC08\uB77C\uC5D0\uC11C \uC5EC\uB860 \uC804\uD22C\uC5D0 \uCC38\uC804\uD558\uC138\uC694.";
  let image = defImg;
  let dest = `${origin}/index.html`;
  let ogType = "article";
  if (type === "issue" && id) {
    const row = await sbOne(`issues?id=eq.${encodeURIComponent(id)}&select=title,description,faction_a,faction_b,card_thumb_url,thumbnail_url,images,pro_count,con_count`);
    if (row) {
      const a = row.faction_a || "\uCC2C\uC131", b = row.faction_b || "\uBC18\uB300";
      const pro = Number(row.pro_count) || 0, con = Number(row.con_count) || 0, tot = pro + con;
      const pct = tot >= MIN_VOTES ? ` (\uD604\uC7AC \u{1F44D}${Math.round(pro / tot * 100)}% vs \u{1F44E}${Math.round(con / tot * 100)}%)` : "";
      title = `\u2694\uFE0F ${clip(row.title, 60)}`;
      desc = `\u{1F44D} ${a}  VS  \u{1F44E} ${b}${pct} \xB7 \uB2F9\uC2E0\uC740 \uC5B4\uB290 \uD3B8? \uC9C0\uAE08 \uCC38\uC804\uD558\uACE0 \uC9C4\uC601\uC744 \uBC1D\uD788\uC138\uC694.`;
      const firstImg = Array.isArray(row.images) && row.images.length ? row.images[0] : null;
      image = row.card_thumb_url || row.thumbnail_url || firstImg || defImg;
      dest = `${origin}/issue.html?id=${encodeURIComponent(id)}`;
    }
  } else if ((type === "predict" || type === "market") && id) {
    const row = await sbOne(`markets?id=eq.${encodeURIComponent(id)}&select=question,description,image_url`);
    if (row) {
      title = `\u{1F52E} ${clip(row.question, 60)}`;
      desc = `\uB2F9\uC2E0\uC758 \uC608\uCE21\uC740? GP \uAC78\uACE0 \uACA8\uB8E8\uB294 \uAC08\uB77C\uC608\uCE21 \u2014 \uC801\uC911\uD558\uBA74 \uC7AD\uD31F. \uC9C0\uAE08 \uCC38\uC5EC\uD558\uACE0 \uC608\uCE21\uC655\uC5D0 \uB3C4\uC804\uD558\uC138\uC694.`;
      image = row.image_url || defImg;
      dest = `${origin}/predict-market.html?id=${encodeURIComponent(id)}`;
    }
  } else if (type === "video" && id) {
    const row = await sbOne(`youtube_hot?video_id=eq.${encodeURIComponent(id)}&select=title,channel_title,thumbnail,view_count,is_short&limit=1`);
    if (row) return videoLanding({ origin, url, id, row, defImg });
  } else if (type === "news" && id) {
    const row = await sbOne(`galla_news?id=eq.${encodeURIComponent(id)}&select=title,summary,hero_image,category`);
    if (row) {
      title = `\u{1F4F0} ${clip(row.title, 60)}`;
      desc = `${clip(row.summary || "", 90) || "\uC5EC\uB7EC \uAE30\uC0AC\uB97C AI\uAC00 3\uC904\uB85C \uC815\uB9AC\uD55C \uAC08\uB77C\uB274\uC2A4."} \xB7 \uC624\uB298 \uBB50 \uD130\uC84C\uB294\uC9C0 \uAC08\uB77C\uB274\uC2A4\uC5D0\uC11C \uB2E4 \uBD10.`;
      image = row.hero_image || defImg;
      dest = `${origin}/news.html?gn=${encodeURIComponent(id)}`;
    }
  } else if (type === "plaza" && id) {
    const row = await sbOne(`plaza_posts?id=eq.${encodeURIComponent(id)}&select=title,body,thumbnail,cover_image`);
    if (row) {
      title = `\u{1F4AC} ${clip(row.title, 60)}`;
      desc = `${clip(row.body || "", 80) || "\uAC08\uB77C \uAD11\uC7A5\uC5D0\uC11C \uC9C0\uAE08 \uB728\uAC70\uC6B4 \uC774\uC57C\uAE30"} \xB7 \uD55C \uC904 \uAC70\uB4E4\uACE0 \uD310\uC744 \uD0A4\uC6CC\uBCF4\uC138\uC694.`;
      image = row.thumbnail || row.cover_image || defImg;
      dest = `${origin}/plaza_detail.html?id=${encodeURIComponent(id)}`;
    }
  } else if (type === "post" && id) {
    const row = await sbOne(`posts?id=eq.${encodeURIComponent(id)}&is_published=eq.true&select=title,caption,thumbnail_url,images,kind`);
    if (row) {
      const firstImg = Array.isArray(row.images) && row.images.length ? row.images[0] : null;
      const isLong = row.kind === "horizontal";
      const cap = clip(row.caption || row.title || "", 80);
      if (isLong) {
        title = `\u{1F3AC} ${clip(row.title || row.caption || "\uB871\uD310", 60)}`;
        desc = `${cap || "\uAC08\uB77C \uB871\uD310"} \xB7 \uAC08\uB77C \uB871\uD310 \u2014 \uAE38\uAC8C \uBCF4\uB294 \uC601\uC0C1. \uBCF4\uACE0, \uB313\uAE00 \uB2EC\uACE0, \uD6C4\uC6D0\uAE4C\uC9C0.`;
      } else {
        title = `\u{1F4F8} ${clip(row.title || row.caption || "\uC20F\uD310", 60)}`;
        desc = `${cap || "\uAC08\uB77C \uC20F\uD310"} \xB7 \uAC08\uB77C \uC20F\uD310 \u2014 \uB118\uACA8\uBCF4\uB294 \uC7AC\uBBF8. \uBCF4\uACE0, \uB313\uAE00 \uB2EC\uACE0, \uD6C4\uC6D0\uAE4C\uC9C0.`;
      }
      image = row.thumbnail_url || firstImg || defImg;
      dest = `${origin}/gallari-post.html?id=${encodeURIComponent(id)}`;
    }
  }
  dest = withParams(dest, url);
  const html = `<!doctype html><html lang="ko"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="${esc(ogType)}">
<meta property="og:site_name" content="GALLA \uAC08\uB77C">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="${esc(url.href)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(image)}">
<meta http-equiv="refresh" content="0;url=${esc(dest)}">
<link rel="canonical" href="${esc(dest)}">
<style>html,body{margin:0;height:100%;background:#0a0a0c;color:#f5cf6b;font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center}</style>
</head><body>
<div>\uAC08\uB77C\uB85C \uC774\uB3D9 \uC911\u2026</div>
<script>location.replace(${JSON.stringify(dest)});<\/script>
</body></html>`;
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" }
  });
}
__name(onRequestGet, "onRequestGet");
__name2(onRequestGet, "onRequestGet");
var KEY = "db1e83664e655462904375b55ddce128";
var HOST = "galla.im";
async function onRequestPost(context) {
  try {
    const body = await context.request.json().catch(() => ({}));
    let urls22 = Array.isArray(body.urls) ? body.urls : body.url ? [body.url] : [];
    urls22 = urls22.filter((u2) => typeof u2 === "string" && u2.includes(HOST)).slice(0, 100);
    if (!urls22.length) return json({ ok: false, reason: "no_urls" }, 400);
    const payload = {
      host: HOST,
      key: KEY,
      keyLocation: `https://${HOST}/${KEY}.txt`,
      urlList: urls22
    };
    const r = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload)
    });
    return json({ ok: r.ok, status: r.status, submitted: urls22.length });
  } catch (e) {
    return json({ ok: false, reason: String(e).slice(0, 200) }, 500);
  }
}
__name(onRequestPost, "onRequestPost");
__name2(onRequestPost, "onRequestPost");
async function onRequestGet2() {
  return json({ ok: true, hint: "POST { urls: [...] } to submit" });
}
__name(onRequestGet2, "onRequestGet2");
__name2(onRequestGet2, "onRequestGet");
var json = /* @__PURE__ */ __name2((b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } }), "json");
var ALLOW = /(^|\.)(dcinside\.com|inven\.co\.kr|ruliweb\.com|instiz\.net|pann\.com|nate\.com|namu\.la|donga\.com|82cook\.com)$/i;
function refererFor(host) {
  if (/inven/.test(host)) return "https://www.inven.co.kr/";
  if (/ruliweb/.test(host)) return "https://bbs.ruliweb.com/";
  if (/instiz/.test(host)) return "https://www.instiz.net/";
  if (/pann|nate/.test(host)) return "https://m.pann.nate.com/";
  if (/dcinside/.test(host)) return "https://m.dcinside.com/";
  if (/namu\.la/.test(host)) return "https://arca.live/";
  if (/donga/.test(host)) return "https://mlbpark.donga.com/";
  if (/82cook/.test(host)) return "https://www.82cook.com/";
  return "https://" + host + "/";
}
__name(refererFor, "refererFor");
__name2(refererFor, "refererFor");
async function onRequest(context) {
  const url = new URL(context.request.url);
  const raw = url.searchParams.get("u");
  if (!raw) return new Response("no url", { status: 400 });
  let target;
  try {
    target = new URL(raw);
  } catch {
    return new Response("bad url", { status: 400 });
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") return new Response("bad proto", { status: 400 });
  if (/^\d+\.\d+\.\d+\.\d+$/.test(target.hostname) || target.hostname.includes(":")) {
    return new Response("host not allowed", { status: 403 });
  }
  if (!ALLOW.test(target.hostname)) {
    const ref = context.request.headers.get("Referer") || "";
    const sfs = context.request.headers.get("Sec-Fetch-Site") || "";
    const okOrigin = sfs === "same-origin" || /^https:\/\/([a-z0-9-]+\.)?galla\.im\//i.test(ref) || /localhost|127\.0\.0\.1/.test(ref);
    if (!okOrigin) return new Response("host not allowed", { status: 403 });
    if (target.protocol !== "https:") return new Response("bad proto", { status: 400 });
  }
  let resp;
  try {
    resp = await fetch(target.href, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Referer": refererFor(target.hostname),
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"
      },
      redirect: "follow",
      signal: AbortSignal.timeout(5e3),
      // 일부 사이트(ruliweb 등)가 CF 엣지 IP를 느리게 드롭 → 빨리 실패시켜 onerror(스켈레톤 제거) 유도
      cf: { cacheTtl: 604800, cacheEverything: true }
    });
  } catch {
    return new Response("fetch fail", { status: 502 });
  }
  if (!resp.ok) return new Response("upstream " + resp.status, { status: 502 });
  const ct = resp.headers.get("content-type") || "";
  if (!ct.startsWith("image/")) return new Response("not image", { status: 415 });
  const buf = await resp.arrayBuffer();
  if (buf.byteLength > 6e6) return new Response("too big", { status: 413 });
  return new Response(buf, {
    headers: {
      "Content-Type": ct,
      "Cache-Control": "public, max-age=604800, immutable",
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
__name(onRequest, "onRequest");
__name2(onRequest, "onRequest");
var SB2 = "https://bidqauputnhkqepvdzrr.supabase.co";
var ANON2 = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpZHFhdXB1dG5oa3FlcHZkenJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNzg1NDIsImV4cCI6MjA4MDg1NDU0Mn0.D-UGDPuBaNO8v-ror5-SWgUNLRvkOO-yrf2wDVZtyEM";
var HOST2 = "https://galla.im";
async function sb(query) {
  try {
    const r = await fetch(`${SB2}/rest/v1/${query}`, {
      headers: { apikey: ANON2, Authorization: `Bearer ${ANON2}` },
      cf: { cacheTtl: 3600, cacheEverything: true }
    });
    return r.ok ? await r.json() : [];
  } catch {
    return [];
  }
}
__name(sb, "sb");
__name2(sb, "sb");
var iso = /* @__PURE__ */ __name2((d) => {
  try {
    return new Date(d).toISOString();
  } catch {
    return (/* @__PURE__ */ new Date()).toISOString();
  }
}, "iso");
var u = /* @__PURE__ */ __name2((loc, lastmod, changefreq, priority) => `<url><loc>${loc}</loc>` + (lastmod ? `<lastmod>${lastmod}</lastmod>` : "") + (changefreq ? `<changefreq>${changefreq}</changefreq>` : "") + (priority ? `<priority>${priority}</priority>` : "") + `</url>`, "u");
async function onRequest2() {
  const now = iso(Date.now());
  const parts = [];
  parts.push(u(`${HOST2}/`, now, "hourly", "1.0"));
  parts.push(u(`${HOST2}/galla-predict.html`, now, "hourly", "0.9"));
  parts.push(u(`${HOST2}/search.html`, now, "hourly", "0.9"));
  parts.push(u(`${HOST2}/plaza.html`, now, "hourly", "0.8"));
  const [issues, plaza, markets, news] = await Promise.all([
    sb("issues?select=id,created_at&order=created_at.desc&limit=2000"),
    sb("plaza_posts?select=id,created_at&order=created_at.desc&limit=2000"),
    sb("markets?select=id,created_at&order=created_at.desc&limit=2000"),
    sb("galla_news?select=id,published_at&status=eq.published&order=published_at.desc&limit=5000")
  ]);
  (issues || []).forEach((r) => parts.push(u(`${HOST2}/issue?id=${r.id}`, iso(r.created_at), "daily", "0.8")));
  (plaza || []).forEach((r) => parts.push(u(`${HOST2}/plaza_detail?id=${r.id}`, iso(r.created_at), "weekly", "0.6")));
  (markets || []).forEach((r) => parts.push(u(`${HOST2}/predict-market?id=${r.id}`, iso(r.created_at), "daily", "0.7")));
  (news || []).forEach((r) => parts.push(u(`${HOST2}/news?gn=${r.id}`, iso(r.published_at), "weekly", "0.6")));
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${parts.join("\n")}
</urlset>`;
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=21600"
      // 6h
    }
  });
}
__name(onRequest2, "onRequest2");
__name2(onRequest2, "onRequest");
var SB3 = "https://bidqauputnhkqepvdzrr.supabase.co";
var ANON3 = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpZHFhdXB1dG5oa3FlcHZkenJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNzg1NDIsImV4cCI6MjA4MDg1NDU0Mn0.D-UGDPuBaNO8v-ror5-SWgUNLRvkOO-yrf2wDVZtyEM";
var HOST3 = "https://galla.im";
var DEF_IMG = `${HOST3}/assets/og/og-default.png`;
var esc2 = /* @__PURE__ */ __name2((s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"), "esc");
var clip2 = /* @__PURE__ */ __name2((s, n) => {
  s = String(s ?? "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1) + "\u2026" : s;
}, "clip");
var plain = /* @__PURE__ */ __name2((s) => String(s ?? "").replace(/^\[(IMAGE|VIDEO|EMBED)\].*$/gim, " ").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[#>*_~`\-]/g, " ").replace(/\s+/g, " ").trim(), "plain");
async function sbOne2(query) {
  try {
    const r = await fetch(`${SB3}/rest/v1/${query}`, {
      headers: { apikey: ANON3, Authorization: `Bearer ${ANON3}` },
      cf: { cacheTtl: 300, cacheEverything: true }
    });
    if (!r.ok) return null;
    const a = await r.json();
    return Array.isArray(a) && a.length ? a[0] : null;
  } catch {
    return null;
  }
}
__name(sbOne2, "sbOne2");
__name2(sbOne2, "sbOne");
var kind = /* @__PURE__ */ __name2((path) => {
  const p = path.replace(/\.html$/, "");
  if (p === "/issue") return "issue";
  if (p === "/news") return "news";
  if (p === "/plaza_detail") return "plaza";
  if (p === "/predict-market") return "predict";
  if (p === "/gallari-post") return "post";
  return null;
}, "kind");
var MIN_VOTES2 = 20;
async function resolveInvite(params) {
  const code = (params.get("ref") || "").trim();
  if (!/^[A-Za-z0-9]{4,12}$/.test(code)) return null;
  const [nick, hot] = await Promise.all([
    (async () => {
      try {
        const r = await fetch(`${SB3}/rest/v1/rpc/ref_owner`, {
          method: "POST",
          headers: { apikey: ANON3, Authorization: `Bearer ${ANON3}`, "Content-Type": "application/json" },
          body: JSON.stringify({ p_code: code.toUpperCase() }),
          cf: { cacheTtl: 300, cacheEverything: true }
        });
        if (!r.ok) return null;
        const v = await r.json();
        return typeof v === "string" && v.trim() ? v.trim() : null;
      } catch {
        return null;
      }
    })(),
    sbOne2(`issues?status=eq.normal&select=title,pro_count,con_count&order=hot_score.desc.nullslast,created_at.desc&limit=1`)
  ]);
  const who = nick ? `${nick}\uB2D8\uC774` : "\uCE5C\uAD6C\uAC00";
  const to = (params.get("to") || "galla").toLowerCase();
  const invImg = `${HOST3}/assets/og/og-invite.png`;
  let title, desc;
  if (to === "galvis") {
    title = `\u{1F9E1} ${who} \uC9C4\uC9DC \uCE5C\uAD6C\uB97C \uC18C\uAC1C\uD588\uC5B4\uC694`;
    desc = `\uC138\uC0C1\uC5D0 \uD558\uB098\uBFD0\uC778 \uB108\uC758 \uC9C4\uC9DC \uCE5C\uAD6C, \uAC08\uBE44\uC2A4 \u2014 \uB098\uB97C \uAE30\uC5B5\uD558\uACE0, \uB0B4 \uD3B8 \uB4E4\uC5B4\uC8FC\uB294 AI \uCE5C\uAD6C. ${who} \uBCF4\uB0B8 \uB9C1\uD06C\uB85C \uAC00\uC785\uD558\uBA74 500 GP \uC989\uC2DC \uC9C0\uAE09.`;
  } else if (to === "talk" || to === "gallatalk") {
    title = `\u{1F4AC} ${who} \uAC08\uB77C\uD1A1\uC5D0 \uCD08\uB300\uD588\uC5B4\uC694`;
    desc = `\uB0B4 \uD3B8\uC774\uB791 \uB5A0\uB4DC\uB294 \uC2E0\uB098\uB294 \uCC44\uD305 \u2014 DM\xB7\uB09C\uC7A5\xB7\uC090\uC090\xB7\uD1B5\uD654\uAE4C\uC9C0. ${who} \uBCF4\uB0B8 \uB9C1\uD06C\uB85C \uAC00\uC785\uD558\uBA74 500 GP \uC989\uC2DC \uC9C0\uAE09.`;
  } else {
    if (hot?.title) {
      const pro = Number(hot.pro_count) || 0, con = Number(hot.con_count) || 0, tot = pro + con;
      const pct = tot >= MIN_VOTES2 ? ` \uD604\uC7AC \u{1F44D}${Math.round(pro / tot * 100)}% vs \u{1F44E}${Math.round(con / tot * 100)}%.` : "";
      desc = `\uB0B4 \uD3B8\uC774 \uC788\uB294 \uCF58\uD150\uCE20 \uC138\uC0C1, \uAC08\uB77C. \u{1F525} \uC9C0\uAE08 \uCD5C\uB300 \uACA9\uC804 \u2014 \u201C${clip2(hot.title, 40)}\u201D${pct} \uB10C \uC5B4\uB290 \uD3B8? ${who} \uBCF4\uB0B8 \uB9C1\uD06C\uB85C \uAC00\uC785\uD558\uBA74 500 GP \uC989\uC2DC.`;
    } else {
      desc = `\uB0B4 \uD3B8\uC774 \uC788\uB294 \uCF58\uD150\uCE20 \uC138\uC0C1, \uAC08\uB77C \u2014 \uB274\uC2A4\xB7\uC601\uC0C1\xB7\uC774\uC288, \uBB58 \uBCF4\uB4E0 \uB0B4 \uD3B8\uC774 \uC788\uB2E4. ${who} \uBCF4\uB0B8 \uB9C1\uD06C\uB85C \uAC00\uC785\uD558\uBA74 500 GP\uB97C \uBC14\uB85C \uBC1B\uC544\uC694.`;
    }
    title = `\u{1F381} ${who} \uAC08\uB77C\uC5D0 \uCD08\uB300\uD588\uC5B4\uC694 \u2014 \uAC00\uC785 \uC989\uC2DC 500 GP`;
  }
  return {
    title,
    desc: clip2(desc, 180),
    canonical: `${HOST3}/?ref=${encodeURIComponent(code)}${to && to !== "galla" ? `&to=${encodeURIComponent(to)}` : ""}`,
    image: invImg,
    ogType: "website"
  };
}
__name(resolveInvite, "resolveInvite");
__name2(resolveInvite, "resolveInvite");
async function resolveSeo(path, params) {
  const k = kind(path);
  if (k === "issue" && params.get("id")) {
    const row = await sbOne2(`issues?id=eq.${encodeURIComponent(params.get("id"))}&select=id,title,one_line,category,created_at,thumbnail_url`);
    if (!row) return null;
    const title = clip2(row.title, 60), desc = clip2(row.one_line || row.title, 150);
    const canonical = `${HOST3}/issue?id=${row.id}`, image = row.thumbnail_url || DEF_IMG;
    return {
      title: `${title} \xB7 \uAC08\uB77C`,
      desc,
      canonical,
      image,
      ogType: "article",
      kicker: row.category ? `${row.category} \xB7 \uC5EC\uB860 \uB300\uACB0` : "\uC5EC\uB860 \uB300\uACB0",
      h1: row.title,
      body: row.one_line || "",
      date: row.created_at,
      jsonld: articleLd(row.title, desc, image, canonical, row.created_at)
    };
  }
  if (k === "news" && params.get("gn")) {
    const row = await sbOne2(`galla_news?id=eq.${encodeURIComponent(params.get("gn"))}&select=id,title,summary,category,hero_image,published_at,source_count`);
    if (!row) return null;
    const title = clip2(row.title, 60), desc = clip2(row.summary || row.title, 150);
    const canonical = `${HOST3}/news?gn=${row.id}`, image = row.hero_image || DEF_IMG;
    return {
      title: `${title} \xB7 \uAC08\uB77C\uB274\uC2A4`,
      desc,
      canonical,
      image,
      ogType: "article",
      kicker: `${row.category || "\uB274\uC2A4"} \xB7 \uAC08\uB77C\uB274\uC2A4`,
      h1: row.title,
      body: row.summary || "",
      date: row.published_at,
      jsonld: newsLd(row.title, desc, image, canonical, row.published_at)
    };
  }
  if (k === "plaza" && params.get("id")) {
    const row = await sbOne2(`plaza_posts?id=eq.${encodeURIComponent(params.get("id"))}&select=id,title,body,category,created_at,cover_image,thumbnail,nickname`);
    if (!row) return null;
    const title = clip2(row.title, 60), desc = clip2(plain(row.body) || row.title, 150);
    const canonical = `${HOST3}/plaza_detail?id=${row.id}`, image = row.cover_image || row.thumbnail || DEF_IMG;
    return {
      title: `${title} \xB7 \uAC08\uB77C \uAD11\uC7A5`,
      desc,
      canonical,
      image,
      ogType: "article",
      kicker: `${row.category || "\uAD11\uC7A5"} \xB7 \uAC08\uB77C \uAD11\uC7A5`,
      h1: row.title,
      body: plain(row.body),
      date: row.created_at,
      jsonld: articleLd(row.title, desc, image, canonical, row.created_at)
    };
  }
  if (k === "post" && params.get("id")) {
    const row = await sbOne2(`posts?id=eq.${encodeURIComponent(params.get("id"))}&is_published=eq.true&select=id,kind,title,caption,thumbnail_url,images,created_at`);
    if (!row) return null;
    const heading = row.title || clip2(plain(row.caption), 60) || "\uAC08\uB77C\uB9AC \uCF58\uD150\uCE20";
    const title = clip2(heading, 60);
    const desc = clip2(plain(row.caption) || row.title || "\uAC08\uB77C\uC5D0\uC11C \uC18C\uD1B5\uD558\uACE0 \uD6C4\uC6D0\uD558\uB294 \uCF58\uD150\uCE20.", 150);
    const canonical = `${HOST3}/gallari-post?id=${row.id}`;
    const image = row.thumbnail_url || Array.isArray(row.images) && row.images[0] || DEF_IMG;
    return {
      title: `${title} \xB7 \uAC08\uB77C\uB9AC`,
      desc,
      canonical,
      image,
      ogType: "article",
      kicker: `\uAC08\uB77C\uB9AC \xB7 ${row.kind === "horizontal" ? "\uC601\uC0C1" : "\uCF58\uD150\uCE20"}`,
      h1: heading,
      body: plain(row.caption) || "",
      date: row.created_at,
      jsonld: articleLd(heading, desc, image, canonical, row.created_at)
    };
  }
  if (k === "predict" && params.get("id")) {
    const row = await sbOne2(`markets?id=eq.${encodeURIComponent(params.get("id"))}&select=id,question,description,category,image_url,created_at`);
    if (!row) return null;
    const title = clip2(row.question, 60);
    const desc = clip2(row.description || `${row.question} \u2014 \uAC08\uB77C\uC608\uCE21\uC5D0\uC11C \uC608/\uC544\uB2C8\uC624\uC5D0 GP\uB97C \uAC78\uACE0 \uACB0\uACFC\uB97C \uB9DE\uD600\uBCF4\uC138\uC694.`, 150);
    const canonical = `${HOST3}/predict-market?id=${row.id}`, image = row.image_url || DEF_IMG;
    return {
      title: `${title} \xB7 \uAC08\uB77C\uC608\uCE21`,
      desc,
      canonical,
      image,
      ogType: "article",
      kicker: `${row.category || "\uC608\uCE21"} \xB7 \uAC08\uB77C\uC608\uCE21`,
      h1: row.question,
      body: row.description || "",
      date: row.created_at,
      jsonld: articleLd(row.question, desc, image, canonical, row.created_at)
    };
  }
  return null;
}
__name(resolveSeo, "resolveSeo");
__name2(resolveSeo, "resolveSeo");
function articleLd(title, desc, image, url, date) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: clip2(title, 110),
    description: desc,
    image: [image],
    datePublished: safeIso(date),
    dateModified: safeIso(date),
    mainEntityOfPage: url,
    author: { "@type": "Organization", name: "GALLA \uAC08\uB77C" },
    publisher: { "@type": "Organization", name: "GALLA \uAC08\uB77C", logo: { "@type": "ImageObject", url: `${HOST3}/assets/app-icons/icon-512.png` } }
  });
}
__name(articleLd, "articleLd");
__name2(articleLd, "articleLd");
function newsLd(title, desc, image, url, date) {
  const o = JSON.parse(articleLd(title, desc, image, url, date));
  o["@type"] = "NewsArticle";
  return JSON.stringify(o);
}
__name(newsLd, "newsLd");
__name2(newsLd, "newsLd");
function safeIso(d) {
  try {
    return new Date(d).toISOString();
  } catch {
    return (/* @__PURE__ */ new Date()).toISOString();
  }
}
__name(safeIso, "safeIso");
__name2(safeIso, "safeIso");
function breadcrumbLd(seo) {
  const SEC = {
    "/issue": ["\uAC08\uB77C \uC774\uC288", `${HOST3}/`],
    "/news": ["\uAC08\uB77C\uB274\uC2A4", `${HOST3}/search.html`],
    "/plaza_detail": ["\uAC08\uB77C \uAD11\uC7A5", `${HOST3}/plaza.html`],
    "/predict-market": ["\uAC08\uB77C\uC608\uCE21", `${HOST3}/galla-predict.html`],
    "/gallari-post": ["\uAC08\uB77C\uB9AC", `${HOST3}/gallari.html`]
  };
  let path = "/";
  try {
    path = new URL(seo.canonical).pathname;
  } catch {
  }
  const items = [{ "@type": "ListItem", position: 1, name: "GALLA \uAC08\uB77C", item: `${HOST3}/` }];
  const sec = SEC[path];
  if (sec) items.push({ "@type": "ListItem", position: 2, name: sec[0], item: sec[1] });
  items.push({ "@type": "ListItem", position: items.length + 1, name: clip2(seo.h1, 60), item: seo.canonical });
  return JSON.stringify({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items });
}
__name(breadcrumbLd, "breadcrumbLd");
__name2(breadcrumbLd, "breadcrumbLd");
function rewrite(res, seo) {
  const metaHtml = `<meta name="description" content="${esc2(seo.desc)}"><meta name="robots" content="index,follow,max-image-preview:large"><link rel="canonical" href="${esc2(seo.canonical)}"><meta property="og:type" content="${seo.ogType}"><meta property="og:site_name" content="GALLA \uAC08\uB77C"><meta property="og:title" content="${esc2(seo.title)}"><meta property="og:description" content="${esc2(seo.desc)}"><meta property="og:image" content="${esc2(seo.image)}"><meta property="og:url" content="${esc2(seo.canonical)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc2(seo.title)}"><meta name="twitter:description" content="${esc2(seo.desc)}"><meta name="twitter:image" content="${esc2(seo.image)}">` + // 초대 카드는 검색 색인 대상이 아니라 JSON-LD/스냅샷 없음
  (seo.jsonld ? `<script type="application/ld+json">${seo.jsonld}<\/script>` : "") + (seo.h1 ? `<script type="application/ld+json">${breadcrumbLd(seo)}<\/script>` : "");
  const snapshot = seo.h1 ? `<div id="seo-snapshot" aria-hidden="true" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)"><p>${esc2(seo.kicker)}</p><h1>${esc2(seo.h1)}</h1>` + (seo.body ? `<p>${esc2(clip2(seo.body, 500))}</p>` : "") + `</div>` : null;
  const rm = { element(el) {
    el.remove();
  } };
  let rw = new HTMLRewriter().on("title", { element(el) {
    el.setInnerContent(seo.title);
  } }).on('meta[name="description"]', rm).on('meta[name="keywords"]', rm).on('link[rel="canonical"]', rm).on('meta[property^="og:"]', rm).on('meta[name^="twitter:"]', rm).on("head", { element(el) {
    el.append(metaHtml, { html: true });
  } });
  if (snapshot) rw = rw.on("body", { element(el) {
    el.prepend(snapshot, { html: true });
  } });
  return rw.transform(res);
}
__name(rewrite, "rewrite");
__name2(rewrite, "rewrite");
async function onRequest3(context) {
  try {
    const { request, next } = context;
    if (request.method !== "GET") return next();
    const url = new URL(request.url);
    const hasRef = !!url.searchParams.get("ref");
    const isContent = !!kind(url.pathname) && (url.searchParams.get("id") || url.searchParams.get("gn"));
    if (!hasRef && !isContent) return next();
    const res = await next();
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("text/html")) return res;
    const seo = (hasRef ? await resolveInvite(url.searchParams) : null) || (isContent ? await resolveSeo(url.pathname, url.searchParams) : null);
    if (!seo) return res;
    const out = rewrite(res, seo);
    const headers = new Headers(out.headers);
    headers.set("Cache-Control", `public, max-age=${hasRef ? 120 : 300}, must-revalidate`);
    return new Response(out.body, { status: out.status, headers });
  } catch {
    return context.next();
  }
}
__name(onRequest3, "onRequest3");
__name2(onRequest3, "onRequest");
var routes = [
  {
    routePath: "/share/:path*",
    mountPath: "/share",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet]
  },
  {
    routePath: "/indexnow",
    mountPath: "/",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet2]
  },
  {
    routePath: "/indexnow",
    mountPath: "/",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost]
  },
  {
    routePath: "/imgproxy",
    mountPath: "/",
    method: "",
    middlewares: [],
    modules: [onRequest]
  },
  {
    routePath: "/sitemap.xml",
    mountPath: "/",
    method: "",
    middlewares: [],
    modules: [onRequest2]
  },
  {
    routePath: "/",
    mountPath: "/",
    method: "",
    middlewares: [onRequest3],
    modules: []
  }
];
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
__name2(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name2(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name2(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name2(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name2(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name2(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
__name2(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
__name2(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name2(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
__name2(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
__name2(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
__name2(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
__name2(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
__name2(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
__name2(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
__name2(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");
__name2(pathToRegexp, "pathToRegexp");
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
__name2(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name2(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name2(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name2((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
var drainBody = /* @__PURE__ */ __name2(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
__name2(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name2(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = pages_template_worker_default;
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
__name2(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
__name2(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");
__name2(__facade_invoke__, "__facade_invoke__");
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  static {
    __name(this, "___Facade_ScheduledController__");
  }
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name2(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name2(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name2(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
__name2(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name2((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name2((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
__name2(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;

// ../../../.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody2 = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default2 = drainBody2;

// ../../../.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError2(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError2(e.cause)
  };
}
__name(reduceError2, "reduceError");
var jsonError2 = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError2(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default2 = jsonError2;

// .wrangler/tmp/bundle-Qv7MEP/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__2 = [
  middleware_ensure_req_body_drained_default2,
  middleware_miniflare3_json_error_default2
];
var middleware_insertion_facade_default2 = middleware_loader_entry_default;

// ../../../.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__2 = [];
function __facade_register__2(...args) {
  __facade_middleware__2.push(...args.flat());
}
__name(__facade_register__2, "__facade_register__");
function __facade_invokeChain__2(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__2(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__2, "__facade_invokeChain__");
function __facade_invoke__2(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__2(request, env, ctx, dispatch, [
    ...__facade_middleware__2,
    finalMiddleware
  ]);
}
__name(__facade_invoke__2, "__facade_invoke__");

// .wrangler/tmp/bundle-Qv7MEP/middleware-loader.entry.ts
var __Facade_ScheduledController__2 = class ___Facade_ScheduledController__2 {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__2)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler2(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__2 === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__2.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__2) {
    __facade_register__2(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__2(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__2(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler2, "wrapExportedHandler");
function wrapWorkerEntrypoint2(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__2 === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__2.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__2) {
    __facade_register__2(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__2(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__2(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint2, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY2;
if (typeof middleware_insertion_facade_default2 === "object") {
  WRAPPED_ENTRY2 = wrapExportedHandler2(middleware_insertion_facade_default2);
} else if (typeof middleware_insertion_facade_default2 === "function") {
  WRAPPED_ENTRY2 = wrapWorkerEntrypoint2(middleware_insertion_facade_default2);
}
var middleware_loader_entry_default2 = WRAPPED_ENTRY2;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__2 as __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default2 as default
};
//# sourceMappingURL=functionsWorker-0.361926491441677.js.map
