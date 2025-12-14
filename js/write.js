/***************************************************
 * BASIC
 ***************************************************/
const body = document.body;
const form = document.getElementById('writeForm');
const issuePreview = document.getElementById('issuePreview');

/***************************************************
 * AI MODAL
 ***************************************************/
const aiModal = document.getElementById('aiModal');
const openAiBtn = document.getElementById('openAiModal');
const closeAiBtn = document.getElementById('aiClose');

if (openAiBtn && aiModal) {
  openAiBtn.onclick = () => {
    aiModal.style.display = 'flex';
    body.style.overflow = 'hidden';
  };
}

if (closeAiBtn && aiModal) {
  closeAiBtn.onclick = () => {
    aiModal.style.display = 'none';
    body.style.overflow = '';
  };
}

/***************************************************
 * FILE UPLOAD – THUMBNAIL
 ***************************************************/
const thumbInput = document.getElementById('thumbnail');
const thumbBtn = document.getElementById('thumbnailBtn');
const thumbPreview = document.getElementById('thumbPreview');

if (thumbBtn && thumbInput) {
  thumbBtn.onclick = () => thumbInput.click();
}

if (thumbInput && thumbPreview) {
  thumbInput.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;

    // 🔥 업로드 되었을 때만 DOM 생성
    thumbPreview.innerHTML = `
      <div class="preview-media" data-preview="true">
        <img src="${URL.createObjectURL(file)}" class="preview-thumb-img">
      </div>
    `;
  };
}

/***************************************************
 * FILE UPLOAD – VIDEO
 ***************************************************/
const videoInput = document.getElementById('video');
const videoBtn = document.getElementById('videoBtn');
const videoPreview = document.getElementById('videoPreview');

if (videoBtn && videoInput) {
  videoBtn.onclick = () => videoInput.click();
}

if (videoInput && videoPreview) {
  videoInput.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;

    // 🔥 업로드 되었을 때만 DOM 생성
    videoPreview.innerHTML = `
      <div class="video-viewport" data-preview="true">
        <video src="${URL.createObjectURL(file)}" muted playsinline></video>
      </div>
    `;
  };
}

/***************************************************
 * PREVIEW RENDER (ISSUE UI 동일)
 ***************************************************/
form.onsubmit = e => {
  e.preventDefault();

  const category = document.getElementById('category').value;
  const title = document.getElementById('title').value;
  const oneLine = document.getElementById('oneLine').value;
  const desc = document.getElementById('description').value;
  const anon = document.getElementById('isAnonymous').checked;

  if (!category || !title || !desc) {
    alert('필수 항목을 입력하세요');
    return;
  }

  const thumbImg = thumbPreview.querySelector('img');
  const videoEl = videoPreview.querySelector('video');

  issuePreview.innerHTML = `
    <section class="issue-preview">

      <div class="issue-meta">${category} · 방금 전</div>

      <h1 class="issue-title">${title}</h1>

      ${oneLine ? `<p class="issue-one-line">${oneLine}</p>` : ''}

      <div class="issue-author">
        작성자 · ${anon ? '익명' : '사용자'}
      </div>

      ${
        thumbImg
          ? `
          <div class="preview-media" data-preview="true">
            <img src="${thumbImg.src}" class="preview-thumb-img">
          </div>
          `
          : ''
      }

      ${
        videoEl
          ? `
          <button class="speech-btn" id="openSpeech">
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

  /***************************************************
   * 수정하기
   ***************************************************/
  const editBtn = document.getElementById('editPreview');
  if (editBtn) {
    editBtn.onclick = () => {
      issuePreview.innerHTML = '';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
  }

  /***************************************************
   * 엘리베이터 스피치 버튼
   ***************************************************/
  if (videoEl) {
    const openSpeechBtn = document.getElementById('openSpeech');
    if (openSpeechBtn) {
      openSpeechBtn.onclick = () => {
        alert('엘리베이터 스피치 모달은 다음 단계에서 연결됩니다.');
      };
    }
  }

  issuePreview.scrollIntoView({ behavior: 'smooth' });
};