document.addEventListener('DOMContentLoaded', () => {
  const body = document.body;

  const category = document.getElementById('category');
  const title = document.getElementById('title');
  const oneLine = document.getElementById('oneLine');
  const desc = document.getElementById('description');
  const anon = document.getElementById('isAnonymous');
  const previewBtn = document.getElementById('previewBtn');
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

  /* THUMBNAIL */
  let thumbSrc = null;
  document.getElementById('thumbnailBtn').onclick = () =>
    document.getElementById('thumbnail').click();

  document.getElementById('thumbnail').onchange = e => {
    const f = e.target.files[0];
    if (!f) return;
    thumbSrc = URL.createObjectURL(f);
    document.getElementById('thumbPreview').innerHTML =
      `<img src="${thumbSrc}">`;
  };

  /* VIDEO */
  let videoSrc = null;
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
  previewBtn.onclick = () => {
    if (!category.value || !title.value || !desc.value) {
      alert('필수 항목을 입력하세요');
      return;
    }

    issuePreview.innerHTML = `
      <div class="issue-preview">
        <h2>${title.value}</h2>
        <p>${oneLine.value || ''}</p>
        <p>작성자 · ${anon.checked ? '익명' : '사용자'}</p>
        ${thumbSrc ? `<img src="${thumbSrc}">` : ''}
        ${videoSrc ? `<button id="playSpeech" class="speech-btn">🎥 1분 엘리베이터 스피치</button>` : ''}
        <p>${desc.value}</p>
        <button id="editPreview">수정하기</button>
      </div>
    `;

    if (videoSrc) {
      document.getElementById('playSpeech').onclick = () => {
        const m = document.getElementById('speechModal');
        const v = document.getElementById('speechVideo');
        v.src = videoSrc;
        m.style.display = 'flex';
        body.style.overflow = 'hidden';
      };
    }

    document.getElementById('editPreview').onclick = () => {
      issuePreview.innerHTML = '';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
  };

  /* SPEECH CLOSE */
  document.getElementById('closeSpeech').onclick = () => {
    const m = document.getElementById('speechModal');
    const v = document.getElementById('speechVideo');
    v.pause(); v.src = '';
    m.style.display = 'none';
    body.style.overflow = '';
  };
});