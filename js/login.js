/* ----------------------------------------------------
   0. Supabase 준비 대기 (signup.js와 동일)
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

    // Supabase 클라이언트 준비될 때까지 기다림
    await waitForClient();
    const supabase = window.supabaseClient;

    const emailInput = document.getElementById("email");
    const pwInput = document.getElementById("password");
    const loginBtn = document.getElementById("loginBtn");

    // ---------------------------------------------
    // 로그인 처리
    // ---------------------------------------------
    loginBtn.addEventListener("click", async () => {
        const email = emailInput.value.trim();
        const password = pwInput.value.trim();

        if (!email || !password) {
            alert("이메일과 비밀번호를 입력해주세요.");
            return;
        }

        // Supabase 로그인 요청
        const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (loginError) {
            console.log(loginError);
            alert("로그인 실패: " + loginError.message);
            return;
        }

        const user = loginData.user;

        // ---------------------------------------------
        // user_profiles 가져오기
        // ---------------------------------------------
        const { data: profileData, error: profileError } = await supabase
            .from("user_profiles")
            .select("*")
            .eq("user_id", user.id)
            .single();

        if (profileError) {
            console.log(profileError);
            alert("유저 프로필을 불러오지 못했습니다: " + profileError.message);
            return;
        }

        // ---------------------------------------------
        // 로컬 저장 (auth user + profile)
        // ---------------------------------------------
        const mergedUser = {
            auth: user,
            profile: profileData
        };
        localStorage.setItem("galla_user", JSON.stringify(mergedUser));

        alert("로그인 성공!");

        // ---------------------------------------------
        // 🔥 로그인 후 복귀 기능 추가
        // ---------------------------------------------
        const returnTo = sessionStorage.getItem("returnTo");

        if (returnTo) {
            sessionStorage.removeItem("returnTo");
            location.href = returnTo;
            return;
        }

        // 기본 이동
        location.href = "index.html";
    });

    // ---------------------------------------------
    // 자동 로그인 유지 (세션 유지 여부 체크)
    // ---------------------------------------------
    const { data } = await supabase.auth.getSession();
    if (data?.session) {
        console.log("로그인 유지됨:", data.session.user);
    }

    /* =======================================================
        🔥 로그인 필요 시 호출하는 전역 함수
        - 현재 페이지 저장 → 로그인 페이지로 이동
    ======================================================= */
    window.requireLogin = function () {
        const current = location.pathname.replace("/", "");
        sessionStorage.setItem("returnTo", current);
        location.href = "login.html";
    };

})();