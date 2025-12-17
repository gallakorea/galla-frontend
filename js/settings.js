document.addEventListener("DOMContentLoaded", async () => {
  console.log("[settings.js] Loaded");

  const supabase = window.supabaseClient;
  if (!supabase) {
    console.error("Supabase client 없음");
    return;
  }

  /* 1️⃣ 로그인 체크 */
  const { data } = await supabase.auth.getSession();
  if (!data.session?.user) {
    alert("로그인이 필요한 페이지입니다.");
    location.href = "login.html";
    return;
  }

  const user = data.session.user;

  /* 2️⃣ 프로필 로드 */
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (profile) {
    document.getElementById("profileName").textContent =
      profile.nickname || "익명의 사용자";
    document.getElementById("profileBio").textContent =
      profile.bio || "소개 문구가 없습니다.";
    document.getElementById("emailValue").textContent = user.email;
    document.getElementById("phoneValue").textContent =
      profile.phone || "-";
  }

  /* 3️⃣ 로그아웃 */
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      if (!confirm("로그아웃 하시겠습니까?")) return;

      await supabase.auth.signOut();
      alert("로그아웃되었습니다.");
      location.href = "index.html";
    });
  }
});