/**************************************************
 * DOM
 **************************************************/
const body = document.body;
const writeForm = document.getElementById('writeForm');

/* inputs */
const categoryEl = document.getElementById('category');
const titleEl = document.getElementById('title');
const oneLineEl = document.getElementById('oneLine');
const descEl = document.getElementById('description');
const anonEl = document.getElementById('isAnonymous');

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

/* PREVIEW */
const previewSection = document.getElementById('previewSection');
const previewCard = document.getElementById('previewCard');
const publishBtn = document.getElementById('publishBtn');

let previewPayload = null;

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

aiModal.addEventListener('click', e => {
  if (e.target === aiModal) {
    aiModal.style.display = 'none';
    body.style.overflow = '';
  }
});

/**************************************************
 * THUMBNAIL
 **************************************************/
thumbnailBtn.addEventListener('click', () => thumbnailInput.click());

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
videoBtn.addEventListener('click', () => videoInput.click());

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
 * 🔥 INLINE PREVIEW (핵심)
 **************************************************/
writeForm.addEventListener('submit', e => {
  e.preventDefault();

  const category = categoryEl.value;
  const title = titleEl.value.trim();
  const oneLine = oneLineEl.value.trim();
  const description = descEl.value.trim();
  const isAnonymous = anonEl.checked;

  if (!category || !title || !description) {
    alert('카테고리, 제목, 이슈 설명은 필수입니다.');
    return;
  }

  previewPayload = {
    category,
    title,
    oneLine,
    description,
    isAnonymous,
    thumbnailFile: thumbnailInput.files[0] || null,
    videoFile: videoInput.files[0] || null
  };

  renderPreview(previewPayload);
});

/**************************************************
 * PREVIEW RENDER
 **************************************************/
function renderPreview(data) {
  previewCard.innerHTML = `
    <div class="meta">
      ${data.category} · ${data.isAnonymous ? '익명 발의' : '실명 발의'}
    </div>
    <h3>${data.title}</h3>
    ${data.oneLine ? `<div class="meta">${data.oneLine}</div>` : ''}
    <div>${data.description.replace(/\n/g,'<br>')}</div>
  `;

  if (data.thumbnailFile) {
    const img = document.createElement('img');
    img.src = URL.createObjectURL(data.thumbnailFile);
    previewCard.appendChild(img);
  }

  if (data.videoFile) {
    const video = document.createElement('video');
    video.src = URL.createObjectURL(data.videoFile);
    video.controls = true;
    previewCard.appendChild(video);
  }

  previewSection.style.display = 'block';
  previewSection.scrollIntoView({ behavior:'smooth' });
}

/**************************************************
 * PUBLISH (다음 단계)
 **************************************************/
publishBtn.addEventListener('click', () => {
  if (!previewPayload) return;
  alert('발행 로직 연결 준비 완료');
});