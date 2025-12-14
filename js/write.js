/* =========================
   DOM (정리본)
========================= */
const body = document.body;

const writeForm = document.getElementById('writeForm');
const issuePreview = document.getElementById('issuePreview');

/* form fields */
const categoryEl = document.getElementById('category');
const titleEl = document.getElementById('title');
const oneLineEl = document.getElementById('oneLine');
const descEl = document.getElementById('description');
const anonEl = document.getElementById('isAnonymous');

/* AI modal */
const aiModal = document.getElementById('aiModal');
const openAiModalBtn = document.getElementById('openAiModal');
const aiCloseBtn = document.getElementById('aiClose');

/* file */
const thumbnailInput = document.getElementById('thumbnail');
const thumbnailBtn = document.getElementById('thumbnailBtn');
const thumbPreview = document.getElementById('thumbPreview');

const videoInput = document.getElementById('video');
const videoBtn = document.getElementById('videoBtn');
const videoPreview = document.getElementById('videoPreview');

/* =========================
   AI MODAL
========================= */
openAiModalBtn.onclick = () => {
  aiModal.style.display = 'flex';
  body.style.overflow = 'hidden';
};
aiCloseBtn.onclick = closeAi;
aiModal.onclick = (e) => e.target === aiModal && closeAi();

function closeAi() {
  aiModal.style.display = 'none';
  body.style.overflow = '';
}

/* =========================
   FILE UPLOAD
========================= */
thumbnailBtn.onclick = () => thumbnailInput.click();
videoBtn.onclick = () => videoInput.click();

thumbnailInput.onchange = (e) => {
  const f = e.target.files[0];
  if (!f) return;
  thumbPreview.innerHTML = `<img src="${URL.createObjectURL(f)}" class="preview-thumb-img">`;
};

videoInput.onchange = (e) => {
  const f = e.target.files[0];
  if (!f) return;
  videoPreview.innerHTML = `<video src="${URL.createObjectURL(f)}" controls></video>`;
};

/* =========================
   🔥 PREVIEW (핵심 수정)
   - submit 대신 click 사용
========================= */
const previewBtn = writeForm.querySelector('.primary-btn');

previewBtn.type = 'button'; // ❗ submit 제거
previewBtn.onclick = renderPreview;

function renderPreview() {
  const category = categoryEl.value;
  const title = titleEl.value;
  const oneLine = oneLineEl.value;
  const desc = descEl.value;
  const isAnon = anonEl.checked;

  if (!category || !title || !desc) {
    alert('카테고리 / 제목 / 설명 필수');
    return;
  }

  const thumbImg = thumbPreview.querySelector('img');
  const videoEl = videoPreview.querySelector('video');

  issuePreview.innerHTML = `
    <section class="issue-preview">
      <div style="font-size:12px;color:#aaa;">${category} · 방금 전</div>
      <h1 class="issue-title">${title}</h1>
      <p class="issue-one-line">${oneLine || ''}</p>
      <div class="issue-author">작성자 · ${isAnon ? '익명' : '사용자'}</div>

      ${thumbImg ? `<img src="${thumbImg.src}" class="preview-thumb-img">` : ''}

      ${videoEl ? `<button class="speech-btn" id="openSpeech">🎥 1분 엘리베이터 스피치</button>` : ''}

      <h3>📝 이 주제에 대한 핵심 요약</h3>
      <p>${desc}</p>

      <div class="preview-actions">
        <button type="button" id="editPreview">수정하기</button>
        <button type="button" class="btn-publish">발행하기</button>
      </div>
    </section>
  `;

  document.getElementById('editPreview').onclick = () => {
    issuePreview.innerHTML = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (videoEl) bindSpeechModal(videoEl.src);

  issuePreview.scrollIntoView({ behavior: 'smooth' });
}

/* =========================
   SPEECH MODAL
========================= */
function bindSpeechModal(src) {
  if (!document.getElementById('speechModal')) {
    document.body.insertAdjacentHTML(
      'beforeend',
      `
      <div id="speechModal" class="speech-backdrop">
        <div class="speech-sheet">
          <div class="speech-header">
            <span>1분 엘리베이터 스피치</span>
            <button id="closeSpeech">✕</button>
          </div>
          <video id="speechVideo" controls playsinline></video>
        </div>
      </div>
      `
    );
  }

  const modal = document.getElementById('speechModal');
  const video = document.getElementById('speechVideo');
  const closeBtn = document.getElementById('closeSpeech');

  document.getElementById('openSpeech').onclick = () => {
    video.src = src;
    modal.style.display = 'flex';
    video.play();
  };

  closeBtn.onclick = close;
  modal.onclick = (e) => e.target === modal && close();

  function close() {
    video.pause();
    video.src = '';
    modal.style.display = 'none';
  }
}