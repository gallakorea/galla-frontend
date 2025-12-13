console.log("[write.js] SAFE MODE - CLEAN");

/* =========================
   SAFE SELECTOR
========================= */
const $ = (id) => document.getElementById(id);

/* =========================
   ELEMENTS
========================= */
const form = $("writeForm");

const desc = $("description");
const counter = document.querySelector(".desc-counter");

const thumbBtn = $("thumbnailBtn");
const thumbInput = $("thumbnail");

const videoBtn = $("videoBtn");
const videoInput = $("video");

const openAiBtn = $("openAiModal");
const aiModal = $("aiModal");
const aiClose = $("aiClose");
const aiUserText = $("aiUserText");
const aiResultText = $("aiResultText");
const applyAi = $("applyAi");

/* =========================
   CHAR COUNTER
========================= */
if (desc && counter) {
  counter.textContent = "0 / 500";

  desc.addEventListener("input", () => {
    counter.textContent = `${desc.value.length} / 500`;
  });
}

/* =========================
   FILE UPLOAD BUTTONS
========================= */
if (thumbBtn && thumbInput) {
  thumbBtn.type = "button";
  thumbBtn.addEventListener("click", () => thumbInput.click());

  thumbInput.addEventListener("change", () => {
    if (thumbInput.files.length > 0) {
      thumbBtn.textContent = "썸네일 선택됨";
    }
  });
}

if (videoBtn && videoInput) {
  videoBtn.type = "button";
  videoBtn.addEventListener("click", () => videoInput.click());

  videoInput.addEventListener("change", () => {
    if (videoInput.files.length > 0) {
      videoBtn.textContent = "영상 선택됨";
    }
  });
}

/* =========================
   AI MODAL (UI ONLY – SAFE)
========================= */
if (openAiBtn && aiModal) {
  openAiBtn.type = "button";
  openAiBtn.addEventListener("click", () => {
    aiUserText.value = desc.value || "";
    aiResultText.value = "";
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
    if (aiResultText.value.trim()) {
      desc.value = aiResultText.value;
      counter.textContent = `${desc.value.length} / 500`;
    }
    aiModal.style.display = "none";
  });
}

/* =========================
   ESC → MODAL CLOSE
========================= */
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && aiModal && aiModal.style.display === "flex") {
    aiModal.style.display = "none";
  }
});

/* =========================
   BOTTOM NAV (RESTORE)
========================= */
document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.dataset.target) {
      location.href = btn.dataset.target;
    }
  });
});

/* =========================
   FORM SUBMIT (SAFE)
========================= */
if (form) {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    alert("✅ UI / 버튼 / 네비 / 모달 정상 작동");
  });
}