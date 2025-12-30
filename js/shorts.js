// Helper to apply Shorts vote state to vote buttons
function applyShortsVoteState(result) {
  const shortsPro =
    document.getElementById("shortsPro") ||
    document.querySelector('.shorts-vote .pro');
  const shortsCon =
    document.getElementById("shortsCon") ||
    document.querySelector('.shorts-vote .con');
  if (!shortsPro || !shortsCon) return;

  shortsPro.classList.remove("active-vote", "locked");
  shortsCon.classList.remove("active-vote", "locked");

  if (result === "pro") {
    shortsPro.classList.add("active-vote", "locked");
    shortsCon.classList.add("locked");
  } else if (result === "con") {
    shortsCon.classList.add("active-vote", "locked");
    shortsPro.classList.add("locked");
  }
}
// js/shorts.js — Instagram Reels-like (Snap 1-step)
// 요구사항: 모바일 스와이프 1칸, PC 휠 1칸, 키보드 ↑↓ 1칸, 480px 고정

let overlay, backBtn;

let videoPrev, videoCur, videoNext;

function ensureShortsDOM() {
  overlay   = document.getElementById("shortsOverlay");
  videoPrev = document.getElementById("videoPrev");
  videoCur  = document.getElementById("shortsVideo");
  videoNext = document.getElementById("videoNext");
  backBtn   = document.getElementById("shortsBack");

  return !!(overlay && videoPrev && videoCur && videoNext && backBtn);
}

let shortsList = [];
let shortsIndex = 0;

let touchStartY = 0;
let locked = false;

/* =========================
   iOS SCROLL HARD LOCK (필수)
========================= */
let scrollY = 0;

function preventScroll(e) {
  e.preventDefault();
}

function lockIOSScroll() {
  // 터치 스크롤 전파 차단
  document.addEventListener("touchmove", preventScroll, { passive: false });

  // body 자체를 fixed로 못 박음
  scrollY = window.scrollY;
  document.body.style.position = "fixed";
  document.body.style.top = `-${scrollY}px`;
  document.body.style.width = "100%";
}

function unlockIOSScroll() {
  document.removeEventListener("touchmove", preventScroll);

  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.width = "";

  window.scrollTo(0, scrollY);
}


function lock(ms = 450) {
  locked = true;
  setTimeout(() => (locked = false), ms);
}

async function openShorts(list, startId) {

  await new Promise(r => requestAnimationFrame(() => r()));

  if (!ensureShortsDOM()) {
    console.error("[SHORTS] Shorts DOM missing");
    return;
  }

  // 이벤트는 단 한 번만 바인딩
  if (!overlay._bound) {
    bindShortsEvents();
    overlay._bound = true;
  }

  if (!Array.isArray(list)) {
    console.error("[SHORTS] invalid list:", list);
    return;
  }

  shortsList = list.filter(v => v && v.video_url);
  if (!shortsList.length) return;

  const idx = shortsList.findIndex(v => Number(v.id) === Number(startId));
  shortsIndex = idx >= 0 ? idx : 0;

  overlay.hidden = false;

  // 🔴 iOS에서 뒤 스크롤 완전 차단
  lockIOSScroll();

  document.body.classList.add("shorts-open");
  document.documentElement.classList.add("shorts-open");
  document.body.style.overflow = "hidden";

  // iOS/모바일 안전
  videoCur.playsInline = true;
  videoCur.muted = true;   // 자동재생 안정화

  videoPrev.preload = "metadata";
  videoCur.preload  = "auto";
  videoNext.preload = "metadata";

  loadVideos();
  resetPositions();

  // 🔥 [필수] 최초 진입 시 현재 영상 src 세팅 (딱 1번만)
  const cur = shortsList[shortsIndex];
  if (cur && videoCur.src !== cur.video_url) {
    videoCur.src = cur.video_url;
    videoCur.load();
    try {
      await videoCur.play();
      videoCur.muted = false; // 🔥 이 줄 추가
    } catch {}
    // 🔥 INITIAL VOTE SYNC (first open fix)
    window.currentIssue = shortsList[shortsIndex];
    if (typeof window.GALLA_CHECK_VOTE === "function") {
      const initialVote = await window.GALLA_CHECK_VOTE(window.currentIssue.id);
      applyShortsVoteState(initialVote);
    }
  }


  // =========================
  // Shorts Vote HUD binding (SAFE)
  // =========================
  const shortsPro =
    document.getElementById("shortsPro") ||
    document.querySelector('.shorts-vote .pro');
  const shortsCon =
    document.getElementById("shortsCon") ||
    document.querySelector('.shorts-vote .con');

  if (shortsPro && shortsCon && !overlay._voteBound) {
    // 🔥 always reset UI on open
    shortsPro.classList.remove("active-vote", "locked");
    shortsCon.classList.remove("active-vote", "locked");

    overlay._voteBound = true;

    shortsPro.onclick = async (e) => {
      e.stopPropagation();
      if (!window.currentIssue) return;
      if (shortsPro.classList.contains("locked")) return;

      if (typeof window.GALLA_VOTE !== "function") return;

      await window.GALLA_VOTE(window.currentIssue.id, "pro");

      // 🔥 re-sync from DB (single source of truth)
      if (typeof window.GALLA_CHECK_VOTE === "function") {
        const result = await window.GALLA_CHECK_VOTE(window.currentIssue.id);
        applyShortsVoteState(result);
      }
    };

    shortsCon.onclick = async (e) => {
      e.stopPropagation();
      if (!window.currentIssue) return;
      if (shortsCon.classList.contains("locked")) return;

      if (typeof window.GALLA_VOTE !== "function") return;

      await window.GALLA_VOTE(window.currentIssue.id, "con");

      // 🔥 re-sync from DB (single source of truth)
      if (typeof window.GALLA_CHECK_VOTE === "function") {
        const result = await window.GALLA_CHECK_VOTE(window.currentIssue.id);
        applyShortsVoteState(result);
      }
    };
  }

}

