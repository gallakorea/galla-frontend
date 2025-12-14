/* =========================
   DOM ELEMENTS (단일 정의)
========================= */
const body = document.body;

const writeForm = document.getElementById('writeForm');
const issuePreview = document.getElementById('issuePreview');

// form fields
const categoryEl = document.getElementById('category');
const titleEl = document.getElementById('title');
const oneLineEl = document.getElementById('oneLine');
const descEl = document.getElementById('description');
const anonEl = document.getElementById('isAnonymous');

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

aiCloseBtn.addEventListener('click', closeAi);
aiModal.addEventListener('click', (e) => {
  if (e.target === aiModal) closeAi();
});

function closeAi() {
  aiModal.style.display = 'none';
  body.style.overflow = '';
}

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
  img.style.maxHeight = '240px';
  img.style.objectFit = 'cover';

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
   PREVIEW SUBMIT (단일 submit)
========================= */
writeForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const category = categoryEl.value;
  const title = titleEl.value;
  const oneLine = oneLineEl.value;
  const desc = descEl.value;
  const isAnon = anonEl.checked;

  if (!category || !title || !desc) {
    alert('카테고리 / 제목 / 설명은 필수입니다.');
    return;
  }

  const thumbImg = thumbPreview.querySelector('img');
  const videoEl = videoPreview.querySelector('video');

  const thumbHtml = thumbImg
    ? `<img class="preview-thumb-img" src="${thumbImg.src}" />`
    : '';

  const speechBtnHtml = videoEl
    ? `<button class="speech-btn" id="openSpeech">🎥 1분 엘리베이터 스피치</button>`
    : '';

  issuePreview.innerHTML = `
    <section class="issue-preview">
      <div style="font-size:12px;color:#aaa;">${category} · 방금 전</div>
      <h1 class="issue-title">${title}</h1>
      <p class="issue-one-line">${oneLine || ''}</p>
      <div class="issue-author">작성자 · ${isAnon ? '익명' : '사용자'}</div>

      ${thumbHtml}

      ${speechBtnHtml}

      <h3 style="margin-top:20px;">📝 이 주제에 대한 핵심 요약</h3>
      <p>${desc}</p>

      <div class="preview-actions">
        <button type="button" id="editPreview">수정하기</button>
        <button type="button" class="btn-publish">발행하기</button>
      </div>
    </section>
  `;

  // 수정하기
  document.getElementById('editPreview').onclick = () => {
    issuePreview.innerHTML = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 1분 스피치 모달
  if (videoEl) {
    bindSpeechModal(videoEl.src);
  }

  issuePreview.scrollIntoView({ behavior: 'smooth' });
});

/* =========================
   SPEECH MODAL
========================= */
function bindSpeechModal(videoSrc) {
  let speechModal = document.getElementById('speechModal');
  let speechVideo = document.getElementById('speechVideo');
  let closeSpeech = document.getElementById('closeSpeech');

  // 없으면 생성
  if (!speechModal) {
    const modalHtml = `
      <div id="speechModal" class="speech-backdrop">
        <div class="speech-sheet">
          <div class="speech-header">
            <span class="speech-title">1분 엘리베이터 스피치</span>
            <button id="closeSpeech">✕</button>
          </div>
          <video id="speechVideo" controls playsinline></video>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    speechModal = document.getElementById('speechModal');
    speechVideo = document.getElementById('speechVideo');
    closeSpeech = document.getElementById('closeSpeech');
  }

  document.getElementById('openSpeech').onclick = () => {
    speechVideo.src = videoSrc;
    speechModal.style.display = 'flex';
    speechVideo.play();
  };

  closeSpeech.onclick = closeSpeechModal;
  speechModal.onclick = (e) => {
    if (e.target === speechModal) closeSpeechModal();
  };

  function closeSpeechModal() {
    speechVideo.pause();
    speechVideo.src = '';
    speechModal.style.display = 'none';
  }
}