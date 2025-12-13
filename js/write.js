const aiModal = document.getElementById('aiModal');
document.getElementById('openAiModal').onclick = () => aiModal.style.display = 'flex';
document.getElementById('aiClose').onclick = () => aiModal.style.display = 'none';

document.getElementById('thumbnailBtn').onclick = () => document.getElementById('thumbnail').click();
document.getElementById('thumbnail').onchange = e => {
  const img = document.querySelector('#thumbPreview img');
  img.src = URL.createObjectURL(e.target.files[0]);
  document.getElementById('thumbPreview').style.display = 'block';
};

document.getElementById('videoBtn').onclick = () => document.getElementById('video').click();
document.getElementById('video').onchange = e => {
  const video = document.querySelector('#videoPreview video');
  video.src = URL.createObjectURL(e.target.files[0]);
  document.getElementById('videoPreview').style.display = 'block';
};

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.onclick = () => location.href = btn.dataset.target;
});