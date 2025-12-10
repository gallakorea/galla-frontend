document.addEventListener("DOMContentLoaded", () => {

  const randomBtn = document.getElementById("randomBtn");
  const againBtn = document.getElementById("againBtn");
  const againWrap = document.querySelector(".again-btn-wrap");
  const slotCard = document.getElementById("slotCard");

  let spinCount = 0;

  // 더미 데이터 (서버 붙으면 API 호출)
  const dummyIssues = [
    { title: "직장 회식 강요, 어디까지 허용?", votes: 329 },
    { title: "연애할 때 더치페이 의무인가?", votes: 512 },
    { title: "비혼주의 확산, 사회적 문제인가?", votes: 208 },
    { title: "회사에서의 정치 대화 금지해야 할까?", votes: 147 },
    { title: "여행 브이로그 촬영, 민폐인가?", votes: 420 }
  ];

  function pickRandomIssue() {
    const r = Math.floor(Math.random() * dummyIssues.length);
    return dummyIssues[r];
  }

  function spinSlot() {
    spinCount++;

    slotCard.classList.add("blurred");
    slotCard.style.animation = "slotSpin 0.6s ease infinite";

    setTimeout(() => {
      slotCard.style.animation = "none";
      slotCard.classList.remove("blurred");

      const issue = pickRandomIssue();
      slotCard.innerHTML = `
        <h2>${issue.title}</h2>
        <p>참여 ${issue.votes}명</p>
      `;

      slotCard.classList.add("pop");

      setTimeout(() => slotCard.classList.remove("pop"), 400);

      againWrap.style.display = "flex";
    }, 800 + spinCount * 120);
  }

  randomBtn.addEventListener("click", spinSlot);
  againBtn.addEventListener("click", spinSlot);

});

/* BOTTOM NAV INDICATOR */
document.querySelectorAll(".nav-item").forEach(item => {
  item.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach(i => i.classList.remove("active"));
    item.classList.add("active");

    const color = item.dataset.color || "#4A6CFF";
    item.style.setProperty("--indicator-color", color);
  });
});