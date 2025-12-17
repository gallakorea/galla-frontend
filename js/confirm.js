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
     🔐 세션 즉시 확인 (🔥 핵심 수술)
  ===================== */
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;

  if (!user) {
    alert('로그인이 필요합니다.');
    location.href = 'login.html';
    return;
  }

  /* =====================
     draft ID (URL 기준)
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
     1️⃣ draft 불러오기
  ===================== */
  const { data: draft, error } =
    await supabase
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
     2️⃣ 적합성 검사 (MOCK)
  ===================== */
  renderResult('check-title', 'PASS', '문제 없음');
  renderResult('check-oneline', 'PASS', '문제 없음');
  renderResult('check-description', 'PASS', '문제 없음');

  publishBtn.disabled = false;

  /* =====================
     3️⃣ 뒤로 가기 (draft 유지)
  ===================== */
  backBtn.onclick = () => {
    location.href = `write.html?draft=${draftId}`;
  };

  /* =====================
     4️⃣ 최종 발행
  ===================== */
  publishBtn.onclick = async () => {
    publishBtn.disabled = true;
    publishBtn.textContent = '발행 중…';

    const { error: updateError } =
      await supabase
        .from('issues')
        .update({
          status: 'normal',
          moderation_status: 'pending',
          updated_at: new Date().toISOString(),
        })
        .eq('id', draftId);

    if (updateError) {
      console.error('[PUBLISH ERROR]', updateError);
      alert('발행 중 오류가 발생했습니다.');
      publishBtn.disabled = false;
      publishBtn.textContent = '최종 발행';
      return;
    }

    location.href = `issue.html?id=${draftId}`;
  };
});

/* =====================
   UI 헬퍼
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

/* =========================
   CONFIRM PAGE FIX
========================= */

/* 하단 네비 공간 확보 */
body[data-page="confirm"] #app {
  padding-bottom: 120px; /* bottom-nav 높이 + 여유 */
}

/* 하단 네비 항상 하단 고정 */
body[data-page="confirm"] .bottom-nav {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
}