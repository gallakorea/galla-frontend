document.addEventListener('DOMContentLoaded', () => {

  const raw = sessionStorage.getItem('galla_preview');

  if (!raw) {
    alert('미리보기 데이터가 없습니다.');
    location.href = 'write.html';
    return;
  }

  const data = JSON.parse(raw);

  document.getElementById('preview-category').textContent = data.category || '';
  document.getElementById('preview-title').textContent = data.title || '';
  document.getElementById('preview-oneline').textContent = data.oneLine || '';
  document.getElementById('preview-desc').textContent = data.description || '';

  document.getElementById('preview-author').textContent =
    data.isAnonymous ? '작성자 · 익명' : '작성자 · 공개';

  /* 썸네일 */
  if (data.thumbnailUrl) {
    document.getElementById('preview-thumb').src = data.thumbnailUrl;
  } else {
    document.getElementById('preview-thumb').style.display = 'none';
  }

  /* 영상 */
  if (data.videoUrl) {
    const btn = document.getElementById('videoBtn');
    btn.style.display = 'block';
    btn.onclick = () => window.open(data.videoUrl);
  }

  /* 버튼 */
  document.getElementById('backBtn').onclick =
  document.getElementById('editBtn').onclick = () => {
    history.back();
  };

});