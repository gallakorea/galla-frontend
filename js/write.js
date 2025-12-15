document.addEventListener('DOMContentLoaded', () => {
  const body = document.body;

  const form = document.getElementById('writeForm');
  const issuePreview = document.getElementById('issuePreview');

  const categoryEl = document.getElementById('category');
  const titleEl = document.getElementById('title');
  const oneLineEl = document.getElementById('oneLine');
  const descEl = document.getElementById('description');
  const anonEl = document.getElementById('isAnonymous');

  const previewBtn = document.getElementById('previewBtn');

  /* ===============================
     AI MODAL
  =============================== */
  const aiModal = document.getElementById('aiModal');
  const openAiBtn = document.getElementById('openAiModal');
  const closeAiBtn = document.getElementById('aiClose');

  aiModal.style.display = 'none';

  openAiBtn.onclick = () => {
    aiModal.style.display = 'flex';
    body.style.overflow = 'hidden';
  };

  closeAiBtn.onclick = () => {
    aiModal.style.display = 'none';
    body.style.overflow = '';
  };

  /* ===============================
     FILE UPLOAD – THUMBNAIL
  =============================== */
  const thumbInput = document.getElementById('thumbnail');
  const thumbBtn = document.getElementById('thumbnailBtn');
  const thumbPreview = document.getElementById('thumbPreview');

  let thumbSrc = null;

  thumbBtn.onclick = () => thumbInput.click();

  thumbInput.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;

    thumbSrc = URL.createObjectURL(file);

    thumbPreview.innerHTML = `
      <div class="preview-media" data-preview="true">
        <img src="${thumbSrc}" class="preview-thumb-img">
      </div>
    `;
  };

  /* ===============================
     FILE UPLOAD – VIDEO
  =============================== */
  const videoInput = document.getElementById('video');
  const videoBtn = document.getElementById('videoBtn');
  const videoPreview = document.getElementById('videoPreview');

  let videoSrc = null;

  videoBtn.onclick = () => videoInput.click();

  videoInput.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;

    videoSrc = URL.createObjectURL(file);

    videoPreview.innerHTML = `
      <div class="preview-box is-preview">
        <video src="${videoSrc}" muted playsinline></video>
      </div>
    `;
  };

  /* ===============================
     SPEECH MODAL (9:16)
  =============================== */
  const speechModal = document.getElementById('speechModal');
  const speechVideo = document.getElementById('speechVideo');
  const closeSpeechBtn = document.getElementById('closeSpeech');

  speechModal.style.display = 'none';

  function openSpeechModal(src) {
    if (!src) return;

    speechVideo.src = src;
    speechModal.style.display = 'flex';
    body.style.overflow = 'hidden';
    speechVideo.currentTime = 0;
    speechVideo.play();
  }

  function closeSpeechModal() {
    speechVideo.pause();
    speechVideo.src = '';
    speechModal.style.display = 'none';
    body.style.overflow = '';
  }

  closeSpeechBtn.onclick = closeSpeechModal;

  speechModal.addEventListener('click', e => {
    if (e.target === speechModal) closeSpeechModal();
  });

  /* ===============================
     PREVIEW RENDER (🔥 submit ❌, click ✅)
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
            </div>`
            : ''
        }

        ${
          videoSrc
            ? `
            <button class="speech-btn" id="speechPlayBtn">
              🎥 1분 엘리베이터 스피치
            </button>`
            : ''
        }

        <section class="issue-summary">
          <h3>📝 이 주제에 대한 핵심 요약</h3>
          <p>${descEl.value}</p>
        </section>

        <div class="preview-actions">
          <button id="editPreview">수정하기</button>
          <button class="btn-publish">발행하기</button>
        </div>

      </section>
    `;

    document.getElementById('editPreview').onclick = () => {
      issuePreview.innerHTML = '';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const speechBtn = document.getElementById('speechPlayBtn');
    if (speechBtn) {
      speechBtn.onclick = () => openSpeechModal(videoSrc);
    }

    issuePreview.scrollIntoView({ behavior: 'smooth' });
  });
});