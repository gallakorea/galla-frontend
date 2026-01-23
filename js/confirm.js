// 🔒 CONFIRM MODE — 절대 자동 발행 금지
window.__CONFIRM_MODE__ = true;
let __USER_CONFIRMED_PUBLISH__ = false;

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[confirm.js] Loaded');

  /* =====================
     Supabase client 대기
  ===================== */
  const waitForSupabase = () =>
    new Promise(resolve => {
      const t = setInterval(() => {
        if (window.supabaseClient) {
          clearInterval(t);
          resolve(window.supabaseClient);
        }
      }, 20);
    });

  const supabase = await waitForSupabase();
  if (!supabase) {
    alert('Supabase 초기화 실패');
    return;
  }

  /* =====================
     🔐 세션 확인
  ===================== */
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;

  if (!user) {
    alert('로그인이 필요합니다.');
    location.href = 'login.html';
    return;
  }

  /* =====================
     draft ID
  ===================== */
  const params = new URLSearchParams(location.search);
  const draftId = params.get('draft');

  // 🔥 CHECK-ONLY MODE (검사 전용)
  const isCheckOnly =
    params.get('mode') === 'check' ||
    sessionStorage.getItem('__DRAFT_CHECK_ONLY__') === 'true';

  if (isCheckOnly) {
    console.log('[confirm.js] CHECK-ONLY MODE → 발행 차단');
  }

  const backBtn = document.getElementById('backBtn');
  const publishBtn = document.getElementById('publishBtn');

  if (!draftId) {
    alert('임시 저장된 글이 없습니다.');
    location.href = 'write.html';
    return;
  }

  /* =====================
     draft 로드
  ===================== */
  const { data: draft, error } = await supabase
    .from('issues')
    .select('*')
    .eq('id', draftId)
    .eq('status', 'draft')
    .single();

  if (error || !draft) {
    alert('임시 글을 불러오지 못했습니다.');
    location.href = 'write.html';
    return;
  }

  // 🔒 DB 기반 검사 전용 차단 (최종 안전장치)
  if (draft.draft_mode === 'check') {
    console.log('[confirm.js] DB draft_mode=check → 발행 완전 차단');
    publishBtn.disabled = true;
    publishBtn.textContent = '검사 전용 단계';
  }

  /* =====================
     MOCK 검사 결과
  ===================== */
  renderResult('check-title', 'PASS', '문제 없음');
  renderResult('check-oneline', 'PASS', '문제 없음');
  renderResult('check-description', 'PASS', '문제 없음');

  // 🔒 검사 전용 모드에서는 발행 버튼 비활성화
  if (isCheckOnly) {
    publishBtn.disabled = true;
    publishBtn.textContent = '검사 전용 단계';
  } else {
    publishBtn.disabled = false;
  }

  // 🔒 안전장치: confirm 진입 시 자동 발행 절대 금지
  if (!publishBtn) {
    console.warn('[confirm.js] publishBtn 없음 — 발행 불가');
    return;
  }

  /* =====================
     뒤로가기
  ===================== */
  backBtn.onclick = () => {
    location.href = `write.html?draft=${draftId}`;
  };

  /* =====================
     🔥 최종 발행 (미디어 이동 포함)
  ===================== */
  publishBtn.onclick = async () => {
    if (draft.draft_mode === 'check') {
      alert('검사 전용 단계에서는 발행할 수 없습니다.');
      return;
    }

    // 🔒 검사 전용 모드에서는 절대 발행 불가
    if (isCheckOnly) {
      alert('이 단계에서는 발행할 수 없습니다.');
      return;
    }

    // 🔒 최종 발행은 반드시 사용자 명시적 클릭으로만 허용
    if (window.__CONFIRM_MODE__ !== true) {
      console.warn('[confirm.js] CONFIRM_MODE 아님 — 발행 차단');
      return;
    }

    __USER_CONFIRMED_PUBLISH__ = true;

    publishBtn.disabled = true;
    publishBtn.textContent = '발행 중…';

    try {
      const updates = {};
      const removePaths = [];

      /* ---------- 썸네일 이동 ---------- */
      if (draft.thumbnail_url) {
        const oldPath =
          draft.thumbnail_url.split('/storage/v1/object/public/issues/')[1];

        const ext = oldPath.split('.').pop();
        const newPath = `public/${draft.id}/thumbnail.${ext}`;

        const { error: copyErr } = await supabase
          .storage
          .from('issues')
          .copy(oldPath, newPath);

        if (copyErr) throw copyErr;

        updates.thumbnail_url =
          supabase.storage.from('issues').getPublicUrl(newPath).data.publicUrl;

        removePaths.push(oldPath);
      }

      /* ---------- 영상 이동 ---------- */
      if (draft.video_url) {
        const oldPath =
          draft.video_url.split('/storage/v1/object/public/issues/')[1];

        const ext = oldPath.split('.').pop();
        const newPath = `public/${draft.id}/video.${ext}`;

        const { error: copyErr } = await supabase
          .storage
          .from('issues')
          .copy(oldPath, newPath);

        if (copyErr) throw copyErr;

        updates.video_url =
          supabase.storage.from('issues').getPublicUrl(newPath).data.publicUrl;

        removePaths.push(oldPath);
      }

      /* ---------- DB 상태 변경 (🔥 여기서만 발행) ---------- */
      const { error: updateError } = await supabase
        .from('issues')
        .update({
          ...updates,
          status: 'normal',
          moderation_status: 'pending',
          updated_at: new Date().toISOString(),
        })
        .eq('id', draft.id)
        .eq('status', 'draft'); // 🔒 draft만 발행 가능

      if (updateError) throw updateError;

      /* ---------- draft 파일 제거 ---------- */
      if (removePaths.length > 0) {
        await supabase
          .storage
          .from('issues')
          .remove(removePaths);
      }

      /* ---------- 완료 ---------- */
      location.href = `issue.html?id=${draft.id}`;

    } catch (err) {
      console.error('[PUBLISH ERROR]', err);
      alert('발행 중 오류가 발생했습니다.');
      publishBtn.disabled = false;
      publishBtn.textContent = '최종 발행';
      __USER_CONFIRMED_PUBLISH__ = false;
    }
  };

  // 🔒 confirm 페이지 이탈은 발행으로 간주하지 않음
  window.addEventListener('beforeunload', () => {
    if (!__USER_CONFIRMED_PUBLISH__) {
      console.log('[confirm.js] 검사 페이지 이탈 — 발행 아님');
    }
  });
});

/* =====================
   UI Helper
===================== */
function renderResult(id, result, reason) {
  const el = document.getElementById(id);
  if (!el) return;

  el.classList.remove('loading');
  el.classList.add(result.toLowerCase());

  el.innerHTML = `
    <strong>${labelMap[id]}</strong><br>
    ${result} · ${reason}
  `;
}

const labelMap = {
  'check-title': '제목',
  'check-oneline': '한줄 요약',
  'check-description': '본문',
};