/* 🗑️ 계정 삭제 공용 흐름 — privacy.html(13항)·settings.html(앱 정보) 공용.
   2단계 확인(경고 + "삭제" 타이핑) → delete-account 엣지 함수 → signOut → 스토리지 클리어 → 홈.
   되돌릴 수 없다. window.GALLA_deleteAccount(triggerEl?) */
(function () {
  async function deleteAccount(triggerEl) {
    const sb = window.supabaseClient ||
      (window.waitForSupabaseClient ? await window.waitForSupabaseClient() : null);
    if (!sb) { alert('잠시 후 다시 시도해 주세요.'); return; }

    const sess = (await sb.auth.getSession()).data.session;
    if (!sess) { alert('로그인 후 이용할 수 있어요.'); location.href = 'login.html'; return; }

    if (!confirm('정말 계정을 삭제할까요?\n\n· 로그인 수단과 이메일·전화번호가 즉시 삭제되고\n· 다시 로그인할 수 없습니다.\n· 이 작업은 되돌릴 수 없어요.')) return;
    const typed = prompt('삭제를 확정하려면 아래에 "삭제"라고 입력해 주세요.');
    if ((typed || '').trim() !== '삭제') { alert('입력이 일치하지 않아 취소했어요.'); return; }

    const orig = triggerEl ? triggerEl.textContent : '';
    if (triggerEl) { triggerEl.textContent = '삭제 처리 중…'; triggerEl.style.pointerEvents = 'none'; }
    try {
      const res = await fetch(sb.supabaseUrl + '/functions/v1/delete-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': sb.supabaseKey,
          'Authorization': 'Bearer ' + sess.access_token,
        },
        body: '{}',
      });
      const out = await res.json().catch(() => ({ ok: false }));
      if (!out.ok) throw new Error(out.reason || 'failed');
      try { await sb.auth.signOut(); } catch (_) {}
      try { localStorage.clear(); sessionStorage.clear(); } catch (_) {}
      alert('계정이 삭제되었습니다. 그동안 이용해 주셔서 감사합니다.');
      location.href = 'index.html';
    } catch (err) {
      if (triggerEl) { triggerEl.textContent = orig; triggerEl.style.pointerEvents = ''; }
      alert('삭제에 실패했어요. 잠시 후 다시 시도하거나 gallakorea@gmail.com 으로 문의해 주세요.');
    }
  }
  window.GALLA_deleteAccount = deleteAccount;
})();
