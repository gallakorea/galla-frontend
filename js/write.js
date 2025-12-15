document.addEventListener('DOMContentLoaded', () => {
  const body = document.body;
  const form = document.getElementById('writeForm');
  const issuePreview = document.getElementById('issuePreview');

  let thumbSrc = null;
  let videoSrc = null;

  /* ===============================
     THUMBNAIL
  =============================== */
  thumbnailBtn.onclick = () => thumbnail.click();
  thumbnail.onchange = e => {
    const f = e.target.files[0];
    if (!f) return;
    thumbSrc = URL.createObjectURL(f);
    thumbPreview.innerHTML = `
      <div class="preview-box is-preview">
        <img src="${thumbSrc}" class="preview-thumb-img">
      </div>`;
  };

  /* ===============================
     VIDEO
  =============================== */
  videoBtn.onclick = () => video.click();
  video.onchange = e => {
    const f = e.target.files[0];
    if (!f) return;
    videoSrc = URL.createObjectURL(f);
    videoPreview.innerHTML = `
      <div class="preview-box is-preview">
        <video src="${videoSrc}" muted playsinline></video>
      </div>`;
  };

  /* ===============================
     SPEECH MODAL (JS ONLY)
  =============================== */
  let speechModal, speechVideo;

  function openSpeech() {
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
            <video playsinline controls></video>
          </div>
        </div>`;
      document.body.appendChild(speechModal);
      speechVideo = speechModal.querySelector('video');

      speechModal.onclick = e => {
        if (e.target === speechModal) closeSpeech();
      };
      speechModal.querySelector('#closeSpeech').onclick = closeSpeech;
    }

    speechVideo.src = videoSrc;
    speechModal.style.display = 'flex';
    body.style.overflow = 'hidden';
    speechVideo.play();
  }

  function closeSpeech() {
    speechVideo.pause();
    speechVideo.src = '';
    speechModal.style.display = 'none';
    body.style.overflow = '';
  }

  /* ===============================
     PREVIEW
  =============================== */
  form.onsubmit = e => {
    e.preventDefault();

    issuePreview.innerHTML = `
      <section class="issue-preview">
        ${thumbSrc ? `<div class="preview-media"><img src="${thumbSrc}"></div>` : ''}
        ${videoSrc ? `<button class="speech-btn">🎥 1분 엘리베이터 스피치</button>` : ''}
        <div class="preview-actions">
          <button id="editPreview">수정하기</button>
          <button class="btn-publish">발행하기</button>
        </div>
      </section>`;

    const btn = issuePreview.querySelector('.speech-btn');
    if (btn) btn.onclick = openSpeech;
  };
});