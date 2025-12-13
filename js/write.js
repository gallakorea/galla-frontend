/************************************************
 * ELEMENTS
 ************************************************/
const aiModal = document.getElementById('aiModal');
const openAiBtn = document.getElementById('openAiModal');
const aiCloseBtn = document.getElementById('aiClose');

const thumbnailInput = document.getElementById('thumbnail');
const thumbnailBtn = document.getElementById('thumbnailBtn');
const thumbPreview = document.getElementById('thumbPreview');

const videoInput = document.getElementById('video');
const videoBtn = document.getElementById('videoBtn');
const videoPreview = document.getElementById('videoPreview');


/************************************************
 * AI MODAL OPEN / CLOSE
 ************************************************/
if (openAiBtn && aiModal) {
  openAiBtn.addEventListener('click', () => {
    aiModal.style.display = 'flex';
    document.body.style.overflow = 'hidden'; // 배경 스크롤 방지
  });
}

if (aiCloseBtn && aiModal) {
  aiCloseBtn.addEventListener('click', () => {
    aiModal.style.display = 'none';
    document.body.style.overflow = ''; // 복구
  });
}

// 바깥 클릭 시 닫기
aiModal?.addEventListener('click', (e) => {
  if (e.target === aiModal) {
    aiModal.style.display = 'none';
    document.body.style.overflow = '';
  }
});


/************************************************
 * THUMBNAIL PREVIEW
 ************************************************/
if (thumbnailBtn && thumbnailInput) {
  thumbnailBtn.addEventListener('click', () => {
    thumbnailInput.click();
  });
}

if (thumbnailInput) {
  thumbnailInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    thumbPreview.innerHTML = '<span>미리보기</span>';

    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    img.onload = () => URL.revokeObjectURL(img.src);

    thumbPreview.appendChild(img);
  });
}


/************************************************
 * VIDEO PREVIEW (1분 엘리베이터 스피치)
 ************************************************/
if (videoBtn && videoInput) {
  videoBtn.addEventListener('click', () => {
    videoInput.click();
  });
}

if (videoInput) {
  videoInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    videoPreview.innerHTML = '<span>미리보기</span>';

    const video = document.createElement('video');
    video.src = URL.createObjectURL(file);
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';

    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
    };

    videoPreview.appendChild(video);
  });
}


/************************************************
 * AI STYLE CHIP ACTIVE TOGGLE
 ************************************************/
const styleButtons = document.querySelectorAll('.ai-style-tabs button');

styleButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    styleButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});


/************************************************
 * AI APPLY (결과 → 설명 textarea)
 ************************************************/
const applyAiBtn = document.getElementById('applyAi');
const aiResultText = document.getElementById('aiResultText');
const description = document.getElementById('description');

if (applyAiBtn) {
  applyAiBtn.addEventListener('click', () => {
    if (!aiResultText.value.trim()) return;

    description.value = aiResultText.value;
    aiModal.style.display = 'none';
    document.body.style.overflow = '';
  });
}

/************************************************
 * PREVIEW SUBMIT BLOCK (페이지 리셋 방지)
 ************************************************/
const writeForm = document.getElementById('writeForm');

if (writeForm) {
  writeForm.addEventListener('submit', (e) => {
    e.preventDefault(); // 🔥 핵심: 페이지 리셋 차단

    // === 여기서부터 미리보기용 데이터 수집 ===
    const previewData = {
      category: document.getElementById('category')?.value,
      title: document.getElementById('title')?.value,
      oneLine: document.getElementById('oneLine')?.value,
      description: document.getElementById('description')?.value,
      isAnonymous: document.getElementById('isAnonymous')?.checked || false,
      thumbnail: document.getElementById('thumbnail')?.files?.[0] || null,
      video: document.getElementById('video')?.files?.[0] || null,
    };

    console.log('🧪 PREVIEW DATA', previewData);

    // 🔹 여기서 다음 단계:
    // 1) 프리뷰 모달 띄우기
    // 2) 또는 preview.html로 이동
    // 3) 또는 issue 카드 DOM 렌더

    alert('페이지 리셋 없이 미리보기 진입 성공');
  });
}

/************************************************
 * PREVIEW MODAL RENDER
 ************************************************/
const previewModal = document.getElementById('previewModal');
const closePreview = document.getElementById('closePreview');

writeForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const category = categorySelect.value;
  const titleVal = title.value;
  const oneLineVal = oneLine.value;
  const descVal = description.value;
  const isAnon = isAnonymous.checked;

  // 텍스트 바인딩
  document.getElementById('pv-category').innerText = category;
  document.getElementById('pv-author').innerText =
    isAnon ? '작성자 · 익명' : '작성자 · 공개';

  document.getElementById('pv-title').innerText = titleVal;
  document.getElementById('pv-oneline').innerText = oneLineVal;
  document.getElementById('pv-desc').innerText = descVal;

  // 썸네일
  const thumb = thumbnail.files[0];
  const pvThumb = document.getElementById('pv-thumb');
  if (thumb) {
    pvThumb.src = URL.createObjectURL(thumb);
    pvThumb.style.display = 'block';
  } else {
    pvThumb.style.display = 'none';
  }

  // 영상
  const vid = video.files[0];
  const pvVideo = document.getElementById('pv-video');
  if (vid) {
    pvVideo.src = URL.createObjectURL(vid);
    pvVideo.style.display = 'block';
  } else {
    pvVideo.style.display = 'none';
  }

  previewModal.style.display = 'flex';
});

closePreview.onclick = () => {
  previewModal.style.display = 'none';
};