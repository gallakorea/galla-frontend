document.addEventListener('DOMContentLoaded', async () => {
  // 🔒 정상 복귀 플래그 정리 (confirm → write / write-remix)
  if (sessionStorage.getItem('__ALLOW_DRAFT_EXIT__') === 'true') {
    sessionStorage.removeItem('__ALLOW_DRAFT_EXIT__');
  }

  console.log('[DRAFT RESTORE] Loaded');

  const params = new URLSearchParams(location.search);

  // 🔥 draft id 단일 소스: sessionStorage 우선
  let draftId = sessionStorage.getItem('__CURRENT_DRAFT_ID__');

  // confirm → 뒤로가기 복귀 시에만 URL 허용
  if (!draftId && params.get('draft')) {
    draftId = params.get('draft');
    sessionStorage.setItem('__CURRENT_DRAFT_ID__', draftId);
  }

  if (!draftId) {
    console.log('[DRAFT RESTORE] draft 없음');
    return;
  }

  if (!window.supabaseClient) {
    console.error('[DRAFT RESTORE] Supabase 연결 실패');
    return;
  }

  let currentDraft = null;

  // 🔥 정상 이동 여부 플래그 (기본: false = 이탈 시 삭제)

  try {
    const { data: draft, error } =
      await window.supabaseClient
        .from('issues_draft')
        .select('*')
        .eq('id', draftId)
        .single();

    if (error || !draft) {
      console.warn('[DRAFT RESTORE] draft 없음');
      location.href = 'write.html';
      return;
    }

    currentDraft = draft;
    // 🔒 캐시: draft 미디어 URL 고정 (뒤로가기 반복 시 유실 방지)
    if (draft.thumbnail_url) {
      sessionStorage.setItem('__DRAFT_THUMBNAIL_URL__', draft.thumbnail_url);
    }
    if (draft.video_url) {
      sessionStorage.setItem('__DRAFT_VIDEO_URL__', draft.video_url);
    }
    sessionStorage.setItem('__CURRENT_DRAFT_ID__', draft.id);

    const isRemixDraft = !!draft.origin_issue_id;

    const setValue = (id, value) => {
      const el = document.getElementById(id);
      if (el && value !== null && value !== undefined) {
        el.value = value;
      }
    };

    setValue('category', draft.category);
    setValue('title', draft.title);
    setValue('oneLine', draft.one_line);
    setValue('description', draft.description);
    setValue('donationTarget', draft.donation_target);
    setValue('factionA', draft.faction_a);
    setValue('factionB', draft.faction_b);

    // 진영 이름 → 입장 라벨 동기화
    const proLbl = document.getElementById('stanceProLabel');
    const conLbl = document.getElementById('stanceConLabel');
    if (proLbl) proLbl.textContent = `👍 ${draft.faction_a || '찬성이오'}`;
    if (conLbl) conLbl.textContent = `👎 ${draft.faction_b || '난 반댈세'}`;

    // 미디어 모드 복원 (영상 있으면 동영상 탭, 아니면 사진 탭)
    if (draft.video_url && typeof window.__MEDIA_MODE__ !== 'undefined') {
      document.querySelector('.media-tab[data-media="video"]')?.click();
    }

    const anonEl = document.getElementById('isAnonymous');
    if (anonEl) anonEl.checked = !!draft.is_anonymous;

    // 🔥 author_stance 복원 (필수)
    if (draft.author_stance) {
      const stanceEl = document.querySelector(
        `input[name="authorStance"][value="${draft.author_stance}"]`
      );
      if (stanceEl) stanceEl.checked = true;
    }

    const cachedThumb =
      draft.thumbnail_url ||
      sessionStorage.getItem('__DRAFT_THUMBNAIL_URL__');

    const draftImages =
      Array.isArray(draft.images) && draft.images.length > 0
        ? draft.images
        : (cachedThumb ? [cachedThumb] : []);

    if (draftImages.length > 0) {
      const thumbPreview = document.getElementById('thumbPreview');
      if (thumbPreview) {
        thumbPreview.innerHTML = `
          <div class="multi-img-strip">
            ${draftImages.map((url, i) => `
              <div class="multi-img-item">
                <img src="${url}">
                ${i === 0 ? '<span class="multi-img-badge">대표</span>' : ''}
              </div>
            `).join('')}
          </div>
        `;
      }
    }

    const cachedVideo =
      draft.video_url ||
      sessionStorage.getItem('__DRAFT_VIDEO_URL__');

    if (cachedVideo) {
      const videoPreview = document.getElementById('videoPreview');
      if (videoPreview) {
        videoPreview.innerHTML = '';

        const video = document.createElement('video');
        video.src = cachedVideo;
        video.controls = true;
        video.playsInline = true;
        video.muted = true;

        videoPreview.appendChild(video);
      }
    }

    console.log('[DRAFT RESTORE] 복원 완료:', draftId);

  } catch (err) {
    console.error('[DRAFT RESTORE ERROR]', err);
  }

  /* =================================================
     🚨 진짜 이탈일 때만 삭제
  ================================================= */
  window.addEventListener('beforeunload', () => {
    // 🔒 미디어 캐시는 페이지 이탈 시에도 유지
    if (currentDraft?.thumbnail_url) {
      sessionStorage.setItem('__DRAFT_THUMBNAIL_URL__', currentDraft.thumbnail_url);
    }
    if (currentDraft?.video_url) {
      sessionStorage.setItem('__DRAFT_VIDEO_URL__', currentDraft.video_url);
    }
    if (!currentDraft) return;

    // 🔥 정상 이동이면 삭제 금지 (sessionStorage 기준)
    const allowExit =
      sessionStorage.getItem('__ALLOW_DRAFT_EXIT__') === 'true';

    // 🔥 현재 활성 draft는 절대 삭제 금지
    const activeDraftId = sessionStorage.getItem('__CURRENT_DRAFT_ID__');

    if (allowExit || activeDraftId === String(currentDraft.id)) {
      console.log('[DRAFT CLEANUP] 정상 이동 또는 활성 draft → 삭제 안 함');
      return;
    }

    try {
      // 레거시 Supabase Storage 파일만 정리 대상 (R2 URL은 경로 없음)
      const STORAGE_PREFIX = '/storage/v1/object/public/issues/';
      const paths = [];

      if (currentDraft.thumbnail_url?.includes(STORAGE_PREFIX)) {
        paths.push(currentDraft.thumbnail_url.split(STORAGE_PREFIX)[1]);
      }

      if (currentDraft.video_url?.includes(STORAGE_PREFIX)) {
        paths.push(currentDraft.video_url.split(STORAGE_PREFIX)[1]);
      }

      if (paths.length > 0) {
        window.supabaseClient
          .storage
          .from('issues')
          .remove(paths);
      }

      window.supabaseClient
        .from('issues_draft')
        .delete()
        .eq('id', currentDraft.id);

      console.log('[DRAFT CLEANUP] 이탈로 draft 삭제');

      sessionStorage.removeItem('__ALLOW_DRAFT_EXIT__');
    } catch (e) {
      console.warn('[DRAFT CLEANUP FAIL]', e);
    }
  });
});