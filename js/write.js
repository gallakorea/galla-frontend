console.log("[write.js] FULL SAFE MODE");

const $ = (id) => document.getElementById(id);

const desc = $("description");
const counter = document.querySelector(".desc-counter");

/* 글자수 */
desc.addEventListener("input", () => {
  counter.textContent = `${desc.value.length} / 500`;
});

/* 썸네일 */
$("thumbnailBtn").onclick = () => $("thumbnail").click();
$("thumbnail").onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const img = $("thumbPreview");
  img.src = URL.createObjectURL(file);
  img.style.display = "block";
};

/* 영상 */
$("videoBtn").onclick = () => $("video").click();
$("video").onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const video = $("videoPreview");
  video.src = URL.createObjectURL(file);
  video.style.display = "block";
};

/* AI MODAL */
let currentStyle = "기본";

$("openAiModal").onclick = () => {
  $("aiUserText").value = desc.value;
  $("aiResultText").value = "";
  $("aiModal").style.display = "flex";
};

$("aiClose").onclick = () => {
  $("aiModal").style.display = "none";
};

document.querySelectorAll(".ai-style-tabs button").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".ai-style-tabs button")
      .forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentStyle = btn.dataset.style;
  };
});

/* AI 실행 (더미 로직) */
$("runAi").onclick = () => {
  const prompt = $("aiCustomPrompt").value;
  $("aiResultText").value =
    `[${currentStyle}]\n` +
    (prompt ? `요청: ${prompt}\n\n` : "") +
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

/* 제출 */
$("writeForm").onsubmit = (e) => {
  e.preventDefault();
  alert("✅ UI / 버튼 / 모달 / 미리보기 전부 정상 작동");
};

/* 하단 네비 */
document.querySelectorAll(".nav-item").forEach(btn => {
  btn.onclick = () => location.href = btn.dataset.target;
});