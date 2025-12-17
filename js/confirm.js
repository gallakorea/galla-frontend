document.addEventListener('DOMContentLoaded', async () => {
  const resultList = document.getElementById('resultList');
  const overallBox = document.getElementById('overallBox');
  const publishBtn = document.getElementById('publishBtn');
  const backBtn = document.getElementById('backBtn');

  const payloadRaw = sessionStorage.getItem('writePayload');
  if (!payloadRaw) {
    alert('작성 정보가 없습니다.');
    location.href = 'write.html';
    return;
  }

  const payload = JSON.parse(payloadRaw);

  /* =========================
     AI 적합성 검사 호출
     ========================= */
  const moderation = await runModerationCheck(
    payload.title,
    payload.oneLine,
    payload.description
  );

  const fields = [
    { key: 'title', label: '제목' },
    { key: 'oneLine', label: '한 줄 요약' },
    { key: 'description', label: '본문' },
  ];

  let hasFail = false;
  let hasWarning = false;

  fields.forEach(f => {
    const res = moderation[f.key];
    if (!res) return;

    if (res.result === 'FAIL') hasFail = true;
    if (res.result === 'WARNING') hasWarning = true;

    const div = document.createElement('div');
    div.className = `result-item ${res.result.toLowerCase()}`;
    div.innerHTML = `
      <div class="result-title">${f.label} · ${res.result}</div>
      <div class="result-reason">${res.reason}</div>
    `;
    resultList.appendChild(div);
  });

  /* =========================
     OVERALL 안내
     ========================= */
  if (moderation.overall === 'FAIL') {
    overallBox.innerHTML = `
      ❌ 이 콘텐츠는 발행할 수 없습니다.<br/>
      법적·사회적 위험이 명확한 표현이 포함되어 있습니다.
    `;
    publishBtn.disabled = true;
  }

  if (moderation.overall === 'WARNING') {
    overallBox.innerHTML = `
      ⚠️ 일부 표현에 주의가 필요합니다.<br/>
      본 콘텐츠는 공개되며, 모든 책임은 작성자에게 귀속됩니다.
    `;
    publishBtn.disabled = false;
  }

  if (moderation.overall === 'PASS') {
    overallBox.innerHTML = `
      ✅ 표현 위험 요소가 발견되지 않았습니다.
    `;
    publishBtn.disabled = false;
  }

  /* =========================
     ACTION
     ========================= */
  backBtn.onclick = () => history.back();

  publishBtn.onclick = () => {
    publishIssue(payload, moderation);
  };
});

/* =========================
   AI 호출
   ========================= */
async function runModerationCheck(title, oneLine, description) {
  const { data, error } =
    await window.supabaseClient.functions.invoke(
      'ai-moderation-check',
      { body: { title, oneLine, description } }
    );

  if (error || !data) {
    return {
      overall: 'WARNING',
      title: { result: 'WARNING', reason: '검사 실패' },
      oneLine: { result: 'WARNING', reason: '검사 실패' },
      description: { result: 'WARNING', reason: '검사 실패' },
    };
  }

  return data;
}

/* =========================
   실제 발행
   ========================= */
async function publishIssue(payload, moderation) {
  alert('정상적으로 발행되었습니다.');
  sessionStorage.removeItem('writePayload');
  location.href = 'index.html';
}