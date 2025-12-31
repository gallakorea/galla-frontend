/* ===================================================
   GALLA SHORTS — MINIMAL CORE
   ONLY: UP / DOWN (touch + wheel)
   NO TAP / NO VOTE / NO SIDE / NO LEGACY
=================================================== */

const IS_SHORTS_PAGE = document.body.dataset.page === "shorts";
if (!IS_SHORTS_PAGE) {
  console.log("[SHORTS] not shorts page — exit");
  return;
}

/* =========================
   DOM
========================= */
const overlay = document.getElementById("shortsOverlay");
const stage = document.querySelector(".shorts-stage");
const gestureLayer = document.querySelector(".shorts-gesture-layer");

const videoPrev = document.getElementById("videoPrev");
const videoCur  = document.getElementById("shortsVideo");
const videoNext = document.getElementById("videoNext");

if (!overlay || !stage || !gestureLayer || !videoCur) {
  console.error("[SHORTS] DOM missing");
  throw new Error("Shorts DOM missing");
}

console.log("[SHORTS] minimal shorts.js loaded");

/* =========================
   STATE
========================= */
let list = [];
let index = 0;
let locked = false;

/* =========================
   LOCK
========================= */
function lock(ms = 400) {
  locked = true;
  setTimeout(() => locked = false, ms);
}

/* =========================
   VIDEO LOAD
========================= */
function loadVideos() {
  const cur  = list[index];
  const prev = list[index - 1];
  const next = list[index + 1];

  if (cur) {
    videoCur.src = cur.video_url;
    videoCur.load();
    videoCur.play().catch(() => {});
  }

  if (prev) {
    videoPrev.src = prev.video_url;
    videoPrev.load();
  } else {
    videoPrev.removeAttribute("src");
  }

  if (next) {
    videoNext.src = next.video_url;
    videoNext.load();
  } else {
    videoNext.removeAttribute("src");
  }

  resetPos();
}

/* =========================
   POSITION RESET
========================= */
function resetPos() {
  videoPrev.style.transition =
  videoCur.style.transition =
  videoNext.style.transition = "none";

  videoPrev.style.transform = "translateY(-100%)";
  videoCur.style.transform  = "translateY(0)";
  videoNext.style.transform = "translateY(100%)";
}

/* =========================
   MOVE
========================= */
function next() {
  if (locked) return;
  if (index >= list.length - 1) return;
  lock();

  index++;
  slideUp();
}

function prev() {
  if (locked) return;
  if (index <= 0) return;
  lock();

  index--;
  slideDown();
}

/* =========================
   SLIDE
========================= */
function slideUp() {
  videoPrev.style.transition =
  videoCur.style.transition =
  videoNext.style.transition = "transform .3s ease";

  videoPrev.style.transform = "translateY(-200%)";
  videoCur.style.transform  = "translateY(-100%)";
  videoNext.style.transform = "translateY(0)";

  setTimeout(() => {
    const tmp = videoPrev;
    videoPrev = videoCur;
    videoCur  = videoNext;
    videoNext = tmp;

    loadVideos();
  }, 300);
}

function slideDown() {
  videoPrev.style.transition =
  videoCur.style.transition =
  videoNext.style.transition = "transform .3s ease";

  videoPrev.style.transform = "translateY(0)";
  videoCur.style.transform  = "translateY(100%)";
  videoNext.style.transform = "translateY(200%)";

  setTimeout(() => {
    const tmp = videoNext;
    videoNext = videoCur;
    videoCur  = videoPrev;
    videoPrev = tmp;

    loadVideos();
  }, 300);
}

/* =========================
   EVENTS
========================= */
function bindEvents() {
  console.log("[SHORTS] bindEvents");

  gestureLayer.style.pointerEvents = "auto";
  gestureLayer.style.touchAction = "none";

  /* ----- TOUCH ----- */
  let startY = 0;
  let deltaY = 0;
  let active = false;

  gestureLayer.addEventListener("touchstart", (e) => {
    if (!e.touches[0]) return;
    active = true;
    startY = e.touches[0].clientY;
    deltaY = 0;
  }, { passive: false });

  gestureLayer.addEventListener("touchmove", (e) => {
    if (!active || !e.touches[0]) return;
    deltaY = e.touches[0].clientY - startY;
  }, { passive: false });

  gestureLayer.addEventListener("touchend", () => {
    if (!active) return;
    active = false;

    if (Math.abs(deltaY) < 60) return;

    if (deltaY < 0) {
      console.log("[SHORTS] swipe UP");
      next();
    } else {
      console.log("[SHORTS] swipe DOWN");
      prev();
    }
  });

  /* ----- WHEEL ----- */
  let wheelAcc = 0;

  gestureLayer.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (locked) return;

    wheelAcc += e.deltaY;
    if (Math.abs(wheelAcc) < 80) return;

    if (wheelAcc > 0) {
      console.log("[SHORTS] wheel DOWN");
      next();
    } else {
      console.log("[SHORTS] wheel UP");
      prev();
    }

    wheelAcc = 0;
  }, { passive: false });
}

/* =========================
   BOOTSTRAP
========================= */
(function boot() {
  try {
    list = JSON.parse(sessionStorage.getItem("__SHORTS_LIST__") || "[]")
      .filter(v => v && v.video_url);
  } catch {
    list = [];
  }

  if (!list.length) {
    console.warn("[SHORTS] empty list");
    return;
  }

  overlay.hidden = false;
  bindEvents();
  loadVideos();
})();