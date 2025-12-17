// confirmation.js
document.addEventListener('DOMContentLoaded', () => {
  const publishBtn = document.getElementById('publishConfirmBtn');
  const cancelBtn = document.getElementById('cancelConfirmBtn');

  if (!publishBtn) {
    console.error('[CONFIRM] publish 버튼 없음');
    return;
  }

  publishBtn.addEventListener('click', async () => {
    const payloadRaw = sessionStorage.getItem('writePayload');

    if (!payloadRaw) {
      alert('작성 정보가 없습니다.');
      return;
    }

    const payload = JSON.parse(payloadRaw);

    if (!payload.description || !payload.description.trim()) {
      alert('내용이 비어 있습니다.');
      return;
    }

    publishBtn.disabled = true;
    publishBtn.textContent = '적정성 검사 중…';

    /* =========================
       1️⃣ AI 적정성 검사
       ========================= */
    const moderation = await runModerationCheck(payload.description);

    publishBtn.disabled = false;
    publishBtn.textContent = '발행하기';

    /* =========================
       2️⃣ 결과 분기
       ========================= */
    if (moderation.result === 'FAIL') {
      showFailModal(moderation.reason);
      return;
    }

    if (moderation.result === 'WARNING') {
      showWarningModal(moderation.reason, () => {
        publishIssue(payload, 'warning', moderation);
      });
      return;
    }

    // PASS
    publishIssue(payload, 'pass', moderation);
  });

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      history.back();
    });
  }
});

/* =========================
   AI 적정성 검사 호출
   ========================= */
async function runModerationCheck(text) {
  if (!window.supabaseClient) {
    return { result: 'FAIL', reason: 'Supabase 연결 실패' };
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
      reason: '적정성 판정 중 오류 발생',
    };
  }
}

/* =========================
   FAIL 처리
   ========================= */
function showFailModal(reason) {
  alert(
    `❌ 발행이 보류되었습니다.\n\n사유: ${reason}\n\n표현을 수정한 뒤 다시 시도해주세요.`
  );
}

/* =========================
   WARNING 처리
   ========================= */
function showWarningModal(reason, onConfirm) {
  const ok = confirm(
`⚠️ 표현 주의 안내

${reason}

이 글은 공개되며,
법적·사회적 책임은 작성자에게 있습니다.

계속 발행하시겠습니까?`
  );

  if (ok && typeof onConfirm === 'function') {
    onConfirm();
  }
}

/* =========================
   ✅ 실제 발행 + moderation_logs 기록
   ========================= */
async function publishIssue(payload, moderationStatus, moderation) {
  if (!window.supabaseClient) {
    alert('Supabase 연결 실패');
    return;
  }

  try {
    /* 1️⃣ 로그인 유저 */
    const {
      data: { user },
      error: authError
    } = await window.supabaseClient.auth.getUser();

    if (authError || !user) {
      alert('로그인이 필요합니다.');
      return;
    }

    /* 2️⃣ issues insert */
    const { data: issueRow, error: issueError } =
      await window.supabaseClient
        .from('issues')
        .insert([{
          user_id: user.id,
          category: payload.category,
          title: payload.title,
          description: payload.description,
          thumbnail_url: payload.thumbnail_url ?? null,
          video_url: payload.video_url ?? null,
          tags: payload.tags ?? null,
          status: 'normal',
          moderation_status: moderationStatus,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }])
        .select('id')
        .single();

    if (issueError) throw issueError;

    /* 3️⃣ moderation_logs insert (내부 기록용) */
    await window.supabaseClient
      .from('moderation_logs')
      .insert([{
        issue_id: issueRow.id,
        user_id: user.id,
        result: moderation.result,
        reason: moderation.reason,
        content_snapshot: payload.description,
      }]);

    /* 4️⃣ 완료 */
    sessionStorage.removeItem('writePayload');
    alert('정상적으로 발행되었습니다.');
    location.href = 'index.html';

  } catch (e) {
    console.error('[PUBLISH ERROR]', e);
    alert('발행 중 오류가 발생했습니다.');
  }
}