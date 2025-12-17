// js/write.draft.restore.js
document.addEventListener('DOMContentLoaded', async () => {
  const draftId = sessionStorage.getItem('draft_id');
  if (!draftId) return; // draft 없으면 아무 것도 안 함

  if (!window.supabaseClient) {
    console.error('[DRAFT RESTORE] Supabase 연결 실패');
    return;
  }

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
      console.warn('[DRAFT RESTORE] draft 없음');
      sessionStorage.removeItem('draft_id');
      return;
    }

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
        thumbPreview.innerHTML = `
          <img src="${draft.thumbnail_url}" />
        `;
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

    /* =========================
       5️⃣ UX 안내 (조용히)
    ========================= */
    console.log('[DRAFT RESTORE] 임시 저장 글 복원 완료');

  } catch (err) {
    console.error('[DRAFT RESTORE ERROR]', err);
  }
});