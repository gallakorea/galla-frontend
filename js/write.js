// write.js : 완전 동작

const body = document.body;

const form = document.getElementById('writeForm');
const issuePreview = document.getElementById('issuePreview');

const categoryEl = document.getElementById('category');
const titleEl = document.getElementById('title');
const oneLineEl = document.getElementById('oneLine');
const descEl = document.getElementById('description');

const thumbInput = document.getElementById('thumbnail');
const thumbBtn = document.getElementById('thumbnailBtn');
const thumbPreview = document.getElementById('thumbPreview');

const videoInput = document.getElementById('video');
const videoBtn = document.getElementById('videoBtn');
const videoPreview = document.getElementById('videoPreview');

/* 파일 업로드 */
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

/* AI 모달 */
const aiModal = document.getElementById('aiModal');
document.getElementById('openAiModal').onclick = () => {
  aiModal.style.display = 'flex';
  body.style.overflow = 'hidden';
};
document.getElementById('aiClose').onclick = () => {
  aiModal.style.display = 'none';
  body.style.overflow = '';
};
document.getElementById('applyAi').onclick = () => {
  descEl.value = document.getElementById('aiResultText').value;
  aiModal.style.display = 'none';
  body.style.overflow = '';
};

/* 미리보기 */
form.onsubmit = e => {
  e.preventDefault();

  if (!categoryEl.value || !titleEl.value || !descEl.value) {
    alert('필수 입력 누락');
    return;
  }

  const anon = document.getElementById('isAnonymous').checked;
  const thumbImg = thumbPreview.querySelector('img');
  const videoEl = videoPreview.querySelector('video');

  issuePreview.innerHTML = `
    <section class="issue-preview">
      <h2>${titleEl.value}</h2>
      <p>${oneLineEl.value}</p>
      <p>작성자 · ${anon ? '익명' : '사용자'}</p>
      ${thumbImg ? `<img src="${thumbImg.src}" class="preview-thumb-img">` : ''}
      ${videoEl ? `<button id="openSpeech" class="speech-btn">🎥 영상 보기</button>` : ''}
      <p>${descEl.value}</p>
    </section>
  `;

  if (videoEl) {
    document.getElementById('openSpeech').onclick = () => openSpeech(videoEl.src);
  }

  issuePreview.scrollIntoView({ behavior:'smooth' });
};

/* 영상 모달 */
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