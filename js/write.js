/***************************************************
 * WRITE PAGE FINAL JS (PREVIEW WORKING)
 ***************************************************/
const body = document.body;
const form = document.getElementById('writeForm');

/* ===== DOM ===== */
const categoryEl   = document.getElementById('category');
const titleEl      = document.getElementById('title');
const oneLineEl    = document.getElementById('oneLine');
const descEl       = document.getElementById('description');
const anonEl       = document.getElementById('isAnonymous');

const thumbInput   = document.getElementById('thumbnail');
const thumbBtn     = document.getElementById('thumbnailBtn');
const thumbPreview = document.getElementById('thumbPreview');

const videoInput   = document.getElementById('video');
const videoBtn     = document.getElementById('videoBtn');
const videoPreview = document.getElementById('videoPreview');

/* ===== AI MODAL ===== */
const aiModal = document.getElementById('aiModal');
document.getElementById('openAiModal').onclick = () => {
  aiModal.style.display = 'flex';
  body.style.overflow = 'hidden';
};
document.getElementById('aiClose').onclick = () => {
  aiModal.style.display = 'none';
  body.style.overflow = '';
};

/* ===== FILE UPLOAD ===== */
thumbBtn.onclick = () => thumbInput.click();
thumbInput.onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  thumbPreview.innerHTML = `<img src="${URL.createObjectURL(f)}">`;
};

videoBtn.onclick = () => videoInput.click();
videoInput.onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  videoPreview.innerHTML = `<video src="${URL.createObjectURL(f)}" muted></video>`;
};

/* ===== PREVIEW ===== */
form.onsubmit = e => {
  e.preventDefault();

  const category = categoryEl.value.trim();
  const title    = titleEl.value.trim();
  const oneLine  = oneLineEl.value.trim();
  const desc     = descEl.value.trim();
  const anon     = anonEl.checked;

  if (!category || !title || !desc) {
    alert('카테고리 / 제목 / 이슈 설명은 필수입니다.');
    return;
  }

  const thumbImg = thumbPreview.querySelector('img');
  const videoEl  = videoPreview.querySelector('video');

  /* 기존 preview 있으면 제거 */
  const oldPreview = document.querySelector('.issue-preview');
  if (oldPreview) oldPreview.remove();

  const preview = document.createElement('section');
  preview.className = 'issue-preview';
  preview.innerHTML = `
    <div class="issue-meta">${category} · 방금 전</div>
    <h1 class="issue-title">${title}</h1>
    <p class="issue-one-line">${oneLine}</p>
    <div class="issue-author">작성자 · ${anon ? '익명' : '사용자'}</div>

    ${thumbImg ? `<img src="${thumbImg.src}" class="preview-thumb-img">` : ''}

    ${videoEl ? `
      <button class="speech-btn" id="openSpeechBtn">
        🎥 1분 엘리베이터 스피치
      </button>
    ` : ''}

    <section class="issue-summary">
      <h3>📝 이 주제에 대한 핵심 요약</h3>
      <p>${desc}</p>
    </section>

    <div class="preview-actions">
      <button id="editPreviewBtn">수정하기</button>
      <button class="btn-publish">발행하기</button>
    </div>
  `;

  form.after(preview);

  /* 수정하기 */
  document.getElementById('editPreviewBtn').onclick = () => {
    preview.remove();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* 1분 스피치 */
  if (videoEl) {
    document.getElementById('openSpeechBtn').onclick = () => {
      alert('※ 실제 서비스에서는 여기서 영상 모달이 열립니다');
    };
  }

  preview.scrollIntoView({ behavior: 'smooth' });
};