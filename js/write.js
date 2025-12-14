document.addEventListener('DOMContentLoaded', () => {
  const previewBtn = document.getElementById('previewBtn');

  const category = document.getElementById('category');
  const title = document.getElementById('title');
  const oneLine = document.getElementById('oneLine');
  const description = document.getElementById('description');
  const isAnonymous = document.getElementById('isAnonymous');

  const thumbnailInput = document.getElementById('thumbnail');
  const thumbnailBtn = document.getElementById('thumbnailBtn');
  const thumbPreview = document.getElementById('thumbPreview');

  const videoInput = document.getElementById('video');
  const videoBtn = document.getElementById('videoBtn');
  const videoPreview = document.getElementById('videoPreview');

  thumbnailBtn.onclick = () => thumbnailInput.click();
  videoBtn.onclick = () => videoInput.click();

  let thumbURL = null;
  let videoURL = null;

  thumbnailInput.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    thumbURL = URL.createObjectURL(file);
    thumbPreview.innerHTML = `<img src="${thumbURL}">`;
  };

  videoInput.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    videoURL = URL.createObjectURL(file);
    videoPreview.innerHTML = `<video src="${videoURL}" controls></video>`;
  };

  previewBtn.onclick = () => {
    if (!category.value || !title.value || !description.value) {
      alert('카테고리, 제목, 이슈 설명은 필수입니다.');
      return;
    }

    const previewData = {
      category: category.value,
      title: title.value,
      oneLine: oneLine.value,
      description: description.value,
      isAnonymous: isAnonymous.checked,
      thumbURL,
      videoURL,
      createdAt: Date.now()
    };

    sessionStorage.setItem('galla_preview', JSON.stringify(previewData));
    location.href = 'preview.html';
  };
});