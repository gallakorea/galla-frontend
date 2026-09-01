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

// 여러 행 (목록용)
async function sbMany(query) {
  try {
    const r = await fetch(`${SB}/rest/v1/${query}`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
      cf: { cacheTtl: 600, cacheEverything: true },
    });
    if (!r.ok) return [];
    const a = await r.json();
    return Array.isArray(a) ? a : [];
  } catch { return []; }
}

/* ── 크롤 가능한 링크 그물 ────────────────────────────────────────────
   실측(2026-08-23): 홈의 <a href>는 11개(전부 정적·소셜), news/plaza/galla-predict/search
   목록 페이지는 <a href>가 **0개**였다. 목록이 전부 JS <button>이라 로봇 눈에는
   콘텐츠로 가는 길이 사이트맵 하나뿐 → 구글 "발견됨-색인 안 됨", JS 미실행인
   네이버 Yeti·다음 Daumoa는 아예 도달 불가. (네이버 색인 24/2120, 다음 0건)
   → 목록/상세 페이지 하단에 진짜 <a href> 블록을 엣지에서 깐다. 사람 눈에도 보이게(숨김
   텍스트는 구글이 가중치를 안 준다). 스타일은 인라인 — 페이지마다 CSS가 달라 의존하지 않는다. */
// 하단 고정 내비(56px+세이프에어리어)에 마지막 링크가 가리지 않도록 넉넉히 띄운다
const LINK_WRAP = "margin:22px auto 0;max-width:720px;padding:20px 16px calc(96px + env(safe-area-inset-bottom));border-top:1px solid #14171f";
const LINK_HEAD = "display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:0 0 4px";
const LINK_H = "margin:0;font-size:13px;color:#8b94a8;font-weight:700;letter-spacing:.2px";
const LINK_MORE = "font-size:12px;color:#5f6a80;text-decoration:none;white-space:nowrap";
const LINK_UL = "list-style:none;margin:0 0 20px;padding:0";
const LINK_LI = "border-bottom:1px solid #101318";
const LINK_A = "display:block;padding:10px 0;color:#9aa6bd;text-decoration:none;font-size:13px;line-height:1.45;white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
const CHIP_UL = "list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:8px";
const CHIP_A = "display:inline-block;padding:6px 12px;border:1px solid #1b1f2a;border-radius:999px;color:#7f8aa3;text-decoration:none;font-size:12px";

/* 링크 블록은 '섹션'처럼 보여야 한다. 민짜 링크를 수십 개 세로로 쌓으면
   사람 눈에 흉하고 구글엔 푸터 링크 스터핑으로 읽힌다. 크롤 효과는 링크가
   존재하고 도달 가능한 데서 나오지 개수에서 나오지 않으므로 개수는 적게 간다. */
function linkSection(heading, items, more) {
  const list = (items || []).filter((it) => it && it.href && it.text);
  if (!list.length) return "";
  return `<div style="${LINK_HEAD}"><h2 style="${LINK_H}">${esc(heading)}</h2>` +
    (more ? `<a href="${esc(more[0])}" style="${LINK_MORE}">${esc(more[1])} ›</a>` : "") + `</div>` +
    `<ul style="${LINK_UL}">` +
    list.map((it) => `<li style="${LINK_LI}"><a href="${esc(it.href)}" style="${LINK_A}">${esc(clip(it.text, 60))}</a></li>`).join("") +
    `</ul>`;
}
// 섹션 이동은 칩 줄이 아니라 아카이브 링크 한 줄로 — 상세 화면에 군더더기를 안 만든다
const hubHtml = () =>
  `<a href="/archive" style="${LINK_MORE}">갈라 전체 콘텐츠 보기 ›</a>`;

const wrapLinks = (inner) =>
  inner ? `<section class="seo-web" style="${LINK_WRAP}" aria-label="관련 콘텐츠">${inner}${hubHtml()}</section>` : "";

const titleOf = (r) => r.title || r.question || r.name || clip(plain(r.caption), 60) || "";

