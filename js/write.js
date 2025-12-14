document.addEventListener('DOMContentLoaded', () => {
  const body = document.body;

  const aiModal = document.getElementById('aiModal');
  const openAiModalBtn = document.getElementById('openAiModal');
  const aiCloseBtn = document.getElementById('aiClose');

  const thumbnailBtn = document.getElementById('thumbnailBtn');
  const thumbnailInput = document.getElementById('thumbnail');
  const thumbPreview = document.getElementById('thumbPreview');

  const videoBtn = document.getElementById('videoBtn');
  const videoInput = document.getElementById('video');
  const videoPreview = document.getElementById('videoPreview');

  const previewBtn = document.getElementById('previewBtn');

  /* =========================
     AI MODAL
  ========================= */
  openAiModalBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    aiModal.style.display = 'flex';
    body.style.overflow = 'hidden';
  });

  aiCloseBtn.addEventListener('click', () => {
    aiModal.style.display = 'none';
    body.style.overflow = '';
  });

  aiModal.addEventListener('click', (e) => {
    if (e.target === aiModal) {
      aiModal.style.display = 'none';
      body.style.overflow = '';
    }
  });

  /* =========================
     FILE UPLOAD
  ========================= */
  thumbnailBtn.addEventListener('click', () => {
    thumbnailInput.click();
  });

  thumbnailInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);

    thumbPreview.innerHTML = '';
    thumbPreview.appendChild(img);
  });

  videoBtn.addEventListener('click', () => {
    videoInput.click();
  });

  videoInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const video = document.createElement('video');
    video.src = URL.createObjectURL(file);
    video.controls = true;

    videoPreview.innerHTML = '';
    videoPreview.appendChild(video);
  });

  /* =========================
     PREVIEW (확인용 로그)
  ========================= */
  previewBtn.addEventListener('click', () => {
    console.log('✅ 미리보기 클릭됨');
  });
});