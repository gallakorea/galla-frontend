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
  document.body.classList.add("shorts-open");
  document.documentElement.classList.add("shorts-open");
  document.body.style.overflow = "hidden";

  // iOS/모바일 안전
  videoCur.playsInline = true;
  videoCur.muted = true;   // 자동재생 안정화

  videoPrev.preload = "auto";
  videoCur.preload  = "auto";
  videoNext.preload = "auto";
  loadVideos();
  resetPositions();

}

function closeShorts() {
  try {
  videoCur.pause();
  } catch (e) {}

  videoCur.pause();
  videoPrev.pause();
  videoNext.pause();

 
  videoCur.removeAttribute("src");
  videoPrev.removeAttribute("src");
  videoNext.removeAttribute("src");

  videoCur.load();
  videoPrev.load();
  videoNext.load();

  overlay.hidden = true;
  document.body.classList.remove("shorts-open");
  document.documentElement.classList.remove("shorts-open");
  document.body.style.overflow = "";
}

function loadVideos() {
  const cur = shortsList[shortsIndex];
  const prev = shortsList[shortsIndex - 1];
  const next = shortsList[shortsIndex + 1];

  if (prev) videoPrev.src = prev.video_url;
  if (cur)  videoCur.src  = cur.video_url;
  if (next) videoNext.src = next.video_url;

  videoCur.load();
  const p = videoCur.play();
  if (p && typeof p.catch === "function") p.catch(() => {});
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

}

function slideUp() {
  videoPrev.style.transition =
  videoCur.style.transition =
  videoNext.style.transition = "transform 0.35s ease";

  videoPrev.style.transform = "translateY(-200%)";
  videoCur.style.transform  = "translateY(-100%)";
  videoNext.style.transform = "translateY(0)";

  setTimeout(() => {
    shortsIndex = Math.min(shortsIndex, shortsList.length - 1);
    loadVideos();
    resetPositions();
  }, 350);
}

function slideDown() {
  videoPrev.style.transition =
  videoCur.style.transition =
  videoNext.style.transition = "transform 0.35s ease";

  videoPrev.style.transform = "translateY(0)";
  videoCur.style.transform  = "translateY(100%)";
  videoNext.style.transform = "translateY(200%)";

  setTimeout(() => {
    shortsIndex = Math.max(shortsIndex, 0);
    loadVideos();
    resetPositions();
  }, 350);
}