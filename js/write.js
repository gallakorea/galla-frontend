console.log("[write.js] UI FULL STABLE");

/* ========= helper ========= */
const $ = (id) => document.getElementById(id);

/* ========= elements ========= */
const form = $("writeForm");
const category = $("category");
const title = $("title");
const oneLine = $("oneLine");
const desc = $("description");
const counter = document.querySelector(".desc-counter");

const thumbInput = $("thumbnail");
const thumbBtn = $("thumbnailBtn");

const videoInput = $("video");
const videoBtn = $("videoBtn");

/* AI */
const openAiBtn = $("openAiModal");
const aiModal = $("aiModal");
const aiClose = $("aiClose");
const aiUser = $("aiUserText");
const aiResult = $("aiResultText");
const applyAi = $("applyAi");

/* ========= counter ========= */
desc.addEventListener("input", () => {
  counter.textContent = `${desc.value.length} / 500`;
});

/* ========= file buttons ========= */
thumbBtn.addEventListener("click", () => {
  thumbInput.click();
});
thumbInput.addEventListener("change", () => {
  if (thumbInput.files.length) {
    thumbBtn.textContent = "썸네일 선택됨";
  }
});

videoBtn.addEventListener("click", () => {
  videoInput.click();
});
videoInput.addEventListener("change", () => {
  if (videoInput.files.length) {
    videoBtn.textContent = "영상 선택됨";
  }
});

/* ========= AI modal ========= */
openAiBtn.addEventListener("click", () => {
  aiUser.value = desc.value;
  aiResult.value = "";
  aiModal.style.display = "flex";
});

aiClose.addEventListener("click", () => {
  aiModal.style.display = "none";
});

applyAi.addEventListener("click", () => {
  if (aiResult.value.trim()) {
    desc.value = aiResult.value;
    counter.textContent = `${desc.value.length} / 500`;
  }
  aiModal.style.display = "none";
});

/* ========= submit ========= */
form.addEventListener("submit", (e) => {
  e.preventDefault();

  if (!category.value) return alert("카테고리 선택");
  if (!title.value.trim()) return alert("제목 입력");
  if (!oneLine.value.trim()) return alert("발의자 한 줄 입력");
  if (!desc.value.trim()) return alert("이슈 설명 입력");
  if (!thumbInput.files.length) return alert("썸네일 업로드");

  alert("✅ UI 기준 완전 정상 작동 상태");
});