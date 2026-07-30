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
  // 📦 네이티브 번들에선 index.html = SPA(app.html)로 대체돼 있다(Capacitor가 리다이렉트 없이 SPA를 바로
  //    로드 → 부팅 깜빡임 제거). 원래 홈피드는 home.html로 보존돼 있으니 홈 탭은 그걸 fetch한다.
  //    웹(galla.im)은 그대로 index.html(홈피드 MPA)을 fetch.
  const _BUNDLE = (location.protocol === "capacitor:") || !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const TAB_URL = { index: _BUNDLE ? "home.html" : "index.html", predict: "galla-predict.html", dm: "dm.html", trend: "search.html", mypage: "mypage.html" };
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

  // 📳 탭 전환 햅틱 — 인스타처럼 판이 넘어가는 순간 '틱'(iOS selectionChanged). GALLA_haptic은 셸(supabase.js)이 정의.
  function hap(k) { try { window.GALLA_haptic && window.GALLA_haptic(k || "selection"); } catch (_) {} }

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
      else if (L.loadPageScripts) await L.loadPageScripts(v.scripts);   // 전용 모듈 없는 페이지: 자체 스크립트 폴백(DCL 캡처)
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
    // onPop: compose 스택은 '이동해온 모달'을 원래 탭으로 되돌린다(슬라이드 아웃 후 실행 → 레이어 제거 직전).
    const finish = () => {
      if (entry.onPop) { try { entry.onPop(); } catch (_) {} }
      entry.el.remove();
      if (!stack.length) stackRoot.classList.remove("on");
    };
    if (opts.instant) {
      // 브라우저 뒤로가기 제스처(popstate)발 — Safari가 이미 스냅샷 슬라이드를 보여준 뒤라
      // 우리 애니를 또 돌리면 '두 번 미끄러지거나 튀는' 느낌. 즉시 제거.
      finish();
    } else {
      entry.el.classList.remove("in");
      entry.el.style.transform = "";   // 제스처 드래그 잔여 inline 제거 → 클래스 전환으로 슬라이드 아웃
      setTimeout(finish, 300);
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
          if (entry.onPop) { try { entry.onPop(); } catch (_) {} }   // ⚠️ compose: 이동한 모달을 원래 탭으로 복원(안 하면 모달 유실→다음 진입 실패)
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
      const commit = Math.abs(dx) > W() * 0.22 || Math.abs(vel) > 0.32;   // 조금 더 잘 걸리게(쫀쫀·반응)
      if (commit && dx < 0 && cur < TABS.length - 1) { hap(); activateTab(cur + 1); }
      else if (commit && dx > 0 && cur > 0) { hap(); activateTab(cur - 1); }
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
      } else { hap(); activateTab(idx); }
    }));

  /* ── [data-back] 버튼 — SPA에서 스택이 있으면 pop(문서 이탈·location.href 금지).
     모든 페이지 뒤로가기가 data-back을 쓰므로(back.js 미로드 페이지 포함) 여기서 일괄 처리.
     capture 단계로 각 페이지/back.js의 자체 핸들러보다 먼저 잡고 소비한다. */
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("[data-back]");
    if (!b || !stack.length) return;    // 스택 없으면 기본(MPA/back.js) 동작에 맡김
    e.preventDefault(); e.stopPropagation();
    pop();
  }, true);

  /* ── 상대 .html 이름을 SPA 라우트로 — 탭이면 탭전환, 남프로필은 스택, 그 외 push ── */
  function navTo(name, params) {
    params = params || {};
    if (name === "mypage" && params.user) return push("mypage", params);
    if (TABS.indexOf(name) !== -1) return activateTab(TABS.indexOf(name));
    if (name === "search") return activateTab(TABS.indexOf("trend"));
    return push(name, params);
  }

  /* 🌐 웹/앱 공용 이동 헬퍼 — 인라인 onclick="location.href='X.html'"을 이걸로 바꿔 SPA 이탈 방지.
     ⚠️ 웹 MPA 안전: body가 'spa'가 아니면(=웹) 무조건 location.href(원래 동작). 앱에서만 라우터로. */
  window.GALLA_nav = function (url) {
    try {
      if (document.body && document.body.dataset.page === "spa") {
        const s = String(url);
        if (!/^([a-z]+:)?\/\//i.test(s) && !s.startsWith("#")) {
          const m = s.match(/^\.?\/?([a-z0-9_-]+)\.html(?:\?(.*))?$/i);
          if (m) { const p = {}; if (m[2]) new URLSearchParams(m[2]).forEach((v, k) => p[k] = v); return navTo(m[1], p); }
        }
      }
    } catch (_) {}
    location.href = url;
  };

  /* ── 링크 가로채기 — 문서 내 상대 .html 링크를 라우트로 ────── */
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href]");
    if (!a) return;
    const href = a.getAttribute("href") || "";
    if (/^([a-z]+:)?\/\//i.test(href) || href.startsWith("#") || a.target === "_blank") return;
    const m = href.match(/^\.?\/?([a-z0-9_-]+)\.html(?:\?(.*))?$/i);
    if (!m) return;
    e.preventDefault();
    const params = {};
    if (m[2]) new URLSearchParams(m[2]).forEach((v, k) => params[k] = v);
    navTo(m[1], params);
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

  /* ── 글쓰기 compose 진입(예측/광장) — write/report와 '동일하게' 스택 뷰로:
     슬라이드 인/아웃 + 뒤로가기=pop(=picker 복귀, 피드 아님).
     ⚠️ 예측/광장 작성폼은 피드페이지 안의 모달(#createModal·#plaza-write-modal)이라 페이지째 push하면
        keep-alive 탭과 ID 충돌(getElementById가 숨은 탭 모달을 잡음). 그래서 '탭의 모달 DOM을
        스택 레이어로 이동'해 재사용한다(핸들러 보존·충돌 없음). pop 시 원래 탭으로 되돌린다.
     모달은 composer-page.css로 전체화면(position:fixed inset:0 → transform 조상=stack-view 기준)
        이라 레이어와 함께 슬라이드한다. composer-page.js는 __stackMode 모달을 무시(자체 헤더/history 안 붙임). */
  const CP_BACK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
  function ensureComposeHeader(modal, boxSel, title) {
    const box = modal.querySelector(boxSel);
    if (!box || box.querySelector(".cp-head")) return;
    const head = document.createElement("div");
    head.className = "cp-head";
    head.innerHTML = '<button type="button" class="cp-back" aria-label="뒤로">' + CP_BACK_SVG + '</button>' +
                     '<span class="cp-title">' + title + '</span><span class="cp-spacer"></span>';
    box.prepend(head);
    // 뒤로가기 = 스택 pop(애니메이션 슬라이드 아웃 + onPop=모달 원위치). history.back+applyRoute를 타면
    // 버튼이 좌상단(clientX<30)이라 '엣지 터치'로 오인돼 instant(슬라이드 없이)로 닫혀 '말썽'이었다.
    head.querySelector(".cp-back").addEventListener("click", () => {
      try { if (stack.length && stack[stack.length - 1].el === modal.closest(".stack-view")) pop(); else history.back(); } catch (_) { try { history.back(); } catch (_) {} }
    });
  }
  async function compose(kind) {
    const MAP = {
      predict: { tab: "predict", modal: "createModal",        box: ".pm-modal-inner",  opener: "GALLA_openCompose_predict", title: "새 예측" },
      plaza:   { tab: "trend",   modal: "plaza-write-modal",  box: ".plaza-modal-box", opener: "GALLA_openCompose_plaza",   title: "광장 글쓰기" },
    };
    const m = MAP[kind]; if (!m) return;

    // 1) 레이어를 '즉시' 만들어 슬라이드 인(스피너). ⚠️ 콜드 탭(예: 광장=트렌드 첫 진입)은 mount가
    //    수백ms~수초라, 마운트를 먼저 기다리면 picker가 그동안 멈춰 '진입 안 됨/슬라이드 안 됨'처럼 보였다.
    //    그래서 탭 마운트를 기다리기 전에 레이어를 띄우고 슬라이드부터 시작한다.
    const layer = document.createElement("div");
    layer.className = "stack-view";
    layer.innerHTML = '<div class="pane-wait"><i></i></div>';
    stackRoot.appendChild(layer);
    stackRoot.classList.add("on");
    armStackSwipe(layer);
    requestAnimationFrame(() => layer.classList.add("in"));
    setTimeout(() => layer.classList.add("in"), 60);

    let modal = null, home = null, nextEl = null, closeObs = null, popped = false;
    const entry = {
      el: layer, name: kind + "-compose", mod: null,
      onPop: () => {
        popped = true;
        try {
          if (closeObs) closeObs.disconnect();
          // ⚠️ 모달이 아직 '이 레이어' 안에 있을 때만 복원. 빠른 재진입으로 새 compose가 이미 이 모달을
          //    가져갔다면(다른 레이어에 있음) 절대 건드리지 않는다 — 안 그러면 새 compose의 모달을 숨겨
          //    옮겨버려 새 compose가 즉시 닫혀 '선택페이지로 튕김'이 났다.
          if (modal && layer.contains(modal)) {
            modal.hidden = true; modal.classList.add("hidden");
            modal.__stackMode = false;
            document.body.classList.remove("composer-open");
            if (home) home.appendChild(modal);
          }
        } catch (_) {}
      },
    };
    stack.push(entry);
    try { history.pushState(null, "", "#/" + kind + "-compose"); } catch (_) {}   // 로드 중에도 뒤로가기 동작

    // 2) 탭 마운트(모달 DOM+핸들러 확보). 실기기에선 콜드 탭 mount가 느리거나 한 번 실패할 수 있어
    //    '폴링 + 1회 재마운트'로 회복한다(예측 모달 null·광장 리로드 루프 방지).
    const nap = (ms) => new Promise(r => setTimeout(r, ms));
    await ensureTab(m.tab);
    if (popped) return;
    modal = document.getElementById(m.modal);
    for (let i = 0; i < 25 && !modal; i++) { await nap(60); if (popped) return; modal = document.getElementById(m.modal); }
    if (!modal) {                              // 아직도 없으면 탭 재마운트 후 재폴링
      tabReady[m.tab] = false; tabMountP[m.tab] = null;
      await ensureTab(m.tab);
      for (let i = 0; i < 30 && !modal; i++) { if (popped) return; modal = document.getElementById(m.modal); if (modal) break; await nap(60); }
    }
    if (popped) return;
    if (!modal) {                              // 진짜 실패 — 죽은 화면 대신 재시도/닫기 제공
      // 실기기 진단 — 왜 모달을 못 찾았는지(탭 pane 내용=마운트 실패 메시지) DB로 남긴다.
      try {
        const paneHTML = ((panes[m.tab] && panes[m.tab].innerHTML) || "").replace(/\s+/g, " ").slice(0, 240);
        window.GALLA_logError && window.GALLA_logError(new Error("compose-fail " + kind + " tab=" + m.tab + " ready=" + tabReady[m.tab] + " pane=[" + paneHTML + "]"), "compose");
      } catch (_) {}
      layer.innerHTML = '<div class="pane-err">작성 화면을 불러오지 못했어요<br>' +
        '<button type="button" class="pane-retry" style="margin-top:12px;padding:9px 16px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fff;font-weight:800">다시 시도</button></div>';
      const rb = layer.querySelector(".pane-retry");
      if (rb) rb.addEventListener("click", () => { try { history.back(); } catch (_) {} setTimeout(() => compose(kind), 260); });
      return;
    }
    // 복귀 위치 = 그 탭의 view-host(안정적). ⚠️ modal.parentNode를 쓰면 '제거 중인 옛 compose 레이어'를
    //    잡을 수 있어(빠른 재진입 레이스) 복원이 엉킨다. 탭 host로 고정한다.
    home = (panes[m.tab] && panes[m.tab].querySelector(".view-host")) || panes[m.tab] || modal.parentNode;
    nextEl = null;
    modal.__stackMode = true;                  // composer-page.js가 이 모달을 건드리지 않게

    // 3) 모달을 레이어로 MOVE(핸들러 보존) + 뒤로가기 헤더 + 열기
    layer.innerHTML = "";
    layer.appendChild(modal);
    ensureComposeHeader(modal, m.box, m.title);

    const fn = window[m.opener];               // 폼 열기(로그인 확인·draft 복원) → composer-page.css 전체화면
    if (typeof fn === "function") { try { fn(); } catch (_) {} }
    else { modal.hidden = false; modal.classList.remove("hidden"); }
    // 🐞 무한 '선택페이지 복귀' 근본수정: onPop이 닫을 때 hidden '속성+클래스' 둘 다 건다. 그런데 예측 모달은
    //   속성만(opener가 속성만 해제), 광장 모달은 클래스만(opener가 클래스만 해제) 쓴다 → 재진입 시 '남은 다른
    //   하나'가 닫힘으로 오인돼 closeObs가 열자마자 pop. → opener로 연 뒤 둘 다 확실히 제거해 '완전히 열린
    //   상태'를 만들고, 그 '뒤에' closeObs를 붙인다(붙일 땐 mutation이 없어 fire 안 됨 → 오발동 없음).
    modal.hidden = false; modal.classList.remove("hidden");
    document.body.classList.add("composer-open");

    // 발행/취소로 모달이 '스스로' 닫히면 스택 레이어만 남아 검은 화면 → 스택도 pop.
    closeObs = new MutationObserver(() => {
      if ((modal.hasAttribute("hidden") || modal.classList.contains("hidden")) && modal.__stackMode) {
        modal.__stackMode = false;
        try { closeObs.disconnect(); } catch (_) {}
        try { history.back(); } catch (_) {}
      }
    });
    closeObs.observe(modal, { attributes: true, attributeFilter: ["hidden", "class"] });
  }

  /* ── 임의 DOM을 '스택 뷰'로 push — HTML 페이지가 아니라 JS로 만든 요소(버그신고 등)를 슬라이드 인 +
     엣지스와이프/뒤로가기(pop)로 닫히게. contentEl은 레이어를 채운다(.stack-view가 위치·전환 담당).
     반환: 프로그래밍적 닫기 함수(제출 성공 등). onPop은 pop 시 1회 호출(정리·history 정합). */
  function pushView(contentEl, opts) {
    opts = opts || {};
    const layer = document.createElement("div");
    layer.className = "stack-view";
    stackRoot.appendChild(layer);
    stackRoot.classList.add("on");
    layer.appendChild(contentEl);
    armStackSwipe(layer);
    requestAnimationFrame(() => layer.classList.add("in"));
    setTimeout(() => layer.classList.add("in"), 60);
    const entry = { el: layer, name: opts.name || "view", mod: null, onPop: opts.onPop || null };
    stack.push(entry);
    try { history.pushState(null, "", "#/" + (opts.name || "view")); } catch (_) {}
    // 프로그래밍적 닫기(제출 성공 등) — 이 레이어가 최상단이면 pop(슬라이드 아웃+onPop+history.back)
    return function close() {
      if (stack.length && stack[stack.length - 1].el === layer) { try { pop(); } catch (_) {} }
      else { try { if (entry.onPop) entry.onPop(); } catch (_) {} layer.remove(); }
    };
  }

  /* ✍️ 작성 중인가? — 리로드(버전 프로브·당겨서 새로고침)가 작성 내용을 날리지 않게 판단용.
     compose 모달/글쓰기·발행·제보·버그신고 스택이 최상단이면 '작성 중'. */
  window.GALLA_isWriting = function () {
    try {
      if (document.body.classList.contains("composer-open")) return true;
      if (document.querySelector(".bugr-dim")) return true;
      const top = stack[stack.length - 1];
      if (top && /^(write|report|bug|confirm)$|-compose$/.test(top.name)) return true;
    } catch (_) {}
    return false;
  };

  /* ── 셸 공개 API — 기존 postMessage 프로토콜 대체(직접 호출) ── */
  window.GALLA_SPA = {
    go: (tab) => { const i = TABS.indexOf(tab); if (i === -1) return; while (stack.length) pop({ silent: true }); activateTab(i); },
    push, pop, compose, openOverlay, pushView,
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
