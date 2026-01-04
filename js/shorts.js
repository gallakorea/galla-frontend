/* =========================================================
   GALLA SHORTS / REELS ENGINE (FINAL)
   - index 기반 전환 (scroll 폐기)
   - transform + drag
   - 완전한 릴스/쇼츠 UX
========================================================= */

window.__SHORTS_OPEN_QUEUE__ = window.__SHORTS_OPEN_QUEUE__ || [];
window.__SHORTS_VOTING_LOCK__ = false;

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
    height: `${shortsList.length * 100}vh`,
    transition: "transform 0.35s cubic-bezier(.4,0,.2,1)",
    willChange: "transform"
  });

  shortsList.forEach(item => {
    const section = document.createElement("section");
    section.className = "short";
    section.dataset.issueId = item.id;

    Object.assign(section.style, {
      height: "100vh",
      maxWidth: "480px",
      margin: "0 auto",
      position: "relative"
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
  const h = window.innerHeight;
  track.style.transform = `translateY(-${idx * h}px)`;
  window.__CURRENT_SHORT_ISSUE_ID__ = shortsList[currentIndex]?.id || null;

  playOnlyCurrent();
  updateShortsVoteBar();
  syncVote();
}

function playOnlyCurrent() {
  document.querySelectorAll("#shortsTrack video").forEach((v, i) => {
    if (i === currentIndex) {
      v.muted = false;
      v.play().catch(()=>{});
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
    isDragging = true;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    currentTranslateY = -currentIndex * window.innerHeight;
    track.style.transition = "none";
  }, { passive: true });

  overlay.addEventListener("touchmove", e => {
    if (!isDragging) return;

    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;

    if (Math.abs(dx) > Math.abs(dy)) {
      track.style.transform = `
        translateX(${dx}px)
        translateY(-${currentIndex * window.innerHeight}px)
      `;
      track.style.opacity = `${1 - Math.min(Math.abs(dx) / 300, 0.5)}`;
      return;
    }

    track.style.transform = `translateY(${currentTranslateY + dy}px)`;
  }, { passive: true });

  overlay.addEventListener("touchend", e => {
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
    console.log("[SHORTS] open comments:", issueId);
  }

  if (btn.classList.contains("share")) {
    console.log("[SHORTS] share issue:", issueId);
  }
});