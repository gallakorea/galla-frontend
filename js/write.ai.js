// js/write.ai.js
document.addEventListener('DOMContentLoaded', () => {
  const runAiBtn = document.getElementById('runAi');
  const applyAiBtn = document.getElementById('applyAi');

  const aiUserText = document.getElementById('aiUserText');
  const aiResultText = document.getElementById('aiResultText');
  const descEl = document.getElementById('description');
  const aiModal = document.getElementById('aiModal');

  const aiStanceSelect = document.getElementById('aiStance');
  const aiPromptInput = document.getElementById('aiPrompt');
  const aiCustomWrap = document.getElementById('aiCustomPromptWrap');

  /* ======================================================
     1️⃣ 유틸: 어조 강도 선택 (1~5)
  ====================================================== */
  function getSelectedTone() {
    const checked = document.querySelector('input[name="aiTone"]:checked');
    return checked ? Number(checked.value) : 3; // 기본값: 중간
  }

  /* ======================================================
     2️⃣ 유틸: 커스텀 프롬프트
  ====================================================== */
  function getCustomPrompt() {
    if (!aiCustomWrap || aiCustomWrap.style.display === 'none') {
      return null;
    }
    return aiPromptInput.value.trim() || null;
  }

  /* ======================================================
     3️⃣ AI 실행
  ====================================================== */
  if (runAiBtn) {
    runAiBtn.addEventListener('click', async () => {
      if (!window.supabaseClient) {
        alert('시스템 준비 중입니다. 잠시 후 다시 시도해주세요.');
        return;
      }

      if (!aiUserText.value.trim()) {
        alert('AI에게 전달할 글을 입력해주세요.');
        return;
      }

      const stance = aiStanceSelect?.value || 'neutral'; // neutral | pro | con | dual | question
      const tone = getSelectedTone();                    // 1 ~ 5
      const customPrompt = getCustomPrompt();            // string | null

      runAiBtn.disabled = true;
      runAiBtn.textContent = 'AI 분석 중…';

      try {
        const { data, error } =
          await window.supabaseClient.functions.invoke(
            'ai-write-helper',
            {
              body: {
                text: aiUserText.value,
                stance,
                tone,
                custom_prompt: customPrompt
              }
            }
          );

        if (error) throw error;

        aiResultText.value = data?.result || '';

      } catch (e) {
        console.error('[AI WRITE ERROR]', e);
        alert('AI 처리 중 오류가 발생했습니다.');
      }

      runAiBtn.disabled = false;
      runAiBtn.textContent = 'AI 실행';
    });
  }

  /* ======================================================
     4️⃣ AI 결과 적용
  ====================================================== */
  if (applyAiBtn) {
    applyAiBtn.addEventListener('click', () => {
      if (!aiResultText.value.trim()) {
        alert('적용할 AI 결과가 없습니다.');
        return;
      }

      descEl.value = aiResultText.value;
      aiModal.style.display = 'none';
      document.body.style.overflow = '';
    });
  }
});