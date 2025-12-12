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

        alert("로그인 성공!");
        location.href = "index.html";
    });

})();