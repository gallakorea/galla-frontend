document.addEventListener('DOMContentLoaded', () => {
  const runAiBtn = document.getElementById('runAi');
  const applyAiBtn = document.getElementById('applyAi');

  const aiUserText = document.getElementById('aiUserText');
  const aiResultText = document.getElementById('aiResultText');

  if (!runAiBtn) {
    console.warn('[AI] runAi 버튼 없음');
    return;
  }

  runAiBtn.addEventListener('click', async () => {
    if (!window.supabaseClient) {
      alert('Supabase 준비 중입니다. 새로고침 후 다시 시도해주세요.');
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

      aiResultText.value = data.result || '';

    } catch (e) {
      console.error('[AI ERROR]', e);
      alert('AI 처리 실패. 잠시 후 다시 시도해주세요.');
    }

    runAiBtn.disabled = false;
    runAiBtn.textContent = 'AI 실행';
  });

  applyAiBtn.addEventListener('click', () => {
    if (aiResultText.value) {
      document.getElementById('description').value =
        aiResultText.value;
    }
    document.getElementById('aiModal').style.display = 'none';
    document.body.style.overflow = '';
  });
});