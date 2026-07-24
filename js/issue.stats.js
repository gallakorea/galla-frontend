console.log("[issue.stats.js] loaded");

/**
 * 통계 공개 정책
 * - 참여자 30명 미만: 통계 전체 비공개(안내만). n≥30 = 통계적으로 유의미한 최소 표본.
 * - 버킷(성별/나이대/지역 각 항목)은 5명 미만이면 숨김
 *   → "서울 여성 1명 100% 찬성" 같은 소표본 노이즈·개인식별(신원노출) 방지.
 */
const MIN_PARTICIPANTS = 30;
const MIN_BUCKET = 5;

export async function loadStats(issueId) {
  showSkel();   // ⏳ 집계 전엔 스켈레톤만 — '빈 통계 UI가 떴다가 잠금 안내로 바뀌는' 플래시 제거
  const supabase = window.supabaseClient;

  // 🔒 개인정보 보호: 원시 투표자 성별/생년/지역을 클라이언트로 내리지 않고
  //    서버(SECURITY DEFINER)에서 집계만 반환. 소표본 억제(참여30·버킷5)도 서버에서 적용.
  const { data, error } = await supabase.rpc("issue_demographics", { p_issue: issueId });
  if (error) { console.error("[issue.stats] demographics error:", error); lockAllStats(0); return; }

  const total = data?.total || 0;
  if (!data || data.locked || total < MIN_PARTICIPANTS) { lockAllStats(total); return; }

  const stats = {
    gender: data.gender || null,
    age: data.age || [],
    region: data.region || [],
    gender_vote: data.gender_vote || [],
    age_vote: data.age_vote || [],
    region_vote: data.region_vote || [],
    ai_summary: "AI 종합 분석은 준비 중입니다.",
  };

  unlockAllStats();
  renderAllStats(stats);
  hideEmptyStats(stats);   // 데이터 없는 섹션(성별 등)은 숨김
}

