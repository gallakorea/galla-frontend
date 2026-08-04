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
    window.GALLA_bindNickCheck?.(nicknameInput);
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

        // 닉네임 중복·형식 — 서버가 최종 판정하지만, 가입은 되고 닉네임만 날아가는 일을 막는다
        try {
            const { data: nk } = await supabase.rpc("nickname_available", { p_nick: nickname });
            if (nk && !nk.ok) {
                alert({
                    length: "닉네임은 2~12자로 지어주세요",
                    charset: "닉네임엔 한글·영문·숫자와 _ . - 만 쓸 수 있어요",
                    reserved: "사용할 수 없는 닉네임이에요",
                    taken: "이미 누군가 쓰고 있는 닉네임이에요",
                }[nk.reason] || "닉네임을 다시 확인해주세요");
                nicknameInput.focus();
                return;
            }
        } catch (_) { /* 확인 실패 시 진행 — 서버 제약이 최종 방어 */ }

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
            const captchaToken = (window.turnstile && window.turnstile.getResponse()) || undefined;
            const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    captchaToken,
                    data: {
                        nickname,
                        phone: phone || null,
                        region: selectedRegion || null,
                        gender: selectedGender || null,
                        birth_date: birthDate,
                        age_verified: true,
                        terms_agreed: true,
                        marketing_opt_in: marketingOptIn
                    }
                }
            });
            try { window.turnstile && window.turnstile.reset(); } catch (e) {}

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
            //  + 이 플래그는 tour.js/onboard.js가 '가입 직후 로그아웃 상태'를 감지해 오리엔테이션을
            //    띄우지 않도록 하는 가드로도 쓰인다(인증 대기 중 투어→signup 되돌림 루프 차단).
            try { localStorage.setItem("galla_fresh_signup", "1"); } catch (e) {}
            try { localStorage.setItem("galla_last_email", email); } catch (e) {}
            alert("회원가입 완료! ✉️\n인증 메일을 보냈어요 — 메일함(스팸함도) 확인하고 링크를 누르면 바로 로그인돼요.");
            // 앱/PWA(셸 환경)는 셸로 복귀 — index.html로 가면 셸 밖(MPA)에서 돌게 된다
            {
                const isAppEnv = (window.GALLA_isApp && GALLA_isApp()) ||
                    (matchMedia && matchMedia("(display-mode: standalone)").matches);
                if (window.top !== window.self) { try { window.top.location.href = "app-shell.html"; } catch (_) { location.href = "index.html"; } }
                else location.href = isAppEnv ? "app-shell.html" : "index.html";
            }

        } catch (err) {
            alert("에러 발생: " + err.message);
            console.error(err);
        }
    });
})();