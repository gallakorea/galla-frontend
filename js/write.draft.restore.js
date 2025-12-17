// js/write.draft.restore.js
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[DRAFT RESTORE] Loaded');

  /* =========================
     0️⃣ draft_id를 URL에서 읽는다 (🔥 핵심)
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

  let currentDraft = null; // 🔥 cleanup 용으로 저장

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

    currentDraft = draft; // 🔥 전역 보관

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
     🚨 페이지 이탈 시 draft + storage 자동 정리
     (작성 취소 버튼 없이 이탈 = 삭제)
  ================================================= */
  window.addEventListener('beforeunload', () => {
    if (!currentDraft) return;

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
        .eq('id', currentDraft.id);

      console.log('[DRAFT CLEANUP] draft + files removed');

    } catch (e) {
      console.warn('[DRAFT CLEANUP FAIL]', e);
    }
  });
});