/* ===== BASIC DOM ===== */
const form = document.getElementById('writeForm');
const body = document.body;

const categoryEl = document.getElementById('category');
const titleEl = document.getElementById('title');
const oneLineEl = document.getElementById('oneLine');
const descEl = document.getElementById('description');
const anonEl = document.getElementById('isAnonymous');

const thumbInput = document.getElementById('thumbnail');
const thumbBtn = document.getElementById('thumbnailBtn');
const thumbPreview = document.getElementById('thumbPreview');

const videoInput = document.getElementById('video');
const videoBtn = document.getElementById('videoBtn');
const videoPreview = document.getElementById('videoPreview');

/* ===== FILE UPLOAD ===== */
thumbBtn.onclick = () => thumbInput.click();
thumbInput.onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  thumbPreview.innerHTML = `<img src="${URL.createObjectURL(f)}">`;
};

videoBtn.onclick = () => videoInput.click();
videoInput.onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  videoPreview.innerHTML = `<video src="${URL.createObjectURL(f)}" muted></video>`;
};

/* ===== PREVIEW ===== */
form.addEventListener('submit', e => {
  e.preventDefault();

  const category = categoryEl.value;
  const title = titleEl.value;
  const oneLine = oneLineEl.value;
  const desc = descEl.value;
  const anon = anonEl.checked;

  if (!category || !title || !desc) {
    alert('카테고리 / 제목 / 설명 필수');
    return;
  }

  // 기존 미리보기 제거
  const old = document.querySelector('.issue-preview');
  if (old) old.remove();

  const thumbImg = thumbPreview.querySelector('img');
  const videoEl = videoPreview.querySelector('video');

  const preview = document.createElement('section');
  preview.className = 'issue-preview';
  preview.innerHTML = `
    <div style="padding:16px">
      <div style="font-size:12px;color:#aaa">${category} · 방금 전</div>
      <h1 style="margin:8px 0">${title}</h1>
      <p style="color:#ccc">${oneLine}</p>
      <div style="font-size:13px;color:#888">작성자 · ${anon ? '익명' : '사용자'}</div>

      ${thumbImg ? `<img src="${thumbImg.src}" class="preview-thumb-img">` : ''}

      ${videoEl ? `<button class="speech-btn">🎥 1분 엘리베이터 스피치</button>` : ''}

      <h3 style="margin-top:16px">📝 이 주제에 대한 핵심 요약</h3>
      <p>${desc}</p>

      <div class="preview-actions">
        <button id="editPreview">수정하기</button>
        <button class="btn-publish">발행하기</button>
      </div>
    </div>
  `;

  form.after(preview);

  document.getElementById('editPreview').onclick = () => {
    preview.remove();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  preview.scrollIntoView({ behavior: 'smooth' });
});