// 실제 데이터가 없는 통계 섹션(제목+콘텐츠)을 숨긴다
function hideEmptyStats(stats) {
  const titles = getStatTitles();
  const conts = ["#gender-dual", "#age-chart", "#region-heatmap", "#gender-vote", "#age-vote", "#region-vote", "#ai-summary"].map(s => document.querySelector(s));
  const empty = [
    !stats.gender,
    !stats.age.length,
    !stats.region.length,
    !stats.gender_vote.length,
    !stats.age_vote.length,
    !stats.region_vote.length,
    false,
  ];
  empty.forEach((e, i) => { if (titles[i]) titles[i].hidden = e; if (conts[i]) conts[i].hidden = e; });
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

/* ⏳ 스켈레톤: 집계 RPC가 도는 동안만 노출. 잠금/해제 어느 쪽으로 끝나든 반드시 숨긴다. */
function showSkel() {
  const skel = qs("#stats-skel");
  if (skel) skel.hidden = false;
  const locked = qs("#stats-locked");
  if (locked) locked.hidden = true;
  qs("#stats-section .stats-header") && (qs("#stats-section .stats-header").hidden = true);
  getStatTitles().forEach(el => (el.hidden = true));
  getStatContents().forEach(el => (el.hidden = true));
}
function hideSkel() { const skel = qs("#stats-skel"); if (skel) skel.hidden = true; }

function lockAllStats(total) {
  hideSkel();
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
  hideSkel();
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
  hideSkel();
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

/* ============================================================
   인터랙티브 인포그래픽 유틸
   - giReveal: 스크롤 진입 시 .gi-in 부여 → CSS 전환/카운트업 트리거
   - giCountUp: 숫자 카운트업 애니메이션
============================================================ */
let GI_OBSERVER = null;
function giObserver() {
  if (GI_OBSERVER) return GI_OBSERVER;
  GI_OBSERVER = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const el = e.target;
      el.classList.add("gi-in");
      el.querySelectorAll("[data-count]").forEach(giCountUp);
      GI_OBSERVER.unobserve(el);
    });
  }, { threshold: 0.25 });
  return GI_OBSERVER;
}
function giReveal(el) {
  if (!el) return;
  // 이미 화면 안이면 즉시, 아니면 관찰
  const r = el.getBoundingClientRect();
  if (r.top < window.innerHeight && r.bottom > 0) {
    el.classList.add("gi-in");
    el.querySelectorAll("[data-count]").forEach(giCountUp);
  } else {
    giObserver().observe(el);
  }
}
function giCountUp(node) {
  const target = parseFloat(node.dataset.count) || 0;
  const dur = 900, t0 = performance.now();
  const suffix = node.dataset.suffix || "";
  (function step(now) {
    const p = Math.min(1, (now - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    node.textContent = Math.round(target * eased) + suffix;
    if (p < 1) requestAnimationFrame(step);
  })(t0);
}

function renderGender(gender) {
  const root = qs("#gender-dual");
  if (!root || !gender) return;
  const male = gender.male, female = gender.female;
  const lead = male >= female ? "남성" : "여성";
  const leadPct = Math.max(male, female);

  root.innerHTML = `
    <div class="gi-gender gi-card">
      <div class="gi-donut" style="--giT:${male}">
        <div class="gi-donut-center">
          <b data-count="${leadPct}" data-suffix="%">0%</b>
          <span>${lead} 우세</span>
        </div>
      </div>
      <div class="gi-legend">
        <div class="gi-leg male"><span class="gi-dot"></span>남성 <b data-count="${male}" data-suffix="%">0%</b></div>
        <div class="gi-leg female"><span class="gi-dot"></span>여성 <b data-count="${female}" data-suffix="%">0%</b></div>
      </div>
    </div>`;
  giReveal(root.querySelector(".gi-gender"));
}

function renderAge(age) {
  const root = qs("#age-chart");
  if (!root || !age) return;
  const max = Math.max(...age.map(a => a.percent), 1);
  root.innerHTML = `<div class="gi-card gi-bars">${age.map((row, i) => `
    <div class="gi-bar-row" style="--giD:${i * 90}ms">
      <div class="gi-bar-head"><span>${escapeText(row.label)}</span><b data-count="${row.percent}" data-suffix="%">0%</b></div>
      <div class="gi-track"><div class="gi-fill age" style="--giW:${Math.round(row.percent / max * 100)}%"></div></div>
    </div>`).join("")}</div>`;
  giReveal(root.querySelector(".gi-bars"));
}

function renderRegion(region) {
  const root = qs("#region-heatmap");
  if (!root || !region) return;
  const sorted = [...region].sort((a, b) => b.percent - a.percent);
  const max = Math.max(...region.map(r => r.percent), 1);
  root.className = "region-heatmap gi-card gi-heat";
  root.innerHTML = sorted.map((r, i) => {
    const intensity = r.percent / max;
    return `<button class="gi-heat-cell" style="--giA:${intensity.toFixed(2)}; --giD:${i * 70}ms" data-name="${escapeText(r.name)}" data-pct="${r.percent}">
      ${i === 0 ? '<span class="gi-heat-crown">👑</span>' : ""}
      <span class="gi-heat-name">${escapeText(r.name)}</span>
      <b class="gi-heat-pct" data-count="${r.percent}" data-suffix="%">0%</b>
    </button>`;
  }).join("");
  // 탭하면 강조
  root.querySelectorAll(".gi-heat-cell").forEach(c => {
    c.addEventListener("click", () => {
      root.querySelectorAll(".gi-heat-cell").forEach(x => x.classList.remove("on"));
      c.classList.add("on");
    });
  });
  giReveal(root);
}

function heatColor(p) {
  const alpha = Math.min(0.85, Math.max(0.2, p / 100));
  return `rgba(255, 200, 80, ${alpha})`;
}

function escapeText(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderGenderVote(data) { renderVoteBar("#gender-vote", data); }
function renderAgeVote(data) { renderVoteBar("#age-vote", data); }
function renderRegionVote(data) { renderVoteBar("#region-vote", data); }

/* 찬반: 중앙 기준 양방향(diverging) 바 — 찬성 파랑(왼쪽) / 반대 빨강(오른쪽) */
function renderVoteBar(selector, rows) {
  const root = qs(selector);
  if (!root || !rows) return;
  root.innerHTML = `<div class="gi-card gi-diverge">${rows.map((r, i) => `
    <div class="gi-dv-row" style="--giD:${i * 90}ms">
      <div class="gi-dv-head">
        <span class="gi-dv-label">${escapeText(r.label)}</span>
        <span class="gi-dv-nums"><b class="pro" data-count="${r.pro}" data-suffix="%">0%</b> · <b class="con" data-count="${r.con}" data-suffix="%">0%</b></span>
      </div>
      <div class="gi-dv-track">
        <div class="gi-dv-pro" style="--giW:${r.pro}%"></div>
        <div class="gi-dv-con" style="--giW:${r.con}%"></div>
        <div class="gi-dv-mid"></div>
      </div>
    </div>`).join("")}</div>`;
  giReveal(root.querySelector(".gi-diverge"));
}

function renderAiSummary(text) {
  const root = qs("#ai-summary");
  if (!root) return;
  root.innerHTML = text || "AI 종합 의견을 분석 중입니다.";
}