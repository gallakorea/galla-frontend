/* ============================================================
   마이페이지 탭 아이콘 = 프로필 사진 (인스타식)
   - 로그인: 내 프로필 사진(원형)
   - 비로그인: 기본 원형 아이콘
   아이콘 스왑(data-base/active)에 되돌려지지 않도록 두 속성을 제거한다.
============================================================ */
(async function navProfileIcon() {
  const ready = () => new Promise(r => {
    if (document.readyState !== "loading") r();
    else document.addEventListener("DOMContentLoaded", r, { once: true });
  });
  await ready();

  const item = document.querySelector('.nav-item[data-page="mypage"]');
  const img = item && item.querySelector("img");
  if (!img) return;

  const FALLBACK = window.GALLA_DEFAULT_AVATAR || "/assets/app-icons/profile-circle-128.png";
  let src = FALLBACK;                       // 비로그인 기본값

  try {
    const sb = window.supabaseClient ||
      (window.waitForSupabaseClient ? await window.waitForSupabaseClient() : null);
    if (sb) {
      const { data } = await sb.auth.getSession();
      const uid = data?.session?.user?.id;
      if (uid) {
        // avatar_url은 users 테이블에만 공개 허용(user_profiles는 PII 잠금)
        const { data: u } = await sb.from("users").select("avatar_url").eq("id", uid).maybeSingle();
        if (u?.avatar_url && window.GALLA_avatarSrc) src = window.GALLA_avatarSrc(u.avatar_url);
      }
    }
  } catch (_) { /* 실패 시 기본 아이콘 유지 */ }

  img.removeAttribute("data-base");         // 활성/비활성 스왑이 덮어쓰지 않게
  img.removeAttribute("data-active");
  img.classList.add("nav-avatar");
  img.onerror = function () { this.onerror = null; this.src = FALLBACK; };
  img.src = src;
})();

