/* =========================
   DOM ELEMENTS
========================= */
const body = document.body;

const writeForm = document.getElementById('writeForm');
const issuePreview = document.getElementById('issuePreview');

// AI Modal
const aiModal = document.getElementById('aiModal');
const openAiModalBtn = document.getElementById('openAiModal');
const aiCloseBtn = document.getElementById('aiClose');

// Thumbnail
const thumbnailInput = document.getElementById('thumbnail');
const thumbnailBtn = document.getElementById('thumbnailBtn');
const thumbPreview = document.getElementById('thumbPreview');

// Video
const videoInput = document.getElementById('video');
const videoBtn = document.getElementById('videoBtn');
const videoPreview = document.getElementById('videoPreview');

/* =========================
   AI MODAL
========================= */
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
   FILE UPLOAD
========================= */
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
   PREVIEW SUBMIT
========================= */
writeForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const category = document.getElementById('category').value;
  const title = document.getElementById('title').value;
  const oneLine = document.getElementById('oneLine').value;
  const desc = document.getElementById('description').value;

  if (!category || !title || !desc) {
    alert('카테고리 / 제목 / 설명은 필수입니다.');
    return;
  }

  const thumbImg = thumbPreview.querySelector('img');
  const thumbHtml = thumbImg
    ? `<div class="preview-thumb"><img src="${thumbImg.src}" /></div>`
    : '';

  issuePreview.innerHTML = `
    <div class="preview-issue">
      ${thumbHtml}

      <div class="preview-header">
        <div style="font-size:12px;color:#aaa;">${category}</div>
        <h2 style="margin:8px 0;">${title}</h2>
        <p style="color:#ccc;font-size:14px;">${oneLine}</p>
      </div>

      <div style="padding:16px;font-size:14px;line-height:1.6;">
        ${desc}
      </div>

      <div class="preview-actions">
        <button type="button" class="btn-edit" id="editPreview">수정하기</button>
        <button type="button" class="btn-publish">발행하기</button>
      </div>
    </div>
  `;

  // 수정하기
  document.getElementById('editPreview').addEventListener('click', () => {
    issuePreview.innerHTML = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
});