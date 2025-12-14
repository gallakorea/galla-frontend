const body = document.body;
const form = document.getElementById('writeForm');
const issuePreview = document.getElementById('issuePreview');

/* AI MODAL */
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

/* FILE UPLOAD */
const thumbInput = document.getElementById('thumbnail');
const thumbBtn = document.getElementById('thumbnailBtn');
const thumbPreview = document.getElementById('thumbPreview');

thumbBtn.onclick = () => thumbInput.click();
thumbInput.onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  thumbPreview.innerHTML = `<img src="${URL.createObjectURL(f)}">`;
};

const videoInput = document.getElementById('video');
const videoBtn = document.getElementById('videoBtn');
const videoPreview = document.getElementById('videoPreview');

videoBtn.onclick = () => videoInput.click();
videoInput.onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  videoPreview.innerHTML = `<video src="${URL.createObjectURL(f)}" muted></video>`;
};

/* PREVIEW */
form.onsubmit = e => {
  e.preventDefault();

  const category = categoryEl.value;
  const title = titleEl.value;
  const oneLine = oneLineEl.value;
  const desc = descEl.value;
  const anon = document.getElementById('isAnonymous').checked;

  if (!category || !title || !desc) return alert('필수 입력 누락');

  const thumbImg = thumbPreview.querySelector('img');
  const videoEl = videoPreview.querySelector('video');

  issuePreview.innerHTML = `
    <section class="issue-preview">
      <div class="issue-meta">${category} · 방금 전</div>
      <h1 class="issue-title">${title}</h1>
      <p class="issue-one-line">${oneLine}</p>
      <div class="issue-author">작성자 · ${anon ? '익명' : '사용자'}</div>

      ${thumbImg ? `<img src="${thumbImg.src}" class="preview-thumb-img">` : ''}

      ${videoEl ? `<button class="speech-btn" id="openSpeech">🎥 1분 엘리베이터 스피치</button>` : ''}

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

  document.getElementById('editPreview').onclick = () => {
    issuePreview.innerHTML = '';
    window.scrollTo({ top: 0 });
  };

  if (videoEl) {
    document.getElementById('openSpeech').onclick = () => openSpeech(videoEl.src);
  }

  issuePreview.scrollIntoView({ behavior: 'smooth' });
};

/* SPEECH MODAL */
const speechModal = document.getElementById('speechModal');
const speechVideo = document.getElementById('speechVideo');

function openSpeech(src) {
  speechVideo.src = src;
  speechModal.style.display = 'flex';
  body.style.overflow = 'hidden';
  speechVideo.play();
}

document.getElementById('closeSpeech').onclick = () => {
  speechVideo.pause();
  speechModal.style.display = 'none';
  body.style.overflow = '';
};