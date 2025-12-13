console.log("[write.js] FINAL SAFE MODE");

const $ = (id) => document.getElementById(id);

const desc = $("description");
const counter = document.querySelector(".desc-counter");

/* 글자수 */
desc.addEventListener("input", () => {
  counter.textContent = `${desc.value.length} / 500`;
});

/* 파일 업로드 */
$("thumbnailBtn").onclick = () => $("thumbnail").click();
$("videoBtn").onclick = () => $("video").click();

/* 네비 */
document.querySelectorAll(".nav-item").forEach(btn => {
  btn.onclick = () => location.href = btn.dataset.target;
});

/* AI MODAL */
const aiModal = $("aiModal");
const openAiBtn = $("openAiModal");
const aiClose = $("aiClose");
const aiUserText = $("aiUserText");
const aiResultText = $("aiResultText");
const aiCustomPrompt = $("aiCustomPrompt");
const runAi = $("runAi");
const applyAi = $("applyAi");

let currentStyle = "basic";

/* 스타일 탭 */
document.querySelectorAll(".ai-style-tabs button").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".ai-style-tabs button")
      .forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentStyle = btn.dataset.style;
  };
});

/* 모달 열기 */
openAiBtn.onclick = () => {
  aiUserText.value = desc.value || "";
  aiResultText.value = "";
  aiModal.style.display = "flex";
};

/* 닫기 */
aiClose.onclick = () => aiModal.style.display = "none";

/* AI 실행 (더미) */
runAi.onclick = () => {
  aiResultText.value =
    `[${currentStyle}]\n` +
    (aiCustomPrompt.value ? `요청: ${aiCustomPrompt.value}\n\n` : "") +
    aiUserText.value;
};

/* 적용 */
applyAi.onclick = () => {
  if (aiResultText.value.trim()) {
    desc.value = aiResultText.value;
    counter.textContent = `${desc.value.length} / 500`;
  }
  aiModal.style.display = "none";
};

/* 제출 */
$("writeForm").onsubmit = (e) => {
  e.preventDefault();
  alert("✅ 발의 버튼 정상 작동");
};