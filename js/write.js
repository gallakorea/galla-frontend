console.log("[write.js] FULL SAFE MODE");

const $ = (id) => document.getElementById(id);

/* ELEMENTS */
const form = $("writeForm");
const desc = $("description");
const counter = document.querySelector(".desc-counter");

const thumbInput = $("thumbnail");
const thumbBtn = $("thumbnailBtn");

const videoInput = $("videoInput");
const videoBtn = $("videoBtn");

/* AI */
const aiModal = $("aiModal");
const openAi = $("openAiModal");
const aiClose = $("aiClose");
const applyAi = $("applyAi");
const aiUser = $("aiUserText");
const aiResult = $("aiResultText");

/* COUNTER */
desc.addEventListener("input", () => {
  counter.textContent = `${desc.value.length} / 500`;
});

/* FILE BUTTONS */
thumbBtn.onclick = () => thumbInput.click();
videoBtn.onclick = () => videoInput.click();

thumbInput.onchange = () => thumbBtn.textContent = "썸네일 선택됨";
videoInput.onchange = () => videoBtn.textContent = "영상 선택됨";

/* AI MODAL */
openAi.onclick = () => {
  aiUser.value = desc.value;
  aiModal.style.display = "block";
};
aiClose.onclick = () => aiModal.style.display = "none";
applyAi.onclick = () => {
  desc.value = aiResult.value;
  counter.textContent = `${desc.value.length} / 500`;
  aiModal.style.display = "none";
};

/* SUBMIT */
form.onsubmit = (e) => {
  e.preventDefault();
  alert("✅ 발의 버튼 정상 동작");
};

/* NAV */
document.querySelectorAll(".nav-item").forEach(btn => {
  btn.onclick = () => location.href = btn.dataset.target;
});