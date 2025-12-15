document.addEventListener('DOMContentLoaded', () => {
  const body = document.body;
  const form = document.getElementById('writeForm');

  const categoryEl = document.getElementById('category');
  const titleEl = document.getElementById('title');
  const oneLineEl = document.getElementById('oneLine');
  const descEl = document.getElementById('description');
  const anonEl = document.getElementById('isAnonymous');

  const issuePreview = document.createElement('section');
  issuePreview.id = 'issuePreview';
  form.after(issuePreview);

  /* =========================
     AI MODAL
  ========================= */
  const aiModal = document.getElementById('aiModal');
  document.getElementById('openAiModal').onclick = () => {
    aiModal.style.display = 'flex';
    body.style.overflow = 'hidden';
  };
  document.getElementById('aiClose').onclick = () => {
    aiModal.style.display = 'none';
    body.style.overflow = '';
  };

  /* =========================
     THUMBNAIL
  ========================= */
  const thumbInput = document.getElementById('thumbnail');
  const thumbBtn = document.getElementById('thumbnailBtn');
  const thumbPreview = document.getElementById('thumbPreview');
  let thumbSrc = null;

  thumbBtn.onclick = () => thumbInput.click();
  thumbInput.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    thumbSrc = URL.createObjectURL(file);
    thumbPreview.innerHTML = `<img src="${thumbSrc}">`;
  };

  /* =========================
     VIDEO
  ========================= */
  const videoInput = document.getElementById('video');
  const videoBtn = document.getElementById('videoBtn');
  const videoPreview = document.getElementById('videoPreview');
  let videoSrc = null;

  videoBtn.onclick = () => videoInput.click();
  videoInput.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    videoSrc = URL.createObjectURL(file);
    videoPreview.innerHTML = `<video src="${videoSrc}" muted></video>`;
  };

  /* =========================
     PREVIEW RENDER
  ========================= */
  form.addEventListener('submit', e => {
    e.preventDefault();

    if (!categoryEl.value || !titleEl.value || !descEl.value) {
      alert('필수 항목을 입력하세요');
      return;
    }

    issuePreview.innerHTML = `
      <section class="issue-preview">
        <div class="issue-meta">${categoryEl.value} · 방금 전</div>
        <h1 class="issue-title">${titleEl.value}</h1>
        ${oneLineEl.value ? `<p class="issue-one-line">${oneLineEl.value}</p>` : ''}
        <div class="issue-author">작성자 · ${anonEl.checked ? '익명' : '사용자'}</div>

        ${thumbSrc ? `<img src="${thumbSrc}" class="preview-thumb-img">` : ''}

        ${videoSrc ? `<div class="preview-box"><video src="${videoSrc}" controls></video></div>` : ''}

        <section class="issue-summary">
          <h3>📝 이 주제에 대한 핵심 요약</h3>
          <p>${descEl.value}</p>
        </section>

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

    issuePreview.scrollIntoView({ behavior: 'smooth' });
  });
});