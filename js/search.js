/* =========================================================
   GALLA 서치 — 통합 검색 허브
   탭: 검색(통합 인스턴트) / 지금 뜨는 / 뉴스
========================================================= */

function isValidThumbnail(url) {
  if (!url || typeof url !== "string") return false;
  const u = url.trim();
  if (!u || u === "about:blank") return false;
  return u.startsWith("http");
}
// 크롤링 썸네일이 깨졌을 때(로드 실패) → 이미지 숨기고 컨테이너에 플레이스홀더 표시
window.galla_imgFail = function (el) {
  el.style.display = "none";
  const box = el.closest(".news-thumb-16x9, .sr-thumb, .news-mini-thumb");
  if (box) box.classList.add("thumb-fail");
};
function esc(s) {
  return (s == null ? "" : String(s))
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function timeAgo(ts) {
  if (!ts) return "";
  const d = (Date.now() - new Date(ts)) / 1000;
  if (d < 60) return "방금";
  if (d < 3600) return `${Math.floor(d / 60)}분 전`;
  if (d < 86400) return `${Math.floor(d / 3600)}시간 전`;
  return `${Math.floor(d / 86400)}일 전`;
}
function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* 카드 통계 아이콘 — 이모지는 기기마다 크기·모양이 달라 줄 정렬이 흔들린다.
   다른 페이지와 같은 규약(stroke 1.8 · currentColor)의 SVG로 통일. */
const stIc = (d) =>
  `<svg class="st-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ST = {
  like: stIc('<path d="M7 10.5V21H4a1 1 0 0 1-1-1v-8.5a1 1 0 0 1 1-1h3z"/><path d="M7 10.5l4.2-7.4a1 1 0 0 1 1.4-.4l.6.4a2.4 2.4 0 0 1 1 2.6L13.5 9h5.3a2 2 0 0 1 2 2.4l-1.4 7A2 2 0 0 1 17.4 20H7"/>'),
  dislike: stIc('<path d="M17 13.5V3h3a1 1 0 0 1 1 1v8.5a1 1 0 0 1-1 1h-3z"/><path d="M17 13.5l-4.2 7.4a1 1 0 0 1-1.4.4l-.6-.4a2.4 2.4 0 0 1-1-2.6l.7-3.3H5.2a2 2 0 0 1-2-2.4l1.4-7A2 2 0 0 1 6.6 4H17"/>'),
  comment: stIc('<path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.5 8.6 8.6 0 0 1-3.9-.9L3.5 20.5l1.4-5.1a8.4 8.4 0 0 1-.9-3.9A8.4 8.4 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5z"/>'),
  saved: stIc('<path d="M18 21l-6-4.3L6 21V5.5A2.5 2.5 0 0 1 8.5 3h7A2.5 2.5 0 0 1 18 5.5V21z"/>'),
  share: stIc('<path d="M21.5 2.5L10.8 13.2"/><path d="M21.5 2.5l-6.8 19-3.9-8.3-8.3-3.9 19-6.8z"/>'),
};

/* 섹션 제목 아이콘 — 탭 아이콘과 같은 도형을 써서 이름·모양을 통일한다.
   (핫트렌드 탭의 "인기 갈라뉴스 / 뜨는 이슈 / 뜨는 예측 / 뜨는 광장") */
const secIc = (d) =>
  `<svg class="sec-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const SEC = {
  news: secIc('<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h9A1.5 1.5 0 0 1 16 5.5V18a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2V5.5z"/><path d="M16 9h2.5A1.5 1.5 0 0 1 20 10.5V18a2 2 0 0 1-2 2"/><path d="M7.5 8h5M7.5 11.5h5M7.5 15h3"/>'),
  issue: secIc('<path d="M12 3l7 4v5c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V7l7-4z"/><path d="M9.2 12.2l1.9 1.9 3.7-3.9"/>'),
  predict: secIc('<path d="M3.5 17l5.5-5.5 3.5 3.5L21 6.5"/><path d="M15.5 6.5H21V12"/>'),
  plaza: secIc('<path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.5 8.6 8.6 0 0 1-3.9-.9L3.5 20.5l1.4-5.1a8.4 8.4 0 0 1-.9-3.9A8.4 8.4 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5z"/>'),
};

/* ═══ 이중 모드(웹 MPA + 단일문서 SPA 뷰) ═══════════════════════
   · MPA(search.html 단독): 기존 그대로 DOMContentLoaded 자동 초기화(맨 아래 등록).
   · SPA(app.html, body[data-page="spa"]): 자동 초기화 금지 — 뷰 모듈(js/spa/views/trend.js)이
     window.GALLA_PAGE_TREND.mount(root)를 호출할 때 초기화한다.
   로직은 initTrendPage 하나로 동일 — 재작성 없음. */
const GALLA_TREND_SPA = !!(document.body && document.body.dataset.page === "spa");
let __trendRoot = null;      // SPA에서 mount()가 넣어주는 view-host
let __trendInited = false;
let __searchLiftDrop = null; // 검색바 lift 원복 함수(탭 이탈 시 호출) — liftSearchBarOnFocus가 채움

