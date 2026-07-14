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

document.addEventListener("DOMContentLoaded", async () => {
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
    if (name === "search") input.focus();
  }
  tabs.forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault(); e.stopPropagation();
      activateTab(btn.dataset.tab);
    });
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

  async function loadPopular() {
    const kws = await computeHotKeywords(10);
    if (!kws.length) { popularEl.innerHTML =
      `<p class="se-muted">아직 집계된 인기 검색어가 없어요.</p>`; return; }
    popularEl.innerHTML = kws.map((r, i) =>
      `<button class="se-pop" data-kw="${esc(r.kw)}">
        <span class="se-pop-rank ${i < 3 ? "hot" : ""}">${i + 1}</span>
        <span class="se-pop-title">${esc(r.kw)}</span>
       </button>`
    ).join("");
  }
  popularEl.addEventListener("click", e => {
    const b = e.target.closest("[data-kw]");
    if (b) runSearch(b.dataset.kw, true);
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
      .select("id,title,category,nickname,cover_image,thumbnail,up_count,down_count,created_at")
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
          <div class="sr-thumb">${isValidThumbnail(n.thumbnail_url) ? `<img src="${esc(n.thumbnail_url)}" loading="lazy" onerror="galla_imgFail(this)">` : `<span class="sr-noimg">NEWS</span>`}</div>
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
        const th = isValidThumbnail(p.cover_image) ? p.cover_image : (isValidThumbnail(p.thumbnail) ? p.thumbnail : null);
        return `<a class="sr-card" href="plaza_detail.html?id=${p.id}">
          <div class="sr-thumb">${th ? `<img src="${esc(th)}" loading="lazy" onerror="galla_imgFail(this)">` : `<span class="sr-noimg">광장</span>`}</div>
          <div class="sr-body">
            <div class="sr-cat">${esc(p.category || "")}${p.nickname ? " · " + esc(p.nickname) : ""}</div>
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

  async function loadTrending() {
    const hotWrap = document.getElementById("trending-hot");
    const gallaWrap = document.getElementById("trending-galla");
    hotWrap.innerHTML = `<p class="se-muted">불러오는 중…</p>`;
    gallaWrap.innerHTML = `<p class="se-muted">불러오는 중…</p>`;

    // 1) 뜨는 키워드 — 실제 뉴스 제목 빈출어 (5개 + 더보기)
    const kws = await computeHotKeywords(15);
    const kwItems = kws.map((r, i) =>
      `<button class="th-chip" data-kw="${esc(r.kw)}">
        <span class="th-rank ${i < 3 ? "hot" : ""}">${i + 1}</span>
        <span class="th-title">${esc(r.kw)}</span>
        <span class="th-cnt">${r.count}건</span>
      </button>`);
    hotWrap.innerHTML = kwItems.length ? trMore(kwItems, "키워드 더보기") : `<p class="se-muted">최근 6시간 내 뜨는 키워드가 없어요.</p>`;
    hotWrap.onclick = e => {
      trMoreClick(e);
      const b = e.target.closest("[data-kw]");
      if (b) { activateTab("search"); runSearch(b.dataset.kw, true); }
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
        const markets = data || [];
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

    const gnewsItems = gnews.map(n => {
      const th = isValidThumbnail(n.hero_image);
      return `<div class="sr-card gn-trend" data-gid="${n.id}">
        <div class="sr-thumb">${th ? `<img src="${esc(n.hero_image)}" loading="lazy" onerror="galla_imgFail(this)">` : `<span class="sr-noimg">GALLA</span>`}</div>
        <div class="sr-body">
          <div class="sr-cat">${esc(n.category || "")} · 갈라뉴스</div>
          <div class="sr-title">${esc(n.title)}</div>
          <div class="sr-meta sr-stats">
            <span>${ST.like} ${n._l}</span>
            <span>${ST.comment} ${n._c}</span>
            <span>${timeAgo(n.published_at)}</span>
          </div>
        </div>
      </div>`;
    });
    const issueItems = gi.map(i => {
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
    });
    const plazaItems = plaza.map(p => {
      const th = isValidThumbnail(p.cover_image) ? p.cover_image : (isValidThumbnail(p.thumbnail) ? p.thumbnail : null);
      return `<a class="sr-card" href="plaza_detail.html?id=${p.id}">
        <div class="sr-thumb">${th ? `<img src="${esc(th)}" loading="lazy" onerror="galla_imgFail(this)">` : `<span class="sr-noimg">광장</span>`}</div>
        <div class="sr-body">
          <div class="sr-cat">${esc(p.category || "")} · 갈라 광장</div>
          <div class="sr-title">${esc(p.title || "")}</div>
          <div class="sr-meta sr-stats"><span>${ST.like} ${p.up_count || 0}</span><span>${ST.dislike} ${p.down_count || 0}</span></div>
        </div>
      </a>`;
    });
    const marketItems = markets.map(m =>
      `<a class="sr-card predict" href="predict-market.html?id=${m.id}">
        <div class="sr-body">
          <div class="sr-cat">${esc(m.category || "")}${m._multi ? " · 여러 선택지" : ""}</div>
          <div class="sr-title">${esc(m.question)}</div>
          ${m._top ? `<div class="sr-pred"><b>${m._top.p}%</b> <span>${esc(m._top.label)}</span></div>` : ""}
          <div class="sr-meta">💰 거래량 ${Math.round(m.volume || 0).toLocaleString("ko-KR")}P</div>
        </div>
        <div class="sr-go">›</div>
      </a>`);

    const html = trGroup("📰 인기 뉴스", gnewsItems) + trGroup("🗳 뜨는 이슈", issueItems)
      + trGroup("🔮 뜨는 예측", marketItems) + trGroup("🗣 뜨는 갈라 광장", plazaItems);
    gallaWrap.innerHTML = html || `<p class="se-muted">아직 갈라 콘텐츠가 없어요.</p>`;
    gallaWrap.onclick = e => {
      trMoreClick(e);
      const g = e.target.closest(".gn-trend");
      if (g && g.dataset.gid) openGallaNews(g.dataset.gid);
    };
  }

  /* ================= 뉴스 (실시간) ================= */
  const NEWS_CATEGORIES = ["전체", "정치", "경제", "사회", "생활문화", "세계", "IT과학", "연예", "스포츠"];
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
    loadGallaNews();
  }

  /* ===== 갈라뉴스 (AI 종합 기사) ===== */
  async function loadGallaNews() {
    const list = document.getElementById("top-news-list");
    if (!list) return;
    newsMode = "galla";
    list.innerHTML = `<p class="se-muted">불러오는 중…</p>`;
    let q = supabase.from("galla_news")
      .select("id,title,summary,category,hero_image,source_count,published_at")
      .eq("status", "published")
      .not("hero_image", "is", null).neq("hero_image", "")   // 썸네일 없는 뉴스 제외
      .order("published_at", { ascending: false }).limit(40);
    if (currentNewsCategory !== "전체") q = q.eq("category", currentNewsCategory);
    let { data: news } = await q;
    news = (news || []).filter(n => isValidThumbnail(n.hero_image));

    if (!news || !news.length) {         // 아직 갈라뉴스 없으면 원본 뉴스 폴백
      newsMode = "raw";
      list.innerHTML = "";
      loadTopNews();
      return;
    }

    // 반응·댓글·저장 집계(리스트 일괄)
    const ids = news.map(n => n.id);
    const [cRes, rRes, bRes] = await Promise.all([
      supabase.from("galla_news_comments").select("news_id").in("news_id", ids),
      supabase.from("galla_news_reactions").select("news_id,value,user_id").in("news_id", ids),
      ME ? supabase.from("galla_news_bookmarks").select("news_id").in("news_id", ids).eq("user_id", ME.id) : Promise.resolve({ data: [] }),
    ]);
    const cCount = {}, likes = {}, dislikes = {}, myReact = {}, saved = new Set();
    (cRes.data || []).forEach(r => cCount[r.news_id] = (cCount[r.news_id] || 0) + 1);
    (rRes.data || []).forEach(r => {
      if (r.value === 1) likes[r.news_id] = (likes[r.news_id] || 0) + 1;
      else dislikes[r.news_id] = (dislikes[r.news_id] || 0) + 1;
      if (ME && r.user_id === ME.id) myReact[r.news_id] = r.value;
    });
    (bRes.data || []).forEach(r => saved.add(r.news_id));

    list.innerHTML = news.map(n => {
      GALLA_CACHE[n.id] = Object.assign(n, {
        cCount: cCount[n.id] || 0, likes: likes[n.id] || 0, dislikes: dislikes[n.id] || 0,
        myReact: myReact[n.id] || 0, saved: saved.has(n.id),
      });
      const th = isValidThumbnail(n.hero_image);
      return `<div class="news-card galla" data-gid="${n.id}">
        <div class="news-thumb-16x9">${th ? `<img src="${esc(n.hero_image)}" loading="lazy" onerror="galla_imgFail(this)">` : ""}</div>
        <div class="news-text">
          <span class="galla-badge">갈라뉴스</span>
          <h3 class="news-title">${esc(n.title)}</h3>
          <div class="news-meta">
            <span>${esc(n.category || "")}</span>
            <span class="news-time">${timeAgo(n.published_at)}</span>
            <span>· 관련 ${n.source_count || 0}건</span>
          </div>
          <div class="gn-cardstats">
            <span>${ST.like} ${n.likes}</span>
            <span>${ST.dislike} ${n.dislikes}</span>
            <span>${ST.comment} ${n.cCount}</span>
            <button type="button" class="gnc-act gn-save-btn ${n.saved ? "on" : ""}"
                    data-gid="${n.id}" aria-label="저장">${ST.saved}</button>
            <button type="button" class="gnc-act gn-share-btn"
                    data-gid="${n.id}" data-title="${esc(n.title)}" aria-label="공유">${ST.share}</button>
          </div>
        </div>
      </div>`;
    }).join("");
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
        <div class="news-thumb-16x9"><img src="${esc(rep.thumbnail_url)}" loading="lazy" onerror="galla_imgFail(this)"></div>
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
    // 저장/공유는 카드 열기보다 먼저 가로챈다
    const save = e.target.closest(".gn-save-btn");
    if (save) { e.stopPropagation(); toggleSaveGnCard(save); return; }
    const share = e.target.closest(".gn-share-btn");
    if (share) { e.stopPropagation(); shareGnCard(share); return; }

    const g = e.target.closest(".news-card.galla");
    if (g && g.dataset.gid) openGallaNews(g.dataset.gid);
  });

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
  window.addEventListener("scroll", () => {
    const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 250;
    const active = document.querySelector(".tab-item.active")?.dataset.tab;
    if (nearBottom && active === "news" && newsMode === "raw") loadTopNews();
  });

  /* ================= INIT ================= */
  renderRecent();
  loadPopular();
  showEmpty(true);

  // 옛 딥링크: search.html?gn=<id> → 이제 기사는 news.html 이 담당 (마이페이지 '저장한 뉴스' 등 호환)
  const qs = new URLSearchParams(location.search);
  const gnParam = qs.get("gn");
  if (gnParam) {
    location.replace(`news.html?gn=${encodeURIComponent(gnParam)}`);
  } else if (qs.get("video")) {
    // 핫영상 공유 랜딩(/share/video/<id>)에서 들어온 경우 — 재생은 hot-videos.js가 맡는다
    activateTab("hot", false);
  } else if (["trending", "news", "hot"].includes(qs.get("tab"))) {
    // 기사(news.html)에서 뒤로 온 경우 — 보던 탭 그대로
    activateTab(qs.get("tab"), false);
  } else {
    activateTab("search");
    input.focus();
  }
});