function closeShorts() {
  try { videoCur.pause(); } catch {}

  videoCur.pause();
  videoPrev.pause();
  videoNext.pause();

  // 🔥 [필수] src 완전 정리
  videoCur.removeAttribute("src");
  videoPrev.removeAttribute("src");
  videoNext.removeAttribute("src");

  videoCur.load();
  videoPrev.load();
  videoNext.load();

  overlay.hidden = true;

  unlockIOSScroll();

  document.body.classList.remove("shorts-open");
  document.documentElement.classList.remove("shorts-open");
  document.body.style.overflow = "";
}

function loadVideos() {
  const cur  = shortsList[shortsIndex];
  const prev = shortsList[shortsIndex - 1];
  const next = shortsList[shortsIndex + 1];

  // 🔥 화면에 안 보이는 것만 미리 로드
  if (prev && videoPrev.src !== prev.video_url) {
    videoPrev.src = prev.video_url;
    videoPrev.load();
  }

  if (next && videoNext.src !== next.video_url) {
    videoNext.src = next.video_url;
    videoNext.load();
  }

  // 🔥 현재 영상은 src를 여기서 바꾸지 않는다
}

function resetPositions() {
  videoPrev.style.transition = "none";
  videoCur.style.transition = "none";
  videoNext.style.transition = "none";

  videoPrev.style.transform = "translateY(-100%)";
  videoCur.style.transform  = "translateY(0)";
  videoNext.style.transform = "translateY(100%)";
}

function next() {
  if (locked) return;
  if (shortsIndex >= shortsList.length - 1) return;
  lock();
  shortsIndex += 1;
  slideUp();
}

function prev() {
  if (locked) return;
  if (shortsIndex <= 0) return;
  lock();
  shortsIndex -= 1;
  slideDown();
}

function bindShortsEvents() {

/* =========================
   Mobile Touch Swipe (1 step)
========================= */
overlay.addEventListener("touchstart", (e) => {
  if (!e.touches || !e.touches[0]) return;
  touchStartY = e.touches[0].clientY;
}, { passive: true });

overlay.addEventListener("touchend", (e) => {
  if (locked) return;
  const endY = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0].clientY : touchStartY;
  const diff = touchStartY - endY;

  // 임계값: 너무 민감하면 쭉 내려가는 느낌 남
  if (Math.abs(diff) < 90) return;

  if (diff > 0) next();  // 위로 스와이프 = 다음
  else prev();           // 아래로 스와이프 = 이전
}, { passive: true });

/* =========================
   PC Mouse Wheel (1 step)
========================= */
let wheelDelta = 0;

overlay.addEventListener("wheel", (e) => {
  e.preventDefault();
  if (locked) return;

  wheelDelta += e.deltaY;

  if (Math.abs(wheelDelta) < 80) return;

  if (wheelDelta > 0) next();
  else prev();

  wheelDelta = 0;
}, { passive: false });

/* =========================
   Keyboard (↑↓, Esc)
========================= */
window.addEventListener("keydown", (e) => {
  if (overlay.hidden) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    next();
  }
  if (e.key === "ArrowUp") {
    e.preventDefault();
    prev();
  }
  if (e.key === "Escape") {
    e.preventDefault();
    closeShorts();
  }
});

