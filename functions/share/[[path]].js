/**
 * GALLA 공유 카드 엣지 렌더 (Cloudflare Pages Function)
 *  /share/issue/<id>            → 이슈 (진영 전투)
 *  /share/predict/<id>          → 갈라예측 마켓
 *  /share/plaza/<id>            → 광장 글
 *  /share/post/<id>             → 갈라리 숏판/롱판/사진
 *  /share/video/<id>            → 핫튜브 영상 (유튜브로 안 흘리고 갈라 랜딩으로 붙잡음)
 *  /share/news/<id>             → 갈라뉴스 (AI 3줄 요약)
 *  /share/comment/<scope>/<id>  → 댓글·대댓글 인용 카드 (scope=issue|news|market|plaza|post|video)
 *  /share/trend                 → 지금 갈라 실시간 트렌드 TOP (랜딩)
 *  /share/room/<id>             → 육성 난장 입장 초대 (랜딩)
 *  /share/u/<id>                → 말 걸기(오픈프로필) — 1:1 DM 초대 (랜딩)
 *
 * 크롤러(카톡/페북/트위터)는 OG 태그를 읽고, 사람은 실제 페이지/랜딩으로 이동.
 * ⚠️ 공유 링크의 ?ref=초대코드는 리다이렉트 목적지까지 반드시 넘겨 초대 크레딧이 유실되지 않게 한다.
 */
const SB = "https://bidqauputnhkqepvdzrr.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpZHFhdXB1dG5oa3FlcHZkenJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNzg1NDIsImV4cCI6MjA4MDg1NDU0Mn0.D-UGDPuBaNO8v-ror5-SWgUNLRvkOO-yrf2wDVZtyEM";
const MIN_VOTES = 20; // 찬반 %는 이 이상일 때만 노출(작은 수치=죽은 서비스로 보임)

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clip = (s, n) => { s = String(s ?? "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const short = (n) => {
  n = Number(n) || 0;
  if (n >= 100000000) return (n / 100000000).toFixed(1).replace(/\.0$/, "") + "억";
  if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, "") + "만";
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "천";
  return String(n);
};

