// 썸네일 유효성 검사 유틸 함수
function isValidThumbnail(url) {
  if (!url) return false;
  if (typeof url !== "string") return false;
  const u = url.trim();
  if (!u) return false;
  if (u === "about:blank") return false;
  if (!u.startsWith("http")) return false;
  return true;
}
document.addEventListener("DOMContentLoaded", async () => {
  console.log("SEARCH JS LOADED");

  const supabase = await waitForSupabaseClient();


  // 🔁 이전 순위 저장
  const previousRanks = new Map();

  /* =========================
     DOM
  ========================= */
const tabs = document.querySelectorAll(".tab-item");
const panels = document.querySelectorAll(".tab-panel");

  const hotEl = document.getElementById("hot-trend-chips");
  const hotGrid = document.getElementById("hot-results");

  const aiEl = document.getElementById("ai-trend-list");

  const form = document.getElementById("search-form");
  const input = document.getElementById("search-input");
  const searchGrid = document.getElementById("search-results");
  const searchLabel = document.getElementById("search-result-label");

  // 📰 NEWS MODAL DOM
  const newsModal = document.getElementById("news-modal");
  const newsModalTitle = document.getElementById("news-modal-title");
  const newsModalArticles = document.getElementById("news-modal-articles");
const newsModalBackdrop = document.querySelector("#news-modal .news-modal-backdrop");
newsModalBackdrop?.addEventListener("click", closeNewsModal);

  const viewerModal = document.getElementById("news-viewer-modal");
  const viewerFrame = document.getElementById("news-viewer-iframe");
  const viewerClose = document.getElementById("news-viewer-close");

  if (viewerClose) {
    viewerClose.addEventListener("click", () => {
      viewerModal.classList.add("hidden");
      viewerFrame.src = "";
    });
  }

  if (newsModal) {
    newsModal.classList.remove("active");
  }

  // 공통 모달 닫기 함수
  function closeNewsModal() {
    if (!newsModal) return;
    newsModal.classList.remove("active");
    document.body.style.overflow = "";
  }

  let newsLoaded = true; // deprecated guard (kept for backward compatibility)

  /* =========================
     TAB CONTROL (FIXED)
  ========================= */
  function activateTab(name) {
    tabs.forEach(btn =>
      btn.classList.toggle("active", btn.dataset.tab === name)
    );

    panels.forEach(panel => {
      const isActive = panel.dataset.panel === name;
      panel.classList.toggle("active", isActive);

      // 🔥 핫트렌드 탭 활성화 직후 강제 로딩
      if (isActive && name === "hot") {
        requestAnimationFrame(() => {
          loadHotTrends();
        });
      }
    });
  }

tabs.forEach(btn => {
  btn.addEventListener("click", (e) => {
    e.preventDefault(); // ✅ 🔥 핵심: 인덱스 이동 차단
    e.stopPropagation(); // 🔥🔥🔥 이 줄 추가 (진짜 핵심)

    const tab = btn.dataset.tab;
    console.log("[TAB CLICK]", tab);

    activateTab(tab);

    if (tab === "news") {
      newsPage = 0;
      hasMoreNews = true;
      isLoadingNews = false;
      document.getElementById("top-news-list").innerHTML = "";
      renderNewsCategoryChips();
      loadTopNews();
    }

    if (tab === "ai") {
      loadAITrends();
    }
  });
});

async function loadHotTrends() {
  const hotEl = document.getElementById("hot-trend-chips");
  if (!hotEl) return;
  // 🔥 inactive 상태여도 강제로 보이게
  hotEl.style.display = "block";

  hotEl.innerHTML =
    `<p style="color:#777;font-size:13px;">불러오는 중...</p>`;

  const { data, error } = await supabase
    .from("hot_trend_groups_6h")
    .select("group_id, title, article_count")
    .limit(10);

  if (error) {
    console.error("[HOT TRENDS ERROR]", error);
    hotEl.innerHTML =
      `<p style="color:#777;font-size:13px;">핫트렌드 로딩 실패</p>`;
    return;
  }

  if (!data || data.length === 0) {
    hotEl.innerHTML = `
      <p style="color:#777;font-size:13px;">
        최근 6시간 내 핫트렌드가 없습니다.
      </p>
    `;
    return;
  }

  hotEl.innerHTML = "";

  data.forEach((row, idx) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "hot-trend-chip";

    chip.innerHTML = `
      <strong>${idx + 1}</strong>
      ${row.title}
      <span style="opacity:.7;">(${row.article_count})</span>
    `;

    chip.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      activateTab("news");
      openNewsModal(row.group_id);
    });

    hotEl.appendChild(chip);
  });
}

  /* =========================
     🔮 AI TRENDS
  ========================= */
  async function loadAITrends() {
    const { data, error } = await supabase
      .from("issue_trend_scores")
      .select("issue_id, title, category, trend_score")
      .order("trend_score", { ascending: false })
      .limit(10);

    if (error) {
      console.error("ai trends error", error);
      return;
    }

    aiEl.innerHTML = "";
    data.forEach(row => {
      const card = document.createElement("div");
      card.className = "ai-trend-card";
      card.onclick = () =>
        (location.href = `issue.html?id=${row.issue_id}`);

      card.innerHTML = `
        <p class="ai-trend-title">${row.title}</p>
        <p class="ai-trend-meta">${row.category}</p>
        <p class="ai-trend-reason">📈 트렌드 점수 ${row.trend_score}</p>
      `;
      aiEl.appendChild(card);
    });
  }

