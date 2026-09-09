/* 비밀번호 변경 — Supabase auth.updateUser */
(function () {
  function sb() { return window.supabaseClient || (window.supabase && window.supabase.auth ? window.supabase : null); }

  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("changePasswordBtn");
    const npEl = document.getElementById("newPassword");
    const cpEl = document.getElementById("confirmPassword");
    if (!btn || !npEl || !cpEl) return;

    // 로그인 상태 확인 (비로그인 시 로그인으로)
    (async () => {
      const c = sb(); if (!c) return;
      try {
        const { data } = await c.auth.getSession();
        if (!data?.session) { alert("로그인이 필요합니다."); (window.GALLA_nav||function(u){location.href=u})("login.html"); }
      } catch (e) {}
    })();

    btn.addEventListener("click", async () => {
      const np = npEl.value.trim();
      const cp = cpEl.value.trim();
      if (np.length < 8) { alert("새 비밀번호는 8자 이상이어야 합니다."); npEl.focus(); return; }
      if (np !== cp) { alert("비밀번호 확인이 일치하지 않습니다."); cpEl.focus(); return; }

      const c = sb();
      if (!c) { alert("잠시 후 다시 시도해주세요."); return; }

      btn.disabled = true; const orig = btn.textContent; btn.textContent = "변경 중…";
      try {
        const { error } = await c.auth.updateUser({ password: np });
        if (error) throw error;
        alert("비밀번호가 변경되었습니다.");
        /* ⚠️ 비번 재설정 링크로 들어온 경우 history.back() 은 "재설정 링크 보내기"
           화면(reset.html)으로 되돌린다 — 바꿨는데 실패한 것처럼 보였다(QA 0909).
           재설정 흐름이면 이미 로그인된 상태이므로 홈으로 보낸다. */
        var __ref = document.referrer || "";
        var __fromReset = /reset\.html|auth\/confirm/.test(__ref);
        var __go = (window.GALLA_nav||function(u){location.href=u});
        if (__fromReset) __go("index.html");
        else if (history.length > 1) history.back();
        else __go("settings.html");
      } catch (e) {
        const msg = (e && e.message) || "";
        if (/same/i.test(msg)) alert("기존 비밀번호와 동일합니다. 다른 비밀번호를 입력해주세요.");
        else if (/weak|short|least/i.test(msg)) alert("더 강력한 비밀번호가 필요합니다.");
        else alert("변경 실패: 잠시 후 다시 시도해주세요.");
        btn.disabled = false; btn.textContent = orig;
      }
    });
  });
})();
