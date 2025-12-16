document.addEventListener("DOMContentLoaded", async () => {
  const box = document.getElementById("moderationBox");
  const backBtn = document.getElementById("backBtn");
  const publishBtn = document.getElementById("publishBtn");

  /* 1️⃣ write → confirm payload */
  const raw = sessionStorage.getItem("writePayload");
  if (!raw) {
    alert("잘못된 접근입니다.");
    location.href = "write.html";
    return;
  }
  const payload = JSON.parse(raw);

  /* 2️⃣ supabase 준비 */
  while (!window.supabaseClient) {
    await new Promise(r => setTimeout(r, 20));
  }
  const supabase = window.supabaseClient;

  /* 3️⃣ 로그인 확인 */
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    alert("로그인 후 발행 가능합니다.");
    location.href = "login.html";
    return;
  }

  /* 4️⃣ 적합성 검사 */
  try {
    const { data, error } = await supabase.functions.invoke(
      "content-moderation",
      {
        body: {
          title: payload.title,
          oneLine: payload.oneLine,
          description: payload.description
        }
      }
    );

    if (error) throw error;

    if (data.result === "FAIL") {
      box.className = "confirm-box fail";
      box.innerHTML = `
        <strong>🚫 발행 불가</strong><br/><br/>
        ${data.reason}
      `;
      return;
    }

    if (data.result === "WARNING") {
      box.className = "confirm-box warning";
      box.innerHTML = `
        <strong>⚠️ 주의가 필요한 콘텐츠</strong><br/><br/>
        ${data.reason}<br/><br/>
        해당 내용은 경고 기록으로만 저장되며 발행은 가능합니다.
      `;

      // WARNING 로그만 기록
      await supabase.from("moderation_logs").insert({
        user_id: sessionData.session.user.id,
        result: "WARNING",
        reason: data.reason
      });
    }

    if (data.result === "PASS") {
      box.className = "confirm-box pass";
      box.innerHTML = `
        <strong>✅ 적합성 검사 통과</strong><br/><br/>
        콘텐츠 가이드라인에 부합합니다.
      `;
    }

    publishBtn.disabled = false;

  } catch (e) {
    box.className = "confirm-box fail";
    box.textContent = "적합성 검사 중 오류가 발생했습니다.";
    return;
  }

  /* 5️⃣ 뒤로가기 */
  backBtn.onclick = () => {
    history.back();
  };

  /* 6️⃣ 최종 발행 → issue 페이지로 이동 */
  publishBtn.onclick = async () => {
    publishBtn.disabled = true;
    publishBtn.textContent = "발행 중…";

    const { data, error } = await supabase
      .from("issues")
      .insert([payload])
      .select("id")
      .single();

    if (error || !data) {
      alert("발행 실패");
      publishBtn.disabled = false;
      publishBtn.textContent = "최종 발행";
      return;
    }

    sessionStorage.removeItem("writePayload");

    // ✅ 방금 발행한 이슈로 이동
    location.href = `issue.html?id=${data.id}`;
  };
});