/* =========================
   📰 REALTIME TOP NEWS (FIXED)
========================= */

let newsPage = 0;
const NEWS_PAGE_SIZE = 30;
let isLoadingNews = false;
let hasMoreNews = true;


// 🔄 강제 새로고침 (자동 갱신 전용)
function refreshTopNews() {
  const list = document.getElementById("top-news-list");
  if (!list) return;

  newsPage = 0;
  hasMoreNews = true;
  isLoadingNews = false;
  lastTopNewsId = null;

  list.innerHTML = "";
  loadTopNews();
}

/* =========================
   🏷 NEWS CATEGORY CHIPS (NAVER STANDARD)
========================= */
const NEWS_CATEGORIES = [
  "전체",
  "정치",
  "경제",
  "사회",
  "생활문화",
  "세계",
  "IT과학",
  "연예",
  "스포츠"
];

const CATEGORY_SID_MAP = {
  "정치": 100,
  "경제": 101,
  "사회": 102,
  "생활문화": 103,
  "세계": 104,
  "IT과학": 105,
  "연예": 106,
  "스포츠": 107
};

let currentNewsCategory = "전체";

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
      e.preventDefault();
      e.stopPropagation();

      currentNewsCategory = cat;
      renderNewsCategoryChips();

      newsPage = 0;
      hasMoreNews = true;
      isLoadingNews = false;
      const list = document.getElementById("top-news-list");
      if (list) list.innerHTML = "";
      loadTopNews();
    });

    wrap.appendChild(btn);
  });
}

