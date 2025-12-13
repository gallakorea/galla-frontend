console.log("[write.js] loaded - FINAL STABLE");

/* =========================
   SAFE QUERY
========================= */
const $ = (id) => document.getElementById(id);

/* =========================
   ELEMENTS
========================= */
const form = $("writeForm");

const category = $("category");
const titleInput = $("title");
const oneLineInput = $("oneLine");
const desc = $("description");
const counter = document.querySelector(".desc-counter");

/* FILES */
const thumbInput = $("thumbnail");
const thumbBtn = $("thumbnailBtn");

const videoInput = $("videoInput");
const videoBtn = $("videoBtn");

/* AI MODAL */
const openAiBtn = $("openAiModal");
const aiModal = $("aiModal");
const aiCloseBtn = $("aiCloseBtn");
const aiUserText = $("aiUserText");
const aiImprovedText = $("aiImprovedText");
const applyAiBtn = $("applyAiText");

/* =========================
   LAYOUT SAFETY (480px)
========================= */
document.documentElement.style.overflowX = "hidden";
document.body.style.overflowX = "hidden";

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
   FILE BUTTONS
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
   AI MODAL (UI ONLY, 무한대기 없음)
========================= */
if (openAiBtn && aiModal) {
  openAiBtn.type = "button";
  openAiBtn.addEventListener("click", () => {
    aiUserText.value = desc.value || "";
    aiImprovedText.value = "";
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
    if (aiImprovedText.value.trim()) {
      desc.value = aiImprovedText.value;
      counter.textContent = `${desc.value.length} / 500`;
    }
    aiModal.style.display = "none";
  });
}

/* ESC로 모달 닫기 */
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && aiModal.style.display === "flex") {
    aiModal.style.display = "none";
  }
});

/* =========================
   BOTTOM NAVIGATION
========================= */
document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.target;
    if (target) location.href = target;
  });
});

/* =========================
   FORM SUBMIT (에러 없이 동작)
========================= */
if (form) {
  form.addEventListener("submit", (e) => {
    e.preventDefault();

    if (!category.value) {
      alert("카테고리를 선택하세요");
      return;
    }
    if (!titleInput.value.trim()) {
      alert("제목을 입력하세요");
      return;
    }
    if (!oneLineInput.value.trim()) {
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

    /* === 현재 단계: UI + 검증 정상 === */
    alert("✅ 발의 버튼 정상 동작 상태\n(다음 단계: Supabase 업로드 연결)");
  });
}