document.addEventListener('DOMContentLoaded', async () => {
  // 🔒 write.js와 완전 분리
  // 이 파일은 AI만 담당

  // Supabase 로드 대기
  let retry = 0;
  while (!window.supabaseClient && retry < 50) {
    await new Promise(r => setTimeout(r, 50));
    retry++;
  }

  if (!window.supabaseClient) {
    console.warn('[AI] Supabase not loaded');
    return;
  }

  const supabase = window.supabaseClient;

  const runAiBtn = document.getElementById('runAi');
  const userText = document.getElementById('aiUserText');
  const resultText = document.getElementById('aiResultText');

  if (!runAiBtn || !userText || !resultText) {
    // write 페이지가 아니면 조용히 종료
    return;
  }

  runAiBtn.addEventListener('click', async () => {
    if (!userText.value.trim()) {
      alert('다듬을 텍스트를 입력하세요');
      return;
    }

    runAiBtn.disabled = true;
    runAiBtn.textContent = 'AI 처리 중…';

    // 스타일 추출 (텍스트 기반, dataset 없어도 안전)
    const activeTab =
      document.querySelector('.ai-style-tabs .active');
    const style = activeTab
      ? activeTab.textContent.trim()
      : '기본';

    try {
      const { data, error } = await supabase.functions.invoke(
        'ai-write-helper',
        {
          body: {
            text: userText.value,
            style
          }
        }
      );

      if (error) throw error;
      if (!data || !data.result) {
        throw new Error('AI 응답 없음');
      }

      resultText.value = data.result;

    } catch (err) {
      console.error('[AI ERROR]', err);
      alert('AI 처리 중 오류가 발생했습니다');
    }

    runAiBtn.disabled = false;
    runAiBtn.textContent = 'AI 실행';
  });
});