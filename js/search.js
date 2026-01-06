document.addEventListener("DOMContentLoaded", async () => {
  const supabase = await waitForSupabaseClient();

  const hotEl   = document.getElementById("hot-trend-chips");
  const aiEl    = document.getElementById("ai-trend-list");
  const form    = document.getElementById("search-form");
  const input   = document.getElementById("search-input");
  const grid    = document.getElementById("search-results");
  const resultSection = document.getElementById("result-section");
  const label   = document.getElementById("search-result-label");

  /* =====================================================
     🔥 오늘의 핫 트렌드 (hot_search_trends)
  ===================================================== */
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
    data.forEach(row => {
      const chip = document.createElement("button");
      chip.className = "hot-trend-chip";
      chip.textContent = row.keyword;
      chip.onclick = () => {
        input.value = row.keyword;
        performSearch(row.keyword, true);
      };
      hotEl.appendChild(chip);
    });
  }

  /* =====================================================
     🔮 AI 유행예감 (issue_trend_scores VIEW)
     ⚠️ VIEW에는 FK가 없으므로 관계형 select 사용 금지
  ===================================================== */
  async function loadAITrends() {
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

  /* =====================================================
     🔍 검색 실행
  ===================================================== */
  async function performSearch(keyword, isHot = false) {
    const q = keyword.trim();
    if (!q) return;

    label.textContent = isHot
      ? `‘${q}’ 핫 트렌드 검색 결과`
      : `‘${q}’ 검색 결과`;

    // 🔽 결과 영역 오픈 + 스크롤
    if (resultSection) {
      resultSection.style.display = "block";
      resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    // 🔄 기존 결과 초기화
    grid.innerHTML = "";

    /* 🔎 검색 로그 기록 */
    await supabase.from("search_logs").insert({
      keyword: q
    });

    /* 🔎 검색 쿼리 */
    const { data, error } = await supabase.rpc("search_issues", {
      keyword: q
    });

    if (error) {
      console.error("search error", error);
      return;
    }

    renderResults(data);
  }

  /* =====================================================
     📘 검색 결과 렌더링
  ===================================================== */
  function renderResults(list) {
    if (resultSection) {
      resultSection.style.display = "block";
    }

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

  /* =====================================================
     ⌨️ 이벤트
  ===================================================== */
  form.addEventListener("submit", e => {
    e.preventDefault();
    performSearch(input.value);
  });

  input.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      performSearch(input.value);
    }
  });

  /* =====================================================
     INIT
  ===================================================== */
  loadHotTrends();
  loadAITrends();
});