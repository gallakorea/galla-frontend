/***************************************************
 * BASIC
 ***************************************************/
const body = document.body;
const form = document.getElementById('writeForm');
const issuePreview = document.getElementById('issuePreview');

/***************************************************
 * STATE
 ***************************************************/
let thumbnailSrc = null;
let videoSrc = null;

/***************************************************
 * AI MODAL
 ***************************************************/
const aiModal = document.getElementById('aiModal');
document.getElementById('openAiModal')?.addEventListener('click', () => {
  aiModal.style.display = 'flex';
  body.style.overflow = 'hidden';
});
document.getElementById('aiClose')?.addEventListener('click', () => {
  aiModal.style.display = 'none';
  body.style.overflow = '';
});

/***************************************************
 * THUMBNAIL UPLOAD
 ***************************************************/
const thumbInput = document.getElementById('thumbnail');
document.getElementById('thumbnailBtn')?.addEventListener('click', () => {
  thumbInput.click();
});

thumbInput?.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  thumbnailSrc = URL.createObjectURL(file);
});

/***************************************************
 * VIDEO UPLOAD
 ***************************************************/
const videoInput = document.getElementById('video');
document.getElementById('videoBtn')?.addEventListener('click', () => {
  videoInput.click();
});

videoInput?.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  videoSrc = URL.createObjectURL(file);
});

/***************************************************
 * PREVIEW RENDER
 ***************************************************/
form.addEventListener('submit', e => {
  e.preventDefault();

  const category = document.getElementById('category').value.trim();
  const title = document.getElementById('title').value.trim();
  const oneLine = document.getElementById('oneLine').value.trim();
  const desc = document.getElementById('description').value.trim();
  const anon = document.getElementById('isAnonymous').checked;

  if (!category || !title || !desc) {
    alert('필수 항목을 입력하세요');
    return;
  }

  // 🔥 기존 미리보기 완전 제거
  issuePreview.innerHTML = '';

  // 🔥 썸네일 HTML (있을 때만)
  const thumbnailHTML = thumbnailSrc
    ? `
      <img
        src="${thumbnailSrc}"
        class="preview-thumb-img"
        alt="미리보기 썸네일"
      />
    `
    : '';

  // 🔥 스피치 버튼 (영상 있을 때만)
  const speechBtnHTML = videoSrc
    ? `
      <button class="speech-btn" id="openSpeech">
        🎥 1분 엘리베이터 스피치
      </button>
    `
    : '';

  issuePreview.innerHTML = `
    <section class="issue-preview">

      <div class="issue-meta">${category} · 방금 전</div>
      <h1 class="issue-title">${title}</h1>

      ${oneLine ? `<p class="issue-one-line">${oneLine}</p>` : ''}

      <div class="issue-author">
        작성자 · ${anon ? '익명' : '사용자'}
      </div>

      ${thumbnailHTML}

      ${speechBtnHTML}

      <section class="issue-summary">
        <h3>📝 이 주제에 대한 핵심 요약</h3>
        <p>${desc}</p>
      </section>

      <div class="preview-actions">
        <button id="editPreview">수정하기</button>
        <button class="btn-publish">발행하기</button>
      </div>

    </section>
  `;

  /***************************************************
   * EDIT PREVIEW
   ***************************************************/
  document.getElementById('editPreview')?.addEventListener('click', () => {
    issuePreview.innerHTML = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  /***************************************************
   * SPEECH MODAL (9:16)
   ***************************************************/
  if (videoSrc) {
    document.getElementById('openSpeech')?.addEventListener('click', () => {
      openSpeechModal(videoSrc);
    });
  }

  issuePreview.scrollIntoView({ behavior: 'smooth' });
});

/***************************************************
 * SPEECH MODAL (FINAL)
 ***************************************************/
function openSpeechModal(src) {
  let modal = document.getElementById('speechModal');

  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'speechModal';
    modal.className = 'speech-backdrop';
    modal.innerHTML = `
      <div class="speech-sheet">
        <div style="text-align:right; margin-bottom:8px;">
          <button id="closeSpeech" class="btn-sub">닫기</button>
        </div>
        <div class="video-viewport">
          <video id="speechVideo" controls playsinline></video>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  const video = modal.querySelector('#speechVideo');
  video.src = src;
  video.currentTime = 0;

  modal.style.display = 'flex';
  body.style.overflow = 'hidden';

  modal.querySelector('#closeSpeech').onclick = () => {
    video.pause();
    modal.style.display = 'none';
    body.style.overflow = '';
  };
}