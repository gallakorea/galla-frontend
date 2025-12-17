document.addEventListener("DOMContentLoaded", () => {
  const backBtn = document.getElementById("backBtn");
  const publishBtn = document.getElementById("publishBtn");

  backBtn.addEventListener("click", () => {
    history.back();
  });

  publishBtn.addEventListener("click", async () => {
    const payloadRaw = sessionStorage.getItem("writePayload");

    if (!payloadRaw) {
      alert("작성 데이터가 없습니다.");
      return;
    }

    const payload = JSON.parse(payloadRaw);

    if (!window.supabaseClient) {
      alert("Supabase 연결 실패");
      return;
    }

    publishBtn.disabled = true;
    publishBtn.textContent = "발행 중…";

    try {
      const {
        data: { user },
        error: authError,
      } = await window.supabaseClient.auth.getUser();

      if (authError || !user) {
        alert("로그인이 필요합니다.");
        return;
      }

      /* ✅ issues INSERT */
      const { data: issue, error } =
        await window.supabaseClient
          .from("issues")
          .insert([{
            user_id: user.id,
            category: payload.category,
            title: payload.title,
            one_line: payload.oneLine,
            description: payload.description,
            donation_target: payload.donation_target,
            is_anonymous: payload.is_anonymous,
            status: "normal",
            moderation_status: "unchecked",
          }])
          .select("id")
          .single();

      if (error) throw error;

      sessionStorage.removeItem("writePayload");

      /* ✅ 발행 후 해당 이슈 페이지로 이동 */
      location.href = `issue.html?id=${issue.id}`;

    } catch (e) {
      console.error("[PUBLISH ERROR]", e);
      alert("발행 중 오류가 발생했습니다.");
      publishBtn.disabled = false;
      publishBtn.textContent = "최종 발행";
    }
  });
});