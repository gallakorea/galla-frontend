/* ----------------------------------------------------
   0. Supabase Client 준비 대기 (signup.js 동일 구조)
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

    /* ----------------------------------------------------
       Supabase 클라이언트 로드 대기
    ---------------------------------------------------- */
    await waitForClient();
    const supabase = window.supabaseClient;

    const emailInput = document.getElementById("email");
    const pwInput = document.getElementById("password");
    const loginBtn = document.getElementById("loginBtn");

    if (!loginBtn) {
        console.error("loginBtn 요소를 찾을 수 없습니다.");
        return;
    }

    /* ----------------------------------------------------
       1. 로그인 이벤트
    ---------------------------------------------------- */
    loginBtn.addEventListener("click", async () => {

        const email = emailInput.value.trim();
        const password = pwInput.value.trim();

        if (!email || !password) {
            alert("이메일과 비밀번호를 입력해주세요.");
            return;
        }

        // Supabase 로그인 요청
        const { data: loginData, error: loginError } =
            await supabase.auth.signInWithPassword({ email, password });

        if (loginError) {
            console.log(loginError);
            alert("로그인 실패: " + loginError.message);
            return;
        }

        const user = loginData.user;

        /* ----------------------------------------------------
           2. user_profiles 불러오기
        ---------------------------------------------------- */
        const { data: profileData, error: profileError } = await supabase
            .from("user_profiles")
            .select("*")
            .eq("user_id", user.id)
            .single();

        if (profileError) {
            console.log(profileError);
            alert("프로필 조회 실패: " + profileError.message);
            return;
        }

        /* ----------------------------------------------------
           3. 로컬 저장
        ---------------------------------------------------- */
        const mergedUser = { auth: user, profile: profileData };
        localStorage.setItem("galla_user", JSON.stringify(mergedUser));

        alert("로그인 성공!");

        /* ----------------------------------------------------
           4. 로그인 후 복귀 기능
        ---------------------------------------------------- */
        const returnTo = sessionStorage.getItem("returnTo");
        if (returnTo) {
            sessionStorage.removeItem("returnTo");
            location.href = returnTo;
            return;
        }

        // 기본 이동
        location.href = "index.html";
    });

    /* ----------------------------------------------------
       5. 기존 세션 유지 체크
    ---------------------------------------------------- */
    const { data } = await supabase.auth.getSession();
    if (data?.session) {
        console.log("이미 로그인된 상태:", data.session.user);
    }

    /* ----------------------------------------------------
       6. 로그인 필요 시 호출되는 전역 함수
    ---------------------------------------------------- */
    window.requireLogin = function () {
        const current = location.pathname.replace("/", "");
        sessionStorage.setItem("returnTo", current);
        location.href = "login.html";
    };

})();