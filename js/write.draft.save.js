// 🔒 Draft State Machine (edit | check)
window.__DRAFT_MODE__ = 'edit';
window.__CHECK_ONLY__ = false;

document.addEventListener('DOMContentLoaded', () => {
  const issuePreview = document.getElementById('issuePreview');
  if (!issuePreview) return;

  issuePreview.addEventListener('click', async (e) => {
    // Draft save is now bound to both the draft button and the 검사 button.
    const isCheckBtn =
      e.target.closest('#checkOnlyPreview');
    const isSaveBtn = e.target.closest('#saveDraft');
    const btn = isCheckBtn || isSaveBtn;
    if (!btn) return;

    if (isCheckBtn) {
      console.log('[draft.save] publishPreview 클릭 → 검사 전용 draft 생성');
    }

    // 🔥 검사 버튼이면 CHECK ONLY 모드 활성화
    if (isCheckBtn) {
      window.__CHECK_ONLY__ = true;
      window.__DRAFT_MODE__ = 'check';
    } else {
      window.__CHECK_ONLY__ = false;
      window.__DRAFT_MODE__ = 'edit';
    }

    // 🔥 write.js 기본 이동 완전 차단
    e.preventDefault();
    e.stopImmediatePropagation();

    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '임시 저장 중…';

    try {
      if (!window.supabaseClient) {
        throw new Error('Supabase client 없음');
      }

      /* =========================
         1️⃣ 로그인 세션 확인
      ========================= */
      const { data: sessionData } =
        await window.supabaseClient.auth.getSession();

      const user = sessionData?.session?.user;
      if (!user) {
        alert('로그인이 필요합니다.');
        return;
      }

      /* =========================
         2️⃣ write 값 수집
      ========================= */
      const authorStance =
        document.querySelector('input[name="authorStance"]:checked')?.value;

      if (!authorStance) {
        alert('이 이슈에 대한 나의 입장을 선택해주세요');
        return;
      }
      const category = document.getElementById('category')?.value;
      const title = document.getElementById('title')?.value;
      const oneLine = document.getElementById('oneLine')?.value || null;
      const description = document.getElementById('description')?.value;
      const donationTarget = document.getElementById('donationTarget')?.value;
      const isAnonymous =
        document.getElementById('isAnonymous')?.checked ?? false;

      if (!category || !title || !description || !donationTarget) {
        alert('필수 항목이 누락되었습니다.');
        return;
      }

      /* =========================
         3️⃣ 파일 업로드
      ========================= */
      const thumbFile =
        document.getElementById('thumbnail')?.files?.[0] || null;
      const videoFile =
        document.getElementById('video')?.files?.[0] || null;

      let thumbnail_url = null;
      let video_url = null;

      // 썸네일
      if (thumbFile) {
        const ext = thumbFile.name.split('.').pop();
        const path = `drafts/${user.id}/thumbnail_${crypto.randomUUID()}.${ext}`;

        const { error: uploadError } =
          await window.supabaseClient
            .storage
            .from('issues')
            .upload(path, thumbFile, { upsert: false });

        if (uploadError) throw uploadError;

        thumbnail_url =
          window.supabaseClient
            .storage
            .from('issues')
            .getPublicUrl(path).data.publicUrl;
      }

      // 영상
      if (videoFile) {
        const ext = videoFile.name.split('.').pop();
        const path = `drafts/${user.id}/video_${crypto.randomUUID()}.${ext}`;

        const { error: uploadError } =
          await window.supabaseClient
            .storage
            .from('issues')
            .upload(path, videoFile, { upsert: false });

        if (uploadError) throw uploadError;

        video_url =
          window.supabaseClient
            .storage
            .from('issues')
            .getPublicUrl(path).data.publicUrl;
      }

      /* =========================
         4️⃣ draft INSERT
      ========================= */
      const { data: draft, error: insertError } =
        await window.supabaseClient
          .from('issues')
          .insert([{
            user_id: user.id,
            category,
            title,
            one_line: oneLine,
            description,
            donation_target: donationTarget,
            is_anonymous: isAnonymous,
            author_stance: authorStance, // 🔥 반드시 필요
            thumbnail_url,
            video_url,
            status: 'draft',
            draft_mode: window.__DRAFT_MODE__,
            moderation_status: 'pending',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }])
          .select('id')
          .single();

      if (insertError || !draft?.id) {
        throw insertError || new Error('draft 생성 실패');
      }

      /* =========================
         5️⃣ confirm 이동 / 임시저장 분기
      ========================= */
      if (window.__DRAFT_MODE__ === 'check') {
        console.log('[draft.save] CHECK MODE → confirm 이동 (발행 절대 금지)');
        window.__ALLOW_DRAFT_EXIT__ = true;

        // 검사 전용 상태를 DB 기준으로 전달
        sessionStorage.setItem('__DRAFT_CHECK_ONLY__', 'true');

        location.href = `confirm.html?draft=${draft.id}&mode=check`;
        return;
      }

      console.log('[draft.save] EDIT MODE → draft 저장만 수행');

    } catch (err) {
      console.error('[DRAFT SAVE ERROR]', err);
      alert('임시 저장 중 오류가 발생했습니다.');
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });
});