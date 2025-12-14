const body = document.body;

const aiModal = document.getElementById('aiModal');
const openAiModalBtn = document.getElementById('openAiModal');
const aiCloseBtn = document.getElementById('aiClose');

openAiModalBtn.addEventListener('click', () => {
  aiModal.style.display = 'flex';
  body.style.overflow = 'hidden';
});

aiCloseBtn.addEventListener('click', () => {
  aiModal.style.display = 'none';
  body.style.overflow = '';
});

aiModal.addEventListener('click', (e) => {
  if (e.target === aiModal) {
    aiModal.style.display = 'none';
    body.style.overflow = '';
  }
});

/* FILE UPLOAD */
document.getElementById('thumbnailBtn').onclick = () =>
  document.getElementById('thumbnail').click();

document.getElementById('videoBtn').onclick = () =>
  document.getElementById('video').click();