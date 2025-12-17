document.addEventListener("DOMContentLoaded", async () => {
  console.log("[settings.js] Loaded");

  // Supabase client 대기
  const waitForSupabase = () =>
    new Promise(resolve => {
      const t = setInterval(() => {
        if (window.supabaseClient) {
          clearInterval(t);
          resolve(window.supabaseClient);
        }
      }, 20);
    });

  const supabase = await waitForSupabase();

  if (!supabase) {
    console.error("[settings.js] Supabase client 없음");
    return;
  }

  /* =====================
     로그인 세션 확인
  ===================== */
  const { data } = await supabase.auth.getSession();

  if (!data.session?.user) {
    alert("로그인이 필요합니다.");
    location.href = "login.html";
    return;
  }

  const user = data.session.user;

  /* =====================
     로그아웃
  ===================== */
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await supabase.auth.signOut();
      alert("로그아웃되었습니다.");
      location.href = "index.html";
    });
  }

  /* =====================
     네비게이션
  ===================== */
  document.querySelectorAll(".nav-item").forEach(icon => {
    icon.addEventListener("click", () => {
      const target = icon.dataset.target;
      if (target) location.href = target;
    });
  });
});