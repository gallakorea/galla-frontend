const body = document.body;
const form = document.getElementById('writeForm');
const issuePreview = document.getElementById('issuePreview');

/* AI MODAL */
const aiModal = document.getElementById('aiModal');
document.getElementById('openAiModal').onclick = () => {
  aiModal.style.display = 'flex';
  body.style.overflow = 'hidden';
};
document.getElementById('aiClose').onclick = () => {
  aiModal.style.display = 'none';
  body.style.overflow = '';
};

/* FILE UPLOAD */
const thumbInput = document.getElementById('thumbnail');
const videoInput = document.getElementById('video');
document.getElementById('thumbnailBtn').onclick = () => thumbInput.click();
document.getElementById('videoBtn').onclick = () => videoInput.click();

thumbInput.onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  document.getElementById('thumbPreview').innerHTML = `
    <div class="preview-media" data-preview="true">
      <img src="${URL.createObjectURL(f)}" class="preview-thumb-img">
    </div>`;
};

videoInput.onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  document.getElementById('videoPreview').innerHTML = `
    <div class="video-viewport" data-preview="true">
      <video src="${URL.createObjectURL(f)}" muted></video>
    </div>`;
};

/* PREVIEW */
form.onsubmit = e => {
  e.preventDefault();

  const category = category.value;
  const title = document.getElementById('title').value;
  const oneLine = document.getElementById('oneLine').value;
  const desc = document.getElementById('description').value;
  const anon = document.getElementById('isAnonymous').checked;

  if (!category || !title || !desc) {
    alert('필수 항목을 입력하세요');
    return;
  }

  const thumb = document.querySelector('#thumbPreview img');
  const video = document.querySelector('#videoPreview video');

  issuePreview.innerHTML = `
    <section class="issue-preview">
      <div class="issue-meta">${category} · 방금 전</div>
      <h1 class="issue-title">${title}</h1>
      ${oneLine ? `<p class="issue-one-line">${oneLine}</p>` : ''}
      <div class="issue-author">작성자 · ${anon ? '익명' : '사용자'}</div>

      ${thumb ? `<img src="${thumb.src}" class="preview-thumb-img">` : ''}
      ${video ? `<button class="speech-btn" id="openSpeech">🎥 1분 엘리베이터 스피치</button>` : ''}

      <div class="issue-summary">
        <h3>📝 이 주제에 대한 핵심 요약</h3>
        <p>${desc}</p>
      </div>

      <div class="preview-actions">
        <button id="editPreview">수정하기</button>
        <button class="btn-publish">발행하기</button>
      </div>
    </section>
  `;

  document.getElementById('editPreview').onclick = () => {
    issuePreview.innerHTML = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (video) {
    document.getElementById('openSpeech').onclick = () => {
      document.getElementById('speechVideo').src = video.src;
      document.getElementById('speechModal').style.display = 'flex';
      body.style.overflow = 'hidden';
    };
  }

  issuePreview.scrollIntoView({ behavior: 'smooth' });
};

/* SPEECH CLOSE */
document.getElementById('closeSpeech').onclick = () => {
  document.getElementById('speechVideo').pause();
  document.getElementById('speechModal').style.display = 'none';
  body.style.overflow = '';
};