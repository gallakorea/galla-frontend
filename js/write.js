document.addEventListener('DOMContentLoaded', () => {
  const body = document.body;
  const form = document.getElementById('writeForm');

  const aiModal = document.getElementById('aiModal');
  document.getElementById('openAiModal').onclick = () => {
    aiModal.style.display = 'flex';
    body.style.overflow = 'hidden';
  };
  document.getElementById('aiClose').onclick = () => {
    aiModal.style.display = 'none';
    body.style.overflow = '';
  };

  const thumbInput = document.getElementById('thumbnail');
  const thumbBtn = document.getElementById('thumbnailBtn');
  const thumbPreview = document.getElementById('thumbPreview');

  thumbBtn.onclick = () => thumbInput.click();
  thumbInput.onchange = e => {
    const f = e.target.files[0];
    if (!f) return;
    thumbPreview.innerHTML = `<img src="${URL.createObjectURL(f)}">`;
  };

  const videoInput = document.getElementById('video');
  const videoBtn = document.getElementById('videoBtn');
  const videoPreview = document.getElementById('videoPreview');

  videoBtn.onclick = () => videoInput.click();
  videoInput.onchange = e => {
    const f = e.target.files[0];
    if (!f) return;
    videoPreview.innerHTML = `<video src="${URL.createObjectURL(f)}" muted></video>`;
  };

  form.onsubmit = e => {
    e.preventDefault();
    alert('미리보기 정상 동작 (다음 단계에서 렌더 연결)');
  };
});