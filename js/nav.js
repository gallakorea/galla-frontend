/* ============================================================
   📲 앱 설치 프롬프트 캡처 (전 페이지)
   beforeinstallprompt는 페이지 로드 직후 딱 한 번 날아온다 — 여기서 잡아두지
   않으면 나중에 어떤 화면에서도 '설치하기' 버튼을 만들 수 없다.
   a2hs.js(하단 배너)와 mic-help.js(권한 시트)가 이 API를 함께 쓴다.
============================================================ */
(function gallaInstallCapture() {
  let deferred = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    try { localStorage.setItem('galla_installed', '1'); } catch (_) {}
  });
  window.GALLA_canInstall = () => !!deferred;
  window.GALLA_promptInstall = async () => {
    if (!deferred) return 'unavailable';
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === 'accepted') deferred = null;
    return outcome;
  };
})();

/* ============================================================
   마이페이지 탭 아이콘 (인스타식)
   - 로그인 + 프로필 사진 있음: 내 사진(원형)
   - 비로그인 / 아바타 없음: 기본 사람 아이콘(nav-user.svg) 그대로 유지
     ⚠️ 기본 아바타는 중립 사람 아이콘(default-avatar.png) — 갈라 로고 금지 → 사진 있을 때만 교체
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

  const AV_KEY = "galla_nav_avatar";
  const apply = (url) => {
    if (url) {
      img.removeAttribute("data-base");     // 활성/비활성 스왑이 덮어쓰지 않게
      img.removeAttribute("data-active");
      img.classList.add("nav-avatar");
      img.onerror = function () {           // 사진 로드 실패 시 기본 아이콘으로 복귀
        this.onerror = null;
        this.classList.remove("nav-avatar");
        this.src = "./assets/icons/nav-user.svg";
      };
      if (img.src !== url) img.src = url;
    } else {
      img.classList.remove("nav-avatar");
      img.dataset.base = "./assets/icons/nav-user.svg";
      img.dataset.active = "./assets/icons/nav-user-active.svg";
      img.src = (document.body.dataset.page === "mypage") ? img.dataset.active : img.dataset.base;
    }
  };

  /* ⚡ 캐시 즉시 적용 — 네트워크를 기다리지 않아 아바타가 바로 보인다.
     ('안 나올 때도 있고 느리고 제각각' 원인 = 페이지마다 supabase 왕복 대기) */
  try { const c = localStorage.getItem(AV_KEY); if (c) apply(c); } catch (_) {}

  let photo = null, checked = false;
  try {
    const sb = window.supabaseClient ||
      (window.waitForSupabaseClient ? await window.waitForSupabaseClient() : null);
    if (sb) {
      const { data } = await sb.auth.getSession();
      checked = true;                        // 세션 확인 완료(있든 없든)
      const uid = data?.session?.user?.id;
      if (uid) {
        // avatar_url은 users 테이블에만 공개 허용(user_profiles는 PII 잠금)
        const { data: u } = await sb.from("users").select("avatar_url").eq("id", uid).maybeSingle();
        if (u?.avatar_url && window.GALLA_avatarSrc) photo = window.GALLA_avatarSrc(u.avatar_url);
      }
    }
  } catch (_) { /* 실패 시 캐시/기본 아이콘 유지 */ }

  if (!checked) return;                      // supabase 미탑재 페이지 — 캐시 상태 유지
  try {
    if (photo) localStorage.setItem(AV_KEY, photo);
    else localStorage.removeItem(AV_KEY);    // 로그아웃 — 다음부터 기본 아이콘
    // 셸 네비(최상위)에도 반영 — 판이 아니라 셸의 아이콘이 실제로 보이는 것
    if (window.top !== window.self && window.top.GALLA_setNavAvatar) window.top.GALLA_setNavAvatar(photo);
  } catch (_) {}
  apply(photo);
})();

