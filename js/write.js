/* =========================
   DOM ELEMENTS
========================= */
const body = document.body;

const writeForm = document.getElementById('writeForm');
const issuePreview = document.getElementById('issuePreview');

// AI Modal
const aiModal = document.getElementById('aiModal');
const openAiModalBtn = document.getElementById('openAiModal');
const aiCloseBtn = document.getElementById('aiClose');

// Thumbnail
const thumbnailInput = document.getElementById('thumbnail');
const thumbnailBtn = document.getElementById('thumbnailBtn');
const thumbPreview = document.getElementById('thumbPreview');

// Video
const videoInput = document.getElementById('video');
const videoBtn = document.getElementById('videoBtn');
const videoPreview = document.getElementById('videoPreview');

/* =========================
   AI MODAL
========================= */
openAiModalBtn.addEventListener('click', () => {
  aiModal.style.display = 'flex';
  body.style.overflow = 'hidden';
});

aiCloseBtn.addEventListener('click', () => {
  aiModal.style.display = 'none';
  body.style.overflow = '';
});

aiModal.addEventListener('click', (e) => {
  if (e.target === aiModal) {
    aiModal.style.display = 'none';
    body.style.overflow = '';
  }
});

/* =========================
   FILE UPLOAD
========================= */
thumbnailBtn.addEventListener('click', () => thumbnailInput.click());
videoBtn.addEventListener('click', () => videoInput.click());

thumbnailInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  thumbPreview.innerHTML = '';
  const img = document.createElement('img');
  img.src = URL.createObjectURL(file);
  thumbPreview.appendChild(img);
});

videoInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  videoPreview.innerHTML = '';
  const video = document.createElement('video');
  video.src = URL.createObjectURL(file);
  video.controls = true;
  videoPreview.appendChild(video);
});

/* =========================
   PREVIEW SUBMIT (🔥 단 하나)
========================= */
writeForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const category = document.getElementById('category').value;
  const title = document.getElementById('title').value;
  const oneLine = document.getElementById('oneLine').value;
  const desc = document.getElementById('description').value;
  const isAnon = document.getElementById('isAnonymous').checked;

  if (!category || !title || !desc) {
    alert('카테고리 / 제목 / 설명은 필수입니다.');
    return;
  }

  const thumbImg = thumbPreview.querySelector('img');
  const thumbHtml = thumbImg
    ? `<div class="issue-thumb-wrap">
         <img src="${thumbImg.src}" />
       </div>`
    : '';

  issuePreview.innerHTML = `
    <section class="issue-preview">

      <div class="issue-hero">
        <div style="font-size:12px;color:#aaa;">
          ${category} · 방금 전
        </div>

        <h1 style="margin-top:8px;">${title}</h1>
        <p style="color:#ccc;font-size:14px;">${oneLine || ''}</p>

        <div style="font-size:12px;color:#888;margin-top:6px;">
          작성자 · ${isAnon ? '익명' : '사용자'}
        </div>
      </div>

      ${thumbHtml}

      <section class="issue-explain">
        <h3 class="white-title">📝 이 주제에 대한 핵심 요약</h3>
        <p>${desc}</p>
      </section>

      <div class="preview-actions">
        <button type="button" id="editPreviewBtn" class="btn-sub">수정하기</button>
        <button type="button" id="publishBtn" class="btn-main">발행하기</button>
      </div>

    </section>
  `;

  issuePreview.style.display = 'block';
  issuePreview.scrollIntoView({ behavior: 'smooth' });

  // 수정하기
  document.getElementById('editPreviewBtn').addEventListener('click', () => {
    issuePreview.style.display = 'none';
    issuePreview.innerHTML = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // 발행하기 (지금은 더미)
  document.getElementById('publishBtn').addEventListener('click', () => {
    alert('다음 단계: Supabase에 발행');
  });
});