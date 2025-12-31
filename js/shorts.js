// Helper to apply Shorts vote state to vote buttons
function applyShortsVoteState(result) {
  // session pending / unknown 상태에서는 UI를 건드리지 않는다
  if (result === "__SESSION_PENDING__") return;
  const shortsPro =
    document.getElementById("shortsPro") ||
    document.querySelector(".shorts-vote .pro");
  const shortsCon =
    document.getElementById("shortsCon") ||
    document.querySelector(".shorts-vote .con");
  if (!shortsPro || !shortsCon) return;

  // reset
  shortsPro.classList.remove("active-vote", "locked");
  shortsCon.classList.remove("active-vote", "locked");

  // IMPORTANT: result is a STRING: "pro" | "con" | null
  if (result === "pro") {
    shortsPro.classList.add("active-vote", "locked");
    shortsCon.classList.add("locked");
  } else if (result === "con") {
    shortsCon.classList.add("active-vote", "locked");
    shortsPro.classList.add("locked");
  }
}
// js/shorts.js — Instagram Reels-like (Snap 1-step)
// 🔧 wait until vote core & session are ready (shorts first-load fix)
async function waitForVoteReady(timeout = 3500) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (
      typeof window.GALLA_CHECK_VOTE === "function" &&
      window.supabaseClient
    ) {
      const { data } = await window.supabaseClient.auth.getSession();
      if (data?.session?.user) return true;
    }
    await new Promise(r => setTimeout(r, 80));
  }
  return false;
}
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
let touchStartX = 0;
let draggingX = false;
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

  // 🔥 history stack for returning to previous screen (not index)
  if (!overlay._historyPushed) {
    history.pushState({ shorts: true }, "");
    overlay._historyPushed = true;
  }

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
  }
  // 🔥 INITIAL VOTE SYNC (first shorts guaranteed)
  window.currentIssue = shortsList[shortsIndex];

  (async () => {
    const ready = await waitForVoteReady();
    if (!ready || !window.currentIssue) return;

    let result = "__SESSION_PENDING__";
    let retry = 0;

    while (retry < 20) {
      result = await window.GALLA_CHECK_VOTE(window.currentIssue.id);

      if (result === "pro" || result === "con") {
        applyShortsVoteState(result);
        return;
      }

      await new Promise(r => setTimeout(r, 150));
      retry++;
    }
  })();


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
    // 🔥 only reset UI on open if session is not ready
    if (!window.supabaseClient) {
      shortsPro.classList.remove("active-vote", "locked");
      shortsCon.classList.remove("active-vote", "locked");
    }

    overlay._voteBound = true;

    shortsPro.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (!window.currentIssue) return;
      if (shortsPro.classList.contains("locked")) return;
      if (typeof window.GALLA_VOTE !== "function") return;

      // 🔒 투표 중 UI만 잠금 (스크롤/영상은 유지)
      const stage = document.querySelector(".shorts-stage");
      if (stage) stage.style.pointerEvents = "none";

      try {
        await window.GALLA_VOTE(window.currentIssue.id, "pro");

        if (typeof window.GALLA_CHECK_VOTE === "function") {
          const result = await window.GALLA_CHECK_VOTE(window.currentIssue.id);
          applyShortsVoteState(result);
        }
      } finally {
        if (stage) stage.style.pointerEvents = "";
      }
    };

    shortsCon.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (!window.currentIssue) return;
      if (shortsCon.classList.contains("locked")) return;
      if (typeof window.GALLA_VOTE !== "function") return;

      // 🔒 투표 중 UI만 잠금 (스크롤/영상은 유지)
      const stage = document.querySelector(".shorts-stage");
      if (stage) stage.style.pointerEvents = "none";

      try {
        await window.GALLA_VOTE(window.currentIssue.id, "con");

        if (typeof window.GALLA_CHECK_VOTE === "function") {
          const result = await window.GALLA_CHECK_VOTE(window.currentIssue.id);
          applyShortsVoteState(result);
        }
      } finally {
        if (stage) stage.style.pointerEvents = "";
      }
    };
  }

  // Fallback sync at the end of openShorts
  setTimeout(async () => {
    if (!window.currentIssue) return;
    if (typeof window.GALLA_CHECK_VOTE !== "function") return;

    const result = await window.GALLA_CHECK_VOTE(window.currentIssue.id);
    if (result === "pro" || result === "con") {
      applyShortsVoteState(result);
    }
  }, 600);

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

  // 🔥 return to previous screen instead of forcing index
  if (history.state && history.state.shorts) {
    history.back();
  }

  overlay._historyPushed = false;
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

  // 🔥 system back button (browser / mobile) closes shorts
  window.addEventListener("popstate", () => {
    if (overlay && !overlay.hidden) {
      closeShorts();
    }
  });

overlay.addEventListener("click", (e) => {
  // 투표 버튼은 막지 않는다
  if (e.target.closest(".shorts-vote")) return;

  e.stopPropagation();
}, true);

