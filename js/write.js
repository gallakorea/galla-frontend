const $ = id => document.getElementById(id);

const form = $('writeForm');
const aiModal = $('aiModal');

let thumbURL = null;
let videoURL = null;

/* AI MODAL */
$('openAiModal').onclick = () => aiModal.style.display = 'flex';
$('aiClose').onclick = () => aiModal.style.display = 'none';

$('applyAi').onclick = () => {
  $('description').value = $('aiResultText').value;
  aiModal.style.display = 'none';
};

/* FILE UPLOAD */
$('thumbnailBtn').onclick = () => $('thumbnail').click();
$('videoBtn').onclick = () => $('video').click();

$('thumbnail').onchange = e => {
  const file = e.target.files[0];
  if (!file) return;
  thumbURL = URL.createObjectURL(file);
  $('thumbPreview').innerHTML = `<img src="${thumbURL}">`;
};

$('video').onchange = e => {
  const file = e.target.files[0];
  if (!file) return;
  videoURL = URL.createObjectURL(file);
  $('videoPreview').innerHTML = `<video src="${videoURL}" controls></video>`;
};

/* PREVIEW */
form.onsubmit = e => {
  e.preventDefault();

  sessionStorage.setItem('previewData', JSON.stringify({
    category: $('category').value,
    title: $('title').value,
    oneLine: $('oneLine').value,
    description: $('description').value,
    isAnonymous: $('isAnonymous').checked,
    thumbURL,
    videoURL
  }));

  location.href = 'preview.html';
};