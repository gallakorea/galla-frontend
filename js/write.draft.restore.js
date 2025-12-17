document.addEventListener('DOMContentLoaded', async () => {
  console.log('[DRAFT RESTORE] Loaded');

  /* =========================
     0️⃣ draft_id를 URL에서 읽는다
  ========================= */
  const params = new URLSearchParams(location.search);
  const draftId = params.get('draft');

  if (!draftId) {
    console.log('[DRAFT RESTORE] draft 파라미터 없음');
    return;
  }

  /* =========================
     Supabase client 확인
  ========================= */
  if (!window.supabaseClient) {
    console.error('[DRAFT RESTORE] Supabase 연결 실패');
    return;
  }

  let currentDraft = null;          // 🔥 실제 draft
  let isNavigating = false;         // 🔥 정상 이동 플래그

  /* =========================
     🔥 정상 이동 감지 (confirm / publish)
  ========================= */
  window.addEventListener('pagehide', () => {
    isNavigating = true;
  });

  window.addEventListener('beforeunload', () => {
    if (window.__DRAFT_NAVIGATING__ === true) {
      isNavigating = true;
    }
  });

  try {
    /* =========================
       1️⃣ draft 조회
    ========================= */
    const { data: draft, error } =
      await window.supabaseClient
        .from('issues')
        .select('*')
        .eq('id', draftId)
        .eq('status', 'draft')
        .single();

    if (error || !draft) {
      console.warn('[DRAFT RESTORE] draft 없음 또는 상태 불일치');
      return;
    }

    currentDraft = draft;

    /* =========================
       2️⃣ write 폼 필드 복원
    ========================= */
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

    /* =========================
       3️⃣ 썸네일 미리보기 복원
    ========================= */
    if (draft.thumbnail_url) {
      const thumbPreview = document.getElementById('thumbPreview');
      if (thumbPreview) {
        thumbPreview.innerHTML = `<img src="${draft.thumbnail_url}" />`;
      }
    }

    /* =========================
       4️⃣ 영상 미리보기 복원
    ========================= */
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

    console.log('[DRAFT RESTORE] draft 복원 완료:', draftId);

  } catch (err) {
    console.error('[DRAFT RESTORE ERROR]', err);
  }

  /* =================================================
     🚨 진짜 이탈 시에만 draft + storage 삭제
     - 새로고침
     - 탭 닫기
     - URL 직접 변경
     ❌ confirm / publish 이동은 제외
  ================================================= */
  window.addEventListener('beforeunload', async () => {
    if (!currentDraft) return;
    if (isNavigating) {
      console.log('[DRAFT CLEANUP] 정상 이동 → 삭제 스킵');
      return;
    }

    try {
      const paths = [];

      if (currentDraft.thumbnail_url) {
        const p = currentDraft.thumbnail_url
          .split('/storage/v1/object/public/issues/')[1];
        if (p) paths.push(p);
      }

      if (currentDraft.video_url) {
        const p = currentDraft.video_url
          .split('/storage/v1/object/public/issues/')[1];
        if (p) paths.push(p);
      }

      if (paths.length > 0) {
        await window.supabaseClient
          .storage
          .from('issues')
          .remove(paths);
      }

      await window.supabaseClient
        .from('issues')
        .delete()
        .eq('id', currentDraft.id)
        .eq('status', 'draft');

      console.log('[DRAFT CLEANUP] draft + files 완전 삭제');

    } catch (e) {
      console.warn('[DRAFT CLEANUP FAIL]', e);
    }
  });
});