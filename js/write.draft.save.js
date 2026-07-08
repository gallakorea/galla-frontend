// 🔒 Draft State Machine (edit | check)
window.__DRAFT_MODE__ = 'edit';
window.__CHECK_ONLY__ = false;

document.addEventListener('DOMContentLoaded', () => {
  // 🚨 remix 페이지에서는 draft.save.js 완전 차단
  if (window.__REMIX_CHECK_ONLY__ === true) {
    console.warn('[draft.save] blocked inside DOMContentLoaded (remix)');
    return;
  }

  const issuePreview = document.getElementById('issuePreview');
  if (!issuePreview) return;

  issuePreview.addEventListener('click', async (e) => {
    // 🚨 remix 검사/작성 중이면 draft.save.js 실행 금지
    if (window.__REMIX_CHECK_ONLY__ === true) {
      console.warn('[draft.save] click blocked by remix mode');
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }

    // Draft save is now bound to both the draft button and the 검사 button.
    const isCheckBtn =
      e.target.closest('#checkOnlyPreview');
    const isSaveBtn = e.target.closest('#saveDraft');
    const btn = isCheckBtn || isSaveBtn;
    if (!btn) return;

    if (isCheckBtn) {
      console.log('[draft.save] CHECK ONLY → issues_draft 생성');
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
      const imageFiles =
        [...(document.getElementById('thumbnail')?.files || [])];
      const videoFile =
        document.getElementById('video')?.files?.[0] || null;

      let thumbnail_url = null;
      let video_url = null;
      let images = null;

      // 이미지 (Cloudflare R2, 여러 장)
      if (imageFiles.length > 0) {
        images = [];
        for (let i = 0; i < imageFiles.length; i++) {
          const label = `이미지 업로드 중… (${i + 1}/${imageFiles.length})`;
          btn.textContent = label;
          images.push(await window.GALLA_UPLOAD_MEDIA(imageFiles[i], 'image',
            p => { btn.textContent = p == null ? label : `${label} ${p}%`; }));
        }
        thumbnail_url = images[0];
      }

      // 영상 (Cloudflare R2)
      if (videoFile) {
        btn.textContent = '영상 업로드 중…';
        video_url = await window.GALLA_UPLOAD_MEDIA(videoFile, 'video',
          p => { btn.textContent = p == null ? '영상 업로드 중…' : `영상 업로드 중… ${p}%`; });
      }

      /* =========================
         4️⃣ draft INSERT
      ========================= */
      const { data: draft, error: insertError } =
        await window.supabaseClient
          .from('issues_draft')
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
            images,
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