document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('writeForm');
  const issuePreview = document.getElementById('issuePreview');

  const category = document.getElementById('category');
  const title = document.getElementById('title');
  const oneLine = document.getElementById('oneLine');
  const desc = document.getElementById('description');
  const anon = document.getElementById('isAnonymous');

  /* 썸네일 */
  const thumbInput = document.getElementById('thumbnail');
  const thumbBtn = document.getElementById('thumbnailBtn');
  const thumbPreview = document.getElementById('thumbPreview');
  let thumbSrc = null;

  thumbBtn.addEventListener('click', () => thumbInput.click());
  thumbInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    thumbSrc = URL.createObjectURL(file);
    thumbPreview.innerHTML = `<img src="${thumbSrc}" class="preview-thumb-img">`;
  });

  /* AI MODAL */
  const aiModal = document.getElementById('aiModal');
  document.getElementById('openAiModal').onclick = () => {
    aiModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  };
  document.getElementById('aiClose').onclick = () => {
    aiModal.style.display = 'none';
    document.body.style.overflow = '';
  };

  /* PREVIEW */
  form.addEventListener('submit', e => {
    e.preventDefault();

    if (!category.value || !title.value || !desc.value) {
      alert('필수 항목을 입력하세요');
      return;
    }

    issuePreview.innerHTML = `
      <section class="issue-preview">
        <div class="issue-meta">${category.value} · 방금 전</div>
        <h1 class="issue-title">${title.value}</h1>
        ${oneLine.value ? `<p class="issue-one-line">${oneLine.value}</p>` : ''}
        <div class="issue-author">작성자 · ${anon.checked ? '익명' : '사용자'}</div>
        ${thumbSrc ? `<img src="${thumbSrc}" class="preview-thumb-img">` : ''}
        <section class="issue-summary">
          <h3>📝 이 주제에 대한 핵심 요약</h3>
          <p>${desc.value}</p>
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