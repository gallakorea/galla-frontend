/***************************************************
 * BASIC DOM
 ***************************************************/
const form = document.getElementById('writeForm');

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

/***************************************************
 * AI MODAL
 ***************************************************/
const aiModal = document.getElementById('aiModal');
const openAiBtn = document.getElementById('openAiModal');
const closeAiBtn = document.getElementById('aiClose');
const aiUserText = document.getElementById('aiUserText');
const aiResultText = document.getElementById('aiResultText');
const applyAiBtn = document.getElementById('applyAi');

openAiBtn.onclick = () => {
  aiUserText.value = descEl.value;
  aiModal.style.display = 'flex';
};

closeAiBtn.onclick = () => {
  aiModal.style.display = 'none';
};

applyAiBtn.onclick = () => {
  if (aiResultText.value.trim()) {
    descEl.value = aiResultText.value;
  }
  aiModal.style.display = 'none';
};

/***************************************************
 * FILE UPLOAD
 ***************************************************/
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
  videoPreview.innerHTML = `
    <video src="${URL.createObjectURL(f)}" muted></video>
  `;
};

/***************************************************
 * PREVIEW (ISSUE PAGE UI 100% 동일)
 ***************************************************/
previewBtn.onclick = () => {
  const category = categoryEl.value;
  const title = titleEl.value.trim();
  const oneLine = oneLineEl.value.trim();
  const desc = descEl.value.trim();
  const anon = anonEl.checked;

  if (!category || !title || !desc) {
    alert('카테고리 / 제목 / 설명은 필수입니다.');
    return;
  }

  // 기존 미리보기 제거
  const old = document.querySelector('.issue-preview');
  if (old) old.remove();

  const thumbImg = thumbPreview.querySelector('img');
  const videoEl = videoPreview.querySelector('video');

  const preview = document.createElement('section');
  preview.className = 'issue-preview';

  preview.innerHTML = `
    <div class="issue-card">

      <div class="issue-meta">
        <span class="issue-category">${category}</span>
        · <span class="issue-time">방금 전</span>
      </div>

      <h1 class="issue-title">${title}</h1>

      ${
        oneLine
          ? `<p class="issue-one-line">${oneLine}</p>`
          : ''
      }

      <div class="issue-author">
        작성자 · ${anon ? '익명' : '사용자'}
      </div>

      ${
        thumbImg
          ? `<img src="${thumbImg.src}" class="issue-thumb">`
          : ''
      }

      ${
        videoEl
          ? `<button class="speech-btn">🎥 1분 엘리베이터 스피치</button>`
          : ''
      }

      <div class="issue-summary">
        <h3>📝 이 주제에 대한 핵심 요약</h3>
        <p>${desc}</p>
      </div>

      <div class="preview-actions">
        <button id="editPreview">수정하기</button>
        <button class="btn-publish">발행하기</button>
      </div>

    </div>
  `;

  form.after(preview);
  preview.scrollIntoView({ behavior: 'smooth' });

  /***************************************************
   * EDIT PREVIEW
   ***************************************************/
  document.getElementById('editPreview').onclick = () => {
    preview.remove();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /***************************************************
   * SPEECH MODAL
   ***************************************************/
  const speechBtn = preview.querySelector('.speech-btn');
  if (speechBtn && videoEl) {
    speechBtn.onclick = () => {
      const modal = document.getElementById('speechModal');
      const video = document.getElementById('speechVideo');
      video.src = videoEl.src;
      modal.style.display = 'flex';
    };
  }
};

/***************************************************
 * SPEECH MODAL CLOSE
 ***************************************************/
const closeSpeech = document.getElementById('closeSpeech');
if (closeSpeech) {
  closeSpeech.onclick = () => {
    const modal = document.getElementById('speechModal');
    const video = document.getElementById('speechVideo');
    video.pause();
    video.src = '';
    modal.style.display = 'none';
  };
}