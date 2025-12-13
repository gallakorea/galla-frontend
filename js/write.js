document.addEventListener('DOMContentLoaded', () => {

  const body = document.body;

  /* =========================
     DOM ELEMENTS
  ========================= */

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

  if (openAiModalBtn && aiModal) {
    openAiModalBtn.addEventListener('click', () => {
      aiModal.style.display = 'flex';
      body.style.overflow = 'hidden';
    });
  }

  if (aiCloseBtn && aiModal) {
    aiCloseBtn.addEventListener('click', () => {
      aiModal.style.display = 'none';
      body.style.overflow = '';
    });
  }

  if (aiModal) {
    aiModal.addEventListener('click', (e) => {
      if (e.target === aiModal) {
        aiModal.style.display = 'none';
        body.style.overflow = '';
      }
    });
  }

  /* =========================
     THUMBNAIL UPLOAD
  ========================= */

  if (thumbnailBtn && thumbnailInput) {
    thumbnailBtn.addEventListener('click', () => {
      thumbnailInput.click();
    });
  }

  if (thumbnailInput && thumbPreview) {
    thumbnailInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      img.style.maxWidth = '100%';
      img.style.borderRadius = '12px';

      thumbPreview.innerHTML = '';
      thumbPreview.appendChild(img);
    });
  }

  /* =========================
     VIDEO UPLOAD
  ========================= */

  if (videoBtn && videoInput) {
    videoBtn.addEventListener('click', () => {
      videoInput.click();
    });
  }

  if (videoInput && videoPreview) {
    videoInput.addEventListener('change', (e) => {
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
  }

  /* =========================
     PREVIEW SUBMIT (핵심)
  ========================= */

  if (!writeForm) return;

  writeForm.addEventListener('submit', (e) => {
    e.preventDefault(); // 🔥 리셋 절대 방지

    const params = new URLSearchParams();

    params.set('category', document.getElementById('category')?.value || '');
    params.set('title', document.getElementById('title')?.value || '');
    params.set('oneLine', document.getElementById('oneLine')?.value || '');
    params.set('description', document.getElementById('description')?.value || '');
    params.set(
      'isAnonymous',
      document.getElementById('isAnonymous')?.checked ? '1' : '0'
    );

    if (thumbnailInput?.files[0]) {
      params.set('thumb', URL.createObjectURL(thumbnailInput.files[0]));
    }

    if (videoInput?.files[0]) {
      params.set('video', URL.createObjectURL(videoInput.files[0]));
    }

    // ✅ 리뷰 페이지로 이동
    location.href = `preview.html?${params.toString()}`;
  });

});