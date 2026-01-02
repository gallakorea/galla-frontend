// signup.js

async function waitForClient() {
    console.log("[signup.js] supabaseClient 준비 대기중...");
    while (!window.supabaseClient) {
        await new Promise(r => setTimeout(r, 30));
    }
    console.log("[signup.js] supabaseClient 준비됨");
}

(async () => {
    await waitForClient();
    const supabase = window.supabaseClient;

    // 요소 선택
    const emailInput = document.getElementById("email");
    const pwInput = document.getElementById("password");
    const pw2Input = document.getElementById("password2");
    const nicknameInput = document.getElementById("nickname");
    const phoneInput = document.getElementById("phone");
    const signupBtn = document.getElementById("signupBtn");

    let selectedRegion = null;

    document.querySelectorAll(".region-chip").forEach(chip => {
        chip.addEventListener("click", () => {
            document.querySelectorAll(".region-chip").forEach(c => c.classList.remove("active"));
            chip.classList.add("active");
            selectedRegion = chip.textContent.trim();
            document.getElementById("selectedRegion").textContent = selectedRegion;
        });
    });

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

        try {
            console.log("[signup.js] Auth.signUp 요청 시작");

            const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
                email,
                password
            });

            if (signUpError) {
                alert("회원가입 실패: " + signUpError.message);
                return;
            }

            const userId = signUpData.user?.id;
            if (!userId) {
                alert("유저 생성 오류");
                return;
            }

            console.log("[signup.js] Auth 성공 — userId:", userId);

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

        } catch (err) {
            alert("에러 발생: " + err.message);
            console.error(err);
        }
    });
})();