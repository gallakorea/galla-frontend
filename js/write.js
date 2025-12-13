console.log("[write.js] FULL SAFE VERSION");

const $ = (id) => document.getElementById(id);

/* ========= COUNTER ========= */
const desc = $("description");
const counter = document.querySelector(".desc-counter");

desc.addEventListener("input", () => {
  counter.textContent = `${desc.value.length} / 500`;
});

/* ========= FILE UPLOAD ========= */
$("thumbnailBtn").onclick = () => $("thumbnail").click();
$("videoBtn").onclick = () => $("video").click();

/* 썸네일 미리보기 */
$("thumbnail").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const img = $("#thumbPreview img");
  img.src = URL.createObjectURL(file);
  $("#thumbPreview").style.display = "block";
});

/* 영상 미리보기 */
$("video").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const video = $("#videoPreview video");
  video.src = URL.createObjectURL(file);
  video.load();
  $("#videoPreview").style.display = "block";
});

/* ========= AI MODAL ========= */
$("openAiModal").onclick = () => {
  $("aiUserText").value = desc.value;
  $("aiResultText").value = "";
  $("aiModal").style.display = "flex";
};

$("aiClose").onclick = () => {
  $("aiModal").style.display = "none";
};

let currentStyle = "basic";
document.querySelectorAll(".ai-style-tabs button").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".ai-style-tabs button")
      .forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentStyle = btn.dataset.style;
  };
});

/* AI 실행 (Mock) */
const runBtn = document.createElement("button");
runBtn.textContent = "AI 실행";
runBtn.className = "ai-run-btn";
runBtn.onclick = () => {
  $("aiResultText").value =
    `[${currentStyle}]\n\n` + $("aiUserText").value;
};
document.querySelector(".ai-modal-footer").prepend(runBtn);

/* 적용 */
$("applyAi").onclick = () => {
  desc.value = $("aiResultText").value;
  counter.textContent = `${desc.value.length} / 500`;
  $("aiModal").style.display = "none";
};

/* ========= NAV ========= */
document.querySelectorAll(".nav-item").forEach(btn => {
  btn.onclick = () => location.href = btn.dataset.target;
});

/* ========= SUBMIT (PREVIEW) ========= */
$("writeForm").onsubmit = (e) => {
  e.preventDefault();

  const isAnonymous = $("anonymousToggle").checked;
  alert(`미리보기 모드\n익명 발의: ${isAnonymous ? "ON" : "OFF"}`);
};

/* ========= DEFAULT URL ========= */
["ref1","ref2","ref3"].forEach(id=>{
  const input = $(id);
  input.value = "https://";
});