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

  let newsLoaded = false;

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

      if (tab === "news" && !newsLoaded) {
        loadTopNews();
        newsLoaded = true;
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
      location.href = `news.html?id=${item.id}`;
    };

    card.innerHTML = `
      <div class="news-thumb">
        <img src="https://via.placeholder.com/300" />
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
  loadTopNews(); // ✅ 무조건 한 번 로드
  newsLoaded = true;

});
