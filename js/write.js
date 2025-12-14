/* =========================
   WRITE PAGE FINAL JS
   버튼 클릭 무조건 작동
========================= */

window.goPreview = async function () {
  console.log('🔥 미리보기 버튼 클릭됨');

  const category = document.getElementById('category')?.value || '';
  const title = document.getElementById('title')?.value || '';
  const oneLine = document.getElementById('oneLine')?.value || '';
  const description = document.getElementById('description')?.value || '';
  const isAnonymous = document.getElementById('isAnonymous')?.checked || false;

  const thumbnailInput = document.getElementById('thumbnail');
  const videoInput = document.getElementById('video');

  function fileToBase64(file) {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  }

  const data = {
    category,
    title,
    oneLine,
    description,
    isAnonymous,
    createdAt: new Date().toISOString(),
    thumbnailBase64: null,
    videoBase64: null
  };

  if (thumbnailInput?.files[0]) {
    data.thumbnailBase64 = await fileToBase64(thumbnailInput.files[0]);
  }

  if (videoInput?.files[0]) {
    data.videoBase64 = await fileToBase64(videoInput.files[0]);
  }

  sessionStorage.setItem('galla_preview', JSON.stringify(data));

  console.log('➡️ preview.html 이동');
  location.href = 'preview.html';
};

/* =========================
   FILE PREVIEW
========================= */

document.addEventListener('DOMContentLoaded', () => {

  const thumbInput = document.getElementById('thumbnail');
  const thumbBtn = document.getElementById('thumbnailBtn');
  const thumbPreview = document.getElementById('thumbPreview');

  const videoInput = document.getElementById('video');
  const videoBtn = document.getElementById('videoBtn');
  const videoPreview = document.getElementById('videoPreview');

  thumbBtn?.addEventListener('click', () => thumbInput.click());
  videoBtn?.addEventListener('click', () => videoInput.click());

  thumbInput?.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    img.style.width = '100%';
    thumbPreview.innerHTML = '';
    thumbPreview.appendChild(img);
  });

  videoInput?.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const video = document.createElement('video');
    video.src = URL.createObjectURL(file);
    video.controls = true;
    video.style.width = '100%';
    videoPreview.innerHTML = '';
    videoPreview.appendChild(video);
  });

});