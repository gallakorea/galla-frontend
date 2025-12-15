const body = document.body;
const form = document.getElementById('writeForm');
const issuePreview = document.getElementById('issuePreview');

let thumbSrc = null;
let videoSrc = null;

/* FILE UPLOAD */
thumbnailBtn.onclick = () => thumbnail.click();
thumbnail.onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  thumbSrc = URL.createObjectURL(f);
  thumbPreview.innerHTML = `<img src="${thumbSrc}" class="preview-thumb-img">`;
};

videoBtn.onclick = () => video.click();
video.onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  videoSrc = URL.createObjectURL(f);
};

/* AI MODAL */
openAiModal.onclick = () => {
  aiModal.style.display = 'flex';
  body.style.overflow = 'hidden';
};
aiClose.onclick = () => {
  aiModal.style.display = 'none';
  body.style.overflow = '';
};

/* PREVIEW */
form.onsubmit = e => {
  e.preventDefault();

  issuePreview.innerHTML = `
    <section class="issue-preview">
      <h1>${title.value}</h1>
      ${thumbSrc ? `<img src="${thumbSrc}" class="preview-thumb-img">` : ''}
      ${videoSrc ? `<button class="speech-btn" id="openSpeech">🎥 1분 엘리베이터 스피치</button>` : ''}
      <p>${description.value}</p>
      <button id="editPreview">수정하기</button>
    </section>
  `;

  editPreview.onclick = () => issuePreview.innerHTML = '';
  if (videoSrc) openSpeech.onclick = () => openSpeechModal(videoSrc);
};

/* SPEECH */
function openSpeechModal(src) {
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