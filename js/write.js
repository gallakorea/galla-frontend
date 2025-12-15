// write.js — 동작 복구 최종본

const body = document.body;
const form = document.getElementById('writeForm');

const categoryEl = document.getElementById('category');
const titleEl = document.getElementById('title');
const oneLineEl = document.getElementById('oneLine');
const descEl = document.getElementById('description');

const thumbInput = document.getElementById('thumbnail');
const thumbBtn = document.getElementById('thumbnailBtn');
const thumbPreview = document.getElementById('thumbPreview');

const videoInput = document.getElementById('video');
const videoBtn = document.getElementById('videoBtn');
const videoPreview = document.getElementById('videoPreview');

thumbBtn.onclick = () => thumbInput.click();
thumbInput.onchange = e => {
  const f = e.target.files[0];
  if (f) thumbPreview.innerHTML = `<img src="${URL.createObjectURL(f)}">`;
};

videoBtn.onclick = () => videoInput.click();
videoInput.onchange = e => {
  const f = e.target.files[0];
  if (f) videoPreview.innerHTML = `<video src="${URL.createObjectURL(f)}" muted></video>`;
};

const aiModal = document.getElementById('aiModal');
document.getElementById('openAiModal').onclick = () => {
  aiModal.style.display = 'flex';
  body.style.overflow = 'hidden';
};
document.getElementById('aiClose').onclick = () => {
  aiModal.style.display = 'none';
  body.style.overflow = '';
};

const speechModal = document.getElementById('speechModal');
const speechVideo = document.getElementById('speechVideo');
document.getElementById('closeSpeech').onclick = () => {
  speechVideo.pause();
  speechModal.style.display = 'none';
  body.style.overflow = '';
};

form.onsubmit = e => {
  e.preventDefault();
  alert('미리보기 정상 실행');
};