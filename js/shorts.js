const overlay = document.getElementById("shortsOverlay");
const video = document.getElementById("shortsVideo");
const backBtn = document.getElementById("shortsBack");

let list = [];
let index = 0;
let startY = 0;
let locked = false;

function openShorts(videoList, startIndex = 0) {
  list = videoList.filter(v => v.video_url);
  index = startIndex;

  overlay.hidden = false;
  document.body.style.overflow = "hidden";

  play();
}

function play() {
  const item = list[index];
  if (!item) return;

  video.src = item.video_url;
  video.load();
  video.play();
}

function move(dir) {
  if (locked) return;
  locked = true;

  if (dir > 0 && index < list.length - 1) index++;
  if (dir < 0 && index > 0) index--;

  play();

  setTimeout(() => locked = false, 350);
}

/* =======================
   MOBILE — SWIPE
======================= */

video.addEventListener("touchstart", e => {
  startY = e.touches[0].clientY;
});

video.addEventListener("touchend", e => {
  const diff = startY - e.changedTouches[0].clientY;
  if (Math.abs(diff) < 60) return;
  move(diff > 0 ? 1 : -1);
});

/* =======================
   PC — MOUSE WHEEL
======================= */

overlay.addEventListener("wheel", e => {
  e.preventDefault();
  if (Math.abs(e.deltaY) < 30) return;
  move(e.deltaY > 0 ? 1 : -1);
}, { passive: false });

/* =======================
   PC — KEYBOARD
======================= */

window.addEventListener("keydown", e => {
  if (overlay.hidden) return;

  if (e.key === "ArrowDown") move(1);
  if (e.key === "ArrowUp") move(-1);
});

/* =======================
   CLOSE
======================= */

function closeShorts() {
  video.pause();
  video.src = "";
  overlay.hidden = true;
  document.body.style.overflow = "";
}

backBtn.onclick = closeShorts;

window.openShorts = openShorts;