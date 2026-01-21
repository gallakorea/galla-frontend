// 🔥 REMIX STATE (write-remix 전용)

document.addEventListener('DOMContentLoaded', () => {
  const body = document.body;

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
    alert('잘못된 접근입니다.');
    return;
  }

  // Removed draft id from URLSearchParams per instructions

  // 🔒 이 페이지에서는 "읽기 전용"
  const remixStance = remixContext.remix_stance; // 'pro' | 'con'

  /* ================= 나의 입장 (REMIX: 고정 표시 전용) ================= */

  const fixedStanceBox = document.getElementById('fixedStanceDisplay');

  if (fixedStanceBox) {
    if (remixStance === 'pro') {
      fixedStanceBox.className = 'fixed-stance-display pro';
      fixedStanceBox.textContent = '👍 찬성';
    } else if (remixStance === 'con') {
      fixedStanceBox.className = 'fixed-stance-display con';
      fixedStanceBox.textContent = '👎 반대';
    }
  }

  // confirm / payload 전달용 hidden input
  let hiddenStance = document.querySelector('input[type="hidden"][name="author_stance"]');
  if (!hiddenStance) {
    hiddenStance = document.createElement('input');
    hiddenStance.type = 'hidden';
    hiddenStance.name = 'author_stance';
    document.getElementById('writeForm')?.appendChild(hiddenStance);
  }
  hiddenStance.value = remixStance;

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

  // Removed restoring thumbnail preview on back navigation per instructions

  thumbBtn.addEventListener('click', () => thumbInput.click());
  thumbInput.addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;

    // Removed revoking previous URL and sessionStorage persistence per instructions

    const url = URL.createObjectURL(f);
    thumbPreview.innerHTML = `<img src="${url}">`;

    // Removed persisting thumbnail preview for back-navigation per instructions
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
  form.addEventListener('submit', async e => {
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

    // Ensure draft exists or update draft before preview rendering
    let draftId = sessionStorage.getItem('writeDraftId');

    if (!draftId) {
      const { data, error } = await supabase
        .from('issues')
        .insert([{
          user_id: supabase.auth.user()?.id,
          category: categoryEl.value,
          title: titleEl.value,
          one_line: oneLineEl.value,
          description: descEl.value,
          donation_target: donationEl.value,
          is_anonymous: document.getElementById('isAnonymous').checked,
          author_stance: remixStance,
          status: 'draft',
          moderation_status: 'pending'
        }])
        .select('id')
        .single();
      if (error) {
        alert('임시 저장 중 오류가 발생했습니다.');
        return;
      }
      sessionStorage.setItem('writeDraftId', data.id);
      draftId = data.id;
    } else {
      await supabase
        .from('issues')
        .update({
          category: categoryEl.value,
          title: titleEl.value,
          one_line: oneLineEl.value,
          description: descEl.value,
          donation_target: donationEl.value,
          is_anonymous: document.getElementById('isAnonymous').checked,
          author_stance: remixStance
        })
        .eq('id', draftId);
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

    // Updated publishPreview click handler per instructions
    const publishBtn = document.getElementById('publishPreview');
    if (publishBtn) {
      publishBtn.addEventListener('click', ev => {
        ev.preventDefault();
        ev.stopPropagation();

        const draftId = sessionStorage.getItem('writeDraftId');
        if (!draftId) {
          alert('임시 저장된 글이 없습니다.');
          return;
        }
        location.href = `confirm.html?draft=${draftId}`;
      }, { once: true });
    }

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
