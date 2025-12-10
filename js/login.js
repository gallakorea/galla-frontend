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
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
    });

    if (error) {
        console.log(error);
        alert("로그인 실패: " + error.message);
        return;
    }

    // 로그인 성공 → 유저 정보 저장
    localStorage.setItem("galla_user", JSON.stringify(data.user));

    // 성공 메시지 후 index로 이동
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
        // 자동으로 index로 보내고 싶으면 → 아래 주석 해제
        // location.href = "index.html";
    }
})();