async function initTrendPage() {
  if (__trendInited) return;
  __trendInited = true;
  // SPA에선 문서 스크롤이 잠기고 .view-host가 스크롤 컨테이너다
  const HOST = GALLA_TREND_SPA && __trendRoot
    ? (__trendRoot.closest(".view-host") || __trendRoot) : null;
  const toPageTop = () => { if (HOST) HOST.scrollTo(0, 0); else window.scrollTo(0, 0); };
  const supabase = await waitForSupabaseClient();

  let ME = null;
  supabase.auth.getUser().then(({ data }) => { ME = data?.user || null; });

  /* ================= DOM ================= */
  const tabs = document.querySelectorAll(".tab-item");
  const panels = document.querySelectorAll(".tab-panel");

  const form = document.getElementById("search-form");
  const input = document.getElementById("search-input");
  const clearBtn = document.getElementById("search-clear");
  const emptyEl = document.getElementById("search-empty");
  const resultsEl = document.getElementById("search-results");
  const recentBlock = document.getElementById("se-recent-block");

  /* ⌨️ 검색바는 '움직이지 않는다'(사장님 요구). 재부모화/lift/오버레이는 다 위치가 튀어 폐기.
     검색바는 제자리(판 안). 키보드 위 노출은 뷰포트 `interactive-widget=resizes-content`(app.html)에
     맡긴다 — 지원하는 iOS(시뮬 26.0 등)는 키보드가 레이아웃을 줄여 검색바가 보인다. 일부 실기기
     iOS(26.5.2)가 이를 무시해 키보드가 검색바를 덮는 건 iOS 버전 이슈로, 웹에서 안 옮기고 잡는 법은 없다.
     (움직이는 UX보다 '안 움직이고 iOS에 맡김'을 사장님이 택함.) */
  const recentEl = document.getElementById("se-recent");
  const popularEl = document.getElementById("se-popular");

  /* 기사 읽기는 news.html '진짜 페이지'로 이동한다.
     예전엔 이 페이지 위의 모달이었는데, 모달을 pushState로 페이지 흉내내면
     사파리 스와이프 뒤로가기가 목록을 스치고 이전 문서(예측 등)까지 튕겨 나갔다. */
  const openGallaNews = (id) =>
    (location.href = `news.html?gn=${encodeURIComponent(id)}`);

  const openNewsViewer = (url, title, press) => {
    if (!url) return;
    const qs = new URLSearchParams({ url, title: title || "", press: press || "" });
    location.href = `news.html?${qs}`;
  };

  /* ================= 탭 ================= */
  let trendingLoaded = false, newsInit = false;

  // 현재 탭을 URL에 남긴다 — 기사(news.html)에서 뒤로 오면 보던 탭으로 복귀해야 한다
  function rememberTab(name) {
    if (GALLA_TREND_SPA) return;   // SPA에선 주소가 app.html#/trend — 판이 살아있어 복귀 기억 불필요
    const qs = new URLSearchParams(location.search);
    if (name === "search") qs.delete("tab"); else qs.set("tab", name);
    const q = qs.toString();
    history.replaceState(history.state, "", location.pathname + (q ? `?${q}` : ""));
  }

  function activateTab(name, remember = true) {
    tabs.forEach(b => b.classList.toggle("active", b.dataset.tab === name));
    panels.forEach(p => p.classList.toggle("active", p.dataset.panel === name));
    if (remember) rememberTab(name);
    if (name === "trending" && !trendingLoaded) { trendingLoaded = true; loadTrending(); }
    if (name === "news" && !newsInit) {
      newsInit = true;
      renderNewsCategoryChips();
      resetNews();
    }
    // 검색 탭 진입 시 자동 포커스 금지 — 키보드가 화면을 덮어 목록부터 못 본다(사장님).
    // 키보드는 사용자가 검색창을 직접 탭했을 때만.
  }
  tabs.forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault(); e.stopPropagation();
      activateTab(btn.dataset.tab);
    });
  });
  /* 조그셔틀(트렌드 버튼 꾹→방향 선택)에서 바로 탭 전환 — nav-jog.js가 호출 */
  window.GALLA_trendSetTab = (t) => activateTab(t);
  /* 셸에서 조그로 골라 들어올 때 — 셸이 트렌드 판에 trendtab 명령을 보낸다 */
  window.addEventListener("message", (e) => {
    if (e.origin !== location.origin) return;
    const m = e.data;
    if (m && m.galla === "shellcmd" && m.t === "trendtab" && m.tab) activateTab(m.tab);
  });

  /* ================= 최근 검색어 (localStorage) ================= */
  const RECENT_KEY = "galla_recent_searches";
  const getRecent = () => {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; }
    catch { return []; }
  };
  const saveRecent = list => localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 10)));
  function addRecent(kw) {
    kw = kw.trim(); if (!kw) return;
    const list = getRecent().filter(x => x !== kw);
    list.unshift(kw); saveRecent(list); renderRecent();
  }
  function removeRecent(kw) {
    saveRecent(getRecent().filter(x => x !== kw)); renderRecent();
  }
  function renderRecent() {
    const list = getRecent();
    recentBlock.hidden = list.length === 0;
    recentEl.innerHTML = list.map(kw =>
      `<span class="se-chip" data-kw="${esc(kw)}">${esc(kw)}<button class="se-chip-x" data-del="${esc(kw)}">✕</button></span>`
    ).join("");
  }
  document.getElementById("se-recent-clear")?.addEventListener("click", () => {
    saveRecent([]); renderRecent();
  });
  recentEl.addEventListener("click", e => {
    const del = e.target.closest("[data-del]");
    if (del) { removeRecent(del.dataset.del); return; }
    const chip = e.target.closest("[data-kw]");
    if (chip) runSearch(chip.dataset.kw, true);
  });

  /* ================= 뜨는 키워드 (실제 뉴스 제목 빈출어 추출) ================= */
  const KW_STOP = new Set(("그 이 저 것 수 등 및 더 또 왜 위 중 후 전 첫 관련 오늘 지난 이번 대한 통해 위해 대해 있다 없다 한다 된다 " +
    "종합 속보 단독 영상 사진 인터뷰 기자 뉴스 오전 오후 이상 이하 최고 최대 그룹 대표 회장 사장 의원 대통령 " +
    "밝혀 밝혔 예정 계획 추진 발표 확인 논란 무슨 어떤 이런 저런 그런 하며 하고 하는 했다 되는 통한 " +
    "포토 화보 사설 칼럼 만평 종합뉴스 게시 제공 공개 참석 방문 개최 진행 관계자").split(" "));
  let _hotKwCache = null;
  async function computeHotKeywords(limit = 12) {
    if (_hotKwCache) return _hotKwCache.slice(0, limit);
    const since = new Date(Date.now() - 6 * 3600e3).toISOString();
    const { data } = await supabase.from("news_articles_raw")
      .select("title").gte("published_at", since).limit(700);
    const freq = {};
    (data || []).forEach(r => {
      const seen = new Set();
      (r.title || "").replace(/[^가-힣A-Za-z0-9 ]/g, " ").split(/\s+/).forEach(t => {
        t = t.trim();
        if (t.length < 2 || t.length > 12 || /^\d+$/.test(t) || KW_STOP.has(t)) return;
        if (seen.has(t)) return; seen.add(t);      // 문서빈도(기사당 1회) → 여러 기사에 걸친 단어가 상위
        freq[t] = (freq[t] || 0) + 1;
      });
    });
    _hotKwCache = Object.entries(freq).filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1]).map(([kw, count]) => ({ kw, count }));
    return _hotKwCache.slice(0, limit);
  }

  /* 소스별 실시간 검색어: 갈라(자체) / 구글 트렌드 / 네이트·줌(signal 집계) */
  let curSrc = "galla";
  const _srcCache = {};
  async function fetchSource(src) {
    if (_srcCache[src]) return _srcCache[src];
    let items;
    if (src === "galla") {
      items = (await computeHotKeywords(10)).map(r => ({ keyword: r.kw, badge: String(r.count) }));
    } else {
      const { data } = await supabase.from("portal_search_trends")
        .select("rank,keyword,traffic,link").eq("source", src).order("rank").limit(12);
      items = (data || []).map(r => ({ keyword: r.keyword, badge: r.traffic || "", link: r.link || "" }));
    }
    _srcCache[src] = items;
    return items;
  }
  function renderRank(items) {
    if (!items.length) { popularEl.innerHTML = `<p class="se-muted">집계된 검색어가 없어요.</p>`; return; }
    popularEl.innerHTML = items.map((r, i) =>
      `<button class="se-pop" data-kw="${esc(r.keyword)}"${r.link ? ` data-link="${esc(r.link)}"` : ""}>
        <span class="se-pop-rank ${i < 3 ? "hot" : ""}">${i + 1}</span>
        <span class="se-pop-title">${esc(r.keyword)}</span>
        ${r.badge ? `<span class="se-pop-cnt">${esc(r.badge)}</span>`
          : (r.link ? `<span class="se-pop-go">›</span>` : "")}
       </button>`
    ).join("");
  }
  async function showSource(src) {
    curSrc = src;
    document.querySelectorAll("#se-srcs .se-src").forEach(b => b.classList.toggle("on", b.dataset.src === src));
    // 스냅샷이 이미 떠 있으면 스피너로 덮지 않는다(깜빡임 방지) — 빈 상태에서만
    if (!popularEl.firstElementChild) popularEl.innerHTML = `<p class="se-muted">불러오는 중…</p>`;
    const items = await fetchSource(src);
    if (curSrc === src) renderRank(items);   // 늦게 온 응답 무시
  }
  document.getElementById("se-srcs")?.addEventListener("click", e => {
    const b = e.target.closest(".se-src");
    if (b) showSource(b.dataset.src);
  });
  popularEl.addEventListener("click", e => {
    const b = e.target.closest("[data-kw]");
    if (!b) return;
    // 뉴스 소스(네이버 등)는 링크가 있으면 기사 뷰어로, 아니면 통합 검색
    if (b.dataset.link) { openNewsViewer(b.dataset.link, b.dataset.kw, ""); return; }
    runSearch(b.dataset.kw, true);
  });

  /* ================= 통합 검색 ================= */
  let seq = 0;

  function showEmpty(show) {
    emptyEl.style.display = show ? "block" : "none";
    resultsEl.style.display = show ? "none" : "block";
  }

  async function searchIssues(q) {
    const { data } = await supabase
      .from("issues")
      .select("id,title,category,thumbnail_url,video_url,images,pro_count,con_count,created_at")
      .or(`title.ilike.%${q}%,category.ilike.%${q}%`)
      .order("created_at", { ascending: false })
      .limit(12);
    return data || [];
  }
  async function searchMarkets(q) {
    const { data } = await supabase
      .from("markets")
      .select("id,question,category,volume,market_type,image_url")
      .eq("resolved", false)
      .ilike("question", `%${q}%`)
      .order("volume", { ascending: false })
      .limit(10);
    const markets = data || [];
    if (markets.length) {
      const ids = markets.map(m => m.id);
      const { data: outs } = await supabase
        .from("market_outcomes")
        .select("market_id,label,pool_yes,pool_no,sort_order")
        .in("market_id", ids);
      const byM = {};
      (outs || []).forEach(o => (byM[o.market_id] ||= []).push(o));
      markets.forEach(m => {
        const list = (byM[m.id] || []).sort((a, b) => a.sort_order - b.sort_order);
        const top = list.map(o => ({
          label: o.label, p: Math.round(o.pool_no / (o.pool_yes + o.pool_no) * 100)
        })).sort((a, b) => b.p - a.p)[0];
        m._top = top;
        m._multi = m.market_type === "multi";
      });
    }
    return markets;
  }
  async function searchNews(q) {
    const { data } = await supabase
      .from("news_articles_raw")
      .select("id,title,press_name,published_at,thumbnail_url,url,related_group_id")
      .ilike("title", `%${q}%`)
      .not("thumbnail_url", "is", null)
      .neq("thumbnail_url", "")
      .order("published_at", { ascending: false })
      .limit(10);
    return data || [];
  }

  // 핫유튜브 — youtube_hot 은 피드별로 같은 영상이 중복 저장되므로 video_id 로 합친다
  async function searchYoutube(q) {
    const { data } = await supabase
      .from("youtube_hot")
      .select("video_id,title,channel_title,thumbnail,view_count,duration,is_short")
      .ilike("title", `%${q}%`)
      .order("view_count", { ascending: false })
      .limit(40);
    const seen = new Set();
    return (data || []).filter(v => !seen.has(v.video_id) && seen.add(v.video_id)).slice(0, 10);
  }

  async function searchPlaza(q) {
    const { data } = await supabase
      .from("plaza_posts")
      .select("id,title,category,nickname,user_id,cover_image,thumbnail,up_count,down_count,created_at")
      .or(`title.ilike.%${q}%,body.ilike.%${q}%`)
      .order("created_at", { ascending: false })
      .limit(12);
    return data || [];
  }

  const doSearch = debounce(async q => {
    const my = ++seq;
    const [issues, markets, news, videos, plaza] = await Promise.all([
      searchIssues(q), searchMarkets(q), searchNews(q), searchYoutube(q), searchPlaza(q)
    ]);
    if (my !== seq) return; // 최신 입력만 반영
    renderResults(q, issues, markets, news, videos, plaza);
  }, 240);

  function runSearch(kw, addHistory) {
    input.value = kw;
    clearBtn.hidden = !kw;
    if (addHistory) addRecent(kw);
    showEmpty(false);
    resultsEl.innerHTML = `<div class="sr-loading">검색 중…</div>`;
    doSearch(kw.trim());
  }

  input.addEventListener("input", () => {
    const q = input.value.trim();
    clearBtn.hidden = !input.value;
    if (!q) { showEmpty(true); return; }
    showEmpty(false);
    resultsEl.innerHTML = `<div class="sr-loading">검색 중…</div>`;
    doSearch(q);
  });
  form.addEventListener("submit", e => {
    e.preventDefault();
    const q = input.value.trim();
    if (q) { addRecent(q); doSearch(q); }
  });
  clearBtn.addEventListener("click", () => {
    input.value = ""; clearBtn.hidden = true; showEmpty(true); input.focus();
  });

  function issueThumb(i) {
    if (isValidThumbnail(i.thumbnail_url)) return i.thumbnail_url;
    if (Array.isArray(i.images) && i.images[0]) return i.images[0];
    return null;
  }

  function shortNum(n) {
    n = Number(n) || 0;
    if (n >= 100000000) return (n / 100000000).toFixed(1).replace(/\.0$/, "") + "억";
    if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, "") + "만";
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "천";
    return String(n);
  }

  // 섹션 순서: 이슈 → 예측 → 뉴스 → 유튜브 → 광장
  function renderResults(q, issues, markets, news, videos, plaza) {
    issues = issues || []; markets = markets || []; news = news || [];
    videos = videos || []; plaza = plaza || [];
    const total = issues.length + markets.length + news.length + videos.length + plaza.length;
    if (!total) {
      resultsEl.innerHTML =
        `<div class="sr-none">\u2018${esc(q)}\u2019 검색 결과가 없어요.<br><span>다른 키워드로 검색해 보세요.</span></div>`;
      return;
    }
    let html = "";

    /* ── 갈라 이슈 ── */
    if (issues.length) {
      html += `<div class="sr-sec"><div class="sr-sec-head">🗳 갈라 이슈 <b>${issues.length}</b></div>`;
      html += issues.map(i => {
        const th = issueThumb(i);
        const t2 = (i.pro_count || 0) + (i.con_count || 0);
        const pro = t2 ? Math.round((i.pro_count || 0) / t2 * 100) : 50;
        return `<a class="sr-card" href="issue.html?id=${i.id}">
          <div class="sr-thumb">${th ? `<img src="${esc(th)}" loading="lazy" onerror="galla_imgFail(this)">` : `<span class="sr-noimg">GALLA</span>`}${i.video_url ? `<span class="sr-badge-vid">▶</span>` : ""}</div>
          <div class="sr-body">
            <div class="sr-cat">${esc(i.category || "")}</div>
            <div class="sr-title">${esc(i.title)}</div>
            <div class="sr-bar"><div class="sr-bar-pro" style="width:${pro}%"></div></div>
            <div class="sr-meta sr-stats"><span>${ST.like} ${i.pro_count || 0}</span><span>${ST.dislike} ${i.con_count || 0}</span></div>
          </div>
        </a>`;
      }).join("");
      html += `</div>`;
    }

    /* ── 갈라예측 ── */
    if (markets.length) {
      html += `<div class="sr-sec"><div class="sr-sec-head">🔮 갈라예측 <b>${markets.length}</b></div>`;
      html += markets.map(m => {
        const top = m._top;
        return `<a class="sr-card predict" href="predict-market.html?id=${m.id}">
          <div class="sr-body">
            <div class="sr-cat">${esc(m.category || "")}${m._multi ? " · 여러 선택지" : ""}</div>
            <div class="sr-title">${esc(m.question)}</div>
            ${top ? `<div class="sr-pred"><b>${top.p}%</b> <span>${esc(top.label)}</span></div>` : ""}
            <div class="sr-meta">💰 거래량 ${Math.round(m.volume || 0).toLocaleString("ko-KR")}P</div>
          </div>
          <div class="sr-go">›</div>
        </a>`;
      }).join("");
      html += `</div>`;
    }

    /* ── 뉴스 ── */
    if (news.length) {
      html += `<div class="sr-sec"><div class="sr-sec-head">📰 뉴스 <b>${news.length}</b></div>`;
      html += news.map(n =>
        `<div class="sr-card news" data-url="${esc(n.url || "")}" data-title="${esc(n.title)}" data-press="${esc(n.press_name || "")}">
          <div class="sr-thumb">${isValidThumbnail(n.thumbnail_url) ? `<img src="${esc(n.thumbnail_url)}" referrerpolicy="no-referrer" loading="lazy" onerror="galla_imgFail(this)">` : `<span class="sr-noimg">NEWS</span>`}</div>
          <div class="sr-body">
            <div class="sr-title">${esc(n.title)}</div>
            <div class="sr-meta">${esc(n.press_name || "")} · ${timeAgo(n.published_at)}</div>
          </div>
        </div>`
      ).join("");
      html += `</div>`;
    }

    /* ── 핫유튜브 ── */
    if (videos.length) {
      html += `<div class="sr-sec"><div class="sr-sec-head sr-yt">
        <svg class="yt-ic" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#FF0000" d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1c.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8z"/>
          <path fill="#fff" d="M9.6 15.6V8.4l6.2 3.6-6.2 3.6z"/>
        </svg>핫유튜브 <b>${videos.length}</b></div>`;
      html += videos.map(v =>
        `<div class="sr-card video" data-vid="${esc(v.video_id)}" data-title="${esc(v.title)}" data-ch="${esc(v.channel_title || "")}">
          <div class="sr-thumb">${isValidThumbnail(v.thumbnail) ? `<img src="${esc(v.thumbnail)}" loading="lazy" onerror="galla_imgFail(this)">` : `<span class="sr-noimg">YT</span>`}
            ${v.is_short ? `<span class="sr-badge-short">쇼츠</span>` : `<span class="sr-badge-vid">▶</span>`}</div>
          <div class="sr-body">
            <div class="sr-title">${esc(v.title)}</div>
            <div class="sr-meta">${esc(v.channel_title || "")} · 조회 ${shortNum(v.view_count)}</div>
          </div>
        </div>`
      ).join("");
      html += `</div>`;
    }

    /* ── 갈라 광장 ── */
    if (plaza.length) {
      html += `<div class="sr-sec"><div class="sr-sec-head">🗣 갈라 광장 <b>${plaza.length}</b></div>`;
      html += plaza.map(p => {
        const th0 = isValidThumbnail(p.cover_image) ? p.cover_image : (isValidThumbnail(p.thumbnail) ? p.thumbnail : null);
      const th = th0 && window.GALLA_thumb ? window.GALLA_thumb(th0, 480) : th0;
        return `<a class="sr-card" href="plaza_detail.html?id=${p.id}">
          <div class="sr-thumb">${th ? `<img src="${esc(th)}" loading="lazy" onerror="galla_imgFail(this)">` : `<span class="sr-noimg">광장</span>`}</div>
          <div class="sr-body">
            <div class="sr-cat">${esc(p.category || "")}${p.nickname ? ` · <span data-nick-uid="${esc(p.user_id || "")}">${esc(p.nickname)}</span>` : ""}</div>
            <div class="sr-title">${esc(p.title || "")}</div>
            <div class="sr-meta sr-stats"><span>${ST.like} ${p.up_count || 0}</span><span>${ST.dislike} ${p.down_count || 0}</span></div>
          </div>
        </a>`;
      }).join("");
      html += `</div>`;
    }

    resultsEl.innerHTML = html;
  }

  resultsEl.addEventListener("click", e => {
    // 뉴스 결과 → 기사 페이지
    const news = e.target.closest(".sr-card.news");
    if (news) {
      const url = news.dataset.url;
      if (url) openNewsViewer(url, news.dataset.title, news.dataset.press);
      return;
    }
    // 유튜브 결과 → 핫유튜브 플레이어 (hot-videos.js가 노출)
    const vid = e.target.closest(".sr-card.video");
    if (vid && window.GALLA_OpenVideo) {
      window.GALLA_OpenVideo(vid.dataset.vid, vid.dataset.title, vid.dataset.ch);
    }
  });

  /* ================= 지금 뜨는 ================= */
  // 섹션당 5개 + 더보기
  const TR_LIMIT = 5;
  function trMore(items, label) {
    if (items.length <= TR_LIMIT) return items.join("");
    const rest = items.slice(TR_LIMIT);
    return items.slice(0, TR_LIMIT).join("")
      + `<div class="tr-more-wrap" hidden>${rest.join("")}</div>`
      + `<button class="tr-more">${label || "더보기"} ${rest.length}개 ▾</button>`;
  }
  function trGroup(head, items) {
    return items.length ? `<div class="tr-group"><div class="tr-group-head">${head}</div>${trMore(items)}</div>` : "";
  }
  function trMoreClick(e) {
    const b = e.target.closest(".tr-more");
    if (!b) return;
    const wrap = b.previousElementSibling;
    if (wrap && wrap.classList.contains("tr-more-wrap")) wrap.hidden = false;
    b.remove();
  }

  // 숫자 카운트업 (주식 시세판 느낌) — data-to 만큼 0에서 세어 올라간다
  function countUp(root) {
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) {
      root.querySelectorAll("[data-to]").forEach(el => (el.textContent = el.dataset.to));
      return;
    }
    root.querySelectorAll("[data-to]").forEach(el => {
      const to = +el.dataset.to || 0, dur = 700, t0 = performance.now();
      (function tick(t) {
        const p = Math.min(1, (t - t0) / dur);
        el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3)));   // easeOutCubic
        if (p < 1) requestAnimationFrame(tick);
      })(t0);
    });
  }

  /* ===== 공용 트렌드 카드 빌더 (지금 뜨는 + 검색 디스커버리 공유) ===== */
  const _hue = (str) => { let h = 0; for (const c of String(str || "x")) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const ttThumb = (url, badge) =>
    `<span class="tt-th">${isValidThumbnail(url) ? `<img src="${esc(url)}" referrerpolicy="no-referrer" loading="lazy" onerror="this.style.opacity=0">` : `<span class="sr-noimg">GALLA</span>`}${badge || ""}</span>`;
  const rankBadge = (i) => i < 3 ? `<span class="tt-rk r${i + 1}">${i + 1}</span>` : "";

  function issueCards(list, ranked = true) {
    return list.map((i2, i) => {
      const t2 = (i2.pro_count || 0) + (i2.con_count || 0);
      const pro = t2 ? Math.round((i2.pro_count || 0) / t2 * 100) : 50;
      return `<a class="tt-card" href="issue.html?id=${i2.id}">
        ${ttThumb(issueThumb(i2), (ranked ? rankBadge(i) : "") + (i2.video_url ? `<span class="sr-badge-vid">▶</span>` : ""))}
        <span class="tt-tag">${esc(i2.category || "")} · 갈라 이슈</span>
        <span class="tt-title">${esc(i2.title)}</span>
        <span class="tt-bar"><span class="tt-bar-pro" style="width:${pro}%"></span></span>
        <span class="tt-meta"><span>${ST.like} ${i2.pro_count || 0}</span><span>${ST.dislike} ${i2.con_count || 0}</span></span>
      </a>`;
    });
  }
  // 광장은 썸네일 없는 글이 많다 → 제목 중심 텍스트 카드(있으면 어둡게 깐 배경, 없으면 카테고리 색).
  function plazaCards(list, ranked = true) {
    return list.map((p, i) => {
      const th = isValidThumbnail(p.cover_image) ? p.cover_image : (isValidThumbnail(p.thumbnail) ? p.thumbnail : null);
      const h = _hue(p.category || p.title);
      const bg = th
        ? `background-image:linear-gradient(180deg,rgba(10,10,14,.2),rgba(10,10,14,.85)),url('${esc(th)}');background-size:cover;background-position:center;`
        : `background:linear-gradient(140deg,hsl(${h} 58% 24%),hsl(${(h + 40) % 360} 54% 14%));`;
      return `<a class="tt-card tt-talk" href="plaza_detail.html?id=${p.id}">
        <span class="tt-talk-body" style="${bg}">
          ${ranked ? rankBadge(i) : ""}
          <span class="tt-quote">❝</span>
          <span class="tt-talk-title">${esc(p.title || "")}</span>
        </span>
        <span class="tt-tag">${esc(p.category || "")} · 갈라 광장</span>
        <span class="tt-meta"><span>▲ ${p.up_count || 0}</span><span>▼ ${p.down_count || 0}</span></span>
      </a>`;
    });
  }
  function marketCards(list, ranked = true) {
    return list.map((m, i) =>
      `<a class="tt-card tt-predict" href="predict-market.html?id=${m.id}">
        <span class="tt-th tt-pred-th">${ranked ? rankBadge(i) : ""}<span class="tt-pred-pct">${m._top ? m._top.p + "%" : "?"}</span></span>
        <span class="tt-tag">${esc(m.category || "")}${m._multi ? " · 여러 선택지" : ""} · 예측</span>
        <span class="tt-title">${esc(m.question)}</span>
        <span class="tt-meta"><span>${m._top ? esc(m._top.label) : ""}</span><span>💰 ${Math.round(m.volume || 0).toLocaleString("ko-KR")}P</span></span>
      </a>`);
  }
  function ttShelf(icon, title, cards) {
    return cards.length
      ? `<section class="nh-sec"><div class="hv-sec-h"><span class="hv-sec-t">${icon} ${title}</span></div>
         <div class="tt-shelf">${cards.map((c, i) => c.replace('class="tt-card', `style="--i:${i}" class="tt-card tt-in`)).join("")}</div></section>` : "";
  }
  // 마켓 top outcome 계산 (검색/트렌드 공용)
  async function withMarketTops(markets) {
    if (markets.length) {
      const ids = markets.map(m => m.id);
      const { data: outs } = await supabase.from("market_outcomes")
        .select("market_id,label,pool_yes,pool_no,sort_order").in("market_id", ids);
      const byM = {}; (outs || []).forEach(o => (byM[o.market_id] ||= []).push(o));
      markets.forEach(m => {
        const list = (byM[m.id] || []).sort((a, b) => a.sort_order - b.sort_order);
        m._top = list.map(o => ({ label: o.label, p: Math.round(o.pool_no / (o.pool_yes + o.pool_no) * 100) })).sort((a, b) => b.p - a.p)[0];
        m._multi = m.market_type === "multi";
      });
    }
    return markets;
  }

  /* ===== 검색 빈 화면: 탐색 카테고리 (탭 → 즉시 검색) =====
     '지금 뜨는 콘텐츠'류 선반은 핫트렌드 탭과 중복이라 두지 않는다.
     검색 페이지엔 검색에 특화된 카테고리 바로가기를 둔다. */
  const SE_CATS = [
    { k: "정치", e: "🏛" }, { k: "경제", e: "📈" }, { k: "사회", e: "⚖️" },
    { k: "연예", e: "🎬" }, { k: "스포츠", e: "⚽" }, { k: "세계", e: "🌍" },
    { k: "IT", e: "💻" }, { k: "게임", e: "🎮" }, { k: "연애", e: "💗" },
    { k: "부동산", e: "🏠" }, { k: "주식", e: "💹" }, { k: "날씨", e: "☀️" },
  ];
  function loadDiscover() {
    const wrap = document.getElementById("se-discover");
    if (!wrap) return;
    wrap.innerHTML =
      `<div class="se-block"><div class="se-head"><span>탐색 카테고리</span></div>
        <div class="se-cats">${SE_CATS.map(c => {
          const h = _hue(c.k);
          return `<button class="se-cat" data-kw="${esc(c.k)}" style="--ch:${h}">
            <span class="se-cat-e">${c.e}</span><span class="se-cat-k">${esc(c.k)}</span></button>`;
        }).join("")}</div></div>`;
    wrap.onclick = e => {
      const b = e.target.closest("[data-kw]");
      if (!b) return;
      if (window.GALLA_FX) {
        const r = b.getBoundingClientRect();
        window.GALLA_FX.burst(r.left + r.width / 2, r.top + r.height / 2, { colors: ["#ff3c5a", "#ffb03c", "#4a7bff", "#33d17a"], count: 12, spread: 58 });
      }
      runSearch(b.dataset.kw, true);
    };
  }

  async function loadTrending() {
    const hotWrap = document.getElementById("trending-hot");
    const gallaWrap = document.getElementById("trending-galla");
    hotWrap.innerHTML = `<p class="se-muted">불러오는 중…</p>`;
    gallaWrap.innerHTML = `<p class="se-muted">불러오는 중…</p>`;

    // 1) 실시간 급상승 키워드 — 라이브 모멘텀 보드(카운트업 · 빛 스윕 · 순차 등장)
    const kws = await computeHotKeywords(15);
    if (kws.length) {
      const max = kws[0].count || 1;
      const rows = kws.map((r, i) => `
        <button class="tm-row" style="--i:${i}" data-kw="${esc(r.kw)}">
          <span class="tm-rank r${i < 3 ? i + 1 : 0}">${i + 1}</span>
          <span class="tm-main">
            <span class="tm-kw">${esc(r.kw)}</span>
            <span class="tm-bar"><span class="tm-fill${i < 3 ? " shine" : ""}" style="width:${Math.max(6, Math.round(r.count / max * 100))}%"></span></span>
          </span>
          <span class="tm-cnt" data-to="${r.count}">0</span>
        </button>`);
      hotWrap.innerHTML =
        `<div class="tm-live"><span class="tm-live-dot"></span>LIVE · 실시간 집계</div>
         <div class="tm-board">${trMore(rows, "키워드 더보기")}</div>`;
      countUp(hotWrap);
    } else {
      hotWrap.innerHTML = `<p class="se-muted">최근 6시간 내 뜨는 키워드가 없어요.</p>`;
    }
    hotWrap.onclick = e => {
      trMoreClick(e);
      const b = e.target.closest("[data-kw]");
      if (b) {
        // 키워드 탭 → 재밌는 버스트 후 검색
        if (window.GALLA_FX) {
          const r = b.getBoundingClientRect();
          window.GALLA_FX.burst(r.left + 30, r.top + r.height / 2, { colors: ["#ff3c5a", "#ffb03c", "#4a7bff", "#33d17a"], count: 14, spread: 66 });
        }
        activateTab("search"); runSearch(b.dataset.kw, true);
      }
    };

    // 2) 인기 뉴스(갈라뉴스) + 뜨는 이슈 + 뜨는 갈라 광장 + 뜨는 예측
    const [gnRes, giRes, pzRes, mkRes] = await Promise.all([
      supabase.from("galla_news").select("id,title,summary,category,hero_image,source_count,published_at")
        .eq("status", "published").not("hero_image", "is", null).neq("hero_image", "")
        .order("published_at", { ascending: false }).limit(24),
      supabase.from("issues")
        .select("id,title,category,thumbnail_url,video_url,images,pro_count,con_count,hot_score,created_at")
        .order("hot_score", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false }).limit(12),
      supabase.from("plaza_posts")
        .select("id,title,category,cover_image,thumbnail,up_count,down_count,score,created_at")
        .order("score", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false }).limit(12),
      (async () => {
        const { data } = await supabase.from("markets")
          .select("id,question,category,volume,market_type")
          .eq("resolved", false).order("volume", { ascending: false }).limit(10);
        return withMarketTops(data || []);
      })(),
    ]);

    // 인기 뉴스: 참여도(좋아요+댓글) 상위, 없으면 최신 (썸네일 있는 것만)
    let gnews = (gnRes.data || []).filter(n => isValidThumbnail(n.hero_image));
    if (gnews.length) {
      const ids = gnews.map(n => n.id);
      const [cRes, rRes] = await Promise.all([
        supabase.from("galla_news_comments").select("news_id").in("news_id", ids),
        supabase.from("galla_news_reactions").select("news_id,value").in("news_id", ids),
      ]);
      const cC = {}, lk = {};
      (cRes.data || []).forEach(r => cC[r.news_id] = (cC[r.news_id] || 0) + 1);
      (rRes.data || []).forEach(r => { if (r.value === 1) lk[r.news_id] = (lk[r.news_id] || 0) + 1; });
      gnews.forEach(n => { n._c = cC[n.id] || 0; n._l = lk[n.id] || 0; GALLA_CACHE[n.id] = Object.assign(n, { cCount: n._c, likes: n._l, dislikes: 0, myReact: 0, saved: false }); });
      gnews.sort((a, b) => (b._l + b._c * 2) - (a._l + a._c * 2) || new Date(b.published_at) - new Date(a.published_at));
      gnews = gnews.slice(0, 12);
    }
    const gi = giRes.data || [], plaza = pzRes.data || [], markets = mkRes;

    // 갈라뉴스는 트렌드 전용 카드(썸네일+좋아요·댓글). 나머진 공용 빌더.
    const gnewsItems = gnews.map((n, i) =>
      `<button class="tt-card gn-trend" data-gid="${n.id}">
        ${ttThumb(n.hero_image, rankBadge(i))}
        <span class="tt-tag">${esc(n.category || "")} · 갈라뉴스</span>
        <span class="tt-title">${esc(n.title)}</span>
        <span class="tt-meta"><span>${ST.like} ${n._l}</span><span>${ST.comment} ${n._c}</span></span>
      </button>`);
    const issueItems = issueCards(gi);
    const plazaItems = plazaCards(plaza);
    const marketItems = marketCards(markets);

    gallaWrap.innerHTML =
      ttShelf(SEC.news, "인기 갈라뉴스", gnewsItems)
      + ttShelf(SEC.issue, "뜨는 갈라 이슈", issueItems)
      + ttShelf(SEC.predict, "뜨는 갈라예측", marketItems)
      + ttShelf(SEC.plaza, "뜨는 갈라 광장", plazaItems)
      || `<p class="se-muted">아직 갈라 콘텐츠가 없어요.</p>`;
    gallaWrap.onclick = e => {
      const g = e.target.closest(".gn-trend");
      if (g && g.dataset.gid) openGallaNews(g.dataset.gid);
    };
  }

  /* ================= 뉴스 (실시간) ================= */
  const NEWS_CATEGORIES = ["전체", "정치", "경제", "사회", "세계", "IT과학", "스포츠", "문화", "연예"];
  const CATEGORY_SID_MAP = { "정치": 100, "경제": 101, "사회": 102, "생활문화": 103, "세계": 104, "IT과학": 105, "연예": 106, "스포츠": 107 };
  let currentNewsCategory = "전체";
  let newsPage = 0, isLoadingNews = false, hasMoreNews = true;
  const NEWS_PAGE_SIZE = 30;
  let newsMode = "galla";          // galla | raw(폴백)
  const GALLA_CACHE = {};

  function renderNewsCategoryChips() {
    const wrap = document.getElementById("news-category-chips");
    if (!wrap) return;
    wrap.innerHTML = "";
    NEWS_CATEGORIES.forEach(cat => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = cat;
      if (cat === currentNewsCategory) btn.classList.add("active");
      btn.addEventListener("click", e => {
        e.preventDefault(); e.stopPropagation();
        currentNewsCategory = cat;
        renderNewsCategoryChips();
        resetNews();
      });
      wrap.appendChild(btn);
    });
  }
  function resetNews() {
    newsPage = 0; hasMoreNews = true; isLoadingNews = false;
    const list = document.getElementById("top-news-list");
    if (list) list.innerHTML = "";
    if (currentNewsCategory === "전체") renderNewsHome();
    else loadCategoryNews();
  }

  const shortN = (n) => {
    n = Number(n) || 0;
    if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, "") + "만";
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "천";
    return String(n);
  };

  /* 전체 스탯 카드 (좋아요/싫어요/댓글/저장/공유) — 홈·카테고리 공용 */
  function gallaCard(n) {
    GALLA_CACHE[n.id] = Object.assign(GALLA_CACHE[n.id] || {}, n);
    const th = isValidThumbnail(n.hero_image);
    const me = GALLA_CACHE[n.id];
    return `<div class="news-card galla" data-gid="${n.id}">
      <div class="news-thumb-16x9">${th ? `<img src="${esc(n.hero_image)}" referrerpolicy="no-referrer" loading="lazy" onerror="galla_imgFail(this)">` : ""}</div>
      <div class="news-text">
        <span class="galla-badge">갈라뉴스</span>
        <h3 class="news-title">${esc(n.title)}</h3>
        <div class="news-meta">
          <span>${esc(n.category || "")}</span>
          <span class="news-time">${timeAgo(n.published_at)}</span>
          <span>· 관련 ${n.source_count || 0}건</span>
        </div>
        <div class="gn-cardstats">
          <button type="button" class="gnc-act gnc-cnt gn-like-btn ${me.myReact === 1 ? "on" : ""}"
                  data-gid="${n.id}" data-v="1" aria-label="좋아요">${ST.like} <b>${n.likes || 0}</b></button>
          <button type="button" class="gnc-act gnc-cnt gn-dislike-btn ${me.myReact === -1 ? "on" : ""}"
                  data-gid="${n.id}" data-v="-1" aria-label="싫어요">${ST.dislike} <b>${n.dislikes || 0}</b></button>
          <span class="gnc-cnt">${ST.comment} ${n.cCount || 0}</span>
          <button type="button" class="gnc-act gn-save-btn ${me.saved ? "on" : ""}"
                  data-gid="${n.id}" aria-label="저장">${ST.saved}</button>
          <button type="button" class="gnc-act gn-share-btn"
                  data-gid="${n.id}" data-title="${esc(n.title)}" aria-label="공유">${ST.share}</button>
        </div>
      </div>
    </div>`;
  }

  /* ===== 갈라뉴스 홈 (섹션형 재편) ===== */
  const BREAK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/></svg>';

  // 속보 티커 — 헤드라인이 왼쪽으로 계속 흐른다. 끊김 없는 루프 위해 목록을 2번 이어붙임.
  function breakingLine(items) {
    return items.map(n =>
      `<button type="button" class="nh-break-item" data-gid="${n.id}">${esc(n.title)}</button>`
    ).join('<span class="nh-break-dot">•</span>');
  }
  function breakingTicker(items) {
    const line = breakingLine(items);
    // 개수에 비례한 속도(글자 많을수록 느리게)
    const dur = Math.max(18, items.length * 4);
    return `<div class="nh-break">
      <span class="nh-break-tag">${BREAK_SVG} 속보</span>
      <div class="nh-break-mask">
        <div class="nh-break-flow" style="animation-duration:${dur}s">
          <span class="nh-break-seg">${line}</span>
          <span class="nh-break-dot">•</span>
          <span class="nh-break-seg" aria-hidden="true">${line}</span>
        </div>
      </div>
    </div>`;
  }
  // 45초마다 최신 속보로 교체 (다른 속보들도 계속 노출)
  let breakingTimer = null;
  function startBreakingRefresh() {
    clearInterval(breakingTimer);
    breakingTimer = setInterval(async () => {
      const wrap = document.querySelector(".nh-break-mask");
      const active = document.querySelector(".tab-item.active")?.dataset.tab === "news";
      if (!wrap || !active) return;
      const { data } = await supabase.from("galla_news")
        .select("id,title").eq("status", "published")
        .not("hero_image", "is", null).neq("hero_image", "")
        .order("published_at", { ascending: false }).limit(12);
      if (!data || !data.length) return;
      const line = breakingLine(data);
      wrap.innerHTML = `<div class="nh-break-flow" style="animation-duration:${Math.max(18, data.length * 4)}s">
        <span class="nh-break-seg">${line}</span><span class="nh-break-dot">•</span>
        <span class="nh-break-seg" aria-hidden="true">${line}</span></div>`;
    }, 45000);
  }

  function nhHero(n) {
    GALLA_CACHE[n.id] = Object.assign(GALLA_CACHE[n.id] || {}, n);
    return `<button type="button" class="nh-hero" data-gid="${n.id}">
      <img src="${esc(n.hero_image)}" alt="" referrerpolicy="no-referrer" onerror="this.style.opacity=0">
      <span class="nh-hero-sh"></span>
      <span class="nh-hero-badge">🔴 실시간 베스트</span>
      <span class="nh-hero-tx">
        <span class="nh-hero-cat">${esc(n.category || "")}</span>
        <span class="nh-hero-t">${esc(n.title)}</span>
        <span class="nh-hero-m">${timeAgo(n.published_at)} · 관련 ${n.source_count || 0}건 · 💬 ${n.cCount || 0}</span>
      </span>
    </button>`;
  }
  function nhMini(n) {
    GALLA_CACHE[n.id] = Object.assign(GALLA_CACHE[n.id] || {}, n);
    return `<button type="button" class="nh-mini" data-gid="${n.id}">
      <span class="nh-mini-th"><img src="${esc(n.hero_image)}" alt="" referrerpolicy="no-referrer" loading="lazy" onerror="this.style.opacity=0"></span>
      <span class="nh-mini-t">${esc(n.title)}</span>
      <span class="nh-mini-m">${esc(n.category || "")} · ${timeAgo(n.published_at)}</span>
    </button>`;
  }
  function nhRank(n, i, metric) {
    GALLA_CACHE[n.id] = Object.assign(GALLA_CACHE[n.id] || {}, n);
    const m = metric === "view" ? `조회 ${shortN(n.view_count)}` : `💬 ${shortN(n.cCount)}`;
    return `<button type="button" class="nh-rank" data-gid="${n.id}">
      <span class="nh-rank-no${i < 3 ? " hot" : ""}">${i + 1}</span>
      <span class="nh-rank-b">
        <span class="nh-rank-t">${esc(n.title)}</span>
        <span class="nh-rank-m">${esc(n.category || "")} · ${m}</span>
      </span>
      <span class="nh-rank-th">${isValidThumbnail(n.hero_image) ? `<img src="${esc(n.hero_image)}" alt="" referrerpolicy="no-referrer" loading="lazy" onerror="this.style.opacity=0">` : ""}</span>
    </button>`;
  }
  function nhSec(icon, title, sub) {
    return `<div class="nh-sec-h">${icon || ""}<span class="nh-sec-t">${title}</span>${sub ? `<span class="nh-sec-s">${sub}</span>` : ""}</div>`;
  }
  function shelf(items, fn) {
    return `<div class="nh-shelf">${items.map(fn).join("")}</div>`;
  }

  const CAT_ORDER = ["정치", "경제", "사회", "세계", "IT과학", "스포츠", "문화", "연예"];

  async function renderNewsHome() {
    const list = document.getElementById("top-news-list");
    if (!list) return;
    list.innerHTML = `<div class="hv-skel">${"<span></span>".repeat(4)}</div>`;

    const { data: home, error } = await supabase.rpc("galla_news_home");
    if (error || !home) {          // 폴백: 원본 뉴스
      newsMode = "raw"; list.innerHTML = ""; loadTopNews(); return;
    }
    const best = home.best || [], major = home.major || [], breaking = home.breaking || [];
    const viewed = home.mostViewed || [], commented = home.mostCommented || [], byCat = home.byCategory || {};

    // 내 저장/반응 상태를 후보 전체에 한 번에 반영
    const seen = {};
    [...best, ...major, ...breaking, ...viewed, ...commented, ...Object.values(byCat).flat()]
      .forEach(n => { seen[n.id] = n; });
    const ids = Object.keys(seen);
    if (ME && ids.length) {
      const [{ data: rx }, { data: bm }] = await Promise.all([
        supabase.from("galla_news_reactions").select("news_id,value").in("news_id", ids).eq("user_id", ME.id),
        supabase.from("galla_news_bookmarks").select("news_id").in("news_id", ids).eq("user_id", ME.id),
      ]);
      (rx || []).forEach(r => { GALLA_CACHE[r.news_id] = Object.assign(GALLA_CACHE[r.news_id] || {}, seen[r.news_id], { myReact: r.value }); });
      (bm || []).forEach(r => { GALLA_CACHE[r.news_id] = Object.assign(GALLA_CACHE[r.news_id] || {}, seen[r.news_id], { saved: true }); });
    }

    let html = "";

    // 속보: 실시간으로 왼쪽으로 흐르는 티커
    if (breaking.length) html += breakingTicker(breaking);
    // 히어로 + 실시간 베스트
    if (best.length) {
      html += `<div class="nh-block">${nhHero(best[0])}</div>`;
      if (best.length > 1) {
        html += `<section class="nh-sec">${nhSec(`<span class="nh-live"></span>`, "실시간 베스트", "지금 가장 뜨거운")}
          ${best.slice(1, 6).map(gallaCard).join("")}</section>`;
      }
    }
    // 주요 뉴스 (보도량 많은 큰 사건)
    if (major.length) {
      html += `<section class="nh-sec">${nhSec(SEC.issue, "주요 뉴스", "여러 매체가 주목")}
        ${shelf(major, nhMini)}</section>`;
    }
    // 랭킹: 많이 본 / 댓글 많은
    if (viewed.length) {
      html += `<section class="nh-sec">${nhSec("👀", "많이 본 뉴스")}
        <div class="nh-ranklist">${viewed.map((n, i) => nhRank(n, i, "view")).join("")}</div></section>`;
    }
    if (commented.length) {
      html += `<section class="nh-sec">${nhSec(SEC.plaza, "댓글 많은 뉴스")}
        <div class="nh-ranklist">${commented.map((n, i) => nhRank(n, i, "cmt")).join("")}</div></section>`;
    }
    // 카테고리별
    CAT_ORDER.forEach(cat => {
      const arr = byCat[cat];
      if (!arr || !arr.length) return;
      html += `<section class="nh-sec">${nhSec("", cat, "")}${shelf(arr, nhMini)}
        <button type="button" class="nh-more" data-cat="${cat}">${cat} 더보기 ›</button></section>`;
    });

    list.innerHTML = html || `<p class="se-muted">아직 갈라뉴스가 없어요.</p>`;
    if (breaking.length) startBreakingRefresh();
  }

  /* 카테고리 섹션 피드: 실시간 베스트 · 많이 본 · 댓글 많은 · 실시간 뉴스 */
  async function loadCategoryNews() {
    const list = document.getElementById("top-news-list");
    if (!list) return;
    newsMode = "galla";
    clearInterval(breakingTimer);
    list.innerHTML = `<div class="hv-skel">${"<span></span>".repeat(4)}</div>`;

    const { data: feed, error } = await supabase.rpc("galla_news_category", { p_cat: currentNewsCategory });
    if (error || !feed) { list.innerHTML = `<p class="se-muted">이 카테고리를 불러오지 못했어요.</p>`; return; }
    const best = feed.best || [], viewed = feed.mostViewed || [], commented = feed.mostCommented || [], latest = feed.latest || [];
    if (!best.length && !latest.length) { list.innerHTML = `<p class="se-muted">이 카테고리엔 아직 뉴스가 없어요.</p>`; return; }

    // 내 저장/반응 상태를 후보 전체에 반영
    const seen = {};
    [...best, ...viewed, ...commented, ...latest].forEach(n => { seen[n.id] = n; });
    const ids = Object.keys(seen);
    if (ME && ids.length) {
      const [{ data: rx }, { data: bm }] = await Promise.all([
        supabase.from("galla_news_reactions").select("news_id,value").in("news_id", ids).eq("user_id", ME.id),
        supabase.from("galla_news_bookmarks").select("news_id").in("news_id", ids).eq("user_id", ME.id),
      ]);
      (rx || []).forEach(r => { GALLA_CACHE[r.news_id] = Object.assign(GALLA_CACHE[r.news_id] || {}, seen[r.news_id], { myReact: r.value }); });
      (bm || []).forEach(r => { GALLA_CACHE[r.news_id] = Object.assign(GALLA_CACHE[r.news_id] || {}, seen[r.news_id], { saved: true }); });
    }

    /* 섹션 통폐합: 참여가 적으면 '실시간 베스트(hot)'와 '실시간 뉴스(최신)'가 사실상
       같은 섹션이라 겹친다 → 별도 '실시간 베스트' 섹션을 없애고
       [히어로] + [많이 본(데이터 있을 때)] + [댓글 많은(데이터 있을 때)] + [실시간 뉴스]로 정리.
       많이 본/댓글 많은은 데이터가 쌓이면 자연히 채워지는, 성격이 다른 랭킹만 남긴다. */
    const heroItem = best[0] || latest[0];
    let html = "";
    if (heroItem) html += `<div class="nh-block">${nhHero(heroItem)}</div>`;

    if (viewed.length) {
      html += `<section class="nh-sec">${nhSec("👀", "많이 본 뉴스")}
        <div class="nh-ranklist">${viewed.map((n, i) => nhRank(n, i, "view")).join("")}</div></section>`;
    }
    if (commented.length) {
      html += `<section class="nh-sec">${nhSec(SEC.plaza, "댓글 많은 뉴스")}
        <div class="nh-ranklist">${commented.map((n, i) => nhRank(n, i, "cmt")).join("")}</div></section>`;
    }
    // 실시간 뉴스 = 카테고리 최신 스트림(히어로만 중복 회피)
    const latestRest = (latest || []).filter(n => n.id !== heroItem?.id);
    if (latestRest.length) {
      html += `<section class="nh-sec">${nhSec("⚡", "실시간 뉴스", "최신순")}
        ${latestRest.map(gallaCard).join("")}</section>`;
    }

    list.innerHTML = html;
    document.querySelector(".tab-panel[data-panel='news']")?.scrollIntoView({ block: "start" });
  }

  async function loadTopNews() {
    const list = document.getElementById("top-news-list");
    if (!list || isLoadingNews || !hasMoreNews) return;
    isLoadingNews = true;

    const from = newsPage * NEWS_PAGE_SIZE;
    const to = from + NEWS_PAGE_SIZE - 1;
    const since = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();

    let query = supabase
      .from("news_articles_raw")
      .select("id,title,published_at,url,thumbnail_url,related_group_id,sid,press_name")
      .gte("published_at", since)
      .not("thumbnail_url", "is", null)
      .neq("thumbnail_url", "")
      .order("published_at", { ascending: false })
      .order("id", { ascending: false });
    if (currentNewsCategory !== "전체") query = query.eq("sid", CATEGORY_SID_MAP[currentNewsCategory]);

    const { data, error } = await query.range(from, to);
    if (error) {
      console.error("[NEWS ERROR]", error);
      if (newsPage === 0) list.innerHTML = `<p class="se-muted">뉴스를 불러오지 못했습니다.</p>`;
      isLoadingNews = false; return;
    }
    if (!data || !data.length) {
      if (newsPage === 0) list.innerHTML = `<p class="se-muted">아직 실시간 뉴스가 없습니다.</p>`;
      hasMoreNews = false; isLoadingNews = false; return;
    }
    newsPage += 1;
    isLoadingNews = false;

    const grouped = new Map();
    data.forEach(a => {
      const key = a.related_group_id ?? a.id;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(a);
    });
    grouped.forEach(group => {
      group.sort((a, b) => new Date(a.published_at) - new Date(b.published_at));
      const rep = group.find(a => isValidThumbnail(a.thumbnail_url));
      if (!rep) return;
      const card = document.createElement("div");
      card.className = "news-card";
      card.addEventListener("click", () => openNewsViewer(rep.url, rep.title, rep.press_name));
      card.innerHTML = `
        <div class="news-thumb-16x9"><img src="${esc(rep.thumbnail_url)}" referrerpolicy="no-referrer" loading="lazy" onerror="galla_imgFail(this)"></div>
        <div class="news-text">
          <h3 class="news-title">${esc(rep.title)}</h3>
          <div class="news-meta">
            <span class="news-press">${esc(rep.press_name || "")}</span>
            <span class="news-time">${timeAgo(rep.published_at)}</span>
          </div>
        </div>`;
      list.appendChild(card);
    });
  }


  // 갈라뉴스 카드 클릭 → 갈라뉴스 리더 (원본 뉴스 카드는 자체 핸들러)
  document.getElementById("top-news-list")?.addEventListener("click", e => {
    // 좋아요/싫어요/저장/공유는 카드 열기보다 먼저 가로챈다
    const react = e.target.closest(".gn-like-btn, .gn-dislike-btn");
    if (react) { e.stopPropagation(); reactGnCard(react); return; }
    const save = e.target.closest(".gn-save-btn");
    if (save) { e.stopPropagation(); toggleSaveGnCard(save); return; }
    const share = e.target.closest(".gn-share-btn");
    if (share) { e.stopPropagation(); shareGnCard(share); return; }

    // 홈 '더보기' → 그 카테고리 필터로
    const more = e.target.closest(".nh-more");
    if (more) { currentNewsCategory = more.dataset.cat; renderNewsCategoryChips(); resetNews(); toPageTop(); return; }

    // 홈의 히어로/미니/랭킹/속보 + 스탯카드 모두 기사 열기
    const openEl = e.target.closest("[data-gid]");
    if (openEl && openEl.dataset.gid) openGallaNews(openEl.dataset.gid);
  });

  /* 카드에서 바로 좋아요/싫어요 — 같은 걸 다시 누르면 취소,
     반대쪽을 누르면 갈아탄다(상세 페이지의 reactGn과 같은 규칙). */
  async function reactGnCard(btn) {
    if (needLoginGn()) return;
    const id = btn.dataset.gid;
    const val = Number(btn.dataset.v);
    const n = GALLA_CACHE[id];
    if (!n) return;

    const cur = n.myReact || 0;
    const next = cur === val ? 0 : val;

    const { error } = next === 0
      ? await supabase.from("galla_news_reactions")
          .delete().eq("news_id", id).eq("user_id", ME.id)
      : await supabase.from("galla_news_reactions")
          .upsert({ news_id: id, user_id: ME.id, value: next }, { onConflict: "news_id,user_id" });
    if (error) return;

    // 카운트 재계산
    if (cur === 1) n.likes--; else if (cur === -1) n.dislikes--;
    if (next === 1) n.likes++; else if (next === -1) n.dislikes++;
    n.myReact = next;

    const card = btn.closest(".news-card.galla");
    const like = card.querySelector(".gn-like-btn");
    const dislike = card.querySelector(".gn-dislike-btn");
    like.querySelector("b").textContent = n.likes;
    dislike.querySelector("b").textContent = n.dislikes;
    like.classList.toggle("on", next === 1);
    dislike.classList.toggle("on", next === -1);
  }

  function needLoginGn() {
    if (ME) return false;
    if (confirm("로그인이 필요합니다. 로그인하시겠어요?")) location.href = "login.html";
    return true;
  }

  async function toggleSaveGnCard(btn) {
    if (needLoginGn()) return;
    const id = btn.dataset.gid;
    const on = btn.classList.toggle("on");   // 낙관적 갱신
    const { error } = on
      ? await supabase.from("galla_news_bookmarks").insert({ news_id: id, user_id: ME.id })
      : await supabase.from("galla_news_bookmarks").delete().eq("news_id", id).eq("user_id", ME.id);
    if (error) { btn.classList.toggle("on"); return; }
    if (GALLA_CACHE[id]) GALLA_CACHE[id].saved = on;
  }

  async function shareGnCard(btn) {
    const url = new URL(`news.html?gn=${btn.dataset.gid}`, location.href).href;
    const title = btn.dataset.title || "GALLA 뉴스";
    if (navigator.share) {
      try { await navigator.share({ title, url }); return; }
      catch (err) { if (err.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(url); alert("링크가 복사되었습니다."); }
    catch { alert("링크 복사에 실패했습니다."); }
  }

  // 뉴스 무한 스크롤 (원본 폴백 모드에서만 페이지네이션)
  // SPA에선 문서가 아니라 .view-host가 스크롤되므로 거기에 단다(로직 동일)
  (HOST || window).addEventListener("scroll", () => {
    const nearBottom = HOST
      ? HOST.scrollTop + HOST.clientHeight >= HOST.scrollHeight - 250
      : window.innerHeight + window.scrollY >= document.body.offsetHeight - 250;
    const active = document.querySelector(".tab-item.active")?.dataset.tab;
    if (nearBottom && active === "news" && newsMode === "raw") loadTopNews();
  });

  /* ================= INIT ================= */
  renderRecent();
  showSource("galla");
  loadDiscover();
  showEmpty(true);

  // 옛 딥링크: search.html?gn=<id> → 이제 기사는 news.html 이 담당 (마이페이지 '저장한 뉴스' 등 호환)
  const qs = new URLSearchParams(location.search);
  const gnParam = qs.get("gn");
  if (gnParam) {
    location.replace(`news.html?gn=${encodeURIComponent(gnParam)}`);
  } else if (qs.get("video")) {
    // 핫영상 공유 랜딩(/share/video/<id>)에서 들어온 경우 — 재생은 hot-videos.js가 맡는다
    activateTab("hot", false);
  } else if (["trending", "news", "hot", "plaza"].includes(qs.get("tab"))) {
    // 기사(news.html)에서 뒤로 온 경우 — 보던 탭 그대로
    activateTab(qs.get("tab"), false);
  } else {
    activateTab("search");
    // 첫 진입에도 자동 포커스하지 않는다 — 탐색 먼저, 키보드는 탭할 때
  }
}

/* ═══ 초기화 등록 ═══
   MPA: 기존과 동일하게 DOMContentLoaded 자동 초기화(단독 문서 보존).
   SPA: 자동 초기화하지 않는다 — GALLA_PAGE_TREND.mount()가 유일한 진입. */
if (!GALLA_TREND_SPA) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initTrendPage);
  else initTrendPage();   // (이론상 지연 주입 대비 — search.html은 동기 로드라 위 분기)
}

