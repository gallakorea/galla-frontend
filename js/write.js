const body = document.body;

/* =========================
   DOM ELEMENTS (🔥 누락됐던 핵심)
========================= */
const previewBtn = document.getElementById('previewBtn');
const issuePreview = document.getElementById('issuePreview');

const categoryEl = document.getElementById('category');
const titleEl = document.getElementById('title');
const oneLineEl = document.getElementById('oneLine');
const descEl = document.getElementById('description');
const anonEl = document.getElementById('isAnonymous');

const thumbInput = document.getElementById('thumbnail');
const thumbPreview = document.getElementById('thumbPreview');

const videoInput = document.getElementById('video');
const videoPreview = document.getElementById('videoPreview');

/* =========================
   AI MODAL
========================= */
const aiModal = document.getElementById('aiModal');
document.getElementById('openAiModal').onclick = () => {
  aiModal.style.display = 'flex';
  body.style.overflow = 'hidden';
};
document.getElementById('aiClose').onclick = () => {
  aiModal.style.display = 'none';
  body.style.overflow = '';
};

/* =========================
   FILE UPLOAD
========================= */
document.getElementById('thumbnailBtn').onclick = () => thumbInput.click();
thumbInput.onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  thumbPreview.innerHTML = `
    <img src="${URL.createObjectURL(f)}" class="preview-thumb-img">
  `;
};

document.getElementById('videoBtn').onclick = () => videoInput.click();
videoInput.onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  videoPreview.innerHTML = `
    <video src="${URL.createObjectURL(f)}"></video>
  `;
};

/* =========================
   PREVIEW (🔥 여기서 이제 정상 동작)
========================= */
previewBtn.onclick = () => {
  const category = categoryEl.value;
  const title = titleEl.value;
  const oneLine = oneLineEl.value;
  const desc = descEl.value;
  const anon = anonEl.checked;

  if (!category || !title || !desc) {
    alert('카테고리 / 제목 / 설명은 필수');
    return;
  }

  const thumbImg = thumbPreview.querySelector('img');
  const videoEl = videoPreview.querySelector('video');

  issuePreview.innerHTML = `
    <section class="issue-preview">
      <div class="issue-meta">${category} · 방금 전</div>
      <h1 class="issue-title">${title}</h1>
      ${oneLine ? `<p class="issue-one-line">${oneLine}</p>` : ''}
      <div class="issue-author">작성자 · ${anon ? '익명' : '사용자'}</div>

      ${thumbImg ? `<img src="${thumbImg.src}" class="preview-thumb-img">` : ''}

      ${
        videoEl
          ? `<button class="speech-btn" id="openSpeech">🎥 1분 엘리베이터 스피치</button>`
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

  /* 수정하기 */
  document.getElementById('editPreview').onclick = () => {
    issuePreview.innerHTML = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* 영상 스피치 */
  if (videoEl) {
    document.getElementById('openSpeech').onclick = () => {
      const modal = document.getElementById('speechModal');
      const video = document.getElementById('speechVideo');
      video.src = videoEl.src;
      modal.style.display = 'flex';
      body.style.overflow = 'hidden';
      video.play();
    };
  }

  issuePreview.scrollIntoView({ behavior: 'smooth' });
};

/* =========================
   SPEECH MODAL CLOSE
========================= */
document.getElementById('closeSpeech').onclick = () => {
  const modal = document.getElementById('speechModal');
  const video = document.getElementById('speechVideo');
  video.pause();
  video.src = '';
  modal.style.display = 'none';
  body.style.overflow = '';
};