document.addEventListener('DOMContentLoaded', () => {
  const body = document.body;

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

  openAiModalBtn.onclick = () => {
    aiModal.style.display = 'flex';
    body.style.overflow = 'hidden';
  };
  aiCloseBtn.onclick = () => {
    aiModal.style.display = 'none';
    body.style.overflow = '';
  };
  aiModal.onclick = (e) => {
    if (e.target === aiModal) {
      aiModal.style.display = 'none';
      body.style.overflow = '';
    }
  };

  thumbnailBtn.onclick = () => thumbnailInput.click();
  videoBtn.onclick = () => videoInput.click();

  thumbnailInput.onchange = (e) => {
    const f = e.target.files[0]; if (!f) return;
    const img = document.createElement('img');
    img.src = URL.createObjectURL(f);
    thumbPreview.innerHTML = '';
    thumbPreview.appendChild(img);
  };

  videoInput.onchange = (e) => {
    const f = e.target.files[0]; if (!f) return;
    const v = document.createElement('video');
    v.src = URL.createObjectURL(f);
    v.controls = true;
    videoPreview.innerHTML = '';
    videoPreview.appendChild(v);
  };

  const fileToBase64 = (file) => new Promise(res => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.readAsDataURL(file);
  });

  previewBtn.onclick = async () => {
    if (!category.value || !title.value || !description.value) return;

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

    if (thumbnailInput.files[0]) data.thumbnailBase64 = await fileToBase64(thumbnailInput.files[0]);
    if (videoInput.files[0]) data.videoBase64 = await fileToBase64(videoInput.files[0]);

    sessionStorage.setItem('galla_preview', JSON.stringify(data));
    location.href = 'preview.html';
  };
});