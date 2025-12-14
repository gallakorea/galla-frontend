document.addEventListener('DOMContentLoaded', () => {

  const body = document.body;

  const form = document.getElementById('writeForm');

  const aiModal = document.getElementById('aiModal');
  const openAiModalBtn = document.getElementById('openAiModal');
  const aiCloseBtn = document.getElementById('aiClose');

  const thumbnailInput = document.getElementById('thumbnail');
  const thumbnailBtn = document.getElementById('thumbnailBtn');
  const thumbPreview = document.getElementById('thumbPreview');

  const videoInput = document.getElementById('video');
  const videoBtn = document.getElementById('videoBtn');
  const videoPreview = document.getElementById('videoPreview');

  /* AI MODAL */
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

  /* FILE UPLOAD */
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

  /* PREVIEW SUBMIT */
  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const data = {
      category: category.value,
      title: title.value,
      oneLine: oneLine.value,
      description: description.value,
      isAnonymous: isAnonymous.checked,
      thumbnail: thumbnailInput.files[0]
        ? URL.createObjectURL(thumbnailInput.files[0])
        : null,
      video: videoInput.files[0]
        ? URL.createObjectURL(videoInput.files[0])
        : null
    };

    sessionStorage.setItem('galla_preview', JSON.stringify(data));
    location.href = 'preview.html';
  });

});