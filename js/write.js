/***************************************************
 * GLOBAL
 ***************************************************/
const body = document.body;
const form = document.getElementById('writeForm');

/***************************************************
 * AI MODAL
 ***************************************************/
const aiModal = document.getElementById('aiModal');
const openAiBtn = document.getElementById('openAiModal');
const closeAiBtn = document.getElementById('aiClose');

openAiBtn.onclick = () => {
  aiModal.style.display = 'flex';
  body.style.overflow = 'hidden';
};

closeAiBtn.onclick = () => {
  aiModal.style.display = 'none';
  body.style.overflow = '';
};

/***************************************************
 * FILE UPLOAD — THUMBNAIL
 ***************************************************/
const thumbInput = document.getElementById('thumbnail');
const thumbBtn = document.getElementById('thumbnailBtn');
const thumbPreview = document.getElementById('thumbPreview');

thumbBtn.onclick = () => thumbInput.click();

thumbInput.onchange = e => {
  const file = e.target.files[0];
  if (!file) return;

  thumbPreview.innerHTML = `
    <img src="${URL.createObjectURL(file)}" class="preview-thumb-img">
  `;
};

/***************************************************
 * FILE UPLOAD — VIDEO
 ***************************************************/
const videoInput = document.getElementById('video');
const videoBtn = document.getElementById('videoBtn');
const videoPreview = document.getElementById('videoPreview');

videoBtn.onclick = () => videoInput.click();

videoInput.onchange = e => {
  const file = e.target.files[0];
  if (!file) return;

  videoPreview.innerHTML = `
    <video src="${URL.createObjectURL(file)}" muted playsinline></video>
  `;
};

/***************************************************
 * PREVIEW (INLINE ISSUE STYLE)
 ***************************************************/
form.onsubmit = e => {
  e.preventDefault();

  const category = document.getElementById('category').value;
  const title = document.getElementById('title').value.trim();
  const oneLine = document.getElementById('oneLine').value.trim();
  const desc = document.getElementById('description').value.trim();
  const anon = document.getElementById('isAnonymous').checked;

  if (!category || !title || !desc) {
    alert('카테고리, 제목, 이슈 설명은 필수입니다.');
    return;
  }

  // 기존 미리보기 제거
  const oldPreview = document.querySelector('.issue-preview');
  if (oldPreview) oldPreview.remove();

  const thumbImg = thumbPreview.querySelector('img');
  const videoEl = videoPreview.querySelector('video');

  const preview = document.createElement('section');
  preview.className = 'issue-preview';

  preview.innerHTML = `
    <div class="issue-meta">${category} · 방금 전</div>
    <h1 class="issue-title">${title}</h1>
    ${oneLine ? `<p class="issue-one-line">${oneLine}</p>` : ''}
    <div class="issue-author">작성자 · ${anon ? '익명' : '사용자'}</div>

    ${thumbImg ? `<img src="${thumbImg.src}" class="preview-thumb-img">` : ''}

    ${videoEl ? `
      <button class="speech-btn" id="openSpeechBtn">
        🎥 1분 엘리베이터 스피치
      </button>
    ` : ''}

    <section class="issue-summary">
      <h3>📝 이 주제에 대한 핵심 요약</h3>
      <p>${desc}</p>
    </section>

    <div class="preview-actions">
      <button id="editPreviewBtn">수정하기</button>
      <button class="btn-publish">발행하기</button>
    </div>
  `;

  // form 아래에 삽입
  form.parentElement.appendChild(preview);

  // 수정하기
  document.getElementById('editPreviewBtn').onclick = () => {
    preview.remove();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 스크롤 이동
  preview.scrollIntoView({ behavior: 'smooth' });
};