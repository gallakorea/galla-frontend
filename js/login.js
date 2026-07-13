// js/login.js

console.log("[login.js] 로드됨");

function waitForClient() {
    return new Promise(resolve => {
        const timer = setInterval(() => {
            if (window.supabaseClient) {
                console.log("[login.js] supabaseClient 준비됨");
                clearInterval(timer);
                resolve();
            }
        }, 20);
    });
}

(async () => {
    await waitForClient();

    const supabase = window.supabaseClient;

    const email = document.getElementById("email");
    const pw = document.getElementById("password");
    const loginBtn = document.getElementById("loginBtn");

    if (!loginBtn) {
        console.error("[login.js] loginBtn 찾을 수 없음");
        return;
    }

    /* ----------------------------------------------------
       🔥 Enter 키로도 로그인 실행
    ---------------------------------------------------- */
    function handleEnter(event) {
        if (event.key === "Enter") {
            event.preventDefault();     // 폼 자동 제출 방지
            loginBtn.click();           // 버튼 클릭 실행
        }
    }

    email.addEventListener("keypress", handleEnter);
    pw.addEventListener("keypress", handleEnter);


    /* ----------------------------------------------------
       🔥 로그인 이벤트
    ---------------------------------------------------- */
    loginBtn.addEventListener("click", async () => {
        console.log("[login.js] 로그인 버튼 클릭됨");

        const emailVal = email.value.trim();
        const pwVal = pw.value.trim();

        if (!emailVal || !pwVal) {
            alert("이메일과 비밀번호를 입력해주세요.");
            return;
        }

        const { data: loginData, error } = await supabase.auth.signInWithPassword({
            email: emailVal,
            password: pwVal
        });

        if (error) {
            console.log(error);
            alert("로그인 실패: " + error.message);
            return;
        }

        // 단계별 위트 환영: 로그인 누적 횟수를 세어 index에서 welcome.js가 인사
        try {
            const n = (parseInt(localStorage.getItem("galla_login_count") || "0", 10) || 0) + 1;
            localStorage.setItem("galla_login_count", String(n));
            // 갓 가입(가입 직후 첫 로그인)이면 'new' 우선
            if (localStorage.getItem("galla_fresh_signup")) {
                localStorage.removeItem("galla_fresh_signup");
                localStorage.setItem("galla_welcome_pending", "new");
            } else {
                localStorage.setItem("galla_welcome_pending", String(n));
            }
        } catch (e) {}
        location.href = "index.html";
    });

})();