document.addEventListener("DOMContentLoaded", () => {
  const currentPage = document.body.dataset.page;

  const navItems = document.querySelectorAll(".nav-item");

  // 현재 탭 재탭 → 있던 위치에서 부드럽게 최상단으로 (거리 비례 duration, 최대 0.6s)
  // window.scrollTo({behavior:'smooth'})는 일부 페이지(iOS 피드)에서 무시돼 rAF로 직접 이자징
  function smoothScrollTop() {
    const getY = () => window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    const start = getY();
    const app = document.getElementById("app");
    const appStart = app ? app.scrollTop : 0;
    if (start <= 0 && appStart <= 0) return;
    const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { window.scrollTo(0, 0); if (app) app.scrollTop = 0; return; }
    const dur = Math.max(220, Math.min(600, 200 + Math.max(start, appStart) * 0.06));
    const t0 = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3);   // ease-out cubic
    // rAF가 스로틀되는 환경(백그라운드 탭 등)에서도 멈추지 않게 setTimeout과 경합
    const tick = (fn) => {
      let done = false;
      const run = () => { if (done) return; done = true; fn(performance.now()); };
      requestAnimationFrame(run);
      setTimeout(run, 34);
    };
    (function step(now) {
      const p = Math.min(1, (now - t0) / dur);
      const k = 1 - ease(p);
      window.scrollTo(0, Math.round(start * k));
      if (app && appStart) app.scrollTop = Math.round(appStart * k);
      if (p < 1) tick(step);
    })(t0);
  }


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

    // 2️⃣ 클릭 시: 이미 현재 탭이면 '있던 자리에서 스르륵' 맨 위로, 아니면 이동
    item.addEventListener("click", (e) => {
      if (page === currentPage) {
        e.preventDefault();
        try { localStorage.removeItem("scrollPos"); } catch (_) {}
        smoothScrollTop();
        return;
      }
      if (target) location.href = target;
    });
  });

  // 4️⃣ 좌우 스와이프 페이지 전환 — 네비 순서대로 (홈 ↔ 예측 ↔ 서치 ↔ 광장 ↔ 마이)
  const PAGE_ORDER = ["index", "predict", "search", "plaza", "mypage"];
  const PAGE_URL = {
    index: "index.html", predict: "galla-predict.html", search: "search.html",
    plaza: "plaza.html", mypage: "mypage.html",
  };
  const curIdx = PAGE_ORDER.indexOf(currentPage);

  // 3️⃣ 인스타식 축소/복원 — 아래로 스크롤하면 작아지고, 위로 올리면 커진다.
  //    ⚠️ 스와이프 분기(return)보다 '앞'에 둬야 비-탭 페이지(광장상세·이슈 등)에서도 동작.
  const navEl = document.querySelector(".nav");
  // 헤더 인스타식 자동 숨김 — 네비 축소와 같은 핸들러로 100% 동기화.
  //   .hdr-scrolled : 스크롤(작동) 상태 → 아이콘에 원 표시(최상단에선 원 없음)
  //   .hdr-hidden   : 아래로 스크롤 → 헤더 전체(로고·＋·♥·금액·DM·설정)가 위로 사라짐
  //                   위로 스크롤하면 다시 표시. 전 페이지 동일.
  const _page = document.body.dataset.page;
  const hdrEl = ["index", "predict", "search", "plaza", "mypage"].includes(_page)
    ? document.querySelector(".header") : null;
  if (navEl || hdrEl) {
    // 스크롤 주체가 기기마다 window/documentElement/body로 달라 세 곳에서 위치를 읽는다.
    const getY = () => window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    let lastY = getY(), ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const y = getY(), dy = y - lastY;
        if (y <= 10) {                           // 최상단: 원·로고숨김 해제 + 헤더 표시 + 네비 원래크기
          navEl && navEl.classList.remove("nav--mini");
          if (hdrEl) {
            hdrEl.classList.remove("hdr-scrolled");
            hdrEl.classList.remove("hdr-hidden");
            hdrEl.classList.remove("hdr-nologo");
          }
          lastY = y;
          return;
        }
        hdrEl && hdrEl.classList.add("hdr-scrolled"); // 스크롤 상태 = 아이콘 원 표시
        // 헤더가 투명이라 y>10부터는 본문이 로고 위치까지 올라와 겹칠 수 있다 →
        // 스크롤 상태에선 로고를 숨기고(페이드) 맨 위(≤10px)에서만 로고 복귀.
        // (예전 60px 임계값은 10~60px 구간에서 로고×본문 겹침을 남겼다)
        hdrEl && hdrEl.classList.add("hdr-nologo");
        if (Math.abs(dy) > 4) {                  // 미세 스크롤 무시(떨림 방지)
          if (dy > 0 && y > 60) {                // 아래로 → 헤더 전체 숨김/네비 축소
            navEl && navEl.classList.add("nav--mini");
            hdrEl && hdrEl.classList.add("hdr-hidden");
          } else if (dy < 0) {                    // 위로 → 헤더 표시/네비 복원
            navEl && navEl.classList.remove("nav--mini");
            hdrEl && hdrEl.classList.remove("hdr-hidden");
          }
          lastY = y;
        }
      });
    };
    // capture:true — window가 아닌 요소가 스크롤해도(iOS body 등) 잡는다.
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    document.addEventListener("scroll", onScroll, { passive: true, capture: true });
    // 스크롤 복원으로 '이미 내려간 채' 열리는 경우 — 투명 헤더가 본문 위에 정지 상태로
    // 떠 있으면 겹침이 또렷하다. 아래로 스크롤하던 중과 똑같이 '숨김' 상태로 시작하고
    // (위로 올리면 평소처럼 다시 나타남), 얕은 복원(10~60px)은 로고만 숨긴다.
    const y0 = getY();
    if (y0 > 10 && hdrEl) hdrEl.classList.add("hdr-scrolled", "hdr-nologo");
    if (y0 > 60) {
      hdrEl && hdrEl.classList.add("hdr-hidden");
      navEl && navEl.classList.add("nav--mini");
    }
  }

  {
    // 제스처 시작점이 가로 스크롤 요소/미디어/입력이면 스와이프 무시 (캐러셀·칩·영상 보호)
    const inHScroll = (el) => {
      for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
        if (!(n instanceof Element)) break;
        const tag = n.tagName;
        if (tag === "VIDEO" || tag === "INPUT" || tag === "TEXTAREA" || n.isContentEditable) return true;
        // 인덱스 사진 캐러셀(트랜스폼 기반, overflow 아님) — 좌우 스와이프는 슬라이드 이동이므로 페이지 전환 금지
        if (n.classList && n.classList.contains("carousel-wrap")) return true;
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
    // ⚠️ Cloudflare Pages는 확장자 없는 clean URL(/galla-predict, /search)로 서빙 →
    //    .html 유무를 무시하고 비교해야 탭 루트 판별이 맞음(안 그러면 index 빼고 전부 오판).
    const norm = (s) => (s || "").toLowerCase().replace(/\.html$/, "");
    const curFile = norm(location.pathname.split("/").pop() || "index.html");
    const isTabRoot = curIdx !== -1 && norm(PAGE_URL[currentPage]) === curFile;

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
});
/* =========================================================
   📲 PWA 당겨서 새로고침 (Pull-to-Refresh)
   - standalone(홈화면 앱)에선 브라우저 네이티브 P2R이 없어 직접 구현
   - 스크롤 최상단에서 아래로 당기면 인디케이터 → 임계 넘겨 놓으면 reload
   - 세로 당김만 반응(가로 탭 스와이프와 방향으로 분리, 충돌 없음)
   ========================================================= */
