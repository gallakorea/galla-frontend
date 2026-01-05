/* =========================================================
   GALLA SHORTS / REELS ENGINE (FINAL)
   - index 기반 전환 (scroll 폐기)
   - transform + drag
   - 완전한 릴스/쇼츠 UX
========================================================= */

window.__SHORTS_OPEN_QUEUE__ = window.__SHORTS_OPEN_QUEUE__ || [];
window.__SHORTS_VOTING_LOCK__ = false;
window.currentCommentStance = "pro";   // pro | con
window.currentCommentSort = "latest"; // latest | popular

window.__COMMENT_OPEN__ = false;
window.__COMMENT_STATE__ = "closed"; // closed | half | full

function isScrollableTarget(el) {
  return el && el.closest && el.closest(".comment-list");
}

let shortsList = [];
let currentIndex = 0;
let overlay, track;

let isDragging = false;
let startX = 0;
let startY = 0;
let currentTranslateY = 0;
let velocityY = 0;

const SWIPE_THRESHOLD = 70;
const CLOSE_THRESHOLD_X = 120;

function getViewportHeight() {
  return window.visualViewport
    ? window.visualViewport.height
    : window.innerHeight;
}

let VIEWPORT_H = getViewportHeight();

function updateViewportHeight() {
  VIEWPORT_H = getViewportHeight();

  if (track) {
    track.style.height = `${shortsList.length * VIEWPORT_H}px`;
    track.style.transition = "none";
    track.style.transform = `translateY(-${currentIndex * VIEWPORT_H}px)`;
  }
}
window.addEventListener("resize", updateViewportHeight);
window.addEventListener("orientationchange", updateViewportHeight);

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", updateViewportHeight);
  window.visualViewport.addEventListener("scroll", updateViewportHeight);
}

/* =========================
   OPEN API
========================= */
window.__SHORTS_ENGINE_READY__ = false;

window.openShorts = function (list, startId) {
  try {
    if (typeof window.__OPEN_SHORTS_INTERNAL__ === "function") {
      window.__OPEN_SHORTS_INTERNAL__(list, startId);
    } else {
      console.warn("[SHORTS] __OPEN_SHORTS_INTERNAL__ missing, queueing");
      window.__SHORTS_OPEN_QUEUE__.push({ list, startId });
      document.addEventListener("DOMContentLoaded", () => {
        if (typeof window.__OPEN_SHORTS_INTERNAL__ === "function") {
          window.__OPEN_SHORTS_INTERNAL__(list, startId);
        }
      }, { once: true });
    }
  } catch (e) {
    console.error("[SHORTS] openShorts failed", e);
  }
};

