// shorts.js — SAFE PAGE GUARD
const IS_SHORTS_PAGE = document.body.dataset.page === "shorts";

/* =========================
   iOS SCROLL HARD LOCK
========================= */
let __scrollY = 0;

function lockIOSScroll() {
  __scrollY = window.scrollY || 0;
  document.body.style.position = "fixed";
  document.body.style.top = `-${__scrollY}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.width = "100%";
}

function unlockIOSScroll() {
  const y = Math.abs(parseInt(document.body.style.top || "0", 10)) || __scrollY;
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  document.body.style.width = "";
  window.scrollTo(0, y);
}

/**
 * Global API
 * - shorts 페이지가 아니면 shorts.html로 이동
 * - shorts 페이지에서는 실제 openShorts 구현이 아래에서 덮어씀
 */
window.openShorts = function (list, startId) {
  if (!IS_SHORTS_PAGE) {
    const params = new URLSearchParams();
    if (startId != null) params.set("start", startId);
    sessionStorage.setItem("__SHORTS_LIST__", JSON.stringify(list || []));
    location.href = `/shorts.html?${params.toString()}`;
    return;
  }
};

window.closeShorts = window.closeShorts || function () {};

// shorts 페이지가 아니면 나머지 로직은 실행하지 않는다
if (!IS_SHORTS_PAGE) {
  console.info("[SHORTS] loaded on non-shorts page (API only)");
  // API만 노출하고 나머지 로직 실행하지 않음
  // 바로 리턴하여 아래 코드 실행 방지
} else {


// Helper to apply Shorts vote state to vote buttons
function applyShortsVoteState(result) {
  // ❗ 확정된 값이 아니면 UI를 절대 건드리지 않는다
  if (result !== "pro" && result !== "con") return;

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

  if (result === "pro") {
    shortsPro.classList.add("active-vote", "locked");
    shortsCon.classList.add("locked");
  } else {
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

let overlay, backBtn, gestureLayer;

let isClosing = false;          // 중복 close 방지
let isFromPopstate = false;    // popstate로 닫히는지 여부

let videoPrev, videoCur, videoNext;

function ensureShortsDOM() {
  overlay   = document.getElementById("shortsOverlay");
  videoPrev = document.getElementById("videoPrev");
  videoCur  = document.getElementById("shortsVideo");
  videoNext = document.getElementById("videoNext");
  backBtn   = document.getElementById("shortsBack");

  gestureLayer = document.querySelector(".shorts-gesture-layer");

  if (videoCur) videoCur.style.pointerEvents = "none";
  if (videoPrev) videoPrev.style.pointerEvents = "none";
  if (videoNext) videoNext.style.pointerEvents = "none";

  return !!(overlay && videoPrev && videoCur && videoNext && backBtn && gestureLayer);
}

let shortsList = [];
let shortsIndex = 0;

let touchStartY = 0;
let touchStartX = 0;
let draggingX = false;
let locked = false;



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

  // 🔥 정확한 영상 매칭 보장
  if (shortsList.length === 1) {
    shortsIndex = 0;
  } else {
    const idx = shortsList.findIndex(v => Number(v.id) === Number(startId));
    shortsIndex = idx >= 0 ? idx : 0;
  }

  overlay.hidden = false;
  overlay.style.pointerEvents = "auto";
  isClosing = false;

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
  if (cur) {
    try {
      videoCur.pause();
      videoCur.removeAttribute("src");
      videoCur.load();

      videoCur.setAttribute("playsinline", "");
      videoCur.setAttribute("webkit-playsinline", "");
      videoCur.muted = true;
      videoCur.src = cur.video_url;
      videoCur.load();

      videoCur.play().catch(() => {});
    } catch (e) {
      console.warn("[SHORTS] autoplay retry", e);
    }
  }
  console.info("[SHORTS] opened", videoCur.src);

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


}

function closeShorts(shouldGoBack = true) {
  if (isClosing) return;
  isClosing = true;
  overlay.style.pointerEvents = "none";
  try { videoCur.pause(); } catch {}

  if (videoCur) videoCur.pause();
  if (videoPrev) videoPrev.pause();
  if (videoNext) videoNext.pause();

  // 🔥 [필수] src 완전 정리
  if (videoCur) {
    videoCur.removeAttribute("src");
    videoCur.load();
  }
  if (videoPrev) {
    videoPrev.removeAttribute("src");
    videoPrev.load();
  }
  if (videoNext) {
    videoNext.removeAttribute("src");
    videoNext.load();
  }

  if (overlay) overlay.hidden = true;

  unlockIOSScroll();

  document.body.classList.remove("shorts-open");
  document.documentElement.classList.remove("shorts-open");
  document.body.style.overflow = "";

  isFromPopstate = false;
  isClosing = false;
  overlay.style.pointerEvents = "auto";
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

  gestureLayer.style.pointerEvents = "auto";
  gestureLayer.classList.add("passive");
  gestureLayer.style.touchAction = "none";

  // 🔥 [CRITICAL FIX]
  // 최초 사용자 인터랙션 시 포커스 강제 획득
  const forceFocus = () => {
    const stage = document.querySelector(".shorts-stage");
    if (stage && stage.tabIndex >= 0) {
      stage.focus({ preventScroll: true });
    }
  };

  window.addEventListener("pointerdown", forceFocus, { once: true });
  window.addEventListener("touchstart", forceFocus, { once: true });
  window.addEventListener("mousedown", forceFocus, { once: true });

// =========================
// KEYBOARD (GLOBAL, RELIABLE)
// =========================
if (!window._shortsKeyBound) {
  window._shortsKeyBound = true;

  window.addEventListener("keydown", (e) => {
    if (!overlay || overlay.hidden) return;

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
      closeShorts(true);
    }
  });
}

  /* =========================
     Unified Touch Swipe Handler
  ========================= */
  let startX = 0, startY = 0, touching = false;

  gestureLayer.addEventListener("touchstart", (e) => {
    if (!e.touches || !e.touches[0]) return;

    gestureLayer.classList.remove("passive"); // ← ★ 반드시 여기

    touching = true;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    videoCur.style.transition = "none";

    if (videoCur && videoCur.paused) {
      videoCur.muted = true;
      videoCur.play().catch(() => {});
    }
  }, { passive: false });

  gestureLayer.addEventListener("touchmove", (e) => {
    if (!touching || !e.touches[0]) return;

    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;

    if (Math.abs(dx) > Math.abs(dy)) {
      videoCur.style.transform = `translateX(${dx}px)`;
    }
  }, { passive: false });



let lastTap = 0;

gestureLayer.addEventListener("touchend", (e) => {
  if (!touching) return;
  touching = false;

  const dx = e.changedTouches[0].clientX - startX;
  const dy = e.changedTouches[0].clientY - startY;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const now = Date.now();

  // TAP / DOUBLE TAP
  if (ax < 10 && ay < 10) {
    if (now - lastTap < 300) {
      videoCur.playbackRate = videoCur.playbackRate === 1 ? 2 : 1;
      lastTap = 0;
      return;
    }

    lastTap = now;
    setTimeout(() => {
      if (lastTap && Date.now() - lastTap >= 300) {
        videoCur.paused ? videoCur.play() : videoCur.pause();
        lastTap = 0;
      }
    }, 300);
    return;
  }

  gestureLayer.classList.add("passive");

  // HORIZONTAL → CLOSE
  if (ax > ay && ax > 80) {
    videoCur.style.transition = "transform .25s ease";
    videoCur.style.transform =
      dx > 0 ? "translateX(120%)" : "translateX(-120%)";
    setTimeout(() => closeShorts(true), 220);
    return;
  }

  // VERTICAL → NEXT / PREV
  if (ay > ax && ay > 80) {
    videoCur.style.transition = "none";
    videoCur.style.transform = "translate(0, 0)";
    dy < 0 ? next() : prev();
    return;
  }

  // RESET
  videoCur.style.transition = "none";
  videoCur.style.transform = "translate(0, 0)";
}, { passive: false });


// =========================
// PC / Trackpad Wheel (GLOBAL)
// =========================
if (!window._shortsWheelBound) {
  window._shortsWheelBound = true;

  window.addEventListener("wheel", (e) => {
    if (!overlay || overlay.hidden) return;
    if (locked) return;

    if (Math.abs(e.deltaY) < 80) return;

    e.preventDefault();
    e.deltaY > 0 ? next() : prev();
  }, { passive: false });
}
/* =========================
   UI Buttons
========================= */
  if (backBtn) {
    backBtn.onclick = () => {
      closeShorts(true);
    };
  }

}

function slideUp() {
  videoCur.style.transition = "none";
  videoCur.style.transform = "translate(0, 0)";

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
      videoCur.muted = true;
      await videoCur.play().catch(() => {});
      videoCur.muted = false;
    } catch {}

    window.currentIssue = shortsList[shortsIndex];
    const shortsPro =
      document.getElementById("shortsPro") ||
      document.querySelector('.shorts-vote .pro');
    const shortsCon =
      document.getElementById("shortsCon") ||
      document.querySelector('.shorts-vote .con');

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
  videoCur.style.transition = "none";
  videoCur.style.transform = "translate(0, 0)";

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
      videoCur.muted = true;
      await videoCur.play().catch(() => {});
      videoCur.muted = false;
    } catch {}

    window.currentIssue = shortsList[shortsIndex];
    const shortsPro =
      document.getElementById("shortsPro") ||
      document.querySelector('.shorts-vote .pro');
    const shortsCon =
      document.getElementById("shortsCon") ||
      document.querySelector('.shorts-vote .con');

    // 🔥 Re-sync vote state from DB
    if (typeof window.GALLA_CHECK_VOTE === "function") {
      const voteResult = await window.GALLA_CHECK_VOTE(window.currentIssue.id);
      if (voteResult !== "__SESSION_PENDING__") {
        applyShortsVoteState(voteResult);
      }
    }
  }, 350);
}



// 🔥 expose shorts controls globally (index + shorts)
window.openShorts = openShorts;
window.closeShorts = closeShorts;
// =========================
// DIRECT SHORTS PAGE BOOTSTRAP
// =========================
(function bootstrapShortsPage() {
  const params = new URLSearchParams(location.search);
  const startId = params.get("start");

  let list = [];
  try {
    list = JSON.parse(sessionStorage.getItem("__SHORTS_LIST__") || "[]");
  } catch (e) {
    console.error("[SHORTS] session list parse error", e);
    return;
  }

  if (!list.length) {
    console.warn("[SHORTS] no shorts list in sessionStorage");
    return;
  }

  const tryBoot = () => {
    if (typeof window.openShorts === "function" && document.getElementById("shortsOverlay")) {
      window.openShorts(list, startId);
    } else {
      requestAnimationFrame(tryBoot);
    }
  };

  tryBoot();
})();
  // Add popstate handler to close shorts overlay if open
  window.addEventListener("popstate", () => {
    const overlay = document.getElementById("shortsOverlay");
    if (overlay && !overlay.hidden) {
      closeShorts(false);
    }
  });
}