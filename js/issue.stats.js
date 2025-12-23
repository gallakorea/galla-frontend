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
export async function loadStats(issueId) {
  const supabase = window.supabaseClient;
  if (!supabase || !issueId) return;

  // 🔹 통계 데이터 (뷰 또는 집계 테이블 기준)
  const { data, error } = await supabase
    .from("issue_stats_view")
    .select("*")
    .eq("issue_id", issueId)
    .single();

  if (error || !data) {
    lockStats(0);
    return;
  }

  const total = (data.pro_count || 0) + (data.con_count || 0);

  if (total < MIN_PARTICIPANTS) {
    lockStats(total);
    return;
  }

  unlockStats();
  renderAllStats(data);
}

/* ======================================================
   LOCK / UNLOCK
====================================================== */

function lockStats(total) {
  const section = document.getElementById("stats-section");
  if (!section) return;

  // 기존 내용 숨김
  Array.from(section.children).forEach(el => el.hidden = true);

  // 🔹 안내 박스 생성 or 재사용
  let box = document.getElementById("stats-locked-box");
  if (!box) {
    box = document.createElement("div");
    box.id = "stats-locked-box";
    box.className = "ai-news-placeholder";
    section.appendChild(box);
  }

  box.innerHTML = `
    <div class="ai-news-placeholder-title">
      아직 통계가 공개되지 않았습니다
    </div>
    <div class="ai-news-placeholder-desc">
      현재 참여자 <b>${total}명</b><br/>
      참여자가 100명 이상일 경우<br/>
      여론 통계가 공개됩니다.
    </div>
    <div class="ai-news-placeholder-sub">
      더 많은 참여로 여론을 만들어 주세요.
    </div>
  `;
}

function unlockStats() {
  const section = document.getElementById("stats-section");
  if (!section) return;

  const box = document.getElementById("stats-locked-box");
  if (box) box.remove();

  Array.from(section.children).forEach(el => el.hidden = false);
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