const body = document.body;

/* elements */
const previewBtn = document.getElementById('previewBtn');
const issuePreview = document.getElementById('issuePreview');

const categoryEl = document.getElementById('category');
const titleEl = document.getElementById('title');
const oneLineEl = document.getElementById('oneLine');
const descEl = document.getElementById('description');
const anonEl = document.getElementById('isAnonymous');

/* AI modal */
const aiModal = document.getElementById('aiModal');
document.getElementById('openAiModal').onclick = () => {
  aiModal.style.display = 'flex';
  body.style.overflow = 'hidden';
};
document.getElementById('aiClose').onclick = () => {
  aiModal.style.display = 'none';
  body.style.overflow = '';
};

/* file */
const thumbInput = document.getElementById('thumbnail');
const thumbPreview = document.getElementById('thumbPreview');
document.getElementById('thumbnailBtn').onclick = () => thumbInput.click();
thumbInput.onchange = e => {
  const f = e.target.files[0];
  if (f) thumbPreview.innerHTML = `<img src="${URL.createObjectURL(f)}" class="preview-thumb-img">`;
};

const videoInput = document.getElementById('video');
const videoPreview = document.getElementById('videoPreview');
document.getElementById('videoBtn').onclick = () => videoInput.click();
videoInput.onchange = e => {
  const f = e.target.files[0];
  if (f) videoPreview.innerHTML = `<video src="${URL.createObjectURL(f)}"></video>`;
};

/* preview */
previewBtn.onclick = () => {
  if (!categoryEl.value || !titleEl.value || !descEl.value) {
    alert('카테고리 / 제목 / 설명 필수');
    return;
  }

  const thumbImg = thumbPreview.querySelector('img');
  const videoEl = videoPreview.querySelector('video');

  issuePreview.innerHTML = `
    <section class="issue-preview">
      <div>${categoryEl.value} · 방금 전</div>
      <h1>${titleEl.value}</h1>
      <p>${oneLineEl.value || ''}</p>
      <div>작성자 · ${anonEl.checked ? '익명' : '사용자'}</div>

      ${thumbImg ? `<img src="${thumbImg.src}" class="preview-thumb-img">` : ''}

      ${videoEl ? `<button id="openSpeech" class="speech-btn">🎥 1분 엘리베이터 스피치</button>` : ''}

      <h3>📝 이 주제에 대한 핵심 요약</h3>
      <p>${descEl.value}</p>

      <div class="preview-actions">
        <button id="editPreview">수정하기</button>
        <button class="btn-publish">발행하기</button>
      </div>
    </section>
  `;

  if (videoEl) {
    document.getElementById('openSpeech').onclick = () => {
      const modal = document.getElementById('speechModal');
      const video = document.getElementById('speechVideo');
      video.src = videoEl.src;
      modal.style.display = 'flex';
      video.play();
    };
  }

  document.getElementById('editPreview').onclick = () => {
    issuePreview.innerHTML = '';
    window.scrollTo({ top: 0 });
  };

  issuePreview.scrollIntoView({ behavior: 'smooth' });
};

/* speech close */
document.getElementById('closeSpeech').onclick = () => {
  const modal = document.getElementById('speechModal');
  const video = document.getElementById('speechVideo');
  video.pause();
  video.src = '';
  modal.style.display = 'none';
};