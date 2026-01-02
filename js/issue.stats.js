console.log("[issue.stats.js] loaded");

/**
 * 테스트 정책 (고정)
 * - 참여자 2명 미만: 통계 비공개(안내만)
 * - 참여자 2명 이상: 성별 참여 비율만 공개 + 나머지는 "더 보기"로 펼침
 */
const MIN_PARTICIPANTS = 2;

export async function loadStats(issueId) {
  lockAllStats(0);   // ← 🔥 이 줄을 여기 추가
  const supabase = window.supabaseClient;

  const { count: total, error } = await supabase
    .from("votes")          // 🔥 투표 기준으로 변경
    .select("id", { count: "exact", head: true })
    .eq("issue_id", issueId);

  if (error) {
    console.error("[issue.stats] count error:", error);
    lockAllStats(0);
    return;
  }

  // 0~1명 → 안내만
  if (!total || total < MIN_PARTICIPANTS) {
    lockAllStats(total || 0);
    return;
  }

  // 2명 이상 → 성별만 + 더보기
  unlockBasicStats();

  // ✅ 임시 더미 데이터 (UI 테스트용)
  const stats = {
    gender: { male: 54, female: 46 },
    age: [
      { label: "20대", percent: 40 },
      { label: "30대", percent: 60 }
    ],
    region: [
      { name: "서울", percent: 60 },
      { name: "부산", percent: 40 }
    ],
    gender_vote: [{ label: "남성", pro: 55, con: 45 }],
    age_vote: [{ label: "20대", pro: 60, con: 40 }],
    region_vote: [{ label: "서울", pro: 70, con: 30 }],
    ai_summary: "AI 분석을 준비 중입니다."
  };

  renderAllStats(stats);
}

/* ======================================================
   UI SELECTORS (issue.html 구조에 맞춤)
====================================================== */

function qs(sel) {
  return document.querySelector(sel);
}

function qsa(sel) {
  return Array.from(document.querySelectorAll(sel));
}

// 통계 카테고리 제목들(현재 HTML에서는 h2.stat-title)
function getStatTitles() {
  return qsa("#stats-section h2.stat-title");
}

// 통계 콘텐츠 블록들(현재 HTML id들)
function getStatContents() {
  return qsa([
    "#gender-dual",
    "#age-chart",
    "#region-heatmap",
    "#gender-vote",
    "#age-vote",
    "#region-vote",
    "#ai-summary"
  ].join(","));
}

function ensureMoreButton() {
  const section = qs("#stats-section");
  if (!section) return null;

  let btn = qs("#stats-more-btn");
  if (!btn) {
    btn = document.createElement("button");
    btn.id = "stats-more-btn";
    btn.type = "button";
    btn.className = "stats-more-btn";
    btn.textContent = "더 보기";
    btn.addEventListener("click", () => unlockAllStats());
    section.appendChild(btn);
  }
  return btn;
}

/* ======================================================
   LOCK / UNLOCK
====================================================== */

function lockAllStats(total) {
  const locked = qs("#stats-locked");
  const header = qs("#stats-section .stats-header");
  const titles = getStatTitles();
  const contents = getStatContents();
  const moreBtn = qs("#stats-more-btn");

  // 안내문 표시 + 문구 업데이트(참여자 수 반영)
  if (locked) {
    locked.hidden = false;

    // 기존 안내 구조를 유지하면서 desc만 갱신
    const desc = locked.querySelector(".ai-news-placeholder-desc");
    if (desc) {
      desc.innerHTML = `
        현재 참여자 <b>${total}명</b><br>
        참여자가 <b>${MIN_PARTICIPANTS}명 이상</b> 모이면<br>
        여론 통계가 공개됩니다.
      `;
    }
  }

  // 통계 헤더/카테고리/콘텐츠 전부 숨김
  if (header) header.hidden = true;
  titles.forEach(el => (el.hidden = true));
  contents.forEach(el => (el.hidden = true));

  // 더 보기 버튼 숨김
  if (moreBtn) moreBtn.hidden = true;
}

function unlockBasicStats() {
  const locked = qs("#stats-locked");
  const header = qs("#stats-section .stats-header");
  const titles = getStatTitles();
  const contents = getStatContents();

  // 안내 숨김
  if (locked) locked.hidden = true;

  // 헤더는 표시
  if (header) header.hidden = false;

  // 일단 전부 숨김
  titles.forEach(el => (el.hidden = true));
  contents.forEach(el => (el.hidden = true));

  // ✅ "성별 참여 비율" 타이틀 + 콘텐츠만 표시
  // HTML 순서상 첫 번째 stat-title이 성별 참여 비율이므로 그 타이틀만 켬
  if (titles[0]) titles[0].hidden = false;

  const genderDual = qs("#gender-dual");
  if (genderDual) genderDual.hidden = false;

  // 더 보기 버튼 표시
  const btn = ensureMoreButton();
  if (btn) btn.hidden = false;
}

function unlockAllStats() {
  const locked = qs("#stats-locked");
  const header = qs("#stats-section .stats-header");
  const titles = getStatTitles();
  const contents = getStatContents();
  const btn = qs("#stats-more-btn");

  if (locked) locked.hidden = true;
  if (header) header.hidden = false;

  titles.forEach(el => (el.hidden = false));
  contents.forEach(el => (el.hidden = false));

  if (btn) btn.hidden = true;
}

/* ======================================================
   RENDER ALL (기존 유지)
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

function renderGender(gender) {
  const root = qs("#gender-dual");
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

function renderAge(age) {
  const root = qs("#age-chart");
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

function renderRegion(region) {
  const root = qs("#region-heatmap");
  if (!root || !region) return;

  root.innerHTML = "";
  region.forEach(r => {
    const el = document.createElement("div");
    el.className = "region-cell";
    el.style.background = heatColor(r.percent);
    el.innerHTML = `${r.name}<br/>${r.percent}%`;
    root.appendChild(el);
  });
}

function heatColor(p) {
  const alpha = Math.min(0.85, Math.max(0.2, p / 100));
  return `rgba(255, 200, 80, ${alpha})`;
}

function renderGenderVote(data) {
  renderVoteBar("#gender-vote", data);
}
function renderAgeVote(data) {
  renderVoteBar("#age-vote", data);
}
function renderRegionVote(data) {
  renderVoteBar("#region-vote", data);
}

function renderVoteBar(selector, rows) {
  const root = qs(selector);
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

function renderAiSummary(text) {
  const root = qs("#ai-summary");
  if (!root) return;
  root.innerHTML = text || "AI 종합 의견을 분석 중입니다.";
}