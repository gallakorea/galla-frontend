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

    const app = doc.getElementById("app");
    if (!app) throw new Error("no #app in " + url);
    // 셸이 담당하는 크롬 제거 — 페이지 자체 헤더/하단네비/스크립트
    app.querySelectorAll("nav.nav, header.header, script").forEach(n => n.remove());

    const styles = [];
    doc.querySelectorAll('link[rel="stylesheet"]').forEach(l => {
      const href = l.getAttribute("href");
      if (href) styles.push(href);
    });

    const out = { app: app.innerHTML, styles, title: (doc.title || "").trim(), bodyClass: doc.body ? doc.body.className : "", dataPage: doc.body ? (doc.body.dataset.page || "") : "" };
    htmlCache.set(url, out);
    return out;
  }

  function injectStyles(styles) {
    (styles || []).forEach(href => {
      const key = stripV(href);
      if (injectedCss.has(key)) return;
      injectedCss.add(key);
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = href;
      document.head.appendChild(l);
    });
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

  window.GALLA_SPA_LOADER = { fetchView, injectStyles, loadViewModule };
})();
