document.addEventListener("DOMContentLoaded", async () => {
  const supabase = await waitForSupabaseClient();

  const tabs = document.querySelectorAll(".search-tab");
  const panels = document.querySelectorAll(".tab-panel");

  const hotEl   = document.getElementById("hot-trend-chips");
  const aiEl    = document.getElementById("ai-trend-list");
  const form    = document.getElementById("search-form");
  const input   = document.getElementById("search-input");
  const grid    = document.getElementById("search-results");
  const resultSection = document.getElementById("result-section");
  const label   = document.getElementById("search-result-label");

  let aiLoaded = false;

  function showOnlyPanel(name) {
    panels.forEach(p => {
      p.style.display = "none";
    });
    const panel = document.querySelector(`.tab-panel[data-panel="${name}"]`);
    if (panel) {
      panel.style.display = "block";
    } else {
      console.warn("[search] panel not found:", name);
    }
  }

  function activateTab(name) {
    tabs.forEach(t => t.classList.remove("active"));
    const tab = document.querySelector(`.search-tab[data-tab="${name}"]`);
    if (tab) tab.classList.add("active");

    showOnlyPanel(name);

    if (name === "ai" && !aiLoaded) {
      loadAITrends();
      aiLoaded = true;
    }
  }

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      activateTab(tab.dataset.tab);
    });
  });

  /* ===============================
     🔥 오늘의 핫 트렌드
  =============================== */
  async function loadHotTrends() {
    if (!hotEl) {
      console.warn("[search] hot-trend-chips missing");
      return;
    }

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
    data.forEach(row => {
      const chip = document.createElement("button");
      chip.className = "hot-trend-chip";
      chip.textContent = row.keyword;
      chip.onclick = () => {
        input.value = row.keyword;
        activateTab("search");
        performSearch(row.keyword, true);
      };
      hotEl.appendChild(chip);
    });
  }

  /* ===============================
     🔮 AI 유행예감
  =============================== */
  async function loadAITrends() {
    if (!aiEl) {
      console.warn("[search] ai-trend-list missing");
      return;
    }

    const { data, error } = await supabase
      .from("issue_trend_scores")
      .select("issue_id, title, category, trend_score")
      .order("trend_score", { ascending: false })
      .limit(5);

    if (error) {
      console.error("ai trends error", error);
      return;
    }

    aiEl.innerHTML = "";
    data.forEach(row => {
      const card = document.createElement("div");
      card.className = "ai-trend-card";
      card.onclick = () => {
        location.href = `issue.html?id=${row.issue_id}`;
      };
      card.innerHTML = `
        <p class="ai-trend-title">${row.title}</p>
        <p class="ai-trend-meta">${row.category}</p>
        <p class="ai-trend-reason">📈 트렌드 점수 ${row.trend_score}</p>
      `;
      aiEl.appendChild(card);
    });
  }

  /* ===============================
     🔍 검색
  =============================== */
  async function performSearch(keyword, isHot = false) {
    const q = keyword.trim();
    if (!q) return;

    label.textContent = isHot
      ? `‘${q}’ 핫 트렌드 검색 결과`
      : `‘${q}’ 검색 결과`;

    if (resultSection) {
      resultSection.style.display = "block";
      resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    grid.innerHTML = "";

    await supabase.from("search_logs").insert({ keyword: q });

    const { data, error } = await supabase.rpc("search_issues", { keyword: q });
    if (error) {
      console.error("search error", error);
      return;
    }

    renderResults(data);
  }

  function renderResults(list) {
    if (!list || list.length === 0) {
      grid.innerHTML = `<p style="color:#777;font-size:13px;">검색 결과 없음.</p>`;
      return;
    }

    list.forEach(i => {
      const card = document.createElement("div");
      card.className = "search-card";
      card.onclick = () => location.href = `issue.html?id=${i.id}`;
      card.innerHTML = `
        <span class="search-card-category">${i.category}</span>
        <p class="search-card-title">${i.title}</p>
        <div class="search-card-meta">
          <span>👍 ${i.pro_count} · 👎 ${i.con_count}</span>
          <span>갈라치기</span>
        </div>
      `;
      grid.appendChild(card);
    });
  }

  if (form) {
    form.addEventListener("submit", e => {
      e.preventDefault();
      activateTab("search");
      performSearch(input.value);
    });
  }

  /* ===============================
     INIT
  =============================== */
  await loadHotTrends();
  activateTab("hot");
});