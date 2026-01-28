document.addEventListener("DOMContentLoaded", () => {
  const currentPage = document.body.dataset.page;

  document.querySelectorAll(".nav-item").forEach(item => {
    const page = item.dataset.page;
    const target = item.dataset.target;
    const img = item.querySelector("img");

    if (!img) return;

    const baseSrc = img.getAttribute("data-base");
    const activeSrc = img.getAttribute("data-active");

    // ✅ 초기 상태: page 기준으로 active 명확히 분기
    if (page === currentPage) {
      item.classList.add("active");
      if (activeSrc) img.src = activeSrc;
    } else {
      item.classList.remove("active");
      if (baseSrc) img.src = baseSrc;
    }

    // ✅ 클릭 시: 상태 토글 + 페이지 이동
    item.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach(other => {
        const otherImg = other.querySelector("img");
        if (!otherImg) return;

        const otherBase = otherImg.getAttribute("data-base");
        other.classList.remove("active");
        if (otherBase) otherImg.src = otherBase;
      });

      item.classList.add("active");
      if (activeSrc) img.src = activeSrc;

      if (target) {
        // 약간의 딜레이로 active 전환이 보이게 함
        setTimeout(() => {
          location.href = target;
        }, 80);
      }
    });
  });
});