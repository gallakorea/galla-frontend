document.addEventListener('DOMContentLoaded', async () => {
  const draftId = sessionStorage.getItem('draft_id');
  const backBtn = document.getElementById('backBtn');
  const publishBtn = document.getElementById('publishBtn');

  if (!draftId) {
    alert('임시 저장된 글이 없습니다.');
    location.href = 'write.html';
    return;
  }

  /* =========================
     1️⃣ draft 불러오기
  ========================= */
  const { data: draft, error } =
    await window.supabaseClient
      .from('issues')
      .select('*')
      .eq('id', draftId)
      .single();

  if (error || !draft) {
    alert('임시 글을 불러오지 못했습니다.');
    return;
  }

  /* =========================
     2️⃣ 적합성 검사 (현재는 MOCK)
  ========================= */
  renderResult('check-title', 'PASS', '문제 없음');
  renderResult('check-oneline', 'PASS', '문제 없음');
  renderResult('check-description', 'PASS', '문제 없음');

  publishBtn.disabled = false;

  /* =========================
     3️⃣ 뒤로 가기
  ========================= */
  backBtn.onclick = () => {
    history.back();
  };

  /* =========================
     4️⃣ 최종 발행
  ========================= */
  publishBtn.onclick = async () => {
    publishBtn.disabled = true;
    publishBtn.textContent = '발행 중…';

    const { error: updateError } =
      await window.supabaseClient
        .from('issues')
        .update({
          status: 'normal',
          updated_at: new Date().toISOString(),
        })
        .eq('id', draftId);

    if (updateError) {
      alert('발행 중 오류가 발생했습니다.');
      publishBtn.disabled = false;
      publishBtn.textContent = '최종 발행';
      return;
    }

    sessionStorage.removeItem('draft_id');
    location.href = `issue.html?id=${draftId}`;
  };
});

/* =========================
   UI 헬퍼
========================= */
function renderResult(id, result, reason) {
  const el = document.getElementById(id);
  el.classList.remove('loading');
  el.classList.add(result.toLowerCase());

  el.innerHTML = `
    <strong>${labelMap[id]}</strong><br>
    ${result} · ${reason}
  `;
}

const labelMap = {
  'check-title': '제목',
  'check-oneline': '한줄 요약',
  'check-description': '본문',
};