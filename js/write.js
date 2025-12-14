document.addEventListener('DOMContentLoaded', () => {

  const aiModal = document.getElementById('aiModal');
  const openAi = document.getElementById('openAiModal');
  const closeAi = document.getElementById('aiClose');

  openAi.onclick = () => {
    aiModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  };

  closeAi.onclick = () => {
    aiModal.style.display = 'none';
    document.body.style.overflow = '';
  };

  const thumbBtn = document.getElementById('thumbnailBtn');
  const thumbInput = document.getElementById('thumbnail');
  const thumbPreview = document.getElementById('thumbPreview');

  thumbBtn.onclick = () => thumbInput.click();
  thumbInput.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    thumbPreview.innerHTML = '';
    thumbPreview.appendChild(img);
  };

  const videoBtn = document.getElementById('videoBtn');
  const videoInput = document.getElementById('video');
  const videoPreview = document.getElementById('videoPreview');

  videoBtn.onclick = () => videoInput.click();
  videoInput.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const v = document.createElement('video');
    v.src = URL.createObjectURL(file);
    v.controls = true;
    videoPreview.innerHTML = '';
    videoPreview.appendChild(v);
  };

  document.getElementById('previewBtn').onclick = () => {
    const data = {
      category: category.value,
      title: title.value,
      oneLine: oneLine.value,
      description: description.value,
      isAnonymous: isAnonymous.checked,
      thumbnail: thumbInput.files[0] ? URL.createObjectURL(thumbInput.files[0]) : null,
      video: videoInput.files[0] ? URL.createObjectURL(videoInput.files[0]) : null
    };

    sessionStorage.setItem('galla_preview', JSON.stringify(data));
    location.href = 'preview.html';
  };

});