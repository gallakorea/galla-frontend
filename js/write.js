document.addEventListener('DOMContentLoaded', () => {
  const body = document.body;
  const issuePreview = document.getElementById('issuePreview');

  const category = document.getElementById('category');
  const title = document.getElementById('title');
  const oneLine = document.getElementById('oneLine');
  const desc = document.getElementById('description');
  const anon = document.getElementById('isAnonymous');

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

  /* FILES */
  let thumbSrc = null;
  let videoSrc = null;

  document.getElementById('thumbnailBtn').onclick = () =>
    document.getElementById('thumbnail').click();

  document.getElementById('thumbnail').onchange = e => {
    thumbSrc = URL.createObjectURL(e.target.files[0]);
    document.getElementById('thumbPreview').innerHTML =
      `<img src="${thumbSrc}">`;
  };

  document.getElementById('videoBtn').onclick = () =>
    document.getElementById('video').click();

  document.getElementById('video').onchange = e => {
    videoSrc = URL.createObjectURL(e.target.files[0]);
    document.getElementById('videoPreview').innerHTML =
      `<video src="${videoSrc}" muted></video>`;
  };

  /* PREVIEW */
  document.getElementById('previewBtn').onclick = () => {
    if (!category.value || !title.value || !desc.value) {
      alert('필수 항목 입력');
      return;
    }

    issuePreview.innerHTML = `
      <section class="issue-preview">
        <div class="issue-meta">${category.value}</div>
        <h1>${title.value}</h1>
        ${oneLine.value ? `<p>${oneLine.value}</p>` : ''}
        <div>작성자 · ${anon.checked ? '익명' : '사용자'}</div>
        ${thumbSrc ? `<img src="${thumbSrc}">` : ''}
        ${videoSrc ? `<button id="playSpeech">🎥 1분 엘리베이터 스피치</button>` : ''}
        <p>${desc.value}</p>
        <button id="editBtn">수정하기</button>
      </section>
    `;

    document.getElementById('editBtn').onclick = () => {
      issuePreview.innerHTML = '';
      window.scrollTo({ top: 0 });
    };

    if (videoSrc) {
      document.getElementById('playSpeech').onclick = () => {
        const v = document.createElement('video');
        v.src = videoSrc;
        v.controls = true;
        v.style.width = '100%';
        issuePreview.appendChild(v);
      };
    }
  };
});