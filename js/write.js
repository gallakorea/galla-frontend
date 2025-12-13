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

  if (thumbnailInput) {
    thumbnailInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);

      thumbPreview.innerHTML = '<div>미리보기</div>';
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

  if (videoInput) {
    videoInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const video = document.createElement('video');
      video.src = URL.createObjectURL(file);
      video.controls = true;

      videoPreview.innerHTML = '<div>미리보기</div>';
      videoPreview.appendChild(video);
    });
  }

  /* =========================
     PREVIEW SUBMIT
  ========================= */

  if (!writeForm) return;

  writeForm.addEventListener('submit', (e) => {
    e.preventDefault(); // 🔥 리셋 방지

    const previewData = {
      category: document.getElementById('category')?.value || '',
      title: document.getElementById('title')?.value || '',
      oneLine: document.getElementById('oneLine')?.value || '',
      description: document.getElementById('description')?.value || '',
      isAnonymous: document.getElementById('isAnonymous')?.checked || false,

      thumbnailUrl: thumbnailInput?.files[0]
        ? URL.createObjectURL(thumbnailInput.files[0])
        : null,

      videoUrl: videoInput?.files[0]
        ? URL.createObjectURL(videoInput.files[0])
        : null,

      createdAt: new Date().toISOString()
    };

    sessionStorage.setItem(
      'galla_preview',
      JSON.stringify(previewData)
    );

    // ✅ 정상 이동
    location.href = 'preview.html';
  });

});