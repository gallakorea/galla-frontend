document.addEventListener('DOMContentLoaded', () => {

  const body = document.body;

  /* =========================
     AI MODAL
  ========================= */
  const aiModal = document.getElementById('aiModal');
  const openAiModalBtn = document.getElementById('openAiModal');
  const aiCloseBtn = document.getElementById('aiClose');

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
     FILE PREVIEW
  ========================= */
  const thumbnailInput = document.getElementById('thumbnail');
  const thumbnailBtn = document.getElementById('thumbnailBtn');
  const thumbPreview = document.getElementById('thumbPreview');

  const videoInput = document.getElementById('video');
  const videoBtn = document.getElementById('videoBtn');
  const videoPreview = document.getElementById('videoPreview');

  thumbnailBtn.addEventListener('click', () => thumbnailInput.click());
  videoBtn.addEventListener('click', () => videoInput.click());

  thumbnailInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    thumbPreview.innerHTML = '';
    thumbPreview.appendChild(img);
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
     PREVIEW BUTTON (🔥 핵심)
  ========================= */
  const previewBtn = document.getElementById('previewBtn');

  previewBtn.addEventListener('click', async () => {

    const fileToBase64 = (file) =>
      new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });

    const data = {
      category: document.getElementById('category').value,
      title: document.getElementById('title').value,
      oneLine: document.getElementById('oneLine').value,
      description: document.getElementById('description').value,
      isAnonymous: document.getElementById('isAnonymous').checked,
      createdAt: new Date().toISOString(),
      thumbnailBase64: null,
      videoBase64: null
    };

    if (thumbnailInput.files[0]) {
      data.thumbnailBase64 = await fileToBase64(thumbnailInput.files[0]);
    }
    if (videoInput.files[0]) {
      data.videoBase64 = await fileToBase64(videoInput.files[0]);
    }

    sessionStorage.setItem('galla_preview', JSON.stringify(data));

    // ✅ 여기서만 이동
    window.location.href = 'preview.html';
  });

});