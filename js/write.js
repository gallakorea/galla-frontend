document.addEventListener('DOMContentLoaded', () => {
  const body = document.body;
  const issuePreview = document.getElementById('issuePreview');

  let thumbSrc = null;
  let videoSrc = null;

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

  /* THUMB */
  document.getElementById('thumbnailBtn').onclick = () =>
    document.getElementById('thumbnail').click();

  document.getElementById('thumbnail').onchange = e => {
    const f = e.target.files[0];
    if (!f) return;
    thumbSrc = URL.createObjectURL(f);
    document.getElementById('thumbPreview').innerHTML =
      `<img src="${thumbSrc}" class="preview-thumb-img">`;
  };

  /* VIDEO */
  document.getElementById('videoBtn').onclick = () =>
    document.getElementById('video').click();

  document.getElementById('video').onchange = e => {
    const f = e.target.files[0];
    if (!f) return;
    videoSrc = URL.createObjectURL(f);
    document.getElementById('videoPreview').innerHTML =
      `<video src="${videoSrc}" muted playsinline></video>`;
  };

  /* PREVIEW */
  document.getElementById('previewBtn').onclick = () => {
    issuePreview.innerHTML = `
      <section class="issue-preview">
        ${thumbSrc ? `<div class="preview-media"><img src="${thumbSrc}"></div>` : ''}
        ${videoSrc ? `<button class="speech-btn" data-play>🎥 1분 엘리베이터 스피치</button>` : ''}
      </section>`;
  };

  /* SPEECH MODAL */
  const speechModal = document.getElementById('speechModal');
  const speechVideo = document.getElementById('speechVideo');

  issuePreview.addEventListener('click', e => {
    if (e.target.dataset.play !== undefined) {
      speechVideo.src = videoSrc;
      speechModal.style.display = 'flex';
      body.style.overflow = 'hidden';
      speechVideo.play();
    }
  });

  document.getElementById('closeSpeech').onclick = () => {
    speechVideo.pause();
    speechVideo.src = '';
    speechModal.style.display = 'none';
    body.style.overflow = '';
  };
});