document.addEventListener('DOMContentLoaded', async () => {
  const publishBtn = document.getElementById('publishBtn');
  const backBtn = document.getElementById('backBtn');
  const box = document.getElementById('moderationBox');

  if (!publishBtn || !box) {
    console.error('[CONFIRM] 필수 DOM 없음');
    return;
  }

  const payloadRaw = sessionStorage.getItem('writePayload');
  if (!payloadRaw) {
    box.textContent = '작성 정보가 없습니다.';
    box.className = 'confirm-box fail';
    return;
  }

  const payload = JSON.parse(payloadRaw);

  /* =====================
     1️⃣ 자동 적합성 검사
     ===================== */
  box.textContent = 'AI 적합성 검사를 진행 중입니다…';

  const moderation = await runModerationCheck(payload.description);

  box.classList.remove('loading');

  if (moderation.result === 'FAIL') {
    box.classList.add('fail');
    box.textContent = `❌ 발행 불가\n\n사유: ${moderation.reason}`;
    return;
  }

  if (moderation.result === 'WARNING') {
    box.classList.add('warning');
    box.textContent = `⚠️ 표현 주의\n\n${moderation.reason}`;
    publishBtn.disabled = false;
    publishBtn.textContent = '주의 후 발행';
  }

  if (moderation.result === 'PASS') {
    box.classList.add('pass');
    box.textContent = '✅ 발행 가능합니다.';
    publishBtn.disabled = false;
  }

  /* =====================
     2️⃣ 버튼 이벤트
     ===================== */
  publishBtn.onclick = () => {
    if (moderation.result === 'WARNING') {
      const ok = confirm(
`⚠️ 표현 주의 안내

${moderation.reason}

계속 발행하시겠습니까?`
      );
      if (!ok) return;
    }
    publishIssue(payload, moderation);
  };

  backBtn.onclick = () => history.back();
});

/* =====================
   AI 적합성 검사
   ===================== */
async function runModerationCheck(text) {
  if (!window.supabaseClient) {
    return { result: 'WARNING', reason: 'AI 검사 연결 실패' };
  }

  try {
    const { data, error } =
      await window.supabaseClient.functions.invoke(
        'ai-moderation-check',
        { body: { text } }
      );

    if (error) throw error;
    return data;

  } catch (e) {
    console.error('[MODERATION ERROR]', e);
    return {
      result: 'WARNING',
      reason: '적합성 검사 중 오류 발생',
    };
  }
}

/* =====================
   실제 발행
   ===================== */
async function publishIssue(payload, moderation) {
  try {
    const { data: { user } } =
      await window.supabaseClient.auth.getUser();

    if (!user) {
      alert('로그인이 필요합니다.');
      return;
    }

    const { data: issue, error } =
      await window.supabaseClient
        .from('issues')
        .insert([{
          user_id: user.id,
          category: payload.category,
          title: payload.title,
          description: payload.description,
          moderation_status: moderation.result.toLowerCase(),
        }])
        .select('id')
        .single();

    if (error) throw error;

    await window.supabaseClient
      .from('moderation_logs')
      .insert([{
        issue_id: issue.id,
        user_id: user.id,
        result: moderation.result,
        reason: moderation.reason,
        content_snapshot: payload.description,
      }]);

    sessionStorage.removeItem('writePayload');
    alert('정상적으로 발행되었습니다.');
    location.href = 'index.html';

  } catch (e) {
    console.error('[PUBLISH ERROR]', e);
    alert('발행 중 오류가 발생했습니다.');
  }
}