// 상세 페이지 하단 "더 보기" — 같은 섹션 최신 8개(카테고리 무관: 본문 조회와 병렬로 돌리려고)
const REL = {
  issue:   [`issues?status=eq.normal&select=id,title&order=created_at.desc&limit=7`,        (r) => `/issue?id=${r.id}`,           "다른 이슈 더 보기"],
  news:    [`galla_news?status=eq.published&source_count=gte.2&select=id,title&order=published_at.desc&limit=7`, (r) => `/news?gn=${r.id}`,          "다른 갈라뉴스"],
  plaza:   [`plaza_posts?select=id,title&order=created_at.desc&limit=7`,                     (r) => `/plaza_detail?id=${r.id}`,   "광장 다른 글"],
  predict: [`markets?select=id,question&order=created_at.desc&limit=7`,                      (r) => `/predict-market?id=${r.id}`, "다른 예측 마켓"],
  post:    [`posts?is_published=eq.true&select=id,title,caption&order=created_at.desc&limit=7`, (r) => `/gallari-post?id=${r.id}`, "다른 콘텐츠"],
  /* 여행지는 색인 대상 뷰에서만 뽑는다 — 링크로 밀어주는 곳과 사이트맵에 넣는 곳이
     달라지면 로봇에게 앞뒤가 안 맞는 신호가 간다. */
  travel:  [`travel_sitemap_v?select=id,slug,sid,name&order=updated_at.desc&limit=7`, (r) => `/travel/${encodeURIComponent(r.slug || "place")}-${r.sid}`, "다른 여행지"],
};
async function relatedLinks(k, selfId) {
  const spec = REL[k];
  if (!spec) return "";
  const rows = await sbMany(spec[0]);
  const items = rows.filter((r) => String(r.id) !== String(selfId)).slice(0, 6)
    .map((r) => ({ href: spec[1](r), text: titleOf(r) }));
  return linkSection(spec[2], items);
}

// 경로 정규화: CF Pages가 /issue.html → /issue 로 308하므로 clean 경로 기준으로 매칭
const kind = (path) => {
  const p = path.replace(/\.html$/, "");
  if (p === "/issue") return "issue";
  if (p === "/news") return "news";
  if (p === "/plaza_detail") return "plaza";
  if (p === "/predict-market") return "predict";
  if (p === "/gallari-post") return "post";
  if (p === "/travel-place") return "travel";
  return null;
};

/* 여행지는 주소가 다르다 — /travel/기자의-피라미드-b29e54ae
   앞의 한글은 장식이고 **주소를 푸는 건 뒤의 8자(id 앞자리)뿐**이다.
   이름이 나중에 한글로 바뀌어도 옛 주소가 죽지 않고 새 주소로 301 된다. */
