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

/* PREVIEW */
const issuePreview = document.getElementById('issuePreview');

let thumbFile = null;
let videoFile = null;

/**************************************************
 * AI MODAL
 **************************************************/
openAiModalBtn.addEventListener('click', () => {
  aiModal.style.display = 'flex';
  body.style.overflow = 'hidden';
});

aiCloseBtn.addEventListener('click', closeAiModal);
aiModal.addEventListener('click', (e) => {
  if (e.target === aiModal) closeAiModal();
});

function closeAiModal() {
  aiModal.style.display = 'none';
  body.style.overflow = '';
}

/**************************************************
 * THUMBNAIL
 **************************************************/
thumbnailBtn.addEventListener('click', () => thumbnailInput.click());

thumbnailInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  thumbFile = file;

  thumbPreview.innerHTML = '';
  const img = document.createElement('img');
  img.src = URL.createObjectURL(file);
  thumbPreview.appendChild(img);
});

/**************************************************
 * VIDEO
 **************************************************/
videoBtn.addEventListener('click', () => videoInput.click());

videoInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  videoFile = file;

  videoPreview.innerHTML = '';
  const video = document.createElement('video');
  video.src = URL.createObjectURL(file);
  video.controls = true;
  videoPreview.appendChild(video);
});

/**************************************************
 * 🔥 미리보기 SUBMIT — ISSUE 카드 렌더링
 **************************************************/
writeForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const category = document.getElementById('category').value;
  const title = document.getElementById('title').value.trim();
  const oneLine = document.getElementById('oneLine').value.trim();
  const description = document.getElementById('description').value.trim();
  const isAnonymous = document.getElementById('isAnonymous').checked;

  if (!category || !title || !description) {
    alert('카테고리, 제목, 이슈 설명은 필수입니다.');
    return;
  }

  renderIssuePreview({
    category,
    title,
    oneLine,
    description,
    isAnonymous,
    thumbFile,
    videoFile,
  });
});

/**************************************************
 * ISSUE PREVIEW RENDER
 **************************************************/
function renderIssuePreview(data) {
  const {
    category,
    title,
    oneLine,
    description,
    isAnonymous,
    thumbFile,
    videoFile,
  } = data;

  const authorText = isAnonymous ? '작성자 · 익명' : `작성자 · ${oneLine || '발의자'}`;
  const thumbUrl = thumbFile ? URL.createObjectURL(thumbFile) : '';
  const videoUrl = videoFile ? URL.createObjectURL(videoFile) : '';

  issuePreview.innerHTML = `
    <section class="issue-hero">
      <div class="issue-category-time">
        <span>${category}</span>
        <span>방금 전</span>
      </div>

      <h1>${title}</h1>
      <p>${description}</p>

      <div class="issue-author">
        <span>${authorText}</span>
        <button class="follow-btn">+ 팔로우</button>
      </div>
    </section>

    ${thumbUrl ? `<img src="${thumbUrl}" class="issue-thumb" />` : ''}

    ${videoUrl ? `
      <button class="speech-btn" disabled>
        🎥 1분 엘리베이터 스피치 (미리보기)
      </button>
    ` : ''}

    <section class="issue-explain">
      <h3 class="white-title">📝 이 주제에 대한 핵심 요약</h3>
      <p>${description}</p>
    </section>

    <section class="vote-section">
      <div class="vote-title white-title">👍 찬반 투표 현황</div>
      <div class="vote-bar">
        <div class="vote-pro" style="width:50%"></div>
        <div class="vote-con" style="width:50%"></div>
      </div>
      <div class="vote-percent">
        <span>50%</span>
        <span>50%</span>
      </div>
      <div class="vote-buttons">
        <button class="btn-pro" disabled>👍 찬성이오</button>
        <button class="btn-con" disabled>👎 난 반댈세</button>
      </div>
    </section>
  `;

  issuePreview.scrollIntoView({ behavior: 'smooth' });
}