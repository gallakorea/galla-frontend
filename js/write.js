document.addEventListener('DOMContentLoaded', () => {

  const body = document.body;

  const previewBtn = document.getElementById('previewBtn');

  const category = document.getElementById('category');
  const title = document.getElementById('title');
  const oneLine = document.getElementById('oneLine');
  const description = document.getElementById('description');
  const isAnonymous = document.getElementById('isAnonymous');

  const thumbnailInput = document.getElementById('thumbnail');
  const videoInput = document.getElementById('video');
  const thumbPreview = document.getElementById('thumbPreview');
  const videoPreview = document.getElementById('videoPreview');

  const thumbnailBtn = document.getElementById('thumbnailBtn');
  const videoBtn = document.getElementById('videoBtn');

  let thumbnailURL = null;
  let videoURL = null;

  /* 파일 선택 */
  thumbnailBtn.onclick = () => thumbnailInput.click();
  videoBtn.onclick = () => videoInput.click();

  thumbnailInput.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    thumbnailURL = URL.createObjectURL(file);
    thumbPreview.innerHTML = `<img src="${thumbnailURL}">`;
  };

  videoInput.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    videoURL = URL.createObjectURL(file);
    videoPreview.innerHTML = `<video src="${videoURL}" controls></video>`;
  };

  /* 미리보기 */
  previewBtn.onclick = () => {

    if (!category.value || !title.value || !description.value) {
      alert('카테고리, 제목, 설명은 필수입니다.');
      return;
    }

    const data = {
      category: category.value,
      title: title.value,
      oneLine: oneLine.value,
      description: description.value,
      isAnonymous: isAnonymous.checked,
      thumbnailURL,
      videoURL
    };

    sessionStorage.setItem('galla_preview', JSON.stringify(data));
    location.href = 'preview.html';
  };

  /* AI 모달 */
  const aiModal = document.getElementById('aiModal');
  document.getElementById('openAiModal').onclick = () => {
    aiModal.style.display = 'flex';
    body.style.overflow = 'hidden';
  };
  document.getElementById('aiClose').onclick = () => {
    aiModal.style.display = 'none';
    body.style.overflow = '';
  };
});