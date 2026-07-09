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
    .map(v => ({
      id: Number(v.id),
      video_url: v.video_url,
      title: v.title || "",
      author: v.author || "익명",
      level: v.level != null ? v.level : "",
      category: v.category || "",
      user_id: v.user_id || "",
      faction_a: v.faction_a || "",
      faction_b: v.faction_b || ""
    }));
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
  // ===== Inject overlay styles for shorts meta (once) =====
  if (!document.getElementById("shortsMetaStyle")) {
    const style = document.createElement("style");
    style.id = "shortsMetaStyle";
    style.textContent = `
.shorts-meta{
  position:absolute;
  left:14px;
  top:58px;               /* 좌측 상단 (뒤로가기 버튼 아래) */
  right:70px;             /* 우측 액션 버튼과 겹치지 않게 */
  max-width:none;
  z-index:30;
  color:#fff;
  font-family:system-ui,-apple-system,BlinkMacSystemFont;
  pointer-events:auto;
  text-shadow:0 1px 6px rgba(0,0,0,.6);
}

.shorts-author{
  display:flex;
  gap:10px;
}

.author-avatar{
  width:44px;
  height:44px;
  border-radius:50%;
  object-fit:cover;
  border:1px solid rgba(255,255,255,.4);
}
.author-avatar-init{
  display:flex;
  align-items:center;
  justify-content:center;
  font-weight:800;
  font-size:18px;
  color:#fff;
  background:linear-gradient(135deg,#ff9b2f,#ff6a00);
}
.shorts-cat{
  font-size:12px;
  opacity:.75;
  margin-top:2px;
}

.author-info{
  display:flex;
  flex-direction:column;
  gap:4px;
}

.author-line{
  display:flex;
  align-items:center;
  gap:8px;
  font-size:15px;
  font-weight:800;
  line-height:1.2;
}

.author-level{
  font-size:12px;
  padding:2px 8px;
  border-radius:10px;
  background:rgba(255,255,255,.18);
  font-weight:700;
}

.author-follow{
  margin-left:6px;
  font-size:12px;
  padding:4px 10px;
  border-radius:14px;
  border:1px solid rgba(255,255,255,.45);
  background:rgba(0,0,0,.45);
  color:#fff;
  font-weight:700;
  cursor:pointer;
}

.shorts-title{
  margin-top:6px;
  font-size:15px;
  font-weight:700;
  line-height:1.35;
  opacity:.95;
}
`;
    document.head.appendChild(style);
  }

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

    .comment-tabs.tabs-menu{
      position: sticky;
      top: 72px; /* summary height 기준 고정 */
      z-index: 5;

      display:flex;
      margin:0 14px 10px;
      padding:6px;
      gap:0;

      border-radius:18px;
      background:#0d0d0d;
      border:2px solid #000;
      box-shadow:
        inset 0 0 0 2px rgba(255,255,255,.15),
        0 6px 18px rgba(0,0,0,.6);
    }
    .comment-tabs .stance-tab{
      flex:1;
      padding:10px 0;
      border-radius:10px;
      border:none;
      background:transparent;
      color:#bbb;
      font-weight:800;
      letter-spacing:1px;
      transition:.15s;
    }
    .comment-tabs .stance-tab.active{
      color:#fff;
      background:linear-gradient(180deg,#1a1a1a,#050505);
      box-shadow:0 0 16px rgba(255,255,255,.35);
    }
    .comment-tabs .stance-tab.active.pro{
      box-shadow:0 0 16px rgba(91,188,255,.6);
    }
    .comment-tabs .stance-tab.active.con{
      box-shadow:0 0 16px rgba(255,107,107,.6);
    }

    /* ===============================
       COMMENT BILLBOARD (STICKY)
    ================================ */
    .comment-billboard.sticky{
      position: sticky;
      top: 128px; /* summary + tabs 높이 합 */
      z-index: 4;

      margin: 0 14px 10px;
      padding: 10px;
      border-radius: 12px;

      background:
        linear-gradient(180deg,rgba(255,255,255,.12),rgba(0,0,0,.85)),
        repeating-linear-gradient(45deg,#050505,#050505 6px,#0a0a0a 6px,#0a0a0a 12px);

      box-shadow: 0 0 28px rgba(255,255,255,.35);
    }

    .comment-billboard .billboard-item{
      padding: 8px;
      border-radius: 8px;
      font-size: 12px;
      margin-bottom: 6px;
      background: linear-gradient(180deg,#1a1a1a,#020202);
    }
    .comment-billboard .billboard-item:last-child{
      margin-bottom: 0;
    }

    .comment-list-wrap{
      flex:1;
      display:flex;
      flex-direction:column;
      overflow:hidden;
    }
    .comment-sort{
      display:none; /* 최신순 고정 */
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
    <div class="comment-tabs tabs-menu">
      <button class="stance-tab pro active" data-stance="pro">찬성</button>
      <button class="stance-tab con" data-stance="con">반대</button>
    </div>

    <!-- B-2. 빌보드 (STICKY, 조건부 노출 / 최대 3) -->
    <div id="commentBillboard" class="comment-billboard sticky" hidden>
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
    if (item.user_id) section.dataset.authorId = item.user_id;

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

    <!-- LEFT META (AUTHOR) -->
    <div class="shorts-meta">
      <div class="shorts-author">
        <div class="author-avatar author-avatar-init">${(item.author || "익").trim().charAt(0) || "익"}</div>
        <div class="author-info">
          <div class="author-line">
            <span class="author-name">${item.author || "익명"}</span>
            ${item.level !== "" ? `<span class="author-level">Lv.${item.level}</span>` : ""}
          </div>
          ${item.category ? `<div class="shorts-cat">${item.category}</div>` : ""}
          <div class="shorts-title">${item.title || ""}</div>
        </div>
      </div>
    </div>

    <!-- RIGHT ACTIONS (INSTAGRAM STYLE) -->
    <div class="shorts-actions">
      <button class="shorts-action-btn comment" aria-label="댓글">
        <svg viewBox="0 0 24 24">
          <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/>
        </svg>
      </button>

      <button class="shorts-action-btn share" aria-label="공유">
        <svg viewBox="0 0 24 24">
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

  /* 🔥 추가: 쇼츠 복귀용 상태 저장 */
  sessionStorage.setItem("__SHORTS_RETURN__", JSON.stringify({
    list: shortsList,
    index: currentIndex,
    issueId: shortsList[currentIndex]?.id
  }));

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
      // 소리는 기본 ON, 사용자가 음소거하면 다음 영상까지 그 상태 유지(스티키)
      v.muted = !!window.__REELS_MUTED__;

      const playPromise = v.play();
      if (playPromise && typeof playPromise.catch === "function") {
        // 브라우저가 소리 자동재생을 막으면 음소거로 폴백해 재생은 유지
        playPromise.catch(() => {
          v.muted = true;
          v.play().catch(() => {});
        });
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
      // 🔒 block vertical movement, but DO NOT move track horizontally
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

    // 👉 Horizontal swipe navigation
    if (dx > CLOSE_THRESHOLD_X) {
      // Swipe RIGHT → go back to previous page / previous scroll position
      closeShorts();
      setTimeout(() => {
        history.back();
      }, 50);
      return;
    }

    if (dx < -CLOSE_THRESHOLD_X) {
      // Swipe LEFT → go to shorts author's mypage
      const current = shortsList[currentIndex];
      const section = document.querySelectorAll(".short")[currentIndex];
      const authorId = section?.dataset?.authorId;

      /* 🔥 복귀 정보 최신화 */
      sessionStorage.setItem("__SHORTS_RETURN__", JSON.stringify({
        list: shortsList,
        index: currentIndex,
        issueId: current?.id
      }));

      closeShorts();

      // 🔥 authorId 없으면 기본 마이페이지로 이동
      const target = authorId
        ? `/mypage.html?user=${authorId}&from=shorts`
        : `/mypage.html?from=shorts`;

      setTimeout(() => {
        location.href = target;
      }, 50);
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
/* 릴스 조작:
   - 한 번 탭  → 음소거 토글 (음소거하면 다음 영상까지 유지)
   - 더블 탭 후 누르고 있기 → 누르는 동안 2배속, 떼면 1배속
*/
function reelBadge(section, text, isSpeed) {
  if (!section) return null;
  let b = section.querySelector(`.reel-badge.${isSpeed ? "speed" : "mute"}`);
  if (!b) {
    b = document.createElement("div");
    b.className = `reel-badge ${isSpeed ? "speed" : "mute"}`;
    section.appendChild(b);
  }
  b.textContent = text;
  return b;
}
function flashBadge(section, text) {
  const b = reelBadge(section, text, false);
  if (!b) return;
  b.classList.add("show");
  clearTimeout(b.__t);
  b.__t = setTimeout(() => b.classList.remove("show"), 650);
}
function showSpeedBadge(section, on) {
  const b = reelBadge(section, "2배속 ⏩", true);
  if (!b) return;
  b.classList.toggle("show", on);
}

function curVideoAndSection() {
  const video = document.querySelectorAll("#shortsTrack video")[currentIndex];
  const section = document.querySelectorAll(".short")[currentIndex];
  return { video, section };
}

function bindTapControls() {
  let tapTimer = null;
  let waitingSecond = false;
  let holding2x = false;
  let downX = 0, downY = 0, moved = false;

  const isControl = t =>
    t.closest &&
    t.closest(".shorts-vote,.vote-btn,.shorts-actions,.shorts-action-btn,#shortsCloseBtn,.shorts-top,.author-follow,#shortsCommentModal");

  overlay.addEventListener("pointerdown", e => {
    if (isControl(e.target)) return;
    downX = e.clientX; downY = e.clientY; moved = false;
    if (waitingSecond) {
      // 더블탭의 두 번째 탭 → 누르는 동안 2배속
      if (tapTimer) { clearTimeout(tapTimer); tapTimer = null; }
      waitingSecond = false;
      const { video, section } = curVideoAndSection();
      if (video) { video.playbackRate = 2; holding2x = true; showSpeedBadge(section, true); }
    }
  });

  overlay.addEventListener("pointermove", e => {
    if (Math.abs(e.clientX - downX) > 12 || Math.abs(e.clientY - downY) > 12) moved = true;
  });

  const endHold = () => {
    if (!holding2x) return;
    holding2x = false;
    const { video, section } = curVideoAndSection();
    if (video) video.playbackRate = 1;
    showSpeedBadge(section, false);
  };

  overlay.addEventListener("pointerup", e => {
    if (isControl(e.target)) { endHold(); return; }
    if (holding2x) { endHold(); return; }
    if (moved) { // 스와이프였음 → 탭 아님
      if (tapTimer) { clearTimeout(tapTimer); tapTimer = null; }
      waitingSecond = false;
      return;
    }
    // 깔끔한 탭 → 더블탭 여부 확인 후 단일 탭이면 음소거 토글
    waitingSecond = true;
    tapTimer = setTimeout(() => {
      waitingSecond = false; tapTimer = null;
      const { video, section } = curVideoAndSection();
      if (!video) return;
      window.__REELS_MUTED__ = !window.__REELS_MUTED__;
      video.muted = window.__REELS_MUTED__;
      flashBadge(section, window.__REELS_MUTED__ ? "🔇 음소거" : "🔊 소리 켜짐");
    }, 260);
  });

  overlay.addEventListener("pointercancel", endHold);
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
  // 진영명(있으면) 반영 — 없으면 기본 찬성/반대
  const cur = shortsList[currentIndex] || {};
  const proBtn = bar.querySelector('.vote-btn.pro');
  const conBtn = bar.querySelector('.vote-btn.con');
  if (proBtn) proBtn.textContent = `👍 ${cur.faction_a || "찬성이오"}`;
  if (conBtn) conBtn.textContent = `👎 ${cur.faction_b || "반댈세"}`;

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

  // ===== PC MOUSE DRAG SUPPORT =====
  let mouseDragging = false;

  sheet.onmousedown = e => {
    // 댓글 리스트 스크롤 중이면 모달 드래그 막음
    if (isScrollableTarget(e.target) && list.scrollTop > 0) return;

    mouseDragging = true;
    startY = e.clientY;
    startPos = sheet.getBoundingClientRect().top;
    sheet.style.transition = "none";

    e.preventDefault();
  };

  window.onmousemove = e => {
    if (!mouseDragging) return;

    const dy = e.clientY - startY;
    currentPos = Math.min(CLOSE_Y, Math.max(FULL_Y, startPos + dy));
    sheet.style.transform = `translateX(-50%) translateY(${currentPos}px)`;
  };

  window.onmouseup = () => {
    if (!mouseDragging) return;
    mouseDragging = false;

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
// COMMENT LOAD (DUMMY)
// =========================
function loadShortsComments() {
  // ===== Billboard conditional display (dummy) =====
  const billboard = document.getElementById("commentBillboard");

  // 더미 조건: 빌보드 댓글 3개 이상일 때만 노출
  const hasBillboard = true; // 나중에 조건 연결

  if (billboard) {
    billboard.hidden = !hasBillboard;
  }

  const list = document.getElementById("shortsCommentList");
  if (!list) return;

  const stance = window.currentCommentStance;
  // const sort = window.currentCommentSort;
  const sort = "latest";

  list.innerHTML = `
    <div style="padding:12px 0;border-bottom:1px solid #222">
      <strong>유저A</strong> · ${stance === "pro" ? "찬성" : "반대"}<br/>
      최신 기준 더미 댓글
    </div>
    <div style="padding:12px 0;border-bottom:1px solid #222">
      <strong>유저B</strong><br/>
      다음 단계에서 DB 연결 예정
    </div>
  `;
}
  // ===== Inject overlay styles for shorts actions (once) =====
  if (!document.getElementById("shortsActionsStyle")) {
    const style = document.createElement("style");
    style.id = "shortsActionsStyle";
    style.textContent = `
.shorts-actions {
  position:absolute;
  right:12px;
  bottom:96px;
  display:flex;
  flex-direction:column;
  gap:18px;
  z-index:5;
}

.shorts-action-btn{
  background:none;
  border:none;
  padding:0;
  width:44px;
  height:44px;
  display:flex;
  align-items:center;
  justify-content:center;
}

.shorts-action-btn svg{
  width:26px;
  height:26px;
  stroke:#fff;
  stroke-width:1.8;
  fill:none;
}

.shorts-action-btn:active svg{
  transform:scale(.92);
}
`;
    document.head.appendChild(style);
  }