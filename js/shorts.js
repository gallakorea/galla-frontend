/* shorts.js — STABLE GLOBAL REELS ENGINE */
(function () {

/* =========================================================
   STATE
========================================================= */
let overlay = null;
let observer = null;
let shortsList = [];
let currentIndex = -1;
let currentVideo = null;

/* =========================================================
   UTILS
========================================================= */
function qs(id) {
  return document.getElementById(id);
}

function stopCurrentVideo() {
  if (!currentVideo) return;
  try {
    currentVideo.pause();
    currentVideo.muted = true;
    currentVideo.currentTime = currentVideo.currentTime; // iOS audio kill
  } catch {}
  currentVideo = null;
}

function playVideoAt(index) {
  const wrap = document.querySelector(`.short[data-index="${index}"]`);
  if (!wrap) return;

  const video = wrap.querySelector("video");
  if (!video) return;

  if (currentVideo === video) return;

  stopCurrentVideo();

  currentIndex = index;
  currentVideo = video;

  video.muted = true;
  video.currentTime = 0;

  const p = video.play();
  if (p && typeof p.then === "function") {
    p.then(() => {
      video.muted = false;
    }).catch(() => {});
  }
}

/* =========================================================
   INTERSECTION OBSERVER
========================================================= */
function setupObserver() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }

  observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const idx = Number(entry.target.dataset.index);
          playVideoAt(idx);
        }
      });
    },
    {
      root: overlay,
      threshold: 0.75
    }
  );

  document.querySelectorAll(".short").forEach(el => observer.observe(el));
}

/* =========================================================
   OPEN SHORTS
========================================================= */
function openShorts(list, startId) {
  overlay = qs("shortsOverlay");
  if (!overlay) {
    console.error("[SHORTS] overlay not found");
    return;
  }

  overlay.innerHTML = "";
  overlay.hidden = false;
  overlay.style.display = "block";
  overlay.scrollTop = 0;

  document.body.style.overflow = "hidden";

  shortsList = list.filter(v => v && v.video_url);
  if (!shortsList.length) return;

  shortsList.forEach((item, i) => {
    const wrap = document.createElement("div");
    wrap.className = "short";
    wrap.dataset.index = i;

    const video = document.createElement("video");
    video.src = item.video_url;
    video.playsInline = true;
    video.preload = "auto";
    video.loop = true;
    video.muted = true;

    wrap.appendChild(video);
    overlay.appendChild(wrap);
  });

  const startIndex =
    shortsList.findIndex(v => Number(v.id) === Number(startId)) >= 0
      ? shortsList.findIndex(v => Number(v.id) === Number(startId))
      : 0;

  requestAnimationFrame(() => {
    const target = overlay.querySelector(`.short[data-index="${startIndex}"]`);
    if (target) target.scrollIntoView({ behavior: "auto" });
    setupObserver();
    playVideoAt(startIndex);
  });
}

/* =========================================================
   CLOSE SHORTS
========================================================= */
function closeShorts() {
  stopCurrentVideo();

  if (observer) {
    observer.disconnect();
    observer = null;
  }

  if (overlay) {
    overlay.hidden = true;
    overlay.style.display = "none";
    overlay.innerHTML = "";
  }

  document.body.style.overflow = "";
  currentIndex = -1;
}

/* =========================================================
   KEYBOARD SUPPORT (DESKTOP)
========================================================= */
window.addEventListener("keydown", e => {
  if (!overlay || overlay.hidden) return;

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

/* =========================================================
   EXPORT
========================================================= */
window.openShorts = openShorts;
window.closeShorts = closeShorts;

})();