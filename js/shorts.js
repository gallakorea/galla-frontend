/* shorts.js — TRUE Reels / Shorts (HARD SNAP + SINGLE AUDIO) */
(function () {

let overlay = null;
let observer = null;
let currentIndex = -1;

/* =========================
   UTILS
========================= */
function qs(id) {
  return document.getElementById(id);
}

function hardPauseAll(exceptIndex = null) {
  document.querySelectorAll(".short video").forEach((v, i) => {
    if (i === exceptIndex) return;
    try {
      v.pause();
      v.currentTime = 0;
      v.muted = true;
    } catch {}
  });
}

function playOnly(index) {
  if (!overlay) return;
  if (currentIndex === index) return;

  const wrap = overlay.querySelector(`.short[data-index="${index}"]`);
  if (!wrap) return;

  const video = wrap.querySelector("video");
  if (!video) return;

  currentIndex = index;

  hardPauseAll(index);

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
   OBSERVER (CORE)
========================= */
function getMostVisibleEntry(entries) {
  let best = null;
  let maxRatio = 0;
  entries.forEach(e => {
    if (e.intersectionRatio > maxRatio) {
      maxRatio = e.intersectionRatio;
      best = e;
    }
  });
  return best;
}

function setupObserver() {
  if (observer) observer.disconnect();

  observer = new IntersectionObserver(
    entries => {
      const best = getMostVisibleEntry(entries);
      if (!best) return;

      if (best.intersectionRatio < 0.6) return;

      const idx = Number(best.target.dataset.index);
      playOnly(idx);
    },
    {
      root: null,
      threshold: [0.25, 0.5, 0.6, 0.75, 0.9]
    }
  );

  overlay.querySelectorAll(".short").forEach(el => observer.observe(el));
}

/* =========================
   OPEN SHORTS
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
    overlay.scrollTo({
      top: startIndex * window.innerHeight,
      behavior: "instant"
    });

    setupObserver();
    playOnly(startIndex);
  });
}

/* =========================
   CLOSE SHORTS
========================= */
function closeShorts() {
  hardPauseAll();
  currentIndex = -1;

  if (observer) observer.disconnect();

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
   WHEEL (DESKTOP — SMOOTH SNAP)
========================= */
let wheelAccum = 0;
let wheelTimer = null;

window.addEventListener("wheel", e => {
  if (!overlay || overlay.hidden) return;

  // 기본 스크롤 허용 (자연스러운 감속)
  wheelAccum += e.deltaY;

  if (wheelTimer) return;

  wheelTimer = setTimeout(() => {
    const dir = wheelAccum > 0 ? 1 : -1;
    wheelAccum = 0;
    wheelTimer = null;

    overlay.scrollBy({
      top: dir * window.innerHeight,
      behavior: "smooth"
    });
  }, 120);
}, { passive: true });

/* =========================
   EXPORT
========================= */
window.openShorts = openShorts;
window.closeShorts = closeShorts;

})();