document.addEventListener("DOMContentLoaded", () => {
  const currentPage = document.body.dataset.page;

  // 🐚 셸(iframe) 감지 — 스크롤 축소 신호·제스처를 셸로 중계할 때 사용
  const SHELL_MODE = (() => {
    try { return window.top !== window.self && !!window.top.document.getElementById("shell-track"); }
    catch (_) { return false; }   // 크로스오리진/샌드박스(미리보기 peek)면 여기로 — 셸 아님
  })();
  const postShell = (m) => { if (!SHELL_MODE) return; try { window.parent.postMessage(Object.assign({ galla: "shell" }, m), location.origin); } catch (_) {} };

  if (SHELL_MODE) {
    document.body.classList.add("in-shell");   // 상세 포함 모든 판 페이지: 자기 네비 숨김(셸 네비가 유일)

    /* 🧭 셸 네비 숨김 중계 — 모든 셸 페이지 공통(탭루트뿐 아니라 이슈 등 서브페이지도).
       DM 상세(dm-detail)·댓글 컴포저(kb-open)에서 키보드가 열리면 셸 네비가 입력창 위로
       떠서 겹친다(사장님 재현: 이슈 입력창이 네비에 가림). body 클래스 변화를 셸로 중계해 숨김.
       ⚠️ 이전엔 isTabRoot 블록 안에만 있어 이슈 페이지엔 안 걸렸다. */
    (function () {
      let lastNavHide = null;
      const relay = () => {
        // ⚠️ 풀스크린 상태(릴스·육성 무대)도 포함 — 안 하면 body 클래스가 바뀔 때마다
        //    릴레이가 navhide:false를 쏴서 개별 navhide(true)를 되돌린다(사장님 재현: 릴스 위 nav)
        const on = document.body.classList.contains("dm-detail")
                || document.body.classList.contains("kb-open")
                || document.body.classList.contains("shorts-open")
                || !!document.getElementById("lv-stage");
        if (on === lastNavHide) return;
        lastNavHide = on; postShell({ t: "navhide", on });
      };
      new MutationObserver(relay).observe(document.body, { attributes: true, attributeFilter: ["class"] });
      relay();   // 초기 1회 — 이전 판이 남긴 숨김 상태를 이 판 기준으로 바로 교정
      window.addEventListener("message", (e) => {
        if (e.origin !== location.origin) return;
        if (e.data && e.data.galla === "shellcmd" && e.data.t === "active") relay();
      });
    })();
    /* 다른 '탭'으로 가는 클릭 가로채기 — 상세 페이지에서도 동일 적용 */
    const TAB_OF = { "index.html": "index", "galla-predict.html": "predict", "dm.html": "dm", "search.html": "trend", "mypage.html": "mypage" };
    const tabOfUrl = (u) => TAB_OF[(u || "").split("?")[0].split("#")[0].split("/").pop()] || null;
    /* 글쓰기·작성 계열은 '탭'이 아니라 전체화면 화면 — 판(iframe) 안에서 열리면
       그 판이 글쓰기로 오염되고, 완료/뒤로가 홈으로 튀며 이후 탭들이 다 오염된다
       (사장님 재현). 셸 최상위(top)로 띄워 셸 자체를 잠시 벗어난다. 완료 시 셸 복귀. */
    const isCompose = (u) => /\/(write|create)\.html/.test(u) || /[?&]compose=1\b/.test(u);
    document.addEventListener("click", (e) => {
      const a = e.target.closest("a[href]");
      const o = e.target.closest("[onclick]");
      const href = a ? a.getAttribute("href") : "";
      const oc = o ? (o.getAttribute("onclick") || "") : "";
      // ① 글쓰기 계열 링크 → 셸 밖 전체화면.
      //    ⚠️ + 버튼(#hdrWrite·[data-write-hub])은 가로채지 않는다 — 얘는 '쓰기 선택
      //    시트'를 여는 버튼인데, 여기서 create.html로 낚아채면 시트가 떴다가 페이지가
      //    통째로 넘어가며 사라졌다(사장님 재현). 시트의 실제 이동은 write-hub.js가
      //    셸 인식으로 처리한다.
      if (isCompose(href) || /create\.html|write\.html|compose=1/.test(oc)) {
        e.preventDefault(); e.stopPropagation();
        try { window.top.location.href = "create.html"; } catch (_) { location.href = "create.html"; }
        return;
      }
      // ② 다른 탭 이동 → 셸 전환
      let tab = a ? tabOfUrl(href) : null;
      if (!tab && o) { for (const k in TAB_OF) { if (oc.indexOf(k) !== -1) { tab = TAB_OF[k]; break; } } }
      if (!tab) return;
      e.preventDefault(); e.stopPropagation();
      postShell({ t: "nav", tab });
    }, true);
  }

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
      // 표준 탭바: 탭 전환은 히스토리를 쌓지 않는다(replace) — 탭끼리 '뒤로가기'가
      // 거슬러 올라가 홈으로 흐르던 문제 제거(사장님 제보). 서브페이지(상세·설정 등)만
      // href(push)로 열려 뒤로가기가 그 탭으로 정상 복귀.
      if (target) location.replace(target);
    });
  });

  // 4️⃣ 좌우 스와이프 페이지 전환 — 네비 순서대로 (홈 ↔ 예측 ↔ 서치 ↔ 광장 ↔ 마이)
  const PAGE_ORDER = ["index", "predict", "dm", "trend", "mypage"];   // 네비 순서 그대로 스와이프
  const PAGE_URL = {
    index: "index.html", predict: "galla-predict.html", dm: "dm.html",
    trend: "search.html", mypage: "mypage.html",
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
  // ⚠️ "dm" 제외: DM은 내부 스크롤 컨테이너 구조라 헤더가 오르내리면 탭바(채팅·친구·난장·삐삐)와
  //    겹쳐 보인다("정렬이 무너짐"). DM 헤더는 항상 고정.
  const hdrEl = ["index", "predict", "search", "plaza", "mypage", "trend"].includes(_page)
    ? document.querySelector(".header") : null;
  if (navEl || hdrEl) {
    // 스크롤 주체가 기기마다 window/documentElement/body로 달라 세 곳에서 위치를 읽는다.
    const getY = () => window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    let lastY = getY(), ticking = false;
    // DM 페이지처럼 '창'이 아니라 패널 내부(.dm-list 등)가 스크롤되는 화면 지원 —
    // capture 리스너는 요소 스크롤도 받지만 좌표를 창에서 읽으면 항상 0이라 무반응이었다.
    // 이벤트를 낸 요소의 scrollTop을 쓰고, 요소별 직전 위치는 WeakMap으로 따로 기억한다.
    const innerLast = new WeakMap();
    let pendingEvt = null;
    const onScroll = (e) => {
      pendingEvt = e;
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const t = pendingEvt && pendingEvt.target;
        const el = (t && t.nodeType === 1 && t !== document.documentElement && t !== document.body &&
                    t.scrollHeight > t.clientHeight + 1) ? t : null;
        const y = el ? el.scrollTop : getY();
        // ★ 첫 목격 시 시딩 필수 — 안 하면 prev=y로 두고 기록을 안 해 dy가 영원히 0
        //   (매 이벤트가 '첫 이벤트'가 됨 → 축소/숨김이 절대 발동 안 함. 실물 재현으로 잡음)
        if (el && !innerLast.has(el)) innerLast.set(el, y);
        const prev = el ? innerLast.get(el) : lastY;
        const dy = y - prev;
        const remember = () => { if (el) innerLast.set(el, y); else lastY = y; };
        if (y <= 10) {                           // 최상단: 원·로고숨김 해제 + 헤더 표시 + 네비 원래크기
          navEl && navEl.classList.remove("nav--mini");
          postShell({ t: "mini", on: false });
          if (hdrEl) {
            hdrEl.classList.remove("hdr-scrolled");
            hdrEl.classList.remove("hdr-hidden");
            hdrEl.classList.remove("hdr-nologo");
          }
          remember();
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
            postShell({ t: "mini", on: true });
          } else if (dy < 0) {                    // 위로 → 헤더 표시/네비 복원
            navEl && navEl.classList.remove("nav--mini");
            hdrEl && hdrEl.classList.remove("hdr-hidden");
            postShell({ t: "mini", on: false });
          }
          remember();
        }
      });
    };
    // 뷰 전환형 페이지(DM 등)용: 다른 스크롤러에서 만든 축소/숨김 상태를 즉시 해제.
    // 없으면 '대화방에서 내리고 → 목록 복귀' 때 목록이 짧아 스크롤 불가면 헤더가
    // 로고 없이(아이콘만) 영구히 남는다.
    window.GALLA_navReset = () => {
      navEl && navEl.classList.remove("nav--mini");
      if (hdrEl) hdrEl.classList.remove("hdr-hidden", "hdr-nologo", "hdr-scrolled");
      lastY = getY();
    };
    // capture:true — window가 아닌 요소가 스크롤해도(iOS body 등) 잡는다.
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    document.addEventListener("scroll", onScroll, { passive: true, capture: true });

    // ⌨️ 키보드 열림 감지 — 안드로이드 adjustResize로 하단 네비가 키보드 위에 떠올라
    //    콘텐츠를 가리던 것 차단(body.kb-up → nav 슬라이드아웃, css/nav.css). 전 MPA 페이지 공통.
    (function kbNavHide() {
      const vv = window.visualViewport;
      let baseH = window.innerHeight;
      const on = () => {
        const gap = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0; // iOS/pan
        const shrink = baseH - window.innerHeight;                                       // android adjustResize
        document.body.classList.toggle("kb-up", gap > 80 || shrink > 150);
      };
      window.addEventListener("resize", () => { if (window.innerHeight > baseH) baseH = window.innerHeight; on(); });
      if (vv) { vv.addEventListener("resize", on); vv.addEventListener("scroll", on); }
    })();
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
    // ⚠️ #dm-root.open은 '오버레이로 뜬 DM'일 때만 차단 대상. dm.html의 페이지 모드(.page)는
    //    그냥 하나의 탭 페이지라 좌우 스와이프가 다른 탭처럼 동작해야 한다.
    //    (대화방·프로필 같은 상세는 body.dm-detail로 따로 막는다)
    const overlayOpen = () => document.querySelector(
      "#dm-root.open:not(.page), .wh-sheet.open, .shop-sheet.open, .noti-drawer.open, " +
      "#mpQuickView.open, #createModal:not([hidden]), #plaza-write-modal:not(.hidden), " +
      "#pager-call.on, #pager-book.on, #dm-call.on, #nav-jog, #lv-stage"
    ) || document.body.classList.contains("dm-detail");

    // 이 페이지가 '탭 자기 자신'(탭 루트)인지 판별.
    // 상세/설정 페이지(plaza_detail·predict-market·settings·mypage 하위 등)는 nav 하이라이트용으로
    // data-page를 탭 이름과 공유하지만 파일은 다르다 → 탭 좌우전환 대신 '직전 페이지(뒤로가기)'로.
    // ⚠️ Cloudflare Pages는 확장자 없는 clean URL(/galla-predict, /search)로 서빙 →
    //    .html 유무를 무시하고 비교해야 탭 루트 판별이 맞음(안 그러면 index 빼고 전부 오판).
    const norm = (s) => (s || "").toLowerCase().replace(/\.html$/, "");
    const curFile = norm(location.pathname.split("/").pop() || "index.html");
    const isTabRoot = curIdx !== -1 && norm(PAGE_URL[currentPage]) === curFile;

    /* ═══ 앱/PWA = 항상 셸 — MPA 탈출 자가 회복 ═══
       로그인·글쓰기 등 최상위 이동을 거치면 앱이 셸 밖(MPA)에서 돌게 되고,
       조그·스와이프가 셸과 달라져 '먹통'으로 보였다(사장님 재현: 로그인 후).
       앱/PWA 환경에서 탭 루트에 단독으로 떨어지면 셸의 같은 탭으로 즉시 복귀한다.
       예외: ?compose=1(작성 흐름 딥링크)은 건드리지 않는다. 웹 브라우저는 MPA 유지(SEO). */
    if (!SHELL_MODE && window.top === window.self && isTabRoot &&
        !/[?&]compose=1\b/.test(location.search)) {
      const appEnv = /GallaApp/.test(navigator.userAgent) ||
        (window.matchMedia && matchMedia("(display-mode: standalone)").matches);
      if (appEnv) { location.replace("app-shell.html?tab=" + currentPage); return; }
    }

    /* ═══════ 🐚 셸 모드 (app-shell.html 안 iframe) ═══════
       탭 5개가 셸에 상주해 전환이 즉시다. 이 페이지는 자기 네비·스와이프 엔진을
       끄고, 제스처를 셸(부모)로 중계만 한다 — 실제 트랙 이동·커밋은 셸이 수행.
       (?shell=1 + iframe일 때만. 단독 사용 시 기존 경로 그대로) */
    const IN_SHELL = SHELL_MODE;
    if (IN_SHELL && isTabRoot) {
      const post = postShell;
      /* navhide(네비 숨김) 중계는 위 SHELL_MODE 블록으로 이관 — 이슈 등 서브페이지도 커버. */

      // 셸 → 판 명령 수신 (조그셔틀의 DM 탭 지정, 재탭 시 맨위로 등)
      window.addEventListener("message", (e) => {
        if (e.origin !== location.origin) return;
        const m = e.data;
        if (!m || m.galla !== "shellcmd") return;
        if (m.t === "dmtab" && m.tab) {
          const btn = document.querySelector(`.dm-tab[data-tab="${m.tab}"]`);
          if (btn) btn.click();
        } else if (m.t === "scrolltop") {
          smoothScrollTop();
        }
      });
      let sx0 = 0, sy0 = 0, lock = 0, lastX = 0, lastT = 0, v = 0; // lock: 0 미정 1 수평 2 취소
      document.addEventListener("touchstart", (e) => {
        if (e.touches.length !== 1) { lock = 2; return; }
        /* 탭바(.tabs-header) 위 제스처는 셸 스와이프에서 제외 — 트렌드 탭 롱프레스
           정렬의 좌우 드래그를 탭 전환으로 오인해 충돌했다(사장님 재현: 셸/PWA/앱).
           탭바 자체 정렬 엔진이 온전히 처리하게 양보한다. */
        const onTabBar = !!(e.target.closest && e.target.closest(".tabs-header"));
        lock = (onTabBar || inHScroll(e.target) || overlayOpen()) ? 2 : 0;
        sx0 = e.touches[0].clientX; sy0 = e.touches[0].clientY;
        lastX = sx0; lastT = performance.now(); v = 0;
      }, { passive: true });
      document.addEventListener("touchmove", (e) => {
        if (lock === 2 || e.touches.length !== 1) return;
        // 트렌드 탭 정렬·조그셔틀 등 자체 드래그 UI가 열려 있으면 전환 양보
        if (document.querySelector(".tab-item.reordering") || document.getElementById("nav-jog")) { lock = 2; return; }
        const x = e.touches[0].clientX, y = e.touches[0].clientY;
        const dx = x - sx0, dy = y - sy0;
        if (!lock) {
          if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) { lock = 2; return; }   // 세로 스크롤 양보
          if (Math.abs(dx) < 14 || Math.abs(dx) < Math.abs(dy) * 1.4) return;           // 수평 의도 확정 전
          lock = 1;
          sx0 = x;   // 잠금 지점부터 0으로 재시작 — 첫 프레임 14px 점프 제거(손가락 밀착감)
        }
        e.preventDefault();                                                              // 수평 확정 — 세로 잠금
        const now = performance.now();
        if (now - lastT > 0) v = (x - lastX) / (now - lastT);
        lastX = x; lastT = now;
        post({ t: "drag", dx: x - sx0 });   // 잠금 지점 기준 재계산 — 첫 이벤트 점프 방지
      }, { passive: false });
      const end = () => { if (lock === 1) post({ t: "end", dx: lastX - sx0, vel: v }); lock = 0; };
      document.addEventListener("touchend", end, { passive: true });
      document.addEventListener("touchcancel", () => { if (lock === 1) post({ t: "cancel" }); lock = 0; }, { passive: true });
      return; // 자체 스와이프 엔진·미리보기 비활성
    }

    if (!isTabRoot) {
      // 왼→오 스와이프 = 뒤로가기 (수평 의도 확정 시에만, 세로 스크롤/가로스크롤/모달 보호)
      let bx = 0, by = 0, bdx = 0, bArmed = false, bLock = 0; // bLock: 0 미정 · 1 수평확정 · 2 취소
      document.addEventListener("touchstart", (e) => {
        if (e.touches.length !== 1) { bArmed = false; return; }
        bArmed = !inHScroll(e.target) && !overlayOpen();
        bx = e.touches[0].clientX; by = e.touches[0].clientY; bdx = 0; bLock = 0;
      }, { passive: true });
      document.addEventListener("touchmove", (e) => {
        if (document.getElementById('nav-jog') || document.querySelector('.tab-item.reordering')) { bArmed = false; return; }   // 조그셔틀·탭 정렬 중엔 양보
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
    // ⚠️ PAGE_ORDER와 반드시 같은 키를 가질 것 — 여기 빠진 탭으로 스와이프하면
    //    미리보기 생성에서 오류가 나 드래그가 통째로 죽는다(dm·trend가 빠져 있었음).
    const PAGE_META = {
      index:   { name: "홈",   icon: "assets/icons/nav-home-active.svg" },
      predict: { name: "예측", icon: "assets/icons/nav-predict-active.svg" },
      dm:      { name: "메시지", icon: "assets/icons/nav-dm-active.svg" },
      trend:   { name: "트렌드", icon: "assets/icons/nav-trend-active.svg" },
      mypage:  { name: "마이", icon: "assets/icons/nav-user-active.svg" },
      // 레거시 키(예전 네비) — 혹시 남은 페이지가 참조할 수 있어 유지
      search:  { name: "검색", icon: "assets/icons/nav-search-active.svg" },
      plaza:   { name: "광장", icon: "assets/icons/nav-plaza-active.svg" },
    };
    // 미리보기는 없어도 이동은 돼야 한다 — 메타가 비어도 죽지 않게 안전 접근
    const metaOf = (k) => PAGE_META[k] || { name: "", icon: "" };
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

    /* 목적지 '실물' 미리보기 — 아이콘+이름 카드는 "안내 페이지가 한 번 보였다
       넘어간다"로 느껴진다(사장님 지적). 목적지 페이지를 스크립트 차단
       iframe(sandbox)으로 렌더해 실제 화면 프레임이 끌려오게 한다.
       스크립트가 없어 데이터는 안 차지만 헤더·네비·배경 스켈레톤이 보여
       '진짜 그 페이지가 오는' 연속감이 난다. 라벨은 로딩 전 폴백으로만.
       ⚠️ iframe은 부모를 옮기면 다시 로드된다 — peek 안에 상주시키고 표시만 전환. */
    const pvLabel = document.createElement("div");
    pvLabel.className = "peek-label";
    peek.appendChild(pvLabel);
    const pvFrames = {};
    const ensureFrame = (key) => {
      if (!key || pvFrames[key]) return;
      const f = document.createElement("iframe");
      f.className = "peek-frame";
      f.setAttribute("sandbox", "allow-same-origin"); // JS 차단 — 이중 세션·이중 실시간 채널 방지
      f.setAttribute("tabindex", "-1");
      f.style.display = "none";
      f.src = PAGE_URL[key];
      /* 미리보기 본문 채우기 — sandbox라 목적지 JS(스냅샷 주입 포함)가 못 돌므로
         부모가 직접 지난 콘텐츠 스냅샷(localStorage)을 넣어준다(같은 오리진 허용).
         이게 없으면 미리보기가 '헤더만 있는 검은 카드'다(에뮬레이터 실측). */
      f.addEventListener("load", () => {
        try {
          const SNAP_SLOT = { index: "best-list", predict: "marketList", trend: "app", mypage: "app", dm: "dm-page-host" };
          const cid = SNAP_SLOT[key];
          const c = cid && f.contentDocument && f.contentDocument.getElementById(cid);
          const h = localStorage.getItem("galla_snap_" + key);
          if (c && h) c.innerHTML = h;
        } catch (_) {}
      });
      pvFrames[key] = f;
      peek.appendChild(f);
    };
    /* 이웃 탭 미리보기 선(先)로딩 — 드래그 시작 후에 만들면 폰 네트워크에선
       그릴 시간이 없어 '검은 카드'만 보인다(에뮬레이터 프레임 실측로 확정).
       페이지가 자리잡은 뒤 유휴 시점에 좌우 이웃을 미리 만들어 둔다. */
    setTimeout(() => {
      const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 400));
      idle(() => {
        warm(PAGE_ORDER[curIdx + 1]); warm(PAGE_ORDER[curIdx - 1]);
        ensureFrame(PAGE_ORDER[curIdx + 1]);
        ensureFrame(PAGE_ORDER[curIdx - 1]);
        /* 레이아웃 선(先)수행 — display:none 상태의 iframe은 로드만 되고 레이아웃이
           안 된다. 그 비용이 '첫 드래그' 중에 터지면 제스처 프레임을 먹어
           커밋 판정 미달 → 스냅백(사장님 재현: 첫 스와이프 튕기고 두 번째 성공).
           보이지 않게(prewarm=visibility:hidden) 미리 펼쳐 레이아웃까지 끝내둔다. */
        peek.classList.add("prewarm");
        for (const k in pvFrames) pvFrames[k].style.display = "block";
        setTimeout(() => peek.classList.remove("prewarm"), 600);
      });
    }, 2200);
    const showPeek = (key) => {
      const m = metaOf(key);
      pvLabel.innerHTML = m.icon ? `<img src="${m.icon}" alt=""><span>${m.name}</span>` : `<span>${m.name}</span>`;
      ensureFrame(key);
      for (const k in pvFrames) pvFrames[k].style.display = (k === key) ? "block" : "none";
    };
    const hidePeekFrames = () => {
      pvLabel.innerHTML = "";
      for (const k in pvFrames) pvFrames[k].style.display = "none";
    };

    let sx = 0, sy = 0, dxCur = 0, lastX = 0, lastT = 0, vel = 0;
    let armed = false, locked = false, dir = 0, targetKey = null;

    // 드래그가 수평으로 확정되는 순간 목적지를 미리 받아둔다(prefetch 캐시) —
    // 손을 떼고 이동할 때 네트워크 공백이 줄어 전환이 이어져 보인다.
    const warmed = new Set();
    const warm = (key) => {
      const url = PAGE_URL[key];
      if (!url || warmed.has(url)) return;
      warmed.add(url);
      const l = document.createElement("link");
      l.rel = "prefetch"; l.as = "document"; l.href = url;
      document.head.appendChild(l);
    };

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

    let committing = false; // 커밋(이동 발동) 후 — 새 제스처가 끼어들지 못하게
    window.addEventListener("pageshow", () => { committing = false; });
    document.addEventListener("touchstart", (e) => {
      if (committing) { armed = false; return; }   // 이동 진행 중 — 중복 제스처 무시
      /* 잔류 상태 청소 — 멀티터치·시스템 제스처로 끝맺음(touchend)이 유실되면
         스테이지가 어중간히 밀린 채 남아 '멈춤'으로 보인다(사장님 재현).
         새 제스처가 시작되는 순간 무전환으로 원위치시켜 항상 깨끗하게 출발. */
      if (!locked && stage.style.transform) {
        stage.style.transition = "none"; peek.style.transition = "none";
        stage.style.transform = ""; peek.style.transform = "";
        setDrag(false);
        requestAnimationFrame(() => { stage.style.transition = ""; peek.style.transition = ""; });
      }
      if (e.touches.length !== 1) { armed = false; return; }
      armed = !inHScroll(e.target) && !overlayOpen();
      locked = false; dir = 0; dxCur = 0; vel = 0;
      sx = e.touches[0].clientX; sy = e.touches[0].clientY;
      lastX = sx; lastT = performance.now();
    }, { passive: true });

    document.addEventListener("touchmove", (e) => {
      if (!armed || e.touches.length !== 1) return;
      /* ⚠️ 스와이프는 '누르는 순간' 무장된다. 조그셔틀은 380ms 뒤에 열리므로
         touchstart의 overlayOpen() 검사만으론 늦다 — 이동 중에도 확인해
         메뉴가 열렸으면 즉시 손을 뗀다(페이지가 같이 밀려 고르기 힘들었다). */
      if (document.getElementById('nav-jog') || document.querySelector('.tab-item.reordering')) { reset(); return; }
      const x = e.touches[0].clientX, y = e.touches[0].clientY;
      const dx = x - sx, dy = y - sy;

      if (!locked) {
        if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) { armed = false; return; } // 세로 스크롤 양보
        if (Math.abs(dx) < 14 || Math.abs(dx) < Math.abs(dy) * 1.4) return;              // 수평 의도 확정 전
        // 수평 드래그 시작
        dir = dx < 0 ? 1 : -1;
        targetKey = PAGE_ORDER[curIdx + dir] || null;
        if (targetKey) {
          warm(targetKey);
          showPeek(targetKey);
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
          warm(targetKey);
          showPeek(targetKey);
        } else hidePeekFrames();
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
        // ⚠️ 도착 슬라이드-인(구 galla_swipe_in)은 폐지 — 새 페이지가 첫 페인트에
        // 검게 젖힌 상태로 떠서 '검은 화면 후 로딩'으로 보였다(사장님 재현).
        // 대신 미리보기 프레임이 화면을 다 채운 '마지막 그림'을 브라우저의
        // 페인트 홀딩이 다음 페이지 첫 페인트까지 유지 → 같은 골격끼리 이어져
        // 이음새가 사라진다. 애니메이션이 끝난 뒤(280ms) 이동해야 이 그림이 완성된다.
        const url = PAGE_URL[targetKey];
        committing = true;
        /* 이동은 고정 타이머가 아니라 '밀어내기 애니메이션이 실제로 끝난 순간'에.
           타이머(280ms)로 쏘면 기기가 버벅여 애니메이션이 늦을 때 어중간한
           프레임에서 화면이 동결된다(에뮬레이터 연속 스와이프 녹화로 재현 —
           사장님의 '중간에 멈춤'). transitionend면 마지막 프레임이 항상
           '미리보기가 화면을 다 채운 완성 상태'다. */
        let went = false;
        // 스와이프 탭 전환도 replace(탭끼리 히스토리 안 쌓음 — 클릭과 동일 규칙)
        const go = () => { if (went) return; went = true; location.replace(url); };
        stage.addEventListener("transitionend", go, { once: true });
        setTimeout(go, 600);   // transitionend 유실 폴백
        // 이동 재시도 세이프가드 — 발동이 씹히거나 지연되면 한 번 더 민다
        setTimeout(() => { if (!document.hidden && committing) location.replace(url); }, 1800);
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
    "#dm-root.open:not(.page), .wh-sheet.open, .shop-sheet.open, .noti-drawer.open, " +
    "#mpQuickView.open, #createModal:not([hidden]), #plaza-write-modal:not(.hidden), #nav-jog"
  ) || document.body.classList.contains("dm-detail");

  // ⚠️ DM 페이지 제외: 문서가 스크롤 잠금 상태라 항상 scrollTop 0 → 어느 탭에서 당겨도
  //    전역 PTR이 발동해 location.reload() → 기본 탭(채팅)으로 튕겼다.
  //    DM은 목록마다 자체 당겨서 새로고침이 있으므로 전역은 끈다.
  const isDmPage = () => document.body.dataset.page === "dm";
  document.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1 || !bar || overlayOpen() || isDmPage() || scroller().scrollTop > 0) { pulling = false; return; }
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
