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

  const viewerModal = document.getElementById("news-viewer-modal");
  const viewerFrame = document.getElementById("news-viewer-iframe");
  const viewerClose = document.getElementById("news-viewer-close");

  if (newsModalClose) {
    newsModalClose.addEventListener("click", () => {
      newsModal.classList.add("hidden");
    });
  }

  if (viewerClose) {
    viewerClose.addEventListener("click", () => {
      viewerModal.classList.add("hidden");
      viewerFrame.src = "";
    });
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
     🔥 HOT TRENDS
  ========================= */
  async function loadHotTrends() {
    const { data, error } = await supabase
      .from("hot_search_trends")
      .select("keyword")
      .order("search_count", { ascending: false })
      .limit(10);

    if (error) {
      console.error("hot trends error", error);
      return;
    }

    hotEl.innerHTML = "";
    hotGrid.innerHTML = "";

    data.forEach(row => {
      const chip = document.createElement("button");
      chip.className = "hot-trend-chip";
      chip.textContent = row.keyword;
      chip.onclick = () => {
        activateTab("hot");
        performSearch(row.keyword, hotGrid);
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
      source_name,
      articles_count
    `)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error("[NEWS] loadTopNews error:", error);
    list.innerHTML =
      `<p style="color:#777;font-size:13px;">뉴스를 불러오지 못했습니다.</p>`;
    return;
  }

  if (!data || data.length === 0) {
    list.innerHTML =
      `<p style="color:#777;font-size:13px;">표시할 뉴스가 없습니다.</p>`;
    return;
  }

  list.innerHTML = "";

  data.forEach(item => {
    const card = document.createElement("div");
    card.className = "news-card";

    card.onclick = () => {
      openNewsModal(item.id);
    };

    card.innerHTML = `
      <div class="news-thumb">
        <div class="news-thumb-placeholder"></div>
      </div>
      <div class="news-body">
        <h3 class="news-title">${item.issue_title}</h3>
        <p class="news-summary">${item.issue_summary}</p>
        <div class="news-meta">
          <span>${item.source_name}</span>
          <span>관련 기사 ${item.articles_count}건</span>
        </div>
      </div>
    `;

    list.appendChild(card);
  });
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

    // 모달 오픈
    newsModal.classList.remove("hidden");
    newsModalTitle.textContent = "불러오는 중...";
    newsModalArticles.innerHTML = "";

    const { data, error } = await supabase
      .from("news_articles")
      .select(`
        id,
        title,
        source_name,
        article_url,
        published_at
      `)
      .eq("cluster_id", clusterId)
      .order("published_at", { ascending: false })
      .limit(30);

    if (error) {
      console.error("[NEWS MODAL] load error:", error);
      newsModalTitle.textContent = "뉴스를 불러올 수 없습니다";
      return;
    }

    newsModalTitle.textContent = `관련 기사 ${data.length}건`;

    data.forEach(article => {
      const row = document.createElement("div");
      row.className = "news-article-item";
      row.onclick = () => {
        // 다음 단계에서 인앱뷰어로 교체 예정
        openNewsViewer(article.article_url);
      };

      row.innerHTML = `
        <span class="news-article-source">${article.source_name}</span>
        <p class="news-article-title">${article.title}</p>
      `;

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
  loadTopNews(); // 초기 진입 시 뉴스 미리 로드

  // 🕒 60초마다 자동 갱신 (실시간 느낌)
  setInterval(() => {
    const activeTab = document.querySelector(".tab-item.active")?.dataset.tab;
    if (activeTab === "news") {
      loadTopNews();
    }
  }, 60000);

});
