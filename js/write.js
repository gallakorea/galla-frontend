console.log("[write.js] loaded - FULL STABLE");

/* =========================
   SAFE DOM SELECT
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

const videoInput = $("videoInput");
const videoBtn = $("videoBtn");

/* AI MODAL */
const openAiBtn = $("openAiModal");
const aiModal = $("aiModal");
const aiCloseBtn = $("aiCloseBtn") || $("aiClose");
const aiUserText = $("aiUserText");
const aiImprovedText = $("aiImprovedText") || $("aiResultText");
const applyAiBtn = $("applyAiText") || $("applyAi");

/* =========================
   LAYOUT SAFETY (폭 문제 차단)
========================= */
document.body.style.overflowX = "hidden";
document.documentElement.style.overflowX = "hidden";

/* =========================
   DESCRIPTION COUNTER
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
   AI MODAL (UI ONLY / 안전판)
========================= */
if (openAiBtn && aiModal) {
  openAiBtn.type = "button";

  openAiBtn.addEventListener("click", () => {
    aiUserText.value = desc.value || "";
    if (aiImprovedText) aiImprovedText.value = "";
    aiModal.style.display = "flex";
  });
}

if (aiCloseBtn) {
  aiCloseBtn.type = "button";
  aiCloseBtn.addEventListener("click", () => {
    aiModal.style.display = "none";
  });
}

if (applyAiBtn) {
  applyAiBtn.type = "button";

  applyAiBtn.addEventListener("click", () => {
    if (aiImprovedText && aiImprovedText.value.trim()) {
      desc.value = aiImprovedText.value;
      counter.textContent = `${desc.value.length} / 500`;
    }
    aiModal.style.display = "none";
  });
}

/* ESC → MODAL CLOSE */
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && aiModal && aiModal.style.display === "flex") {
    aiModal.style.display = "none";
  }
});

/* =========================
   FORM SUBMIT (100% 작동 보장)
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
    if (!thumbInput.files.length) {
      alert("썸네일 이미지를 업로드하세요");
      return;
    }

    alert("✅ UI 기준 발의 버튼 정상 동작 상태");
  });
}

/* =========================
   BOTTOM NAV
========================= */
document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.target;
    if (target) location.href = target;
  });
});