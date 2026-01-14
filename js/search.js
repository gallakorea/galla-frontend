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
      panel.classList.toggle(
        "active",
        panel.dataset.panel === name
      );
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

    if (tab === "hot") {
      loadHotTrends();
    }

    if (tab === "ai") {
      loadAITrends();
    }
  });
});

async function loadHotTrends() {
  const hotEl = document.getElementById("hot-trend-chips");
  const hotGrid = document.getElementById("hot-results");

  if (!hotEl || !hotGrid) {
    console.error("[HOT] missing DOM");
    return;
  }

  hotEl.innerHTML = `<p style="color:#777;font-size:13px;">불러오는 중...</p>`;
  hotGrid.innerHTML = "";

  const { data, error } =
    await supabase.functions.invoke("get_search_trends");

  if (error) {
    console.error("[HOT] invoke error", error);
    hotEl.innerHTML =
      `<p style="color:#777;font-size:13px;">트렌드 불러오기 실패</p>`;
    return;
  }

  if (!Array.isArray(data) || data.length === 0) {
    hotEl.innerHTML =
      `<p style="color:#777;font-size:13px;">표시할 트렌드 없음</p>`;
    return;
  }

  hotEl.innerHTML = "";

  data.slice(0, 10).forEach((row, idx) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "hot-trend-chip";

    chip.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      activateTab("news");
      loadTopNews();
    });

    chip.innerHTML =
      `<strong>${idx + 1}</strong> ${row.keyword} ${row.is_hot ? "🔥" : "🚀"}`;

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
const NEWS_PAGE_SIZE = 10;
let isLoadingNews = false;
let hasMoreNews = true;

// 🔄 강제 새로고침 (자동 갱신 전용)
function refreshTopNews() {
  const list = document.getElementById("top-news-list");
  if (!list) return;

  // 🔥 상태 전부 리셋
  newsPage = 0;
  hasMoreNews = true;
  isLoadingNews = false;

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

  let query = supabase
    .from("news_articles_raw")
    .select(`
      id,
      title,
      published_at,
      url,
      related_group_id,
      sid
    `)
    .order("published_at", { ascending: false });
    

  if (currentNewsCategory !== "전체") {
    query = query.eq(
      "sid",
      CATEGORY_SID_MAP[currentNewsCategory]
    );
  }

  const { data, error } = await query.range(from, to);
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

  if (!data || data.length < NEWS_PAGE_SIZE) {
    hasMoreNews = false;
  }
  newsPage += 1;
  isLoadingNews = false;

// 🔥 기사 그룹핑
const grouped = new Map();

data.forEach(article => {
  const key = article.related_group_id ?? article.id;

  if (!grouped.has(key)) {
    grouped.set(key, []);
  }
  grouped.get(key).push(article);
});

grouped.forEach(group => {
  // 🟢 대표 기사 = 가장 오래된 기사
  group.sort(
    (a, b) =>
      new Date(a.published_at) - new Date(b.published_at)
  );

  const 대표기사 = group[0];
  const isGroup = group.length > 1;

  const card = document.createElement("div");
  card.className = "news-card";

  card.onclick = e => {
    e.preventDefault();
    e.stopPropagation();

    // 🔥 모든 기사 클릭 = 모달
    openNewsModal(
      대표기사.related_group_id ?? 대표기사.id
    );
  };

  card.innerHTML = `
    <div class="news-body">
      <h3 class="news-title">
        ${대표기사.title}
      </h3>

      <p class="news-summary clamp-2">
        ${
          isGroup
            ? "여러 매체의 관련 기사를 한데 모았습니다."
            : "단일 기사"
        }
      </p>

      <div class="news-meta">
        ${
          isGroup
            ? `<span>📰 ${group.length}건</span>`
            : `<span>📰 단일 기사</span>`
        }
        <span>⏱ ${timeAgo(대표기사.published_at)}</span>
      </div>
    </div>
  `;

  list.appendChild(card);
});
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

  // 🔥 즉시 실시간 탑 뉴스 렌더
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
