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