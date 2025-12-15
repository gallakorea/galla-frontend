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

    document.getElementById('editPreview').onclick = () => {
      issuePreview.innerHTML = '';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    /* ================= 발행하기 ================= */
    document.getElementById('publishPreview').onclick = async e => {
      const btn = e.target;
      btn.disabled = true;
      btn.textContent = '검사 중…';

      const moderation = await runContentModeration({
        title: titleEl.value,
        oneLine: oneLineEl.value,
        description: descEl.value
      });

      if (moderation.result === 'FAIL') {
        alert(`🚫 발행 불가\n\n사유: ${moderation.reason}`);
        btn.disabled = false;
        btn.textContent = '발행하기';
        return;
      }

      if (moderation.result === 'WARNING') {
        const ok = confirm(
          `⚠️ 주의 콘텐츠\n\n사유: ${moderation.reason}\n\n그래도 발행하시겠습니까?`
        );
        if (!ok) {
          btn.disabled = false;
          btn.textContent = '발행하기';
          return;
        }
      }

      await publishIssue();
    };

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

  /* ================= DB INSERT ================= */
  async function publishIssue() {
    const { error } = await window.supabaseClient
      .from('issues')
      .insert([{
        category: categoryEl.value,
        title: titleEl.value,
        one_line: oneLineEl.value,
        description: descEl.value,
        donation_target: donationEl.value,
        is_anonymous: anonEl.checked
      }]);

    if (error) {
      alert('❌ 발행 실패: DB 오류');
      console.error(error);
      return;
    }

    alert('🎉 발행 완료');
    location.href = '/';
  }
});

/* ================= 콘텐츠 적합성 검사 ================= */
async function runContentModeration({ title, oneLine, description }) {
  try {
    const { data, error } = await window.supabaseClient.functions.invoke(
      'content-moderation',
      {
        body: { title, oneLine, description }
      }
    );

    if (error) {
      return {
        result: 'FAIL',
        reason: error.message || '콘텐츠 검사 실패'
      };
    }

    return data;
  } catch (e) {
    console.error('[Moderation Error]', e);
    return {
      result: 'FAIL',
      reason: '콘텐츠 적합성 검사 서버 오류'
    };
  }
}