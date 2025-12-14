document.addEventListener('DOMContentLoaded', () => {

  const raw = sessionStorage.getItem('galla_preview');
  if (!raw) {
    alert('미리보기 데이터가 없습니다.');
    return;
  }

  const data = JSON.parse(raw);

  /* =========================
     TEXT DATA
  ========================= */
  const categoryEl = document.getElementById('preview-category');
  const titleEl = document.getElementById('preview-title');
  const oneLineEl = document.getElementById('preview-oneline');
  const authorEl = document.getElementById('preview-author');
  const descEl = document.getElementById('preview-desc');

  if (categoryEl) categoryEl.textContent = data.category || '';
  if (titleEl) titleEl.textContent = data.title || '';
  if (oneLineEl) oneLineEl.textContent = data.oneLine || '';
  if (descEl) descEl.textContent = data.description || '';

  if (authorEl) {
    authorEl.textContent = data.isAnonymous ? '작성자 · 익명' : '작성자 · 공개';
  }

  /* =========================
     THUMBNAIL
  ========================= */
  const thumbEl = document.getElementById('preview-thumb');
  if (thumbEl && data.thumbnailUrl) {
    thumbEl.src = data.thumbnailUrl;
    thumbEl.hidden = false; // 🔥 이거 없으면 절대 안 보임
  }

  /* =========================
     VIDEO (1분 엘리베이터 스피치)
  ========================= */
  const speechBtn = document.getElementById('speechBtn');
  const speechBackdrop = document.getElementById('speechBackdrop');
  const speechVideo = document.getElementById('speechVideo');
  const speechClose = document.querySelector('.speech-close');

  if (data.videoUrl && speechBtn && speechVideo) {
    speechBtn.hidden = false;
    speechVideo.src = data.videoUrl;
  }

  speechBtn?.addEventListener('click', () => {
    speechBackdrop.hidden = false;
    speechVideo.play();
  });

  speechClose?.addEventListener('click', () => {
    speechBackdrop.hidden = true;
    speechVideo.pause();
  });

});