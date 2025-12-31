/* shorts.js — TRUE REELS / SHORTS ENGINE (STABLE) */
(function () {

let overlay = null;
let observer = null;
let currentIndex = -1;

/* =========================
   HELPERS
========================= */
function qs(id) {
  return document.getElementById(id);
}

function stopAll(except = null) {
  document.querySelectorAll(".short video").forEach(v => {
    if (v === except) return;
    try {
      v.pause();
      v.currentTime = 0;
      v.muted = true;
    } catch {}
  });
}

function activateVideo(index) {
  const wrap = overlay.querySelector(`.short[data-index="${index}"]`);
  if (!wrap) return;

  const video = wrap.querySelector("video");
  if (!video) return;

  if (currentIndex === index && !video.paused) return;

  currentIndex = index;

  stopAll(video);

  video.muted = true;
  video.currentTime = 0;

  const p = video.play();
  if (p && typeof p.then === "function") {
    p.then(() => {
      video.muted = false;
    }).catch(() => {});
  }
}

/* =========================
   OBSERVER
========================= */
function setupObserver() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }

  stopAll();

  observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        const video = entry.target.querySelector("video");
        if (!video) return;

        if (entry.isIntersecting) {
          const idx = Number(entry.target.dataset.index);
          activateVideo(idx);
        } else {
          try {
            video.pause();
            video.muted = true;
          } catch {}
        }
      });
    },
    {
      root: overlay,
      threshold: 0.8
    }
  );

  overlay.querySelectorAll(".short").forEach(el => observer.observe(el));
}

/* =========================
   OPEN
========================= */
function openShorts(list, startId) {
  overlay = qs("shortsOverlay");
  if (!overlay) {
    console.error("[SHORTS] overlay missing");
    return;
  }

  overlay.innerHTML = "";
  overlay.hidden = false;
  overlay.style.display = "block";
  overlay.scrollTop = 0;

  document.body.style.overflow = "hidden";

  const shorts = list.filter(v => v && v.video_url);
  if (!shorts.length) return;

  shorts.forEach((item, i) => {
    const wrap = document.createElement("section");
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
    shorts.findIndex(v => Number(v.id) === Number(startId)) >= 0
      ? shorts.findIndex(v => Number(v.id) === Number(startId))
      : 0;

  requestAnimationFrame(() => {
    const target = overlay.querySelector(`.short[data-index="${startIndex}"]`);
    if (target) target.scrollIntoView({ block: "start" });

    setupObserver();
    activateVideo(startIndex);
  });
}

/* =========================
   CLOSE
========================= */
function closeShorts() {
  stopAll();
  currentIndex = -1;

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
}

/* =========================
   KEYBOARD (DESKTOP)
========================= */
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

/* =========================
   EXPORT
========================= */
window.openShorts = openShorts;
window.closeShorts = closeShorts;

})();