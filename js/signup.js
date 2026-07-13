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
    let selectedGender = null;

    // 지역 칩 (성별 칩 제외)
    document.querySelectorAll(".region-chip:not(.gender-chip)").forEach(chip => {
        chip.addEventListener("click", () => {
            document.querySelectorAll(".region-chip:not(.gender-chip)").forEach(c => c.classList.remove("active"));
            chip.classList.add("active");
            selectedRegion = chip.textContent.trim();
            document.getElementById("selectedRegion").textContent = selectedRegion;
        });
    });

    // 성별 칩
    document.querySelectorAll(".gender-chip").forEach(chip => {
        chip.addEventListener("click", () => {
            document.querySelectorAll(".gender-chip").forEach(c => c.classList.remove("active"));
            chip.classList.add("active");
            selectedGender = chip.dataset.gender;
        });
    });

    signupBtn.addEventListener("click", async () => {
        const email = emailInput.value.trim();
        const password = pwInput.value.trim();
        const password2 = pw2Input.value.trim();
        const nickname = nicknameInput.value.trim();
        const phone = phoneInput.value.trim();
        const anonymous = document.getElementById("anonymous").checked;
        const birthDate = (document.getElementById("birthdate") || {}).value || "";
        const marketingOptIn = document.getElementById("agreeMarketing").checked;

        if (!email || !password || !password2 || !nickname) {
            alert("필수 항목을 입력해주세요.");
            return;
        }

        if (password !== password2) {
            alert("비밀번호가 일치하지 않습니다.");
            return;
        }

        // 만 14세 이상 확인 (개인정보보호법 제22조의2)
        const age = window.GALLA_ageFromBirth ? window.GALLA_ageFromBirth(birthDate) : null;
        if (age === null) {
            alert("생년월일을 입력해주세요.");
            return;
        }
        if (age < 14) {
            alert("만 14세 미만은 가입할 수 없습니다.");
            return;
        }

        // 통계 필수 정보: 성별 · 지역
        if (!selectedGender) { alert("성별을 선택해주세요. (여론 통계에 필요해요)"); return; }
        if (!selectedRegion) { alert("사는 지역을 선택해주세요. (여론 통계에 필요해요)"); return; }

        // 필수 약관 동의 확인
        const agreeAge = document.getElementById("agreeAge").checked;
        const agreeTerms = document.getElementById("agreeTerms").checked;
        const agreePrivacy = document.getElementById("agreePrivacy").checked;
        if (!agreeAge || !agreeTerms || !agreePrivacy) {
            alert("필수 약관(만 14세 이상·이용약관·개인정보 수집·이용)에 동의해주세요.");
            return;
        }

        try {
            console.log("[signup.js] Auth.signUp 요청 시작");

            // 폼 값은 user_metadata로 전달 → 서버측 트리거(handle_new_user,
            // SECURITY DEFINER)가 users/user_profiles를 생성한다.
            // (이메일 인증이 켜져 있어 signUp 직후엔 세션이 없으므로, 클라이언트에서
            //  직접 INSERT하면 RLS(auth.uid()=id)에 막힌다 → 트리거로 처리)
            const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        nickname,
                        phone: phone || null,
                        region: selectedRegion || null,
                        gender: selectedGender || null,
                        anonymous,
                        birth_date: birthDate,
                        age_verified: true,
                        terms_agreed: true,
                        marketing_opt_in: marketingOptIn
                    }
                }
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

            // 가입 후 '첫 로그인' 때 특별 환영을 띄우기 위한 플래그
            try { localStorage.setItem("galla_fresh_signup", "1"); } catch (e) {}
            alert("회원가입 완료! 이메일 인증 후 로그인해주세요.");
            location.href = "index.html";

        } catch (err) {
            alert("에러 발생: " + err.message);
            console.error(err);
        }
    });
})();