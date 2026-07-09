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

  const viewerModal = document.getElementById("news-viewer-modal");
  const viewerReader = document.getElementById("news-viewer-reader");
  const viewerClose = document.getElementById("news-viewer-close");
  const viewerTitle = document.getElementById("news-viewer-title");
  const viewerExt = document.getElementById("news-viewer-ext");
  const viewerFallback = document.getElementById("news-viewer-fallback");
  const viewerFallbackBtn = document.getElementById("news-viewer-fallback-btn");

  function closeNewsViewer() {
    viewerModal.classList.add("hidden");
    viewerReader.innerHTML = "";
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
    gallaWrap.innerHTML = `<p class="se-muted">불러오는 중…</p>`;

    // 1) 뜨는 키워드 — 실제 뉴스 제목 빈출어
    const kws = await computeHotKeywords(12);
    hotWrap.innerHTML = kws.length
      ? kws.map((r, i) =>
        `<button class="th-chip" data-kw="${esc(r.kw)}">
          <span class="th-rank ${i < 3 ? "hot" : ""}">${i + 1}</span>
          <span class="th-title">${esc(r.kw)}</span>
          <span class="th-cnt">${r.count}건</span>
        </button>`).join("")
      : `<p class="se-muted">최근 6시간 내 뜨는 키워드가 없어요.</p>`;
    hotWrap.onclick = e => {
      const b = e.target.closest("[data-kw]");
      if (b) { activateTab("search"); runSearch(b.dataset.kw, true); }
    };

    // 2) 갈라에서 뜨는 — 예측(마켓) + 이슈
    const [mkRes, giRes] = await Promise.all([
      (async () => {
        const { data } = await supabase.from("markets")
          .select("id,question,category,volume,market_type")
          .eq("resolved", false).order("volume", { ascending: false }).limit(6);
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
      supabase.from("issues")
        .select("id,title,category,thumbnail_url,video_url,images,pro_count,con_count,hot_score,created_at")
        .order("hot_score", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false }).limit(8),
    ]);

    const markets = mkRes, gi = giRes.data || [];
    let html = "";
    if (markets.length) {
      html += `<div class="tr-group"><div class="tr-group-head">🔮 뜨는 예측</div>` + markets.map(m =>
        `<a class="sr-card predict" href="predict-market.html?id=${m.id}">
          <div class="sr-body">
            <div class="sr-cat">${esc(m.category || "")}${m._multi ? " · 여러 선택지" : ""}</div>
            <div class="sr-title">${esc(m.question)}</div>
            ${m._top ? `<div class="sr-pred"><b>${m._top.p}%</b> <span>${esc(m._top.label)}</span></div>` : ""}
            <div class="sr-meta">💰 거래량 ${Math.round(m.volume || 0).toLocaleString("ko-KR")}P</div>
          </div>
          <div class="sr-go">›</div>
        </a>`).join("") + `</div>`;
    }
    if (gi.length) {
      html += `<div class="tr-group"><div class="tr-group-head">🗳 뜨는 이슈</div>` + gi.map(i => {
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
    }
    gallaWrap.innerHTML = html || `<p class="se-muted">아직 갈라 콘텐츠가 없어요.</p>`;
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
      .order("published_at", { ascending: false }).limit(40);
    if (currentNewsCategory !== "전체") q = q.eq("category", currentNewsCategory);
    const { data: news } = await q;

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
            <span>👍 ${n.likes}</span>
            <span>👎 ${n.dislikes}</span>
            <span>💬 ${n.cCount}</span>
            ${n.saved ? `<span class="gn-saved">🔖 저장됨</span>` : ""}
          </div>
        </div>
      </div>`;
    }).join("");
  }

  async function openGallaNews(id) {
    const n = GALLA_CACHE[id];
    if (!n) return;
    viewerTitle.textContent = n.title || "갈라뉴스";
    viewerExt.style.display = "none";
    viewerFallback.hidden = true;
    viewerReader.hidden = false;
    viewerReader.scrollTop = 0;
    viewerReader.innerHTML = `<div class="reader-loading">불러오는 중…</div>`;
    viewerModal.classList.remove("hidden");
    document.body.style.overflow = "hidden";

    const { data: srcs } = await supabase.from("galla_news_sources")
      .select("url,press_name,title,thumbnail_url").eq("news_id", id);

    const paras = (n.body || "").split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
    // body가 리스트 조회엔 없어 상세에서 다시 가져오기
    let bodyParas = paras;
    if (!bodyParas.length) {
      const { data: full } = await supabase.from("galla_news").select("body").eq("id", id).single();
      bodyParas = (full?.body || "").split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
    }

    const srcHtml = (srcs || []).map(s =>
      `<a class="reader-src" href="${esc(s.url || "#")}" target="_blank" rel="noopener noreferrer">
        <div class="reader-src-thumb">${isValidThumbnail(s.thumbnail_url) ? `<img src="${esc(s.thumbnail_url)}" loading="lazy" onerror="galla_imgFail(this)">` : ""}</div>
        <div class="reader-src-body">
          <div class="reader-src-title">${esc(s.title || "")}</div>
          <div class="reader-src-press">${esc(s.press_name || "")} ↗</div>
        </div>
      </a>`).join("");

    viewerReader.innerHTML = `
      <article class="reader">
        <span class="reader-badge">갈라뉴스 · AI 종합</span>
        <h1 class="reader-title">${esc(n.title)}</h1>
        <div class="reader-sub">${esc(n.category || "")} · ${timeAgo(n.published_at)}</div>
        ${isValidThumbnail(n.hero_image) ? `<img class="reader-hero" src="${esc(n.hero_image)}" onerror="this.style.display='none'">` : ""}
        ${bodyParas.map(p => `<p>${esc(p)}</p>`).join("")}
        <div class="gn-actions" id="gn-actions"></div>
        ${srcHtml ? `<div class="reader-sources"><div class="reader-sources-head">🔗 관련 기사 (출처 · 팩트체크)</div>${srcHtml}</div>` : ""}
        <p class="reader-disclaimer">본 기사는 위 보도들을 AI가 종합·재작성한 것입니다. 사진·사실의 출처는 각 언론사에 있습니다.</p>
        <div id="gn-comments" class="gn-comments"></div>
      </article>`;
    GN_OPEN = id;
    renderGnActions();
    loadGnComments(id);
  }

  /* ===== 갈라뉴스 액션바 (좋아요/싫어요/댓글/저장) ===== */
  let GN_OPEN = null;
  function renderGnActions() {
    const bar = document.getElementById("gn-actions");
    const n = GALLA_CACHE[GN_OPEN];
    if (!bar || !n) return;
    bar.innerHTML = `
      <button class="gn-act ${n.myReact === 1 ? "on like" : ""}" data-act="like">👍 <span>${n.likes}</span></button>
      <button class="gn-act ${n.myReact === -1 ? "on dislike" : ""}" data-act="dislike">👎 <span>${n.dislikes}</span></button>
      <button class="gn-act" data-act="comment">💬 <span>${n.cCount}</span></button>
      <button class="gn-act ${n.saved ? "on save" : ""}" data-act="save">${n.saved ? "🔖 저장됨" : "🔖 저장"}</button>`;
    bar.querySelectorAll(".gn-act").forEach(b => b.addEventListener("click", () => {
      const act = b.dataset.act;
      if (act === "like") reactGn(1);
      else if (act === "dislike") reactGn(-1);
      else if (act === "save") saveGn();
      else if (act === "comment") document.getElementById("gn-comments")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }));
  }
  async function reactGn(val) {
    if (needLogin()) return;
    const n = GALLA_CACHE[GN_OPEN]; if (!n) return;
    const cur = n.myReact || 0;
    if (cur === val) {
      await supabase.from("galla_news_reactions").delete().eq("news_id", GN_OPEN).eq("user_id", ME.id);
      if (val === 1) n.likes--; else n.dislikes--;
      n.myReact = 0;
    } else {
      await supabase.from("galla_news_reactions").upsert({ news_id: GN_OPEN, user_id: ME.id, value: val }, { onConflict: "news_id,user_id" });
      if (cur === 1) n.likes--; else if (cur === -1) n.dislikes--;
      if (val === 1) n.likes++; else n.dislikes++;
      n.myReact = val;
    }
    renderGnActions();
  }
  async function saveGn() {
    if (needLogin()) return;
    const n = GALLA_CACHE[GN_OPEN]; if (!n) return;
    if (n.saved) {
      await supabase.from("galla_news_bookmarks").delete().eq("news_id", GN_OPEN).eq("user_id", ME.id);
      n.saved = false;
    } else {
      await supabase.from("galla_news_bookmarks").insert({ news_id: GN_OPEN, user_id: ME.id });
      n.saved = true;
    }
    renderGnActions();
  }

  /* ===== 갈라뉴스 배틀 댓글 (대댓글 + @멘션 + 좋아요) ===== */
  async function fetchProfiles(ids) {
    const uniq = [...new Set(ids.filter(Boolean))];
    if (!uniq.length) return {};
    const { data } = await supabase.from("user_profiles").select("user_id,nickname").in("user_id", uniq);
    const m = {}; (data || []).forEach(p => m[p.user_id] = p); return m;
  }
  function needLogin() {
    if (ME) return false;
    if (confirm("로그인이 필요합니다. 로그인하시겠어요?")) location.href = "login.html";
    return true;
  }
  const cmtBody = c => esc(c).replace(/@(\S+)/g, '<span class="gnc-mention">@$1</span>');

  let GNC = null, GNC_NEWS = null, GNC_TOP_LIMIT = 8;
  const GNC_EXPANDED = new Set();

  async function loadGnComments(newsId) {
    GNC_NEWS = newsId; GNC_TOP_LIMIT = 8; GNC_EXPANDED.clear();
    const { data: rows } = await supabase.from("galla_news_comments")
      .select("id,user_id,content,created_at,parent_id").eq("news_id", newsId)
      .order("created_at", { ascending: true }).limit(500);
    const profs = await fetchProfiles((rows || []).map(c => c.user_id));
    const ids = (rows || []).map(c => c.id);
    const likeAgg = {}; const myLikes = new Set();
    if (ids.length) {
      const { data: likes } = await supabase.from("galla_news_comment_likes").select("comment_id,user_id").in("comment_id", ids);
      likes?.forEach(l => { likeAgg[l.comment_id] = (likeAgg[l.comment_id] || 0) + 1; if (ME && l.user_id === ME.id) myLikes.add(l.comment_id); });
    }
    const tops = (rows || []).filter(c => !c.parent_id).reverse();
    const childrenOf = {}; (rows || []).forEach(c => { if (c.parent_id) (childrenOf[c.parent_id] ||= []).push(c); });
    Object.values(childrenOf).forEach(a => a.sort((x, y) => new Date(x.created_at) - new Date(y.created_at)));
    GNC = { tops, childrenOf, profs, likeAgg, myLikes };
    renderGnComments();
  }

  function renderGnComments() {
    const box = document.getElementById("gn-comments");
    if (!box || !GNC) return;
    const { tops, childrenOf, profs, likeAgg, myLikes } = GNC;
    const nick = uid => profs[uid]?.nickname || "익명";
    const total = tops.length + Object.values(childrenOf).reduce((a, b) => a + b.length, 0);

    const cmt = (c, isReply, topId) => {
      const liked = myLikes.has(c.id);
      return `<div class="gnc ${isReply ? "reply" : ""}" data-id="${c.id}" data-top="${topId}" data-author="${esc(nick(c.user_id))}">
        <div class="gnc-av">${esc((nick(c.user_id).trim().charAt(0) || "익"))}</div>
        <div class="gnc-main">
          <div class="gnc-head"><span class="gnc-name">${esc(nick(c.user_id))}</span><span class="gnc-time">${timeAgo(c.created_at)}</span></div>
          <div class="gnc-text">${cmtBody(c.content)}</div>
          <div class="gnc-actions">
            <button class="gnc-like ${liked ? "on" : ""}" data-id="${c.id}">♥ <span>${likeAgg[c.id] || 0}</span></button>
            <button class="gnc-reply" data-id="${c.id}">답글</button>
          </div>
        </div>
      </div>`;
    };
    const thread = c => {
      const kids = childrenOf[c.id] || [];
      const exp = GNC_EXPANDED.has(c.id);
      let rep = "";
      if (kids.length) {
        rep = exp
          ? `<div class="gnc-replies">${kids.map(k => cmt(k, true, c.id)).join("")}</div><button class="gnc-toggle" data-top="${c.id}" data-act="collapse">답글 숨기기 ▴</button>`
          : `<button class="gnc-toggle" data-top="${c.id}" data-act="expand">${kids.length}개 답글 보기 ▾</button>`;
      }
      return `<div class="gnc-thread">${cmt(c, false, c.id)}${rep}<div class="gnc-rb" id="gnc-rb-${c.id}" hidden></div></div>`;
    };
    const shown = tops.slice(0, GNC_TOP_LIMIT);
    const remaining = tops.length - shown.length;

    box.innerHTML = `
      <div class="gnc-title">💬 댓글 ${total}</div>
      <div class="gnc-compose">
        <input id="gncInput" class="gnc-input" maxlength="300" placeholder="의견을 남기고 붙어보세요…">
        <button id="gncSend" class="gnc-send">게시</button>
      </div>
      <div class="gnc-list">${tops.length ? shown.map(thread).join("") : '<div class="gnc-empty">첫 댓글을 남겨보세요!</div>'}</div>
      ${remaining > 0 ? `<button id="gncMore" class="gnc-more">댓글 더 보기 (${remaining})</button>` : ""}`;

    const inp = document.getElementById("gncInput");
    document.getElementById("gncSend").addEventListener("click", () => postGnComment(inp.value, null));
    inp.addEventListener("keydown", e => { if (e.key === "Enter") postGnComment(inp.value, null); });
    document.getElementById("gncMore")?.addEventListener("click", () => { GNC_TOP_LIMIT += 10; renderGnComments(); });
    box.querySelectorAll(".gnc-toggle").forEach(b => b.addEventListener("click", () => {
      const id = Number(b.dataset.top);
      if (b.dataset.act === "expand") GNC_EXPANDED.add(id); else GNC_EXPANDED.delete(id);
      renderGnComments();
    }));
    box.querySelectorAll(".gnc-like").forEach(b => b.addEventListener("click", async () => {
      if (needLogin()) return;
      const id = Number(b.dataset.id), on = b.classList.contains("on"), span = b.querySelector("span"), n = Number(span.textContent);
      if (on) { await supabase.from("galla_news_comment_likes").delete().eq("comment_id", id).eq("user_id", ME.id); b.classList.remove("on"); span.textContent = Math.max(0, n - 1); GNC.myLikes.delete(id); GNC.likeAgg[id] = (GNC.likeAgg[id] || 1) - 1; }
      else { const { error } = await supabase.from("galla_news_comment_likes").insert({ comment_id: id, user_id: ME.id }); if (!error) { b.classList.add("on"); span.textContent = n + 1; GNC.myLikes.add(id); GNC.likeAgg[id] = (GNC.likeAgg[id] || 0) + 1; } }
    }));
    box.querySelectorAll(".gnc-reply").forEach(b => b.addEventListener("click", () => {
      if (needLogin()) return;
      const el = b.closest(".gnc"), topId = Number(el.dataset.top), author = el.dataset.author;
      GNC_EXPANDED.add(topId);
      if (!document.getElementById("gnc-rb-" + topId)) { renderGnComments(); }
      const rb = document.getElementById("gnc-rb-" + topId);
      rb.hidden = false;
      rb.innerHTML = `<div class="gnc-compose reply"><input class="gnc-input gnc-reply-input" maxlength="300" value="@${esc(author)} "><button class="gnc-send gnc-reply-send">게시</button></div>`;
      const ri = rb.querySelector(".gnc-reply-input");
      ri.focus(); ri.setSelectionRange(ri.value.length, ri.value.length);
      rb.querySelector(".gnc-reply-send").addEventListener("click", () => postGnComment(ri.value, topId));
      ri.addEventListener("keydown", e => { if (e.key === "Enter") postGnComment(ri.value, topId); });
    }));
  }

  async function postGnComment(content, parentId) {
    if (needLogin()) return;
    content = (content || "").trim(); if (!content) return;
    const { error } = await supabase.from("galla_news_comments")
      .insert({ news_id: GNC_NEWS, user_id: ME.id, content, parent_id: parentId || null });
    if (error) { alert("댓글 등록 실패"); return; }
    if (parentId) GNC_EXPANDED.add(parentId);
    await loadGnComments(GNC_NEWS);
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

  const fmtDate = ts => {
    const d = ts ? new Date(ts) : null;
    return d && !isNaN(d) ? d.toLocaleDateString("ko-KR") : "";
  };
  let viewerSeq = 0;

  async function openNewsViewer(url, title, press) {
    if (!url) return;
    const my = ++viewerSeq;
    viewerTitle.textContent = title || press || "기사";
    viewerExt.href = url;
    viewerFallbackBtn.href = url;
    document.querySelector("#news-viewer-fallback .nvf-title").textContent = title || "";
    viewerFallback.hidden = true;
    viewerReader.hidden = false;
    viewerReader.scrollTop = 0;
    viewerReader.innerHTML = `<div class="reader-loading">기사를 불러오는 중…</div>`;
    viewerModal.classList.remove("hidden");
    document.body.style.overflow = "hidden";

    // 서버(엣지 함수)에서 원문 긁어와 우리 포맷으로 렌더
    let d = null;
    try {
      const res = await supabase.functions.invoke("article-reader", { body: { url } });
      d = res.data;
    } catch (_e) { /* fall through */ }
    if (my !== viewerSeq) return; // 그 사이 다른 기사 열림

    if (d && d.ok && Array.isArray(d.blocks) && d.blocks.length) {
      const imgCount = d.blocks.filter(b => b.t === "img").length;
      // 본문에 사진이 없을 때만 대표(og) 이미지를 상단에 (중복 방지)
      const hero = (isValidThumbnail(d.image) && imgCount === 0)
        ? `<img class="reader-hero" src="${esc(d.image)}" onerror="this.style.display='none'">` : "";
      const body = d.blocks.map(b => b.t === "img"
        ? `<img class="reader-img" src="${esc(b.src)}" loading="lazy" onerror="this.remove()">`
        : `<p>${esc(b.text)}</p>`).join("");
      viewerReader.innerHTML = `
        <article class="reader">
          <h1 class="reader-title">${esc(d.title || title || "")}</h1>
          <div class="reader-sub">${esc(d.siteName || press || "")}${d.published && fmtDate(d.published) ? " · " + fmtDate(d.published) : ""}</div>
          ${hero}
          ${body}
          <a class="reader-origin" href="${esc(url)}" target="_blank" rel="noopener noreferrer">원문 기사에서 보기 ↗</a>
        </article>`;
    } else {
      // 추출 실패 → 원문 열기 폴백
      viewerReader.hidden = true;
      viewerFallback.hidden = false;
    }
  }

  // 갈라뉴스 카드 클릭 → 갈라뉴스 리더 (원본 뉴스 카드는 자체 핸들러)
  document.getElementById("top-news-list")?.addEventListener("click", e => {
    const g = e.target.closest(".news-card.galla");
    if (g && g.dataset.gid) openGallaNews(g.dataset.gid);
  });

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
  activateTab("search");
  input.focus();
});