/* =========================
   CORE OPEN
========================= */
function __openShortsInternal(list, startId) {
  // 🔥 HARD FIX: 항상 video_url 있는 항목만, 순서 고정
  shortsList = (list || [])
    .filter(v => v && v.video_url)
    .map(v => ({ id: Number(v.id), video_url: v.video_url }));
  if (!shortsList.length) return;

  overlay = document.getElementById("shortsOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "shortsOverlay";
    document.body.appendChild(overlay);
  }

  // Clear overlay for fresh rendering
  overlay.innerHTML = `
    <div id="shortsContainer">
      <div id="shortsVoteBar" class="shorts-vote">
        <button class="vote-btn pro" data-vote="pro" data-issue-id="">👍 찬성이오</button>
        <button class="vote-btn con" data-vote="con" data-issue-id="">👎 반댈세</button>
      </div>
      <div class="shorts-top">
        <button id="shortsCloseBtn">←</button>
      </div>
      <div id="shortsTrack"></div>
    </div>
  `;

  // === 댓글 모달 HTML 생성 추가 ===
  if (!document.getElementById("shortsCommentModal")) {
    const modal = document.createElement("div");
    modal.id = "shortsCommentModal";
    modal.innerHTML = `
<style>
/* ===== Shorts Comment Modal UI (Issue Tone) ===== */
#shortsCommentModal .comment-sheet{
  background:linear-gradient(180deg,#0e0e0e,#030303);
  color:#fff;
  box-shadow:0 -10px 40px rgba(0,0,0,.9);
}
.comment-summary{
  padding:14px;
  border-bottom:1px solid rgba(255,255,255,.12);
}
.comment-summary .summary-bar{
  display:flex;
  align-items:center;
  gap:8px;
  font-size:13px;
  font-weight:700;
}
.comment-summary .bar{
  flex:1;
  height:6px;
  background:#222;
  border-radius:4px;
  overflow:hidden;
}
.comment-summary .bar-pro{
  height:100%;
  background:linear-gradient(90deg,#5bbcff,#4da3ff);
  box-shadow:0 0 8px rgba(91,188,255,.6);
}
.comment-summary .summary-meta{
  margin-top:6px;
  font-size:11px;
  opacity:.7;
}

.comment-tabs{
  display:flex;
  gap:8px;
  padding:10px 14px;
  position:sticky;
  top:0;
  background:#0b0b0b;
  z-index:5;
}
.comment-tabs .stance-tab{
  flex:1;
  padding:8px 0;
  border-radius:10px;
  border:1px solid rgba(255,255,255,.2);
  background:#111;
  color:#fff;
  font-weight:700;
}
.comment-tabs .stance-tab.active.pro{
  border-color:#5bbcff;
  box-shadow:0 0 12px rgba(91,188,255,.6);
}
.comment-tabs .stance-tab.active.con{
  border-color:#ff6b6b;
  box-shadow:0 0 12px rgba(255,107,107,.6);
}

.comment-list-wrap{
  flex:1;
  display:flex;
  flex-direction:column;
  overflow:hidden;
}
.comment-sort{
  display:flex;
  gap:8px;
  padding:8px 14px;
  position:sticky;
  top:48px;
  background:#0b0b0b;
  z-index:4;
}
.comment-sort .sort-btn{
  flex:1;
  padding:6px 0;
  border-radius:8px;
  background:#111;
  border:1px solid rgba(255,255,255,.2);
  color:#fff;
}
.comment-sort .sort-btn.active{
  background:linear-gradient(180deg,#ffffff33,#ffffff10);
  box-shadow:0 0 10px rgba(255,255,255,.5);
}

.comment-list{
  flex:1;
  overflow-y:auto;
  padding:10px 14px;
}

.comment-input{
  padding:10px 14px;
  border-top:1px solid rgba(255,255,255,.15);
  display:flex;
  gap:8px;
}
.comment-input input{
  flex:1;
  background:#050505;
  border:1px solid rgba(255,255,255,.25);
  border-radius:10px;
  color:#fff;
  padding:10px;
}
.comment-input button{
  min-width:64px;
  border-radius:10px;
  border:none;
  background:linear-gradient(180deg,#ff9b2f,#ff6a00);
  color:#000;
  font-weight:800;
}
</style>
  <div class="comment-dim"></div>

  <div class="comment-sheet">

    <!-- A. 전황 요약 (FIXED) -->
    <div class="comment-summary">
      <div class="summary-bar">
        <span class="pro">찬성 62%</span>
        <div class="bar">
          <div class="bar-pro" style="width:62%"></div>
        </div>
        <span class="con">반대 38%</span>
      </div>
      <div class="summary-meta">(총 댓글 184 · 참여자 129)</div>
    </div>

    <!-- B. 찬성 / 반대 탭 (STICKY) -->
    <div class="comment-tabs">
      <button class="stance-tab active" data-stance="pro">찬성</button>
      <button class="stance-tab" data-stance="con">반대</button>
    </div>

    <!-- C. 빌보드 (조건부 노출, 최대 3) -->
    <div id="commentBillboard" class="comment-billboard" hidden>
      <div class="billboard-item">🔥 빌보드 댓글 1</div>
      <div class="billboard-item">🔥 빌보드 댓글 2</div>
      <div class="billboard-item">🔥 빌보드 댓글 3</div>
    </div>

    <!-- D. 댓글 리스트 (ONLY SCROLL AREA) -->
    <div class="comment-list-wrap">
      <div class="comment-sort">
        <button class="sort-btn active" data-sort="latest">최신순</button>
        <button class="sort-btn" data-sort="popular">인기순</button>
      </div>

      <div id="shortsCommentList" class="comment-list"></div>
    </div>

    <!-- E. 댓글 입력 -->
    <div class="comment-input">
      <input id="shortsCommentInput" placeholder="댓글을 입력하세요" />
      <button id="shortsCommentSend">등록</button>
    </div>

  </div>
    `;
    document.body.appendChild(modal);
  }

  track = overlay.querySelector("#shortsTrack");

  /* ===== overlay style ===== */
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    zIndex: "900",   // 🔥 nav(2000)보다 낮아야 함
    background: "#000",
    overflow: "hidden",
    touchAction: "none",
    overscrollBehavior: "contain",
    display: "block",
    pointerEvents: "auto"
  });

  /* ===== close btn ===== */
  const closeBtn = overlay.querySelector("#shortsCloseBtn");
  Object.assign(closeBtn.style, {
    background: "rgba(0,0,0,.5)", 
    color: "#fff",
    border: "none",
    fontSize: "18px",
    padding: "6px 10px",
    borderRadius: "10px",
  });
  closeBtn.onclick = closeShorts;

  /* ===== track ===== */
  Object.assign(track.style, {
    width: "100%",
    height: `${shortsList.length * VIEWPORT_H}px`,
    transition: "transform 0.35s cubic-bezier(.4,0,.2,1)",
    willChange: "transform"
  });

  // Remove any previous children in track
  track.innerHTML = "";

  shortsList.forEach(item => {
    const section = document.createElement("section");
    section.className = "short";
    section.dataset.issueId = item.id;

    Object.assign(section.style, {
      height: `${VIEWPORT_H}px`,
      width: "100%",
      maxWidth: "480px",
      margin: "0 auto",
      position: "relative",
      overflow: "hidden"
    });

    section.innerHTML = `
    <video 
      src="${item.video_url}" 
      playsinline
      preload="auto"
      style="width:100%;height:100%;object-fit:cover"
    ></video>

    <!-- RIGHT ACTIONS (INSTAGRAM STYLE) -->
    <div class="shorts-actions">
      <button class="shorts-action-btn comment" aria-label="댓글">
        <svg class="icon" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="1.8"
             stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/>
        </svg>
      </button>

      <button class="shorts-action-btn share" aria-label="공유">
        <svg class="icon" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="1.8"
             stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 2L11 13"/>
          <path d="M22 2L15 22L11 13L2 9L22 2Z"/>
        </svg>
      </button>
    </div>
    `;

    track.appendChild(section);
  });

  currentIndex = Math.max(
    0,
    shortsList.findIndex(v => v.id === startId)
  );

  // 🔒 shorts-open 모드 명시 (vote / index 충돌 방지)
  document.body.classList.add("shorts-open");
  window.__CURRENT_SHORT_ISSUE_ID__ = shortsList[currentIndex]?.id || null;

  bindGestures();
  bindWheel();
  bindTapControls();
  bindKeyboard();

  moveToIndex(currentIndex, true);

  updateShortsVoteBar();

  document.body.style.overflow = "hidden";

  const voteBar = overlay.querySelector("#shortsVoteBar");
  voteBar?.addEventListener("click", e => {
    e.preventDefault();
    e.stopPropagation();

    const btn = e.target.closest(".vote-btn");
    if (!btn) return;

    const type = btn.dataset.vote;
    const issueId = voteBar.dataset.issueId;

    if (window.GALLA_VOTE && issueId) {
      window.GALLA_VOTE(issueId, type, { scope: "shorts" });
    }
  });
}

