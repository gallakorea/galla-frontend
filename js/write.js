/***************************************************
 * BASIC
 ***************************************************/
const body = document.body;
const form = document.getElementById('writeForm');
const issuePreview = document.getElementById('issuePreview');

/***************************************************
 * AI MODAL (절대 자동 오픈 금지)
 ***************************************************/
const aiModal = document.getElementById('aiModal');
const openAiBtn = document.getElementById('openAiModal');
const closeAiBtn = document.getElementById('aiClose');

if (aiModal) aiModal.style.display = 'none';

openAiBtn?.addEventListener('click', () => {
  aiModal.style.display = 'flex';
  body.style.overflow = 'hidden';
});

closeAiBtn?.addEventListener('click', () => {
  aiModal.style.display = 'none';
  body.style.overflow = '';
});

/***************************************************
 * FILE UPLOAD – THUMBNAIL
 ***************************************************/
const thumbInput = document.getElementById('thumbnail');
const thumbBtn = document.getElementById('thumbnailBtn');
const thumbPreview = document.getElementById('thumbPreview');

thumbBtn?.addEventListener('click', () => thumbInput.click());

thumbInput?.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;

  thumbPreview.innerHTML = `
    <div class="preview-media" data-preview="true">
      <img src="${URL.createObjectURL(file)}" class="preview-thumb-img">
    </div>
  `;
});

/***************************************************
 * FILE UPLOAD – VIDEO
 ***************************************************/
const videoInput = document.getElementById('video');
const videoBtn = document.getElementById('videoBtn');
const videoPreview = document.getElementById('videoPreview');

videoBtn?.addEventListener('click', () => videoInput.click());

videoInput?.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;

  videoPreview.innerHTML = `
    <div class="preview-media" data-preview="true">
      <span class="preview-video-label">영상 업로드 완료</span>
    </div>
  `;
});

/***************************************************
 * PREVIEW RENDER (미리보기 버튼 클릭 시만)
 ***************************************************/
form.addEventListener('submit', e => {
  e.preventDefault();

  const category = document.getElementById('category').value;
  const title = document.getElementById('title').value;
  const oneLine = document.getElementById('oneLine').value;
  const desc = document.getElementById('description').value;
  const anon = document.getElementById('isAnonymous').checked;

  if (!category || !title || !desc) {
    alert('필수 항목을 입력하세요');
    return;
  }

  const thumbImg = thumbPreview.querySelector('img');
  const videoFile = videoInput.files[0];

  issuePreview.innerHTML = `
    <section class="issue-preview">

      <div class="issue-meta">${category} · 방금 전</div>
      <h1 class="issue-title">${title}</h1>
      ${oneLine ? `<p class="issue-one-line">${oneLine}</p>` : ''}
      <div class="issue-author">작성자 · ${anon ? '익명' : '사용자'}</div>

      ${
        thumbImg
          ? `
          <div class="preview-media" data-preview="true">
            <img src="${thumbImg.src}" class="preview-thumb-img">
          </div>`
          : ''
      }

      ${
        videoFile
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

  document.getElementById('editPreview')?.addEventListener('click', () => {
    issuePreview.innerHTML = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  if (videoFile) {
    document.getElementById('openSpeech')?.addEventListener('click', () => {
      openSpeechModal(URL.createObjectURL(videoFile));
    });
  }

  issuePreview.scrollIntoView({ behavior: 'smooth' });
});

/***************************************************
 * SPEECH VIDEO MODAL (9:16 고정)
 ***************************************************/
function openSpeechModal(src) {
  let modal = document.getElementById('speechModal');

  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'speechModal';
    modal.className = 'speech-backdrop';
    modal.innerHTML = `
      <div class="speech-sheet">
        <div class="speech-header">
          <span>1분 엘리베이터 스피치</span>
          <button id="closeSpeech">닫기</button>
        </div>
        <div class="video-viewport">
          <video controls autoplay playsinline></video>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  const video = modal.querySelector('video');
  video.src = src;

  modal.style.display = 'flex';
  body.style.overflow = 'hidden';

  modal.querySelector('#closeSpeech').onclick = () => {
    video.pause();
    modal.style.display = 'none';
    body.style.overflow = '';
  };
}