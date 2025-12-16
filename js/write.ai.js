// js/write.ai.js
document.addEventListener('DOMContentLoaded', () => {
  const runAiBtn = document.getElementById('runAi');
  const applyAiBtn = document.getElementById('applyAi');

  const aiUserText = document.getElementById('aiUserText');
  const aiResultText = document.getElementById('aiResultText');
  const descEl = document.getElementById('description');
  const aiModal = document.getElementById('aiModal');

  const aiMoodSelect = document.getElementById('aiMood');
  const aiPromptInput = document.getElementById('aiPrompt');

  /* ================= STYLE MAP ================= */
  const STYLE_MAP = {
    neutral: {
      label: '중립적으로 정리',
      prompt: '주장을 감정 없이 정리하고, 쟁점과 논리를 명확히 드러내줘.'
    },
    cold: {
      label: '차갑게 분석',
      prompt: '감정을 배제하고 사실, 구조, 논리 위주로 냉정하게 재구성해줘.'
    },
    gentle: {
      label: '온화하게 설득',
      prompt: '상대 입장을 존중하면서도 내 주장이 자연스럽게 전달되도록 써줘.'
    },
    aggressive: {
      label: '공격적으로 밀어붙이기',
      prompt: '논리적 허점을 집요하게 파고들며 강한 어조로 주장해줘. 욕설은 제외.'
    },
    uncomfortable: {
      label: '불편하게 찌르기',
      prompt: '상대가 외면하기 힘든 질문과 모순을 드러내는 방식으로 써줘.'
    },
    ironic: {
      label: '비꼬듯 드러내기',
      prompt: '직접 말하지 않고 반어와 아이러니로 문제점을 드러내줘.'
    },
    emotional: {
      label: '마음 건드리기',
      prompt: '사람의 감정을 자극해 공감과 불편함이 동시에 느껴지게 써줘.'
    },
    humorous: {
      label: '유머로 풀기',
      prompt: '위트와 유머를 섞되, 핵심 논지는 흐리지 말고 유지해줘.'
    },
    'result-first': {
      label: '결과부터 제시',
      prompt: '결론을 먼저 제시한 뒤, 왜 그런 결과에 도달했는지 논리를 설명해줘.'
    },
    'cannot-ignore': {
      label: '외면하기 어렵게 시작',
      prompt: '첫 문장부터 독자가 그냥 넘길 수 없도록 강하게 시작해줘.'
    },
    custom: {
      label: '직접 입력',
      prompt: '' // 사용자가 직접 입력
    }
  };

  function getSelectedPrompt() {
    const mood = aiMoodSelect?.value || 'neutral';

    if (mood === 'custom') {
      return {
        label: '커스텀',
        prompt: aiPromptInput.value.trim()
      };
    }

    return STYLE_MAP[mood] || STYLE_MAP.neutral;
  }

  /* ================= AI 실행 ================= */
  if (runAiBtn) {
    runAiBtn.addEventListener('click', async () => {

      if (!window.supabaseClient) {
        alert('Supabase 준비 중입니다. 새로고침 후 다시 시도해주세요.');
        return;
      }

      if (!aiUserText.value.trim()) {
        alert('AI에게 보낼 글이 없습니다.');
        return;
      }

      const style = getSelectedPrompt();

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