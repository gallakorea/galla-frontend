document.addEventListener('DOMContentLoaded', () => {

  const aiModal = document.getElementById('aiModal');
  const openAiModal = document.getElementById('openAiModal');
  const aiClose = document.getElementById('aiClose');

  const thumbnailBtn = document.getElementById('thumbnailBtn');
  const thumbnailInput = document.getElementById('thumbnail');
  const thumbPreview = document.getElementById('thumbPreview');

  const videoBtn = document.getElementById('videoBtn');
  const videoInput = document.getElementById('video');
  const videoPreview = document.getElementById('videoPreview');

  const previewBtn = document.getElementById('previewBtn');

  /* AI MODAL */
  openAiModal.onclick = () => aiModal.style.display = 'flex';
  aiClose.onclick = () => aiModal.style.display = 'none';

  /* FILE UPLOAD */
  thumbnailBtn.onclick = () => thumbnailInput.click();
  videoBtn.onclick = () => videoInput.click();

  thumbnailInput.onchange = e => {
    const img = document.createElement('img');
    img.src = URL.createObjectURL(e.target.files[0]);
    thumbPreview.innerHTML = '';
    thumbPreview.appendChild(img);
  };

  videoInput.onchange = e => {
    const v = document.createElement('video');
    v.src = URL.createObjectURL(e.target.files[0]);
    v.controls = true;
    videoPreview.innerHTML = '';
    videoPreview.appendChild(v);
  };

  /* PREVIEW */
  previewBtn.onclick = () => {
    sessionStorage.setItem('galla_preview', JSON.stringify({
      category: category.value,
      title: title.value,
      oneLine: oneLine.value,
      description: description.value,
      thumbnailUrl: thumbnailInput.files[0]
        ? URL.createObjectURL(thumbnailInput.files[0])
        : null,
      videoUrl: videoInput.files[0]
        ? URL.createObjectURL(videoInput.files[0])
        : null
    }));
    location.href = 'preview.html';
  };

});