/***************************************************
 * BASIC
 ***************************************************/
const body = document.body;
const form = document.getElementById("writeForm");
const issuePreview = document.getElementById("issuePreview");

/***************************************************
 * AI MODAL (초기 비표시 보장)
 ***************************************************/
const aiModal = document.getElementById("aiModal");
const openAiBtn = document.getElementById("openAiModal");
const closeAiBtn = document.getElementById("aiClose");

if (aiModal) aiModal.style.display = "none";

if (openAiBtn) {
  openAiBtn.addEventListener("click", () => {
    aiModal.style.display = "flex";
    body.style.overflow = "hidden";
  });
}

if (closeAiBtn) {
  closeAiBtn.addEventListener("click", () => {
    aiModal.style.display = "none";
    body.style.overflow = "";
  });
}

/***************************************************
 * FILE UPLOAD – THUMBNAIL
 ***************************************************/
const thumbInput = document.getElementById("thumbnail");
const thumbBtn = document.getElementById("thumbnailBtn");
const thumbPreview = document.getElementById("thumbPreview");

let thumbURL = null;

if (thumbBtn && thumbInput) {
  thumbBtn.onclick = () => thumbInput.click();
}

if (thumbInput) {
  thumbInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    thumbURL = URL.createObjectURL(file);
    thumbPreview.innerHTML = `
      <div class="preview-media" data-preview="true">
        <img src="${thumbURL}" class="preview-thumb-img" />
      </div>
    `;
  };
}

/***************************************************
 * FILE UPLOAD – VIDEO
 ***************************************************/
const videoInput = document.getElementById("video");
const videoBtn = document.getElementById("videoBtn");
const videoPreview = document.getElementById("videoPreview");

let videoURL = null;

if (videoBtn && videoInput) {
  videoBtn.onclick = () => videoInput.click();
}

if (videoInput) {
  videoInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    videoURL = URL.createObjectURL(file);

    videoPreview.innerHTML = `
      <div class="preview-media" data-preview="true">
        <video src="${videoURL}" muted></video>
      </div>
    `;
  };
}

/***************************************************
 * SPEECH VIDEO MODAL (초기 비표시)
 ***************************************************/
const speechModal = document.getElementById("speechModal");

if (speechModal) speechModal.style.display = "none";

function openSpeechModal() {
  if (!videoURL) return;

  speechModal.innerHTML = `
    <div class="speech-sheet">
      <div class="speech-header">
        <span>1분 엘리베이터 스피치</span>
        <button id="closeSpeech">닫기</button>
      </div>
      <div class="video-viewport">
        <video src="${videoURL}" controls autoplay playsinline></video>
      </div>
    </div>
  `;
  speechModal.style.display = "flex";
  body.style.overflow = "hidden";

  document.getElementById("closeSpeech").onclick = closeSpeechModal;
}

function closeSpeechModal() {
  speechModal.style.display = "none";
  speechModal.innerHTML = "";
  body.style.overflow = "";
}

/***************************************************
 * PREVIEW RENDER (미리보기 버튼 눌러야만)
 ***************************************************/
form.addEventListener("submit", (e) => {
  e.preventDefault();

  const category = document.getElementById("category").value;
  const title = document.getElementById("title").value;
  const oneLine = document.getElementById("oneLine").value;
  const desc = document.getElementById("description").value;
  const anon = document.getElementById("isAnonymous").checked;

  if (!category || !title || !desc) {
    alert("필수 항목을 입력하세요");
    return;
  }

  issuePreview.innerHTML = `
    <section class="issue-preview">
      <div class="issue-meta">${category} · 방금 전</div>
      <h1 class="issue-title">${title}</h1>
      ${oneLine ? `<p class="issue-one-line">${oneLine}</p>` : ""}
      <div class="issue-author">작성자 · ${anon ? "익명" : "사용자"}</div>

      ${
        thumbURL
          ? `
        <div class="preview-media" data-preview="true">
          <img src="${thumbURL}" class="preview-thumb-img" />
        </div>`
          : ""
      }

      ${
        videoURL
          ? `
        <button class="speech-btn" id="openSpeechBtn">
          🎥 1분 엘리베이터 스피치
        </button>`
          : ""
      }

      <section class="issue-summary">
        <h3>📝 이 주제에 대한 핵심 요약</h3>
        <p>${desc}</p>
      </section>

      <div class="preview-actions">
        <button id="editPreview">수정하기</button>
        <button class="btn-publish">발행하기</button>
      </div>
    </section>
  `;

  const openSpeechBtn = document.getElementById("openSpeechBtn");
  if (openSpeechBtn) openSpeechBtn.onclick = openSpeechModal;

  document.getElementById("editPreview").onclick = () => {
    issuePreview.innerHTML = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  issuePreview.scrollIntoView({ behavior: "smooth" });
});