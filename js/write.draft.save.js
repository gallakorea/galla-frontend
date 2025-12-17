document.addEventListener('DOMContentLoaded', () => {
  const issuePreview = document.getElementById('issuePreview');
  if (!issuePreview) return;

  issuePreview.addEventListener('click', async (e) => {
    const btn = e.target.closest('#publishPreview');
    if (!btn) return;

    // 🔥 write.js 기본 이동 완전 차단
    e.preventDefault();
    e.stopImmediatePropagation();

    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '임시 저장 중…';

    try {
      if (!window.supabaseClient) {
        alert('Supabase 연결 오류');
        return;
      }

      /* =========================
         1️⃣ 로그인 세션 확인 (단일 기준)
      ========================= */
      const { data } =
        await window.supabaseClient.auth.getSession();

      const user = data?.session?.user;
      if (!user) {
        alert('로그인이 필요합니다.');
        return;
      }

      /* =========================
         2️⃣ write 값 수집
      ========================= */
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
         3️⃣ 파일
      ========================= */
      const thumbFile =
        document.getElementById('thumbnail')?.files?.[0] || null;
      const videoFile =
        document.getElementById('video')?.files?.[0] || null;

      let thumbnail_url = null;
      let video_url = null;

      /* 썸네일 */
      if (thumbFile) {
        const ext = thumbFile.name.split('.').pop();
        const path = `drafts/${user.id}/thumbnail_${crypto.randomUUID()}.${ext}`;

        await window.supabaseClient
          .storage
          .from('issues')
          .upload(path, thumbFile);

        thumbnail_url =
          window.supabaseClient
            .storage
            .from('issues')
            .getPublicUrl(path).data.publicUrl;
      }

      /* 영상 */
      if (videoFile) {
        const ext = videoFile.name.split('.').pop();
        const path = `drafts/${user.id}/video_${crypto.randomUUID()}.${ext}`;

        await window.supabaseClient
          .storage
          .from('issues')
          .upload(path, videoFile);

        video_url =
          window.supabaseClient
            .storage
            .from('issues')
            .getPublicUrl(path).data.publicUrl;
      }

      /* =========================
         4️⃣ draft 저장
      ========================= */
      const { data: draft, error } =
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
            thumbnail_url,
            video_url,
            status: 'draft',
            moderation_status: 'pending',
          }])
          .select('id')
          .single();

      if (error || !draft?.id) {
        throw error || new Error('draft 생성 실패');
      }

      /* =========================
         5️⃣ confirm 이동 (유일한 진입)
      ========================= */
      location.href = `confirm.html?draft=${draft.id}`;

    } catch (err) {
      console.error('[DRAFT SAVE ERROR]', err);
      alert('임시 저장 중 오류가 발생했습니다.');
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });
});