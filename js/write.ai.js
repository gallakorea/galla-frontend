// js/write.ai.js
document.addEventListener('DOMContentLoaded', () => {
  const runAiBtn = document.getElementById('runAi');
  const applyAiBtn = document.getElementById('applyAi');

  const aiUserText = document.getElementById('aiUserText');
  const aiResultText = document.getElementById('aiResultText');
  const descEl = document.getElementById('description');
  const aiModal = document.getElementById('aiModal');

  /* ================= STYLE MAP ================= */
  const STYLE_MAP = {
    neutral: {
      label: '중립적',
      prompt: '사실과 쟁점을 균형 있게 정리하고, 어느 쪽에도 치우치지 않게 작성해줘.'
    },
    aggressive: {
      label: '공격적',
      prompt: '논리적으로 상대의 주장에 강하게 문제를 제기하되 욕설이나 비속어 없이 공격적으로 써줘.'
    },
    cold: {
      label: '차갑게',
      prompt: '감정 표현을 최소화하고 냉정하고 건조한 톤으로 써줘.'
    },
    uncomfortable: {
      label: '불편하게',
      prompt: '읽는 사람이 불편함을 느낄 수 있도록 날카로운 질문과 모순을 드러내는 방식으로 써줘.'
    },
    gentle: {
      label: '온화하게',
      prompt: '상대 입장을 존중하며 갈등을 완화하는 부드러운 톤으로 써줘.'
    },
    ironic: {
      label: '비꼬듯이',
      prompt: '직접적인 공격 대신 아이러니와 반어를 활용해 비판적으로 써줘.'
    },
    humorous: {
      label: '유머러스',
      prompt: '가벼운 유머와 위트를 섞되 논점은 흐리지 않게 써줘.'
    }
  };

  function getSelectedStyle() {
    const activeBtn = document.querySelector('.ai-style-tabs button.active');
    if (!activeBtn) return STYLE_MAP.neutral;
    const key = activeBtn.dataset.style;
    return STYLE_MAP[key] || STYLE_MAP.neutral;
  }

  /* ================= AI 실행 ================= */
  if (runAiBtn) {
    runAiBtn.addEventListener('click', async () => {

      // ✅ Supabase 체크는 여기서만
      if (!window.supabaseClient) {
        alert('Supabase 준비 중입니다. 새로고침 후 다시 시도해주세요.');
        return;
      }

      if (!aiUserText.value.trim()) {
        alert('AI에게 보낼 글이 없습니다.');
        return;
      }

      const style = getSelectedStyle();

      runAiBtn.disabled = true;
      runAiBtn.textContent = 'AI 처리 중…';

      try {
        const { data, error } =
          await window.supabaseClient.functions.invoke(
            'ai-write-helper',
            {
              body: {
                text: aiUserText.value,
                style: style.label,
                style_prompt: style.prompt
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
  }
});