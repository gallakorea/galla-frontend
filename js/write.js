/* =========================
   WRITE PAGE FINAL JS (FIXED)
========================= */

/* ---------- AI MODAL ---------- */
document.addEventListener('DOMContentLoaded', () => {

  const body = document.body;

  const aiModal = document.getElementById('aiModal');
  const openAiModalBtn = document.getElementById('openAiModal');
  const aiCloseBtn = document.getElementById('aiClose');

  // ✅ AI 모달 열기
  openAiModalBtn?.addEventListener('click', () => {
    aiModal.style.display = 'flex';
    body.style.overflow = 'hidden';
  });

  // ✅ AI 모달 닫기
  aiCloseBtn?.addEventListener('click', () => {
    aiModal.style.display = 'none';
    body.style.overflow = '';
  });

  // 배경 클릭 시 닫기
  aiModal?.addEventListener('click', (e) => {
    if (e.target === aiModal) {
      aiModal.style.display = 'none';
      body.style.overflow = '';
    }
  });

  /* ---------- FILE PREVIEW ---------- */
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
    img.style.borderRadius = '12px';

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
    video.style.borderRadius = '12px';

    videoPreview.innerHTML = '';
    videoPreview.appendChild(video);
  });

});

/* ---------- PREVIEW 이동 (전역) ---------- */
window.goPreview = async function () {
  console.log('🔥 미리보기 버튼 클릭됨');

  const data = {
    category: document.getElementById('category')?.value || '',
    title: document.getElementById('title')?.value || '',
    oneLine: document.getElementById('oneLine')?.value || '',
    description: document.getElementById('description')?.value || '',
    isAnonymous: document.getElementById('isAnonymous')?.checked || false,
    createdAt: new Date().toISOString(),
    thumbnailBase64: null,
    videoBase64: null
  };

  const thumbFile = document.getElementById('thumbnail')?.files[0];
  const videoFile = document.getElementById('video')?.files[0];

  const fileToBase64 = file =>
    new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });

  if (thumbFile) data.thumbnailBase64 = await fileToBase64(thumbFile);
  if (videoFile) data.videoBase64 = await fileToBase64(videoFile);

  sessionStorage.setItem('galla_preview', JSON.stringify(data));

  location.href = 'preview.html';
};