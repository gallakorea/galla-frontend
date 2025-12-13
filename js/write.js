console.log("[write.js] loaded");

/* ===============================
   DOM UTILS
================================ */
const $ = (id) => document.getElementById(id);

/* ===============================
   ELEMENTS
================================ */
const form = $("form");
const desc = $("desc");
const count = $("count");

const thumbInput = $("thumb");
const thumbBtn = $("thumbBtn");

const videoInput = $("video");
const videoBtn = $("videoBtn");

const modal = $("modal");
const openAI = $("openAI");
const closeAI = $("closeAI");
const applyAI = $("applyAI");

const aiInput = $("aiInput");
const aiOutput = $("aiOutput");

/* ===============================
   DESCRIPTION COUNTER
================================ */
desc.addEventListener("input", () => {
  count.textContent = `${desc.value.length} / 500`;
});

/* ===============================
   FILE UPLOAD BUTTONS (핵심)
================================ */
thumbBtn.addEventListener("click", () => {
  thumbInput.click();
});

videoBtn.addEventListener("click", () => {
  videoInput.click();
});

thumbInput.addEventListener("change", () => {
  if (thumbInput.files.length > 0) {
    thumbBtn.textContent = "썸네일 선택됨";
  }
});

videoInput.addEventListener("change", () => {
  if (videoInput.files.length > 0) {
    videoBtn.textContent = "영상 선택됨";
  }
});

/* ===============================
   AI MODAL
================================ */
openAI.addEventListener("click", () => {
  aiInput.value = desc.value;
  aiOutput.value = "";
  modal.style.display = "flex";
});

closeAI.addEventListener("click", () => {
  modal.style.display = "none";
});

applyAI.addEventListener("click", () => {
  desc.value = aiOutput.value;
  count.textContent = `${desc.value.length} / 500`;
  modal.style.display = "none";
});

/* ===============================
   FORM SUBMIT (안전)
================================ */
form.addEventListener("submit", (e) => {
  e.preventDefault();

  if (!desc.value.trim()) {
    alert("이슈 설명을 입력하세요");
    return;
  }

  alert("UI 완전 정상 작동 상태");
});