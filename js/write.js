document.addEventListener('DOMContentLoaded', () => {
  const body = document.body;

  const form = document.getElementById('writeForm');
  const issuePreview = document.getElementById('issuePreview');

  const categoryEl = document.getElementById('category');
  const titleEl = document.getElementById('title');
  const oneLineEl = document.getElementById('oneLine');
  const descEl = document.getElementById('description');
  const donationEl = document.getElementById('donationTarget');
  const anonEl = document.getElementById('isAnonymous');

  /* ================= FILE ================= */
  const thumbInput = document.getElementById('thumbnail');
  const thumbBtn = document.getElementById('thumbnailBtn');
  const thumbPreview = document.getElementById('thumbPreview');

  const videoInput = document.getElementById('video');
  const videoBtn = document.getElementById('videoBtn');
  const videoPreview = document.getElementById('videoPreview');

  let thumbFile = null;
  let videoFile = null;

  thumbBtn.onclick = () => thumbInput.click();
  thumbInput.onchange = e => {
    const f = e.target.files[0];
    if (!f) return;
    thumbFile = f;
    thumbPreview.innerHTML = `<img src="${URL.createObjectURL(f)}">`;
  };

  videoBtn.onclick = () => videoInput.click();
  videoInput.onchange = e => {
    const f = e.target.files[0];
    if (!f) return;
    videoFile = f;
    videoPreview.innerHTML = `<video src="${URL.createObjectURL(f)}" muted></video>`;
  };

  /* ================= AI MODAL ================= */
  const openAiBtn = document.getElementById('openAiModal');
  const aiModal = document.getElementById('aiModal');
  const aiClose = document.getElementById('aiClose');
  const aiUserText = document.getElementById('aiUserText');
  const aiResultText = document.getElementById('aiResultText');
  const applyAi = document.getElementById('applyAi');

  openAiBtn.onclick = e => {
    e.preventDefault();
    aiUserText.value = descEl.value;
    aiModal.style.display = 'flex';
    body.style.overflow = 'hidden';
  };

  aiClose.onclick = () => {
    aiModal.style.display = 'none';
    body.style.overflow = '';
  };

  applyAi.onclick = () => {
    if (aiResultText.value) {
      descEl.value = aiResultText.value;
    }
    aiModal.style.display = 'none';
    body.style.overflow = '';
  };

  document.querySelectorAll('.ai-style-tabs button').forEach(tab => {
    tab.onclick = () => {
      document
        .querySelectorAll('.ai-style-tabs button')
        .forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
    };
  });

  /* ================= PREVIEW ================= */
  form.onsubmit = e => {
    e.preventDefault();

    if (!categoryEl.value) return alert('카테고리를 선택해주세요');
    if (!titleEl.value) return alert('제목을 입력해주세요');
    if (!oneLineEl.value) return alert('한 줄 요약을 입력해주세요');
    if (!descEl.value) return alert('이슈 설명을 입력해주세요');
    if (!donationEl.value) return alert('기부처를 선택해주세요');
    if (!thumbFile) return alert('썸네일을 업로드해주세요');

    issuePreview.innerHTML = `
      <section class="issue-preview">
        <div class="issue-meta">
          ${categoryEl.value} · 방금 전 · 예상 기부처: ${donationEl.value}
        </div>

        <h1 class="issue-title">${titleEl.value}</h1>
        <p class="issue-one-line">${oneLineEl.value}</p>
        <div class="issue-author">
          작성자 · ${anonEl.checked ? '익명' : '사용자'}
        </div>

        <img src="${URL.createObjectURL(thumbFile)}" class="preview-thumb-img">

        ${videoFile ? `
          <button type="button" class="speech-btn" id="openSpeech">
            🎥 1분 엘리베이터 스피치
          </button>` : ''}

        <section class="issue-summary">
          <p>${descEl.value}</p>
        </section>

        <div class="preview-actions">
          <button type="button" id="editPreview">수정하기</button>
          <button type="button" id="publishPreview">발행하기</button>
        </div>
      </section>
    `;

    /* 수정하기 */
    document.getElementById('editPreview').onclick = () => {
      issuePreview.innerHTML = '';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    /* 발행하기 */
    document.getElementById('publishPreview').onclick = () => {
      if (typeof window.publishIssueToDB === 'function') {
        window.publishIssueToDB({
          category: categoryEl.value,
          title: titleEl.value,
          oneLine: oneLineEl.value,
          description: descEl.value,
          donationTarget: donationEl.value,
          isAnonymous: anonEl.checked,
          thumbnailFile: thumbFile,
          videoFile: videoFile
        });
      } else {
        alert('✅ 여기까지 정상\n다음 단계: DB 연결');
      }
    };

    /* 영상 모달 */
    if (videoFile) {
      document.getElementById('openSpeech').onclick = () => {
        openSpeech(URL.createObjectURL(videoFile));
      };
    }

    issuePreview.scrollIntoView({ behavior: 'smooth' });
  };

  /* ================= VIDEO MODAL ================= */
  const speechModal = document.getElementById('speechModal');
  const speechVideo = document.getElementById('speechVideo');
  const closeSpeech = document.getElementById('closeSpeech');

  function openSpeech(src) {
    speechVideo.src = src;
    speechModal.style.display = 'flex';
    body.style.overflow = 'hidden';
    speechVideo.currentTime = 0;
    speechVideo.play();
  }

  closeSpeech.onclick = () => {
    speechVideo.pause();
    speechVideo.src = '';
    speechModal.style.display = 'none';
    body.style.overflow = '';
  };
});