// js/speechPlayer.js

let speechIndex = 0;
let speechList = [];

let backdrop, videoEl, isLocked = false, startY = 0;

function initSpeechPlayer() {
  backdrop = document.querySelector(".speech-backdrop");
  videoEl = document.getElementById("speech-video");

  videoEl.playsInline = true;
  videoEl.muted = false;
  videoEl.style.width = "100%";
  videoEl.style.height = "100%";
  videoEl.style.objectFit = "cover";

  // 스와이프
  videoEl.addEventListener("touchstart", e => {
    startY = e.touches[0].clientY;
  });

  videoEl.addEventListener("touchend", e => {
    if (isLocked) return;

    const diff = startY - e.changedTouches[0].clientY;
    if (Math.abs(diff) < 120) return;

    isLocked = true;

    if (diff > 0 && speechIndex < speechList.length - 1) speechIndex++;
    if (diff < 0 && speechIndex > 0) speechIndex--;

    playSpeech();

    setTimeout(() => isLocked = false, 500);
  });
}

function openSpeechPlayer(list, startId) {
  speechList = list.filter(v => v.video_url);
  speechIndex = speechList.findIndex(v => v.id == startId);
  if (speechIndex < 0) speechIndex = 0;

  backdrop.classList.add("active");   // 🔥 추가

  document.body.style.overflow = "hidden";
  backdrop.hidden = false;

  playSpeech();
}

function playSpeech() {
  const item = speechList[speechIndex];
  if (!item) return;

  videoEl.src = item.video_url;
  videoEl.load();
  videoEl.play();
}

function closeSpeechPlayer() {
  videoEl.pause();
  videoEl.src = "";
  backdrop.hidden = true;
  document.body.style.overflow = "";
}

window.SpeechPlayer = {
  init: initSpeechPlayer,
  open: openSpeechPlayer,
  close: closeSpeechPlayer
};