document.addEventListener('DOMContentLoaded', () => {

  const previewBtn = document.getElementById('previewBtn');

  const category = document.getElementById('category');
  const title = document.getElementById('title');
  const oneLine = document.getElementById('oneLine');
  const description = document.getElementById('description');
  const isAnonymous = document.getElementById('isAnonymous');

  const thumbnailInput = document.getElementById('thumbnail');
  const videoInput = document.getElementById('video');

  function fileToBase64(file) {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  }

  previewBtn.addEventListener('click', async () => {

    /* ✅ JS에서 직접 필수값 검사 */
    if (!category.value || !title.value || !description.value) {
      alert('카테고리, 제목, 이슈 설명은 필수입니다.');
      return;
    }

    const data = {
      category: category.value,
      title: title.value,
      oneLine: oneLine.value,
      description: description.value,
      isAnonymous: isAnonymous.checked,
      createdAt: new Date().toISOString(),
      thumbnailBase64: null,
      videoBase64: null
    };

    if (thumbnailInput.files[0]) {
      data.thumbnailBase64 = await fileToBase64(thumbnailInput.files[0]);
    }

    if (videoInput.files[0]) {
      data.videoBase64 = await fileToBase64(videoInput.files[0]);
    }

    sessionStorage.setItem('galla_preview', JSON.stringify(data));

    /* 🔥 여기까지 오면 100% 이동 */
    location.href = 'preview.html';
  });

});