async function sbOne(query) {
  try {
    const r = await fetch(`${SB}/rest/v1/${query}`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
    if (!r.ok) return null;
    const a = await r.json();
    return Array.isArray(a) && a.length ? a[0] : null;
  } catch { return null; }
}
async function sbAll(query) {
  try {
    const r = await fetch(`${SB}/rest/v1/${query}`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
    if (!r.ok) return [];
    const a = await r.json();
    return Array.isArray(a) ? a : [];
  } catch { return []; }
}

// 초대코드·utm 을 목적지 URL로 전달(리다이렉트/CTA 모두) — 바이럴 크레딧 유실 방지
function withParams(dest, url) {
  const keep = ["ref", "utm_source", "utm_medium", "utm_campaign"];
  const sp = new URLSearchParams();
  for (const k of keep) { const v = url.searchParams.get(k); if (v) sp.set(k, v); }
  const q = sp.toString();
  if (!q) return dest;
  return dest + (dest.includes("?") ? "&" : "?") + q;
}

/* ── 공통 브랜드 랜딩(트렌드/난장/말걸기/댓글 재사용) ──────────────
   OG 카드로 후킹 + 실제 화면에서 바로 맛보이고 그 자리에서 가입 유도. */
function landingPage({ url, origin, badge, ogTitle, ogDesc, ogImage, ogType = "article",
  heading, sub, bodyHtml = "", ctaText, ctaHref, subText = "갈라 둘러보기", subHref }) {
  subHref = subHref || withParams(`${origin}/index.html`, url);
  const html = `<!doctype html><html lang="ko"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(ogTitle)} · GALLA</title>
<meta name="description" content="${esc(ogDesc)}">
<meta property="og:type" content="${esc(ogType)}">
<meta property="og:site_name" content="GALLA 갈라">
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
  /* 트렌드 랭킹 */
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
  <div class="bar"><img class="brand" src="${origin}/assets/brand/wordmark-white.png" alt="GALLA"><span>${esc(badge || "갈라")}</span></div>
  <div class="hero"><h1>${esc(heading)}</h1>${sub ? `<p>${esc(sub)}</p>` : ""}</div>
  ${bodyHtml ? `<div class="body">${bodyHtml}</div>` : ""}
  <div class="cta">
    <a class="go" href="${esc(ctaHref)}">${esc(ctaText)} →</a>
    <a class="sub" href="${esc(subHref)}">${esc(subText)}</a>
  </div>
</div>
</body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=180" } });
}

/* ── 핫영상 공유 랜딩 — 유튜브로 튕기지 않고 갈라에서 바로 재생시키며 붙잡는다 ── */
function videoLanding({ origin, url, id, row, defImg }) {
  const title = clip(row.title, 70);
  const ch = clip(row.channel_title || "", 30);
  const image = row.thumbnail || defImg;
  const ogTitle = `🎬 ${title}`;
  const ogDesc = `지금 한국에서 가장 뜨거운 영상 · 조회 ${short(row.view_count)} — 갈라에서 보고, 한마디 남기고, 한 판까지.`;
  const dest = withParams(`${origin}/search.html?video=${encodeURIComponent(id)}`, url);
  const home = withParams(`${origin}/index.html`, url);

  const html = `<!doctype html><html lang="ko"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(ogTitle)} · GALLA</title>
<meta name="description" content="${esc(ogDesc)}">
<meta property="og:type" content="video.other">
<meta property="og:site_name" content="GALLA 갈라">
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
  <div class="bar"><b>GALLA</b><span>핫영상</span></div>
  <div class="stage">
    <iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0&playsinline=1"
      title="${esc(title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
  </div>
  <div class="info">
    <div class="t">${esc(title)}</div>
    <div class="m">${esc(ch)} · 조회 ${short(row.view_count)}</div>
  </div>
  <div class="hook">
    <h2>이 영상, 당신은 어느 편입니까?</h2>
    <p>갈라에선 그냥 보고 끝나지 않습니다. 좋아요를 누르고, 한마디 남기고, 갈라로 판을 키우세요. 지금 뜨는 영상 전부가 카테고리별로 정리돼 있습니다.</p>
  </div>
  <div class="cta">
    <a class="go" href="${esc(dest)}">갈라에서 이어보기</a>
    <a class="sub" href="${esc(home)}">갈라 둘러보기</a>
  </div>
</div>
</body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
}

/* ── 댓글·대댓글 인용 카드 ── */
const CMT = {
  issue:  { table: "comments",            fk: "issue_id",  content: "content", parent: "issues",      ptitle: "title",    dest: (o, id) => `${o}/issue.html?id=${id}`,           emoji: "🗯️", label: "이슈 댓글" },
  news:   { table: "galla_news_comments", fk: "news_id",   content: "content", parent: "galla_news",  ptitle: "title",    dest: (o, id) => `${o}/news.html?gn=${id}`,            emoji: "🗯️", label: "뉴스 댓글" },
  market: { table: "market_comments",     fk: "market_id", content: "content", parent: "markets",     ptitle: "question", dest: (o, id) => `${o}/predict-market.html?id=${id}`,  emoji: "🗯️", label: "예측 댓글" },
  plaza:  { table: "plaza_comments",      fk: "post_id",   content: "body",    parent: "plaza_posts", ptitle: "title",    dest: (o, id) => `${o}/plaza_detail.html?id=${id}`,    emoji: "🗯️", label: "광장 댓글" },
  post:   { table: "post_comments",       fk: "post_id",   content: "body",    parent: "posts",       ptitle: "title",    dest: (o, id) => `${o}/gallari-post.html?id=${id}`,    emoji: "🗯️", label: "숏판/롱판 댓글" },
  video:  { table: "video_comments",      fk: "video_id",  content: "body",    parent: "youtube_hot", ptitle: "title",    dest: (o, id) => `${o}/search.html?video=${id}`,       emoji: "🗯️", label: "영상 댓글" },
};

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const origin = url.origin;
  const seg = (context.params.path || []).filter(Boolean);
  const type = seg[0];
  const id = decodeURIComponent(seg[1] || "");
  const defImg = `${origin}/assets/og/og-default.png`;

  /* ===== 랜딩형(트렌드/난장/말걸기/댓글) — 별도 HTML ===== */

  // 🔥 지금 갈라 실시간 트렌드 TOP — 순위 랜딩
  if (type === "trend") {
    const rows = await sbAll(`issues?status=eq.normal&select=id,title,faction_a,faction_b,pro_count,con_count&order=hot_score.desc.nullslast,created_at.desc&limit=8`);
    const top = rows.slice(0, 3).map((r) => clip(r.title, 20)).filter(Boolean);
    const ogDesc = top.length
      ? `🔥 ${top.map((t, i) => `${i + 1}위 ${t}`).join(" · ")}… 지금 제일 뜨거운 갈라 트렌드 TOP. 넌 어느 편?`
      : "지금 갈라에서 제일 뜨거운 이슈 TOP — 진영을 정하고 참전하세요.";
    const rankHtml = `<div class="rank">` + rows.map((r, i) => {
      const a = clip(r.faction_a || "찬성", 6), b = clip(r.faction_b || "반대", 6);
      const href = withParams(`${origin}/issue.html?id=${encodeURIComponent(r.id)}`, url);
      return `<a class="ri" href="${esc(href)}"><span class="n">${i + 1}</span><span class="tt">${esc(clip(r.title, 44))}</span><span class="vs">${esc(a)} vs ${esc(b)}</span></a>`;
    }).join("") + `</div>`;
    return landingPage({
      url, origin, badge: "실시간 트렌드", ogTitle: "🔥 지금 갈라 실시간 트렌드", ogDesc, ogImage: defImg,
      heading: "지금 갈라에서 제일 뜨거운 판", sub: "오늘 터진 이슈에 진영을 정하고, 댓글로 한판 붙어보세요.",
      bodyHtml: rankHtml, ctaText: "갈라에서 참전하기", ctaHref: withParams(`${origin}/index.html`, url),
    });
  }

  // 🎙 육성 난장 입장 초대
  if (type === "room" && id) {
    const row = await sbOne(`open_rooms?id=eq.${encodeURIComponent(id)}&select=title,topic,is_live,kind`);
    const title = clip(row?.title || "육성 난장", 40);
    const topic = clip(row?.topic || "", 60);
    const liveTxt = row?.is_live ? "지금 생방 중" : "열린 방";
    const dest = withParams(`${origin}/dm.html?room=${encodeURIComponent(id)}`, url);
    return landingPage({
      url, origin, badge: "난장", ogTitle: `🎙 ${title}`,
      ogDesc: `${topic ? topic + " · " : ""}${liveTxt} 육성 난장 — 들어와서 같이 떠들자. 갈라 가입하면 바로 입장.`,
      ogImage: defImg, heading: `🎙 ${title}`, sub: topic || `${liveTxt} 육성 난장에 초대받았어요.`,
      ctaText: "난장 입장하기", ctaHref: dest,
    });
  }

  // 💬 말 걸기(오픈프로필) — 1:1 DM 초대
  if (type === "u" && id) {
    const row = await sbOne(`users?id=eq.${encodeURIComponent(id)}&select=nickname,avatar_url`);
    const nick = clip(row?.nickname || "갈라 친구", 20);
    const img = row?.avatar_url || defImg;
    const dest = withParams(`${origin}/dm.html?dm=${encodeURIComponent(id)}`, url);
    return landingPage({
      url, origin, badge: "말 걸기", ogTitle: `💬 ${nick}에게 말 걸기`,
      ogDesc: `갈라에서 ${nick}와 1:1 대화 시작 — 오픈프로필. 가입하고 바로 말 걸어봐.`,
      ogImage: img, heading: `💬 ${nick}에게 말 걸기`, sub: "갈라에서 1:1로 대화를 시작할 수 있어요. 가입하면 바로 연결돼요.",
      ctaText: `${nick}에게 말 걸기`, ctaHref: dest,
    });
  }

  // 🗯️ 댓글·대댓글 인용 카드  /share/comment/<scope>/<id>
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
          row.user_id ? sbOne(`users?id=eq.${encodeURIComponent(row.user_id)}&select=nickname`) : Promise.resolve(null),
        ]);
        const nick = clip(who?.nickname || "누군가", 16);
        const ptitle = clip(parent?.[cfg.ptitle] || "갈라", 34);
        const isReply = !!row.parent_id;
        const dest = withParams(cfg.dest(origin, encodeURIComponent(pid)), url) + `#c${encodeURIComponent(cid)}`;
        return landingPage({
          url, origin, badge: cfg.label,
          ogTitle: `🗯️ “${text}”`,
          ogDesc: `${nick}의 ${isReply ? "대댓글" : "한마디"} — “${ptitle}”에서 터졌다. 원판 보고 너도 한마디 ㄱㄱ.`,
          ogImage: defImg, heading: `🗯️ “${text}”`,
          sub: `— ${nick} · “${ptitle}”`,
          bodyHtml: `<div class="hook"><h2>이 ${isReply ? "대댓글" : "댓글"}, 그냥 넘길 거야?</h2><p>갈라는 댓글이 곧 전투입니다. 원판으로 가서 받아치거나 편들어 주세요. 지금 가입하면 500 GP도 덤.</p></div>`,
          ctaText: "원판 보러 가기", ctaHref: dest,
        });
      }
    }
    // 폴백 — 잘못된 scope/id
  }

  /* ===== OG 메타 + 리다이렉트형(이슈/예측/광장/포스트/뉴스/영상) ===== */

  let title = "GALLA · 여론이 에너지가 되는 곳";
  let desc = "찬성이냐 반대냐, 당신의 진영은? 지금 갈라에서 여론 전투에 참전하세요.";
  let image = defImg;
  let dest = `${origin}/index.html`;
  let ogType = "article";

  if (type === "issue" && id) {
    const row = await sbOne(`issues?id=eq.${encodeURIComponent(id)}&select=title,description,faction_a,faction_b,card_thumb_url,thumbnail_url,images,pro_count,con_count`);
    if (row) {
      const a = row.faction_a || "찬성", b = row.faction_b || "반대";
      const pro = Number(row.pro_count) || 0, con = Number(row.con_count) || 0, tot = pro + con;
      const pct = tot >= MIN_VOTES ? ` (현재 👍${Math.round((pro / tot) * 100)}% vs 👎${Math.round((con / tot) * 100)}%)` : "";
      title = `⚔️ ${clip(row.title, 60)}`;
      desc = `👍 ${a}  VS  👎 ${b}${pct} · 당신은 어느 편? 지금 참전하고 진영을 밝히세요.`;
      const firstImg = Array.isArray(row.images) && row.images.length ? row.images[0] : null;
      image = row.card_thumb_url || row.thumbnail_url || firstImg || defImg;
      dest = `${origin}/issue.html?id=${encodeURIComponent(id)}`;
    }
  } else if ((type === "predict" || type === "market") && id) {
    const row = await sbOne(`markets?id=eq.${encodeURIComponent(id)}&select=question,description,image_url`);
    if (row) {
      title = `🔮 ${clip(row.question, 60)}`;
      desc = `당신의 예측은? GP 걸고 겨루는 갈라예측 — 적중하면 잭팟. 지금 참여하고 예측왕에 도전하세요.`;
      image = row.image_url || defImg;
      dest = `${origin}/predict-market.html?id=${encodeURIComponent(id)}`;
    }
  } else if (type === "video" && id) {
    const row = await sbOne(`youtube_hot?video_id=eq.${encodeURIComponent(id)}&select=title,channel_title,thumbnail,view_count,is_short&limit=1`);
    if (row) return videoLanding({ origin, url, id, row, defImg });
  } else if (type === "news" && id) {
    // ⚠️ 기존 갭 수정: 갈라뉴스 전용 카드 + news.html?gn= 딥링크
    const row = await sbOne(`galla_news?id=eq.${encodeURIComponent(id)}&select=title,summary,hero_image,category`);
    if (row) {
      title = `📰 ${clip(row.title, 60)}`;
      desc = `${clip(row.summary || "", 90) || "여러 기사를 AI가 3줄로 정리한 갈라뉴스."} · 오늘 뭐 터졌는지 갈라뉴스에서 다 봐.`;
      image = row.hero_image || defImg;
      dest = `${origin}/news.html?gn=${encodeURIComponent(id)}`;
    }
  } else if (type === "plaza" && id) {
    const row = await sbOne(`plaza_posts?id=eq.${encodeURIComponent(id)}&select=title,body,thumbnail,cover_image`);
    if (row) {
      title = `💬 ${clip(row.title, 60)}`;
      desc = `${clip(row.body || "", 80) || "갈라 광장에서 지금 뜨거운 이야기"} · 한 줄 거들고 판을 키워보세요.`;
      image = row.thumbnail || row.cover_image || defImg;
      dest = `${origin}/plaza_detail.html?id=${encodeURIComponent(id)}`;
    }
  } else if (type === "post" && id) {
    const row = await sbOne(`posts?id=eq.${encodeURIComponent(id)}&is_published=eq.true&select=title,caption,thumbnail_url,images,kind`);
    if (row) {
      const firstImg = Array.isArray(row.images) && row.images.length ? row.images[0] : null;
      const isLong = row.kind === "horizontal";
      const cap = clip(row.caption || row.title || "", 80);
      // 숏판(세로·넘겨보기)과 롱판(가로 영상)을 받는 메시지부터 확실히 분리
      if (isLong) {
        title = `🎬 ${clip(row.title || row.caption || "롱판", 60)}`;
        desc = `${cap || "갈라 롱판"} · 갈라 롱판 — 길게 보는 영상. 보고, 댓글 달고, 후원까지.`;
      } else {
        title = `📸 ${clip(row.title || row.caption || "숏판", 60)}`;
        desc = `${cap || "갈라 숏판"} · 갈라 숏판 — 넘겨보는 재미. 보고, 댓글 달고, 후원까지.`;
      }
      image = row.thumbnail_url || firstImg || defImg;
      dest = `${origin}/gallari-post.html?id=${encodeURIComponent(id)}`;
    }
  }

  // 초대코드·utm 을 목적지까지 전달(바이럴 크레딧 유실 방지)
  dest = withParams(dest, url);

  const html = `<!doctype html><html lang="ko"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="${esc(ogType)}">
<meta property="og:site_name" content="GALLA 갈라">
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
<div>갈라로 이동 중…</div>
<script>location.replace(${JSON.stringify(dest)});</script>
</body></html>`;

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}
