const aiModal = document.getElementById('aiModal');
const openAiModal = document.getElementById('openAiModal');
const aiClose = document.getElementById('aiClose');

openAiModal.onclick = () => {
  aiModal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
};

aiClose.onclick = () => {
  aiModal.style.display = 'none';
  document.body.style.overflow = '';
};

document.getElementById('thumbnailBtn').onclick = () =>
  document.getElementById('thumbnail').click();

document.getElementById('videoBtn').onclick = () =>
  document.getElementById('video').click();

document.getElementById('thumbnail').onchange = e => {
  const file = e.target.files[0];
  if (!file) return;
  const img = document.createElement('img');
  img.src = URL.createObjectURL(file);
  document.getElementById('thumbPreview').innerHTML = '';
  document.getElementById('thumbPreview').appendChild(img);
};

document.getElementById('video').onchange = e => {
  const file = e.target.files[0];
  if (!file) return;
  const video = document.createElement('video');
  video.src = URL.createObjectURL(file);
  video.controls = true;
  document.getElementById('videoPreview').innerHTML = '';
  document.getElementById('videoPreview').appendChild(video);
};