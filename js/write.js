const aiModal = document.getElementById('aiModal');
document.getElementById('openAiModal').onclick = () => aiModal.style.display = 'flex';
document.getElementById('aiClose').onclick = () => aiModal.style.display = 'none';

document.getElementById('thumbnailBtn').onclick = () => thumbnail.click();
thumbnail.onchange = e => {
  const img = document.createElement('img');
  img.src = URL.createObjectURL(e.target.files[0]);
  thumbPreview.innerHTML = '미리보기';
  thumbPreview.appendChild(img);
};

videoBtn.onclick = () => video.click();
video.onchange = e => {
  const v = document.createElement('video');
  v.src = URL.createObjectURL(e.target.files[0]);
  v.controls = true;
  videoPreview.innerHTML = '미리보기';
  videoPreview.appendChild(v);
};