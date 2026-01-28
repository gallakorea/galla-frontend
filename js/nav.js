document.addEventListener("DOMContentLoaded", () => {
  const currentPage = document.body.dataset.page;

  const navItems = document.querySelectorAll(".nav-item");

  navItems.forEach(item => {
    const page = item.dataset.page;
    const target = item.dataset.target;
    const img = item.querySelector("img");

    if (!img) return;

    const baseSrc = img.dataset.base;
    const activeSrc = img.dataset.active;

    // 1️⃣ 초기 상태: 현재 페이지 기준으로만 active 처리
    if (page === currentPage) {
      item.classList.add("active");
      if (activeSrc) img.src = activeSrc;
    } else {
      item.classList.remove("active");
      if (baseSrc) img.src = baseSrc;
    }

    // 2️⃣ 클릭 시: 상태 변경 없이 즉시 페이지 이동
    item.addEventListener("click", () => {
      if (target && target !== location.pathname.split("/").pop()) {
        location.href = target;
      }
    });
  });
});