/* =========================
   MOVE / PLAY
========================= */
function moveToIndex(idx, instant = false) {
  if (idx < 0 || idx >= shortsList.length) return;

  currentIndex = idx;

  track.style.transition = instant ? "none" : "transform 0.35s cubic-bezier(.4,0,.2,1)";
  // 🔥 실제 화면 높이 기준 이동 (모바일 주소창 / iOS 대응)
  track.style.transform = `translateY(-${idx * VIEWPORT_H}px)`;
  window.__CURRENT_SHORT_ISSUE_ID__ = shortsList[currentIndex]?.id || null;

  playOnlyCurrent();
  updateShortsVoteBar();
  syncVote();
}

function playOnlyCurrent() {
  document.querySelectorAll("#shortsTrack video").forEach((v, i) => {
    if (i === currentIndex) {
      // 🔁 무한 재생 (사용자가 멈출 때까지)
      v.loop = true;
      v.setAttribute("loop", "");
      v.muted = false;

      const playPromise = v.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {});
      }
      v.playbackRate = 1;
    } else {
      v.pause();
      v.currentTime = 0;
    }
  });
}

/* =========================
   TOUCH GESTURE
========================= */
function bindGestures() {
  overlay.addEventListener("touchstart", e => {
    if (window.__COMMENT_OPEN__) return;
    isDragging = true;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    currentTranslateY = -currentIndex * VIEWPORT_H;
    track.style.transition = "none";
  }, { passive: true });

  overlay.addEventListener("touchmove", e => {
    if (window.__COMMENT_OPEN__) return;
    if (!isDragging) return;

    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;

    if (Math.abs(dx) > Math.abs(dy)) {
      track.style.transform = `
        translateX(${dx}px)
        translateY(-${currentIndex * VIEWPORT_H}px)
      `;
      track.style.opacity = `${1 - Math.min(Math.abs(dx) / 300, 0.5)}`;
      return;
    }

    track.style.transform = `translateY(${currentTranslateY + dy}px)`;
  }, { passive: true });

  overlay.addEventListener("touchend", e => {
    if (window.__COMMENT_OPEN__) return;
    isDragging = false;
    track.style.transition = "transform 0.35s cubic-bezier(.4,0,.2,1)";
    track.style.opacity = "1";

    const dy = e.changedTouches[0].clientY - startY;
    const dx = e.changedTouches[0].clientX - startX;

    if (Math.abs(dx) > CLOSE_THRESHOLD_X) {
      closeShorts();
      return;
    }

    if (dy < -SWIPE_THRESHOLD) moveToIndex(currentIndex + 1);
    else if (dy > SWIPE_THRESHOLD) moveToIndex(currentIndex - 1);
    else moveToIndex(currentIndex);
  });
}

