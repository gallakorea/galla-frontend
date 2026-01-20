/* ===============================
   REMIX PAGE GUARD
   remix 페이지에서는 일반 draft restore 로직을 절대 실행하지 않는다
================================ */
if (window.__IS_REMIX__ === true || document.body?.dataset?.page === 'write-remix') {
  console.log('[DRAFT RESTORE] remix page detected → skipped');
  return;
}

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[DRAFT RESTORE] Loaded');

  const params = new URLSearchParams(location.search);
  const draftId = params.get('draft');

  if (!draftId) {
    console.log('[DRAFT RESTORE] draft 파라미터 없음');
    return;
  }

  if (!window.supabaseClient) {
    console.error('[DRAFT RESTORE] Supabase 연결 실패');
    return;
  }

  let currentDraft = null;

  // 🔥 정상 이동 여부 플래그 (기본: false = 이탈 시 삭제)
  window.__ALLOW_DRAFT_EXIT__ = false;

  try {
    const { data: draft, error } =
      await window.supabaseClient
        .from('issues')
        .select('*')
        .eq('id', draftId)
        .eq('status', 'draft')
        .single();

    if (error || !draft) {
      console.warn('[DRAFT RESTORE] draft 없음');
      return;
    }

    currentDraft = draft;

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

    const anonEl = document.getElementById('isAnonymous');
    if (anonEl) anonEl.checked = !!draft.is_anonymous;

    // 🔥 author_stance 복원 (필수)
    if (draft.author_stance) {
      const stanceEl = document.querySelector(
        `input[name="authorStance"][value="${draft.author_stance}"]`
      );
      if (stanceEl) stanceEl.checked = true;
    }

    if (draft.thumbnail_url) {
      const thumbPreview = document.getElementById('thumbPreview');
      if (thumbPreview) {
        thumbPreview.innerHTML = `<img src="${draft.thumbnail_url}" />`;
      }
    }

    if (draft.video_url) {
      const videoPreview = document.getElementById('videoPreview');
      if (videoPreview) {
        videoPreview.innerHTML = '';

        const video = document.createElement('video');
        video.src = draft.video_url;
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
    if (!currentDraft) return;

    // 🔥 정상 이동이면 삭제 금지
    if (window.__ALLOW_DRAFT_EXIT__ === true) {
      console.log('[DRAFT CLEANUP] 정상 이동 → 삭제 안 함');
      return;
    }

    try {
      const paths = [];

      if (currentDraft.thumbnail_url) {
        paths.push(
          currentDraft.thumbnail_url.split('/storage/v1/object/public/issues/')[1]
        );
      }

      if (currentDraft.video_url) {
        paths.push(
          currentDraft.video_url.split('/storage/v1/object/public/issues/')[1]
        );
      }

      if (paths.length > 0) {
        window.supabaseClient
          .storage
          .from('issues')
          .remove(paths);
      }

      window.supabaseClient
        .from('issues')
        .delete()
        .eq('id', currentDraft.id)
        .eq('status', 'draft');

      console.log('[DRAFT CLEANUP] 이탈로 draft 삭제');

    } catch (e) {
      console.warn('[DRAFT CLEANUP FAIL]', e);
    }
  });
});