function travelSid(path) {
  const m = /^\/travel\/(.+)-([0-9a-f]{8})$/.exec(decodeURIComponent(path));
  return m ? { slug: m[1], sid: m[2] } : null;
}
const travelUrl = (row) => `${HOST}/travel/${encodeURIComponent(row.slug || "place")}-${row.sid}`;

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
    // ⚠️ 본문은 description(수백 자). one_line(33자)만 쓰면 로봇이 보는 글이 thin해진다.
    const row = await sbOne(`issues?id=eq.${encodeURIComponent(params.get("id"))}&select=id,title,one_line,description,category,created_at,thumbnail_url,faction_a,faction_b,tags`);
    if (!row) return null;
    const title = clip(row.title, 60), desc = clip(row.one_line || plain(row.description) || row.title, 150);
    const canonical = `${HOST}/issue?id=${row.id}`, image = row.thumbnail_url || DEF_IMG;
    const fac = (row.faction_a && row.faction_b) ? `진영 대결: ${row.faction_a} vs ${row.faction_b}` : "";
    const full = [row.one_line, plain(row.description), fac].filter(Boolean).join("\n\n");
    return { k, title: `${title} · 갈라`, desc, canonical, image, ogType: "article",
      kicker: row.category ? `${row.category} · 여론 대결` : "여론 대결",
      h1: row.title, body: full, date: row.created_at, tags: row.tags,
      jsonld: articleLd(row.title, desc, image, canonical, row.created_at, full) };
  }
  if (k === "news" && params.get("gn")) {
    // 갈라뉴스는 AI가 여러 보도를 종합해 새로 쓴 오리지널 기사 → body 전문을 그대로 노출한다.
    const row = await sbOne(`galla_news?id=eq.${encodeURIComponent(params.get("gn"))}&select=id,title,summary,body,category,hero_image,published_at,source_count`);
    if (!row) return null;
    const title = clip(row.title, 60), desc = clip(row.summary || row.title, 150);
    const canonical = `${HOST}/news?gn=${row.id}`, image = row.hero_image || DEF_IMG;
    const full = [row.summary, row.body].filter(Boolean).join("\n\n");
    /* 출처가 1곳뿐인 기사는 '종합'이 아니라 한 곳을 바꿔 쓴 것이다(전체의 35%).
       색인시키면 원문 언론사와 중복 경합 + 대량생산 콘텐츠 판정 위험 → noindex,follow.
       (follow 는 남긴다 — 링크 그물이 여기서 끊기면 안 된다) */
    const thin = !(Number(row.source_count) >= 2);
    return { k, thin, title: `${title} · 갈라뉴스`, desc, canonical, image, ogType: "article",
      kicker: `${row.category || "뉴스"} · 갈라뉴스`,
      h1: row.title, body: full, date: row.published_at,
      hero: row.hero_image, category: row.category, sourceCount: row.source_count,
      jsonld: newsLd(row.title, desc, image, canonical, row.published_at, full) };
  }
  if (k === "plaza" && params.get("id")) {
    const row = await sbOne(`plaza_posts?id=eq.${encodeURIComponent(params.get("id"))}&select=id,title,body,category,created_at,cover_image,thumbnail,nickname`);
    if (!row) return null;
    const title = clip(row.title, 60), desc = clip(plain(row.body) || row.title, 150);
    const canonical = `${HOST}/plaza_detail?id=${row.id}`, image = row.cover_image || row.thumbnail || DEF_IMG;
    return { k, title: `${title} · 갈라 광장`, desc, canonical, image, ogType: "article",
      kicker: `${row.category || "광장"} · 갈라 광장`,
      h1: row.title, body: plain(row.body), date: row.created_at,
      jsonld: articleLd(row.title, desc, image, canonical, row.created_at, plain(row.body)) };
  }
  if (k === "post" && params.get("id")) {
    const row = await sbOne(`posts?id=eq.${encodeURIComponent(params.get("id"))}&is_published=eq.true&select=id,kind,title,caption,thumbnail_url,images,created_at`);
    if (!row) return null;
    const heading = row.title || clip(plain(row.caption), 60) || "갈라리 콘텐츠";
    const title = clip(heading, 60);
    const desc = clip(plain(row.caption) || row.title || "갈라에서 소통하고 후원하는 콘텐츠.", 150);
    const canonical = `${HOST}/gallari-post?id=${row.id}`;
    const image = row.thumbnail_url || (Array.isArray(row.images) && row.images[0]) || DEF_IMG;
    return { k, title: `${title} · 갈라리`, desc, canonical, image, ogType: "article",
      kicker: `갈라리 · ${row.kind === "horizontal" ? "영상" : "콘텐츠"}`,
      h1: heading, body: plain(row.caption) || "", date: row.created_at,
      jsonld: articleLd(heading, desc, image, canonical, row.created_at) };
  }
  if (k === "travel" && params.get("id")) {
    const row = await sbOne(`travel_places?id=eq.${encodeURIComponent(params.get("id"))}&select=id,slug,sid,name,name_en,name_local,country,country_code,admin1,city,category,scale,lat,lon,summary,summary_src,photo,created_at`);
    if (!row) return null;
    return travelSeo(row, await travelExtras(row.id));
  }
  if (k === "predict" && params.get("id")) {
    const row = await sbOne(`markets?id=eq.${encodeURIComponent(params.get("id"))}&select=id,question,description,category,image_url,created_at`);
    if (!row) return null;
    const title = clip(row.question, 60);
    const desc = clip(row.description || `${row.question} — 갈라예측에서 예/아니오에 GP를 걸고 결과를 맞혀보세요.`, 150);
    const canonical = `${HOST}/predict-market?id=${row.id}`, image = row.image_url || DEF_IMG;
    return { k, title: `${title} · 갈라예측`, desc, canonical, image, ogType: "article",
      kicker: `${row.category || "예측"} · 갈라예측`,
      h1: row.question, body: row.description || "", date: row.created_at,
      jsonld: articleLd(row.question, desc, image, canonical, row.created_at, row.description) };
  }
  return null;
}

