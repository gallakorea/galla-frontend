document.addEventListener('DOMContentLoaded', () => {

  const dataRaw = sessionStorage.getItem('galla_preview');
  if (!dataRaw) {
    alert('미리보기 데이터가 없습니다.');
    location.href = 'write.html';
    return;
  }

  const data = JSON.parse(dataRaw);

  // TEXT
  document.getElementById('preview-category').textContent = data.category;
  document.getElementById('preview-title').textContent = data.title;
  document.getElementById('preview-oneline').textContent = data.oneLine;
  document.getElementById('preview-desc').textContent = data.description;

  document.getElementById('preview-author').textContent =
    data.isAnonymous ? '작성자 · 익명' : '작성자 · 공개';

  // THUMBNAIL
  if (data.thumbnailUrl) {
    const thumb = document.getElementById('preview-thumb');
    thumb.src = data.thumbnailUrl;
    thumb.hidden = false;
  }

  // VIDEO
  const speechBtn = document.getElementById('speechBtn');
  const backdrop = document.getElementById('speechBackdrop');
  const videoEl = document.getElementById('speechVideo');
  const closeBtn = document.querySelector('.speech-close');

  if (data.videoUrl) {
    speechBtn.hidden = false;
    videoEl.src = data.videoUrl;

    speechBtn.onclick = () => {
      backdrop.hidden = false;
    };

    closeBtn.onclick = () => {
      videoEl.pause();
      backdrop.hidden = true;
    };

    backdrop.onclick = (e) => {
      if (e.target === backdrop) {
        videoEl.pause();
        backdrop.hidden = true;
      }
    };
  }
});