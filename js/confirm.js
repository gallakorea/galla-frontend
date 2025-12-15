document.addEventListener('DOMContentLoaded', async () => {
  /* ================= 로그인 필수 ================= */
  const { data: auth } = await window.supabaseClient.auth.getSession();
  if (!auth.session) {
    alert('로그인 후 발행 가능합니다.');
    location.href = '/login.html';
    return;
  }

  /* ================= draft 불러오기 ================= */
  const draftRaw = sessionStorage.getItem('issueDraft');
  if (!draftRaw) {
    alert('작성된 글이 없습니다.');
    location.href = '/write.html';
    return;
  }

  const draft = JSON.parse(draftRaw);

  /* ================= 미리보기 렌더 ================= */
  const preview = document.getElementById('preview');
  preview.innerHTML = `
    <section class="issue">
      <div class="issue-meta">
        ${draft.category} · 방금 전 · 예상 기부처: ${draft.donation}
      </div>

      <h1 class="issue-title">${draft.title}</h1>
      <p class="issue-one-line">${draft.oneLine}</p>

      ${draft.thumbnail ? `<img src="${draft.thumbnail}" class="issue-thumb">` : ''}

      <section class="issue-summary">
        <p>${draft.description}</p>
      </section>
    </section>
  `;

  /* ================= 버튼 ================= */
  document.getElementById('cancelPublish').onclick = () => history.back();

  document.getElementById('confirmPublish').onclick = async () => {
    /* 🔒 1. 유튜브급 적정성 검사 */
    const { data: res, error } =
      await window.supabaseClient.functions.invoke(
        'content-moderation',
        {
          body: {
            title: draft.title,
            oneLine: draft.oneLine,
            description: draft.description
          }
        }
      );

    if (error || res.result === 'FAIL') {
      alert(`🚫 발행 불가\n\n${res?.reason || '콘텐츠 위반'}`);
      return;
    }

    if (res.result === 'WARNING') {
      const ok = confirm(`⚠️ ${res.reason}\n\n그래도 발행할까요?`);
      if (!ok) return;
    }

    /* 🔒 2. DB 저장 */
    const { error: insertError } =
      await window.supabaseClient.from('issues').insert([{
        category: draft.category,
        title: draft.title,
        one_line: draft.oneLine,
        description: draft.description,
        donation_target: draft.donation,
        is_anonymous: draft.anonymous
      }]);

    if (insertError) {
      alert('DB 저장 실패');
      return;
    }

    sessionStorage.removeItem('issueDraft');
    location.href = '/';
  };
});