/* =========================
   DOM ELEMENTS
========================= */
const body = document.body;

// AI Modal
const aiModal = document.getElementById('aiModal');
const openAiModalBtn = document.getElementById('openAiModal');
const aiCloseBtn = document.getElementById('aiClose');

// Thumbnail
const thumbnailInput = document.getElementById('thumbnail');
const thumbnailBtn = document.getElementById('thumbnailBtn');
const thumbPreview = document.getElementById('thumbPreview');

// Video
const videoInput = document.getElementById('video');
const videoBtn = document.getElementById('videoBtn');
const videoPreview = document.getElementById('videoPreview');

/* =========================
   AI MODAL OPEN / CLOSE
========================= */
openAiModalBtn.addEventListener('click', () => {
  aiModal.style.display = 'flex';
  body.style.overflow = 'hidden'; // 🔥 스크롤 고정
});

aiCloseBtn.addEventListener('click', () => {
  aiModal.style.display = 'none';
  body.style.overflow = ''; // 🔥 원복
});

// 배경 클릭 시 닫기 (선택)
aiModal.addEventListener('click', (e) => {
  if (e.target === aiModal) {
    aiModal.style.display = 'none';
    body.style.overflow = '';
  }
});

/* =========================
   THUMBNAIL UPLOAD
========================= */
thumbnailBtn.addEventListener('click', () => {
  thumbnailInput.click();
});

thumbnailInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const img = document.createElement('img');
  img.src = URL.createObjectURL(file);

  thumbPreview.innerHTML = '<div>미리보기</div>';
  thumbPreview.appendChild(img);
});

/* =========================
   VIDEO UPLOAD
========================= */
videoBtn.addEventListener('click', () => {
  videoInput.click();
});

videoInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const video = document.createElement('video');
  video.src = URL.createObjectURL(file);
  video.controls = true;

  videoPreview.innerHTML = '<div>미리보기</div>';
  videoPreview.appendChild(video);
});