/* 발자국(어느 크리에이터가 갔나)이 이 페이지의 알맹이다 — 로봇에게도 그걸 보여준다 */
async function travelExtras(id) {
  const rows = await sbMany(`travel_place_sources?place_id=eq.${encodeURIComponent(id)}&select=channel,video_id,video_title,aired_at&order=aired_at.desc&limit=12`);
  return { sources: rows };
}

function travelSeo(row, extra) {
  const who = (extra?.sources || []).length;
  const where = [row.city, row.admin1, row.country].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
  const place = where.join(" · ");
  const h1 = row.name;
  const title = clip(`${h1}${row.country ? ` (${row.country})` : ""}`, 60);
  /* 설명이 있으면 그걸 쓰고, 없으면 '몇 명이 다녀갔나'로 만든다.
     ⚠️ 둘 다 없는 곳(국가유산 뱃지만 있는 4,390곳)은 thin 이라 색인시키지 않는다 —
        뉴스에서 대량생산으로 걸렸던 것과 같은 실수를 반복하지 않는다. */
  const desc = clip(row.summary
    || (who ? `여행 유튜버 ${who}명이 다녀간 ${place || "여행지"}. 가볼 만한 곳인지 갈라에서 판정하고 한마디 남기세요.`
            : `${place || "여행지"} — ${h1}.`), 150);
  /* ⚠️ 이 판정은 travel_sitemap_v(사이트맵이 쓰는 뷰)와 **같은 규칙이어야 한다**.
        어긋나면 서치콘솔에 "제출됐지만 noindex 표시됨"이 그 수만큼 쌓인다.
        나라·광역은 뺀다 — '튀르키예'라는 제목에 본문도 '튀르키예'뿐인 페이지가
        수백 개면 사이트 전체 품질 신호를 깎는다. */
  const scaleOk = ["spot", "city"].includes(row.scale || "spot");
  const thin = !(scaleOk && (who > 0 || String(row.summary || "").length >= 80));
  /* ⚠️ 같은 말을 두 번 쓰지 않는다. 위치는 kicker 에, 영상 제목은 '누가 갔나' 목록에 이미 있다.
     서버렌더에 같은 문장을 겹쳐 넣으면 사람 눈에 지저분하고 로봇에겐 키워드 반복으로 읽힌다. */
  const body = [
    row.summary,
    !row.summary && place ? `위치: ${place}` : "",
    row.name_local || row.name_en ? `현지 표기: ${row.name_local || row.name_en}` : "",
  ].filter(Boolean).join("\n\n");
  const canonical = travelUrl(row);
  /* 사진은 '그 장소'가 먼저. 없으면 크리에이터 영상 썸네일로 간다 —
     /share/travel 카드와 같은 규칙이어야 카톡·검색에서 같은 그림이 뜬다. */
  const firstVid = (extra?.sources || []).map((v) => v.video_id).filter(Boolean)[0];
  const image = row.photo
    || (firstVid ? `https://i.ytimg.com/vi/${encodeURIComponent(firstVid)}/maxresdefault.jpg` : DEF_IMG);
  return { k: "travel", thin, title: `${title} · 갈라 여행`, desc, canonical, image, ogType: "article",
    kicker: `${place || "여행"} · 갈라 여행`, h1, body, date: row.created_at,
    placeId: row.id, sources: extra?.sources || [],
    jsonld: placeLd(row, desc, image, canonical, body) };
}

