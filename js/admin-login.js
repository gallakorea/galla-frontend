/* 🛠 관제센터 전용 로그인 — 서비스 로그인과 분리. 인증 후 admin_flag 검증 */
(function () {
  const $ = (s) => document.querySelector(s);
  let sb;
  (async function () {
    sb = await waitForSupabaseClient();
    // 이미 관리자 세션이면 바로 입장
    const { data: s } = await sb.auth.getSession();
    if (s?.session) {
      const { data: p } = await sb.from("user_profiles").select("admin_flag").eq("user_id", s.session.user.id).maybeSingle();
      if (p?.admin_flag) { location.href = "admin.html"; return; }
    }
  })();

  $("#al-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#al-go"), err = $("#al-err");
    err.textContent = "";
    const email = $("#al-email").value.trim(), pw = $("#al-pw").value;
    if (!email || !pw) return;
    btn.disabled = true; btn.textContent = "확인 중…";
    try {
      const { data, error } = await sb.auth.signInWithPassword({ email, password: pw });
      if (error) { err.textContent = "이메일 또는 비밀번호가 올바르지 않습니다."; btn.disabled = false; btn.textContent = "관제센터 입장"; return; }
      const { data: p } = await sb.from("user_profiles").select("admin_flag").eq("user_id", data.user.id).maybeSingle();
      if (!p?.admin_flag) {
        await sb.auth.signOut();
        err.textContent = "관리자 권한이 없는 계정입니다.";
        btn.disabled = false; btn.textContent = "관제센터 입장"; return;
      }
      location.href = "admin.html";
    } catch (e2) {
      err.textContent = "오류가 발생했습니다. 다시 시도하세요.";
      btn.disabled = false; btn.textContent = "관제센터 입장";
    }
  });
})();
