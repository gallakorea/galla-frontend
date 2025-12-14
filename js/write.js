document.addEventListener('DOMContentLoaded', () => {

  const body = document.body;

  /* =====================
     ELEMENTS
  ===================== */
  const form = document.getElementById('writeForm');
  const previewArea = document.getElementById('previewArea');

  const thumbnailInput = document.getElementById('thumbnail');
  const thumbnailBtn = document.getElementById('thumbnailBtn');
  const thumbPreview = document.getElementById('thumbPreview');

  const videoInput = document.getElementById('video');
  const videoBtn = document.getElementById('videoBtn');
  const videoPreview = document.getElementById('videoPreview');

  const aiModal = document.getElementById('aiModal');
  const openAiModalBtn = document.getElementById('openAiModal');
  const aiCloseBtn = document.getElementById('aiClose');

  /* =====================
     SAFETY CHECK
  ===================== */
  if (!form || !thumbnailBtn || !openAiModalBtn) {
    console.error('필수 DOM 누락');
    return;
  }

  /* =====================
     AI MODAL
  ===================== */
  openAiModalBtn.addEventListener('click', () => {
    aiModal.style.display = 'flex';
    body.style.overflow = 'hidden';
  });

  aiCloseBtn.addEventListener('click', closeAi);
  aiModal.addEventListener('click', (e) => {
    if (e.target === aiModal) closeAi();
  });

  function closeAi() {
    aiModal.style.display = 'none';
    body.style.overflow = '';
  }

  /* =====================
     THUMBNAIL UPLOAD
  ===================== */
  thumbnailBtn.addEventListener('click', () => {
    thumbnailInput.click();
  });

  thumbnailInput.addEventListener('change', () => {
    const file = thumbnailInput.files[0];
    if (!file) return;

    thumbPreview.innerHTML = '';
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    img.style.maxHeight = '240px';
    img.style.objectFit = 'cover';

    thumbPreview.appendChild(img);
  });

  /* =====================
     VIDEO UPLOAD
  ===================== */
  videoBtn.addEventListener('click', () => {
    videoInput.click();
  });

  videoInput.addEventListener('change', () => {
    const file = videoInput.files[0];
    if (!file) return;

    videoPreview.innerHTML = '';
    const video = document.createElement('video');
    video.src = URL.createObjectURL(file);
    video.controls = true;

    videoPreview.appendChild(video);
  });

  /* =====================
     PREVIEW
  ===================== */
  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const data = {
      category: document.getElementById('category').value,
      title: document.getElementById('title').value,
      oneLine: document.getElementById('oneLine').value,
      desc: document.getElementById('description').value,
    };

    if (!data.category || !data.title || !data.desc) {
      alert('카테고리 / 제목 / 설명 필수');
      return;
    }

    renderPreview(data);
  });

  function renderPreview(data) {
    previewArea.innerHTML = `
      <div class="preview-issue">
        <div class="preview-header">
          <div style="font-size:12px;color:#888">${data.category} · 방금 전</div>
          <h2>${data.title}</h2>
          <p>${data.oneLine}</p>
        </div>

        ${thumbPreview.innerHTML ? `
          <div class="preview-thumb">${thumbPreview.innerHTML}</div>` : ''}

        <div class="preview-header">
          <p>${data.desc}</p>
        </div>

        <div class="preview-actions">
          <button id="editBtn" class="btn-edit">수정하기</button>
          <button id="publishBtn" class="btn-publish">발행하기</button>
        </div>
      </div>
    `;

    document.getElementById('editBtn').onclick = () => {
      previewArea.innerHTML = '';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    document.getElementById('publishBtn').onclick = () => {
      console.log('발행 데이터', data);
      alert('발행 로직 연결 예정');
    };
  }

});