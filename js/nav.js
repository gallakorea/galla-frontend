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

    // 이 페이지가 '탭 자기 자신'(탭 루트)인지 판별.
    // 상세/설정 페이지(plaza_detail·predict-market·settings·mypage 하위 등)는 nav 하이라이트용으로
    // data-page를 탭 이름과 공유하지만 파일은 다르다 → 탭 좌우전환 대신 '직전 페이지(뒤로가기)'로.
    const curFile = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    const isTabRoot = (PAGE_URL[currentPage] || "").toLowerCase() === curFile;

    if (!isTabRoot) {
      // 왼→오 스와이프 = 뒤로가기 (수평 의도 확정 시에만, 세로 스크롤/가로스크롤/모달 보호)
      let bx = 0, by = 0, bdx = 0, bArmed = false, bLock = 0; // bLock: 0 미정 · 1 수평확정 · 2 취소
      document.addEventListener("touchstart", (e) => {
        if (e.touches.length !== 1) { bArmed = false; return; }
        bArmed = !inHScroll(e.target) && !overlayOpen();
        bx = e.touches[0].clientX; by = e.touches[0].clientY; bdx = 0; bLock = 0;
      }, { passive: true });
      document.addEventListener("touchmove", (e) => {
        if (!bArmed || e.touches.length !== 1 || bLock === 2) return;
        const dx = e.touches[0].clientX - bx, dy = e.touches[0].clientY - by;
        bdx = dx;
        if (!bLock) {
          if (Math.abs(dy) > 14 && Math.abs(dy) >= Math.abs(dx)) { bLock = 2; return; } // 세로 스크롤 양보
          if (dx > 16 && dx > Math.abs(dy) * 1.4) bLock = 1;                            // 오른쪽 수평 확정
          else if (dx < -10) bLock = 2;                                                 // 왼쪽 스와이프는 무시
        }
      }, { passive: true });
      document.addEventListener("touchend", () => {
        if (bLock === 1 && bdx > 80 && history.length > 1) history.back();
        bArmed = false; bLock = 0; bdx = 0;
      }, { passive: true });
      return; // 탭 좌우전환 로직은 바인딩하지 않음
    }

    /* ── 인스타식 인터랙티브 드래그 전환 ──
       손가락에 1:1로 페이지가 붙어 끌리고, 옆 페이지 카드가 갭을 두고 따라온다.
       놓는 순간 거리/속도로 커밋 판정 → 끝까지 밀려나간 뒤 이동, 아니면 스냅백 */
    const PAGE_META = {
      index:   { name: "홈",   icon: "assets/icons/nav-home-active.svg" },
      predict: { name: "예측", icon: "assets/icons/nav-predict-active.svg" },
      search:  { name: "검색", icon: "assets/icons/nav-search-active.svg" },
      plaza:   { name: "광장", icon: "assets/icons/nav-plaza-active.svg" },
      mypage:  { name: "마이", icon: "assets/icons/nav-user-active.svg" },
    };
    const GAP = 14; // 페이지 사이 검은 틈 (인스타 감성)

    // 페이지 콘텐츠를 스테이지로 감싼다 (nav·이후 생성되는 모달들은 바깥에 남음)
    const stage = document.createElement("div");
    stage.id = "page-stage";
    Array.from(document.body.children).forEach((el) => {
      if (el.matches(".nav") || el.tagName === "SCRIPT") return;
      stage.appendChild(el);
    });
    document.body.prepend(stage);

    // 옆에서 따라 들어오는 목적지 카드
    const peek = document.createElement("div");
    peek.className = "swipe-peek";
    document.body.appendChild(peek);

    let sx = 0, sy = 0, dxCur = 0, lastX = 0, lastT = 0, vel = 0;
    let armed = false, locked = false, dir = 0, targetKey = null;

    const W = () => window.innerWidth;
    const setDrag = (on) => {
      stage.classList.toggle("dragging", on);
      peek.classList.toggle("show", on);
    };
    const place = (dx) => {
      stage.style.transform = `translateX(${dx}px)`;
      const off = dx < 0 ? (W() + GAP + dx) : (dx - W() - GAP);
      peek.style.transform = `translateX(${off}px)`;
    };
    const reset = () => {
      stage.style.transition = "";
      stage.style.transform = "";
      peek.style.transition = "";
      peek.style.transform = "";
      setDrag(false);
      locked = false; armed = false; dir = 0; targetKey = null;
    };

    // BFCache 복원 대응: 밀어낸 상태(.dragging + translateX)로 떠났다가
    // 뒤로가기/스와이프로 돌아오면 그 상태가 그대로 살아나 페이지가
    // 축소된 카드처럼 보임 → 표시 즉시 무전환으로 원상복구
    window.addEventListener("pageshow", () => {
      stage.style.transition = "none";
      peek.style.transition = "none";
      stage.style.transform = "";
      peek.style.transform = "";
      setDrag(false);
      locked = false; armed = false; dir = 0; targetKey = null;
      requestAnimationFrame(() => { stage.style.transition = ""; peek.style.transition = ""; });
    });

    document.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1) { armed = false; return; }
      armed = !inHScroll(e.target) && !overlayOpen();
      locked = false; dir = 0; dxCur = 0; vel = 0;
      sx = e.touches[0].clientX; sy = e.touches[0].clientY;
      lastX = sx; lastT = performance.now();
    }, { passive: true });

    document.addEventListener("touchmove", (e) => {
      if (!armed || e.touches.length !== 1) return;
      const x = e.touches[0].clientX, y = e.touches[0].clientY;
      const dx = x - sx, dy = y - sy;

      if (!locked) {
        if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) { armed = false; return; } // 세로 스크롤 양보
        if (Math.abs(dx) < 14 || Math.abs(dx) < Math.abs(dy) * 1.4) return;              // 수평 의도 확정 전
        // 수평 드래그 시작
        dir = dx < 0 ? 1 : -1;
        targetKey = PAGE_ORDER[curIdx + dir] || null;
        if (targetKey) {
          const m = PAGE_META[targetKey];
          peek.innerHTML = `<img src="${m.icon}" alt=""><span>${m.name}</span>`;
        }
        locked = true;
        setDrag(true);
        stage.style.transition = "none";
        peek.style.transition = "none";
      }

      e.preventDefault(); // 수평 드래그 중 세로 스크롤 잠금
      // 방향이 뒤집히면 목적지 재계산
      const d2 = dx < 0 ? 1 : -1;
      if (d2 !== dir) {
        dir = d2;
        targetKey = PAGE_ORDER[curIdx + dir] || null;
        if (targetKey) {
          const m = PAGE_META[targetKey];
          peek.innerHTML = `<img src="${m.icon}" alt=""><span>${m.name}</span>`;
        } else peek.innerHTML = "";
      }
      // 목적지 없으면 고무줄 저항
      dxCur = targetKey ? dx : dx * 0.28;
      place(dxCur);

      const now = performance.now();
      if (now - lastT > 0) vel = (x - lastX) / (now - lastT); // px/ms
      lastX = x; lastT = now;
    }, { passive: false });

    document.addEventListener("touchend", () => {
      if (!locked) { armed = false; return; }
      const w = W();
      const commit = targetKey && (
        Math.abs(dxCur) > w * 0.32 ||                       // 충분히 끌었거나
        (Math.abs(vel) > 0.45 && Math.sign(vel) === -dir)   // 빠르게 던졌거나
      );
      const ease = "transform .26s cubic-bezier(.22,.9,.3,1)";
      stage.style.transition = ease;
      peek.style.transition = ease;
      if (commit) {
        place(dir > 0 ? -(w + GAP) : (w + GAP));            // 끝까지 밀어내기
        const url = PAGE_URL[targetKey];
        setTimeout(() => { location.href = url; }, 210);
      } else {
        place(0);                                            // 쫀득한 스냅백
        setTimeout(reset, 280);
      }
    }, { passive: true });

    document.addEventListener("touchcancel", () => { if (locked) { stage.style.transition = "transform .2s"; place(0); setTimeout(reset, 220); } }, { passive: true });
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