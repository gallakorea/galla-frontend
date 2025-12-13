const data = JSON.parse(sessionStorage.getItem('galla_preview'));

if (!data) {
  alert('미리보기 데이터가 없습니다.');
  location.href = 'write.html';
}

// 텍스트
document.getElementById('pv-category').innerText = data.category;
document.getElementById('pv-title').innerText = data.title;
document.getElementById('pv-desc').innerText = data.description;
document.getElementById('pv-author').innerText =
  data.isAnonymous ? '작성자 · 익명' : '작성자 · 공개';

// 썸네일
if (data.thumbnail) {
  const img = document.getElementById('pv-thumb');
  img.src = data.thumbnail;
  img.style.display = 'block';
}

// 영상
if (data.video) {
  document.getElementById('pv-video-btn').style.display = 'block';
}

// 발행 (임시)
document.getElementById('publishBtn').onclick = () => {
  alert('다음 단계: Supabase insert');
};