/* =========================
   TAP / DOUBLE TAP
========================= */
function bindTapControls() {
  let lastTap = 0;

  overlay.addEventListener("click", e => {
    const video = document.querySelectorAll("#shortsTrack video")[currentIndex];
    if (!video) return;
    const now = Date.now();

    if (now - lastTap < 300) {
      video.playbackRate = video.playbackRate === 1 ? 2 : 1;
    } else {
      if (video.muted) video.muted = false;
      if (video.paused) video.play();
      else video.pause();
    }

    lastTap = now;
  });
}

/* =========================
   WHEEL (PC)
========================= */
function bindWheel() {
  let lock = false;
  overlay.addEventListener("wheel", e => {
    e.preventDefault();
    if (lock) return;
    lock = true;

    if (e.deltaY > 0) moveToIndex(currentIndex + 1);
    else moveToIndex(currentIndex - 1);

    setTimeout(() => lock = false, 400);
  }, { passive: false });
}

/* =========================
   KEYBOARD
========================= */
function bindKeyboard() {
  window.addEventListener("keydown", e => {
    if (!overlay) return;
    if (e.key === "ArrowDown") moveToIndex(currentIndex + 1);
    if (e.key === "ArrowUp") moveToIndex(currentIndex - 1);
    if (e.key === "Escape") closeShorts();
  });
}

/* =========================
   VOTE SYNC (기존 시스템 연동)
========================= */
function syncVote() {
  const issueId = shortsList[currentIndex].id;
  if (window.GALLA_CHECK_VOTE) {
    window.GALLA_CHECK_VOTE(issueId, { force: true });
  }
}

