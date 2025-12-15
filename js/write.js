/***************************************************
 * BASIC
 ***************************************************/
document.addEventListener('DOMContentLoaded', () => {
  const body = document.body;

  const form = document.getElementById('writeForm');
  const issuePreview = document.getElementById('issuePreview');

  const categoryEl = document.getElementById('category');
  const titleEl = document.getElementById('title');
  const oneLineEl = document.getElementById('oneLine');
  const descEl = document.getElementById('description');
  const anonEl = document.getElementById('isAnonymous');

  /***************************************************
   * AI MODAL (절대 자동 오픈 금지)
   ***************************************************/
  const aiModal = document.getElementById('aiModal');
  const openAiBtn = document.getElementById('openAiModal');
  const closeAiBtn = document.getElementById('aiClose');

  if (aiModal) {
    aiModal.style.display = 'none';
  }

  if (openAiBtn) {
    openAiBtn.addEventListener('click', () => {
      aiModal.style.display = 'flex';
      body.style.overflow = 'hidden';
    });
  }

  if (closeAiBtn) {
    closeAiBtn.addEventListener('click', () => {
      aiModal.style.display = 'none';
      body.style.overflow = '';
    });
  }

  /***************************************************
   * FILE UPLOAD – THUMBNAIL
   ***************************************************/
  const thumbInput = document.getElementById('thumbnail');
  const thumbBtn = document.getElementById('thumbnailBtn');
  const thumbPreview = document.getElementById('thumbPreview');

  let thumbSrc = null;

  if (thumbBtn) {
    thumbBtn.addEventListener('click', () => thumbInput.click());
  }

  if (thumbInput) {
    thumbInput.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;

      thumbSrc = URL.createObjectURL(file);

      thumbPreview.innerHTML = `
        <div class="preview-box is-preview">
          <img src="${thumbSrc}" class="preview-thumb-img" />
        </div>
      `;
    });
  }

  /***************************************************
   * FILE UPLOAD – VIDEO
   ***************************************************/
  const videoInput = document.getElementById('video');
  const videoBtn = document.getElementById('videoBtn');
  const videoPreview = document.getElementById('videoPreview');

  let videoSrc = null;

  if (videoBtn) {
    videoBtn.addEventListener('click', () => videoInput.click());
  }

  if (videoInput) {
    videoInput.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;

      videoSrc = URL.createObjectURL(file);

      videoPreview.innerHTML = `
        <div class="preview-box is-preview">
          <video src="${videoSrc}" muted playsinline></video>
        </div>
      `;
    });
  }

  /***************************************************
   * SPEECH VIDEO MODAL (9:16 ONLY)
   ***************************************************/
  let speechModal = null;
  let speechVideo = null;

  function createSpeechModal() {
    speechModal = document.createElement('div');
    speechModal.className = 'speech-backdrop';

    speechModal.innerHTML = `
      <div class="speech-sheet">
        <div class="speech-header">
          <span>1분 엘리베이터 스피치</span>
          <button id="closeSpeech">닫기</button>
        </div>
        <div class="video-viewport">
          <video id="speechVideo" controls playsinline></video>
        </div>
      </div>
    `;

    document.body.appendChild(speechModal);

    speechVideo = speechModal.querySelector('#speechVideo');

    speechModal.querySelector('#closeSpeech').onclick = closeSpeech;
    speechModal.addEventListener('click', e => {
      if (e.target === speechModal) closeSpeech();
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

  /***************************************************
   * PREVIEW RENDER (미리보기 버튼 눌렀을 때만)
   ***************************************************/
  form.addEventListener('submit', e => {
    e.preventDefault();

    const category = categoryEl.value;
    const title = titleEl.value.trim();
    const oneLine = oneLineEl.value.trim();
    const desc = descEl.value.trim();
    const anon = anonEl.checked;

    if (!category || !title || !desc) {
      alert('필수 항목을 입력하세요');
      return;
    }

    issuePreview.innerHTML = `
      <section class="issue-preview">

        <div class="issue-meta">${category} · 방금 전</div>
        <h1 class="issue-title">${title}</h1>

        ${oneLine ? `<p class="issue-one-line">${oneLine}</p>` : ''}

        <div class="issue-author">
          작성자 · ${anon ? '익명' : '사용자'}
        </div>

        ${
          thumbSrc
            ? `
            <div class="preview-media" data-preview="true">
              <img src="${thumbSrc}" class="preview-thumb-img" />
            </div>
            `
            : ''
        }

        ${
          videoSrc
            ? `
            <button class="speech-btn" id="openSpeechBtn">
              🎥 1분 엘리베이터 스피치
            </button>
            `
            : ''
        }

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

    const editBtn = document.getElementById('editPreview');
    if (editBtn) {
      editBtn.onclick = () => {
        issuePreview.innerHTML = '';
        window.scrollTo({ top: 0, behavior: 'smooth' });
      };
    }

    const openSpeechBtn = document.getElementById('openSpeechBtn');
    if (openSpeechBtn && videoSrc) {
      openSpeechBtn.onclick = () => openSpeech(videoSrc);
    }

    issuePreview.scrollIntoView({ behavior: 'smooth' });
  });
});