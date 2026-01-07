document.addEventListener("DOMContentLoaded", async () => {
  const supabase = await waitForSupabaseClient();

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
  const newsModalClose = document.getElementById("news-modal-close");

  // ✅ HARD RESET: 로드 시 무조건 모달 비활성
  if (newsModal) {
    newsModal.classList.add("hidden");
    newsModal.style.pointerEvents = "none";
  }

  const newsModalBackdrop = newsModal?.querySelector(".news-modal-backdrop");
  if (newsModalBackdrop) {
    newsModalBackdrop.addEventListener("click", () => closeNewsModal());
  }

  if (newsModalClose) {
    newsModalClose.addEventListener("click", () => closeNewsModal());
  }

  const viewerModal = document.getElementById("news-viewer-modal");
  const viewerFrame = document.getElementById("news-viewer-iframe");
  const viewerClose = document.getElementById("news-viewer-close");

  if (newsModalClose) {
    newsModalClose.addEventListener("click", () => {
      newsModal.classList.add("hidden");
      newsModal.style.pointerEvents = "none";
    });
  }

  if (viewerClose) {
    viewerClose.addEventListener("click", () => {
      viewerModal.classList.add("hidden");
      viewerFrame.src = "";
    });
  }

  // 공통 모달 닫기 함수
  function closeNewsModal() {
    if (!newsModal) return;
    newsModal.classList.add("hidden");
    newsModal.style.pointerEvents = "none";
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
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      activateTab(tab);

      if (tab === "news") {
        loadTopNews();
      }
    });
  });

/* =========================
   🔥 HOT TRENDS (REALTIME)
========================= */
async function loadHotTrends() {
  const { data, error } = await supabase
    .from("realtime_search_keywords")
    .select("issue_id, keyword, rank_score")
    .order("rank_score", { ascending: false }) // 🔥 핵심
    .limit(10);

  if (error) {
    console.error("[HOT] load error", error);
    hotEl.innerHTML =
      `<p style="color:#777;font-size:13px;">트렌드를 불러오지 못했습니다.</p>`;
    return;
  }

  hotEl.innerHTML = "";
  hotGrid.innerHTML = "";

  if (!data || data.length === 0) {
    hotEl.innerHTML =
      `<p style="color:#777;font-size:13px;">현재 계산된 트렌드가 없습니다.</p>`;
    return;
  }

  data.forEach((row, idx) => {
    const chip = document.createElement("button");
    chip.className = "hot-trend-chip";

    let badge = "↑";
    if (idx === 0) badge = "🔥";
    else if (idx < 3) badge = "🚀";

    chip.innerHTML = `<strong>${idx + 1}</strong> ${row.keyword} ${badge}`;

    chip.onclick = () => {
      activateTab("news");
      loadTopNews();
    };

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
     📰 REALTIME NEWS
  ========================= */
async function loadTopNews() {
  const list = document.getElementById("top-news-list");
  if (!list) return;

  const { data, error } = await supabase
    .from("news_issues")
    .select(`
      id,
      issue_title,
      issue_summary,
      articles_count,
      last_article_at
    `)
    .order("articles_count", { ascending: false })
    .order("last_article_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error("[NEWS] loadTopNews error:", error);
    list.innerHTML =
      `<p style="color:#777;font-size:13px;">뉴스를 불러오지 못했습니다.</p>`;
    return;
  }

  list.innerHTML = "";

  data.forEach(item => {
    const card = document.createElement("div");
    card.className = "news-card";

    card.onclick = async () => {
      openNewsModal(item.id);
    };

    card.innerHTML = `
      <div class="news-body">
        <h3 class="news-title">${item.issue_title}</h3>
        <p class="news-summary">${item.issue_summary ?? ""}</p>
        <div class="news-meta">
          <span>📰 ${item.articles_count}건</span>
          <span>⏱ ${timeAgo(item.last_article_at)}</span>
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
async function openNewsModal(clusterId) {
  if (!clusterId || !newsModal) return;

  // ✅ 모달 활성화 (이때만 클릭 가로채기)
  newsModal.classList.remove("hidden");
  newsModal.style.pointerEvents = "auto";

  newsModalTitle.textContent = "관련 기사";
  newsModalArticles.innerHTML =
    `<p style="color:#777;font-size:13px;">불러오는 중...</p>`;

  const { data, error } = await supabase
    .from("news_articles")
    .select("id, title, article_url, published_at")
    .eq("cluster_id", clusterId)
    .order("published_at", { ascending: false })
    .limit(30);

  // ❌ 여기서 에러 나도 페이지 절대 안 멈추게
  if (error || !data) {
    console.error("[NEWS MODAL] load error", error);
    newsModalArticles.innerHTML =
      `<p style="color:#777;font-size:13px;">기사를 불러오지 못했습니다.</p>`;
    return;
  }

  if (data.length === 0) {
    newsModalArticles.innerHTML =
      `<p style="color:#777;font-size:13px;">기사가 없습니다.</p>`;
    return;
  }

  newsModalArticles.innerHTML = "";

  data.forEach(article => {
    const row = document.createElement("div");
    row.className = "news-article-item";
    row.onclick = () => openNewsViewer(article.article_url);
    row.innerHTML = `<p class="news-article-title">${article.title}</p>`;
    newsModalArticles.appendChild(row);
  });
}

  function openNewsViewer(url) {
    if (!url || !viewerModal || !viewerFrame) return;

    // 예외 처리: iframe 차단 사이트
    const blockedDomains = [
      "naver.com",
      "daum.net",
      "chosun.com"
    ];

    const isBlocked = blockedDomains.some(d => url.includes(d));
    if (isBlocked) {
      window.open(url, "_blank");
      return;
    }

    viewerFrame.src = url;
    viewerModal.classList.remove("hidden");
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

  /* =========================
     INIT
  ========================= */
  activateTab("hot");
  loadHotTrends();
  loadAITrends();

  // 🕒 60초마다 자동 갱신 (실시간 느낌)
  setInterval(() => {
    const activeTab = document.querySelector(".tab-item.active")?.dataset.tab;
    if (activeTab === "news") {
      loadTopNews();
    }
  }, 60000);

// 🛟 ABSOLUTE FAILSAFE
window.addEventListener("load", () => {
  if (newsModal) {
    newsModal.classList.add("hidden");
    newsModal.style.pointerEvents = "none";
  }
});

});
