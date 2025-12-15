document.addEventListener('DOMContentLoaded', () => {
  const body = document.body;

  /* ===============================
     BASIC ELEMENTS
  =============================== */
  const categoryEl = document.getElementById('category');
  const titleEl = document.getElementById('title');
  const oneLineEl = document.getElementById('oneLine');
  const descEl = document.getElementById('description');
  const anonEl = document.getElementById('isAnonymous');

  const previewBtn = document.getElementById('previewBtn');
  const issuePreview = document.getElementById('issuePreview');

  /* ===============================
     AI MODAL
  =============================== */
  const aiModal = document.getElementById('aiModal');
  const openAiBtn = document.getElementById('openAiModal');
  const closeAiBtn = document.getElementById('aiClose');

  aiModal.style.display = 'none';

  openAiBtn.addEventListener('click', () => {
    aiModal.style.display = 'flex';
    body.style.overflow = 'hidden';
  });

  closeAiBtn.addEventListener('click', () => {
    aiModal.style.display = 'none';
    body.style.overflow = '';
  });

  /* ===============================
     FILE UPLOAD – THUMBNAIL
  =============================== */
  const thumbInput = document.getElementById('thumbnail');
  const thumbBtn = document.getElementById('thumbnailBtn');
  const thumbPreview = document.getElementById('thumbPreview');

  let thumbSrc = null;

  thumbBtn.addEventListener('click', () => thumbInput.click());

  thumbInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;

    thumbSrc = URL.createObjectURL(file);

    thumbPreview.innerHTML = `
      <div class="preview-media" data-preview="true">
        <img src="${thumbSrc}" class="preview-thumb-img">
      </div>
    `;
  });

  /* ===============================
     FILE UPLOAD – VIDEO
  =============================== */
  const videoInput = document.getElementById('video');
  const videoBtn = document.getElementById('videoBtn');
  const videoPreview = document.getElementById('videoPreview');

  let videoSrc = null;

  videoBtn.addEventListener('click', () => videoInput.click());

  videoInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;

    videoSrc = URL.createObjectURL(file);

    videoPreview.innerHTML = `
      <div class="preview-media" data-preview="true">
        <video src="${videoSrc}" muted playsinline></video>
      </div>
    `;
  });

  /* ===============================
     SPEECH VIDEO MODAL (🔥 JS ONLY)
  =============================== */
  let speechModal = null;
  let speechVideo = null;

  function createSpeechModal() {
    speechModal = document.createElement('div');
    speechModal.className = 'speech-backdrop';
    speechModal.style.display = 'none';

    speechModal.innerHTML = `
      <div class="speech-sheet">
        <div class="speech-header">
          <span>1분 엘리베이터 스피치</span>
          <button class="close-speech">닫기</button>
        </div>
        <div class="video-viewport">
          <video playsinline controls></video>
        </div>
      </div>
    `;

    document.body.appendChild(speechModal);
    speechVideo = speechModal.querySelector('video');

    speechModal.addEventListener('click', e => {
      if (e.target === speechModal || e.target.classList.contains('close-speech')) {
        closeSpeech();
      }
    });
  }

  function openSpeech(src) {
    if (!speechModal) createSpeechModal();

    speechVideo.src = src;
    speechModal.style.display = 'flex';
    body.style.overflow = 'hidden';
    speechVideo.currentTime = 0;
    speechVideo.play();
  }

  function closeSpeech() {
    if (!speechModal) return;
    speechVideo.pause();
    speechVideo.src = '';
    speechModal.style.display = 'none';
    body.style.overflow = '';
  }

  /* ===============================
     PREVIEW RENDER
  =============================== */
  previewBtn.addEventListener('click', () => {
    if (!categoryEl.value || !titleEl.value || !descEl.value) {
      alert('필수 항목을 입력하세요');
      return;
    }

    issuePreview.innerHTML = `
      <section class="issue-preview">

        <div class="issue-meta">${categoryEl.value} · 방금 전</div>
        <h1 class="issue-title">${titleEl.value}</h1>

        ${oneLineEl.value ? `<p class="issue-one-line">${oneLineEl.value}</p>` : ''}

        <div class="issue-author">
          작성자 · ${anonEl.checked ? '익명' : '사용자'}
        </div>

        ${
          thumbSrc
            ? `
            <div class="preview-media" data-preview="true">
              <img src="${thumbSrc}" class="preview-thumb-img">
            </div>
            `
            : ''
        }

        ${
          videoSrc
            ? `
            <button class="speech-btn" data-action="play-speech">
              🎥 1분 엘리베이터 스피치
            </button>
            `
            : ''
        }

        <section class="issue-summary">
          <h3>📝 이 주제에 대한 핵심 요약</h3>
          <p>${descEl.value}</p>
        </section>

        <div class="preview-actions">
          <button data-action="edit">수정하기</button>
          <button class="btn-publish">발행하기</button>
        </div>

      </section>
    `;

    issuePreview.scrollIntoView({ behavior: 'smooth' });
  });

  /* ===============================
     EVENT DELEGATION (🔥 핵심)
  =============================== */
  document.addEventListener('click', e => {
    const action = e.target.dataset.action;

    if (action === 'edit') {
      issuePreview.innerHTML = '';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    if (action === 'play-speech' && videoSrc) {
      openSpeech(videoSrc);
    }
  });
});