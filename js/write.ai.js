document.addEventListener('DOMContentLoaded', () => {
  const runAiBtn = document.getElementById('runAi');
  const applyAiBtn = document.getElementById('applyAi');

  const aiUserText = document.getElementById('aiUserText');
  const aiResultText = document.getElementById('aiResultText');
  const descEl = document.getElementById('description');
  const aiModal = document.getElementById('aiModal');

  /* ================= AI 실행 ================= */
  if (runAiBtn) {
    runAiBtn.addEventListener('click', async () => {

      // ✅ Supabase 체크는 "여기서만"
      if (!window.supabaseClient) {
        alert('Supabase 준비 중입니다. 새로고침 후 다시 시도해주세요.');
        return;
      }

      if (!aiUserText.value.trim()) {
        alert('AI에게 보낼 글이 없습니다.');
        return;
      }

      runAiBtn.disabled = true;
      runAiBtn.textContent = 'AI 처리 중…';

      try {
        const { data, error } =
          await window.supabaseClient.functions.invoke(
            'ai-write-helper',
            {
              body: {
                text: aiUserText.value,
                style: 'neutral'
              }
            }
          );

        if (error) throw error;

        aiResultText.value = data?.result || '';

      } catch (e) {
        console.error('[AI ERROR]', e);
        alert('AI 처리 실패. 잠시 후 다시 시도해주세요.');
      }

      runAiBtn.disabled = false;
      runAiBtn.textContent = 'AI 실행';
    });
  } else {
    console.warn('[AI] runAi 버튼 없음');
  }

  /* ================= AI 적용 ================= */
  if (applyAiBtn) {
    applyAiBtn.addEventListener('click', () => {
      if (aiResultText.value) {
        descEl.value = aiResultText.value;
      }
      aiModal.style.display = 'none';
      document.body.style.overflow = '';
    });
  } else {
    console.warn('[AI] applyAi 버튼 없음');
  }
});