async function loadTopNews() {
  const list = document.getElementById("top-news-list");
  if (!list) return;

  if (isLoadingNews || !hasMoreNews) return;
  isLoadingNews = true;

  const from = newsPage * NEWS_PAGE_SIZE;
  const to = from + NEWS_PAGE_SIZE - 1;

  const since = new Date(
    Date.now() - 1000 * 60 * 60 * 24
  ).toISOString();

  let query = supabase
    .from("news_articles_raw")
    .select(`
      id,
      title,
      published_at,
      created_at,
      url,
      thumbnail_url,
      related_group_id,
      sid,
      press_name
    `)
    .gte("published_at", since)   // 🔥 이 줄이 핵심
    // 렌더는 썸네일 있는 기사만 표시하므로, 최신 기사에 아직 썸네일이 안 붙은 경우
    // 첫 페이지가 통째로 스킵돼 빈 화면이 되는 걸 방지 (썸네일 있는 기사만 조회)
    .not("thumbnail_url", "is", null)
    .neq("thumbnail_url", "")
    .order("published_at", { ascending: false })
    .order("id", { ascending: false });
    

  if (currentNewsCategory !== "전체") {
    query = query.eq(
      "sid",
      CATEGORY_SID_MAP[currentNewsCategory]
    );
  }

  const { data, error } = await query.range(from, to);

  if (newsPage === 0 && data && data.length > 0) {
    console.log(
      "[TOP NEWS DEBUG]",
      "id:", data[0].id,
      "published_at:", data[0].published_at,
      "group:", data[0].related_group_id
    );
  }

  console.log("[REALTIME NEWS DATA]", data);

  if (error) {
    console.error("[REALTIME NEWS ERROR]", error);
    list.innerHTML +=
      `<p style="color:#777;font-size:13px;">뉴스를 불러오지 못했습니다.</p>`;
    isLoadingNews = false;
    return;
  }

  if (!data || data.length === 0) {
    if (newsPage === 0) {
      list.innerHTML +=
        `<p style="color:#777;font-size:13px;">아직 실시간 뉴스가 없습니다.</p>`;
    }
    hasMoreNews = false;
    isLoadingNews = false;
    return;
  }
  // ⚠️ related_group_id 기준 프론트 그룹핑 때문에
  // data.length < PAGE_SIZE 로는 더 가져올지 판단하면 안 됨
  if (!data || data.length === 0) {
    hasMoreNews = false;
  }
  newsPage += 1;
  isLoadingNews = false;

  // 🔥 프론트 그룹핑 (related_group_id 기준)
  const grouped = new Map();

  data.forEach(article => {
    const key = article.related_group_id ?? article.id;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(article);
  });
    grouped.forEach(group => {
      group.sort(
        (a, b) => new Date(a.published_at) - new Date(b.published_at)
      );

      let 대표기사 = group.find(a => isValidThumbnail(a.thumbnail_url));

      // 🔥 썸네일 없는 그룹은 "스킵"만 해야지 전체를 끊으면 안 됨
      if (!대표기사) {
        console.warn("[SKIP GROUP - NO THUMBNAIL]", group);
        return; // ← 이제 정상 (이건 forEach 1회만 스킵)
      }

      const card = document.createElement("div");
      card.className = "news-card";

      card.addEventListener("click", () => {
        openNewsModal(대표기사.related_group_id ?? 대표기사.id);
      });

      card.innerHTML = `
        <div class="news-thumb-16x9">
          <img src="${대표기사.thumbnail_url}" />
        </div>
        <div class="news-text">
          <h3 class="news-title">${대표기사.title}</h3>
          <div class="news-meta">
            <span class="news-press">${대표기사.press_name}</span>
            <span class="news-time">${timeAgo(대표기사.published_at)}</span>
          </div>
          <div class="news-count">
            관련 기사 ${group.length}건
          </div>
        </div>
      `;

      list.appendChild(card);
    });

  // ❌ Frontend must NOT call fetch_article_thumbnail (handled by cron)
  // Thumbnails are pre-populated by a cron job and are read-only from the DB
}

// 🔧 SAFE FALLBACK: hot trend click handler
function loadNewsByIssue(issueId) {
  activateTab("news");
  loadTopNews();
}

function timeAgo(date) {
  if (!date) return "";
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);

  if (seconds < 60) return "방금";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}분 전`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}시간 전`;
  return `${Math.floor(seconds / 86400)}일 전`;
}

  /* =========================
     🔍 SEARCH CORE
  ========================= */
  async function performSearch(keyword, targetGrid) {
    const q = keyword.trim();
    if (!q) return;

    const { data, error } = await supabase.rpc("search_issues", {
      keyword: q
    });

    if (error) {
      console.error("search error", error);
      return;
    }

    renderResults(data, targetGrid);
  }

  function renderResults(list, grid) {
    grid.innerHTML = "";

    if (!list || list.length === 0) {
      grid.innerHTML =
        `<p style="color:#777;font-size:13px;">검색 결과 없음</p>`;
      return;
    }

    list.forEach(i => {
      const card = document.createElement("div");
      card.className = "search-card";
      card.onclick = () =>
        (location.href = `issue.html?id=${i.id}`);

      card.innerHTML = `
        <span class="search-card-category">${i.category}</span>
        <p class="search-card-title">${i.title}</p>
        <div class="search-card-meta">
          👍 ${i.pro_count} · 👎 ${i.con_count}
        </div>
      `;
      grid.appendChild(card);
    });
  }

  /* =========================
     📰 OPEN NEWS MODAL
  ========================= */
