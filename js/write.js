const aiModal = document.getElementById('aiModal');
document.getElementById('openAiModal').onclick = () => aiModal.style.display='flex';
document.getElementById('aiClose').onclick = () => aiModal.style.display='none';

document.getElementById('thumbnailBtn').onclick = () => document.getElementById('thumbnail').click();
document.getElementById('thumbnail').onchange = e => {
  const img = document.querySelector('#thumbnailPreview img');
  img.src = URL.createObjectURL(e.target.files[0]);
};

document.getElementById('videoBtn').onclick = () => document.getElementById('video').click();
document.getElementById('video').onchange = e => {
  const v = document.querySelector('#videoPreview video');
  v.src = URL.createObjectURL(e.target.files[0]);
};