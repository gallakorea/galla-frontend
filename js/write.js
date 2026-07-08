document.addEventListener('DOMContentLoaded', () => {
  // 🚨 WRITE PAGE ENTRY RESET — draft / check state hard clear
  sessionStorage.removeItem('__CURRENT_DRAFT_ID__');
  sessionStorage.removeItem('__DRAFT_CHECK_ONLY__');
  sessionStorage.removeItem('__ALLOW_DRAFT_EXIT__');
  sessionStorage.removeItem('__DRAFT_THUMBNAIL_URL__');
  sessionStorage.removeItem('__DRAFT_VIDEO_URL__');
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

  const MAX_IMAGES = 10;

  thumbBtn.addEventListener('click', () => {
    thumbInput.value = '';
    thumbInput.click();
  });
  thumbInput.addEventListener('change', e => {
    const files = [...(e.target.files || [])];
    if (files.length === 0) return;
    if (files.length > MAX_IMAGES) {
      alert(`이미지는 최대 ${MAX_IMAGES}장까지 선택할 수 있습니다.`);
      thumbInput.value = '';
      thumbPreview.innerHTML = '';
      return;
    }
    thumbPreview.innerHTML = `
      <div class="multi-img-strip">
        ${files.map((f, i) => `
          <div class="multi-img-item">
            <img src="${URL.createObjectURL(f)}">
            ${i === 0 ? '<span class="multi-img-badge">대표</span>' : ''}
          </div>
        `).join('')}
      </div>
      ${files.length > 1 ? `<div class="guide-text">${files.length}장 선택됨 · 캐러셀로 노출됩니다</div>` : ''}
    `;
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

      const supabase = window.supabaseClient;
      if (!supabase || !supabase.auth || !supabase.from) {
        alert('Supabase 초기화 실패');
        return;
      }

      const { data: sessionData } =
        await supabase.auth.getSession();

      const user = sessionData?.session?.user;

      if (!user) {
        alert('로그인이 필요합니다.');
        return;
      }

      let thumbnail_url = null;
      let video_url = null;
      let images = null;

      // Cloudflare R2 업로드 (이미지 여러 장 + 영상)
      const publishBtn = document.getElementById('publishPreview');
      const imageFiles = [...(thumbInput.files || [])];
      const videoFile = videoInput.files && videoInput.files[0];

      try {
        if (imageFiles.length > 0) {
          images = [];
          for (let i = 0; i < imageFiles.length; i++) {
            publishBtn.textContent = `이미지 업로드 중… (${i + 1}/${imageFiles.length})`;
            publishBtn.disabled = true;
            images.push(await window.GALLA_UPLOAD_MEDIA(imageFiles[i], 'image'));
          }
          thumbnail_url = images[0];
        }

        if (videoFile) {
          publishBtn.textContent = '영상 업로드 중…';
          publishBtn.disabled = true;
          video_url = await window.GALLA_UPLOAD_MEDIA(videoFile, 'video');
        }
      } catch (err) {
        console.error('[UPLOAD ERROR]', err);
        alert('미디어 업로드에 실패했습니다. 잠시 후 다시 시도해주세요.');
        publishBtn.textContent = '발행 전 적합성 검사';
        publishBtn.disabled = false;
        return;
      }
      publishBtn.textContent = '발행 전 적합성 검사';
      publishBtn.disabled = false;

      // Prepare payload for issues_draft
      const draftPayload = {
        user_id: user.id,              // 🔥 RLS 필수
        category: categoryEl.value,
        title: titleEl.value,
        one_line: oneLineEl.value || null,
        description: descEl.value,
        donation_target: donationEl.value,
        is_anonymous: anon,
        author_stance: authorStance,
        status: 'draft',
        draft_mode: 'check',
        moderation_status: 'pending',
        updated_at: new Date().toISOString(),
      };

      // INSERT 시 created_at 보장
      let draftId = sessionStorage.getItem('__CURRENT_DRAFT_ID__');
      let row;
      if (!draftId) {
        draftPayload.created_at = new Date().toISOString();

        // Only set thumbnail_url/video_url if we just uploaded
        if (thumbnail_url) draftPayload.thumbnail_url = thumbnail_url;
        if (video_url) draftPayload.video_url = video_url;
        if (images) draftPayload.images = images;

        // INSERT
        const { data, error } = await supabase
          .from('issues_draft')
          .insert([draftPayload])
          .select()
          .single();
        if (error || !data) {
          alert('임시 저장에 실패했습니다.');
          return;
        }
        draftId = data.id;
        sessionStorage.setItem('__CURRENT_DRAFT_ID__', draftId);
        row = data;
      } else {
        // UPDATE (do not null thumbnail_url/video_url if not reselected)
        // First, fetch current row
        const { data: existing, error: fetchErr } = await supabase
          .from('issues_draft')
          .select('thumbnail_url,video_url,images')
          .eq('id', draftId)
          .single();
        if (fetchErr || !existing) {
          alert('임시 저장 로드에 실패했습니다.');
          return;
        }
        if (thumbnail_url) draftPayload.thumbnail_url = thumbnail_url;
        else if (existing.thumbnail_url) draftPayload.thumbnail_url = existing.thumbnail_url;
        if (video_url) draftPayload.video_url = video_url;
        else if (existing.video_url) draftPayload.video_url = existing.video_url;
        if (images) draftPayload.images = images;
        else if (existing.images) draftPayload.images = existing.images;
        const { error: updateErr, data: updated } = await supabase
          .from('issues_draft')
          .update(draftPayload)
          .eq('id', draftId)
          .select()
          .single();
        if (updateErr || !updated) {
          alert('임시 저장 갱신에 실패했습니다.');
          return;
        }
        row = updated;
      }

      // Redirect to confirm.html with draft id and mode
      location.href = `confirm.html?draft=${draftId}&mode=check`;
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
