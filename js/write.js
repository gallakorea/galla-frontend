const body = document.body;

/* === BASIC === */
const categoryEl = document.getElementById('category');
const titleEl = document.getElementById('title');
const oneLineEl = document.getElementById('oneLine');
const descEl = document.getElementById('description');
const anonEl = document.getElementById('isAnonymous');

const thumbInput = document.getElementById('thumbnail');
const thumbBtn = document.getElementById('thumbnailBtn');
const thumbPreview = document.getElementById('thumbPreview');

const videoInput = document.getElementById('video');
const videoBtn = document.getElementById('videoBtn');
const videoPreview = document.getElementById('videoPreview');

const previewBtn = document.getElementById('previewBtn');
const issuePreview = document.getElementById('issuePreview');

/* === FILE === */
thumbBtn.onclick = () => thumbInput.click();
thumbInput.onchange = e => {
  const f = e.target.files[0];
  if (f) thumbPreview.innerHTML = `<img src="${URL.createObjectURL(f)}">`;
};

videoBtn.onclick = () => videoInput.click();
videoInput.onchange = e => {
  const f = e.target.files[0];
  if (f) videoPreview.innerHTML = `<video src="${URL.createObjectURL(f)}" muted></video>`;
};

/* === PREVIEW === */
previewBtn.onclick = () => {
  if (!categoryEl.value || !titleEl.value || !descEl.value) {
    alert('카테고리 / 제목 / 설명 필수');
    return;
  }

  const thumbImg = thumbPreview.querySelector('img');
  const videoEl = videoPreview.querySelector('video');

  issuePreview.innerHTML = `
    <section class="issue-preview" style="padding:16px">
      <div style="font-size:12px;color:#aaa">${categoryEl.value}</div>
      <h1>${titleEl.value}</h1>
      <p style="color:#ccc">${oneLineEl.value}</p>
      <div style="font-size:13px;color:#888">작성자 · ${anonEl.checked ? '익명' : '사용자'}</div>

      ${thumbImg ? `<img src="${thumbImg.src}" class="preview-thumb-img">` : ''}
      ${videoEl ? `<button class="speech-btn" id="openSpeech">🎥 1분 엘리베이터 스피치</button>` : ''}

      <p>${descEl.value}</p>

      <div class="preview-actions">
        <button id="editPreview">수정하기</button>
        <button class="btn-publish">발행하기</button>
      </div>
    </section>
  `;

  document.getElementById('editPreview').onclick = () => {
    issuePreview.innerHTML = '';
    window.scrollTo({ top:0, behavior:'smooth' });
  };

  if (videoEl) {
    document.getElementById('openSpeech').onclick = () => {
      document.getElementById('speechVideo').src = videoEl.src;
      document.getElementById('speechModal').style.display = 'flex';
      body.style.overflow = 'hidden';
    };
  }

  issuePreview.scrollIntoView({ behavior:'smooth' });
};

/* === AI MODAL === */
const aiModal = document.getElementById('aiModal');
document.getElementById('openAiModal').onclick = () => {
  aiModal.style.display = 'flex';
  body.style.overflow = 'hidden';
};
document.getElementById('aiClose').onclick = () => {
  aiModal.style.display = 'none';
  body.style.overflow = '';
};

/* ===== SPEECH VIDEO OPEN / CLOSE ===== */
document.addEventListener('click', e => {
  const btn = e.target.closest('.speech-btn');
  if (!btn) return;

  const videoEl = document.querySelector('#videoPreview video');
  if (!videoEl) return;

  const modal = document.getElementById('speechModal');
  const modalVideo = document.getElementById('speechVideo');

  modalVideo.src = videoEl.src;
  modal.style.display = 'flex';
  modalVideo.play();
});

document.getElementById('closeSpeech').onclick = () => {
  const modal = document.getElementById('speechModal');
  const modalVideo = document.getElementById('speechVideo');
  modalVideo.pause();
  modalVideo.src = '';
  modal.style.display = 'none';
};