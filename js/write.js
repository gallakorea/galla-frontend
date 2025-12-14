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
 * FILE UPLOAD – THUMBNAIL
 ***************************************************/
thumbBtn.onclick = () => thumbInput.click();

thumbInput.onchange = e => {
  const f = e.target.files[0];
  if (!f) return;

  thumbPreview.innerHTML = `
    <div class="preview-box">
      <div class="preview-label">미리보기</div>
      <img src="${URL.createObjectURL(f)}" />
    </div>
  `;
};

/***************************************************
 * FILE UPLOAD – VIDEO
 ***************************************************/
videoBtn.onclick = () => videoInput.click();

videoInput.onchange = e => {
  const f = e.target.files[0];
  if (!f) return;

  videoPreview.innerHTML = `
    <div class="preview-box video">
      <div class="preview-label">미리보기</div>
      <div class="video-viewport">
        <video src="${URL.createObjectURL(f)}" muted playsinline></video>
      </div>
    </div>
  `;
};

/***************************************************
 * PREVIEW (ISSUE PAGE 동일 UI)
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

  const old = document.querySelector('.issue-preview');
  if (old) old.remove();

  const thumbImg = thumbPreview.querySelector('img');
  const videoEl = videoPreview.querySelector('video');

  const preview = document.createElement('section');
  preview.className = 'issue-preview';

  let mediaHTML = '';

  // ✅ 썸네일만 있을 때
  if (thumbImg && !videoEl) {
    mediaHTML = `<img src="${thumbImg.src}" class="issue-thumb">`;
  }

  // ✅ 영상 있을 때만 video-viewport 생성
  if (videoEl) {
    mediaHTML = `
      <button class="speech-btn">🎥 1분 엘리베이터 스피치</button>
    `;
  }

  preview.innerHTML = `
    <div class="issue-card">

      <div class="issue-meta">
        <span class="issue-category">${category}</span>
        · <span class="issue-time">방금 전</span>
      </div>

      <h1 class="issue-title">${title}</h1>

      ${oneLine ? `<p class="issue-one-line">${oneLine}</p>` : ''}

      <div class="issue-author">
        작성자 · ${anon ? '익명' : '사용자'}
      </div>

      ${thumbImg ? `<img src="${thumbImg.src}" class="issue-thumb">` : ''}

      ${mediaHTML}

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
   * EDIT
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