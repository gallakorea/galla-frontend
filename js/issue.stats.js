console.log("[issue.stats.js] loaded");

/**
 * 정책
 * - 참여자 100명 미만: 통계 비공개 + 안내 메시지
 * - 참여자 100명 이상: 전체 통계 렌더
 */
const MIN_PARTICIPANTS = 100;

/**
 * entry
 */
/**
 * entry
 */
export async function loadStats(issueId) {
  console.log("[issue.stats] dummy mode");

  // 🔥 UI 작업용 더미 데이터
  const DUMMY_STATS = {
    pro_count: 62,
    con_count: 58,

    gender: {
      male: 54,
      female: 46
    },

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

    ai_summary: `
이 이슈는 전반적으로 찬성 의견이 우세하지만,
연령대와 지역에 따라 반대 의견의 결집도 또한 뚜렷하게 나타난다.
특히 40대 이상과 일부 지역에서는 반대 진영의 응집력이 강한 편이다.
`
  };

  // ✅ 항상 공개 상태
  unlockStats();
  renderAllStats(DUMMY_STATS);

  // ⛔️ 실데이터 로직 차단
  return;
}


/* ======================================================
   LOCK / UNLOCK
====================================================== */

function lockStats(total) {
  const section = document.getElementById("stats-section");
  if (!section) return;

  // ✅ 섹션 자체를 접힘 상태로
  section.classList.add("collapsed");
  section.setAttribute("data-locked", "true");

  // 헤더 상태 표시
  const header = section.querySelector(".stats-header");
  if (header) {
    header.querySelector(".stats-status")?.remove();
    const badge = document.createElement("span");
    badge.className = "stats-status";
    badge.innerText = "준비 중";
    header.appendChild(badge);
  }

  // 기존 내용 숨김
  Array.from(section.querySelectorAll(".stats-content"))
    .forEach(el => el.hidden = true);

  // 안내 박스
  let box = document.getElementById("stats-locked-box");
  if (!box) {
    box = document.createElement("div");
    box.id = "stats-locked-box";
    box.className = "stats-locked-box";
    section.appendChild(box);
  }

  box.innerHTML = `
    <div class="stats-locked-title">
      아직 통계가 공개되지 않았습니다
    </div>
    <div class="stats-locked-desc">
      현재 참여자 <b>${total}명</b><br/>
      참여자가 100명 이상일 경우<br/>
      여론 통계가 공개됩니다.
    </div>
  `;
}

function unlockStats() {
  const section = document.getElementById("stats-section");
  if (!section) return;

  section.classList.remove("collapsed");
  section.removeAttribute("data-locked");

  section.querySelector(".stats-status")?.remove();
  document.getElementById("stats-locked-box")?.remove();

  Array.from(section.querySelectorAll(".stats-content"))
    .forEach(el => el.hidden = false);
}

/* ======================================================
   RENDER ALL
====================================================== */

function renderAllStats(data) {
  renderGender(data.gender);
  renderAge(data.age);
  renderRegion(data.region);
  renderGenderVote(data.gender_vote);
  renderAgeVote(data.age_vote);
  renderRegionVote(data.region_vote);
  renderAiSummary(data.ai_summary);
}

/* ======================================================
   GENDER
====================================================== */

function renderGender(gender) {
  const root = document.getElementById("gender-dual");
  if (!root || !gender) return;

  root.innerHTML = `
    <div class="dual-bar-labels">
      <span>남성 ${gender.male}%</span>
      <span>여성 ${gender.female}%</span>
    </div>
    <div class="dual-bar">
      <div class="dual-left" style="width:${gender.male}%"></div>
      <div class="dual-right" style="width:${gender.female}%"></div>
    </div>
  `;
}

/* ======================================================
   AGE
====================================================== */

function renderAge(age) {
  const root = document.getElementById("age-chart");
  if (!root || !age) return;

  root.innerHTML = "";

  age.forEach(row => {
    const el = document.createElement("div");
    el.className = "age-row";
    el.innerHTML = `
      <div class="age-header">
        <span>${row.label}</span>
        <span>${row.percent}%</span>
      </div>
      <div class="age-bar">
        <div class="age-fill" style="width:${row.percent}%"></div>
      </div>
    `;
    root.appendChild(el);
  });
}

/* ======================================================
   REGION HEATMAP
====================================================== */

function renderRegion(region) {
  const root = document.getElementById("region-heatmap");
  if (!root || !region) return;

  root.innerHTML = "";

  region.forEach(r => {
    const el = document.createElement("div");
    el.className = "region-cell";
    el.style.background = heatColor(r.percent);
    el.innerHTML = `
      ${r.name}<br/>
      ${r.percent}%
    `;
    root.appendChild(el);
  });
}

function heatColor(p) {
  const alpha = Math.min(0.85, Math.max(0.2, p / 100));
  return `rgba(255, 200, 80, ${alpha})`;
}

/* ======================================================
   VOTE BREAKDOWN
====================================================== */

function renderGenderVote(data) {
  renderVoteBar("gender-vote", data);
}

function renderAgeVote(data) {
  renderVoteBar("age-vote", data);
}

function renderRegionVote(data) {
  renderVoteBar("region-vote", data);
}

function renderVoteBar(id, rows) {
  const root = document.getElementById(id);
  if (!root || !rows) return;

  root.innerHTML = "";

  rows.forEach(r => {
    const el = document.createElement("div");
    el.className = "vote-item";
    el.innerHTML = `
      <div class="vote-labels">
        <span>${r.label}</span>
        <span>👍 ${r.pro}% / 👎 ${r.con}%</span>
      </div>
      <div class="vote-bar">
        <div class="vote-pro" style="width:${r.pro}%"></div>
        <div class="vote-con" style="width:${r.con}%"></div>
      </div>
    `;
    root.appendChild(el);
  });
}

/* ======================================================
   AI SUMMARY
====================================================== */

function renderAiSummary(text) {
  const root = document.getElementById("ai-summary");
  if (!root) return;

  root.innerHTML = text || "AI 종합 의견을 분석 중입니다.";
}