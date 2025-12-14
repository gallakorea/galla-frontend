document.addEventListener('DOMContentLoaded', () => {

  /* =========================
     DOM ELEMENTS
  ========================= */
  const body = document.body;

  const writeForm = document.getElementById('writeForm');

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
     THUMBNAIL UPLOAD
  ========================= */
  thumbnailBtn.addEventListener('click', () => {
    thumbnailInput.click();
  });

  thumbnailInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    thumbPreview.innerHTML = '';

    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);

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

    videoPreview.innerHTML = '';

    const video = document.createElement('video');
    video.src = URL.createObjectURL(file);
    video.controls = true;

    videoPreview.appendChild(video);
  });

  /* =========================
     🔥 PREVIEW SUBMIT (핵심)
  ========================= */
  writeForm.addEventListener('submit', (e) => {
    e.preventDefault(); // 🔥 이게 없어서 지금까지 안 됐음

    const data = {
      category: document.getElementById('category').value,
      title: document.getElementById('title').value,
      oneLine: document.getElementById('oneLine').value,
      description: document.getElementById('description').value,
      isAnonymous: document.getElementById('isAnonymous').checked
    };

    // 필수 체크 (UI 안 건드리고 최소한만)
    if (!data.category || !data.title) {
      alert('카테고리와 제목은 필수입니다.');
      return;
    }

    // 임시 저장 (미리보기 페이지에서 사용)
    sessionStorage.setItem('galla_preview', JSON.stringify(data));

    // 🔥 여기서 실제로 "넘어감"
    location.href = 'preview.html';
  });

});