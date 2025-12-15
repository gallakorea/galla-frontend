document.addEventListener('DOMContentLoaded', async () => {
  const body = document.body;

  /* ================= Supabase 준비 ================= */
  while (!window.supabaseClient) {
    await new Promise(r => setTimeout(r, 30));
  }

  /* ================= 로그인 필수 ================= */
  const {
    data: { session }
  } = await window.supabaseClient.auth.getSession();

  if (!session) {
    alert('로그인 후 글 작성이 가능합니다.');
    location.href = '/login.html';
    return;
  }

  const form = document.getElementById('writeForm');
  const issuePreview = document.getElementById('issuePreview');

  const categoryEl = document.getElementById('category');
  const titleEl = document.getElementById('title');
  const oneLineEl = document.getElementById('oneLine');
  const descEl = document.getElementById('description');
  const donationEl = document.getElementById('donationTarget');

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
  videoInput.addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    videoPreview.innerHTML = `<video src="${URL.createObjectURL(f)}" muted></video>`;
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

    if (!categoryEl.value) return alert('카테고리를 선택해주세요');
    if (!titleEl.value) return alert('제목을 입력해주세요');
    if (!descEl.value) return alert('이슈 설명을 입력해주세요');
    if (!donationEl.value) return alert('기부처를 선택해주세요');

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

    document.getElementById('editPreview').onclick = () => {
      issuePreview.innerHTML = '';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    /* ================= 발행하기 (적정성 검사) ================= */
    document.getElementById('publishPreview').onclick = async () => {
      const moderation = await runContentModeration({
        title: titleEl.value,
        oneLine: oneLineEl.value,
        description: descEl.value
      });

      if (moderation.result === 'FAIL') {
        alert(`🚫 발행 불가\n\n사유: ${moderation.reason}`);
        return;
      }

      if (moderation.result === 'WARNING') {
        const ok = confirm(
          `⚠️ 주의 콘텐츠\n\n사유: ${moderation.reason}\n\n그래도 발행하시겠습니까?`
        );
        if (!ok) return;
      }

      alert('✅ 적정성 통과\n(다음 단계: DB 저장)');
    };

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

/* ================= 콘텐츠 적합성 검사 (보안 핵심) ================= */
async function runContentModeration({ title, oneLine, description }) {
  try {
    const {
      data: { session }
    } = await window.supabaseClient.auth.getSession();

    if (!session) {
      return { result: 'FAIL', reason: '로그인이 필요합니다' };
    }

    const { data, error } =
      await window.supabaseClient.functions.invoke(
        'content-moderation',
        {
          body: { title, oneLine, description },
          headers: {
            Authorization: `Bearer ${session.access_token}`
          }
        }
      );

    if (error) {
      console.error(error);
      return { result: 'FAIL', reason: '적정성 검사 실패' };
    }

    return data;

  } catch (e) {
    console.error(e);
    return { result: 'FAIL', reason: '적정성 검사 서버 오류' };
  }
}