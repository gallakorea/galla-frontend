document.addEventListener('DOMContentLoaded', () => {

  const body = document.body;

  /* =========================
     DOM ELEMENTS
  ========================= */

  const previewBtn = document.getElementById('previewBtn');

  // AI Modal
  const aiModal = document.getElementById('aiModal');
  const openAiModalBtn = document.getElementById('openAiModal');
  const aiCloseBtn = document.getElementById('aiClose');

  // Inputs
  const category = document.getElementById('category');
  const title = document.getElementById('title');
  const oneLine = document.getElementById('oneLine');
  const description = document.getElementById('description');
  const isAnonymous = document.getElementById('isAnonymous');

  // Thumbnail
  const thumbnailInput = document.getElementById('thumbnail');
  const thumbnailBtn = document.getElementById('thumbnailBtn');
  const thumbPreview = document.getElementById('thumbPreview');

  // Video
  const videoInput = document.getElementById('video');
  const videoBtn = document.getElementById('videoBtn');
  const videoPreview = document.getElementById('videoPreview');

  /* =========================
     AI MODAL
  ========================= */

  openAiModalBtn?.addEventListener('click', () => {
    aiModal.style.display = 'flex';
    body.style.overflow = 'hidden';
  });

  aiCloseBtn?.addEventListener('click', () => {
    aiModal.style.display = 'none';
    body.style.overflow = '';
  });

  aiModal?.addEventListener('click', (e) => {
    if (e.target === aiModal) {
      aiModal.style.display = 'none';
      body.style.overflow = '';
    }
  });

  /* =========================
     FILE UPLOAD
  ========================= */

  thumbnailBtn?.addEventListener('click', () => thumbnailInput.click());
  videoBtn?.addEventListener('click', () => videoInput.click());

  thumbnailInput?.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;

    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    img.style.width = '100%';
    img.style.borderRadius = '12px';

    thumbPreview.innerHTML = '';
    thumbPreview.appendChild(img);
  });

  videoInput?.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;

    const video = document.createElement('video');
    video.src = URL.createObjectURL(file);
    video.controls = true;
    video.style.width = '100%';
    video.style.borderRadius = '12px';

    videoPreview.innerHTML = '';
    videoPreview.appendChild(video);
  });

  /* =========================
     PREVIEW CLICK (핵심)
  ========================= */

  previewBtn?.addEventListener('click', () => {

    const params = new URLSearchParams({
      category: category.value,
      title: title.value,
      oneLine: oneLine.value,
      description: description.value,
      isAnonymous: isAnonymous.checked ? '1' : '0'
    });

    if (thumbnailInput.files[0]) {
      params.set('thumb', URL.createObjectURL(thumbnailInput.files[0]));
    }

    if (videoInput.files[0]) {
      params.set('video', URL.createObjectURL(videoInput.files[0]));
    }

    // ✅ 절대 리셋 없음
    location.href = `preview.html?${params.toString()}`;
  });

});