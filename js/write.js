document.addEventListener('DOMContentLoaded', () => {
  const body = document.body;
  const form = document.getElementById('writeForm');
  const issuePreview = document.createElement('section');
  issuePreview.id = 'issuePreview';
  form.after(issuePreview);

  const categoryEl = document.getElementById('category');
  const titleEl = document.getElementById('title');
  const oneLineEl = document.getElementById('oneLine');
  const descEl = document.getElementById('description');
  const anonEl = document.getElementById('isAnonymous');

  /* ===============================
     AI MODAL (단순 열고 닫기만)
  =============================== */
  const aiModal = document.getElementById('aiModal');
  document.getElementById('openAiModal').onclick = () => {
    aiModal.style.display = 'flex';
    body.style.overflow = 'hidden';
  };
  document.getElementById('aiClose').onclick = closeAi;
  function closeAi() {
    aiModal.style.display = 'none';
    body.style.overflow = '';
  }

  /* ===============================
     FILE UPLOAD – THUMBNAIL
  =============================== */
  const thumbInput = document.getElementById('thumbnail');
  const thumbBtn = document.getElementById('thumbnailBtn');
  const thumbPreview = document.getElementById('thumbPreview');
  let thumbSrc = null;

  thumbBtn.onclick = () => thumbInput.click();
  thumbInput.onchange = e => {
    const f = e.target.files[0];
    if (!f) return;
    thumbSrc = URL.createObjectURL(f);
    thumbPreview.innerHTML =
      `<img src="${thumbSrc}" class="preview-thumb-img">`;
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
    const f = e.target.files[0];
    if (!f) return;
    videoSrc = URL.createObjectURL(f);
    videoPreview.innerHTML =
      `<video src="${videoSrc}" muted playsinline></video>`;
  };

  /* ===============================
     SPEECH VIDEO MODAL (🔥 동적 생성)
  =============================== */
  let speechModal = null;
  let speechVideo = null;

  function openSpeech(src) {
    if (!speechModal) {
      speechModal = document.createElement('div');
      speechModal.className = 'video-modal';
      speechModal.innerHTML = `
        <div class="video-modal-inner">
          <div class="video-modal-header">
            <span>1분 엘리베이터 스피치</span>
            <button id="closeSpeech">✕</button>
          </div>
          <div class="video-viewport">
            <video playsinline controls></video>
          </div>
        </div>
      `;
      document.body.appendChild(speechModal);

      speechVideo = speechModal.querySelector('video');
      speechModal.querySelector('#closeSpeech').onclick = closeSpeech;
      speechModal.onclick = e => {
        if (e.target === speechModal) closeSpeech();
      };
    }

    speechVideo.src = src;
    speechModal.style.display = 'flex';
    body.style.overflow = 'hidden';
    speechVideo.currentTime = 0;
    speechVideo.play();
  }

  function closeSpeech() {
    speechVideo.pause();
    speechVideo.src = '';
    speechModal.style.display = 'none';
    body.style.overflow = '';
  }

  /* ===============================
     PREVIEW SUBMIT
  =============================== */
  form.onsubmit = e => {
    e.preventDefault();

    if (!categoryEl.value || !titleEl.value || !descEl.value) {
      alert('필수 항목을 입력하세요');
      return;
    }

    issuePreview.innerHTML = `
      <section class="issue-preview">
        <div class="issue-meta">${categoryEl.value} · 방금 전</div>
        <h1 class="issue-title">${titleEl.value}</h1>
        ${oneLineEl.value ? `<p class="issue-one-line">${oneLineEl.value}</p>` : ''}
        <div class="issue-author">작성자 · ${anonEl.checked ? '익명' : '사용자'}</div>

        ${thumbSrc ? `<img src="${thumbSrc}" class="preview-thumb-img">` : ''}

        ${videoSrc ? `<button class="speech-btn" id="openSpeech">🎥 1분 엘리베이터 스피치</button>` : ''}

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

    if (videoSrc) {
      document.getElementById('openSpeech').onclick = () => openSpeech(videoSrc);
    }

    issuePreview.scrollIntoView({ behavior: 'smooth' });
  };
});