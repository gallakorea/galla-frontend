const overlay = document.getElementById("shortsOverlay");
const video = document.getElementById("shortsVideo");
const backBtn = document.getElementById("shortsBack");

function openShorts(url){
  overlay.hidden = false;
  document.body.style.overflow = "hidden";
  video.src = url;
  video.play();
}

function closeShorts(){
  video.pause();
  video.src = "";
  overlay.hidden = true;
  document.body.style.overflow = "";
}

backBtn.onclick = closeShorts;

window.openShorts = openShorts;