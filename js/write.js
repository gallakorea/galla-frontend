const $ = (id) => document.getElementById(id);

const desc = $("description");
const counter = document.querySelector(".desc-counter");

desc.addEventListener("input", () => {
  counter.textContent = `${desc.value.length} / 500`;
});

$("thumbnailBtn").onclick = () => $("thumbnail").click();
$("videoBtn").onclick = () => $("video").click();

$("openAiModal").onclick = () => {
  $("aiUserText").value = desc.value;
  $("aiResultText").value = "";
  $("aiModal").style.display = "flex";
};

$("aiClose").onclick = () => $("aiModal").style.display = "none";

$("runAi").onclick = () => {
  $("aiResultText").value =
    $("aiCustomPrompt").value
      ? `[요청]\n${$("aiCustomPrompt").value}\n\n${$("aiUserText").value}`
      : $("aiUserText").value;
};

$("applyAi").onclick = () => {
  desc.value = $("aiResultText").value;
  counter.textContent = `${desc.value.length} / 500`;
  $("aiModal").style.display = "none";
};

document.querySelectorAll(".nav-item").forEach(btn => {
  btn.onclick = () => location.href = btn.dataset.target;
});

$("writeForm").onsubmit = (e) => {
  e.preventDefault();
  alert("✅ 정상 작동");
};

// AI 실행 버튼 상태
runAi.onclick = () => {
  runAi.classList.add("active");
  applyAi.classList.remove("active");

  aiResultText.value =
    `[${currentStyle}]\n` +
    (aiCustomPrompt.value ? `요청: ${aiCustomPrompt.value}\n\n` : "") +
    aiUserText.value;
};

// AI 적용 버튼 상태
applyAi.onclick = () => {
  if (aiResultText.value.trim()) {
    desc.value = aiResultText.value;
    document.querySelector(".desc-counter").innerText =
      `${desc.value.length} / 500`;
  }

  applyAi.classList.add("active");
  runAi.classList.remove("active");
  aiModal.style.display = "none";
};

/* =========================
   UPLOAD PREVIEW
========================= */

// 썸네일
const thumbInput = document.getElementById("thumbnail");
const thumbPreview = document.getElementById("thumbPreview");

thumbInput.addEventListener("change", () => {
  const file = thumbInput.files[0];
  if (!file) return;

  const img = document.createElement("img");
  img.src = URL.createObjectURL(file);

  thumbPreview.innerHTML = "";
  thumbPreview.appendChild(img);
  thumbPreview.style.display = "block";
});

// 영상
const videoInput = document.getElementById("video");
const videoPreview = document.getElementById("videoPreview");

videoInput.addEventListener("change", () => {
  const file = videoInput.files[0];
  if (!file) return;

  const video = document.createElement("video");
  video.src = URL.createObjectURL(file);
  video.controls = true;
  video.muted = true;

  videoPreview.innerHTML = "";
  videoPreview.appendChild(video);
  videoPreview.style.display = "block";
});