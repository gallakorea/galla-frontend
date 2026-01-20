// js/confirm.js
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

  /* =====================
     🔒 WRITE vs REMIX 분기
     - write: 입장 선택 필요
     - write-remix: 입장 선택 절대 금지
  ===================== */
  const isRemix = Boolean(draft.remix_origin_issue_id);

  if (!isRemix) {
    // 일반 write 글만 입장 필수 검사
    if (!draft.author_stance) {
      alert('이슈에 대한 입장을 선택해주세요.');
      location.href = `write.html?draft=${draftId}`;
      return;
    }
  } else {
    // remix 글은 confirm 단계에서 입장을 묻지 않는다
    console.log('[confirm] REMIX MODE: stance check skipped');
  }

  /* =====================
     MOCK 검사 결과
  ===================== */
  renderResult('check-title', 'PASS', '문제 없음');
  renderResult('check-oneline', 'PASS', '문제 없음');
  renderResult('check-description', 'PASS', '문제 없음');

  publishBtn.disabled = false;

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

      /* ---------- DB 상태 변경 ---------- */
      const { error: updateError } = await supabase
        .from('issues')
        .update({
          ...updates,
          status: 'normal',
          moderation_status: 'pending',
          updated_at: new Date().toISOString(),
        })
        .eq('id', draft.id);

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
    }
  };
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