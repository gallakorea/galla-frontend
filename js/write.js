document.addEventListener('DOMContentLoaded', () => {
  const body = document.body;

  const form = document.getElementById('writeForm');
  const issuePreview = document.getElementById('issuePreview');

  const categoryEl = document.getElementById('category');
  const titleEl = document.getElementById('title');
  const oneLineEl = document.getElementById('oneLine');
  const descEl = document.getElementById('description');
  const donationEl = document.getElementById('donationTarget'); // ✅ 추가
  const authorStanceEls = document.querySelectorAll(
  'input[name="authorStance"]'
);

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

    const authorStance = [...authorStanceEls].find(r => r.checked)?.value;

    if (!authorStance) {
      alert('이 이슈에 대한 나의 입장을 선택해주세요');
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
       
        <div class="issue-author-stance">
          발의자 입장 · ${authorStance === 'pro' ? '찬성' : '반대'}
        </div>

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

    document.getElementById('publishPreview').onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      try {
        if (!window.supabaseClient) {
          throw new Error('Supabase client 없음');
        }

        const { data: sessionData } =
          await window.supabaseClient.auth.getSession();
        const user = sessionData?.session?.user;

        if (!user) {
          alert('로그인이 필요합니다.');
          return;
        }

        let thumbnail_url = null;
        let video_url = null;

        const thumbFile = document.getElementById('thumbnail')?.files?.[0];
        if (thumbFile) {
          const ext = thumbFile.name.split('.').pop();
          const path = `drafts/${user.id}/thumbnail_${crypto.randomUUID()}.${ext}`;

          const { error } = await window.supabaseClient
            .storage
            .from('issues')
            .upload(path, thumbFile);

          if (error) throw error;

          thumbnail_url =
            window.supabaseClient
              .storage
              .from('issues')
              .getPublicUrl(path).data.publicUrl;
        }

        const videoFile = document.getElementById('video')?.files?.[0];
        if (videoFile) {
          const ext = videoFile.name.split('.').pop();
          const path = `drafts/${user.id}/video_${crypto.randomUUID()}.${ext}`;

          const { error } = await window.supabaseClient
            .storage
            .from('issues')
            .upload(path, videoFile);

          if (error) throw error;

          video_url =
            window.supabaseClient
              .storage
              .from('issues')
              .getPublicUrl(path).data.publicUrl;
        }

        const { data: inserted, error } =
          await window.supabaseClient
            .from('issues_draft')
            .insert([{
              user_id: user.id,
              category: categoryEl.value,
              title: titleEl.value,
              one_line: oneLineEl.value || null,
              description: descEl.value,
              donation_target: donationEl.value,
              is_anonymous: anon,
              author_stance: authorStance,
              thumbnail_url,
              video_url,
              status: 'draft',
              draft_mode: 'check',
              moderation_status: 'pending',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }])
            .select('id')
            .single();

        if (error || !inserted?.id) {
          throw error || new Error('draft 생성 실패');
        }

        sessionStorage.setItem('__DRAFT_CHECK_ONLY__', 'true');
        sessionStorage.setItem('__CURRENT_DRAFT_ID__', inserted.id);

        location.href = `confirm.html?draft=${inserted.id}&mode=check`;

      } catch (err) {
        console.error('[WRITE → DRAFT ERROR]', err);
        alert('발행 전 검사 단계로 이동하지 못했습니다.');
      }
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
