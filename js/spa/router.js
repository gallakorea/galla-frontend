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
  async function ensureTab(tab) {
    if (tabReady[tab]) return;
    tabReady[tab] = true;
    const pane = panes[tab];
    pane.innerHTML = '<div class="pane-wait"><i></i></div>';
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
    }
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

  window.addEventListener("popstate", () => applyRoute(true));

  /* ── 탭 스와이프(직접 터치 — iframe 중계 불필요) ───────────── */
  (function swipe() {
    let sx = 0, sy = 0, dx = 0, lock = null, t0 = 0, lastX = 0, lastT = 0, vel = 0;
    const EDGE_GUARD = 24;   // 좌측 엣지는 시스템 뒤로가기와 충돌 방지
    track.addEventListener("touchstart", (e) => {
      if (stack.length) return;                     // 상세 스택 위에선 탭 스와이프 안 함
      // DM 상세(대화방·설정 등)에선 탭 스와이프 끔 — 구 iframe 셸 정책 계승
      // (dm.js의 스와이프 백·말풍선 제스처와 충돌해 판 전체가 끌려가던 것 방지)
      if (document.body.classList.contains("dm-detail")) return;
      const t = e.touches[0];
      sx = lastX = t.clientX; sy = t.clientY; dx = 0; lock = null; vel = 0;
      t0 = lastT = performance.now();
    }, { passive: true });
    track.addEventListener("touchmove", (e) => {
      // dm-detail 중엔 start가 안 돌아 sx가 이전 제스처 값 — 여기서도 막아야 오계산 잠금이 없다
      if (stack.length || document.body.classList.contains("dm-detail")) return;
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
    function apply() {
      if (!lifted) return;
      const kb = kbH();
      lifted.style.transform = kb > 0 ? "translateY(-" + kb + "px)" : "";
      lifted.style.transition = "transform .18s ease";
    }
    function reset() { if (lifted) { lifted.style.transform = ""; lifted = null; } }
    document.addEventListener("focusin", (e) => {
      const t = e.target;
      if (!t || !/^(INPUT|TEXTAREA)$/.test(t.tagName) && !t.isContentEditable) return;
      // 배틀 컴포저는 자체 로직(dm/issue)이 처리 — 중복 방지
      if (t.id === "battle-comment-input" || t.id === "ic-input" || t.closest(".dm-panel")) return;
      const bar = fixedBar(t);
      if (bar) { lifted = bar; setTimeout(apply, 80); setTimeout(apply, 320); }
    });
    document.addEventListener("focusout", () => setTimeout(reset, 120));
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

  /* ── 셸 공개 API — 기존 postMessage 프로토콜 대체(직접 호출) ── */
  window.GALLA_SPA = {
    go: (tab) => { const i = TABS.indexOf(tab); if (i === -1) return; while (stack.length) pop({ silent: true }); activateTab(i); },
    push, pop,
    navMini: (on) => { const n = document.querySelector(".nav"); if (n) n.classList.toggle("nav--mini", !!on); },
    navHide: (on) => { const n = document.querySelector(".nav"); if (n) n.style.display = on ? "none" : ""; },
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
