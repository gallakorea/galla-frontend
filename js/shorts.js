// js/shorts.js — Instagram Reels-like (Snap 1-step)
// 요구사항: 모바일 스와이프 1칸, PC 휠 1칸, 키보드 ↑↓ 1칸, 480px 고정

const overlay = document.getElementById("shortsOverlay");
const videoEl = document.getElementById("shortsVideo");
const backBtn = document.getElementById("shortsBack");

let shortsList = [];
let shortsIndex = 0;

let touchStartY = 0;
let locked = false;
let wheelLocked = false;

function lock(ms = 450) {
  locked = true;
  setTimeout(() => (locked = false), ms);
}

function wheelLock(ms = 450) {
  wheelLocked = true;
  setTimeout(() => (wheelLocked = false), ms);
}

function openShorts(list, startId) {
  // list: cards 배열, startId: issue id
  if (!Array.isArray(list)) {
    console.error("[shorts] list must be array");
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
  videoEl.playsInline = true;
  videoEl.muted = false;

  playCurrent();
}

function closeShorts() {
  try {
    videoEl.pause();
  } catch (e) {}
  videoEl.removeAttribute("src");
  videoEl.load();

  overlay.hidden = true;
  document.body.classList.remove("shorts-open");
  document.documentElement.classList.remove("shorts-open");
  document.body.style.overflow = "";
}

function playCurrent() {
  const item = shortsList[shortsIndex];
  if (!item) return;

  // 재생 안정화: src 교체 → load → play
  videoEl.src = item.video_url;
  videoEl.load();

  const p = videoEl.play();
  if (p && typeof p.catch === "function") {
    p.catch(() => {
      // 자동재생 정책 등으로 실패 시 대비
      // 필요하면 muted=true로 fallback 가능
    });
  }

  // UI(시간/좋아요 등) 나중에 실제 데이터 바인딩 가능
  // document.querySelector(".shorts-time").textContent = "5:05";
}

function next() {
  if (locked) return;
  if (shortsIndex >= shortsList.length - 1) return;
  lock();
  shortsIndex += 1;
  playCurrent();
}

function prev() {
  if (locked) return;
  if (shortsIndex <= 0) return;
  lock();
  shortsIndex -= 1;
  playCurrent();
}

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
overlay.addEventListener("wheel", (e) => {
  // 오버레이에서만 스크롤을 막고 1칸씩 넘김
  e.preventDefault();
  if (wheelLocked || locked) return;

  wheelLock();
  if (e.deltaY > 0) next();
  else prev();
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