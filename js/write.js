/**************************************************
 * DOM
 **************************************************/
const body = document.body;
const writeForm = document.getElementById('writeForm');

/* AI MODAL */
const aiModal = document.getElementById('aiModal');
const openAiModalBtn = document.getElementById('openAiModal');
const aiCloseBtn = document.getElementById('aiClose');

/* FILE */
const thumbnailInput = document.getElementById('thumbnail');
const thumbnailBtn = document.getElementById('thumbnailBtn');
const thumbPreview = document.getElementById('thumbPreview');

const videoInput = document.getElementById('video');
const videoBtn = document.getElementById('videoBtn');
const videoPreview = document.getElementById('videoPreview');

/* PREVIEW */
const previewBtn = document.getElementById('previewBtn');
const previewArea = document.getElementById('previewArea');

let thumbURL = '';
let videoURL = '';

/**************************************************
 * ✅ AI MODAL OPEN / CLOSE (핵심 수정)
 **************************************************/
openAiModalBtn.addEventListener('click', () => {
  aiModal.style.display = 'flex';
  body.style.overflow = 'hidden';
});

aiCloseBtn.addEventListener('click', () => {
  aiModal.style.display = 'none';
  body.style.overflow = '';
});

/* 배경 클릭 시 닫기 */
aiModal.addEventListener('click', (e) => {
  if (e.target === aiModal) {
    aiModal.style.display = 'none';
    body.style.overflow = '';
  }
});

/**************************************************
 * THUMBNAIL
 **************************************************/
thumbnailBtn.addEventListener('click', () => {
  thumbnailInput.click();
});

thumbnailInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;

  thumbURL = URL.createObjectURL(file);

  thumbPreview.innerHTML = '';
  const img = document.createElement('img');
  img.src = thumbURL;
  thumbPreview.appendChild(img);
});

/**************************************************
 * VIDEO
 **************************************************/
videoBtn.addEventListener('click', () => {
  videoInput.click();
});

videoInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;

  videoURL = URL.createObjectURL(file);

  videoPreview.innerHTML = '';
  const video = document.createElement('video');
  video.src = videoURL;
  video.controls = true;
  videoPreview.appendChild(video);
});

/**************************************************
 * ✅ 미리보기 (이슈 카드 동일)
 **************************************************/
previewBtn.addEventListener('click', () => {
  const category = document.getElementById('category').value;
  const title = document.getElementById('title').value;
  const oneLine = document.getElementById('oneLine').value;
  const desc = document.getElementById('description').value;
  const anon = document.getElementById('isAnonymous').checked;

  if (!category || !title || !desc) {
    alert('카테고리, 제목, 이슈 설명은 필수입니다.');
    return;
  }

  previewArea.innerHTML = `
    <div style="background:#111;border:1px solid #222;border-radius:16px;padding:16px;">
      <div style="font-size:12px;color:#aaa;margin-bottom:6px;">
        ${category} · 방금 전
      </div>

      <h2 style="font-size:18px;font-weight:800;margin-bottom:6px;">
        ${title}
      </h2>

      <div style="font-size:14px;color:#ccc;margin-bottom:10px;">
        ${oneLine || ''}
      </div>

      ${thumbURL ? `<img src="${thumbURL}" style="width:100%;border-radius:12px;margin-bottom:12px;">` : ''}

      ${videoURL ? `
        <video src="${videoURL}" controls style="width:100%;border-radius:12px;margin-bottom:12px;"></video>
      ` : ''}

      <div style="font-size:14px;line-height:1.6;margin-bottom:12px;">
        ${desc}
      </div>

      <div style="font-size:13px;color:#888;">
        작성자 · ${anon ? '익명' : '본인'}
      </div>

      <button style="
        width:100%;
        margin-top:14px;
        padding:14px;
        background:#2f80ff;
        border:none;
        border-radius:999px;
        color:#fff;
        font-weight:800;
        font-size:15px;
      ">
        이대로 발행하기
      </button>
    </div>
  `;

  previewArea.scrollIntoView({ behavior: 'smooth' });
});