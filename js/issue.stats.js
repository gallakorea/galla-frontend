console.log("[issue.stats.js] loaded (UI dummy mode)");

/**
 * =====================================
 * UI 더미 데이터 전용
 * - 통계 인포그래픽 구조 확정용
 * - 실제 Supabase 연동 전 단계
 * =====================================
 */

export function loadStats(issueId) {
  console.log("[issue.stats] render dummy stats");

  const data = {
    gender: { male: 54, female: 46 },

    age: [
      { label: "10대", percent: 8 },
      { label: "20대", percent: 27 },
      { label: "30대", percent: 31 },
      { label: "40대", percent: 22 },
      { label: "50대+", percent: 12 }
    ],

    region: [
      { name: "서울", percent: 38 },
      { name: "경기", percent: 29 },
      { name: "부산", percent: 11 },
      { name: "대구", percent: 7 },
      { name: "기타", percent: 15 }
    ],

    gender_vote: [
      { label: "남성", pro: 57, con: 43 },
      { label: "여성", pro: 48, con: 52 }
    ],

    age_vote: [
      { label: "20대", pro: 51, con: 49 },
      { label: "30대", pro: 63, con: 37 },
      { label: "40대", pro: 45, con: 55 }
    ],

    region_vote: [
      { label: "서울", pro: 59, con: 41 },
      { label: "경기", pro: 52, con: 48 },
      { label: "부산", pro: 44, con: 56 }
    ],

    ai_summary:
      "전반적으로 찬성 의견이 우세하지만, 연령대와 지역에 따라 반대 의견의 결집도 또한 뚜렷하게 나타납니다."
  };

  /* ===============================
     RENDER
  =============================== */

  renderGenderDonut(data.gender);
  renderAgeStack(data.age);
  renderRegionHeatmap(data.region);
  renderDiverging("gender-vote", data.gender_vote);
  renderDiverging("age-vote", data.age_vote);
  renderCompare("region-vote", data.region_vote);

  const summary = document.getElementById("ai-summary");
  if (summary) summary.innerText = data.ai_summary;
}

/* ======================================================
   1️⃣ 성별 분포 — 도넛 차트
====================================================== */

function renderGenderDonut(gender) {
  const root = document.getElementById("gender-donut");
  if (!root) return;

  root.innerHTML = `
    <div class="donut">
      <svg viewBox="0 0 36 36">
        <path
          class="donut-bg"
          d="M18 2.0845
             a 15.9155 15.9155 0 0 1 0 31.831
             a 15.9155 15.9155 0 0 1 0 -31.831"
        />
        <path
          class="donut-male"
          stroke-dasharray="${gender.male} ${100 - gender.male}"
          d="M18 2.0845
             a 15.9155 15.9155 0 0 1 0 31.831
             a 15.9155 15.9155 0 0 1 0 -31.831"
        />
      </svg>
      <div class="donut-center">
        <div class="donut-title">참여 성비</div>
        <div class="donut-value">${gender.male}% : ${gender.female}%</div>
      </div>
    </div>
  `;
}

/* ======================================================
   2️⃣ 연령 분포 — 100% 누적 바
====================================================== */

function renderAgeStack(age) {
  const root = document.getElementById("age-stacked-bar");
  if (!root) return;

  root.innerHTML = "";

  age.forEach(a => {
    const seg = document.createElement("div");
    seg.className = `age-seg ${a.label === "30대" ? "age-focus" : ""}`;
    seg.style.width = `${a.percent}%`;
    seg.innerText = `${a.label} ${a.percent}%`;
    root.appendChild(seg);
  });
}

/* ======================================================
   3️⃣ 지역 분포 — 히트맵 (유지)
====================================================== */

function renderRegionHeatmap(region) {
  const root = document.getElementById("region-heatmap");
  if (!root) return;

  root.innerHTML = "";

  region.forEach(r => {
    const cell = document.createElement("div");
    cell.className = "region-cell";
    cell.style.background = heatColor(r.percent);
    cell.innerHTML = `${r.name}<br>${r.percent}%`;
    root.appendChild(cell);
  });
}

function heatColor(p) {
  const alpha = Math.min(0.85, Math.max(0.25, p / 100));
  return `rgba(255, 200, 80, ${alpha})`;
}

/* ======================================================
   4️⃣ 찬반 디버징 바 (성별 / 연령)
====================================================== */

function renderDiverging(id, rows) {
  const root = document.getElementById(id);
  if (!root) return;

  root.innerHTML = "";

  rows.forEach(r => {
    const row = document.createElement("div");
    row.className = "diverging-row";
    row.innerHTML = `
      <div class="diverging-label">${r.label}</div>
      <div class="diverging-bar">
        <div class="bar-con" style="width:${r.con}%"></div>
        <div class="bar-pro" style="width:${r.pro}%"></div>
      </div>
      <div class="diverging-value">
        👍 ${r.pro}% / 👎 ${r.con}%
      </div>
    `;
    root.appendChild(row);
  });
}

/* ======================================================
   5️⃣ 지역별 찬반 — 이중 비교 바
====================================================== */

function renderCompare(id, rows) {
  const root = document.getElementById(id);
  if (!root) return;

  root.innerHTML = "";

  rows.forEach(r => {
    const row = document.createElement("div");
    row.className = "compare-row";
    row.innerHTML = `
      <div class="compare-label">${r.label}</div>
      <div class="compare-bars">
        <div class="compare-pro" style="width:${r.pro}%"></div>
        <div class="compare-con" style="width:${r.con}%"></div>
      </div>
    `;
    root.appendChild(row);
  });
}