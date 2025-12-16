(() => {
  const runAiBtn = document.getElementById('runAi');
  const aiUserText = document.getElementById('aiUserText');
  const aiResultText = document.getElementById('aiResultText');

  if (!runAiBtn) {
    console.warn('[AI] runAi button not found');
    return;
  }

  runAiBtn.addEventListener('click', async () => {
    // ✅ 클릭 시점에 Supabase 확인
    if (!window.supabaseClient) {
      alert('AI 준비 중입니다. 잠시 후 다시 시도해주세요.');
      return;
    }

    const supabase = window.supabaseClient;

    runAiBtn.disabled = true;
    runAiBtn.textContent = 'AI 처리 중…';

    const activeTab = document.querySelector('.ai-style-tabs .active');
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
})();