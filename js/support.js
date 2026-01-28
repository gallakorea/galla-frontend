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

  document.getElementById("emailField").value = user.email || "-";

  document.getElementById("sendBtn").addEventListener("click", () => {
    const subject = document.getElementById("subjectInput").value.trim();
    const message = document.getElementById("messageInput").value.trim();

    if (!subject || !message) {
      alert("제목과 내용을 입력해주세요.");
      return;
    }

    const body = `
이메일: ${user.email}

-----------------------
${message}
    `.trim();

    const mailto = `mailto:gallakorea@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    window.location.href = mailto;
  });
});