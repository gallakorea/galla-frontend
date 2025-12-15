document.addEventListener('DOMContentLoaded', () => {
  const body = document.body;
  const form = document.getElementById('writeForm');
  const issuePreview = document.getElementById('issuePreview');

  /* ===============================
     ELEMENTS (🔥 누락 원인 해결)
  =============================== */
  const categoryEl = document.getElementById('category');
  const titleEl = document.getElementById('title');
  const oneLineEl = document.getElementById('oneLine');
  const descEl = document.getElementById('description');
  const anonEl = document.getElementById('isAnonymous');

  /* ===============================
     AI MODAL
  =============================== */
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
      <img src="${thumbSrc}" class="preview-thumb-img" />
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
      <video src="${videoSrc}" muted playsinline></video>
    `;
  };

  /* ===============================
     SPEECH MODAL (고정 DOM 사용)
  =============================== */
  const speechModal = document.getElementById('speechModal');
  const speechVideo = document.getElementById('speechVideo');
  const closeSpeechBtn = document.getElementById('closeSpeech');

  function openSpeech(src) {
    if (!src) return;
    speechVideo.src = src;
    speechModal.style.display = 'flex';
    body.style.overflow = 'hidden';
    speechVideo.currentTime = 0;
    speechVideo.play();
  }

  closeSpeechBtn.onclick = () => {
    speechVideo.pause();
    speechVideo.src = '';
    speechModal.style.display = 'none';
    body.style.overflow = '';
  };

  /* ===============================
     PREVIEW (🔥 정상 작동 핵심)
  =============================== */
  form.onsubmit = e => {
    e.preventDefault();

    const category = categoryEl.value;
    const title = titleEl.value;
    const oneLine = oneLineEl.value;
    const desc = descEl.value;
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
        <div class="issue-author">작성자 · ${anon ? '익명' : '사용자'}</div>

        ${thumbSrc ? `<img src="${thumbSrc}" class="preview-thumb-img">` : ''}

        ${videoSrc ? `<button class="speech-btn" id="openSpeechBtn">🎥 1분 엘리베이터 스피치</button>` : ''}

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

    /* 수정 */
    document.getElementById('editPreview').onclick = () => {
      issuePreview.innerHTML = '';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    /* 영상 */
    if (videoSrc) {
      document.getElementById('openSpeechBtn').onclick = () => {
        openSpeech(videoSrc);
      };
    }

    issuePreview.scrollIntoView({ behavior: 'smooth' });
  };
});