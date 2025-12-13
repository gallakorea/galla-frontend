const data = JSON.parse(sessionStorage.getItem('previewIssue'));
if (!data) location.href = 'write.html';

document.getElementById('issue-category').innerText = data.category;
document.getElementById('issue-title').innerText = data.title;
document.getElementById('issue-desc').innerText = data.oneLine;
document.getElementById('issue-explain-text').innerText = data.description;

document.getElementById('issue-author').innerText =
  data.isAnonymous ? '작성자 · 익명' : '작성자 · 나';

if (data.thumb) {
  const img = document.getElementById('issue-thumb');
  img.src = data.thumb;
  img.hidden = false;
}

if (data.video) {
  document.getElementById('speechBtn').hidden = false;
  // 실제 영상 재생은 다음 단계
}

document.getElementById('publishBtn').onclick = () => {
  // 👉 여기서 supabase insert
  alert('발행 처리 (다음 단계)');
};