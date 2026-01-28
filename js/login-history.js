document.addEventListener("DOMContentLoaded", async () => {
  const supabase = await new Promise(res => {
    const t = setInterval(() => {
      if (window.supabaseClient) {
        clearInterval(t);
        res(window.supabaseClient);
      }
    }, 20);
  });

  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;

  if (!user) {
    alert("로그인이 필요합니다.");
    location.href = "login.html";
    return;
  }

  const listEl = document.getElementById("logList");

  const { data, error } = await supabase
    .from("login_logs")
    .select("created_at, user_agent")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    listEl.innerHTML = `<div style="color:#777">불러오기 실패</div>`;
    return;
  }

  if (!data || data.length === 0) {
    listEl.innerHTML = `<div style="color:#777">로그인 기록이 없습니다.</div>`;
    return;
  }

  listEl.innerHTML = "";

  data.forEach(log => {
    const div = document.createElement("div");
    div.className = "log-card";
    div.innerHTML = `
      <div class="log-date">${new Date(log.created_at).toLocaleString()}</div>
      <div class="log-agent">${log.user_agent || "Unknown Device"}</div>
    `;
    listEl.appendChild(div);
  });
});