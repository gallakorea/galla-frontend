// shorts.js — FORCE GLOBAL MODE
(function () {

/* =========================================================
   GALLA Shorts — TRUE Reels/Shorts Scroll Physics Version
   - Native scroll (finger-follow)
   - scroll-snap
   - iOS physics
   - one video plays at a time
========================================================= */

/* =========================
   DOM
========================= */
let overlay;
let shortsList = [];
let currentIndex = -1;
let observer;

/* =========================
   Helpers
========================= */
function qs(id) {
  return document.getElementById(id);
}

function pauseAll() {
  document.querySelectorAll(".short video").forEach(v => {
    try { v.pause(); } catch {}
  });
}

function playVideoAt(index) {
  const item = document.querySelector(`.short[data-index="${index}"] video`);
  if (!item) return;

  pauseAll();

  // iOS/Safari 안정화: 먼저 muted 상태로 재생
  item.muted = true;
  const p = item.play();
  if (p && typeof p.then === "function") {
    p.then(() => {
      // 재생 시작 후 unmute
      item.muted = false;
    }).catch(() => {});
  }
}

/* =========================
   Scroll Observer (CORE)
========================= */
function setupObserver() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const index = Number(entry.target.dataset.index);
          if (index !== currentIndex) {
            currentIndex = index;
            playVideoAt(index);
          }
        }
      });
    },
    {
      root: overlay,
      threshold: 0.6
    }
  );

  document.querySelectorAll(".short").forEach(el => observer.observe(el));
}

/* =========================
   Open Shorts (ENTRY)
========================= */
function openShorts(list, startId) {
  overlay = qs("shortsOverlay");
  // 기존 observer 중복 방지
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (!overlay) {
    console.error("[SHORTS] overlay missing");
    return;
  }

  overlay.innerHTML = "";
  shortsList = list.filter(v => v && v.video_url);

  if (!shortsList.length) return;

  document.body.classList.add("shorts-open");
  document.documentElement.classList.add("shorts-open");
  document.body.style.overflow = "hidden";

  shortsList.forEach((item, i) => {
    const wrap = document.createElement("div");
    wrap.className = "short";
    wrap.dataset.index = i;

    const video = document.createElement("video");
    video.src = item.video_url;
    video.playsInline = true;
    video.preload = "auto";
    video.muted = true;
    video.loop = true;

    wrap.appendChild(video);
    overlay.appendChild(wrap);
  });

  const startIndex =
    shortsList.findIndex(v => Number(v.id) === Number(startId)) >= 0
      ? shortsList.findIndex(v => Number(v.id) === Number(startId))
      : 0;

  requestAnimationFrame(() => {
    const target = overlay.querySelector(
      `.short[data-index="${startIndex}"]`
    );
    if (target) {
      target.scrollIntoView({ behavior: "auto" });
    }
  });

  setupObserver();
}

/* =========================
   Close Shorts
========================= */
function closeShorts() {
  pauseAll();

  document.body.classList.remove("shorts-open");
  document.documentElement.classList.remove("shorts-open");
  document.body.style.overflow = "";

  if (observer) observer.disconnect();
}

/* =========================
   Keyboard Support
========================= */
window.addEventListener("keydown", e => {
  if (!overlay) return;

  if (e.key === "ArrowDown") {
    overlay.scrollBy({ top: window.innerHeight, behavior: "smooth" });
  }
  if (e.key === "ArrowUp") {
    overlay.scrollBy({ top: -window.innerHeight, behavior: "smooth" });
  }
  if (e.key === "Escape") {
    closeShorts();
  }
});

/* =========================
   Expose
========================= */
window.openShorts = openShorts;
window.closeShorts = closeShorts;

window.openShorts = openShorts;
window.closeShorts = closeShorts;
})();