async function openNewsModal(groupId) {
  if (!groupId || !newsModal) return;

  // ✅ 모달 표시 (CSS만 믿는다)
newsModal.classList.add("active");
document.body.style.overflow = "hidden";

  newsModalTitle.textContent = "관련 기사";
  newsModalArticles.innerHTML =
    `<p style="color:#777;font-size:13px;">불러오는 중...</p>`;

  const { data, error } = await supabase
    .from("news_articles_raw")
    .select("id, title, published_at, url, related_group_id")
    .or(
      `related_group_id.eq.${groupId},id.eq.${groupId}`
    )
    .order("published_at", { ascending: false })
    .limit(30);

  if (error) {
    console.error("[NEWS MODAL]", error);
    newsModalArticles.innerHTML =
      `<p style="color:#777;font-size:13px;">기사를 불러오지 못했습니다.</p>`;
    return;
  }

  if (!data || data.length === 0) {
    newsModalArticles.innerHTML =
      `<p style="color:#777;font-size:13px;">기사가 없습니다.</p>`;
    return;
  }

  newsModalArticles.innerHTML = "";

  data.forEach(article => {
    const row = document.createElement("div");
    row.className = "news-article-item";
    row.innerHTML = `<p class="news-article-title">${article.title}</p>`;

    row.onclick = () => {
      if (!article.url) return;
      openNewsViewer(article.url);
    };

    newsModalArticles.appendChild(row);
  });
}

    function openNewsViewer(url) {
      if (!url) return;

      // ❌ iframe 차단 확률이 높은 도메인
      const blockedDomains = [
        "naver.com",
        "daum.net",
        "chosun.com",
        "joins.com",
        "hani.co.kr",
        "mk.co.kr",
        "sedaily.com",
        "khan.co.kr",
        "yonhapnews.co.kr"
      ];

      const isBlocked = blockedDomains.some(d => url.includes(d));

      // 1️⃣ 차단된 도메인 → 무조건 새 탭
      if (isBlocked) {
        window.open(url, "_blank", "noopener,noreferrer");
        return;
      }

      // 2️⃣ iframe 시도
      try {
        viewerFrame.src = url;
        viewerModal.classList.remove("hidden");
      } catch (e) {
        // 3️⃣ iframe 실패 시 안전 탈출
        window.open(url, "_blank", "noopener,noreferrer");
      }
    }

  /* =========================
     SEARCH EVENTS
  ========================= */
  if (form) {
    form.addEventListener("submit", e => {
      e.preventDefault();
      activateTab("search");
      performSearch(input.value, searchGrid);
    });
  }

  // =========================
  // INIT (FORCE NEWS RENDER)
  // =========================
  activateTab("news");
  renderNewsCategoryChips();
  loadTopNews();

  // 기존 기능 유지
  loadHotTrends();
  loadAITrends();

  // 🕒 60초마다 자동 갱신 (DB 기준 최신 반영)
  setInterval(() => {
    const activeTab = document.querySelector(".tab-item.active")?.dataset.tab;
    if (activeTab === "news") {
      refreshTopNews(); // 🔥 반드시 이걸 써야 함
    }
  }, 60000);

  tabs.forEach(tab => {
    tab.style.pointerEvents = "auto";
  });

/* =========================
   🔗 BOTTOM NAVIGATION FIX (FINAL)
========================= */
document.querySelectorAll(".bottom-nav .nav-item").forEach(btn => {
  btn.addEventListener("click", e => {
  if (!e.currentTarget.contains(e.target)) return;
    e.preventDefault();
    e.stopPropagation(); // 🔥 이게 핵심이다

    const target = btn.dataset.target;
    if (!target) return;

    const current = location.pathname.split("/").pop();
    if (current === target) return;

    location.href = target;
  });
});

window.addEventListener("scroll", () => {
  const scrollBottom =
    window.innerHeight + window.scrollY >=
    document.body.offsetHeight - 200;

  const activeTab =
    document.querySelector(".tab-item.active")?.dataset.tab;

  if (scrollBottom && activeTab === "news") {
    loadTopNews();
  }
});

});

// 썸네일 CSS 보정용 JS (파일 하단)
const style = document.createElement("style");
style.innerHTML = `
  .news-thumb-16x9 {
    width: 100%;
    aspect-ratio: 16 / 9;
    background: #111;
    border-radius: 12px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .news-thumb-16x9 img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

`;
document.head.appendChild(style);