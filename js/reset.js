document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("resetBtn");

    btn.onclick = () => {
        const email = document.getElementById("email").value.trim();

        if (!email) {
            alert("이메일을 입력해주세요.");
            return;
        }

        alert("비밀번호 재설정 링크가 이메일로 전송되었습니다.");
    };
});