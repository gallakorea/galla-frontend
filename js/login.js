/* ----------------------------------------------------
   Supabase Client 준비 대기
---------------------------------------------------- */
function waitForClient() {
    return new Promise(resolve => {
        const timer = setInterval(() => {
            if (window.supabaseClient) {
                clearInterval(timer);
                resolve();
            }
        }, 20);
    });
}

(async () => {

    await waitForClient(); // supabase 로딩 완료될 때까지 기다림
    const supabase = window.supabaseClient;

    console.log("LOGIN PAGE: supabaseClient ready:", supabase);

    const loginBtn = document.getElementById("loginBtn");
    const emailInput = document.getElementById("email");
    const pwInput = document.getElementById("password");

    /* 안전장치 */
    if (!loginBtn) {
        console.error("ERROR: loginBtn not found.");
        return;
    }

    /* ----------------------------------------------------
       로그인 상태면 mypage로 이동 (차단)
    ---------------------------------------------------- */
    const { data: sessionData } = await supabase.auth.getSession();

    if (sessionData?.session?.user) {
        location.replace("mypage.html");
        return;
    }

    /* ----------------------------------------------------
       로그인 버튼 이벤트 등록
    ---------------------------------------------------- */
    loginBtn.addEventListener("click", async () => {

        console.log("로그인 버튼 클릭됨");

        const email = emailInput.value.trim();
        const password = pwInput.value.trim();

        if (!email || !password) {
            alert("이메일과 비밀번호를 입력해주세요.");
            return;
        }

        const { data: loginData, error: loginError } =
            await supabase.auth.signInWithPassword({ email, password });

        if (loginError) {
            alert("로그인 실패: " + loginError.message);
            return;
        }

        alert("로그인 성공! 환영합니다.");
        location.href = "index.html";
    });

})();