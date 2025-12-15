document.addEventListener('DOMContentLoaded', () => {
  const body = document.body;

  /* ========= ELEMENTS ========= */
  const form = document.getElementById('writeForm');
  const issuePreview = document.getElementById('issuePreview');

  const categoryEl = document.getElementById('category');
  const titleEl = document.getElementById('title');
  const oneLineEl = document.getElementById('oneLine');
  const descEl = document.getElementById('description');

  /* ========= AI MODAL ========= */
  const aiModal = document.getElementById('aiModal');
  const openAiBtn = document.getElementById('openAiModal');
  const closeAiBtn = document.getElementById('aiClose');
  const aiUserText = document.getElementById('aiUserText');
  const aiResultText = document.getElementById('aiResultText');
  const applyAiBtn = document.getElementById('applyAi');

  openAiBtn.addEventListener('click', e => {
    e.preventDefault();
    aiUserText.value = descEl.value;
    aiModal.style.display = 'flex';
    body.style.overflow = 'hidden';
  });

  closeAiBtn.addEventListener('click', () => {
    aiModal.style.display = 'none';
    body.style.overflow = '';
  });

  applyAiBtn.addEventListener('click', () => {
    if (aiResultText.value.trim()) {
      descEl.value = aiResultText.value;
    }
    aiModal.style.display = 'none';
    body.style.overflow = '';
  });

  /* ========= FILE ========= */
  const thumbInput = document.getElementById('thumbnail');
  const thumbBtn = document.getElementById('thumbnailBtn');
  const thumbPreview = document.getElementById('thumbPreview');

  thumbBtn.addEventListener('click', () => thumbInput.click());
  thumbInput.addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    thumbPreview.innerHTML = `<img src="${URL.createObjectURL(f)}">`;
  });

  const videoInput = document.getElementById('video');
  const videoBtn = document.getElementById('videoBtn');
  const videoPreview = document.getElementById('videoPreview');

  videoBtn.addEventListener('click', () => videoInput.click());
  videoInput.addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    videoPreview.innerHTML = `<video src="${URL.createObjectURL(f)}" muted></video>`;
  });

  /* ========= PREVIEW ========= */
  form.addEventListener('submit', e => {
    e.preventDefault();

    const category = categoryEl.value;
    const title = titleEl.value;
    const oneLine = oneLineEl.value;
    const desc = descEl.value;
    const anon = document.getElementById('isAnonymous').checked;

    if (!category || !title || !desc) {
      alert('필수 입력 누락');
      return;
    }

    const thumbImg = thumbPreview.querySelector('img');
    const videoEl = videoPreview.querySelector('video');

    issuePreview.innerHTML = `
      <section class="issue-preview">
        <div class="issue-meta">${category} · 방금 전</div>
        <h1 class="issue-title">${title}</h1>
        <p class="issue-one-line">${oneLine}</p>
        <div class="issue-author">작성자 · ${anon ? '익명' : '사용자'}</div>

        ${thumbImg ? `<img src="${thumbImg.src}" class="preview-thumb-img">` : ''}

        ${videoEl ? `<button type="button" class="speech-btn" id="openSpeech">🎥 1분 엘리베이터 스피치</button>` : ''}

        <section class="issue-summary">
          <p>${desc}</p>
        </section>
      </section>
    `;

    if (videoEl) {
      document.getElementById('openSpeech').onclick = () => openSpeech(videoEl.src);
    }

    issuePreview.scrollIntoView({ behavior: 'smooth' });
  });

  /* ========= VIDEO MODAL ========= */
  const speechModal = document.getElementById('speechModal');
  const speechVideo = document.getElementById('speechVideo');
  const closeSpeechBtn = document.getElementById('closeSpeech');

  function openSpeech(src) {
    speechVideo.src = src;
    speechModal.style.display = 'flex';
    body.style.overflow = 'hidden';
    speechVideo.play();
  }

  closeSpeechBtn.addEventListener('click', () => {
    speechVideo.pause();
    speechModal.style.display = 'none';
    body.style.overflow = '';
  });
});