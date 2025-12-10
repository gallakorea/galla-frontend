/* -------------------------------
   DOM
-------------------------------- */
const emailInput = document.getElementById("email");
const pwInput = document.getElementById("password");
const pw2Input = document.getElementById("password2");
const nicknameInput = document.getElementById("nickname");
const phoneInput = document.getElementById("phone");
const signupBtn = document.getElementById("signupBtn");

let selectedRegion = null;

/* -------------------------------
   REGION SELECT
-------------------------------- */
const regionChips = document.querySelectorAll(".region-chip");
const selectedRegionText = document.getElementById("selectedRegion");

regionChips.forEach(chip => {
    chip.addEventListener("click", () => {
        regionChips.forEach(c => c.classList.remove("active"));
        chip.classList.add("active");

        selectedRegion = chip.textContent.trim();
        selectedRegionText.textContent = selectedRegion;
    });
});

/* -------------------------------
   SIGNUP
-------------------------------- */
signupBtn.addEventListener("click", async () => {

    const email = emailInput.value.trim();
    const password = pwInput.value.trim();
    const password2 = pw2Input.value.trim();
    const nickname = nicknameInput.value.trim();
    const phone = phoneInput.value.trim();
    const anonymous = document.getElementById("anonymous").checked;

    if (!email || !password || !password2 || !nickname) {
        alert("필수 항목을 입력해주세요.");
        return;
    }

    if (password !== password2) {
        alert("비밀번호가 일치하지 않습니다.");
        return;
    }

    // SIGNUP
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
        alert("유저 생성 실패");
        return;
    }

    const userId = user.id;

    // 프로필 생성
    const { error: profileError } = await supabase
        .from("user_profiles")
        .insert({
            user_id: userId,
            nickname,
            phone: phone || null,
            region: selectedRegion,
            anonymous,
            level: 1,
            gp: 0,
            created_at: new Date()
        });

    if (profileError) {
        alert("프로필 저장 오류: " + profileError.message);
        return;
    }

    alert("회원가입 완료! 이메일 인증 후 로그인해주세요.");
    location.href = "index.html";
});