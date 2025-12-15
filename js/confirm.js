document.addEventListener("DOMContentLoaded", async () => {
  const box = document.getElementById("moderationBox");
  const publishBtn = document.getElementById("publishBtn");
  const backBtn = document.getElementById("backBtn");

  /* write → confirm 데이터 */
  const raw = sessionStorage.getItem("writePayload");
  if (!raw) {
    alert("잘못된 접근입니다.");
    location.href = "write.html";
    return;
  }
  const payload = JSON.parse(raw);

  /* Supabase 대기 */
  while (!window.supabaseClient) {
    await new Promise(r => setTimeout(r, 20));
  }
  const supabase = window.supabaseClient;

  /* 로그인 확인 */
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    alert("로그인 후 발행 가능합니다.");
    location.href = "login.html";
    return;
  }

  /* 적합성 검사 */
  try {
    const { data: res, error } =
      await supabase.functions.invoke("content-moderation", {
        body: {
          title: payload.title,
          oneLine: payload.oneLine,
          description: payload.description
        }
      });

    if (error) throw error;

    if (res.result === "FAIL") {
      box.className = "confirm-box fail";
      box.innerHTML = `<strong>발행 불가</strong><br/>${res.reason}`;
      return;
    }

    if (res.result === "WARNING") {
      box.className = "confirm-box warning";
      box.innerHTML = `
        <strong>주의 콘텐츠</strong><br/>
        ${res.reason}<br/><br/>
        누적 경고로 기록됩니다.
      `;
    }

    if (res.result === "PASS") {
      box.className = "confirm-box pass";
      box.innerHTML = `<strong>적합성 검사 통과</strong><br/>발행 가능합니다.`;
    }

    publishBtn.disabled = false;

  } catch {
    box.className = "confirm-box fail";
    box.textContent = "적합성 검사 중 오류가 발생했습니다.";
  }

  backBtn.onclick = () => history.back();

  publishBtn.onclick = async () => {
    publishBtn.disabled = true;
    publishBtn.textContent = "발행 중…";

    const { error } = await supabase
      .from("issues")
      .insert([payload]);

    if (error) {
      alert("발행 실패");
      publishBtn.disabled = false;
      publishBtn.textContent = "최종 발행";
      return;
    }

    sessionStorage.removeItem("writePayload");
    location.href = "index.html";
  };
});