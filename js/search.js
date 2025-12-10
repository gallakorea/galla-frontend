document.addEventListener("DOMContentLoaded", () => {

  const hotEl = document.getElementById("hot-trend-chips");
  const aiEl  = document.getElementById("ai-trend-list");
  const form  = document.getElementById("search-form");
  const input = document.getElementById("search-input");
  const grid  = document.getElementById("search-results");
  const label = document.getElementById("search-result-label");

  const HOT = [
    "야근 수당","연애와 돈","주식 단타",
    "19금 연애관","직장 내 꼰대","N잡 시대",
    "결혼 필수인가","퇴사 타이밍","부모 용돈","젠더 갈등"
  ];

  const ISSUES = [
    {
      id: 1,
      title: "야근 수당 없이 야근 시키는 회사, 정상인가요?",
      category: "직장·경력",
      agreeRate: 72, disagreeRate: 28,
      thumb: "./assets/default-thumb.jpg",
      aiReason: "조회수 +230%, 댓글 증가 +180%"
    },
    {
      id: 2,
      title: "연애할 때 돈 안 쓰는 남친/여친, 이해 가능?",
      category: "연애·결혼",
      agreeRate: 48, disagreeRate: 52,
      thumb: "./assets/default-thumb.jpg",
      aiReason: "검색량 +180%, 후원 증가율 상위 5%"
    },
    {
      id: 3,
      title: "부모님 용돈, 월급의 몇 %가 적당할까?",
      category: "생활·일상",
      agreeRate: 60, disagreeRate: 40,
      thumb: "./assets/default-thumb.jpg",
      aiReason: "후원액 TOP 5%, 재방문율 증가"
    }
  ];

  /* HOT */
  function renderHot() {
    hotEl.innerHTML = "";
    HOT.forEach(k => {
      const chip = document.createElement("button");
      chip.className = "hot-trend-chip";
      chip.textContent = k;
      chip.onclick = () => {
        input.value = k;
        performSearch(k, true);
      };
      hotEl.appendChild(chip);
    });
  }

  /* AI */
  function renderAI() {
    aiEl.innerHTML = "";
    ISSUES.slice(0,3).forEach(i => {
      const card = document.createElement("div");
      card.className = "ai-trend-card";
      card.onclick = () => location.href = `issue.html?id=${i.id}`;
      card.innerHTML = `
        <p class="ai-trend-title">${i.title}</p>
        <p class="ai-trend-meta">${i.category} · 👍 ${i.agreeRate}% · 👎 ${i.disagreeRate}%</p>
        <p class="ai-trend-reason">📈 ${i.aiReason}</p>`;
      aiEl.appendChild(card);
    });
  }

  /* SEARCH */
  function performSearch(keyword, hot=false) {
    const key = keyword.toLowerCase().trim();
    if (!key) return;

    const results = ISSUES.filter(i =>
      i.title.toLowerCase().includes(key) ||
      i.category.toLowerCase().includes(key)
    );

    label.textContent = hot
      ? `‘${keyword}’ 핫트렌드 검색 결과`
      : `‘${keyword}’ 검색 결과`;

    renderResults(results);
  }

  /* RESULTS */
  function renderResults(list) {
    grid.innerHTML = "";

    if (!list.length) {
      grid.innerHTML = `<p style="color:#777;font-size:13px;">검색 결과 없음.</p>`;
      return;
    }

    list.forEach(i => {
      const card = document.createElement("div");
      card.className = "search-card";
      card.onclick = () => location.href = `issue.html?id=${i.id}`;
      card.innerHTML = `
        <div class="search-card-thumb"><img src="${i.thumb}"></div>
        <span class="search-card-category">${i.category}</span>
        <p class="search-card-title">${i.title}</p>
        <div class="search-card-meta">
          <span>👍 ${i.agreeRate}% · 👎 ${i.disagreeRate}%</span>
          <span>갈라치기</span>
        </div>`;
      grid.appendChild(card);
    });
  }

  /* EVENT */
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

  /* INIT */
  renderHot();
  renderAI();
});

/* ----------------------------------------
   🔥 HEADER SCROLL HIDE/SHOW (최종)
---------------------------------------- */
let lastScroll = 0;
const header = document.querySelector(".header");

window.addEventListener("scroll", () => {
    const current = window.scrollY;

    if (current > lastScroll) {
        // ⬇️ 스크롤 내리는 중 → 헤더 숨김
        header.style.transform = "translate(-50%, -100%)";
    } else {
        // ⬆️ 스크롤 올리는 중 → 헤더 복귀
        header.style.transform = "translate(-50%, 0)";
    }

    lastScroll = current;
});