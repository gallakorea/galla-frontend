document.addEventListener('DOMContentLoaded', () => {

  const body = document.body;
  const writeForm = document.getElementById('writeForm');

  /* =========================
     AI MODAL
  ========================= */

  const aiModal = document.getElementById('aiModal');
  const openAiModalBtn = document.getElementById('openAiModal');
  const aiCloseBtn = document.getElementById('aiClose');

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
     INPUTS
  ========================= */

  const category = document.getElementById('category');
  const title = document.getElementById('title');
  const oneLine = document.getElementById('oneLine');
  const description = document.getElementById('description');
  const isAnonymous = document.getElementById('isAnonymous');

  /* =========================
     FILE UPLOAD + PREVIEW
  ========================= */

  const thumbnailInput = document.getElementById('thumbnail');
  const thumbnailBtn = document.getElementById('thumbnailBtn');
  const thumbPreview = document.getElementById('thumbPreview');

  const videoInput = document.getElementById('video');
  const videoBtn = document.getElementById('videoBtn');
  const videoPreview = document.getElementById('videoPreview');

  thumbnailBtn?.addEventListener('click', () => thumbnailInput.click());
  videoBtn?.addEventListener('click', () => videoInput.click());

  thumbnailInput?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    img.style.width = '100%';
    img.style.maxHeight = '220px';
    img.style.objectFit = 'contain';
    img.style.borderRadius = '12px';

    thumbPreview.innerHTML = '';
    thumbPreview.appendChild(img);
  });

  videoInput?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const video = document.createElement('video');
    video.src = URL.createObjectURL(file);
    video.controls = true;
    video.style.width = '100%';
    video.style.maxHeight = '220px';
    video.style.objectFit = 'contain';
    video.style.borderRadius = '12px';

    videoPreview.innerHTML = '';
    videoPreview.appendChild(video);
  });

  /* =========================
     FILE → BASE64 (핵심)
  ========================= */

  function fileToBase64(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  }

  /* =========================
     PREVIEW SUBMIT (🔥 최종)
  ========================= */

  writeForm?.addEventListener('submit', async (e) => {
    e.preventDefault(); // ❌ 리셋 차단

    const previewData = {
      category: category.value,
      title: title.value,
      oneLine: oneLine.value,
      description: description.value,
      isAnonymous: isAnonymous.checked,
      createdAt: new Date().toISOString(),
      thumbnailBase64: null,
      videoBase64: null
    };

    if (thumbnailInput.files[0]) {
      previewData.thumbnailBase64 =
        await fileToBase64(thumbnailInput.files[0]);
    }

    if (videoInput.files[0]) {
      previewData.videoBase64 =
        await fileToBase64(videoInput.files[0]);
    }

    sessionStorage.setItem(
      'galla_preview',
      JSON.stringify(previewData)
    );

    location.href = 'preview.html';
  });

});