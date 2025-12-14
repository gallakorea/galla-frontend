document.addEventListener('DOMContentLoaded', () => {

  const previewBtn = document.getElementById('previewBtn');

  const category = document.getElementById('category');
  const title = document.getElementById('title');
  const oneLine = document.getElementById('oneLine');
  const description = document.getElementById('description');
  const isAnonymous = document.getElementById('isAnonymous');

  const thumbnailInput = document.getElementById('thumbnail');
  const videoInput = document.getElementById('video');

  /* =========================
     FILE → BASE64 (이미지만)
  ========================= */
  const fileToBase64 = (file) =>
    new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });

  /* =========================
     PREVIEW
  ========================= */
  previewBtn.onclick = async () => {

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
      createdAt: new Date().toISOString(),

      // ✅ 안전
      thumbnailBase64: null,

      // 🔥 핵심: 영상은 URL만
      videoPreviewUrl: null
    };

    if (thumbnailInput.files[0]) {
      previewData.thumbnailBase64 =
        await fileToBase64(thumbnailInput.files[0]);
    }

    if (videoInput.files[0]) {
      previewData.videoPreviewUrl =
        URL.createObjectURL(videoInput.files[0]);
    }

    try {
      sessionStorage.setItem(
        'galla_preview',
        JSON.stringify(previewData)
      );
    } catch (e) {
      alert('파일 용량이 너무 큽니다. 영상은 미리보기에서만 표시됩니다.');
      return;
    }

    location.href = 'preview.html';
  };

});