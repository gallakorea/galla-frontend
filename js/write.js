const $ = id => document.getElementById(id);

/* =====================
   설명 글자수 카운터
===================== */
const desc = $("description");
const counter = document.querySelector(".desc-counter");

desc.addEventListener("input", () => {
  counter.textContent = `${desc.value.length} / 500`;
});

/* =====================
   파일 버튼
===================== */
$("thumbnailBtn").onclick = () => $("thumbnail").click();
$("videoBtn").onclick = () => $("video").click();

/* =====================
   업로드 미리보기
===================== */
$("thumbnail").onchange = e => {
  const file = e.target.files[0];
  if (!file) return;

  const img = document.createElement("img");
  img.src = URL.createObjectURL(file);

  let box = document.getElementById("thumbPreview");
  if (!box) {
    box = document.createElement("div");
    box.id = "thumbPreview";
    box.className = "upload-preview";
    $("thumbnailBtn").after(box);
  }

  box.innerHTML = "";
  box.appendChild(img);
  box.style.display = "block";
};

$("video").onchange = e => {
  const file = e.target.files[0];
  if (!file) return;

  const video = document.createElement("video");
  video.src = URL.createObjectURL(file);
  video.controls = true;

  let box = document.getElementById("videoPreview");
  if (!box) {
    box = document.createElement("div");
    box.id = "videoPreview";
    box.className = "upload-preview";
    $("videoBtn").after(box);
  }

  box.innerHTML = "";
  box.appendChild(video);
  box.style.display = "block";
};

/* =====================
   AI MODAL
===================== */
$("openAiModal").onclick = () => {
  $("aiUserText").value = desc.value;
  $("aiResultText").value = "";
  $("aiModal").style.display = "flex";
};

$("aiClose").onclick = () => {
  $("aiModal").style.display = "none";
};

/* 스타일 선택 */
let currentStyle = "basic";
document.querySelectorAll(".ai-style-tabs button").forEach(btn => {
  btn.onclick = () => {
    document
      .querySelectorAll(".ai-style-tabs button")
      .forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentStyle = btn.dataset.style;
  };
});

/* AI 실행 (더미) */
$("runAi").onclick = () => {
  $("runAi").classList.add("active");
  $("aiResultText").value =
    `[${currentStyle}]\n` +
    ($("aiCustomPrompt").value
      ? `요청: ${$("aiCustomPrompt").value}\n\n`
      : "") +
    $("aiUserText").value;
};

/* 적용 */
$("applyAi").onclick = () => {
  if ($("aiResultText").value.trim()) {
    desc.value = $("aiResultText").value;
    counter.textContent = `${desc.value.length} / 500`;
  }
  $("aiModal").style.display = "none";
};

/* =====================
   제출
===================== */
$("writeForm").onsubmit = e => {
  e.preventDefault();
  alert("✅ 갈라 발의 UI 정상 작동");
};