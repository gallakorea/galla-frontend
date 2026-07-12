console.log("[issue.stats.js] loaded");

/**
 * 테스트 정책 (고정)
 * - 참여자 2명 미만: 통계 비공개(안내만)
 * - 참여자 2명 이상: 성별 참여 비율만 공개 + 나머지는 "더 보기"로 펼침
 */
const MIN_PARTICIPANTS = 2;

export async function loadStats(issueId) {
  lockAllStats(0);
  const supabase = window.supabaseClient;

  // 🔥 실제 투표(votes.type='pro'|'con') + 투표자 인구통계로 집계
  const { data: votes, error } = await supabase
    .from("votes").select("user_id, type").eq("issue_id", issueId);
  if (error) { console.error("[issue.stats] votes error:", error); lockAllStats(0); return; }

  const total = votes ? votes.length : 0;
  if (total < MIN_PARTICIPANTS) { lockAllStats(total); return; }

  // 투표자 인구통계
  const uids = [...new Set(votes.map(v => v.user_id).filter(Boolean))];
  let uMap = {};
  if (uids.length) {
    const { data: users } = await supabase.from("users").select("id, gender, birth_date, region").in("id", uids);
    (users || []).forEach(u => (uMap[u.id] = u));
  }

  const ageBucket = (bd) => {
    if (!bd) return null;
    const y = new Date(bd).getFullYear(); if (!y) return null;
    const age = new Date().getFullYear() - y;
    if (age < 20) return "10대"; if (age < 30) return "20대"; if (age < 40) return "30대";
    if (age < 50) return "40대"; if (age < 60) return "50대"; return "60대+";
  };
  const genderLabel = (g) => (g === "male" || g === "남성") ? "남성" : ((g === "female" || g === "여성") ? "여성" : null);

  const partGender = { 남성: 0, 여성: 0 };
  const partAge = {}, partRegion = {};
  const vg = {}, va = {}, vr = {};
  const bump = (o, k) => { if (k) o[k] = (o[k] || 0) + 1; };
  const bumpV = (o, k, t) => { if (!k) return; o[k] = o[k] || { pro: 0, con: 0 }; o[k][t === "con" ? "con" : "pro"]++; };

  votes.forEach(v => {
    const u = uMap[v.user_id] || {};
    const g = genderLabel(u.gender), a = ageBucket(u.birth_date), r = u.region || null;
    if (g) partGender[g]++;
    bump(partAge, a); bump(partRegion, r);
    bumpV(vg, g, v.type); bumpV(va, a, v.type); bumpV(vr, r, v.type);
  });

  const pct = (n, d) => d ? Math.round(n / d * 100) : 0;
  const partArr = (o) => { const t = Object.values(o).reduce((s, n) => s + n, 0); return Object.entries(o).map(([k, n]) => ({ label: k, name: k, percent: pct(n, t) })); };
  const voteArr = (o) => Object.entries(o).map(([k, { pro, con }]) => ({ label: k, pro: pct(pro, pro + con), con: pct(con, pro + con) }));

  const genderKnown = partGender.남성 + partGender.여성;
  const stats = {
    gender: genderKnown ? { male: pct(partGender.남성, genderKnown), female: pct(partGender.여성, genderKnown) } : null,
    age: partArr(partAge),
    region: partArr(partRegion),
    gender_vote: voteArr(vg),
    age_vote: voteArr(va),
    region_vote: voteArr(vr),
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