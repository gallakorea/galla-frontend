/* =====================
   BASIC DOM
===================== */
const body = document.body;

const form = document.getElementById('writeForm');
const previewBtn = document.getElementById('previewBtn');
const previewArea = document.getElementById('issuePreview');

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

/* =====================
   FILE UPLOAD
===================== */
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

/* =====================
   PREVIEW (🔥 핵심)
===================== */
previewBtn.onclick = () => {
  const category = categoryEl.value;
  const title = titleEl.value;
  const oneLine = oneLineEl.value;
  const desc = descEl.value;
  const anon = anonEl.checked;

  if (!category || !title || !desc) {
    alert('카테고리 / 제목 / 설명 필수');
    return;
  }

  previewArea.innerHTML = ''; // 항상 초기화

  const thumbImg = thumbPreview.querySelector('img');
  const videoEl = videoPreview.querySelector('video');

  previewArea.innerHTML = `
    <section class="issue-preview">
      <div class="issue-meta">${category} · 방금 전</div>
      <h1 class="issue-title">${title}</h1>
      <p class="issue-one-line">${oneLine}</p>
      <div class="issue-author">작성자 · ${anon ? '익명' : '사용자'}</div>

      ${thumbImg ? `<img src="${thumbImg.src}" class="preview-thumb-img">` : ''}

      ${videoEl ? `<button id="openSpeech" class="speech-btn">🎥 1분 엘리베이터 스피치</button>` : ''}

      <h3 style="margin-top:16px">📝 이 주제에 대한 핵심 요약</h3>
      <p>${desc}</p>

      <div class="preview-actions">
        <button id="editPreview">수정하기</button>
        <button class="btn-publish">발행하기</button>
      </div>
    </section>
  `;

  document.getElementById('editPreview').onclick = () => {
    previewArea.innerHTML = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (videoEl) {
    document.getElementById('openSpeech').onclick = () => {
      openSpeech(videoEl.src);
    };
  }

  previewArea.scrollIntoView({ behavior: 'smooth' });
};

/* =====================
   SPEECH MODAL
===================== */
const speechModal = document.getElementById('speechModal');
const speechVideo = document.getElementById('speechVideo');
const closeSpeech = document.getElementById('closeSpeech');

function openSpeech(src) {
  speechVideo.src = src;
  speechModal.style.display = 'flex';
  body.style.overflow = 'hidden';
  speechVideo.play();
}

closeSpeech.onclick = () => {
  speechVideo.pause();
  speechModal.style.display = 'none';
  body.style.overflow = '';
};

/* =====================
   AI MODAL (구조 유지)
===================== */
const aiModal = document.getElementById('aiModal');
const openAiBtn = document.getElementById('openAiModal');
const closeAiBtn = document.getElementById('aiClose');

openAiBtn.onclick = () => {
  aiModal.style.display = 'flex';
  body.style.overflow = 'hidden';
};

closeAiBtn.onclick = () => {
  aiModal.style.display = 'none';
  body.style.overflow = '';
};