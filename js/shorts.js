// shorts.js — SCROLL ONLY (index + shorts 공용)
// ❌ UI / 투표 / 네비 절대 터치 안 함

console.log("[SHORTS] boot");

const overlay = document.getElementById("shortsOverlay");
const stage = document.querySelector(".shorts-stage");
const gestureLayer = document.querySelector(".shorts-gesture-layer");

const videoPrev = document.getElementById("videoPrev");
const videoCur  = document.getElementById("shortsVideo");
const videoNext = document.getElementById("videoNext");

if (!overlay || !gestureLayer || !videoCur) {
  console.warn("[SHORTS] DOM missing");
  return;
}

let shortsList = [];
let index = 0;
let locked = false;
let wheelAcc = 0;

/* =========================
   BASIC HELPERS
========================= */
function lock(ms = 500) {
  locked = true;
  setTimeout(() => locked = false, ms);
}

function resetPos() {
  videoPrev.style.transition = "none";
  videoCur.style.transition  = "none";
  videoNext.style.transition = "none";

  videoPrev.style.transform = "translateY(-100%)";
  videoCur.style.transform  = "translateY(0)";
  videoNext.style.transform = "translateY(100%)";
}

function applySrc() {
  const cur  = shortsList[index];
  const prev = shortsList[index - 1];
  const next = shortsList[index + 1];

  if (prev) videoPrev.src = prev.video_url;
  if (cur)  videoCur.src  = cur.video_url;
  if (next) videoNext.src = next.video_url;

  videoCur.play().catch(()=>{});
}

/* =========================
   SLIDE
========================= */
function slideUp() {
  if (locked || index >= shortsList.length - 1) return;
  lock();
  index++;

  videoPrev.style.transition =
  videoCur.style.transition =
  videoNext.style.transition = "transform .35s ease";

  videoPrev.style.transform = "translateY(-200%)";
  videoCur.style.transform  = "translateY(-100%)";
  videoNext.style.transform = "translateY(0)";

  setTimeout(() => {
    const tmp = videoPrev;
    videoPrev = videoCur;
    videoCur  = videoNext;
    videoNext = tmp;

    applySrc();
    resetPos();
  }, 350);
}

function slideDown() {
  if (locked || index <= 0) return;
  lock();
  index--;

  videoPrev.style.transition =
  videoCur.style.transition =
  videoNext.style.transition = "transform .35s ease";

  videoPrev.style.transform = "translateY(0)";
  videoCur.style.transform  = "translateY(100%)";
  videoNext.style.transform = "translateY(200%)";

  setTimeout(() => {
    const tmp = videoNext;
    videoNext = videoCur;
    videoCur  = videoPrev;
    videoPrev = tmp;

    applySrc();
    resetPos();
  }, 350);
}

/* =========================
   INPUTS
========================= */

// PC / 트랙패드
gestureLayer.addEventListener("wheel", e => {
  e.preventDefault();
  if (locked) return;

  wheelAcc += e.deltaY;
  if (Math.abs(wheelAcc) < 60) return;

  wheelAcc > 0 ? slideUp() : slideDown();
  wheelAcc = 0;
}, { passive:false });

// 모바일
let startY = 0;

gestureLayer.addEventListener("touchstart", e => {
  startY = e.touches[0].clientY;
}, { passive:true });

gestureLayer.addEventListener("touchend", e => {
  const dy = e.changedTouches[0].clientY - startY;
  if (Math.abs(dy) < 60) return;

  dy < 0 ? slideUp() : slideDown();
}, { passive:true });

/* =========================
   OPEN SHORTS (index용)
========================= */
window.openShorts = function(list, start = 0) {
  shortsList = list || [];
  index = Math.max(0, shortsList.findIndex(v => v.id == start));
  if (index < 0) index = 0;

  overlay.hidden = false;
  applySrc();
  resetPos();
};

console.log("[SHORTS] ready");