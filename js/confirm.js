document.addEventListener('DOMContentLoaded', async () => {
  const box = document.getElementById('moderationBox');
  const publishBtn = document.getElementById('publishBtn');
  const backBtn = document.getElementById('backBtn');

  /* 1️⃣ write → confirm 데이터 */
  const raw = sessionStorage.getItem('writePayload');
  if (!raw) {
    alert('잘못된 접근입니다.');
    location.href = '/write.html';
    return;
  }

  const payload = JSON.parse(raw);

  /* 2️⃣ 로그인 필수 */
  const { data: sessionData } =
    await window.supabaseClient.auth.getSession();

  if (!sessionData.session) {
    alert('로그인 후 발행 가능합니다.');
    location.href = '/login.html';
    return;
  }

  /* 3️⃣ 적합성 검사 */
  try {
    const { data, error } =
      await window.supabaseClient.functions.invoke(
        'content-moderation',
        {
          body: {
            title: payload.title,
            oneLine: payload.oneLine,
            description: payload.description
          }
        }
      );

    if (error) {
      box.className = 'moderation-box fail';
      box.textContent = '적합성 검사 중 오류가 발생했습니다.';
      return;
    }

    if (data.result === 'FAIL') {
      box.className = 'moderation-box fail';
      box.innerHTML = `
        <strong>발행 불가</strong><br/>
        사유: ${data.reason}
      `;
      return;
    }

    if (data.result === 'WARNING') {
      box.className = 'moderation-box warning';
      box.innerHTML = `
        <strong>주의 콘텐츠</strong><br/>
        ${data.reason}<br/><br/>
        발행 시 누적 경고로 기록됩니다.
      `;
    }

    if (data.result === 'PASS') {
      box.className = 'moderation-box pass';
      box.innerHTML = `
        <strong>적합성 검사 통과</strong><br/>
        발행 가능합니다.
      `;
    }

    publishBtn.disabled = false;

  } catch {
    box.className = 'moderation-box fail';
    box.textContent = '서버 연결 실패';
  }

  /* 4️⃣ 버튼 */
  backBtn.onclick = () => history.back();

  publishBtn.onclick = async () => {
    publishBtn.disabled = true;
    publishBtn.textContent = '발행 중…';

    const { error } = await window.supabaseClient
      .from('issues')
      .insert([payload]);

    if (error) {
      alert('발행 실패');
      publishBtn.disabled = false;
      publishBtn.textContent = '최종 발행';
      return;
    }

    sessionStorage.removeItem('writePayload');
    location.href = '/';
  };
});