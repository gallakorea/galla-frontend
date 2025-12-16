document.addEventListener('DOMContentLoaded', async () => {
  const body = document.body;

  /* ================= SUPABASE READY ================= */
  while (!window.supabaseClient) {
    await new Promise(r => setTimeout(r, 20));
  }
  const supabase = window.supabaseClient;

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

  videoBtn.onclick = () => {
    videoInput.value = '';
    videoInput.click();
  };

  videoInput.onchange = e => {
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
  };

  /* ================= AI MODAL ================= */
  const openAiBtn = document.getElementById('openAiModal');
  const aiModal = document.getElementById('aiModal');
  const aiClose = document.getElementById('aiClose');
  const aiUserText = document.getElementById('aiUserText');
  const aiResultText = document.getElementById('aiResultText');
  const applyAi = document.getElementById('applyAi');
  const runAiBtn = document.getElementById('runAi');
  const aiPrompt = document.getElementById('aiPrompt');

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

  /* ================= AI RUN (🔥 실제 작동) ================= */
  runAiBtn.onclick = async () => {
    runAiBtn.disabled = true;
    runAiBtn.textContent = 'AI 처리 중…';

    const activeTab = document.querySelector('.ai-style-tabs .active');
    const style = activeTab ? activeTab.innerText : '기본';

    try {
      const { data, error } = await supabase.functions.invoke(
        'ai-write-helper',
        {
          body: {
            text: aiUserText.value,
            style,
            prompt: aiPrompt.value || ''
          }
        }
      );

      if (error) throw error;

      aiResultText.value = data.result;

    } catch (e) {
      alert('AI 처리 실패');
      console.error(e);
    }

    runAiBtn.disabled = false;
    runAiBtn.textContent = 'AI 실행';
  };

  /* AI STYLE TABS */
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
        <h1>${titleEl.value}</h1>
        <p>${oneLineEl.value}</p>
        <div>작성자 · ${anon ? '익명' : '사용자'}</div>
        ${thumbImg ? `<img src="${thumbImg.src}" />` : ''}
        <p>${descEl.value}</p>
        <button id="publishPreview">발행 전 적합성 검사</button>
      </section>
    `;

    document.getElementById('publishPreview').onclick = () => {
      sessionStorage.setItem('writePayload', JSON.stringify({
        category: categoryEl.value,
        title: titleEl.value,
        oneLine: oneLineEl.value,
        description: descEl.value,
        donation_target: donationEl.value,
        is_anonymous: anon
      }));
      location.href = 'confirm.html';
    };
  };
});