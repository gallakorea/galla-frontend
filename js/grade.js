document.addEventListener("DOMContentLoaded", async () => {
  const supabase = await waitForSupabaseClient();

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    alert("로그인이 필요합니다.");
    location.href = "login.html";
    return;
  }
});

document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".nav-item").forEach(el => {
        el.onclick = () => {
            location.href = el.dataset.target;
        };
    });
});