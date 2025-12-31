// shorts.js — CLEAN & STABLE VERSION (ALL FEATURES PRESERVED)

/* =========================
   PAGE GUARD
========================= */
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
  const y =
    Math.abs(parseInt(document.body.style.top || "0", 10)) || __scrollY;
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  document.body.style.width = "";
  window.scrollTo(0, y);
}

/* =========================
   GLOBAL API (index → shorts)
========================= */
window.openShorts = function (list, startId) {
  if (!IS_SHORTS_PAGE) {
    const params = new URLSearchParams();
    if (startId != null) params.set("start", startId);
    sessionStorage.setItem("__SHORTS_LIST__", JSON.stringify(list || []));
    location.href = `/shorts.html?${params.toString()}`;
  }
};

window.closeShorts = window.closeShorts || function () {};

/* =========================
   EXIT EARLY IF NOT SHORTS
========================= */
if (!IS_SHORTS_PAGE) {
  console.info("[SHORTS] API only (non-shorts page)");
  return;
}

/* =========================
   STATE
========================= */
let overlay, backBtn;
let videoPrev, videoCur, videoNext;

let shortsList = [];
let shortsIndex = 0;

let locked = false;
let isClosing = false;

/* =========================
   HELPERS
========================= */
function lock(ms = 400) {
  locked = true;
  setTimeout(() => (locked = false), ms);
}

function ensureDOM() {
  overlay = document.getElementById("shortsOverlay");
  videoPrev = document.getElementById("videoPrev");
  videoCur = document.getElementById("shortsVideo");
  videoNext = document.getElementById("videoNext");
  backBtn = document.getElementById("shortsBack");

  if (!overlay || !videoPrev || !videoCur || !videoNext || !backBtn) {
    console.error("[SHORTS] DOM missing");
    return false;
  }

  overlay.style.touchAction = "none";
  videoCur.style.pointerEvents = "auto";
  return true;
}

/* =========================
   VOTE STATE
========================= */
function applyShortsVoteState(result) {
  if (result !== "pro" && result !== "con") return;

  const pro =
    document.getElementById("shortsPro") ||
    document.querySelector(".shorts-vote .pro");
  const con =
    document.getElementById("shortsCon") ||
    document.querySelector(".shorts-vote .con");

  if (!pro || !con) return;

  pro.classList.remove("active-vote", "locked");
  con.classList.remove("active-vote", "locked");

  if (result === "pro") {
    pro.classList.add("active-vote", "locked");
    con.classList.add("locked");
  } else {
    con.classList.add("active-vote", "locked");
    pro.classList.add("locked");
  }
}

/* =========================
   OPEN / CLOSE
========================= */
async function openShorts(list, startId) {
  if (!ensureDOM()) return;

  if (!overlay._bound) {
    bindEvents();
    overlay._bound = true;
  }

  shortsList = (list || []).filter(v => v && v.video_url);
  if (!shortsList.length) return;

  const idx = shortsList.findIndex(v => Number(v.id) === Number(startId));
  shortsIndex = idx >= 0 ? idx : 0;

  overlay.hidden = false;
  overlay.style.pointerEvents = "auto";
  isClosing = false;

  lockIOSScroll();
  document.body.style.overflow = "hidden";

  resetPositions();
  preload();

  const cur = shortsList[shortsIndex];
  videoCur.src = cur.video_url;
  videoCur.muted = true;
  videoCur.playsInline = true;
  videoCur.load();

  try {
    await videoCur.play();
    videoCur.muted = false;
  } catch {}

  window.currentIssue = cur;
}

function closeShorts() {
  if (isClosing) return;
  isClosing = true;

  [videoPrev, videoCur, videoNext].forEach(v => {
    if (!v) return;
    try {
      v.pause();
      v.removeAttribute("src");
      v.load();
    } catch {}
  });

  overlay.hidden = true;
  unlockIOSScroll();
  document.body.style.overflow = "";

  isClosing = false;
}

/* =========================
   VIDEO POSITIONING
========================= */
function resetPositions() {
  [videoPrev, videoCur, videoNext].forEach(v => {
    v.style.transition = "none";
  });

  videoPrev.style.transform = "translateY(-100%)";
  videoCur.style.transform = "translateY(0)";
  videoNext.style.transform = "translateY(100%)";
}

function preload() {
  const prev = shortsList[shortsIndex - 1];
  const next = shortsList[shortsIndex + 1];

  if (prev) {
    videoPrev.src = prev.video_url;
    videoPrev.load();
  }
  if (next) {
    videoNext.src = next.video_url;
    videoNext.load();
  }
}

/* =========================
   NAVIGATION
========================= */
function next() {
  if (locked || shortsIndex >= shortsList.length - 1) return;
  lock();
  shortsIndex++;
  slide(-1);
}

function prev() {
  if (locked || shortsIndex <= 0) return;
  lock();
  shortsIndex--;
  slide(1);
}

async function slide(dir) {
  [videoPrev, videoCur, videoNext].forEach(v => {
    v.style.transition = "transform .35s ease";
  });

  videoCur.style.transform = `translateY(${dir * -100}%)`;
  videoNext.style.transform = "translateY(0)";

  setTimeout(async () => {
    const tmp = videoPrev;
    videoPrev = videoCur;
    videoCur = videoNext;
    videoNext = tmp;

    const cur = shortsList[shortsIndex];
    videoCur.src = cur.video_url;
    videoCur.muted = true;
    videoCur.load();

    resetPositions();
    preload();

    try {
      await videoCur.play();
      videoCur.muted = false;
    } catch {}

    window.currentIssue = cur;
  }, 350);
}

/* =========================
   EVENTS
========================= */
function bindEvents() {
  let sx = 0, sy = 0, touching = false;

  overlay.addEventListener("touchstart", e => {
    touching = true;
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;

    if (videoCur.paused) {
      videoCur.muted = true;
      videoCur.play().catch(() => {});
    }
  }, { passive: false });

  overlay.addEventListener("touchend", e => {
    if (!touching) return;
    touching = false;

    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;

    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 80) {
      closeShorts();
    } else if (Math.abs(dy) > 80) {
      dy < 0 ? next() : prev();
    }
  }, { passive: false });

  overlay.addEventListener("wheel", e => {
    e.preventDefault();
    e.deltaY > 0 ? next() : prev();
  }, { passive: false });

  window.addEventListener("keydown", e => {
    if (overlay.hidden) return;
    if (e.key === "ArrowDown") next();
    if (e.key === "ArrowUp") prev();
    if (e.key === "Escape") closeShorts();
  });

  backBtn.onclick = closeShorts;

  window.addEventListener("popstate", () => {
    if (!overlay.hidden) closeShorts();
  });
}

/* =========================
   BOOTSTRAP
========================= */
(function bootstrap() {
  const params = new URLSearchParams(location.search);
  const start = params.get("start");

  let list = [];
  try {
    list = JSON.parse(sessionStorage.getItem("__SHORTS_LIST__") || "[]");
  } catch {}

  if (list.length) openShorts(list, start);
})();