function updateShortsVoteBar() {
  const bar = document.getElementById("shortsVoteBar");
  if (!bar) return;
  const issueId = shortsList[currentIndex]?.id;
  bar.dataset.issueId = issueId;
  // Guard for missing issueId, and log
  if (!issueId) {
    console.warn("[SHORTS][VOTE] missing issueId");
    return;
  }
  console.info("[SHORTS][VOTE] sync issueId =", issueId);
  // Sync issueId onto each vote button, and reset active-vote class
  bar.querySelectorAll(".vote-btn").forEach(btn => {
    btn.dataset.issueId = issueId;
    btn.classList.remove("active-vote");
  });
  if (window.GALLA_CHECK_VOTE) {
    window.GALLA_CHECK_VOTE(issueId, { force: true, scope: "shorts" });
  }
}

/* =========================
   CLOSE
========================= */
function closeShorts() {
  document.body.style.overflow = "";
  document.body.classList.remove("shorts-open");
  window.__CURRENT_SHORT_ISSUE_ID__ = null;
  if (overlay) {
    track = null;
    overlay.remove();
    overlay = null;
  }
}

/* =========================
   EXPORT
========================= */
window.__OPEN_SHORTS_INTERNAL__ = __openShortsInternal;
window.__SHORTS_ENGINE_READY__ = true;
console.info("[SHORTS] engine ready");

if (window.__SHORTS_ENGINE_READY__ && window.__SHORTS_OPEN_QUEUE__.length) {
  window.__SHORTS_OPEN_QUEUE__.forEach(x =>
    window.__OPEN_SHORTS_INTERNAL__(x.list, x.startId)
  );
  window.__SHORTS_OPEN_QUEUE__ = [];
}

window.__FORCE_OPEN_SHORTS__ = function () {
  const list = (window.cards || []).filter(c => c.video_url)
    .map(c => ({ id: c.id, video_url: c.video_url }));
  if (!list.length) {
    alert("[SHORTS] no video cards");
    return;
  }
  window.__OPEN_SHORTS_INTERNAL__(list, list[0].id);
};
console.info("[SHORTS] FORCE_OPEN_SHORTS attached");

document.addEventListener("click", e => {
  const btn = e.target.closest(".shorts-action-btn");
  if (!btn) return;

  const short = btn.closest(".short");
  const issueId = Number(short?.dataset.issueId);
  if (!issueId) return;

  if (btn.classList.contains("comment")) {
    const modal = document.getElementById("shortsCommentModal");
    if (!modal) return;

    openCommentModal();
    loadShortsComments();
  }

  if (btn.classList.contains("share")) {
    console.log("[SHORTS] share issue:", issueId);
  }
});

function openCommentModal() {
  const modal = document.getElementById("shortsCommentModal");
  const sheet = modal?.querySelector(".comment-sheet");
  if (!modal || !sheet) return;
  if (window.__COMMENT_OPEN__) return;

  window.__COMMENT_OPEN__ = true;
  window.__COMMENT_STATE__ = "half";

  modal.classList.add("visible");
  document.body.classList.add("comment-open");

  const HALF_Y = Math.round(window.innerHeight * 0.45);

  sheet.style.transition = "none";
  sheet.style.transform = `translateX(-50%) translateY(${window.innerHeight}px)`;

  requestAnimationFrame(() => {
    sheet.style.transition = "transform 0.28s cubic-bezier(.4,0,.2,1)";
    sheet.style.transform = `translateX(-50%) translateY(${HALF_Y}px)`;
  });

  bindCommentDrag();
}

function closeCommentModal() {
  const modal = document.getElementById("shortsCommentModal");
  const sheet = modal?.querySelector(".comment-sheet");
  if (!modal || !sheet) return;

  sheet.style.transition = "transform 0.25s cubic-bezier(.4,0,.2,1)";
  sheet.style.transform = `translateX(-50%) translateY(${window.innerHeight}px)`;

  setTimeout(() => {
    modal.classList.remove("visible");
    document.body.classList.remove("comment-open");
    window.__COMMENT_OPEN__ = false;
    window.__COMMENT_STATE__ = "closed";

    const video = document.querySelectorAll("#shortsTrack video")[currentIndex];
    if (video) video.play().catch(() => {});
  }, 260);
}

