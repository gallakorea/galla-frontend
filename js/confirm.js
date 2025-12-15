document.addEventListener("DOMContentLoaded", async () => {
  const supabase = window.supabaseClient;
  const box = document.getElementById("moderationBox");
  const btn = document.getElementById("publishBtn");

  const draft = JSON.parse(localStorage.getItem("galla_draft"));
  if (!draft) {
    alert("작성 정보가 없습니다.");
    location.href = "write.html";
    return;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    alert("로그인이 필요합니다.");
    location.href = "login.html";
    return;
  }

  // 🔍 적정성 검사
  const { data: res, error } = await supabase.functions.invoke(
    "content-moderation",
    { body: draft }
  );

  if (error) {
    box.innerHTML = `<p class="m-fail">서버 오류가 발생했습니다.</p>`;
    btn.disabled = true;
    return;
  }

  // UI 분기
  if (res.result === "PASS") {
    box.innerHTML = `<p class="m-pass">✅ 적합한 콘텐츠입니다.</p>`;
  }

  if (res.result === "WARNING") {
    box.innerHTML = `
      <p class="m-warn">⚠️ 주의 콘텐츠</p>
      <p>${res.reason}</p>
      <p>경고는 누적됩니다.</p>
    `;
    await supabase
      .from("user_profiles")
      .update({ warning_count: supabase.rpc("inc_warning") })
      .eq("id", sessionData.session.user.id);
  }

  if (res.result === "FAIL") {
    box.innerHTML = `
      <p class="m-fail">🚫 발행 불가</p>
      <p>${res.reason}</p>
    `;
    btn.disabled = true;
    return;
  }

  // 발행
  btn.addEventListener("click", async () => {
    // TODO: issues insert
    alert("발행 완료 (DB 연결 단계)");
    localStorage.removeItem("galla_draft");
    location.href = "index.html";
  });
});