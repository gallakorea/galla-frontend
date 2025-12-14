/**************************************************
 * DOM
 **************************************************/
const body = document.body;
const writeForm = document.getElementById('writeForm');

/* AI MODAL */
const aiModal = document.getElementById('aiModal');
const openAiModalBtn = document.getElementById('openAiModal');
const aiCloseBtn = document.getElementById('aiClose');

/* FILE */
const thumbnailInput = document.getElementById('thumbnail');
const thumbnailBtn = document.getElementById('thumbnailBtn');
const thumbPreview = document.getElementById('thumbPreview');

const videoInput = document.getElementById('video');
const videoBtn = document.getElementById('videoBtn');
const videoPreview = document.getElementById('videoPreview');

/**************************************************
 * AI MODAL
 **************************************************/
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

/**************************************************
 * THUMBNAIL
 **************************************************/
thumbnailBtn.addEventListener('click', () => {
  thumbnailInput.click();
});

thumbnailInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;

  thumbPreview.innerHTML = '';
  const img = document.createElement('img');
  img.src = URL.createObjectURL(file);
  thumbPreview.appendChild(img);
});

/**************************************************
 * VIDEO
 **************************************************/
videoBtn.addEventListener('click', () => {
  videoInput.click();
});

videoInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;

  videoPreview.innerHTML = '';
  const video = document.createElement('video');
  video.src = URL.createObjectURL(file);
  video.controls = true;
  videoPreview.appendChild(video);
});

/**************************************************
 * ✅ 미리보기 SUBMIT — 완전 안전 버전
 **************************************************/
writeForm.addEventListener('submit', (e) => {
  e.preventDefault(); // 기본 submit 차단

  const data = {
    category: document.getElementById('category').value,
    title: document.getElementById('title').value,
    oneLine: document.getElementById('oneLine').value,
    description: document.getElementById('description').value,
    isAnonymous: document.getElementById('isAnonymous').checked,
  };

  // 필수값 체크
  if (!data.category || !data.title || !data.description) {
    alert('카테고리, 제목, 이슈 설명은 필수입니다.');
    return;
  }

  // 🔥 storage 안전 저장 (localStorage → sessionStorage → 메모리)
  try {
    localStorage.setItem('galla_preview', JSON.stringify(data));
  } catch (err) {
    try {
      sessionStorage.setItem('galla_preview', JSON.stringify(data));
    } catch (e) {
      window.__GALLA_PREVIEW__ = data;
    }
  }

  // 🔥 무조건 이동
  location.href = 'preview.html';
});