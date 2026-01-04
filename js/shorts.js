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

const NAV_HEIGHT = 58;
const SWIPE_THRESHOLD = 70;
const CLOSE_THRESHOLD_X = 120;

/* =========================
   OPEN API
========================= */
window.__SHORTS_ENGINE_READY__ = false;

window.openShorts = function (list, startId) {
  if (typeof window.__OPEN_SHORTS_INTERNAL__ === "function") {
    window.__OPEN_SHORTS_INTERNAL__(list, startId);
  } else {
    console.warn("[SHORTS] openShorts called before engine ready");
    window.__SHORTS_OPEN_QUEUE__.push({ list, startId });
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
    <div id="shortsTrack"></div>
    <button id="shortsCloseBtn">←</button>
  `;

  track = overlay.querySelector("#shortsTrack");

  /* ===== overlay style ===== */
  Object.assign(overlay.style, {
    position: "fixed",
    top: "0",
    left: "0",
    right: "0",
    bottom: "58px",
    zIndex: "9999",
    background: "#000",
    overflow: "hidden",
    touchAction: "none",
    overscrollBehavior: "contain"
  });

  /* ===== close btn ===== */
  const closeBtn = overlay.querySelector("#shortsCloseBtn");
  Object.assign(closeBtn.style, {
    position: "absolute",
    top: "12px",
    left: "12px",
    zIndex: "60",
    background: "rgba(0,0,0,.5)",
    color: "#fff",
    border: "none",
    fontSize: "18px"
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
        muted 
        preload="auto"
        style="width:100%;height:100%;object-fit:cover"
      ></video>

      <div class="shorts-vote-bar" style="
        position:absolute;
        left:0;
        right:0;
        bottom:58px;
        padding:12px;
        display:flex;
        gap:10px;
        background:linear-gradient(to top, rgba(0,0,0,.7), rgba(0,0,0,0));
      ">
        <button class="shorts-vote-pro" data-issue-id="${item.id}" style="
          flex:1;
          height:44px;
          border-radius:10px;
          border:none;
          background:#1f3cff;
          color:#fff;
          font-weight:600;
        ">👍 찬성이오</button>

        <button class="shorts-vote-con" data-issue-id="${item.id}" style="
          flex:1;
          height:44px;
          border-radius:10px;
          border:none;
          background:#ffd966;
          color:#000;
          font-weight:600;
        ">👎 난 반댈세</button>
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

  document.body.style.overflow = "hidden";
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
  syncVote();
}

function playOnlyCurrent() {
  document.querySelectorAll("#shortsTrack video").forEach((v, i) => {
    if (i === currentIndex) {
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
    const now = Date.now();

    if (now - lastTap < 300) {
      video.playbackRate = video.playbackRate === 1 ? 2 : 1;
    } else {
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

document.addEventListener("click", e => {
  const proBtn = e.target.closest(".shorts-vote-pro");
  const conBtn = e.target.closest(".shorts-vote-con");

  if (proBtn && window.GALLA_VOTE) {
    window.GALLA_VOTE(proBtn.dataset.issueId, "pro");
  }

  if (conBtn && window.GALLA_VOTE) {
    window.GALLA_VOTE(conBtn.dataset.issueId, "con");
  }
});