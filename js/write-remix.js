// 🔥 REMIX STATE (write-remix 전용)

document.addEventListener('DOMContentLoaded', () => {
  const body = document.body;
  // 🔒 REMIX 진입 확정 플래그 (write 공용 로직의 입장 선택 alert 차단)
  window.__IS_REMIX__ = true;
  sessionStorage.setItem("__IS_REMIX__", "1");

    /* ================= REMIX CONTEXT (고정값) ================= */
  const remixContext = JSON.parse(
    sessionStorage.getItem('remixContext')
  );

  if (
    !remixContext ||
    !remixContext.origin_issue_id ||
    !remixContext.remix_stance ||
    !remixContext.category
  ) {
    console.error('[REMIX] invalid remixContext', remixContext);
    location.href = 'index.html';
    return;
  }

  // 🔒 이 페이지에서는 "읽기 전용"
  const remixStance = remixContext.remix_stance; // 'pro' | 'con'
  const stanceBox = document.getElementById('remixStanceBox');
  const guideText = document.getElementById('remixGuideText');

if (remixStance === 'pro') {
  stanceBox.classList.add('pro');
  stanceBox.innerHTML = `👍 <strong>찬성 진영</strong>으로 참전했습니다`;

  guideText.innerHTML = `
    이 글은 위 이슈의 <strong>찬성 논점</strong>을 강화하거나
    새로운 근거를 제시하기 위한 글입니다.
    <br />
    <span class="muted">※ 참전 진영은 변경할 수 없습니다.</span>
  `;
}

if (remixStance === 'con') {
  stanceBox.classList.add('con');
  stanceBox.innerHTML = `👎 <strong>반대 진영</strong>으로 참전했습니다`;

  guideText.innerHTML = `
    이 글은 위 이슈의 <strong>반대 논점</strong>을 강화하거나
    새로운 반론을 제시하기 위한 글입니다.
    <br />
    <span class="muted">※ 참전 진영은 변경할 수 없습니다.</span>
  `;
}
  const remixOriginIssueId = remixContext.origin_issue_id;

  const form = document.getElementById('writeForm');
  const issuePreview = document.getElementById('issuePreview');

  const categoryEl = document.getElementById('category');
  const titleEl = document.getElementById('title');
  const oneLineEl = document.getElementById('oneLine');
  const descEl = document.getElementById('description');
  const donationEl = document.getElementById('donationTarget'); // ✅ 추가

  /* ================= CATEGORY LOCK (REMIX) ================= */
  categoryEl.value = remixContext.category;   // 원본 이슈 카테고리
  categoryEl.disabled = true;                 // 선택 불가
  categoryEl.classList.add('locked');          // UX용

  /* ================= FILE ================= */
  const thumbInput = document.getElementById('thumbnail');
  const thumbBtn = document.getElementById('thumbnailBtn');
  const thumbPreview = document.getElementById('thumbPreview');

  thumbBtn.addEventListener('click', () => thumbInput.click());
  thumbInput.addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    thumbPreview.innerHTML = `<img src="${URL.createObjectURL(f)}">`;
  });

  const videoInput = document.getElementById('video');
  const videoBtn = document.getElementById('videoBtn');
  const videoPreview = document.getElementById('videoPreview');

  /* ✅🔥 핵심 수정: 클릭 시 value 초기화 */
  videoBtn.addEventListener('click', () => {
    videoInput.value = '';   // ← 이 한 줄이 전부
    videoInput.click();
  });

  /* 🔥 영상 미리보기 안정화 */
  videoInput.addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;

    videoPreview.innerHTML = '';

    const video = document.createElement('video');
    video.src = URL.createObjectURL(f);
    video.muted = true;
    video.controls = true;
    video.playsInline = true;

    video.load();
    videoPreview.appendChild(video);
  });

  /* ================= AI MODAL ================= */
  const openAiBtn = document.getElementById('openAiModal');
  const aiModal = document.getElementById('aiModal');
  const aiClose = document.getElementById('aiClose');
  const aiUserText = document.getElementById('aiUserText');
  const aiResultText = document.getElementById('aiResultText');
  const applyAi = document.getElementById('applyAi');

  openAiBtn.addEventListener('click', e => {
    e.preventDefault();
    aiUserText.value = descEl.value;
    aiModal.style.display = 'flex';
    body.style.overflow = 'hidden';
  });

  aiClose.addEventListener('click', () => {
    aiModal.style.display = 'none';
    body.style.overflow = '';
  });

  applyAi.addEventListener('click', () => {
    if (aiResultText.value) {
      descEl.value = aiResultText.value;
    }
    aiModal.style.display = 'none';
    body.style.overflow = '';
  });

  /* ================= PREVIEW ================= */
  form.addEventListener('submit', e => {
    e.preventDefault();

    if (!titleEl.value) {
      alert('제목을 입력해주세요');
      titleEl.focus();
      return;
    }

    if (!descEl.value) {
      alert('이슈 설명을 입력해주세요');
      descEl.focus();
      return;
    }

    if (!donationEl.value) {
      alert('기부처를 선택해주세요');
      donationEl.focus();
      return;
    }

    const anon = document.getElementById('isAnonymous').checked;
    const thumbImg = thumbPreview.querySelector('img');
    const videoEl = videoPreview.querySelector('video');

    issuePreview.innerHTML = `
      <section class="issue-preview">
        <div class="issue-meta">
          ${categoryEl.value} · 방금 전 · 예상 기부처: ${donationEl.value}
        </div>

        <h1 class="issue-title">${titleEl.value}</h1>
        <p class="issue-one-line">${oneLineEl.value}</p>
        <div class="issue-author">작성자 · ${anon ? '익명' : '사용자'}</div>

        ${thumbImg ? `
          <div class="preview-thumb-wrap">
            <img src="${thumbImg.src}" />
          </div>
        ` : ''}

        ${videoEl ? `
          <button type="button" class="speech-btn" id="openSpeech">
            🎥 1분 엘리베이터 스피치
          </button>` : ''}

        <section class="issue-summary">
          <p>${descEl.value}</p>
        </section>

        <div class="preview-actions">
          <button type="button" id="editPreview">수정하기</button>
          <button type="button" id="publishPreview">발행 전 적합성 검사</button>
        </div>
      </section>
    `;

    document.getElementById('editPreview').onclick = () => {
      issuePreview.innerHTML = '';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    document.getElementById('publishPreview').onclick = () => {
      // 🔒 draft 모드 방어 (정의 안 된 경우도 안전)
      const isDraftMode = window.__DRAFT_MODE__ === true;

      if (isDraftMode) {
        console.log('[write.js] DRAFT MODE → confirm 이동 차단');
        return;
      }

      const payload = {
        category: remixContext.category,
        title: titleEl.value,
        oneLine: oneLineEl.value,
        description: descEl.value,
        donation_target: donationEl.value,
        is_anonymous: anon,

        author_stance: remixStance,        // 🔥 반드시 추가
        remix_stance: remixStance,
        remix_origin_issue_id: remixOriginIssueId
      };

      sessionStorage.setItem('writePayload', JSON.stringify(payload));
      location.href = 'confirm.html';
    };

    if (videoEl) {
      document.getElementById('openSpeech').onclick = () => {
        openSpeech(videoEl.src);
      };
    }

    issuePreview.scrollIntoView({ behavior: 'smooth' });
  });

  /* ================= VIDEO MODAL ================= */
  const speechModal = document.getElementById('speechModal');
  const speechVideo = document.getElementById('speechVideo');
  const closeSpeech = document.getElementById('closeSpeech');

  function openSpeech(src) {
    speechVideo.src = src;
    speechModal.style.display = 'flex';
    body.style.overflow = 'hidden';
    speechVideo.currentTime = 0;
    speechVideo.play().catch(() => {});
  }

  closeSpeech.addEventListener('click', () => {
    speechVideo.pause();
    speechVideo.src = '';
    speechModal.style.display = 'none';
    body.style.overflow = '';
  });
});