function placeLd(row, desc, image, url, body) {
  const o = {
    "@context": "https://schema.org", "@type": "TouristAttraction",
    name: row.name, description: desc, image: [image], url,
    inLanguage: "ko-KR",
    ...(row.name_en || row.name_local ? { alternateName: row.name_local || row.name_en } : {}),
    ...(body ? { disambiguatingDescription: clip(body, 1200) } : {}),
    address: {
      "@type": "PostalAddress",
      ...(row.city ? { addressLocality: row.city } : {}),
      ...(row.admin1 ? { addressRegion: row.admin1 } : {}),
      ...(row.country_code ? { addressCountry: row.country_code } : {}),
    },
  };
  if (row.lat != null && row.lon != null) {
    o.geo = { "@type": "GeoCoordinates", latitude: Number(row.lat), longitude: Number(row.lon) };
  }
  return JSON.stringify(o);
}

function articleLd(title, desc, image, url, date, body) {
  return JSON.stringify({
    "@context": "https://schema.org", "@type": "Article",
    headline: clip(title, 110), description: desc, image: [image],
    inLanguage: "ko-KR",
    ...(body ? { articleBody: clip(body, 5000) } : {}),
    datePublished: safeIso(date), dateModified: safeIso(date),
    mainEntityOfPage: url,
    author: { "@type": "Organization", name: "GALLA 갈라" },
    publisher: { "@type": "Organization", name: "GALLA 갈라", logo: { "@type": "ImageObject", url: `${HOST}/assets/app-icons/icon-512.png` } },
  });
}
function newsLd(title, desc, image, url, date, body) {
  const o = JSON.parse(articleLd(title, desc, image, url, date, body));
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
  // 여행지 주소는 /travel/<이름>-<8자> 라 정확일치가 안 된다 — 접두로 본다
  const sec = path.startsWith("/travel/") ? ["갈라 여행", `${HOST}/search?tab=travel`] : SEC[path];
  if (sec) items.push({ "@type": "ListItem", position: 2, name: sec[0], item: sec[1] });
  items.push({ "@type": "ListItem", position: items.length + 1, name: clip(seo.h1, 60), item: seo.canonical });
  return JSON.stringify({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items });
}

// 갈라뉴스 서버 렌더 — 로봇이 읽는 글이 곧 사람이 보는 글이 되게(숨김 텍스트는 구글이 안 쳐준다).
// news-page.js가 #np-reader.innerHTML을 통째로 덮어쓰므로 중복 렌더 걱정이 없고,
// JS가 붙기 전 화면도 기사 본문이라 체감 속도까지 같이 좋아진다.
function newsArticleHtml(seo) {
  const paras = String(seo.body || "").split(/\n{2,}|\n/).map((t) => t.trim()).filter(Boolean);
  if (!paras.length) return null;
  const hero = seo.hero && /^https?:\/\//.test(seo.hero)
    ? `<img class="reader-hero" src="${esc(seo.hero)}" alt="${esc(seo.h1)}" referrerpolicy="no-referrer">` : "";
  return `<article class="reader">` +
    `<span class="reader-badge">갈라뉴스 · AI 종합</span>` +
    `<h1 class="reader-title">${esc(seo.h1)}</h1>` +
    `<div class="reader-sub">${esc(seo.category || "뉴스")}</div>` + hero +
    paras.map((t) => `<p>${esc(t)}</p>`).join("") +
    `<p class="reader-disclaimer">본 기사는 여러 보도를 AI가 종합·재작성한 갈라뉴스 오리지널입니다. 사진·사실의 출처는 각 언론사에 있습니다.</p>` +
    `</article>`;
}

// HTMLRewriter로 <head> 메타 교체 + 본문 스냅샷 + 크롤 링크 주입
/* 로봇이 JS 없이 읽는 여행지 본문. travel-place.js 가 곧 같은 자리를 덮어쓴다. */
function travelArticleHtml(seo) {
  const S = "max-width:720px;margin:0 auto;padding:18px 16px;color:#c9d1e0;font-size:14px;line-height:1.7";
  const vids = (seo.sources || []).map((v) => v.video_title).filter(Boolean).slice(0, 10);
  return `<div style="${S}">` +
    `<p style="margin:0 0 6px;font-size:12px;color:#8b94a8">${esc(seo.kicker)}</p>` +
    `<h1 style="margin:0 0 10px;font-size:20px;color:#e8ecf4">${esc(seo.h1)}</h1>` +
    String(seo.body || "").split(/\n{2,}/).map((t) => t.trim()).filter(Boolean)
      .map((t) => `<p style="margin:0 0 10px">${esc(clip(t, 1200))}</p>`).join("") +
    (vids.length
      ? `<h2 style="margin:16px 0 6px;font-size:14px;color:#8b94a8">누가 갔나</h2><ul style="margin:0;padding-left:18px">` +
        vids.map((t) => `<li style="margin:0 0 4px">${esc(clip(t, 90))}</li>`).join("") + `</ul>`
      : "") +
    `</div>`;
}

