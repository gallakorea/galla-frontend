/* ═══════════════════════════════════════════════════════════════
 * GALLA SPA 라우터 — 단일문서(app.html) 클라이언트 라우팅.
 *
 * 구조:
 *  · 탭 5개(index/predict/dm/trend/mypage) = keep-alive 판(#tab-track 슬라이드,
 *    언마운트 없음 → 스크롤·상태 보존, 기존 iframe 셸의 '전환 즉시'를 계승)
 *  · 상세(issue, plaza_detail, …) = 탭 위 스택 push(#stack-root, 우→좌 슬라이드,
 *    뒤로가기 = pop). history는 hash(#/…)로 동기화 — 정적 호스팅에서 서버 설정 불필요.
 *
 * 라우트 문법:
 *  · #/index …탭            · #/issue?id=123 …스택(파일명 = issue.html)
 *
 * 페이지 로직은 P1+에서 js/spa/views/<name>.js 모듈(mount/unmount)로 붙는다.
 * 아직 모듈이 없는 페이지는 #app 정적 콘텐츠만 표시(골격 검증용).
 * ═══════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const TABS = ["index", "predict", "dm", "trend", "mypage"];
  const TAB_URL = { index: "index.html", predict: "galla-predict.html", dm: "dm.html", trend: "search.html", mypage: "mypage.html" };
  const GATED = { dm: 1, mypage: 1 };   // 로그인 필수 탭(기존 셸 정책 계승)

  const L = window.GALLA_SPA_LOADER;
  const track = document.getElementById("tab-track");
  const stackRoot = document.getElementById("stack-root");
  const panes = {};
  document.querySelectorAll(".tab-pane").forEach(p => panes[p.dataset.tab] = p);
  const W = () => window.innerWidth;

  let cur = 0;                       // 현재 탭 인덱스
  const stack = [];                  // push된 상세 뷰 [{el, name, mod}]
  let overlay = null;                // 탭 위에 뜬 단일 모달(글쓰기 compose 등)의 뒤로가기 관리 {el, hide, obs}

  /* ═══ 🔇 전역 오디오 거버너 — 활성 표면(현재 탭 또는 최상단 스택) 밖의 미디어는 절대 재생 금지.
     keep-alive 판이라 화면 밖 홈 영상이 살아있고, 무언가 video.play()를 부르면 소리가 새던 것(사장님
     재현: "페이지 이동 중/기능 누르면 소리 재생")을 HTMLMediaElement.play 훅으로 원천 차단한다. ═══ */
  function activeSurface() {
    if (stack.length) return stack[stack.length - 1].el;   // 스택이 덮여 있으면 그게 유일 활성
    return panes[TABS[cur]] || null;
  }
  function pauseOutside() {
    const surf = activeSurface();
    document.querySelectorAll("#tab-track video, #tab-track audio, #stack-root video, #stack-root audio").forEach(m => {
      if (!surf || !surf.contains(m)) { try { m.pause(); } catch (_) {} }
    });
  }
  (function hookPlay() {
    const proto = window.HTMLMediaElement && HTMLMediaElement.prototype;
    if (!proto || proto.__gallaPlayHooked) return;
    proto.__gallaPlayHooked = true;
    const orig = proto.play;
    proto.play = function () {
      try {
        const surf = activeSurface();
        // 셸 밖(통화 UI 등 #tab-track/#stack-root 외부)은 간섭 안 함. 표면 안이면 허용, 밖이면 차단.
        const inShell = this.closest && (this.closest("#tab-track") || this.closest("#stack-root"));
        if (inShell && surf && !surf.contains(this)) {
          try { this.pause(); } catch (_) {}
          return Promise.reject(new DOMException("blocked by GALLA audio governor", "AbortError"));
        }
      } catch (_) {}
      return orig.apply(this, arguments);
    };
  })();

  function isLoggedIn() {
    try { return !!localStorage.getItem("sb-bidqauputnhkqepvdzrr-auth-token"); } catch (_) { return true; }
  }

  /* ── 탭 콘텐츠 로드(1회, keep-alive) ───────────────────────── */
  const tabReady = {};
  const tabMountP = {};   // tab → mount 완료 프로미스(compose가 '진짜 마운트 끝'까지 기다리게)
  // ⚠️ 반환값이 '실제 mount 완료 프로미스'여야 한다. 예전엔 tabReady 가드로 즉시 return 해서
  //    compose()가 mount(특히 GALLA_composerRescan)보다 먼저 opener를 호출 → 모달이 관찰자
  //    부착 전에 열려 페이지화 실패(광장 헤더 없음·뒤로가기 깨짐)했다.
  function ensureTab(tab) {
    if (tabReady[tab]) return tabMountP[tab] || Promise.resolve();
    tabReady[tab] = true;
    const pane = panes[tab];
    pane.innerHTML = '<div class="pane-wait"><i></i></div>';
    tabMountP[tab] = (async () => {
      try {
        const v = await L.fetchView(TAB_URL[tab] + "?spa=1");
        L.injectStyles(v.styles);
        const host = document.createElement("div");
        host.className = "view-host";
        host.dataset.page = v.dataPage || tab;
        host.innerHTML = v.app;
        pane.innerHTML = "";
        pane.appendChild(host);
        const mod = await L.loadViewModule(tab);
        if (mod && mod.mount) await mod.mount(host, {});
        pane._mod = mod;
      } catch (e) {
        pane.innerHTML = '<div class="pane-err">불러오지 못했어요<br><small>' + (e && e.message || "") + "</small></div>";
        tabReady[tab] = false;   // 재시도 가능
        tabMountP[tab] = null;
      }
    })();
    return tabMountP[tab];
  }

  /* ── 탭 전환(슬라이드) ─────────────────────────────────────── */
  function place(px, anim) {
    track.classList.toggle("anim", !!anim);
    track.style.transform = "translateX(" + px + "px)";
  }
  // 정착 상태는 dvw 단위 — 창 크기가 바뀌어도(회전·데스크톱 리사이즈) 판이 어긋나지 않는다.
  function settle(anim) {
    track.classList.toggle("anim", !!anim);
    track.style.transform = "translateX(" + (-cur * 100) + "dvw)";
  }
  const baseX = () => -cur * W();

  function paintNav() {
    document.querySelectorAll(".nav-item").forEach(it => {
      const on = it.dataset.page === TABS[cur];
      it.classList.toggle("active", on);
      const img = it.querySelector("img");
      if (img && img.dataset.base) img.src = on ? img.dataset.active : img.dataset.base;
    });
    const inner = document.querySelector(".nav-inner");
    if (inner) {
      let g = document.getElementById("nav-glider");
      if (!g) { g = document.createElement("i"); g.id = "nav-glider"; inner.appendChild(g); }
      const act = inner.querySelector('.nav-item[data-page="' + TABS[cur] + '"]');
      if (act) {
        g.style.transform = "translateX(" + (act.offsetLeft + act.offsetWidth / 2 - 28) + "px)";
        g.style.opacity = "1";
      }
    }
  }

  function activateTab(idx, opts) {
    opts = opts || {};
    idx = Math.max(0, Math.min(TABS.length - 1, idx));
    const tab = TABS[idx];
    if (GATED[tab] && !isLoggedIn()) { push("login", { next: tab }); return; }   // 문서 유지 — 로그인 뷰 push(성공 시 next 탭으로)
    const prev = cur;
    cur = idx;
    ensureTab(tab);
    settle(opts.anim !== false);
    paintNav();
    try { history.replaceState(null, "", "#/" + tab); } catch (_) {}
    // 활성/비활성 훅(P1: 릴스 정지·정렬 초기화 등) — postMessage 대신 직접 호출
    if (prev !== cur) {
      const pm = panes[TABS[prev]] && panes[TABS[prev]]._mod;
      if (pm && pm.deactivate) { try { pm.deactivate(); } catch (_) {} }
    }
    pauseOutside();   // 🔇 활성 표면 밖 미디어 전부 정지(거버너)
    const cm = panes[tab] && panes[tab]._mod;
    if (cm && cm.activate) { try { cm.activate(); } catch (_) {} }
    if (prev !== cur && window.GALLA_SPA_chromeReset) window.GALLA_SPA_chromeReset();   // 축소 상태 잔류 방지
    // 이웃 예열
    setTimeout(() => {
      const n1 = TABS[cur + 1], n0 = TABS[cur - 1];
      if (n1 && !(GATED[n1] && !isLoggedIn())) ensureTab(n1);
      if (n0 && !(GATED[n0] && !isLoggedIn())) ensureTab(n0);
    }, 600);
  }

  /* ── 스택 push/pop(상세 뷰) ────────────────────────────────── */
  async function push(name, params, opts) {
    opts = opts || {};
    const url = name + ".html" + qs(params);
    const layer = document.createElement("div");
    layer.className = "stack-view";
    layer.innerHTML = '<div class="pane-wait"><i></i></div>';
    stackRoot.appendChild(layer);
    stackRoot.classList.add("on");
    // 우→좌 슬라이드 인 — rAF가 동결(백그라운드 탭·과부하)돼도 반드시 붙게 setTimeout 폴백.
    // (안 붙으면 상세가 translateX(100%)로 화면 밖에 남아 '안 열림'처럼 보인다)
    requestAnimationFrame(() => layer.classList.add("in"));
    setTimeout(() => layer.classList.add("in"), 60);
    armStackSwipe(layer);                                     // 엣지 드래그 백(인스타식)
    // 🔇 상세가 덮으면 가려지는 탭 모듈 비활성 + 표면 밖 미디어 전부 정지
    if (!stack.length) {
      const cp = panes[TABS[cur]];
      if (cp && cp._mod && cp._mod.deactivate) { try { cp._mod.deactivate(); } catch (_) {} }
    }
    const entry = { el: layer, name, mod: null };
    stack.push(entry);
    pauseOutside();
    if (!opts.silent) { try { history.pushState(null, "", "#/" + name + qs(params)); } catch (_) {} }
    try {
      const v = await L.fetchView(url.indexOf("?") === -1 ? url + "?spa=1" : url + "&spa=1");
      L.injectStyles(v.styles);
      const host = document.createElement("div");
      host.className = "view-host";
      host.dataset.page = v.dataPage || name;
      host.innerHTML = v.app;
      layer.innerHTML = "";
      layer.appendChild(host);
      const mod = await L.loadViewModule(name);
      if (mod && mod.mount) await mod.mount(host, params || {});
      entry.mod = mod;
    } catch (e) {
      layer.innerHTML = '<div class="pane-err">불러오지 못했어요<br><small>' + (e && e.message || "") + "</small></div>";
    }
  }

  function pop(opts) {
    opts = opts || {};
    const entry = stack.pop();
    if (!entry) return false;
    if (entry.mod && entry.mod.unmount) { try { entry.mod.unmount(); } catch (_) {} }
    pauseOutside();   // 🔇 pop된 상세의 미디어 정지(표면이 아래 탭/스택으로 바뀜)
    if (opts.instant) {
      // 브라우저 뒤로가기 제스처(popstate)발 — Safari가 이미 스냅샷 슬라이드를 보여준 뒤라
      // 우리 애니를 또 돌리면 '두 번 미끄러지거나 튀는' 느낌. 즉시 제거.
      entry.el.remove();
      if (!stack.length) stackRoot.classList.remove("on");
    } else {
      entry.el.classList.remove("in");
      entry.el.style.transform = "";   // 제스처 드래그 잔여 inline 제거 → 클래스 전환으로 슬라이드 아웃
      setTimeout(() => {
        entry.el.remove();
        if (!stack.length) stackRoot.classList.remove("on");
      }, 300);
    }
    if (!opts.silent) { try { history.back(); return true; } catch (_) {} }
    return true;
  }

  /* ── 스택 엣지 스와이프 백 — 인스타식: 좌측 엣지에서 끌면 뷰가 손가락을 따라오고,
     1/3 이상·빠른 플릭이면 닫힘, 아니면 스프링 복귀. (네이티브 웹뷰엔 브라우저 제스처가
     없어 이게 유일한 제스처 백 — '바로 튀는 느낌'의 해결) */
  function armStackSwipe(layer) {
    let sx = 0, sy = 0, dx = 0, lock = null, lastX = 0, lastT = 0, vel = 0;
    layer.addEventListener("touchstart", (e) => {
      const t = e.touches[0];
      if (t.clientX > 28) { lock = "no"; return; }   // 좌측 엣지에서만 시작
      sx = lastX = t.clientX; sy = t.clientY; dx = 0; vel = 0; lock = null;
      lastT = performance.now();
    }, { passive: true });
    layer.addEventListener("touchmove", (e) => {
      if (lock === "no") return;
      const t = e.touches[0];
      const mx = t.clientX - sx, my = t.clientY - sy;
      if (lock === null) {
        if (Math.abs(mx) < 6 && Math.abs(my) < 6) return;
        lock = (mx > 0 && Math.abs(mx) > Math.abs(my) * 1.2) ? "h" : "no";
        if (lock === "no") return;
        layer.style.transition = "none";
      }
      dx = Math.max(0, mx);
      const now = performance.now();
      vel = (t.clientX - lastX) / Math.max(1, now - lastT);
      lastX = t.clientX; lastT = now;
      layer.style.transform = "translateX(" + dx + "px)";
    }, { passive: true });
    layer.addEventListener("touchend", () => {
      if (lock !== "h") { lock = null; return; }
      lock = null;
      layer.style.transition = "";
      const commit = dx > W() * 0.32 || vel > 0.45;
      if (commit && stack.length && stack[stack.length - 1].el === layer) {
        // 현 위치에서 이어서 화면 밖으로 — 손가락 흐름 그대로 자연스럽게
        layer.style.transform = "translateX(100%)";
        const entry = stack.pop();
        if (entry.mod && entry.mod.unmount) { try { entry.mod.unmount(); } catch (_) {} }
        setTimeout(() => {
          entry.el.remove();
          if (!stack.length) stackRoot.classList.remove("on");
        }, 300);
        try { history.back(); } catch (_) {}
      } else {
        layer.style.transform = "";   // 스프링 복귀(클래스 .in의 0 위치로 전환)
      }
    }, { passive: true });
  }

  function qs(params) {
    if (!params) return "";
    const s = new URLSearchParams(params).toString();
    return s ? "?" + s : "";
  }

  /* ── 해시 → 라우트 해석 ────────────────────────────────────── */
  function parseHash() {
    const h = (location.hash || "").replace(/^#\/?/, "");
    const [path, query] = h.split("?");
    const params = {};
    if (query) new URLSearchParams(query).forEach((v, k) => params[k] = v);
    return { path: path || "index", params };
  }

  function applyRoute(fromPop) {
    const { path, params } = parseHash();
    // mypage?user=… 는 '남의 프로필' — 탭(내 마이)이 아니라 스택 뷰로(params 보존).
    const asStack = (path === "mypage" && params.user);
    if (TABS.indexOf(path) !== -1 && !asStack) {
      // 탭 라우트 — 스택이 쌓여 있으면(뒤로가기로 탭에 옴) 다 걷는다.
      // popstate발이면 맨 위 한 장만 슬라이드(이중 애니 방지: 브라우저 제스처면 이미 미끄러졌음),
      // 나머지는 즉시 제거.
      if (fromPop && stack.length === 1 && !recentEdge()) pop({ silent: true });
      else while (stack.length) pop({ silent: true, instant: fromPop ? recentEdge() : true });
      activateTab(TABS.indexOf(path), { anim: !fromPop });
    } else {
      // 스택 라우트 — popstate로 왔고 마지막 스택과 같으면 무시(이미 표시 중)
      const top = stack[stack.length - 1];
      if (top && top.name === path) return;
      // 뒤로가기로 스택이 줄어드는 경우 — 맨 위 한 장은 슬라이드, 그 아래는 즉시
      if (fromPop && stack.length && stack.some(s => s.name === path)) {
        let first = !recentEdge();   // 제스처발이면 첫 장도 instant(이미 미끄러졌음)
        while (stack.length && stack[stack.length - 1].name !== path) {
          pop({ silent: true, instant: !first });
          first = false;
        }
        return;
      }
      push(path, params, { silent: true });
    }
  }

  // 브라우저/웹뷰의 '엣지 뒤로가기 제스처' 감지 — 좌측 엣지 터치 직후의 popstate는 이미
  // 네이티브 스냅샷이 미끄러진 뒤라 우리 애니를 생략(instant). 버튼·JS back은 애니 유지.
  let edgeTouchAt = 0;
  document.addEventListener("touchstart", (e) => {
    const t = e.touches && e.touches[0];
    if (t && t.clientX < 30) edgeTouchAt = Date.now();
  }, { capture: true, passive: true });
  const recentEdge = () => Date.now() - edgeTouchAt < 900;

  window.addEventListener("popstate", () => {
    // 오버레이(compose 모달)가 떠 있으면 뒤로가기는 '모달 닫기'로 소비 — 라우팅 안 함.
    if (overlay) { const o = overlay; overlay = null; try { o.obs.disconnect(); } catch (_) {} try { o.hide && o.hide(); } catch (_) {} return; }
    applyRoute(true);
  });

  /* ── 탭 스와이프(직접 터치 — iframe 중계 불필요) ───────────── */
  (function swipe() {
    let sx = 0, sy = 0, dx = 0, lock = null, t0 = 0, lastX = 0, lastT = 0, vel = 0, hGuard = false;
    const EDGE_GUARD = 24;   // 좌측 엣지는 시스템 뒤로가기와 충돌 방지
    /* 가로 스크롤 영역(카테고리 칩 행·서브탭·캐러셀·입력) 위 제스처는 탭 스와이프에서 제외 —
       안 그러면 카테고리를 좌우로 밀 때 탭이 통째로 넘어가 카테고리를 못 고른다(사장님).
       알려진 칩 행은 클래스로, 그 외 가로 스크롤러는 overflow-x 감지로 확실히 커버. */
    const HROW_SEL = ".chip-scroll, .news-category-chips, .hv-cats, .cat-chips, .plaza-categories, .hv-mode, .tabs-header, .dm-tabs, .carousel-wrap";
    function inHScroll(el) {
      for (let n = el; n && n !== document.body && n.nodeType === 1; n = n.parentElement) {
        const tag = n.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "VIDEO" || n.isContentEditable) return true;
        if (n.classList && n.matches && n.matches(HROW_SEL)) return true;
        try { const s = getComputedStyle(n); if ((s.overflowX === "auto" || s.overflowX === "scroll") && n.scrollWidth > n.clientWidth + 2) return true; } catch (_) {}
      }
      return false;
    }
    track.addEventListener("touchstart", (e) => {
      hGuard = false;
      if (stack.length) return;                     // 상세 스택 위에선 탭 스와이프 안 함
      // DM 상세(대화방·설정 등)에선 탭 스와이프 끔 — 구 iframe 셸 정책 계승
      // (dm.js의 스와이프 백·말풍선 제스처와 충돌해 판 전체가 끌려가던 것 방지)
      if (document.body.classList.contains("dm-detail")) return;
      hGuard = inHScroll(e.target);                 // 가로 스크롤러 위면 이 제스처는 탭 전환 금지
      const t = e.touches[0];
      sx = lastX = t.clientX; sy = t.clientY; dx = 0; lock = null; vel = 0;
      t0 = lastT = performance.now();
    }, { passive: true });
    track.addEventListener("touchmove", (e) => {
      // dm-detail 중엔 start가 안 돌아 sx가 이전 제스처 값 — 여기서도 막아야 오계산 잠금이 없다
      if (stack.length || hGuard || document.body.classList.contains("dm-detail")) return;
      const t = e.touches[0];
      const mx = t.clientX - sx, my = t.clientY - sy;
      if (lock === null) {
        if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
        lock = Math.abs(mx) > Math.abs(my) * 1.2 ? "h" : "v";
        if (lock === "h" && sx < EDGE_GUARD) lock = "v";
      }
      if (lock !== "h") return;
      dx = mx;
      const now = performance.now();
      vel = (t.clientX - lastX) / Math.max(1, now - lastT);
      lastX = t.clientX; lastT = now;
      let d = dx;
      if ((cur === 0 && d > 0) || (cur === TABS.length - 1 && d < 0)) d *= 0.28;   // 고무줄
      place(baseX() + d, false);
    }, { passive: true });
    track.addEventListener("touchend", () => {
      if (stack.length || lock !== "h") { lock = null; return; }
      const commit = Math.abs(dx) > W() * 0.26 || Math.abs(vel) > 0.38;
      if (commit && dx < 0 && cur < TABS.length - 1) activateTab(cur + 1);
      else if (commit && dx > 0 && cur > 0) activateTab(cur - 1);
      else settle(true);
      lock = null;
    }, { passive: true });
  })();

  /* ── 네비 클릭(재탭 = 맨위로) ──────────────────────────────── */
  document.querySelectorAll(".nav-item").forEach(it =>
    it.addEventListener("click", () => {
      const idx = TABS.indexOf(it.dataset.page);
      if (idx === -1) return;
      if (stack.length) { while (stack.length) pop({ silent: true }); try { history.replaceState(null, "", "#/" + TABS[idx]); } catch (_) {} }
      if (idx === cur) {
        const mod = panes[TABS[cur]] && panes[TABS[cur]]._mod;
        if (mod && mod.scrolltop) { try { mod.scrolltop(); } catch (_) {} }
        else { const h = panes[TABS[cur]].querySelector(".view-host"); if (h) h.scrollTo({ top: 0, behavior: "smooth" }); }
      } else activateTab(idx);
    }));

  /* ── 링크 가로채기 — 문서 내 상대 .html 링크를 라우트로 ────── */
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href]");
    if (!a) return;
    const href = a.getAttribute("href") || "";
    if (/^([a-z]+:)?\/\//i.test(href) || href.startsWith("#") || a.target === "_blank") return;
    const m = href.match(/^\.?\/?([a-z0-9_-]+)\.html(?:\?(.*))?$/i);
    if (!m) return;
    e.preventDefault();
    const name = m[1];
    const params = {};
    if (m[2]) new URLSearchParams(m[2]).forEach((v, k) => params[k] = v);
    // mypage?user=… 는 남의 프로필 → 스택 push(params 보존). 그 외 탭은 탭 전환.
    if (name === "mypage" && params.user) push("mypage", params);
    else if (TABS.indexOf(name) !== -1) activateTab(TABS.indexOf(name));
    else if (name === "search") activateTab(TABS.indexOf("trend"));
    else push(name, params);
  });

  window.addEventListener("resize", () => settle(false));

  /* ── ⌨️ 전역 키보드 리프트 — SPA에선 컴포저가 transform된 판/스택 안 fixed라 iOS의
     '키보드 위 자동 추적'이 안 먹어 입력창이 키보드에 가린다(유튜브·뉴스·댓글 등 모든 컴포저).
     포커스된 입력의 '하단 고정 조상'을 찾아 키보드 높이만큼 밀어 올린다(배틀 컴포저 전용 로직의 일반화). */
  (function keyboardLift() {
    const vv = window.visualViewport;
    if (!vv) return;
    let lifted = null;
    function fixedBar(el) {
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if ((cs.position === "fixed" || cs.position === "sticky" || cs.position === "absolute") &&
            (cs.bottom === "0px" || parseFloat(cs.bottom) === 0)) return n;
      }
      return null;
    }
    function kbH() { return Math.max(0, window.innerHeight - vv.height - vv.offsetTop); }
    // 키보드 감지: iOS/adjustPan은 visualViewport 갭, Android adjustResize는 innerHeight 축소로 잡는다.
    let baseH = window.innerHeight;
    function kbOpen() {
      const gap = kbH();                                  // iOS/pan
      const shrink = baseH - window.innerHeight;          // android adjustResize
      return gap > 80 || shrink > 150;
    }
    function apply() {
      // 🔑 키보드 열리면 하단 네비 숨김 — fixed 네비가 키보드 위로 떠올라 콘텐츠 가리던 것(전 페이지 공통)
      document.body.classList.toggle("kb-up", kbOpen());
      if (!lifted) return;
      const kb = kbH();
      lifted.style.transform = kb > 0 ? "translateY(-" + kb + "px)" : "";
      lifted.style.transition = "transform .18s ease";
    }
    function reset() { document.body.classList.remove("kb-up"); if (lifted) { lifted.style.transform = ""; lifted = null; } }
    // 상단 앵커 입력창(트렌드 검색 등)은 키보드가 뜨면 iOS가 내부 스크롤을 어긋나게 밀어
    // 입력창이 화면 위로 사라진다 → 포함 스크롤 컨테이너를 직접 굴려 확실히 보이게 한다.
    function scrollerOf(el) {
      for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 4) return n;
      }
      return null;
    }
    function ensureVisible(t) {
      const sc = scrollerOf(t); if (!sc) return;
      const r = t.getBoundingClientRect();
      const visTop = 84 + (parseFloat(getComputedStyle(document.body).paddingTop) || 0); // 헤더+탭바 여유
      const visBottom = (window.innerHeight - kbH()) - 12;
      if (r.top < visTop) sc.scrollTop -= (visTop - r.top) + 8;
      else if (r.bottom > visBottom) sc.scrollTop += (r.bottom - visBottom) + 8;
    }
    // 회전 등으로 커진 높이는 기준 갱신(키보드로 줄어든 값은 기준에서 제외)
    window.addEventListener("resize", () => { if (window.innerHeight > baseH) baseH = window.innerHeight; setTimeout(apply, 0); });
    // 입력 포커스 = 키보드 올라옴 → kb-up(네비 숨김). IME resize/pan 모드와 무관하게 확실.
    function isField(t) { return t && (/^(INPUT|TEXTAREA)$/.test(t.tagName) || t.isContentEditable); }
    document.addEventListener("focusin", (e) => {
      const t = e.target;
      if (!isField(t)) return;
      document.body.classList.add("kb-up");
      // 배틀 컴포저는 자체 로직(dm/issue)이 처리 — lift 중복 방지
      if (t.id === "battle-comment-input" || t.id === "ic-input" || t.closest(".dm-panel")) return;
      const bar = fixedBar(t);
      if (bar) { lifted = bar; setTimeout(apply, 80); setTimeout(apply, 320); }
      else { setTimeout(() => ensureVisible(t), 340); setTimeout(() => ensureVisible(t), 560); }
    });
    document.addEventListener("focusout", () => setTimeout(() => {
      // 다른 입력으로 옮겨간 게 아니면 키보드 내려감
      if (!isField(document.activeElement)) reset();
    }, 120));
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
  })();

  /* ── 스크롤 크롬 엔진 — nav.js(MPA)의 헤더 숨김·네비 축소를 SPA로 이식.
     문서 캡처 리스너 하나로 모든 스크롤러(.view-host·내부 패널)를 받는다.
     · y≤10: 헤더 완전 복원(로고 포함) + 네비 원래 크기
     · 아래로(dy>4, y>60): 헤더 숨김(.hdr-hidden) + 네비 축소(.nav--mini)
     · 위로(dy<-4): 헤더 표시 + 네비 복원
     · DM 판은 제외(내부 탭바와 겹침 — 기존 정책 계승) */
  (function scrollChrome() {
    const navEl = document.querySelector("nav.nav");
    const innerLast = new WeakMap();
    let ticking = false, pendingEvt = null;
    function hostOf(t) {
      return (t && t.nodeType === 1 && t.closest) ? t.closest(".view-host") : null;
    }
    // rAF + 타임아웃 폴백 — 백그라운드(문서 hidden)에서도 멈추지 않게
    const frame = (fn) => { let done = false; const run = () => { if (done) return; done = true; fn(); };
      requestAnimationFrame(run); setTimeout(run, 50); };
    document.addEventListener("scroll", (e) => {
      pendingEvt = e;
      if (ticking) return;
      ticking = true;
      frame(() => {
        ticking = false;
        const t = pendingEvt && pendingEvt.target;
        const el = (t && t.nodeType === 1 && t.scrollHeight > t.clientHeight + 1) ? t : null;
        if (!el) return;
        const host = hostOf(el);
        if (host && host.dataset.page === "dm") return;   // DM은 헤더 고정(기존 정책)
        const hdrEl = host ? host.querySelector("header.header") : null;
        const y = el.scrollTop;
        if (!innerLast.has(el)) innerLast.set(el, y);     // 첫 목격 시딩(dy=0 고착 방지)
        const dy = y - innerLast.get(el);
        if (y <= 10) {
          navEl && navEl.classList.remove("nav--mini");
          if (hdrEl) hdrEl.classList.remove("hdr-scrolled", "hdr-hidden", "hdr-nologo");
          innerLast.set(el, y);
          return;
        }
        if (hdrEl) { hdrEl.classList.add("hdr-scrolled"); hdrEl.classList.add("hdr-nologo"); }
        if (Math.abs(dy) > 4) {
          if (dy > 0 && y > 60) {
            navEl && navEl.classList.add("nav--mini");
            hdrEl && hdrEl.classList.add("hdr-hidden");
          } else if (dy < 0) {
            navEl && navEl.classList.remove("nav--mini");
            hdrEl && hdrEl.classList.remove("hdr-hidden");
          }
          innerLast.set(el, y);
        }
      });
    }, { capture: true, passive: true });
    // 탭 전환 시 크롬 리셋 — 이전 판의 축소 상태가 새 판에 남지 않게
    window.GALLA_SPA_chromeReset = function () {
      navEl && navEl.classList.remove("nav--mini");
      document.querySelectorAll(".view-host header.header").forEach(h => h.classList.remove("hdr-hidden"));
    };
  })();

  /* ── 오버레이(글쓰기 compose 모달) — 탭 위에 뜨는 단일 모달의 뒤로가기 통합 ──
     페이지(galla-predict/plaza)가 모달을 연 직후 openOverlay(el, hide)를 부르면:
       · history 상태를 한 칸 쌓아 '뒤로가기 = 모달 닫기'가 되게 하고(popstate에서 소비),
       · 모달이 자체 버튼/바깥탭/발행성공 등 다른 경로로 닫히면(hidden/class 감시)
         남은 history 상태를 조용히 소모해 스택을 어긋나지 않게 정리한다.
     ⚠️ MPA(웹)에선 composer-page.js가 담당 → 페이지 쪽에서 SPA일 때만 호출. */
  function openOverlay(el, hide) {
    if (!el) return;
    if (overlay) { try { overlay.obs.disconnect(); } catch (_) {} overlay = null; }
    const obs = new MutationObserver(() => {
      const hidden = el.hasAttribute("hidden") || el.classList.contains("hidden");
      if (hidden && overlay && overlay.el === el) {   // 다른 경로로 닫힘 → history만 소모
        overlay = null; try { obs.disconnect(); } catch (_) {}
        try { history.back(); } catch (_) {}
      }
    });
    overlay = { el, hide, obs };
    try { history.pushState({ ov: 1 }, "", location.hash || ("#/" + TABS[cur])); } catch (_) {}
    obs.observe(el, { attributes: true, attributeFilter: ["hidden", "class"] });
  }

  /* ── 글쓰기 compose 진입(예측/광장) — 문서 이탈 없이 SPA 안에서:
     picker(스택) 정리 → 해당 탭 활성·마운트 대기 → 그 탭의 compose 모달 오픈.
     모달은 그 탭 페이지가 openOverlay로 뒤로가기까지 연결한다. */
  async function compose(kind) {
    const MAP = { predict: { tab: "predict", opener: "GALLA_openCompose_predict" },
                  plaza:   { tab: "trend",   opener: "GALLA_openCompose_plaza" } };
    const m = MAP[kind]; if (!m) return;
    // ⚠️ 순서 중요 — '피드 플래시(본페이지로 튐)' 방지:
    //   picker(스택)를 아직 위에 둔 채로 대상 탭을 활성·'진짜 마운트 완료'(rescan=모달 관찰자 부착)까지
    //   기다린 뒤 모달을 연다. 모달은 z:10000(composer-page.css)이라 picker/피드를 즉시 덮는다.
    //   그다음에야 picker를 조용히 제거 → 피드가 노출되는 순간이 없다.
    const ti = TABS.indexOf(m.tab);
    activateTab(ti);
    await ensureTab(m.tab);
    for (let i = 0; i < 40; i++) {                       // opener 등록까지 짧게 재시도(~2s)
      const fn = window[m.opener];
      if (typeof fn === "function") { try { fn(); } catch (_) {} break; }
      await new Promise(r => setTimeout(r, 50));
    }
    await new Promise(r => setTimeout(r, 70));           // 모달이 열려 화면을 덮을 틈
    while (stack.length) pop({ silent: true, instant: true });  // 이제 picker 제거(모달이 덮어 안 보임 → 즉시)
  }

  /* ── 셸 공개 API — 기존 postMessage 프로토콜 대체(직접 호출) ── */
  window.GALLA_SPA = {
    go: (tab) => { const i = TABS.indexOf(tab); if (i === -1) return; while (stack.length) pop({ silent: true }); activateTab(i); },
    push, pop, compose, openOverlay,
    navMini: (on) => { const n = document.querySelector(".nav"); if (n) n.classList.toggle("nav--mini", !!on); },
    navHide: (on) => { const n = document.querySelector(".nav"); if (n) n.style.display = on ? "none" : ""; },
  };

  /* 🎛 네비 조그셔틀(nav-jog.js) 진입점 — 최상위 탭 전환 + 뷰 로드 후 서브탭 지정.
     조그가 이 함수를 부르면 SPA 안에서 처리(없으면 location.href로 문서 이탈했음 = 조그 먹통의 원인). */
  window.GALLA_shellGo = function (page, tab) {
    const i = TABS.indexOf(page); if (i === -1) return;
    while (stack.length) pop({ silent: true });
    activateTab(i);
    if (!tab) return;
    const setter = page === "dm" ? "GALLA_dmSetTab" : page === "trend" ? "GALLA_trendSetTab" : null;
    if (!setter) return;
    // 뷰 모듈(dm.js/search.js)이 setter를 늦게 정의할 수 있어 짧게 재시도(최대 ~2초)
    let n = 0;
    (function trySet() {
      if (typeof window[setter] === "function") { try { window[setter](tab); } catch (_) {} return; }
      if (n++ < 40) setTimeout(trySet, 50);
    })();
  };

  /* 마이페이지 아이콘 = 프로필 사진(기존 GALLA_setNavAvatar 계승) */
  window.GALLA_setNavAvatar = function (url) {
    const img = document.querySelector('.nav-item[data-page="mypage"] img');
    if (!img) return;
    if (url) {
      img.removeAttribute("data-base"); img.removeAttribute("data-active");
      img.classList.add("nav-avatar");
      img.onerror = function () { this.onerror = null; this.classList.remove("nav-avatar"); this.src = "./assets/icons/nav-user.svg"; };
      if (img.src !== url) img.src = url;
    } else {
      img.classList.remove("nav-avatar");
      img.dataset.base = "./assets/icons/nav-user.svg";
      img.dataset.active = "./assets/icons/nav-user-active.svg";
      img.src = (TABS[cur] === "mypage") ? img.dataset.active : img.dataset.base;
    }
  };
  try { const av = localStorage.getItem("galla_nav_avatar"); if (av) window.GALLA_setNavAvatar(av); } catch (_) {}

  /* ── 부팅 ─────────────────────────────────────────────────── */
  applyRoute(false);
  setTimeout(() => { try { document.dispatchEvent(new Event("galla:ready")); } catch (_) {} }, 400);
})();
