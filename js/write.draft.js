// js/write.draft.js
document.addEventListener('DOMContentLoaded', () => {
  const issuePreview = document.getElementById('issuePreview');

  // preview 영역은 동적으로 생성되므로 delegation
  issuePreview.addEventListener('click', async (e) => {
    const btn = e.target.closest('#publishPreview');
    if (!btn) return;

    btn.disabled = true;
    btn.textContent = '임시 저장 중…';

    try {
      if (!window.supabaseClient) {
        alert('Supabase 연결 오류');
        return;
      }

      /* =========================
         1️⃣ 사용자 확인
      ========================= */
      const { data: { user } } =
        await window.supabaseClient.auth.getUser();

      if (!user) {
        alert('로그인이 필요합니다.');
        return;
      }

      /* =========================
         2️⃣ write 페이지 값 수집
      ========================= */
      const category = document.getElementById('category')?.value;
      const title = document.getElementById('title')?.value;
      const oneLine = document.getElementById('oneLine')?.value;
      const description = document.getElementById('description')?.value;
      const donationTarget = document.getElementById('donationTarget')?.value;
      const isAnonymous = document.getElementById('isAnonymous')?.checked;

      if (!category || !title || !description || !donationTarget) {
        alert('필수 항목이 누락되었습니다.');
        return;
      }

      /* =========================
         3️⃣ 파일 가져오기
      ========================= */
      const thumbFile = document.getElementById('thumbnail')?.files?.[0] || null;
      const videoFile = document.getElementById('video')?.files?.[0] || null;

      let thumbnail_url = null;
      let video_url = null;

      /* =========================
         4️⃣ 썸네일 업로드
      ========================= */
      if (thumbFile) {
        const thumbPath = `drafts/${user.id}/${crypto.randomUUID()}.${thumbFile.name.split('.').pop()}`;

        const { error } =
          await window.supabaseClient.storage
            .from('issues')
            .upload(thumbPath, thumbFile, { upsert: false });

        if (error) throw error;

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
        const videoPath = `drafts/${user.id}/${crypto.randomUUID()}.${videoFile.name.split('.').pop()}`;

        const { error } =
          await window.supabaseClient.storage
            .from('issues')
            .upload(videoPath, videoFile, { upsert: false });

        if (error) throw error;

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
      btn.textContent = '발행 전 적합성 검사';
    }
  });
});