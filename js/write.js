document.addEventListener('DOMContentLoaded', () => {
  const body = document.body;

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
      <div class="preview-media">
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
      <div class="preview-box">
        <video src="${videoSrc}" muted playsinline></video>
      </div>
    `;
  };

  /* ===============================
     SPEECH MODAL (🔥 단일 관리)
  =============================== */
  const speechModal = document.getElementById('speechModal');
  const speechVideo = document.getElementById('speechVideo');
  const closeSpeechBtn = document.getElementById('closeSpeech');

  speechModal.style.display = 'none';

  function openSpeech() {
    if (!videoSrc) return;
    speechVideo.src = videoSrc;
    speechVideo.currentTime = 0;
    speechModal.style.display = 'flex';
    body.style.overflow = 'hidden';
    speechVideo.play();
  }

  function closeSpeech() {
    speechVideo.pause();
    speechVideo.src = '';
    speechModal.style.display = 'none';
    body.style.overflow = '';
  }

  closeSpeechBtn.onclick = closeSpeech;

  speechModal.addEventListener('click', e => {
    if (e.target === speechModal) closeSpeech();
  });

  /* ===============================
     PREVIEW
  =============================== */
  previewBtn.onclick = () => {
    if (!categoryEl.value || !titleEl.value || !descEl.value) {
      alert('필수 항목을 입력하세요');
      return;
    }

    issuePreview.innerHTML = `
      <section class="issue-preview">
        <div class="issue-meta">${categoryEl.value} · 방금 전</div>
        <h1 class="issue-title">${titleEl.value}</h1>
        ${oneLineEl.value ? `<p>${oneLineEl.value}</p>` : ''}
        <div>작성자 · ${anonEl.checked ? '익명' : '사용자'}</div>

        ${thumbSrc ? `
          <div class="preview-media">
            <img src="${thumbSrc}" class="preview-thumb-img">
          </div>` : ''}

        ${videoSrc ? `
          <button class="speech-btn" data-action="play">
            🎥 1분 엘리베이터 스피치
          </button>` : ''}

        <div class="preview-actions">
          <button data-action="edit">수정하기</button>
          <button class="btn-publish">발행하기</button>
        </div>
      </section>
    `;

    issuePreview.scrollIntoView({ behavior: 'smooth' });
  };

  /* ===============================
     EVENT DELEGATION
  =============================== */
  issuePreview.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;

    if (action === 'edit') {
      issuePreview.innerHTML = '';
      closeSpeech();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    if (action === 'play') {
      openSpeech();
    }
  });
});