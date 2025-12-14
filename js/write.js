document.addEventListener('DOMContentLoaded', () => {

  /* =========================
     ELEMENTS
  ========================= */

  const previewBtn = document.getElementById('previewBtn');

  const category = document.getElementById('category');
  const title = document.getElementById('title');
  const oneLine = document.getElementById('oneLine');
  const description = document.getElementById('description');
  const isAnonymous = document.getElementById('isAnonymous');

  const thumbnailInput = document.getElementById('thumbnail');
  const thumbnailBtn = document.getElementById('thumbnailBtn');
  const thumbPreview = document.getElementById('thumbPreview');

  const videoInput = document.getElementById('video');
  const videoBtn = document.getElementById('videoBtn');
  const videoPreview = document.getElementById('videoPreview');

  const aiModal = document.getElementById('aiModal');
  const openAiModalBtn = document.getElementById('openAiModal');
  const aiCloseBtn = document.getElementById('aiClose');

  /* =========================
     AI MODAL
  ========================= */

  openAiModalBtn.addEventListener('click', () => {
    aiModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  });

  aiCloseBtn.addEventListener('click', () => {
    aiModal.style.display = 'none';
    document.body.style.overflow = '';
  });

  aiModal.addEventListener('click', (e) => {
    if (e.target === aiModal) {
      aiModal.style.display = 'none';
      document.body.style.overflow = '';
    }
  });

  /* =========================
     FILE PREVIEW
  ========================= */

  thumbnailBtn.addEventListener('click', () => thumbnailInput.click());
  videoBtn.addEventListener('click', () => videoInput.click());

  thumbnailInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    thumbPreview.innerHTML = '';
    thumbPreview.appendChild(img);
  });

  videoInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const video = document.createElement('video');
    video.src = URL.createObjectURL(file);
    video.controls = true;
    videoPreview.innerHTML = '';
    videoPreview.appendChild(video);
  });

  /* =========================
     FILE → BASE64
  ========================= */

  function fileToBase64(file) {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  }

  /* =========================
     PREVIEW (🔥 핵심)
  ========================= */

  previewBtn.addEventListener('click', async () => {

    if (!category.value || !title.value || !description.value) {
      alert('카테고리, 제목, 이슈 설명은 필수입니다.');
      return;
    }

    const data = {
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
      data.thumbnailBase64 = await fileToBase64(thumbnailInput.files[0]);
    }

    if (videoInput.files[0]) {
      data.videoBase64 = await fileToBase64(videoInput.files[0]);
    }

    sessionStorage.setItem('galla_preview', JSON.stringify(data));

    /* ✅ 여기서 무조건 이동 */
    window.location.href = 'preview.html';
  });

});