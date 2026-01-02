// OCR Demo
document.getElementById("idImage").addEventListener("change", () => {
    const status = document.getElementById("ocrStatus");

    status.textContent = "OCR 분석 중...";

    setTimeout(() => {
        document.getElementById("ocrName").value = "홍길동";
        document.getElementById("ocrRRN").value = "900101-1234567";
        document.getElementById("ocrIssue").value = "2020-08-12";

        status.textContent = "OCR 성공 — 진위확인 필요";
        status.style.color = "#4fc3f7";
    }, 1500);
});

// Withdraw Logic
document.getElementById("withdrawBtn").onclick = () => {
    const amount = Number(document.getElementById("amount").value);
    const address = document.getElementById("address").value;
    const bank = document.getElementById("bank").value;
    const holder = document.getElementById("holder").value;
    const account = document.getElementById("account").value;

    if (!bank) return alert("은행을 선택해주세요.");
    if (!holder) return alert("예금주명을 입력해주세요.");
    if (!account) return alert("계좌번호를 입력해주세요.");

    if (!address) return alert("실제 거주지 주소를 입력해주세요.");
    if (amount < 200000) return alert("출금은 20만원 이상부터 가능합니다.");

    alert(`출금 요청 완료!\n영업일 기준 2~3일 내 처리됩니다.`);
};