function bindCommentDrag() {
  const modal = document.getElementById("shortsCommentModal");
  const sheet = modal?.querySelector(".comment-sheet");
  const list = sheet?.querySelector(".comment-list");
  if (!sheet || !list) return;

  let startY = 0;
  let startPos = 0;
  let currentPos = 0;
  let dragging = false;

  const FULL_Y = 0;
  const HALF_Y = Math.round(window.innerHeight * 0.45);
  const CLOSE_Y = Math.round(window.innerHeight * 0.85);

  sheet.ontouchstart = e => {
    if (isScrollableTarget(e.target) && list.scrollTop > 0) return;
    dragging = true;
    startY = e.touches[0].clientY;
    startPos = sheet.getBoundingClientRect().top;
    sheet.style.transition = "none";
  };

  sheet.ontouchmove = e => {
    if (!dragging) return;
    const dy = e.touches[0].clientY - startY;
    currentPos = Math.min(CLOSE_Y, Math.max(FULL_Y, startPos + dy));
    sheet.style.transform = `translateX(-50%) translateY(${currentPos}px)`;
  };

  sheet.ontouchend = () => {
    if (!dragging) return;
    dragging = false;
    sheet.style.transition = "transform 0.28s cubic-bezier(.4,0,.2,1)";

    if (currentPos > window.innerHeight * 0.6) {
      closeCommentModal();
      return;
    }

    if (currentPos < window.innerHeight * 0.25) {
      window.__COMMENT_STATE__ = "full";
      sheet.style.transform = `translateX(-50%) translateY(${FULL_Y}px)`;
    } else {
      window.__COMMENT_STATE__ = "half";
      sheet.style.transform = `translateX(-50%) translateY(${HALF_Y}px)`;
    }
  };
}

document.addEventListener("click", e => {
  const modal = document.getElementById("shortsCommentModal");
  if (!modal || !modal.classList.contains("visible")) return;

  if (e.target.classList.contains("comment-dim")) {
    closeCommentModal();
  }
});

// =========================
// COMMENT STANCE TAB (STATE)
// =========================
document.addEventListener("click", e => {
  const tab = e.target.closest("#shortsCommentModal .stance-tab");
  if (!tab) return;

  e.preventDefault();
  e.stopPropagation();

  const stance = tab.dataset.stance;
  if (!stance) return;

  // 상태 저장
  window.currentCommentStance = stance;

  // UI 갱신
  document
    .querySelectorAll("#shortsCommentModal .stance-tab")
    .forEach(btn => btn.classList.remove("active"));

  tab.classList.add("active");

  // 댓글 다시 로딩
  loadShortsComments();
});

// =========================
// COMMENT SORT (STATE)
// =========================
document.addEventListener("click", e => {
  const btn = e.target.closest("#shortsCommentModal .sort-btn");
  if (!btn) return;

  e.preventDefault();
  e.stopPropagation();

  const sort = btn.dataset.sort;
  if (!sort) return;

  // 상태 저장
  window.currentCommentSort = sort;

  // UI 갱신
  document
    .querySelectorAll("#shortsCommentModal .sort-btn")
    .forEach(b => b.classList.remove("active"));

  btn.classList.add("active");

  // 댓글 다시 로딩
  loadShortsComments();
});

// =========================
// COMMENT LOAD (DUMMY)
// =========================
function loadShortsComments() {
  const list = document.getElementById("shortsCommentList");
  if (!list) return;

  const stance = window.currentCommentStance;
  const sort = window.currentCommentSort;

  list.innerHTML = `
    <div style="padding:12px 0;border-bottom:1px solid #222">
      <strong>유저A</strong> · ${stance === "pro" ? "찬성" : "반대"}<br/>
      (${sort === "latest" ? "최신" : "인기"}) 기준 더미 댓글
    </div>
    <div style="padding:12px 0;border-bottom:1px solid #222">
      <strong>유저B</strong><br/>
      다음 단계에서 DB 연결 예정
    </div>
  `;
}