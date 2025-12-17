// js/write.draft.save.js
document.addEventListener('DOMContentLoaded', () => {
  const issuePreview = document.getElementById('issuePreview');
  if (!issuePreview) return;

  /**
   * write.js에서 미리보기 생성 후
   * "발행 전 적합성 검사" 버튼 클릭을 가로챈다
   */
  issuePreview.addEventListener('click', async (e) => {
    const btn = e.target.closest('#publishPreview');
    if (!btn) return;

    e.preventDefault();

    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = '임시 저장 중…';

    try {
      if (!window.supabaseClient) {
        alert('Supabase 연결 오류');
        return;
      }

      /* =========================
         1️⃣ 로그인 유저 확인
      ========================= */
      const {
        data: { user },
        error: authError,
      } = await window.supabaseClient.auth.getUser();

      if (authError || !user) {
        alert('로그인이 필요합니다.');
        return;
      }

      /* =========================
         2️⃣ write 페이지 값 수집
      ========================= */
      const category = document.getElementById('category')?.value;
      const title = document.getElementById('title')?.value;
      const oneLine = document.getElementById('oneLine')?.value || null;
      const description = document.getElementById('description')?.value;
      const donationTarget = document.getElementById('donationTarget')?.value;
      const isAnonymous = document.getElementById('isAnonymous')?.checked ?? false;

      if (!category || !title || !description || !donationTarget) {
        alert('필수 항목이 누락되었습니다.');
        return;
      }

      /* =========================
         3️⃣ 파일 수집 (input 그대로)
      ========================= */
      const thumbFile =
        document.getElementById('thumbnail')?.files?.[0] || null;
      const videoFile =
        document.getElementById('video')?.files?.[0] || null;

      let thumbnail_url = null;
      let video_url = null;

      /* =========================
         4️⃣ 썸네일 업로드 (선택)
      ========================= */
      if (thumbFile) {
        const thumbExt = thumbFile.name.split('.').pop();
        const thumbPath =
          `drafts/${user.id}/thumbnail_${crypto.randomUUID()}.${thumbExt}`;

        const { error: uploadError } =
          await window.supabaseClient.storage
            .from('issues')
            .upload(thumbPath, thumbFile, { upsert: false });

        if (uploadError) throw uploadError;

        const { data } =
          window.supabaseClient.storage
            .from('issues')
            .getPublicUrl(thumbPath);

        thumbnail_url = data.publicUrl;
      }

      /* =========================
         5️⃣ 영상 업로드 (선택)
      ========================= */
      if (videoFile) {
        const videoExt = videoFile.name.split('.').pop();
        const videoPath =
          `drafts/${user.id}/video_${crypto.randomUUID()}.${videoExt}`;

        const { error: uploadError } =
          await window.supabaseClient.storage
            .from('issues')
            .upload(videoPath, videoFile, { upsert: false });

        if (uploadError) throw uploadError;

        const { data } =
          window.supabaseClient.storage
            .from('issues')
            .getPublicUrl(videoPath);

        video_url = data.publicUrl;
      }

      /* =========================
         6️⃣ draft INSERT
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
            thumbnail_url,
            video_url,
            status: 'draft',
            moderation_status: 'pending',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }])
          .select('id')
          .single();

      if (insertError) throw insertError;

      /* =========================
         7️⃣ draft_id 저장 후 이동
      ========================= */
      sessionStorage.setItem('draft_id', draft.id);
      location.href = 'confirm.html';

    } catch (err) {
      console.error('[DRAFT SAVE ERROR]', err);
      alert('임시 저장 중 오류가 발생했습니다.');
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });
});