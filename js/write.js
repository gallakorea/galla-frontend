console.log("[write.js] loaded - stable");

/* =========================
   SAFE DOM GET
========================= */
const $ = (id) => document.getElementById(id);

/* =========================
   ELEMENTS
========================= */
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
const aiClose = document.getElementById("aiClose");
const aiUser = $("aiUserText");
const aiResult = $("aiResultText");
const applyAi = $("applyAi");

/* =========================
   WIDTH / LAYOUT SAFETY
========================= */
document.body.style.overflowX = "hidden";
document.documentElement.style.overflowX = "hidden";

/* =========================
   COUNTER
========================= */
if (desc && counter) {
  counter.textContent = "0 / 500";

  desc.addEventListener("input", () => {
    counter.textContent = `${desc.value.length} / 500`;
  });
}

/* =========================
   FILE BUTTONS (중요)
========================= */
if (thumbBtn && thumbInput) {
  thumbBtn.type = "button";

  thumbBtn.addEventListener("click", (e) => {
    e.preventDefault();
    thumbInput.click();
  });

  thumbInput.addEventListener("change", () => {
    if (thumbInput.files.length > 0) {
      thumbBtn.textContent = "썸네일 선택됨";
    }
  });
}

if (videoBtn && videoInput) {
  videoBtn.type = "button";

  videoBtn.addEventListener("click", (e) => {
    e.preventDefault();
    videoInput.click();
  });

  videoInput.addEventListener("change", () => {
    if (videoInput.files.length > 0) {
      videoBtn.textContent = "영상 선택됨";
    }
  });
}

/* =========================
   AI MODAL (UI ONLY)
========================= */
if (openAiBtn && aiModal) {
  openAiBtn.type = "button";

  openAiBtn.addEventListener("click", () => {
    aiUser.value = desc.value || "";
    aiResult.value = "";
    aiModal.style.display = "flex";
  });
}

if (aiClose) {
  aiClose.type = "button";
  aiClose.addEventListener("click", () => {
    aiModal.style.display = "none";
  });
}

if (applyAi) {
  applyAi.type = "button";

  applyAi.addEventListener("click", () => {
    if (aiResult.value.trim()) {
      desc.value = aiResult.value;
      counter.textContent = `${desc.value.length} / 500`;
    }
    aiModal.style.display = "none";
  });
}

/* =========================
   FORM SUBMIT (차단 없음)
========================= */
if (form) {
  form.addEventListener("submit", (e) => {
    e.preventDefault();

    if (!category.value) {
      alert("카테고리를 선택하세요");
      return;
    }
    if (!title.value.trim()) {
      alert("제목을 입력하세요");
      return;
    }
    if (!oneLine.value.trim()) {
      alert("발의자 한 줄을 입력하세요");
      return;
    }
    if (!desc.value.trim()) {
      alert("이슈 설명을 입력하세요");
      return;
    }

    alert("✅ UI 기준 발의 버튼 정상 동작 상태");
  });
}

/* =========================
   ESC → MODAL CLOSE
========================= */
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && aiModal.style.display === "flex") {
    aiModal.style.display = "none";
  }
});