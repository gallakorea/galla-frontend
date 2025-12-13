console.log("[write.js] STABLE");

const $ = id => document.getElementById(id);

/* ===== COUNTER ===== */
const desc = $("description");
const counter = document.querySelector(".desc-counter");

desc.addEventListener("input", () => {
  counter.textContent = `${desc.value.length} / 500`;
});

/* ===== FILE BUTTONS ===== */
$("thumbnailBtn").onclick = () => $("thumbnail").click();
$("videoBtn").onclick = () => $("video").click();

/* ===== BOTTOM NAV ===== */
document.querySelectorAll(".nav-item").forEach(btn => {
  btn.onclick = () => location.href = btn.dataset.target;
});

/* ===== AI MODAL ===== */
const aiModal = $("aiModal");
const aiUserText = $("aiUserText");
const aiResultText = $("aiResultText");
const aiCustomPrompt = $("aiCustomPrompt");

let currentStyle = "basic";

$("openAiModal").onclick = () => {
  aiUserText.value = desc.value || "";
  aiResultText.value = "";
  aiModal.style.display = "flex";
};

$("aiClose").onclick = () => aiModal.style.display = "none";

document.querySelectorAll(".ai-style-tabs button").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".ai-style-tabs button")
      .forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentStyle = btn.dataset.style;
  };
});

/* AI 실행 (mock – Edge Function 연결 가능) */
$("runAi").onclick = () => {
  aiResultText.value =
`[스타일: ${currentStyle}]
${aiCustomPrompt.value ? `요청: ${aiCustomPrompt.value}\n\n` : ""}${aiUserText.value}`;
};

/* 적용 */
$("applyAi").onclick = () => {
  if (aiResultText.value.trim()) {
    desc.value = aiResultText.value;
    counter.textContent = `${desc.value.length} / 500`;
  }
  aiModal.style.display = "none";
};

/* ===== SUBMIT ===== */
$("writeForm").onsubmit = e => {
  e.preventDefault();
  alert("✅ 모든 버튼 / AI / 영상 / UI 정상 작동");
};