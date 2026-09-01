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

    /* 인라인 <style> 도 가져온다.
       ⚠️ 예전엔 <link> 만 수집했다. 페이지 레이아웃을 <style> 안에 둔 화면(루트 HTML 23개)은
       네이티브에서 스타일이 통째로 빠져, 여백 없이 화면 끝에 붙은 날 HTML 로 떴다
       (2026-08-30 실측: 로그인 기록 — .section{padding:24px 16px} 이 안 먹었다).
       ⚠️ <link> 와 마찬가지로 문서 전역에 한 번만 주입한다(중복·제거 없음). 즉 스타일이
       다른 뷰로 샐 수 있는데, 이건 <link> 가 이미 그런 구조라 위험이 새로 생기는 게 아니다.
       페이지 CSS 는 그 페이지 클래스에 걸려 있는 게 원칙이다. */
    const inlineCss = [];
    doc.querySelectorAll("style").forEach(el => {
      const css = (el.textContent || "").trim();
      if (css) inlineCss.push(css);
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

    const out = { app: app.innerHTML, styles, inlineCss, scripts, title: (doc.title || "").trim(), bodyClass: doc.body ? doc.body.className : "", dataPage: doc.body ? (doc.body.dataset.page || "") : "" };
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
  /* ── 인라인 CSS 를 뷰 범위로 가둔다 ──────────────────────────────────
     그냥 문서에 붙이면 안 된다. login-history 의 body{max-width:480px} 같은 규칙이
     앱 전체를 480px 로 묶어버린다(주입한 <style> 은 제거되지 않으므로 영구적이다).
     실측: SPA 도달 가능한 16개 페이지 중 9개가 body/html/:root 를 건드린다.

     규칙: 최상위 규칙마다 선택자 앞에 스코프를 붙인다.
       .card         →  [data-page="x"] .card
       body / html   →  [data-page="x"]          (그 페이지의 '루트'가 곧 뷰다)
     @media·@supports 는 안쪽 규칙을 재귀로 처리하고, @keyframes·@font-face 처럼
     선택자가 없는 블록은 손대지 않는다(이름이 겹치면 그건 원래 전역이다). */
  function scopeCss(css, scope) {
    const out = [];
    let i = 0;
    while (i < css.length) {
      // 주석 건너뛰기
      if (css.startsWith("/*", i)) { const e = css.indexOf("*/", i + 2); i = e < 0 ? css.length : e + 2; continue; }
      // 선택자(또는 @규칙 프렐류드) 읽기 — 다음 '{' 또는 ';' 까지
      let j = i, depth = 0;
      while (j < css.length && css[j] !== "{" && css[j] !== "}") {
        if (css[j] === ";" ) break;
        j++;
      }
      if (j >= css.length) { break; }
      if (css[j] === ";") {                     // @import · @charset 같은 문장 — 그대로
        out.push(css.slice(i, j + 1)); i = j + 1; continue;
      }
      if (css[j] === "}") { i = j + 1; continue; }   // 짝 안 맞는 닫기 — 버린다
      const prelude = css.slice(i, j).trim();
      // 블록 본문 찾기(중첩 괄호 세기)
      let k = j, body = "";
      depth = 0;
      for (; k < css.length; k++) {
        if (css[k] === "{") depth++;
        else if (css[k] === "}") { depth--; if (depth === 0) break; }
      }
      body = css.slice(j + 1, k);
      i = k + 1;

      const at = prelude.startsWith("@") ? prelude.slice(1).split(/[\s(]/)[0].toLowerCase() : "";
      if (at === "media" || at === "supports" || at === "layer" || at === "container") {
        out.push(prelude + "{" + scopeCss(body, scope) + "}");        // 안쪽을 재귀로
      } else if (at) {
        out.push(prelude + "{" + body + "}");                          // keyframes·font-face 등 — 그대로
      } else {
        const sel = prelude.split(",").map(one => {
          const t = one.trim();
          if (!t) return "";
          /* body / html / :root / #app 은 '이 뷰' 자체로 바꾼다. body.foo 같은 건 뒤를 살린다.
             ⚠️ #app 이 여기 있는 이유: 뷰 로더는 #app **안쪽만** 옮겨오므로 SPA 문서엔 #app 요소가
             하나도 없다(실측 2026-09-01: document.querySelectorAll('#app').length === 0).
             그래서 페이지가 #app 에 건 레이아웃(하단 네비 여백·max-width·min-height)이 통째로 증발한다. */
          const m = t.match(/^(?:html|body|:root|#app)\b(.*)$/);
          if (m) { const rest = m[1].trim(); return rest ? scope + rest : scope; }
          return scope + " " + t;
        }).filter(Boolean).join(",");
        if (sel) out.push(sel + "{" + body + "}");
      }
    }
    return out.join("\n");
  }

  const injectedInline = new Set();
  function injectStyles(styles, inlineCss, pageName) {
    /* 인라인은 기다릴 게 없다(네트워크 없음) — 먼저 붙여 FOUC 를 줄인다. */
    const scope = pageName ? '[data-spa-view="' + pageName + '"]' : null;
    (inlineCss || []).forEach(css => {
      const key = (pageName || "") + ":" + css.length + ":" + css.slice(0, 120);
      if (injectedInline.has(key)) return;
      injectedInline.add(key);
      const st = document.createElement("style");
      st.setAttribute("data-spa-inline", pageName || "1");
      try { st.textContent = scope ? scopeCss(css, scope) : css; }
      catch (_) { return; }        // 못 파싱하면 아예 넣지 않는다 — 전역 오염보다 낫다
      document.head.appendChild(st);
    });
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
    const done = Promise.all(pending);
    /* 링크 CSS 가 붙은 뒤 #app 규칙을 뷰 호스트로 복제한다(아래 shimAppRules 주석). */
    done.then(() => shimAppRules(pageName, styles));
    setTimeout(() => shimAppRules(pageName, styles), 1500);   // link.onload 가 안 뜨는 네이티브 대비 재시도
    return done;
  }

  /* ── 🩹 #app 규칙 되살리기 ────────────────────────────────────────
     뷰 로더는 #app **안쪽**만 뷰 호스트로 옮긴다 → SPA 문서에 #app 요소가 0개다.
     그런데 루트 CSS 14개 파일이 #app 에 페이지 레이아웃을 걸고 있다
     (index 72px · search 94px · plaza 140px · plaza_detail 124px · random 160px …).
     그 여백이 통째로 사라지니, 스크롤을 끝까지 내려도 마지막 요소가 하단 플로팅 네비
     (62px + bottom 14px + 세이프에어리어) 밑에 깔린 채 나오지 않는다.
     실측 2026-09-01 (375×812, 세이프에어리어 0 · 아이폰은 여기서 34px 더 나빠진다):
       약관 −23px · 개인정보 −33px · 계정편집 '변경사항 저장' 버튼 −4px.
     → 그 페이지가 실제로 쓰는 #app 규칙을 뷰 호스트 선택자로 복제해 MPA 와 같은 상자를 만든다.
     (뷰마다 다른 페이지 CSS 가 섞이지 않도록 라우트 이름 스코프로 가둔다.) */
  const appShimmed = new Set();

  function shimAppRules(pageName, styles) {
    if (!pageName || appShimmed.has(pageName)) return;
    const want = new Set();
    (styles || []).forEach(h => { try { want.add(new URL(h, location.href).pathname); } catch (_) {} });
    if (!want.size) return;
    const scope = '.view-host[data-spa-view="' + pageName + '"]';
    const out = [];
    for (const sheet of Array.from(document.styleSheets)) {
      let path = null;
      try { path = sheet.href ? new URL(sheet.href, location.href).pathname : null; } catch (_) {}
      if (!path || !want.has(path)) continue;
      let rules = null;
      try { rules = sheet.cssRules; } catch (_) { continue; }   // 크로스오리진 시트는 못 읽는다 — 건너뛴다
      if (rules) collectAppRules(rules, scope, out);
    }
    if (!out.length) return;            // 아직 파싱 전일 수 있다 — 표시를 남기지 않아야 재시도가 산다
    appShimmed.add(pageName);
    const st = document.createElement("style");
    st.setAttribute("data-spa-appshim", pageName);
    st.textContent = out.join("\n");
    document.head.appendChild(st);
  }

  /* MPA 에서 #app 은 body 안의 '블록'이었지만 SPA 에선 그 자리가 **스크롤 컨테이너**(뷰 호스트)다.
     그래서 상자 모양(여백·너비)만 옮기고, 스크롤 계약을 깨는 속성은 두고 온다.
     실측 2026-09-01: 안 거르고 통째로 복제했더니 index.css 의 #app{position:relative} 가
     셸의 .stack-view .view-host{position:absolute;inset:0;overflow:auto} 를 이기고(같은 특이도·나중 선언)
     호스트가 콘텐츠 높이(4,147px)로 부풀어 스크롤이 통째로 죽었다. */
  const UNSAFE_PROP = /^(position|top|right|bottom|left|inset(-.*)?|overflow(-x|-y)?|height|max-height|transform|will-change|contain)$/;

  function safeDecls(style) {
    const parts = [];
    for (let i = 0; i < style.length; i++) {
      const prop = style.item(i);
      if (UNSAFE_PROP.test(prop)) continue;
      const pri = style.getPropertyPriority(prop);
      parts.push(prop + ":" + style.getPropertyValue(prop) + (pri ? " !" + pri : "") + ";");
    }
    return parts.join("");
  }

  function collectAppRules(rules, scope, out) {
    for (const r of rules) {
      if (r.cssRules && r.conditionText !== undefined) {        // @media · @supports — 안쪽을 재귀로
        const inner = [];
        collectAppRules(r.cssRules, scope, inner);
        if (inner.length) out.push((r.media ? "@media " : "@supports ") + r.conditionText + "{" + inner.join("\n") + "}");
        continue;
      }
      const sel = r.selectorText;
      if (!sel || !/#app\b/.test(sel)) continue;               // #applyAi 같은 건 \b 가 걸러낸다
      const mapped = sel.split(",").map(s => s.trim()).filter(s => /#app\b/.test(s))
        .map(s => s.replace(/#app\b/g, scope)).join(",");
      const decls = safeDecls(r.style);
      if (mapped && decls) out.push(mapped + "{" + decls + "}");
    }
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
