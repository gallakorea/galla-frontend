/**
 * GALLA 공유 카드 엣지 렌더 (Cloudflare Pages Function)
 *  /share/issue/<id>    → 이슈
 *  /share/predict/<id>  → 갈라예측 마켓
 *  /share/plaza/<id>    → 광장 글
 * 크롤러(카톡/페북/트위터)는 OG 태그를 읽고, 사람은 실제 페이지로 즉시 이동.
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
      desc = `당신의 예측은? 포인트로 겨루는 갈라예측 — 지금 베팅하고 예측왕에 도전하세요.`;
      image = row.image_url || defImg;
      dest = `${origin}/predict-market.html?id=${encodeURIComponent(id)}`;
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
