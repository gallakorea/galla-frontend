document.addEventListener("DOMContentLoaded", () => {

  /* =====================
     ELEMENTS
  ===================== */
  const aiModal = document.getElementById("aiModal");
  const openAiBtn = document.getElementById("openAiModal");
  const aiCloseBtn = document.getElementById("aiClose");

  const thumbnail = document.getElementById("thumbnail");
  const thumbnailBtn = document.getElementById("thumbnailBtn");
  const thumbPreview = document.getElementById("thumbPreview");

  const video = document.getElementById("video");
  const videoBtn = document.getElementById("videoBtn");
  const videoPreview = document.getElementById("videoPreview");

  const writeForm = document.getElementById("writeForm");
  const previewSection = document.getElementById("previewSection");

  const pvCategory = document.getElementById("pv-category");
  const pvTitle = document.getElementById("pv-title");
  const pvDesc = document.getElementById("pv-desc");
  const pvAuthor = document.getElementById("pv-author");
  const pvThumb = document.getElementById("pv-thumb");
  const pvVideoBtn = document.getElementById("pv-video-btn");

  const backToEdit = document.getElementById("backToEdit");

  const speechBackdrop = document.querySelector(".speech-backdrop");
  const speechVideo = document.getElementById("speech-video");
  const speechClose = document.querySelector(".speech-close");

  /* =====================
     AI MODAL
  ===================== */
  if (openAiBtn) {
    openAiBtn.addEventListener("click", () => {
      aiModal.style.display = "flex";
      document.body.style.overflow = "hidden";
    });
  }

  if (aiCloseBtn) {
    aiCloseBtn.addEventListener("click", () => {
      aiModal.style.display = "none";
      document.body.style.overflow = "";
    });
  }

  /* =====================
     THUMBNAIL
  ===================== */
  thumbnailBtn.addEventListener("click", () => thumbnail.click());

  thumbnail.addEventListener("change", e => {
    thumbPreview.innerHTML = "";
    if (!e.target.files[0]) return;

    const img = document.createElement("img");
    img.src = URL.createObjectURL(e.target.files[0]);
    thumbPreview.append("미리보기", img);
  });

  /* =====================
     VIDEO
  ===================== */
  videoBtn.addEventListener("click", () => video.click());

  video.addEventListener("change", e => {
    videoPreview.innerHTML = "";
    if (!e.target.files[0]) return;

    const v = document.createElement("video");
    v.src = URL.createObjectURL(e.target.files[0]);
    v.controls = true;
    videoPreview.append("미리보기", v);
  });

  /* =====================
     PREVIEW
  ===================== */
  writeForm.addEventListener("submit", e => {
    e.preventDefault();

    previewSection.style.display = "block";
    writeForm.style.display = "none";

    pvCategory.textContent =
      document.getElementById("category").value;

    pvTitle.textContent =
      document.getElementById("title").value;

    pvDesc.textContent =
      document.getElementById("description").value;

    const isAnon = document.getElementById("isAnonymous").checked;
    pvAuthor.textContent = isAnon ? "작성자 · 익명" : "작성자 · 공개";

    if (thumbnail.files[0]) {
      pvThumb.src = URL.createObjectURL(thumbnail.files[0]);
    }

    if (video.files[0]) {
      pvVideoBtn.style.display = "block";
      pvVideoBtn.onclick = () => {
        speechVideo.src = URL.createObjectURL(video.files[0]);
        speechBackdrop.hidden = false;
      };
    }
  });

  backToEdit.addEventListener("click", () => {
    previewSection.style.display = "none";
    writeForm.style.display = "block";
  });

  /* =====================
     VIDEO MODAL
  ===================== */
  speechClose.addEventListener("click", () => {
    speechBackdrop.hidden = true;
    speechVideo.pause();
  });

});