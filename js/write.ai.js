document.addEventListener('DOMContentLoaded', async () => {
  /* ================= SUPABASE READY ================= */
  let retry = 0;
  while (!window.supabaseClient) {
    await new Promise(r => setTimeout(r, 20));
    if (++retry > 100) {
      console.error('[AI] Supabase not loaded');
      return;
    }
  }
  const supabase = window.supabaseClient;

  /* ================= AI ELEMENTS ================= */
  const runAiBtn = document.getElementById('runAi');
  const aiUserText = document.getElementById('aiUserText');
  const aiResultText = document.getElementById('aiResultText');

  if (!runAiBtn) {
    console.error('[AI] runAi button not found');
    return;
  }

  /* ================= AI RUN ================= */
  runAiBtn.addEventListener('click', async () => {
    runAiBtn.disabled = true;
    runAiBtn.textContent = 'AI 처리 중…';

    // 스타일 탭 (텍스트 기반으로 처리)
    const activeTab =
      document.querySelector('.ai-style-tabs .active');
    const style = activeTab ? activeTab.textContent : '기본';

    try {
      const { data, error } = await supabase.functions.invoke(
        'ai-write-helper',
        {
          body: {
            text: aiUserText.value,
            style
          }
        }
      );

      if (error) throw error;

      aiResultText.value = data.result;

    } catch (e) {
      console.error(e);
      alert('AI 처리 실패');
    }

    runAiBtn.disabled = false;
    runAiBtn.textContent = 'AI 실행';
  });
});