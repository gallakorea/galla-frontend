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

  // 4️⃣ 좌우 스와이프 페이지 전환 — 네비 순서대로 (홈 ↔ 예측 ↔ 서치 ↔ 광장 ↔ 마이)
  const PAGE_ORDER = ["index", "predict", "search", "plaza", "mypage"];
  const PAGE_URL = {
    index: "index.html", predict: "galla-predict.html", search: "search.html",
    plaza: "plaza.html", mypage: "mypage.html",
  };
  const curIdx = PAGE_ORDER.indexOf(currentPage);
  if (curIdx !== -1) {
    // 제스처 시작점이 가로 스크롤 요소/미디어/입력이면 스와이프 무시 (캐러셀·칩·영상 보호)
    const inHScroll = (el) => {
      for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
        if (!(n instanceof Element)) break;
        const tag = n.tagName;
        if (tag === "VIDEO" || tag === "INPUT" || tag === "TEXTAREA" || n.isContentEditable) return true;
        const s = getComputedStyle(n);
        if ((s.overflowX === "auto" || s.overflowX === "scroll") && n.scrollWidth > n.clientWidth + 2) return true;
      }
      return false;
    };
    // 모달/시트/드로어가 열려 있으면 스와이프 무시
    const overlayOpen = () => document.querySelector(
      "#dm-root.open, .wh-sheet.open, .shop-sheet.open, .noti-drawer.open, " +
      "#mpQuickView.open, #createModal:not([hidden]), #plaza-write-modal:not(.hidden)"
    );

    let sx = 0, sy = 0, st = 0, armed = false;
    document.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1) { armed = false; return; }
      armed = !inHScroll(e.target) && !overlayOpen();
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now();
    }, { passive: true });

    document.addEventListener("touchend", (e) => {
      if (!armed) return;
      const dx = e.changedTouches[0].clientX - sx;
      const dy = e.changedTouches[0].clientY - sy;
      if (Date.now() - st > 600) return;                          // 빠른 플릭만
      if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 2) return; // 수평 위주만
      const next = PAGE_ORDER[curIdx + (dx < 0 ? 1 : -1)];        // 왼쪽으로 밀면 다음
      if (!next) return;
      // 살짝 밀리며 전환되는 느낌
      document.body.style.transition = "transform .16s ease, opacity .16s ease";
      document.body.style.transform = `translateX(${dx < 0 ? -26 : 26}px)`;
      document.body.style.opacity = ".55";
      setTimeout(() => { location.href = PAGE_URL[next]; }, 110);
    }, { passive: true });
  }

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