(function () {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  if (!standalone) return; // 일반 브라우저는 네이티브 P2R 사용

  const THRESH = 72, MAX = 130;
  let startY = 0, pulling = false, dist = 0, ready = false, sp = null, bar = null;

  function mount() {
    if (document.getElementById("ptr-ind")) return;
    const css = document.createElement("style");
    css.textContent =
      "#ptr-ind{position:fixed;left:0;right:0;top:0;z-index:2147483000;display:flex;align-items:flex-start;justify-content:center;height:0;overflow:hidden;pointer-events:none}" +
      "#ptr-ind .ptr-sp{width:26px;height:26px;margin-top:12px;border-radius:50%;border:2.5px solid rgba(255,255,255,.16);border-top-color:#6f86ff;opacity:0}" +
      "#ptr-ind.spin .ptr-sp{animation:ptrspin .7s linear infinite;opacity:1!important;border-top-color:#8ea2ff}" +
      "@keyframes ptrspin{to{transform:rotate(360deg)}}";
    document.head.appendChild(css);
    bar = document.createElement("div"); bar.id = "ptr-ind";
    bar.innerHTML = '<div class="ptr-sp"></div>';
    document.body.appendChild(bar);
    sp = bar.querySelector(".ptr-sp");
  }
  if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);

  const scroller = () => document.scrollingElement || document.documentElement;
  const overlayOpen = () => document.querySelector(
    "#dm-root.open, .wh-sheet.open, .shop-sheet.open, .noti-drawer.open, " +
    "#mpQuickView.open, #createModal:not([hidden]), #plaza-write-modal:not(.hidden)"
  );

  document.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1 || !bar || overlayOpen() || scroller().scrollTop > 0) { pulling = false; return; }
    startY = e.touches[0].clientY; pulling = true; dist = 0; ready = false;
    bar.style.transition = "none";
  }, { passive: true });

  document.addEventListener("touchmove", (e) => {
    if (!pulling) return;
    const dy = e.touches[0].clientY - startY;
    if (dy <= 0 || scroller().scrollTop > 0) { pulling = false; bar.style.height = "0"; sp.style.opacity = "0"; return; }
    dist = Math.min(dy * 0.5, MAX);
    bar.style.height = dist + "px";
    sp.style.opacity = String(Math.min(dist / THRESH, 1));
    sp.style.transform = "rotate(" + (dist * 3) + "deg)";
    ready = dist >= THRESH;
    if (e.cancelable) e.preventDefault(); // 최상단 당김 = 바운스 대신 인디케이터
  }, { passive: false });

  document.addEventListener("touchend", () => {
    if (!pulling) return;
    pulling = false;
    bar.style.transition = "height .22s cubic-bezier(.2,.9,.3,1)";
    if (ready) { bar.style.height = THRESH + "px"; bar.classList.add("spin"); setTimeout(() => location.reload(), 180); }
    else { bar.style.height = "0"; setTimeout(() => { if (sp) sp.style.opacity = "0"; }, 230); }
  }, { passive: true });
})();
