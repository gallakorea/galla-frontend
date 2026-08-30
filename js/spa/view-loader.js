/* ═══════════════════════════════════════════════════════════════
 * GALLA SPA 뷰 로더 — MPA 페이지(.html)에서 #app 콘텐츠를 추출해
 * 단일문서 뷰로 재사용한다(마크업 중복 없이 웹 MPA와 한 소스).
 *
 * 계약:
 *  · 모든 페이지는 <div id="app">…</div>를 최상위 콘텐츠 컨테이너로 가진다(전 페이지 관례 확인됨).
 *  · 헤더(.header)·하단네비(.nav)는 SPA 셸이 담당 — 추출 시 제거한다.
 *  · 페이지 전용 CSS(<link rel="stylesheet">)는 최초 1회만 문서에 주입(중복 방지).
 *  · 페이지 로직은 js/spa/views/<name>.js 모듈의 mount(root, params)/unmount()가 담당(P1+).
 *    모듈이 아직 없으면 정적 콘텐츠만 표시(골격 단계).
 * ═══════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const htmlCache = new Map();     // url → { app, styles, title }  (세션 내 캐시)
  const injectedCss = new Set();   // 버전 쿼리 제거한 href — 중복 주입 방지

  // 이미 문서에 있는 스타일(셸 로드분) 등록 — 같은 파일 재주입 방지
  document.querySelectorAll('link[rel="stylesheet"]').forEach(l => {
    injectedCss.add(stripV(l.getAttribute("href") || ""));
  });

  function stripV(href) {
    return String(href).replace(/[?&]v=[^&]+/, "").replace(/^\.\//, "/");
  }

  async function fetchView(url) {
    if (htmlCache.has(url)) return htmlCache.get(url);
    const res = await fetch(url, { credentials: "same-origin" });
    if (!res.ok) throw new Error("view fetch " + res.status + " " + url);
    const doc = new DOMParser().parseFromString(await res.text(), "text/html");

    let app = doc.getElementById("app");
    if (!app) {
      // #app 없는 전체화면 페이지(write.html의 .app-root, login.html의 .auth-wrap 등) —
      // body 전체를 컨테이너로 합성해 스택 뷰로 쓴다(마크업 불변, 아래에서 크롬만 제거).
      app = doc.createElement("div");
      app.innerHTML = doc.body ? doc.body.innerHTML : "";
    }
    // 셸이 담당하는 크롬만 제거(하단네비·스크립트). ★헤더는 페이지 것을 그대로 보존 —
    // 페이지마다 헤더 구성이 달라(GP필·설정기어·탭순서 등) 디자인 1:1 유지가 우선.
    // 헤더 숨김/네비 축소는 라우터의 스크롤 크롬 엔진이 담당한다.
    app.querySelectorAll("nav.nav, script").forEach(n => n.remove());

    const styles = [];
    doc.querySelectorAll('link[rel="stylesheet"]').forEach(l => {
      const href = l.getAttribute("href");
      if (href) styles.push(href);
    });

    // 페이지 자체 스크립트 목록(셸 싱글턴·MPA 크롬 제외) — 전용 뷰 모듈이 없을 때 범용 폴백으로 로드.
    const scripts = [];
    doc.querySelectorAll("script[src]").forEach(s => {
      const src = s.getAttribute("src");
      if (!src || /^([a-z]+:)?\/\//i.test(src)) return;   // 외부/절대 URL 제외
      const base = src.split("?")[0].split("/").pop();
      if (SHELL_SCRIPTS.has(base)) return;
      scripts.push(src);
    });

    const out = { app: app.innerHTML, styles, scripts, title: (doc.title || "").trim(), bodyClass: doc.body ? doc.body.className : "", dataPage: doc.body ? (doc.body.dataset.page || "") : "" };
    htmlCache.set(url, out);
    return out;
  }

  // 셸(app.html)이 이미 로드했거나 SPA에서 충돌하는 MPA 전용 크롬 — 페이지 스크립트 폴백에서 제외.
  const SHELL_SCRIPTS = new Set([
    "supabase.js", "dm-sound.js", "dm-call.js", "error-logger.js", "nav.js", "back.js",
    "pwa.js", "analytics.js", "splash-boot.js", "snapshot.js", "pull-refresh.js",
    "nav-jog.js", "desktop-pc.js"
  ]);
  const loadedPageScripts = new Set();
  /* 전용 뷰 모듈이 없는 페이지(설정 하위 페이지 등)를 SPA 스택 뷰로 띄우기 위한 범용 폴백.
     페이지 스크립트를 1회 로드하되, SPA에선 DOMContentLoaded가 이미 지나 자동초기화가 안 붙으므로
     '이 스크립트들이 등록하는 DCL 핸들러만' 가로채 직접 호출한다(기존에 붙은 핸들러는 재실행 안 됨). */
  /* 스크립트가 잡아둔 DOMContentLoaded 초기화 함수를 파일별로 보관한다.
     ⚠️ 예전엔 '이미 로드했으면 continue' 하고 끝냈다. 그런데 브라우저는 같은 src 를 두 번
     실행하지 않으므로, 두 번째 방문 때 초기화가 아예 안 돌아 화면이 "불러오는 중…"에서
     멈췄다(실측 2026-08-30: 로그인 기록 페이지 재방문 시 재현). 전용 어댑터가 없는
     모든 페이지가 같은 증상이다. → 핸들러를 기억해 두고 방문할 때마다 다시 부른다. */
  const pageScriptInit = new Map();   // base 파일명 → [DCL 핸들러]

  async function loadPageScripts(scripts) {
    if (!scripts || !scripts.length) return;
    const replay = [];
    const origAdd = document.addEventListener;
    let current = null;
    document.addEventListener = function (type, fn, opts) {
      if (type === "DOMContentLoaded") {
        if (typeof fn === "function" && current) {
          if (!pageScriptInit.has(current)) pageScriptInit.set(current, []);
          pageScriptInit.get(current).push(fn);
        }
        return;
      }
      return origAdd.call(this, type, fn, opts);
    };
    try {
      for (const src of scripts) {
        const base = src.split("?")[0].split("/").pop();
        if (loadedPageScripts.has(base)) { replay.push(base); continue; }
        loadedPageScripts.add(base);
        current = base;
        await new Promise(res => {
          const s = document.createElement("script");
          s.src = src; s.onload = res; s.onerror = res;
          document.head.appendChild(s);
        });
        current = null;
        replay.push(base);
      }
    } finally { document.addEventListener = origAdd; current = null; }
    /* 처음 로드든 재방문이든 같은 순서로 초기화한다 — MPA 에서 페이지를 다시 여는 것과 같아야 한다. */
    for (const base of replay) {
      for (const fn of (pageScriptInit.get(base) || [])) {
        try { fn(new Event("DOMContentLoaded")); } catch (_) {}
      }
    }
  }

  /* CSS 주입 — 새로 붙는 <link>의 onload까지 '기다리는' Promise를 돌려준다.
     라우터가 이걸 await한 뒤 콘텐츠를 노출해야 FOUC(스타일 미적용 날 HTML 번쩍)가 안 난다.
     이미 주입된 CSS는 즉시 통과. 느리거나 실패한 CSS가 노출을 영영 막지 않게 안전 타임아웃(1.5s). */
  function injectStyles(styles) {
    const pending = [];
    (styles || []).forEach(href => {
      const key = stripV(href);
      if (injectedCss.has(key)) return;
      injectedCss.add(key);
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = href;
      pending.push(new Promise(res => {
        let done = false;
        const fin = () => { if (!done) { done = true; res(); } };
        l.onload = fin; l.onerror = fin;
        setTimeout(fin, 300);   // 네이티브(capacitor://)는 link.onload가 안 뜰 때가 있어 짧게 폴백 — 로컬 번들 CSS는 그 안에 적용됨
      }));
      document.head.appendChild(l);
    });
    return Promise.all(pending);
  }

  // 뷰 모듈(P1+) — js/spa/views/<name>.js 의 mount/unmount. 없으면 null(정적 표시).
  const modCache = new Map();
  async function loadViewModule(name) {
    if (modCache.has(name)) return modCache.get(name);
    let mod = null;
    try {
      mod = await import(`/js/spa/views/${name}.js${window.GALLA_V ? "?v=" + window.GALLA_V : ""}`);
    } catch (_) { mod = null; }   // 아직 모듈화 전 페이지 — 정적 콘텐츠만
    modCache.set(name, mod);
    return mod;
  }

  window.GALLA_SPA_LOADER = { fetchView, injectStyles, loadViewModule, loadPageScripts };
})();