/* ═══ SPA 뷰 계약 — js/spa/views/trend.js 가 호출 ═══ */
window.GALLA_PAGE_TREND = {
  mount(root) { __trendRoot = root || null; return initTrendPage(); },
  unmount() { /* 탭 판은 keep-alive — 언마운트 없음(라우터 계약) */ },
  /* 구 셸의 shellcmd 'active' 대응(nav.js relay 이식) — 판 복귀 시
     네비 숨김 상태를 현재 body 클래스 기준으로 재교정한다 */
  activate() {
    try {
      const on = document.body.classList.contains("dm-detail")
        || document.body.classList.contains("kb-open")
        || document.body.classList.contains("shorts-open")
        || !!document.getElementById("lv-stage");
      if (window.GALLA_SPA && window.GALLA_SPA.navHide) window.GALLA_SPA.navHide(on);
    } catch (_) {}
  },
  deactivate() {
    // 탭 이탈 시 검색 오버레이가 열려 있으면 닫는다(다른 페이지 위에 남지 않게)
    try { if (__searchLiftDrop) __searchLiftDrop(); } catch (_) {}
  },
  scrolltop() {
    const h = __trendRoot && (__trendRoot.closest(".view-host") || __trendRoot);
    if (h && h.scrollTo) h.scrollTo({ top: 0, behavior: "smooth" });
    else window.scrollTo({ top: 0, behavior: "smooth" });
  },
  /* 구 셸의 shellcmd 'trendtab' 대응 — 조그셔틀 등에서 서브탭 직접 지정 */
  setTab(t) { if (t && window.GALLA_trendSetTab) window.GALLA_trendSetTab(t); },
};
