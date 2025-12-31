/* ===================================================
   GALLA SHORTS — STEP 1
   ONLY: UP / DOWN MOVE
=================================================== */

(function () {

  const IS_SHORTS_PAGE = document.body.dataset.page === "shorts";
  if (!IS_SHORTS_PAGE) {
    console.log("[SHORTS] not shorts page");
    return;
  }

  console.log("[SHORTS] shorts.js loaded");

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
    return;
  }

  /* =========================
     STATE
  ========================= */
  let list = [];
  let index = 0;
  let locked = false;

  function lock(ms = 400) {
    locked = true;
    setTimeout(() => locked = false, ms);
  }

  /* =========================
     LOAD
  ========================= */
  function resetPos() {
    videoPrev.style.transition =
    videoCur.style.transition =
    videoNext.style.transition = "none";

    videoPrev.style.transform = "translateY(-100%)";
    videoCur.style.transform  = "translateY(0)";
    videoNext.style.transform = "translateY(100%)";
  }

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
     MOVE
  ========================= */
  function next() {
    if (locked) return;
    if (index >= list.length - 1) return;
    lock();

    index++;

    videoPrev.style.transition =
    videoCur.style.transition =
    videoNext.style.transition = "transform .3s ease";

    videoPrev.style.transform = "translateY(-200%)";
    videoCur.style.transform  = "translateY(-100%)";
    videoNext.style.transform = "translateY(0)";

    setTimeout(loadVideos, 300);
  }

  function prev() {
    if (locked) return;
    if (index <= 0) return;
    lock();

    index--;

    videoPrev.style.transition =
    videoCur.style.transition =
    videoNext.style.transition = "transform .3s ease";

    videoPrev.style.transform = "translateY(0)";
    videoCur.style.transform  = "translateY(100%)";
    videoNext.style.transform = "translateY(200%)";

    setTimeout(loadVideos, 300);
  }

  /* =========================
     EVENTS
  ========================= */
  gestureLayer.style.pointerEvents = "auto";
  gestureLayer.style.touchAction = "none";

  let startY = 0;
  let deltaY = 0;
  let touching = false;

  gestureLayer.addEventListener("touchstart", (e) => {
    touching = true;
    startY = e.touches[0].clientY;
    deltaY = 0;
  }, { passive: false });

  gestureLayer.addEventListener("touchmove", (e) => {
    if (!touching) return;
    deltaY = e.touches[0].clientY - startY;
  }, { passive: false });

  gestureLayer.addEventListener("touchend", () => {
    touching = false;
    if (Math.abs(deltaY) < 60) return;
    deltaY < 0 ? next() : prev();
  });

  let wheelAcc = 0;
  gestureLayer.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (locked) return;

    wheelAcc += e.deltaY;
    if (Math.abs(wheelAcc) < 80) return;

    wheelAcc > 0 ? next() : prev();
    wheelAcc = 0;
  }, { passive: false });

  /* =========================
     BOOT
  ========================= */
  try {
    list = JSON.parse(sessionStorage.getItem("__SHORTS_LIST__") || "[]")
      .filter(v => v && v.video_url);
  } catch {
    list = [];
  }

  if (!list.length) {
    console.warn("[SHORTS] no shorts list");
    return;
  }

  overlay.hidden = false;
  loadVideos();

})();