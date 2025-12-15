const body = document.body;

/* FORM */
const form = document.getElementById('writeForm');
const issuePreview = document.getElementById('issuePreview');

/* INPUT ELEMENTS */
const categoryEl = document.getElementById('category');
const titleEl = document.getElementById('title');
const oneLineEl = document.getElementById('oneLine');
const descEl = document.getElementById('description');
const anonEl = document.getElementById('isAnonymous');

/* THUMBNAIL */
const thumbInput = document.getElementById('thumbnail');
const thumbBtn = document.getElementById('thumbnailBtn');
const thumbPreview = document.getElementById('thumbPreview');

thumbBtn.addEventListener('click', () => thumbInput.click());

thumbInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  thumbPreview.innerHTML = `<img src="${URL.createObjectURL(file)}">`;
});

/* VIDEO */
const videoInput = document.getElementById('video');
const videoBtn = document.getElementById('videoBtn');
const videoPreview = document.getElementById('videoPreview');

videoBtn.addEventListener('click', () => videoInput.click());

videoInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  videoPreview.innerHTML = `<video src="${URL.createObjectURL(file)}" muted></video>`;
});

/* PREVIEW SUBMIT */
form.addEventListener('submit', e => {
  e.preventDefault(); // ✅ 리셋 방지

  const category = categoryEl.value.trim();
  const title = titleEl.value.trim();
  const oneLine = oneLineEl.value.trim();
  const desc = descEl.value.trim();
  const anon = anonEl.checked;

  if (!category || !title || !desc) {
    alert('필수 입력 누락');
    return;
  }

  const thumbImg = thumbPreview.querySelector('img');
  const videoEl = videoPreview.querySelector('video');

  issuePreview.innerHTML = `
    <section class="issue-preview">
      <div class="issue-meta">${category} · 방금 전</div>
      <h1 class="issue-title">${title}</h1>
      ${oneLine ? `<p class="issue-one-line">${oneLine}</p>` : ''}
      <div class="issue-author">작성자 · ${anon ? '익명' : '사용자'}</div>

      ${thumbImg ? `<img src="${thumbImg.src}" class="preview-thumb-img">` : ''}

      ${
        videoEl
          ? `<button class="speech-btn" id="openSpeech">🎥 1분 엘리베이터 스피치</button>`
          : ''
      }

      <section class="issue-summary">
        <p>${desc}</p>
      </section>
    </section>
  `;

  if (videoEl) {
    document.getElementById('openSpeech').addEventListener('click', () => {
      openSpeech(videoEl.src);
    });
  }

  issuePreview.scrollIntoView({ behavior: 'smooth' });
});

/* VIDEO MODAL */
const speechModal = document.getElementById('speechModal');
const speechVideo = document.getElementById('speechVideo');
const closeSpeechBtn = document.getElementById('closeSpeech');

function openSpeech(src) {
  speechVideo.src = src;
  speechModal.style.display = 'flex';
  body.style.overflow = 'hidden';
  speechVideo.play();
}

closeSpeechBtn.addEventListener('click', () => {
  speechVideo.pause();
  speechModal.style.display = 'none';
  body.style.overflow = '';
});