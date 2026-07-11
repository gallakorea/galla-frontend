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

  // 3️⃣ 인스타식 축소/복원 — 아래로 스크롤하면 작아지고, 위로 올리면 커진다
  const nav = document.querySelector(".nav");
  if (nav) {
    let lastY = window.scrollY;
    let ticking = false;
    window.addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const dy = y - lastY;
        if (Math.abs(dy) > 4) {           // 미세 스크롤 무시 (떨림 방지)
          if (dy > 0 && y > 60) nav.classList.add("nav--mini");
          else if (dy < 0)      nav.classList.remove("nav--mini");
          lastY = y;
        }
        // 최상단에서는 항상 원래 크기
        if (y <= 10) nav.classList.remove("nav--mini");
        ticking = false;
      });
    }, { passive: true });
  }
});