function rewrite(res, seo, linksHtml) {
  // 목록 페이지: 메타는 원본 유지하고 링크 그물만 깐다
  if (!seo) {
    return new HTMLRewriter()
      .on("#app", { element(el) { el.append(linksHtml, { html: true }); } })
      .transform(res);
  }
  const metaHtml =
    `<meta name="description" content="${esc(seo.desc)}">` +
    `<meta name="robots" content="${seo.thin ? "noindex,follow" : "index,follow,max-image-preview:large"}">` +
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
    /* 예쁜 주소(/travel/…)에는 ?id= 가 없다. 클라이언트가 자기 id 를 알 길이 여기뿐이다. */
    (seo.placeId ? `<meta name="galla-place-id" content="${esc(seo.placeId)}">` : "") +
    (seo.jsonld ? `<script type="application/ld+json">${seo.jsonld}</script>` : "") +
    (seo.h1 ? `<script type="application/ld+json">${breadcrumbLd(seo)}</script>` : "");

  /* 크롤러가 읽을 본문 스냅샷 — JS 미실행인 네이버 Yeti·다음 Daumoa에겐 이게 유일한 본문이다.
     ⚠️ 500자로 자르던 걸 전문(최대 4000자·문단 유지)으로 늘렸다. 133자짜리 뉴스 스냅샷이
     구글에 thin content로 잡히던 게 색인 실패의 한 축이었다.
     뉴스는 아래에서 #np-reader에 진짜로 보이게 SSR하므로 스냅샷을 중복으로 넣지 않는다. */
  const newsHtml = seo.k === "news" ? newsArticleHtml(seo) : null;
  /* 여행지도 뉴스와 같이 **보이게** 서버렌더한다. 숨긴 텍스트(clip:rect)에는 구글이
     가중치를 안 준다 — 뉴스에서 이미 겪은 일이다. travel-place.js 가 같은 자리를
     innerHTML 로 덮으므로 사람 눈에 중복되지 않는다. */
  const tvHtml = seo.k === "travel" ? travelArticleHtml(seo) : null;
  const snapParas = String(seo.body || "").split(/\n{2,}|\n/).map((t) => t.trim()).filter(Boolean);
  const snapshot = (seo.h1 && !newsHtml && !tvHtml)
    ? `<div id="seo-snapshot" aria-hidden="true" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">` +
      `<p>${esc(seo.kicker)}</p><h1>${esc(seo.h1)}</h1>` +
      snapParas.map((t) => `<p>${esc(clip(t, 1200))}</p>`).join("").slice(0, 8000) +
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
  if (newsHtml) {
    rw = rw.on("#np-reader", { element(el) { el.setInnerContent(newsHtml, { html: true }); } })
           .on("#np-title", { element(el) { el.setInnerContent(seo.h1); } });
  }
  if (tvHtml) rw = rw.on("#tv-page", { element(el) { el.setInnerContent(tvHtml, { html: true }); } });
  if (linksHtml) rw = rw.on("#app", { element(el) { el.append(linksHtml, { html: true }); } });
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
    /* 🚨 리포지토리가 통째로 배포되는 구조라 소스·설정·비밀파일까지 서빙됐다(실측).
       실측 노출: /supabase/functions/*.ts(프롬프트·가드 로직), /supabase/migrations/*.sql(스키마·RLS),
                 /scripts/*.py, /package.json, /CLAUDE.md, /.gitignore,
                 그리고 API 키가 담긴 .claude/ 설정 파일까지 200 이었다.
       퍼블릭이어야 하는 것(/ota/*, /version.txt, /assets/*, /js/*, /css/* 등)은 건드리지 않고,
       내부 자산 경로만 막는다. 파일 삭제와 별개로 엣지에서 즉시 끊는 게 우선이다. */
    const BLOCKED = /^\/(docs|scripts|supabase|node_modules|\.claude|\.wrangler|\.git|\.vscode|\.github)(\/|$)/i;
    const BLOCKED_FILE = /^\/(package(-lock)?\.json|CLAUDE\.md|README\.md|cors\.json|\.gitignore|\.env.*|.*\.(sql|ts|py|sh|toml|lock))$/i;
    if (BLOCKED.test(url0.pathname) || BLOCKED_FILE.test(url0.pathname)) {
      return new Response("Not Found", {
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8", "x-robots-tag": "noindex, nofollow" },
      });
    }
    if (/^\/docs(\/|$)/i.test(url0.pathname)) {
      return new Response("Not Found", {
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8", "x-robots-tag": "noindex, nofollow" },
      });
    }
    /* 🏢 company.galla.im — 회사 소개 한 장짜리 사이트.
       같은 Pages 프로젝트에 커스텀 도메인만 얹고, 이 호스트의 루트만 /company.html 로 바꿔 서빙한다.
       (Pages 의 _redirects 는 호스트 조건을 못 걸고, 정적 파일이 있으면 아예 적용되지 않는다.)
       ⚠️ CSP: 전역 _headers 는 style-src/font-src 가 'self' 라 구글 폰트가 막힌다.
          이 호스트에만 폰트 두 곳을 열어 준다 — galla.im 본 사이트 정책은 건드리지 않는다. */
    {
      const p = url0.pathname;
      /* ⚠️ Pages 는 /company.html 을 /company 로 301 한다(pretty URL).
         두 경로를 모두 가로채 서로 다시 쓰면 무한 리다이렉트가 난다(실측: ERR_TOO_MANY_REDIRECTS).
         → 재작성은 '호스트 루트'에만, /company* 경로는 그대로 서빙하고 헤더만 바꾼다. */
      const isCompanyPath = p === "/company" || p === "/company.html";
      const isCompanyRoot = url0.hostname === "company.galla.im" && (p === "/" || p === "/index.html");
      if (isCompanyRoot || isCompanyPath) {
        const res = isCompanyRoot
          ? await next(new Request(new URL("/company", url0), request))
          : await next();
        const h = new Headers(res.headers);
        h.set("Content-Security-Policy",
          "upgrade-insecure-requests; default-src 'self'; base-uri 'self'; object-src 'none'; " +
          "frame-ancestors 'self'; form-action 'self'; script-src 'self' 'unsafe-inline'; " +
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
          "font-src 'self' data: https://fonts.gstatic.com; " +
          "img-src 'self' data: blob: https:; media-src 'self' blob:; " +
          /* 문의 폼이 Supabase 로 바로 접수한다 — 여기가 막히면 조용히 실패한다 */
          "connect-src 'self' https://bidqauputnhkqepvdzrr.supabase.co");
        return new Response(res.body, { status: res.status, headers: h });
      }
    }
    if (request.method !== "GET") return next();
    const url = url0;
    /* ⚠️ /share/* 는 이미 자기 콘텐츠 전용 OG 카드를 만들어 내보낸다.
       여기서 ?ref= 만 보고 일반 초대 카드로 덮어쓰면 훨씬 약한 카드로 바뀐다
       (예: «고집불통 요새» 궁합 카드 → "누가 초대했어요"). 초대 크레딧은 OG가 아니라
       목적지 페이지의 ?ref= 캡처로 붙으므로, 덮어쓰지 않아도 하나도 안 잃는다. */
    /* 🧭 여행지 예쁜 주소 — /travel/기자의-피라미드-b29e54ae
       실제 파일은 travel-place.html 이다. 여기서 내부적으로 갈아끼운다(리다이렉트가 아니라
       재작성이라 주소창은 예쁜 주소 그대로 남는다 = 색인되는 주소와 사람이 보는 주소가 같다).
       ⚠️ slug 가 다르면(이름이 한글화된 뒤 옛 링크) 301 로 새 주소에 몰아준다 —
          같은 곳이 두 주소로 색인되면 서로 순위를 깎아먹는다. */
    const tv = travelSid(url.pathname);
    let tvRow = null;
    if (tv) {
      tvRow = await sbOne(`travel_places?sid=eq.${encodeURIComponent(tv.sid)}&select=id,slug,sid,name,name_en,name_local,country,country_code,admin1,city,category,scale,lat,lon,summary,summary_src,photo,created_at&limit=1`);
      if (tvRow && (tvRow.slug || "") !== tv.slug) {
        return Response.redirect(travelUrl(tvRow), 301);
      }
    }
    /* ⚠️ 없는 여행지는 **진짜 404** 를 준다. 그냥 통과시키면 Pages 의 SPA 폴백이
       앱 껍데기를 200 으로 내주는데(실측), 구글은 그걸 소프트 404 로 잡고
       아무 문자열이나 200 이 되는 주소는 색인 품질을 통째로 깎는다. */
    if (url.pathname.startsWith("/travel/") && !tvRow) {
      return new Response("Not Found", {
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8", "x-robots-tag": "noindex, nofollow" },
      });
    }
    const isShare = url.pathname.startsWith("/share/");
    const hasRef = !isShare && !!url.searchParams.get("ref");
    const isContent = !!tvRow
      || (!!kind(url.pathname) && (url.searchParams.get("id") || url.searchParams.get("gn")));
    /* 초대(?ref=) 또는 콘텐츠 상세일 때만 개입.
       ⚠️ 한때 목록 페이지(홈·검색·광장·예측)에도 링크 블록을 주입했는데, 앱 화면 끝에
          민짜 링크 수십 개가 쌓여 UI 를 망쳤다. 크롤러용 링크 그물은 앱 화면이 아니라
          전용 아카이브 페이지(/archive, functions/archive.js)가 맡는다. */
    if (!hasRef && !isContent) return next();

    const res = tvRow
      ? await next(new Request(new URL(`/travel-place?id=${tvRow.id}`, url), request))
      : await next();
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("text/html")) return res;

    // ?ref= 는 초대 카드 우선 — 일반 홈 카드와 달라야 초대인 걸 알 수 있다
    // 메타 조회와 링크 조회는 병렬 — 상세 페이지 TTFB를 한 번 더 늘리지 않는다
    const [seo, linksHtml] = await Promise.all([
      (async () => (hasRef ? await resolveInvite(url.searchParams) : null)
                || (tvRow ? travelSeo(tvRow, await travelExtras(tvRow.id)) : null)
                || (isContent ? await resolveSeo(url.pathname, url.searchParams) : null))(),
      (async () => {
        try {
          if (tvRow) return wrapLinks(await relatedLinks("travel", tvRow.id));
          if (isContent) return wrapLinks(await relatedLinks(kind(url.pathname), url.searchParams.get("id") || url.searchParams.get("gn")));
        } catch {}
        return "";
      })(),
    ]);
    if (!seo && !linksHtml) return res;

    const out = rewrite(res, seo, linksHtml);
    /* 목록 페이지는 원본 캐시 헤더를 건드리지 않는다 — index.html 등에 max-age를 새로 씌우면
       배포 전파가 늦어진다([[galla-version-propagation]]). 캐시는 콘텐츠/초대 카드에만. */
    if (!seo) return out;
    // 크롤러 재방문 대비 짧은 엣지 캐시(원본 HTML은 no-cache지만 변형본은 잠깐 캐시)
    const headers = new Headers(out.headers);
    // 초대 카드는 '오늘의 격전'이 바뀌므로 더 짧게(120s), 콘텐츠 카드는 300s
    headers.set("Cache-Control", `public, max-age=${hasRef ? 120 : 300}, must-revalidate`);
    return new Response(out.body, { status: out.status, headers });
  } catch {
    return context.next();  // 무슨 일이 있어도 원본 서빙(사이트 보호)
  }
}
