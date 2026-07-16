/* =========================================================
   splash-boot.js — 앱 스플래시(로딩) 화면 · 자체 주입형
   <head>에 동기 로드로 넣는다(모든 진입 페이지 공통, 한 줄):
     <script src="/js/splash-boot.js?v=..."></script>
   - head에서 실행 → body 파싱 전에 오버레이를 documentElement에 삽입 → 즉시 페인트(흰 번쩍임 없음).
   - 세션 첫 진입에만 표시(탭 전환·내부 이동엔 안 뜸).
   - 준비되면(window load + 최소 노출) 페이드아웃 후 제거. 세이프가드로 무슨 일이 있어도 사라짐.
   ========================================================= */
(function () {
  // 이미 이번 세션에 봤으면(재방문·내부 이동) 아예 만들지 않음 — 깜빡임 0.
  try { if (sessionStorage.getItem("galla_splashed")) return; } catch (_) {}
  try { sessionStorage.setItem("galla_splashed", "1"); } catch (_) {}

  var SRC = (function () { try { return document.currentScript.src || ""; } catch (_) { return ""; } })();
  var V = (SRC.split("?v=")[1] || "").split("&")[0];
  // ?wait=ready → window.load가 아니라 앱의 'galla:ready'(콘텐츠 첫 렌더)를 기다린다.
  //   피드가 async라 load 시점엔 아직 빈 화면 → 스플래시가 가려야 할 구간을 놓친다.
  var WAIT_READY = /[?&]wait=ready\b/.test(SRC);
  var IMG = "/assets/brand/wordmark-white.png" + (V ? "?v=" + V : "");

  var css =
    "html.splash-lock,html.splash-lock body{overflow:hidden!important}" +
    "#galla-splash{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;" +
      "align-items:center;justify-content:center;background:#000;" +
      "background-image:radial-gradient(60% 50% at 50% 44%,rgba(90,110,180,.16) 0%,rgba(0,0,0,0) 62%);" +
      "opacity:1;transition:opacity .5s ease;-webkit-tap-highlight-color:transparent;user-select:none}" +
    "#galla-splash.gone{opacity:0;pointer-events:none}" +
    "#galla-splash .gs-logo{position:relative;width:min(58vw,260px);overflow:hidden;" +
      "filter:drop-shadow(0 0 22px rgba(120,140,220,.30));animation:gs-breathe 2.4s ease-in-out infinite}" +
    "#galla-splash .gs-logo img{display:block;width:100%;height:auto}" +
    "#galla-splash .gs-logo::after{content:'';position:absolute;inset:0;" +
      "background:linear-gradient(105deg,transparent 38%,rgba(255,255,255,.55) 50%,transparent 62%);" +
      "mix-blend-mode:overlay;transform:translateX(-120%);animation:gs-sweep 2.6s ease-in-out .3s infinite;pointer-events:none}" +
    "#galla-splash .gs-bar{margin-top:34px;width:min(46vw,190px);height:4px;border-radius:99px;background:rgba(255,255,255,.12);overflow:hidden}" +
    "#galla-splash .gs-bar::before{content:'';display:block;height:100%;width:40%;border-radius:99px;" +
      "background:linear-gradient(90deg,#2f6bff,#7aa2ff);box-shadow:0 0 12px rgba(90,130,255,.8);" +
      "animation:gs-load 1.25s cubic-bezier(.5,.05,.3,1) infinite}" +
    "#galla-splash .gs-tag{margin-top:16px;color:#7f8aa3;font-size:13px;letter-spacing:.4px;" +
      "font-family:-apple-system,'Apple SD Gothic Neo','Noto Sans KR',sans-serif}" +
    "@keyframes gs-breathe{0%,100%{transform:scale(1);opacity:.94}50%{transform:scale(1.045);opacity:1}}" +
    "@keyframes gs-sweep{0%{transform:translateX(-120%)}55%,100%{transform:translateX(120%)}}" +
    "@keyframes gs-load{0%{transform:translateX(-100%)}50%{transform:translateX(120%)}100%{transform:translateX(320%)}}" +
    "@media (prefers-reduced-motion:reduce){#galla-splash .gs-logo,#galla-splash .gs-logo::after,#galla-splash .gs-bar::before{animation:none}" +
      "#galla-splash .gs-logo::after{display:none}#galla-splash .gs-bar::before{width:100%}}";

  var st = document.createElement("style");
  st.textContent = css;
  (document.head || document.documentElement).appendChild(st);

  var el = document.createElement("div");
  el.id = "galla-splash";
  el.setAttribute("role", "status");
  el.setAttribute("aria-label", "갈라 로딩 중");
  el.innerHTML =
    '<div class="gs-logo"><img src="' + IMG + '" alt="갈라"></div>' +
    '<div class="gs-bar"></div>' +
    '<div class="gs-tag">여론이 에너지가 되는 곳</div>';
  document.documentElement.appendChild(el);
  document.documentElement.classList.add("splash-lock");

  var start = Date.now(), done = false;
  var MIN = 650;                       // 최소 노출(번쩍임 방지)
  var MAX = WAIT_READY ? 7000 : 4000;  // 세이프가드: 콘텐츠 대기 모드는 네트워크를 기다리므로 넉넉히
  function hide() {
    if (done) return; done = true;
    setTimeout(function () {
      el.classList.add("gone");
      var rm = function () { if (el && el.parentNode) el.parentNode.removeChild(el); };
      el.addEventListener("transitionend", rm, { once: true });
      setTimeout(rm, 700);
      document.documentElement.classList.remove("splash-lock");
    }, Math.max(0, MIN - (Date.now() - start)));
  }

  if (WAIT_READY) {
    // 앱이 콘텐츠를 처음 그린 순간에만 내린다. 신호가 영영 안 와도 MAX가 구제.
    window.addEventListener("galla:ready", hide, { once: true });
    if (window.__gallaReadySent) hide();          // 이미 신호가 지나갔다면(경합) 즉시
  } else if (document.readyState === "complete") {
    hide();
  } else {
    window.addEventListener("load", hide, { once: true });
  }
  setTimeout(hide, MAX);
})();
