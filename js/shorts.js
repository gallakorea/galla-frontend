// shorts.js — CLEAN REWRITE (GESTURE 100% WORKING)

const IS_SHORTS_PAGE = document.body.dataset.page === "shorts";

/* =====================================================
   GLOBAL API (항상 존재)
===================================================== */
window.openShorts = function (list, startId) {
  if (!IS_SHORTS_PAGE) {
    sessionStorage.setItem("__SHORTS_LIST__", JSON.stringify(list || []));
    const p = new URLSearchParams();
    if (startId != null) p.set("start", startId);
    location.href = `/shorts.html?${p}`;
  }
};
window.closeShorts = window.closeShorts || function () {};

/* =====================================================
   iOS SCROLL LOCK
===================================================== */
let __scrollY = 0;
function lockScroll() {
  __scrollY = window.scrollY;
  document.body.style.position = "fixed";
  document.body.style.top = `-${__scrollY}px`;
}
function unlockScroll() {
  document.body.style.position = "";
  document.body.style.top = "";
  window.scrollTo(0, __scrollY);
}

/* =====================================================
   SHORTS MODULE
===================================================== */
(() => {
  if (!IS_SHORTS_PAGE) return;

  /* ---------- DOM ---------- */
  const overlay = document.getElementById("shortsOverlay");
  const stage = document.querySelector(".shorts-stage");
  const vPrev = document.getElementById("videoPrev");
  const vCur  = document.getElementById("shortsVideo");
  const vNext = document.getElementById("videoNext");
  const back  = document.getElementById("shortsBack");

  if (!overlay || !stage || !vPrev || !vCur || !vNext) {
    console.error("[SHORTS] DOM missing");
    return;
  }

  // 🔥 핵심: video는 터치 금지
  [vPrev, vCur, vNext].forEach(v => {
    v.playsInline = true;
    v.setAttribute("playsinline", "");
    v.setAttribute("webkit-playsinline", "");
    v.style.pointerEvents = "none";
  });

  overlay.style.touchAction = "none";

  /* ---------- STATE ---------- */
  let list = [];
  let idx = 0;
  let locked = false;

  /* ---------- UTIL ---------- */
  const lock = (ms = 350) => {
    locked = true;
    setTimeout(() => locked = false, ms);
  };

  const setStage = y => {
    stage.style.transition = "transform .35s ease";
    stage.style.transform = `translateY(${y}%)`;
  };

  const resetStage = () => {
    stage.style.transition = "none";
    stage.style.transform = "translateY(0)";
  };

  /* ---------- VIDEO ---------- */
  function loadVideos() {
    const cur = list[idx];
    const prev = list[idx - 1];
    const next = list[idx + 1];

    if (prev) vPrev.src = prev.video_url;
    if (cur)  vCur.src  = cur.video_url;
    if (next) vNext.src = next.video_url;

    [vPrev, vCur, vNext].forEach(v => v.load());
  }

  async function playCurrent(fromGesture = false) {
    try {
      if (fromGesture) {
        vCur.muted = true;
        await vCur.play();
        vCur.muted = false;
      } else {
        await vCur.play();
      }
    } catch {}
  }

  /* ---------- NAV ---------- */
  async function next() {
    if (locked || idx >= list.length - 1) return;
    lock();
    setStage(-100);

    setTimeout(async () => {
      idx++;
      resetStage();
      loadVideos();
      await playCurrent();
      window.currentIssue = list[idx];
    }, 350);
  }

  async function prev() {
    if (locked || idx <= 0) return;
    lock();
    setStage(100);

    setTimeout(async () => {
      idx--;
      resetStage();
      loadVideos();
      await playCurrent();
      window.currentIssue = list[idx];
    }, 350);
  }

  function close() {
    [vPrev, vCur, vNext].forEach(v => {
      v.pause();
      v.removeAttribute("src");
      v.load();
    });
    overlay.hidden = true;
    unlockScroll();
  }

  /* ---------- GESTURE ---------- */
  let sx = 0, sy = 0, active = false;

  overlay.addEventListener("touchstart", e => {
    const t = e.touches[0];
    sx = t.clientX;
    sy = t.clientY;
    active = true;
    playCurrent(true); // 🔥 iOS autoplay 핵심
  }, { passive: false });

  overlay.addEventListener("touchend", e => {
    if (!active) return;
    active = false;

    const t = e.changedTouches[0];
    const dx = t.clientX - sx;
    const dy = t.clientY - sy;

    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 80) {
      close();
      return;
    }
    if (Math.abs(dy) > 80) {
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
    if (e.key === "Escape") close();
  });

  back.onclick = close;
  window.addEventListener("popstate", close);

  /* ---------- BOOT ---------- */
  const p = new URLSearchParams(location.search);
  const start = Number(p.get("start"));

  try {
    list = JSON.parse(sessionStorage.getItem("__SHORTS_LIST__") || "[]");
  } catch {}

  if (!list.length) return;

  idx = Math.max(0, list.findIndex(v => v.id == start));
  overlay.hidden = false;
  lockScroll();
  loadVideos();
  playCurrent();

  window.openShorts = openShorts;
  window.closeShorts = close;
})();