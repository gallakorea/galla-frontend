// 🚨 GLOBAL HARD BLOCK — 검사(confirm) 단계에서만 발행 차단
document.addEventListener(
  'click',
  (e) => {
    const isCheckOnly =
      sessionStorage.getItem('__DRAFT_CHECK_ONLY__') === 'true';

    // write / write-remix 에서는 절대 막지 않음
    if (!location.pathname.includes('confirm')) return;

    if (
      isCheckOnly &&
      (
        e.target.closest('#publishBtn') ||
        e.target.closest('#publishPreview')
      )
    ) {
      e.preventDefault();
      e.stopImmediatePropagation();
      alert('발행 전 적합성 검사 단계에서는 발행할 수 없습니다.');
      console.warn('[HARD BLOCK] publish blocked in CHECK ONLY mode');
      return false;
    }
  },
  true
);

// 🔥 REMIX STATE (write-remix 전용)

document.addEventListener('DOMContentLoaded', () => {
  // ✅ issue → write‑remix 정상 진입 시 검사 플래그 완전 초기화
  if (!new URLSearchParams(location.search).has('draft')) {
    sessionStorage.removeItem('__DRAFT_CHECK_ONLY__');
    sessionStorage.removeItem('__ALLOW_DRAFT_EXIT__');
    sessionStorage.removeItem('__CURRENT_DRAFT_ID__');
    console.log('[write-remix] clean entry — check-only flags cleared');
  }
  // 🔥 REMIX DRAFT FILE CACHE (미리보기 후에도 파일 유지)
  let __REMIX_THUMB_FILE__ = null;
  let __REMIX_VIDEO_FILE__ = null;

  // 🔥 현재 draft id (단일 소스: sessionStorage)
  const params = new URLSearchParams(location.search);
  // draft id는 오직 sessionStorage 기준
  let currentDraftId = sessionStorage.getItem('__CURRENT_DRAFT_ID__');
  // confirm → 뒤로가기로 돌아온 경우만 URL 파라미터 허용
  if (!currentDraftId && params.get('draft')) {
    currentDraftId = params.get('draft');
    sessionStorage.setItem('__CURRENT_DRAFT_ID__', currentDraftId);
  }

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
    location.href = 'index.html';
    return;
  }

  // 🔒 이 페이지에서는 "읽기 전용"
  const remixStance = remixContext.remix_stance; // 'pro' | 'con'

  /* ==================================================
     🔥 FIX: write.draft.save.js 호환
     authorStance 라디오 강제 주입 (필수)
     ※ write.draft.save.js는 이것만 검사함
       input[name="authorStance"]:checked
  ================================================== */

  // 1) 기존 authorStance 라디오가 있으면 체크
  let authorStanceRadio =
    document.querySelector('input[name="authorStance"]:checked');

  // 2) 없으면 remixStance 기준으로 하나 생성
  if (!authorStanceRadio) {
    const hiddenAuthorStance = document.createElement('input');
    hiddenAuthorStance.type = 'radio';
    hiddenAuthorStance.name = 'authorStance'; // 🔥 핵심 키
    hiddenAuthorStance.value = remixStance;   // 'pro' | 'con'
    hiddenAuthorStance.checked = true;
    hiddenAuthorStance.style.display = 'none';

    document.getElementById('writeForm')?.appendChild(hiddenAuthorStance);
  }

  // 🔧 FORCE REAL RADIO FOR VALIDATION (failsafe)
  let stanceInput = document.querySelector('input[name="stance"]:checked');

  if (!stanceInput) {
    // try to find matching radio
    const radios = document.querySelectorAll('input[name="stance"]');
    radios.forEach(r => {
      if (r.value === remixStance) {
        r.checked = true;
        stanceInput = r;
      }
    });
  }

  // still nothing? inject hidden radio so legacy validation passes
  if (!stanceInput) {
    const hiddenRadio = document.createElement('input');
    hiddenRadio.type = 'radio';
    hiddenRadio.name = 'stance';
    hiddenRadio.value = remixStance;
    hiddenRadio.checked = true;
    hiddenRadio.style.display = 'none';
    document.getElementById('writeForm')?.appendChild(hiddenRadio);
  }

  /* ===============================
     REMIX STANCE → REAL RADIO BIND
     (UI + validation 완전 일치)
  ================================ */

  const stanceRadios = document.querySelectorAll('input[name="stance"]');

  stanceRadios.forEach(radio => {
    if (radio.value === remixStance) {
      radio.checked = true;
    }
  });

  /* ===============================
     REMIX STANCE → FORM HARD INJECT
     (입장 선택 alert 차단용)
  ================================ */

  const selectedStanceEl = document.getElementById('selectedStanceDisplay');

  if (selectedStanceEl) {
    if (remixStance === 'pro') {
      selectedStanceEl.className = 'one-line-stance pro';
      selectedStanceEl.innerHTML = '👍 찬성';
    }

    if (remixStance === 'con') {
      selectedStanceEl.className = 'one-line-stance con';
      selectedStanceEl.innerHTML = '👎 반대';
    }
  }

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

    __REMIX_THUMB_FILE__ = f; // 🔥 캐시
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

    __REMIX_VIDEO_FILE__ = f; // 🔥 캐시

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
        <div class="one-line-stance ${remixStance}">
          ${remixStance === 'pro' ? '👍 찬성' : '👎 반대'}
        </div>
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
          <button type="button" id="checkOnlyPreview">발행 전 적합성 검사</button>
        </div>
      </section>
    `;

    document.getElementById('editPreview').onclick = () => {
      issuePreview.innerHTML = '';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    document.getElementById('checkOnlyPreview').onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      window.__REMIX_CHECK_ONLY__ = true;

      console.log('[CHECK ONLY] 검사 전용 draft 생성 후 confirm 이동');

      window.__CHECK_ONLY__ = true;
      sessionStorage.setItem('__DRAFT_CHECK_ONLY__', 'true');
      sessionStorage.setItem('__ALLOW_DRAFT_EXIT__', 'true');

      // draft id 강제 고정 (중복 생성 방지)
      if (!currentDraftId) {
        const cached = sessionStorage.getItem('__CURRENT_DRAFT_ID__');
        if (cached) currentDraftId = cached;
      }

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

        /* =========================
           1️⃣ 썸네일 / 영상 업로드
        ========================= */
        let thumbnail_url = null;
        let video_url = null;

        const thumbFile =
          document.getElementById('thumbnail')?.files?.[0] ||
          __REMIX_THUMB_FILE__;
        if (thumbFile) {
          thumbnail_url = await window.GALLA_UPLOAD_MEDIA(thumbFile, 'image');
        }

        const videoFile =
          document.getElementById('video')?.files?.[0] ||
          __REMIX_VIDEO_FILE__;
        if (videoFile) {
          video_url = await window.GALLA_UPLOAD_MEDIA(videoFile, 'video');
        }

        /* =========================
           2️⃣ issues_draft SAVE (단일 draft 고정)
        ========================= */
        let draftId = currentDraftId;

        // 🔥 최초 진입에서만 INSERT
        if (!draftId) {
          const { data: inserted, error } =
            await window.supabaseClient
              .from('issues_draft')
              .insert([{
                user_id: user.id,
                origin_issue_id: remixOriginIssueId,
                battle_type: 'counter',
                category: categoryEl.value,
                title: titleEl.value,
                one_line: oneLineEl.value || null,
                description: descEl.value,
                donation_target: donationEl.value,
                is_anonymous: document.getElementById('isAnonymous').checked,
                author_stance: remixStance,
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

          if (error || !inserted?.id) throw error;

          draftId = inserted.id;
          currentDraftId = inserted.id;
          sessionStorage.setItem('__CURRENT_DRAFT_ID__', inserted.id);
        }

        // 🔥 이후는 무조건 UPDATE (중복 row 절대 생성 안 됨)
        const updatePayload = {
          category: categoryEl.value,
          title: titleEl.value,
          one_line: oneLineEl.value || null,
          description: descEl.value,
          donation_target: donationEl.value,
          is_anonymous: document.getElementById('isAnonymous').checked,
          author_stance: remixStance,
          draft_mode: 'check',
          updated_at: new Date().toISOString(),
          battle_type: 'counter',
        };

        if (thumbnail_url) {
          updatePayload.thumbnail_url = thumbnail_url;
          sessionStorage.setItem('__DRAFT_THUMBNAIL_URL__', thumbnail_url);
        }

        if (video_url) {
          updatePayload.video_url = video_url;
          sessionStorage.setItem('__DRAFT_VIDEO_URL__', video_url);
        }

        const { error: updateError } =
          await window.supabaseClient
            .from('issues_draft')
            .update(updatePayload)
            .eq('id', draftId);

        if (updateError) throw updateError;

        sessionStorage.setItem('__CURRENT_DRAFT_ID__', draftId);
        location.href = `confirm.html?draft=${draftId}&mode=check`;

      } catch (err) {
        console.error('[CHECK ONLY ERROR]', err);
        alert('검사 단계로 이동하지 못했습니다.');
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
