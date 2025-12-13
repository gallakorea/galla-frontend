/* =========================
   ELEMENTS
========================= */
const form = document.getElementById("writeForm");
const preview = document.getElementById("previewSection");

const category = document.getElementById("category");
const title = document.getElementById("title");
const oneLine = document.getElementById("oneLine");
const desc = document.getElementById("description");
const isAnonymous = document.getElementById("isAnonymous");

const thumbInput = document.getElementById("thumbnail");
const videoInput = document.getElementById("video");

const thumbPreview = document.getElementById("thumbPreview");
const videoPreview = document.getElementById("videoPreview");

/* preview fields */
const pvCategory = document.getElementById("pv-category");
const pvTitle = document.getElementById("pv-title");
const pvDesc = document.getElementById("pv-desc");
const pvAuthor = document.getElementById("pv-author");
const pvThumb = document.getElementById("pv-thumb");
const pvVideoBtn = document.getElementById("pv-video-btn");

/* buttons */
const previewBtn = form.querySelector(".primary-btn");
const backBtn = document.getElementById("backToEdit");
const publishBtn = document.getElementById("publishIssue");

/* =========================
   FILE UPLOAD (PREVIEW)
========================= */
document.getElementById("thumbnailBtn").onclick = () => thumbInput.click();
thumbInput.onchange = e => {
  const img = document.createElement("img");
  img.src = URL.createObjectURL(e.target.files[0]);
  thumbPreview.innerHTML = "미리보기";
  thumbPreview.appendChild(img);
};

document.getElementById("videoBtn").onclick = () => videoInput.click();
videoInput.onchange = e => {
  const v = document.createElement("video");
  v.src = URL.createObjectURL(e.target.files[0]);
  v.controls = true;
  videoPreview.innerHTML = "미리보기";
  videoPreview.appendChild(v);
};

/* =========================
   PREVIEW MODE
========================= */
previewBtn.onclick = e => {
  e.preventDefault();

  // 바인딩
  pvCategory.textContent = category.value;
  pvTitle.textContent = title.value;
  pvDesc.textContent = oneLine.value;
  pvAuthor.textContent = isAnonymous.checked ? "작성자 · 익명" : "작성자 · 공개";

  // 썸네일
  if (thumbInput.files[0]) {
    pvThumb.src = URL.createObjectURL(thumbInput.files[0]);
  }

  // 영상
  if (videoInput.files[0]) {
    pvVideoBtn.style.display = "block";
  }

  // 전환
  form.style.display = "none";
  preview.style.display = "block";
};

/* =========================
   BACK TO EDIT
========================= */
backBtn.onclick = () => {
  preview.style.display = "none";
  form.style.display = "block";
};

/* =========================
   VIDEO MODAL (재사용)
========================= */
pvVideoBtn.onclick = () => {
  const modal = document.querySelector(".speech-backdrop");
  const video = document.getElementById("speech-video");
  video.src = URL.createObjectURL(videoInput.files[0]);
  modal.hidden = false;
  modal.querySelector(".speech-sheet").style.bottom = "0";
};

/* =========================
   PUBLISH (임시)
========================= */
publishBtn.onclick = async () => {
  alert("✅ 발행 로직 연결 준비 완료\n(다음 단계: Supabase insert)");
};