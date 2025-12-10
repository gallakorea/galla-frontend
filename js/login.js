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
    // 로그인 성공 → user_profiles 불러오기
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
    location.href = "index.html";
});

// ---------------------------------------------
// 자동 로그인 유지 (세션 확인)
// ---------------------------------------------
(async () => {
    const { data } = await supabase.auth.getSession();
    if (data?.session) {
        console.log("로그인 유지됨:", data.session.user);
        // 자동 이동을 원하면 아래 주석 해제
        // location.href = "index.html";
    }
})();