/* =========================
   Mobile Touch Swipe (1 step)
========================= */
overlay.addEventListener("touchstart", (e) => {
  if (!e.touches || !e.touches[0]) return;
  touchStartY = e.touches[0].clientY;
  // drag-follow start
  videoCur.style.transition = "none";
  videoPrev.style.transition = "none";
  videoNext.style.transition = "none";
}, { passive: true });

// 좌/우 스와이프 준비
overlay.addEventListener("touchstart", (e) => {
  if (!e.touches || !e.touches[0]) return;
  touchStartX = e.touches[0].clientX;
  draggingX = true;
  videoCur.style.transition = "none";
}, { passive: true });

// 좌/우 스와이프 중 카드 이동
overlay.addEventListener("touchmove", (e) => {
  if (!draggingX || !e.touches || !e.touches[0]) return;

  const diffX = e.touches[0].clientX - touchStartX;

  // 좌우 스와이프 시 카드처럼 이동
  videoCur.style.transform = `translateX(${diffX}px)`;
  overlay.style.background = "rgba(0,0,0,0.85)";
}, { passive: true });

// 🔥 Vertical drag-follow (Reels-style)
overlay.addEventListener("touchmove", (e) => {
  if (!e.touches || !e.touches[0]) return;
  const currentY = e.touches[0].clientY;
  const diffY = currentY - touchStartY;

  // current follows finger
  videoCur.style.transform = `translateY(${diffY}px)`;

  // next & prev stick naturally
  if (diffY < 0) {
    videoNext.style.transform = `translateY(${window.innerHeight + diffY}px)`;
  } else {
    videoPrev.style.transform = `translateY(${-window.innerHeight + diffY}px)`;
  }
}, { passive: true });

overlay.addEventListener("touchend", (e) => {
  if (locked) return;
  const endY = e.changedTouches?.[0]?.clientY ?? touchStartY;
  const diff = touchStartY - endY;

  // snap threshold
  if (Math.abs(diff) > 90) {
    if (diff > 0) next();
    else prev();
  } else {
    // cancel → snap back
    videoCur.style.transition =
    videoPrev.style.transition =
    videoNext.style.transition = "transform 0.25s ease";

    resetPositions();
  }
}, { passive: true });

// 좌/우 스와이프 종료/복귀
overlay.addEventListener("touchend", (e) => {
  if (!draggingX || !e.changedTouches || !e.changedTouches[0]) return;

  draggingX = false;

  const diffX = e.changedTouches[0].clientX - touchStartX;

  // 임계값
  if (Math.abs(diffX) > 90) {
    // 카드가 밀리며 종료
    videoCur.style.transition = "transform 0.25s ease";
    videoCur.style.transform =
      diffX > 0 ? "translateX(120%)" : "translateX(-120%)";

    setTimeout(() => {
      videoCur.style.transform = "";
      videoCur.style.transition = "";
      overlay.style.background = "";
      closeShorts();
    }, 220);

  } else {
    // 취소 → 원위치
    videoCur.style.transition = "transform 0.25s ease";
    videoCur.style.transform = "translateX(0)";
    overlay.style.background = "";

    setTimeout(() => {
      videoCur.style.transition = "";
    }, 250);
  }
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

  // 🔥 [릴스 핵심] 다음 영상 미리 재생 (애니메이션 시작 전)
if (videoNext && videoNext.src) {
  try {
    videoNext.muted = true;
    videoNext.play().catch(() => {});
  } catch {}
}

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

    // 🔒 현재 영상 src 보장 (릴스 필수)
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

    videoNext.muted = true;
    videoNext.play().catch(() => {});

     requestAnimationFrame(() => {
     resetPositions();
     });

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
      if (voteResult !== "__SESSION_PENDING__") {
        applyShortsVoteState(voteResult);
      }
    }
  }, 350);
}

function slideDown() {

    // 🔥 이전 영상 미리 재생 (애니메이션 전에)
  if (videoPrev && videoPrev.src) {
    try {
      videoPrev.muted = true;
      videoPrev.play().catch(() => {});
    } catch {}
  }

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

    const upcoming = shortsList[shortsIndex - 1];
    if (upcoming) {
      videoPrev.src = upcoming.video_url;
      videoPrev.load();
    }

    videoPrev.muted = true;
    videoPrev.play().catch(() => {});

    requestAnimationFrame(() => {
      resetPositions();
    });

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
      if (voteResult !== "__SESSION_PENDING__") {
        applyShortsVoteState(voteResult);
      }
    }
  }, 350);
}


// 모바일에서 백그라운드 복귀 시 투표 상태 재동기화
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible") return;
  if (!window.currentIssue) return;
  if (typeof window.GALLA_CHECK_VOTE !== "function") return;

  const result = await window.GALLA_CHECK_VOTE(window.currentIssue.id);
  if (result !== "__SESSION_PENDING__") {
    applyShortsVoteState(result);
  }
});