/* =========================
   UI Buttons
========================= */
if (backBtn) backBtn.onclick = closeShorts;

// 외부에서 호출
window.openShorts = openShorts;
window.closeShorts = closeShorts;


/* =========================
   TAP / DOUBLE TAP CONTROL
========================= */

let tapTimer = null;
let lastTap = 0;

overlay.addEventListener("click", () => {
  const now = Date.now();
  const delta = now - lastTap;

  // Double tap → toggle 2x speed
  if (delta < 300) {
    if (tapTimer) {
      clearTimeout(tapTimer);
      tapTimer = null;
    }

    videoCur.playbackRate = videoCur.playbackRate === 1 ? 2 : 1;
    lastTap = 0;
    return;
  }

  lastTap = now;
  tapTimer = setTimeout(() => {
    if (videoCur.paused) {
      videoCur.play().catch(() => {});
    } else {
      videoCur.pause();
    }
    tapTimer = null;
  }, 300);
});
}

function slideUp() {
  videoPrev.style.transition =
  videoCur.style.transition =
  videoNext.style.transition = "transform 0.35s ease";

  videoPrev.style.transform = "translateY(-200%)";
  videoCur.style.transform  = "translateY(-100%)";
  videoNext.style.transform = "translateY(0)";

  setTimeout(async () => {
    // 🔥 videoNext → videoCur로 승격
    const oldPrev = videoPrev;
    videoPrev = videoCur;
    videoCur  = videoNext;
    videoNext = oldPrev;

    // ✅ [이 블록을 여기! 무조건 여기!]
    const cur = shortsList[shortsIndex];
    if (cur && videoCur.src !== cur.video_url) {
      videoCur.src = cur.video_url;
      videoCur.load();
    }

    // 다음 영상 preload
    const upcoming = shortsList[shortsIndex + 1];
    if (upcoming) {
      videoNext.src = upcoming.video_url;
      videoNext.load();
    }

    

    resetPositions();

    try {
      videoCur.muted = false;
      await videoCur.play();
    } catch {}

    window.currentIssue = shortsList[shortsIndex];
    const shortsPro =
      document.getElementById("shortsPro") ||
      document.querySelector('.shorts-vote .pro');
    const shortsCon =
      document.getElementById("shortsCon") ||
      document.querySelector('.shorts-vote .con');

    // 🔥 Shorts vote UI reset (critical)
    if (shortsPro && shortsCon) {
      shortsPro.classList.remove("active-vote", "locked");
      shortsCon.classList.remove("active-vote", "locked");
    }

    // 🔥 Re-sync vote state from DB
    if (typeof window.GALLA_CHECK_VOTE === "function") {
      const voteResult = await window.GALLA_CHECK_VOTE(window.currentIssue.id);
      applyShortsVoteState(voteResult);
    }
  }, 350);
}

function slideDown() {
  videoPrev.style.transition =
  videoCur.style.transition =
  videoNext.style.transition = "transform 0.35s ease";

  videoPrev.style.transform = "translateY(0)";
  videoCur.style.transform  = "translateY(100%)";
  videoNext.style.transform = "translateY(200%)";

  setTimeout(async () => {
    const oldNext = videoNext;
    videoNext = videoCur;
    videoCur  = videoPrev;
    videoPrev = oldNext;

    // ✅ [이거 빠져 있어서 지금 터진 거다]
    const cur = shortsList[shortsIndex];
    if (cur && videoCur.src !== cur.video_url) {
      videoCur.src = cur.video_url;
      videoCur.load();
    }

    const upcoming = shortsList[shortsIndex - 1];
    if (upcoming) {
      videoPrev.src = upcoming.video_url;
      videoPrev.load();
    }

    resetPositions();

    try {
      videoCur.muted = false;
      await videoCur.play();
    } catch {}

    window.currentIssue = shortsList[shortsIndex];
    const shortsPro =
      document.getElementById("shortsPro") ||
      document.querySelector('.shorts-vote .pro');
    const shortsCon =
      document.getElementById("shortsCon") ||
      document.querySelector('.shorts-vote .con');

    // 🔥 Shorts vote UI reset (critical)
    if (shortsPro && shortsCon) {
      shortsPro.classList.remove("active-vote", "locked");
      shortsCon.classList.remove("active-vote", "locked");
    }

    // 🔥 Re-sync vote state from DB
    if (typeof window.GALLA_CHECK_VOTE === "function") {
      const voteResult = await window.GALLA_CHECK_VOTE(window.currentIssue.id);
      applyShortsVoteState(voteResult);
    }
  }, 350);
}
