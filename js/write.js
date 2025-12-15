/***************************************************
 * BASIC
 ***************************************************/
const body = document.body;
const form = document.getElementById('writeForm');
const issuePreview = document.getElementById('issuePreview');

/***************************************************
 * AI MODAL (자동 오픈 방지)
 ***************************************************/
const aiModal = document.getElementById('aiModal');
const openAiBtn = document.getElementById('openAiModal');
const closeAiBtn = document.getElementById('aiClose');

if (aiModal) aiModal.style.display = 'none';

openAiBtn?.addEventListener('click', e => {
  e.preventDefault();
  aiModal.style.display = 'flex';
  body.style.overflow = 'hidden';
});

closeAiBtn?.addEventListener('click', e => {
  e.preventDefault();
  aiModal.style.display = 'none';
  body.style.overflow = '';
});

/***************************************************
 * FILE UPLOAD
 ***************************************************/
const thumbInput = document.getElementById('thumbnail');
const videoInput = document.getElementById('video');

document.getElementById('thumbnailBtn')?.onclick = () => thumbInput.click();
document.getElementById('videoBtn')?.onclick = () => videoInput.click();

/***************************************************
 * PREVIEW RENDER
 ***************************************************/
form.addEventListener('submit', e => {
  e.preventDefault();

  const category = category.value;
  const titleVal = title.value;
  const oneLineVal = oneLine.value;
  const descVal = description.value;
  const anon = isAnonymous.checked;

  if (!category || !titleVal || !descVal) {
    alert('필수 항목 누락');
    return;
  }

  const thumbFile = thumbInput.files[0];
  const videoFile = videoInput.files[0];

  issuePreview.innerHTML = `
    <section class="issue-preview">
      <div class="issue-meta">${category} · 방금 전</div>
      <h1 class="issue-title">${titleVal}</h1>
      ${oneLineVal ? `<p class="issue-one-line">${oneLineVal}</p>` : ''}
      <div class="issue-author">작성자 · ${anon ? '익명' : '사용자'}</div>

      ${
        thumbFile
          ? `<div class="preview-media" data-preview="true">
               <img src="${URL.createObjectURL(thumbFile)}" class="preview-thumb-img">
             </div>`
          : ''
      }

      ${
        videoFile
          ? `<button class="speech-btn" data-video="${URL.createObjectURL(videoFile)}">
               🎥 1분 엘리베이터 스피치
             </button>`
          : ''
      }

      <section class="issue-summary">
        <h3>📝 이 주제에 대한 핵심 요약</h3>
        <p>${descVal}</p>
      </section>

      <div class="preview-actions">
        <button class="edit-btn">수정하기</button>
        <button class="btn-publish">발행하기</button>
      </div>
    </section>
  `;

  issuePreview.scrollIntoView({ behavior: 'smooth' });
});

/***************************************************
 * 🔥 EVENT DELEGATION (먹통 해결 핵심)
 ***************************************************/
document.addEventListener('click', e => {
  const speechBtn = e.target.closest('.speech-btn');
  const editBtn = e.target.closest('.edit-btn');
  const closeSpeech = e.target.closest('#closeSpeech');

  /* 1분 엘리베이터 스피치 */
  if (speechBtn) {
    e.preventDefault();
    openSpeechModal(speechBtn.dataset.video);
    return;
  }

  /* 수정하기 */
  if (editBtn) {
    issuePreview.innerHTML = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  /* 스피치 닫기 */
  if (closeSpeech) {
    closeSpeechModal();
  }
});

/***************************************************
 * SPEECH MODAL (9:16 고정)
 ***************************************************/
let speechModal;

function openSpeechModal(src) {
  if (!speechModal) {
    speechModal = document.createElement('div');
    speechModal.className = 'speech-backdrop';
    speechModal.innerHTML = `
      <div class="speech-sheet">
        <div class="speech-header">
          <span>1분 엘리베이터 스피치</span>
          <button id="closeSpeech">닫기</button>
        </div>
        <div class="video-viewport">
          <video controls playsinline></video>
        </div>
      </div>
    `;
    document.body.appendChild(speechModal);
  }

  const video = speechModal.querySelector('video');
  video.src = src;
  video.currentTime = 0;
  video.play().catch(() => {});

  speechModal.style.display = 'flex';
  body.style.overflow = 'hidden';
}

function closeSpeechModal() {
  if (!speechModal) return;
  const video = speechModal.querySelector('video');
  video.pause();
  speechModal.style.display = 'none';
  body.style.overflow = '';
}