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

document.addEventListener("DOMContentLoaded", async () => {
  const supabase = await waitForSupabaseClient();

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

  const viewerModal = document.getElementById("news-viewer-modal");
  const viewerFrame = document.getElementById("news-viewer-iframe");
  const viewerClose = document.getElementById("news-viewer-close");
  const viewerTitle = document.getElementById("news-viewer-title");
  const viewerExt = document.getElementById("news-viewer-ext");
  const viewerFallback = document.getElementById("news-viewer-fallback");
  const viewerFallbackBtn = document.getElementById("news-viewer-fallback-btn");

  function closeNewsViewer() {
    viewerModal.classList.add("hidden");
    viewerFrame.src = "";
    document.body.style.overflow = "";
  }
  viewerClose?.addEventListener("click", closeNewsViewer);

  /* ================= 탭 ================= */
  let trendingLoaded = false, newsInit = false;
  function activateTab(name) {
    tabs.forEach(b => b.classList.toggle("active", b.dataset.tab === name));
    panels.forEach(p => p.classList.toggle("active", p.dataset.panel === name));
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

  /* ================= 인기 검색어 (뉴스 핫키워드) ================= */
  async function loadPopular() {
    const { data } = await supabase
      .from("hot_trend_groups_6h")
      .select("title, article_count")
      .order("article_count", { ascending: false })
      .limit(10);
    if (!data || !data.length) { popularEl.innerHTML =
      `<p class="se-muted">아직 집계된 인기 검색어가 없어요.</p>`; return; }
    popularEl.innerHTML = data.map((r, i) =>
      `<button class="se-pop" data-kw="${esc(r.title)}">
        <span class="se-pop-rank ${i < 3 ? "hot" : ""}">${i + 1}</span>
        <span class="se-pop-title">${esc(r.title)}</span>
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

  const doSearch = debounce(async q => {
    const my = ++seq;
    const [issues, markets, news] = await Promise.all([
      searchIssues(q), searchMarkets(q), searchNews(q)
    ]);
    if (my !== seq) return; // 최신 입력만 반영
    renderResults(q, issues, markets, news);
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

  function renderResults(q, issues, markets, news) {
    const total = issues.length + markets.length + news.length;
    if (!total) {
      resultsEl.innerHTML =
        `<div class="sr-none">‘${esc(q)}’ 검색 결과가 없어요.<br><span>다른 키워드로 검색해 보세요.</span></div>`;
      return;
    }
    let html = "";

    if (issues.length) {
      html += `<div class="sr-sec"><div class="sr-sec-head">🗳 갈라 이슈 <b>${issues.length}</b></div>`;
      html += issues.map(i => {
        const th = issueThumb(i);
        const total2 = (i.pro_count || 0) + (i.con_count || 0);
        const pro = total2 ? Math.round((i.pro_count || 0) / total2 * 100) : 50;
        return `<a class="sr-card" href="issue.html?id=${i.id}">
          <div class="sr-thumb">${th ? `<img src="${esc(th)}" loading="lazy" onerror="galla_imgFail(this)">` : `<span class="sr-noimg">GALLA</span>`}${i.video_url ? `<span class="sr-badge-vid">▶</span>` : ""}</div>
          <div class="sr-body">
            <div class="sr-cat">${esc(i.category || "")}</div>
            <div class="sr-title">${esc(i.title)}</div>
            <div class="sr-bar"><div class="sr-bar-pro" style="width:${pro}%"></div></div>
            <div class="sr-meta">👍 ${i.pro_count || 0} · 👎 ${i.con_count || 0}</div>
          </div>
        </a>`;
      }).join("");
      html += `</div>`;
    }

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

    resultsEl.innerHTML = html;
  }

  // 뉴스 결과 카드 클릭 → 기사 뷰어
  resultsEl.addEventListener("click", e => {
    const news = e.target.closest(".sr-card.news");
    if (news) {
      const url = news.dataset.url;
      if (url) openNewsViewer(url, news.dataset.title, news.dataset.press);
    }
  });

  /* ================= 지금 뜨는 ================= */
  async function loadTrending() {
    const hotWrap = document.getElementById("trending-hot");
    const gallaWrap = document.getElementById("trending-galla");
    hotWrap.innerHTML = `<p class="se-muted">불러오는 중…</p>`;

    const { data: hot } = await supabase
      .from("hot_trend_groups_6h")
      .select("group_id,title,article_count")
      .order("article_count", { ascending: false })
      .limit(10);
    if (hot && hot.length) {
      hotWrap.innerHTML = hot.map((r, i) =>
        `<button class="th-chip" data-kw="${esc(r.title)}">
          <span class="th-rank ${i < 3 ? "hot" : ""}">${i + 1}</span>
          <span class="th-title">${esc(r.title)}</span>
          <span class="th-cnt">${r.article_count}</span>
        </button>`
      ).join("");
    } else {
      hotWrap.innerHTML = `<p class="se-muted">최근 6시간 내 뜨는 키워드가 없어요.</p>`;
    }
    hotWrap.onclick = e => {
      const b = e.target.closest("[data-kw]");
      if (b) { activateTab("search"); runSearch(b.dataset.kw, true); }
    };

    // 갈라에서 뜨는 이슈 (hot_score 우선, 없으면 최신)
    const { data: gi } = await supabase
      .from("issues")
      .select("id,title,category,thumbnail_url,video_url,images,pro_count,con_count,hot_score,created_at")
      .order("hot_score", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(10);
    if (gi && gi.length) {
      gallaWrap.innerHTML = `<div class="sr-sec">` + gi.map(i => {
        const th = issueThumb(i);
        const t2 = (i.pro_count || 0) + (i.con_count || 0);
        const pro = t2 ? Math.round((i.pro_count || 0) / t2 * 100) : 50;
        return `<a class="sr-card" href="issue.html?id=${i.id}">
          <div class="sr-thumb">${th ? `<img src="${esc(th)}" loading="lazy" onerror="galla_imgFail(this)">` : `<span class="sr-noimg">GALLA</span>`}${i.video_url ? `<span class="sr-badge-vid">▶</span>` : ""}</div>
          <div class="sr-body">
            <div class="sr-cat">${esc(i.category || "")}</div>
            <div class="sr-title">${esc(i.title)}</div>
            <div class="sr-bar"><div class="sr-bar-pro" style="width:${pro}%"></div></div>
            <div class="sr-meta">👍 ${i.pro_count || 0} · 👎 ${i.con_count || 0}</div>
          </div>
        </a>`;
      }).join("") + `</div>`;
    } else {
      gallaWrap.innerHTML = `<p class="se-muted">아직 이슈가 없어요.</p>`;
    }
  }

  /* ================= 뉴스 (실시간) ================= */
  const NEWS_CATEGORIES = ["전체", "정치", "경제", "사회", "생활문화", "세계", "IT과학", "연예", "스포츠"];
  const CATEGORY_SID_MAP = { "정치": 100, "경제": 101, "사회": 102, "생활문화": 103, "세계": 104, "IT과학": 105, "연예": 106, "스포츠": 107 };
  let currentNewsCategory = "전체";
  let newsPage = 0, isLoadingNews = false, hasMoreNews = true;
  const NEWS_PAGE_SIZE = 30;

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
    loadTopNews();
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

  // iframe 삽입이 막히는(X-Frame-Options) 대표 도메인 → 처음부터 폴백 화면
  const IFRAME_BLOCKED = ["naver.com", "daum.net", "chosun.com", "joins.com", "joongang.co.kr",
    "hani.co.kr", "mk.co.kr", "sedaily.com", "khan.co.kr", "yna.co.kr", "yonhapnews",
    "donga.com", "hankyung.com", "sbs.co.kr", "kbs.co.kr", "imbc.com", "jtbc.co.kr"];

  function openNewsViewer(url, title, press) {
    if (!url) return;
    viewerTitle.textContent = title || press || "기사 보기";
    viewerExt.href = url;
    viewerFallbackBtn.href = url;
    document.querySelector("#news-viewer-fallback .nvf-title").textContent = title || "";
    viewerModal.classList.remove("hidden");
    document.body.style.overflow = "hidden";

    const blocked = IFRAME_BLOCKED.some(d => url.includes(d));
    if (blocked) {
      // 앱 안 삽입 불가 → 폴백(원문 열기 버튼)만 표시
      viewerFrame.style.display = "none";
      viewerFrame.src = "";
      viewerFallback.hidden = false;
    } else {
      viewerFallback.hidden = true;
      viewerFrame.style.display = "block";
      viewerFrame.src = url;
      // 일부 사이트는 헤더 차단으로 빈 화면 → 3.5초 안에 로드 못하면 폴백 노출
      clearTimeout(viewerFrame.__t);
      let loaded = false;
      viewerFrame.onload = () => { loaded = true; };
      viewerFrame.__t = setTimeout(() => {
        if (!loaded) { viewerFrame.style.display = "none"; viewerFallback.hidden = false; }
      }, 2500);
    }
  }

  // 뉴스 무한 스크롤
  window.addEventListener("scroll", () => {
    const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 250;
    const active = document.querySelector(".tab-item.active")?.dataset.tab;
    if (nearBottom && active === "news") loadTopNews();
  });

  /* ================= INIT ================= */
  renderRecent();
  loadPopular();
  showEmpty(true);
  activateTab("search");
  input.focus();
});
