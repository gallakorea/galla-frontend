document.addEventListener('DOMContentLoaded', () => {

  const previewBtn = document.getElementById('previewBtn');

  const category = document.getElementById('category');
  const title = document.getElementById('title');
  const oneLine = document.getElementById('oneLine');
  const description = document.getElementById('description');
  const isAnonymous = document.getElementById('isAnonymous');

  const thumbnailInput = document.getElementById('thumbnail');
  const videoInput = document.getElementById('video');

  const thumbnailBtn = document.getElementById('thumbnailBtn');
  const videoBtn = document.getElementById('videoBtn');
  const thumbPreview = document.getElementById('thumbPreview');
  const videoPreview = document.getElementById('videoPreview');

  const aiModal = document.getElementById('aiModal');
  const openAiModalBtn = document.getElementById('openAiModal');
  const aiCloseBtn = document.getElementById('aiClose');

  /* =========================
     AI MODAL
  ========================= */
  openAiModalBtn.onclick = () => {
    aiModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  };

  aiCloseBtn.onclick = () => {
    aiModal.style.display = 'none';
    document.body.style.overflow = '';
  };

  aiModal.onclick = (e) => {
    if (e.target === aiModal) {
      aiModal.style.display = 'none';
      document.body.style.overflow = '';
    }
  };

  /* =========================
     FILE PREVIEW
  ========================= */
  thumbnailBtn.onclick = () => thumbnailInput.click();
  videoBtn.onclick = () => videoInput.click();

  thumbnailInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    thumbPreview.innerHTML = '';
    thumbPreview.appendChild(img);
  };

  videoInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const video = document.createElement('video');
    video.src = URL.createObjectURL(file);
    video.controls = true;
    videoPreview.innerHTML = '';
    videoPreview.appendChild(video);
  };

  /* =========================
     BASE64 (썸네일만)
  ========================= */
  const fileToBase64 = (file) =>
    new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });

  /* =========================
     PREVIEW CLICK (🔥 핵심 수정)
  ========================= */
  previewBtn.onclick = async () => {

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

      // ✅ 썸네일은 base64 OK
      thumbnailBase64: null,

      // 🔥 영상은 base64 ❌
      videoPreviewUrl: null
    };

    if (thumbnailInput.files[0]) {
      data.thumbnailBase64 = await fileToBase64(thumbnailInput.files[0]);
    }

    if (videoInput.files[0]) {
      // 🔥 핵심: sessionStorage-safe
      data.videoPreviewUrl = URL.createObjectURL(videoInput.files[0]);
    }

    try {
      sessionStorage.setItem('galla_preview', JSON.stringify(data));
    } catch (e) {
      alert('파일이 너무 큽니다. 영상 용량을 줄여주세요.');
      return;
    }

    location.href = 'preview.html';
  };

});