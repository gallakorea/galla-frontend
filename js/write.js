/*************************************************
 * BASIC DOM
 *************************************************/
const body = document.body;
const form = document.getElementById('writeForm');

/* INPUTS */
const categoryEl = document.getElementById('category');
const titleEl = document.getElementById('title');
const oneLineEl = document.getElementById('oneLine');
const descEl = document.getElementById('description');
const anonEl = document.getElementById('isAnonymous');

/* PREVIEW ROOT */
let issuePreview = document.getElementById('issuePreview');
if (!issuePreview) {
  issuePreview = document.createElement('div');
  issuePreview.id = 'issuePreview';
  form.after(issuePreview);
}

/*************************************************
 * AI MODAL
 *************************************************/
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

/*************************************************
 * FILE UPLOAD
 *************************************************/
const thumbInput = document.getElementById('thumbnail');
const thumbBtn = document.getElementById('thumbnailBtn');
const thumbPreview = document.getElementById('thumbPreview');

thumbBtn.onclick = () => thumbInput.click();
thumbInput.onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  thumbPreview.innerHTML = `<img src="${URL.createObjectURL(f)}" />`;
};

const videoInput = document.getElementById('video');
const videoBtn = document.getElementById('videoBtn');
const videoPreview = document.getElementById('videoPreview');

videoBtn.onclick = () => videoInput.click();
videoInput.onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  videoPreview.innerHTML = `<video src="${URL.createObjectURL(f)}" muted></video>`;
};

/*************************************************
 * PREVIEW SUBMIT
 *************************************************/
form.onsubmit = e => {
  e.preventDefault();

  const category = categoryEl.value;
  const title = titleEl.value.trim();
  const oneLine = oneLineEl.value.trim();
  const desc = descEl.value.trim();
  const isAnon = anonEl.checked;

  if (!category || !title || !desc) {
    alert('카테고리 / 제목 / 설명은 필수');
    return;
  }

  const thumbImg = thumbPreview.querySelector('img');
  const videoEl = videoPreview.querySelector('video');

  issuePreview.innerHTML = `
    <section class="issue-preview">

      <div class="issue-meta">${category} · 방금 전</div>

      <h1 class="issue-title">${title}</h1>
      <p class="issue-one-line">${oneLine || ''}</p>
      <div class="issue-author">작성자 · ${isAnon ? '익명' : '사용자'}</div>

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
        <button type="button" id="editPreview">수정하기</button>
        <button type="button" class="btn-publish">발행하기</button>
      </div>
    </section>
  `;

  bindPreviewActions(videoEl);
  issuePreview.scrollIntoView({ behavior: 'smooth' });
};

/*************************************************
 * PREVIEW ACTIONS
 *************************************************/
function bindPreviewActions(videoEl) {
  const editBtn = document.getElementById('editPreview');
  if (editBtn) {
    editBtn.onclick = () => {
      issuePreview.innerHTML = '';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
  }

  if (videoEl) {
    const openBtn = document.getElementById('openSpeechBtn');
    if (openBtn) {
      openBtn.onclick = () => openSpeechModal(videoEl.src);
    }
  }
}

/*************************************************
 * SPEECH MODAL (동적 생성)
 *************************************************/
let speechModal;
let speechVideo;

function openSpeechModal(src) {
  if (!speechModal) {
    speechModal = document.createElement('div');
    speechModal.className = 'speech-backdrop';
    speechModal.innerHTML = `
      <div class="speech-sheet">
        <div class="speech-header">
          <span>1분 엘리베이터 스피치</span>
          <button id="closeSpeech">✕</button>
        </div>
        <div class="video-viewport">
          <video id="speechVideo" playsinline controls></video>
        </div>
      </div>
    `;
    document.body.appendChild(speechModal);

    document.getElementById('closeSpeech').onclick = closeSpeechModal;
    speechVideo = document.getElementById('speechVideo');
  }

  speechVideo.src = src;
  speechModal.style.display = 'flex';
  body.style.overflow = 'hidden';
  speechVideo.play();
}

function closeSpeechModal() {
  speechVideo.pause();
  speechModal.style.display = 'none';
  body.style.overflow = '';
}