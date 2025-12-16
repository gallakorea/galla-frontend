document.addEventListener('DOMContentLoaded', () => {
  const body = document.body;

  const form = document.getElementById('writeForm');
  const issuePreview = document.getElementById('issuePreview');

  const categoryEl = document.getElementById('category');
  const titleEl = document.getElementById('title');
  const oneLineEl = document.getElementById('oneLine');
  const descEl = document.getElementById('description');
  const donationEl = document.getElementById('donationTarget'); // ✅ 추가

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

  videoBtn.addEventListener('click', () => videoInput.click());

  /* 🔥 여기만 수정됨 (영상 미리보기 안정화) */
  videoInput.addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;

    // 기존 미리보기 완전 초기화
    videoPreview.innerHTML = '';

    const video = document.createElement('video');
    video.src = URL.createObjectURL(f);
    video.muted = true;
    video.controls = true;
    video.playsInline = true;

    // iOS / Chrome 안정화
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

  /* AI STYLE TABS */
  document.querySelectorAll('.ai-style-tabs button').forEach(tab => {
    tab.addEventListener('click', () => {
      document
        .querySelectorAll('.ai-style-tabs button')
        .forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
    });
  });

  /* ================= PREVIEW ================= */
  form.addEventListener('submit', e => {
    e.preventDefault();

    if (!categoryEl.value) {
      alert('카테고리를 선택해주세요');
      categoryEl.focus();
      return;
    }

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

        ${thumbImg ? `<img src="${thumbImg.src}" class="preview-thumb-img">` : ''}

        ${videoEl ? `
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

    /* 발행하기 → confirm.html */
    document.getElementById('publishPreview').onclick = () => {
      const payload = {
        category: categoryEl.value,
        title: titleEl.value,
        oneLine: oneLineEl.value,
        description: descEl.value,
        donation_target: donationEl.value,
        is_anonymous: anon
      };

- location.href = 'confirm.html';
+ openConfirmStep(payload);
};

      sessionStorage.setItem('writePayload', JSON.stringify(payload));
      location.href = 'confirm.html';
    };

    /* 영상 모달 */
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
    speechVideo.play();
  }

  closeSpeech.addEventListener('click', () => {
    speechVideo.pause();
    speechVideo.src = '';
    speechModal.style.display = 'none';
    body.style.overflow = '';
  });
});

/* ================= CONFIRM STEP LOGIC ================= */

async function openConfirmStep(payload) {
  const step = document.getElementById('confirmStep');
  const box = document.getElementById('moderationBox');
  const backBtn = document.getElementById('confirmBackBtn');
  const publishBtn = document.getElementById('confirmPublishBtn');

  step.style.display = 'block';
  document.body.style.overflow = 'hidden';

  box.className = 'confirm-box loading';
  box.textContent = '콘텐츠 적합성 검사를 진행 중입니다…';
  publishBtn.disabled = true;

  /* supabase 대기 */
  while (!window.supabaseClient) {
    await new Promise(r => setTimeout(r, 20));
  }
  const supabase = window.supabaseClient;

  /* 로그인 체크 */
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    alert('로그인 후 발행 가능합니다.');
    location.href = 'login.html';
    return;
  }

  /* 적합성 검사 */
  try {
    const { data: res, error } =
      await supabase.functions.invoke('content-moderation', {
        body: {
          title: payload.title,
          oneLine: payload.oneLine,
          description: payload.description
        }
      });

    if (error) throw error;

    if (res.result === 'FAIL') {
      box.className = 'confirm-box fail';
      box.innerHTML = `<strong>발행 불가</strong><br>${res.reason}`;
      return;
    }

    if (res.result === 'WARNING') {
      box.className = 'confirm-box warning';
      box.innerHTML = `
        <strong>주의 콘텐츠</strong><br>
        ${res.reason}<br><br>
        해당 내용은 누적 경고로 기록됩니다.
      `;
    }

    if (res.result === 'PASS') {
      box.className = 'confirm-box pass';
      box.innerHTML = `
        <strong>적합성 검사 통과</strong><br>
        발행이 가능합니다.
      `;
    }

    publishBtn.disabled = false;

  } catch (e) {
    box.className = 'confirm-box fail';
    box.textContent = '적합성 검사 중 오류가 발생했습니다.';
    return;
  }

  /* 돌아가기 */
  backBtn.onclick = () => {
    step.style.display = 'none';
    document.body.style.overflow = '';
  };

  /* 최종 발행 */
  publishBtn.onclick = async () => {
    publishBtn.disabled = true;
    publishBtn.textContent = '발행 중…';

    const { error } = await supabase
      .from('issues')
      .insert([payload]);

    if (error) {
      alert('발행 실패');
      publishBtn.disabled = false;
      publishBtn.textContent = '최종 발행';
      return;
    }

    location.href = 'index.html';
  };
}