/***************************************************
 * BASIC
 ***************************************************/
const body = document.body;

/***************************************************
 * AI MODAL OPEN / CLOSE (FIX)
 ***************************************************/
const aiModal = document.getElementById("aiModal");
const openAiBtn = document.getElementById("openAiModal");
const closeAiBtn = document.getElementById("aiClose");

if (aiModal) {
  aiModal.style.display = "none"; // 🔥 처음부터 열리는 문제 차단
}

openAiBtn?.addEventListener("click", () => {
  aiModal.style.display = "flex";
  body.style.overflow = "hidden";
});

closeAiBtn?.addEventListener("click", () => {
  aiModal.style.display = "none";
  body.style.overflow = "";
});

/***************************************************
 * AI TAB INTERACTION (FIX)
 ***************************************************/
const aiTabs = document.querySelectorAll(".ai-style-tabs button");
const aiUserText = document.getElementById("aiUserText");

aiTabs.forEach(tab => {
  tab.addEventListener("click", () => {
    aiTabs.forEach(t => t.classList.remove("active"));
    tab.classList.add("active");

    if (aiUserText) {
      aiUserText.focus();
      aiUserText.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    }
  });
});

/***************************************************
 * THUMBNAIL UPLOAD + PREVIEW
 ***************************************************/
const thumbInput = document.getElementById("thumbnail");
const thumbBtn = document.getElementById("thumbnailBtn");
const thumbPreview = document.getElementById("thumbPreview");

thumbBtn?.addEventListener("click", () => thumbInput.click());

thumbInput?.addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;

  thumbPreview.innerHTML = `
    <div class="preview-box is-preview">
      <img src="${URL.createObjectURL(file)}" class="preview-thumb-img" />
    </div>
  `;
});

/***************************************************
 * VIDEO UPLOAD (ELEVATOR SPEECH)
 ***************************************************/
const videoInput = document.getElementById("video");
const videoBtn = document.getElementById("videoBtn");
const videoPreview = document.getElementById("videoPreview");

videoBtn?.addEventListener("click", () => videoInput.click());

videoInput?.addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;

  videoPreview.innerHTML = `
    <div class="preview-box is-preview">
      <video src="${URL.createObjectURL(file)}" muted playsinline></video>
    </div>
  `;
});

/***************************************************
 * SPEECH MODAL (9:16 FINAL)
 ***************************************************/
const speechBackdrop = document.querySelector(".speech-backdrop");

document.addEventListener("click", e => {
  if (e.target.classList.contains("speech-btn")) {
    speechBackdrop.style.display = "flex";
    body.style.overflow = "hidden";

    const video = speechBackdrop.querySelector("video");
    video?.play();
  }

  if (e.target.dataset.close === "speech") {
    speechBackdrop.style.display = "none";
    body.style.overflow = "";

    const video = speechBackdrop.querySelector("video");
    video?.pause();
  }
});