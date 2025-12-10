// -------------------------------
// DOM ELEMENTS
// -------------------------------
const emailInput = document.getElementById("email");
const pwInput = document.getElementById("password");
const pw2Input = document.getElementById("password2");
const nicknameInput = document.getElementById("nickname");
const phoneInput = document.getElementById("phone");
const signupBtn = document.getElementById("signupBtn");

let selectedRegion = null;

// --------------------------------
// 지역 선택 이벤트
// --------------------------------
document.querySelectorAll(".region-chip").forEach(chip => {
    chip.addEventListener("click", () => {
        document.querySelectorAll(".region-chip").forEach(c => c.classList.remove("active"));
        chip.classList.add("active");

        selectedRegion = chip.textContent.trim();
        document.getElementById("selectedRegion").textContent = selectedRegion;
    });
});

// --------------------------------
// 회원가입 버튼
// --------------------------------
signupBtn.addEventListener("click", async () => {

    const email = emailInput.value.trim();
    const password = pwInput.value.trim();
    const password2 = pw2Input.value.trim();
    const nickname = nicknameInput.value.trim();
    const phone = phoneInput.value.trim();
    const anonymous = document.getElementById("anonymous").checked;

    // ---------------------------
    // 입력 검증
    // ---------------------------
    if (!email || !password || !password2 || !nickname) {
        alert("필수 항목을 입력해주세요.");
        return;
    }

    if (password !== password2) {
        alert("비밀번호가 일치하지 않습니다.");
        return;
    }

    // ---------------------------
    // Supabase Auth 회원가입
    // ---------------------------
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password
    });

    if (signUpError) {
        alert("회원가입 실패: " + signUpError.message);
        return;
    }

    const user = signUpData.user;

    if (!user) {
        alert("회원가입 중 에러: 유저 정보 없음.");
        return;
    }

    // 새 유저 ID
    const userId = user.id;

    // ---------------------------
    // user_profiles 테이블에 추가 정보 저장
    // ---------------------------
    const { error: profileError } = await supabase
        .from("user_profiles")
        .insert({
            user_id: userId,
            nickname: nickname,
            phone: phone || null,
            region: selectedRegion,
            anonymous: anonymous,
            level: 1,
            gp: 0,
            created_at: new Date()
        });

    if (profileError) {
        alert("프로필 저장 오류: " + profileError.message);
        return;
    }

    alert("회원가입 완료! 이메일 인증 후 로그인해주세요.");
    window.location.href = "index.html";
});