document.addEventListener('DOMContentLoaded', () => {
  try {
    const body = document.body;

    const form = document.getElementById('writeForm');
    if (!form) return;

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

    if (thumbBtn && thumbInput) {
      thumbBtn.onclick = () => thumbInput.click();
      thumbInput.onchange = e => {
        const f = e.target.files?.[0];
        if (!f) return;
        thumbPreview.innerHTML = `<img src="${URL.createObjectURL(f)}">`;
      };
    }

    const videoInput = document.getElementById('video');
    const videoBtn = document.getElementById('videoBtn');
    const videoPreview = document.getElementById('videoPreview');

    if (videoBtn && videoInput) {
      videoBtn.onclick = () => videoInput.click();
      videoInput.onchange = e => {
        const f = e.target.files?.[0];
        if (!f) return;
        videoPreview.innerHTML = `<video src="${URL.createObjectURL(f)}" muted></video>`;
      };
    }

    /* ================= AI MODAL ================= */
    const openAiBtn = document.getElementById('openAiModal');
    const aiModal = document.getElementById('aiModal');
    const aiClose = document.getElementById('aiClose');
    const aiUserText = document.getElementById('aiUserText');
    const aiResultText = document.getElementById('aiResultText');
    const applyAi = document.getElementById('applyAi');

    if (openAiBtn && aiModal) {
      openAiBtn.onclick = e => {
        e.preventDefault();
        aiUserText.value = descEl.value;
        aiModal.style.display = 'flex';
        body.style.overflow = 'hidden';
      };
    }

    if (aiClose) {
      aiClose.onclick = () => {
        aiModal.style.display = 'none';
        body.style.overflow = '';
      };
    }

    if (applyAi) {
      applyAi.onclick = () => {
        if (aiResultText.value) {
          descEl.value = aiResultText.value;
        }
        aiModal.style.display = 'none';
        body.style.overflow = '';
      };
    }

    /* ================= PREVIEW ================= */
    form.onsubmit = e => {
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
          ${videoEl ? `<button id="openSpeech">🎥 1분 엘리베이터 스피치</button>` : ''}
          <p>${descEl.value}</p>
          <button id="editPreview">수정하기</button>
          <button id="publishPreview">발행하기</button>
        </section>
      `;

      document.getElementById('editPreview').onclick = () => {
        issuePreview.innerHTML = '';
        window.scrollTo({ top: 0, behavior: 'smooth' });
      };

      document.getElementById('publishPreview').onclick = async () => {
        const moderation = await runContentModeration({
          title: titleEl.value,
          oneLine: oneLineEl.value,
          description: descEl.value
        });

        if (moderation.result !== 'PASS') {
          alert(`🚫 발행 불가\n사유: ${moderation.reason}`);
          return;
        }

        alert('✅ 적정성 통과');
      };
    };

  } catch (e) {
    console.error('write.js fatal error:', e);
  }
});

/* ================= 콘텐츠 적합성 검사 ================= */
async function runContentModeration(payload) {
  try {
    const res = await fetch(
      'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/content-moderation',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${
            (await window.supabaseClient.auth.getSession()).data.session
              ?.access_token
          }`
        },
        body: JSON.stringify(payload)
      }
    );

    return await res.json();
  } catch {
    return { result: 'FAIL', reason: '서버 오류' };
  }
}