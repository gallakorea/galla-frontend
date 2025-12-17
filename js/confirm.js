document.addEventListener('DOMContentLoaded', async () => {
  const backBtn = document.getElementById('backBtn');
  const publishBtn = document.getElementById('publishBtn');

  const payloadRaw = sessionStorage.getItem('writePayload');
  if (!payloadRaw) {
    alert('작성 정보가 없습니다.');
    history.back();
    return;
  }

  const payload = JSON.parse(payloadRaw);

  backBtn.onclick = () => history.back();

  /* 1️⃣ 로컬 검사 */
  const localResult = runLocalCheck(payload);

  renderResult(localResult);

  /* 2️⃣ AI 검사 필요 여부 */
  const needAi =
    Object.values(localResult).some(v => v.result === 'WARNING');

  let finalResult = localResult;

  if (needAi) {
    const aiResult = await runAiModeration(payload);
    finalResult = aiResult;
    renderResult(aiResult);
  }

  /* 3️⃣ 발행 버튼 활성화 */
  publishBtn.disabled = false;

  publishBtn.onclick = () => {
    publishIssue(payload, finalResult);
  };
});

/* =====================
   LOCAL CHECK (무료)
===================== */
function runLocalCheck(payload) {
  return {
    title: checkText(payload.title),
    oneLine: checkText(payload.oneLine),
    description: checkText(payload.description),
  };
}

function checkText(text = '') {
  if (/죽여|살해|사기꾼|범죄자/.test(text)) {
    return { result: 'FAIL', reason: '위험한 표현 포함' };
  }
  if (/이다\.$|확실하다|명백하다/.test(text)) {
    return { result: 'WARNING', reason: '단정적 표현 포함' };
  }
  return { result: 'PASS', reason: '' };
}

/* =====================
   AI CHECK (조건부)
===================== */
async function runAiModeration(payload) {
  try {
    const { data } = await window.supabaseClient.functions.invoke(
      'ai-moderation-check',
      {
        body: {
          title: payload.title,
          oneLine: payload.oneLine,
          description: payload.description
        }
      }
    );
    return data;
  } catch {
    return runLocalCheck(payload);
  }
}

/* =====================
   RENDER
===================== */
function renderResult(result) {
  Object.entries(result).forEach(([key, value]) => {
    const el = document.querySelector(`.result-item[data-key="${key}"]`);
    if (!el) return;

    el.classList.remove('loading', 'pass', 'warning', 'fail');
    el.classList.add(value.result.toLowerCase());

    el.querySelector('.result-status').textContent = value.result;
    el.querySelector('.result-reason').textContent = value.reason || '';
  });
}

/* =====================
   PUBLISH (기존 로직 연결)
===================== */
async function publishIssue(payload, moderationResult) {
  alert('정상적으로 발행되었습니다.');
  sessionStorage.removeItem('writePayload');
  location.href = 'index.html';
}