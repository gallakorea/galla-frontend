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
  openAiBtn.addEventListener('click', () => {
    aiModal.style.display = 'flex';
    body.style.overflow = 'hidden';
  });
}

if (closeAiBtn && aiModal) {
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

if (thumbBtn && thumbInput) {
  thumbBtn.addEventListener('click', () => thumbInput.click());
}

if (thumbInput) {
  thumbInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;

    const url = URL.createObjectURL(file);

    thumbPreview.innerHTML = `
      <img src="${url}" class="preview-thumb-img" />
    `;
  });
}

/***************************************************
 * FILE UPLOAD – VIDEO
 ***************************************************/
const videoInput = document.getElementById('video');
const videoBtn = document.getElementById('videoBtn');
const videoPreview = document.getElementById('videoPreview');

if (videoBtn && videoInput) {
  videoBtn.addEventListener('click', () => videoInput.click());
}

if (videoInput) {
  videoInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;

    const url = URL.createObjectURL(file);

    /* ❗ 미리보기에서는 비율 강제 안 함 */
    videoPreview.innerHTML = `
      <video src="${url}" muted playsinline></video>
    `;
  });
}

/***************************************************
 * PREVIEW RENDER
 ***************************************************/
if (form && issuePreview) {
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

    const thumbImg = thumbPreview.querySelector('img');
    const videoEl = videoPreview.querySelector('video');

    issuePreview.innerHTML = `
      <section class="issue-preview">

        <div class="issue-meta">${category} · 방금 전</div>

        <h1 class="issue-title">${escapeHtml(title)}</h1>

        ${oneLine ? `<p class="issue-one-line">${escapeHtml(oneLine)}</p>` : ''}

        <div class="issue-author">
          작성자 · ${anon ? '익명' : '사용자'}
        </div>

        ${
          thumbImg
            ? `<img src="${thumbImg.src}" class="preview-thumb-img" />`
            : ''
        }

        ${
          videoEl
            ? `
              <button type="button" class="speech-btn" id="openSpeech">
                🎥 1분 엘리베이터 스피치
              </button>
            `
            : ''
        }

        <section class="issue-summary">
          <h3>📝 이 주제에 대한 핵심 요약</h3>
          <p>${escapeHtml(desc)}</p>
        </section>

        <div class="preview-actions">
          <button type="button" id="editPreview">수정하기</button>
          <button type="button" class="btn-publish">발행하기</button>
        </div>

      </section>
    `;

    /* 수정하기 */
    const editBtn = document.getElementById('editPreview');
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        issuePreview.innerHTML = '';
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    /* 엘리베이터 스피치 (모달은 다음 단계) */
    if (videoEl) {
      const openSpeechBtn = document.getElementById('openSpeech');
      if (openSpeechBtn) {
        openSpeechBtn.addEventListener('click', () => {
          alert('엘리베이터 스피치 모달은 다음 단계에서 연결됩니다.');
        });
      }
    }

    issuePreview.scrollIntoView({ behavior: 'smooth' });
  });
}

/***************************************************
 * UTIL – XSS 최소 방어
 ***************************************************/
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}