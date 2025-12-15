document.addEventListener('DOMContentLoaded', async () => {
  const body = document.body;

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

  thumbBtn.onclick = () => thumbInput.click();
  thumbInput.onchange = e => {
    const f = e.target.files[0];
    if (!f) return;
    thumbPreview.innerHTML = `<img src="${URL.createObjectURL(f)}">`;
  };

  const videoInput = document.getElementById('video');
  const videoBtn = document.getElementById('videoBtn');
  const videoPreview = document.getElementById('videoPreview');

  videoBtn.onclick = () => videoInput.click();
  videoInput.onchange = e => {
    const f = e.target.files[0];
    if (!f) return;
    videoPreview.innerHTML = `<video src="${URL.createObjectURL(f)}" muted></video>`;
  };

  /* ================= PREVIEW ================= */
  form.addEventListener('submit', e => {
    e.preventDefault();

    if (!categoryEl.value) return alert('카테고리를 선택해주세요');
    if (!titleEl.value) return alert('제목을 입력해주세요');
    if (!descEl.value) return alert('이슈 설명을 입력해주세요');
    if (!donationEl.value) return alert('기부처를 선택해주세요');

    const anon = document.getElementById('isAnonymous')?.checked;
    const thumbImg = thumbPreview.querySelector('img');
    const videoEl = videoPreview.querySelector('video');

    issuePreview.innerHTML = `
      <section class="issue-preview">
        <div class="issue-meta">
          ${categoryEl.value} · 방금 전 · 예상 기부처: ${donationEl.value}
        </div>

        <h1>${titleEl.value}</h1>
        <p>${oneLineEl.value}</p>
        <div>작성자 · ${anon ? '익명' : '사용자'}</div>

        ${thumbImg ? `<img src="${thumbImg.src}">` : ''}

        ${videoEl ? `<button type="button" id="openSpeech">🎥 1분 엘리베이터 스피치</button>` : ''}

        <p>${descEl.value}</p>

        <div>
          <button type="button" id="editPreview">수정하기</button>
          <button type="button" id="publishPreview">발행하기</button>
        </div>
      </section>
    `;

    document.getElementById('editPreview').onclick = () => {
      issuePreview.innerHTML = '';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    document.getElementById('publishPreview').onclick = handlePublish;

    if (videoEl) {
      document.getElementById('openSpeech').onclick = () => openSpeech(videoEl.src);
    }

    issuePreview.scrollIntoView({ behavior: 'smooth' });
  });

  /* ================= 발행 처리 ================= */
  async function handlePublish() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      alert('로그인이 필요합니다');
      return;
    }

    try {
      const res = await fetch(
        'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/content-moderation',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            title: titleEl.value,
            oneLine: oneLineEl.value,
            description: descEl.value
          })
        }
      );

      const result = await res.json();

      if (result.result === 'FAIL') {
        alert(`🚫 발행 불가\n\n사유: ${result.reason}`);
        return;
      }

      alert('✅ 적정성 통과\n(다음 단계: DB 저장)');
    } catch {
      alert('적정성 검사 서버 오류');
    }
  }

  /* ================= VIDEO MODAL ================= */
  const speechModal = document.getElementById('speechModal');
  const speechVideo = document.getElementById('speechVideo');
  const closeSpeech = document.getElementById('closeSpeech');

  function openSpeech(src) {
    speechVideo.src = src;
    speechModal.style.display = 'flex';
    body.style.overflow = 'hidden';
    speechVideo.play();
  }

  closeSpeech.onclick = () => {
    speechVideo.pause();
    speechVideo.src = '';
    speechModal.style.display = 'none';
    body.style.overflow = '';
  };
});