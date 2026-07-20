/**
 * GALLA 공유 카드 엣지 렌더 (Cloudflare Pages Function)
 *  /share/issue/<id>    → 이슈
 *  /share/predict/<id>  → 갈라예측 마켓
 *  /share/plaza/<id>    → 광장 글
 *  /share/video/<id>    → 핫영상 (유튜브 링크로 안 보내고 갈라 랜딩으로 붙잡는다)
 * 크롤러(카톡/페북/트위터)는 OG 태그를 읽고, 사람은 실제 페이지로 이동.
 */
const SB = "https://bidqauputnhkqepvdzrr.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpZHFhdXB1dG5oa3FlcHZkenJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNzg1NDIsImV4cCI6MjA4MDg1NDU0Mn0.D-UGDPuBaNO8v-ror5-SWgUNLRvkOO-yrf2wDVZtyEM";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clip = (s, n) => { s = String(s ?? "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

async function sbOne(query) {
  try {
    const r = await fetch(`${SB}/rest/v1/${query}`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
    if (!r.ok) return null;
    const a = await r.json();
    return Array.isArray(a) && a.length ? a[0] : null;
  } catch { return null; }
}

/* ── 핫영상 공유 랜딩 ─────────────────────────────────────
   유튜브로 바로 튕겨 보내면 유저를 통째로 잃는다.
   갈라 화면에서 영상을 바로 재생시키고, 그 자리에서 갈라로 끌어들인다. */
function videoLanding({ origin, url, id, row, defImg }) {
  const short = (n) => {
    n = Number(n) || 0;
    if (n >= 100000000) return (n / 100000000).toFixed(1).replace(/\.0$/, "") + "억";
    if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, "") + "만";
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "천";
    return String(n);
  };
  const title = clip(row.title, 70);
  const ch = clip(row.channel_title || "", 30);
  const image = row.thumbnail || defImg;
  const ogTitle = `🎬 ${title}`;
  const ogDesc = `지금 한국에서 가장 뜨거운 영상 · 조회 ${short(row.view_count)} — 갈라에서 보고, 한마디 남기고, 갈라치기까지.`;
  // 앱으로 들어가면 핫영상 탭에서 이 영상이 바로 열린다
  const dest = `${origin}/search.html?video=${encodeURIComponent(id)}`;

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
  html,body{margin:0;background:#08080b;color:#fff;
    font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;
    -webkit-font-smoothing:antialiased}
  .wrap{max-width:480px;margin:0 auto;min-height:100dvh;display:flex;flex-direction:column}
  .bar{display:flex;align-items:center;gap:8px;padding:14px 16px}
  .bar b{font-size:17px;font-weight:900;letter-spacing:2px}
  .bar span{margin-left:auto;font-size:11px;color:#8a909c}
  .stage{position:relative;width:100%;aspect-ratio:16/9;background:#000;overflow:hidden}
  .stage iframe{width:100%;height:100%;border:0;display:block}
  .info{padding:16px}
  .t{font-size:17px;font-weight:800;line-height:1.35}
  .m{margin-top:6px;font-size:12px;color:#8a909c}
  .hook{margin:18px 16px 0;padding:16px;border-radius:16px;
    background:linear-gradient(135deg,rgba(255,77,103,.14),rgba(61,107,255,.14));
    border:1px solid rgba(255,255,255,.08)}
  .hook h2{margin:0;font-size:15px;font-weight:900;line-height:1.4}
  .hook p{margin:7px 0 0;font-size:12.5px;color:#aeb5c2;line-height:1.55}
  .cta{margin:auto 16px calc(20px + env(safe-area-inset-bottom));padding-top:20px;
    display:flex;flex-direction:column;gap:9px}
  .go{display:flex;align-items:center;justify-content:center;min-height:52px;
    border-radius:14px;background:#fff;color:#0a0a0c;
    font-size:15px;font-weight:900;text-decoration:none}
  .go:active{transform:scale(.98)}
  .sub{display:flex;align-items:center;justify-content:center;min-height:44px;
    border-radius:14px;background:rgba(255,255,255,.06);
    border:1px solid rgba(255,255,255,.1);color:#aeb5c2;
    font-size:12.5px;font-weight:700;text-decoration:none}
</style>
</head><body>
<div class="wrap">
  <div class="bar"><b>GALLA</b><span>핫영상</span></div>

  <div class="stage">
    <iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0&playsinline=1"
      title="${esc(title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowfullscreen></iframe>
  </div>

  <div class="info">
    <div class="t">${esc(title)}</div>
    <div class="m">${esc(ch)} · 조회 ${short(row.view_count)}</div>
  </div>

  <div class="hook">
    <h2>이 영상, 당신은 어느 편입니까?</h2>
    <p>갈라에선 그냥 보고 끝나지 않습니다. 좋아요를 누르고, 한마디 남기고, 갈라치기로 판을 키우세요. 지금 뜨는 영상 전부가 카테고리별로 정리돼 있습니다.</p>
  </div>

  <div class="cta">
    <a class="go" href="${esc(dest)}">갈라에서 이어보기 →</a>
    <a class="sub" href="${origin}/index.html">갈라 둘러보기</a>
  </div>
</div>
</body></html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const origin = url.origin;
  const seg = (context.params.path || []).filter(Boolean);
  const type = seg[0];
  const id = decodeURIComponent(seg[1] || "");
  const defImg = `${origin}/assets/og/og-default.png`;

  let title = "GALLA · 여론이 에너지가 되는 곳";
  let desc = "찬성이냐 반대냐, 당신의 진영은? 지금 갈라에서 여론 전투에 참전하세요.";
  let image = defImg;
  let dest = `${origin}/index.html`;

  if (type === "issue" && id) {
    const row = await sbOne(`issues?id=eq.${encodeURIComponent(id)}&select=title,description,faction_a,faction_b,card_thumb_url,thumbnail_url,images`);
    if (row) {
      const a = row.faction_a || "찬성", b = row.faction_b || "반대";
      title = `⚔️ ${clip(row.title, 60)}`;
      desc = `👍 ${a}  VS  👎 ${b} · ${clip(row.description || "지금 갈라에서 진영을 정하고 참전하세요.", 80)}`;
      const firstImg = Array.isArray(row.images) && row.images.length ? row.images[0] : null;
      image = row.card_thumb_url || row.thumbnail_url || firstImg || defImg;
      dest = `${origin}/issue.html?id=${encodeURIComponent(id)}`;
    }
  } else if ((type === "predict" || type === "market") && id) {
    const row = await sbOne(`markets?id=eq.${encodeURIComponent(id)}&select=question,description,image_url`);
    if (row) {
      title = `🔮 ${clip(row.question, 60)}`;
      desc = `당신의 예측은? 포인트로 겨루는 갈라예측 — 지금 참여하고 예측왕에 도전하세요.`;
      image = row.image_url || defImg;
      dest = `${origin}/predict-market.html?id=${encodeURIComponent(id)}`;
    }
  } else if (type === "video" && id) {
    const row = await sbOne(`youtube_hot?video_id=eq.${encodeURIComponent(id)}&select=title,channel_title,thumbnail,view_count,is_short&limit=1`);
    if (row) {
      // 유튜브로 흘려보내지 않고 갈라 랜딩에서 붙잡는다.
      return videoLanding({ origin, url, id, row, defImg });
    }
  } else if (type === "plaza" && id) {
    const row = await sbOne(`plaza_posts?id=eq.${encodeURIComponent(id)}&select=title,body,thumbnail,cover_image`);
    if (row) {
      title = `💬 ${clip(row.title, 60)}`;
      desc = clip(row.body || "갈라 광장에서 지금 뜨거운 이야기 — 한 줄 거들고 판을 키우세요.", 90);
      image = row.thumbnail || row.cover_image || defImg;
      dest = `${origin}/plaza_detail.html?id=${encodeURIComponent(id)}`;
    }
  }

  const html = `<!doctype html><html lang="ko"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="article">
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
    headers: {
      "content-type": "text/html; charset=utf-8",
      // 크롤러/사용자 모두 잠깐 캐시(콘텐츠 제목 바뀌어도 5분 내 갱신)
      "cache-control": "public, max-age=300",
    },
  });
}
