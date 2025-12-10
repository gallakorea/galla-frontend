/* ===========================================================
   vote-battle.js
   - 찬성 / 반대 줄다리기 애니메이션
   - feed-card 내부 .yes-btn / .no-btn 클릭 시 작동
=========================================================== */

document.addEventListener("click", (e) => {
    const yesBtn = e.target.closest(".yes-btn");
    const noBtn = e.target.closest(".no-btn");

    if (!yesBtn && !noBtn) return;

    const card = e.target.closest(".feed-card");
    if (!card) return;

    const battle = card.querySelector(".vote-battle");
    const yesBar = card.querySelector(".yes-bar");
    const noBar = card.querySelector(".no-bar");

    // 현재 width 읽기
    let yesWidth = parseInt(yesBar.style.width || "50%");
    let noWidth = parseInt(noBar.style.width || "50%");

    // -----------------------------
    // 찬성 클릭
    // -----------------------------
    if (yesBtn) {
        yesWidth += 5;
        noWidth -= 5;
    }

    // -----------------------------
    // 반대 클릭
    // -----------------------------
    if (noBtn) {
        yesWidth -= 5;
        noWidth += 5;
    }

    // 범위 제한
    yesWidth = Math.max(5, Math.min(95, yesWidth));
    noWidth = 100 - yesWidth;

    yesBar.style.width = yesWidth + "%";
    noBar.style.width = noWidth + "%";

    // 줄다리기 흔들리는 애니메이션
    battle.classList.add("active");
    setTimeout(() => battle.classList.remove("active"), 400);
});