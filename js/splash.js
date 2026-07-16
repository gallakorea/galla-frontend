/* =========================================================
   splash.js — 앱 스플래시 제어
   - 세션 첫 진입에만 표시(탭 전환·내부 이동엔 안 뜸).
   - 앱이 준비되면(window load + 최소 노출시간) 페이드아웃 후 제거.
   - 어떤 이유로든 오래 안 사라지면 강제 제거(세이프가드).
   스플래시 DOM/핵심 CSS는 index.html <head>/<body>에 인라인돼 즉시 페인트됨.
   ========================================================= */
(function () {
  var el = document.getElementById("galla-splash");
  if (!el) return;

  // 이미 이번 세션에 스플래시를 봤다면(재방문·내부 이동) 즉시 제거 — 깜빡임 방지.
  try {
    if (sessionStorage.getItem("galla_splashed")) { el.remove(); return; }
    sessionStorage.setItem("galla_splashed", "1");
  } catch (_) {}

  var start = Date.now();
  var MIN = 650;   // 최소 노출(ms) — 너무 빨리 사라져 번쩍이지 않게
  var MAX = 4000;  // 안전 상한 — 무슨 일이 있어도 이 시간엔 사라짐
  var done = false;

  function hide() {
    if (done) return; done = true;
    var wait = Math.max(0, MIN - (Date.now() - start));
    setTimeout(function () {
      el.classList.add("gone");
      var remove = function () { if (el && el.parentNode) el.parentNode.removeChild(el); };
      el.addEventListener("transitionend", remove, { once: true });
      setTimeout(remove, 700); // transitionend 미발화 대비
      document.documentElement.classList.remove("splash-lock");
    }, wait);
  }

  // 스크롤 잠금(스플래시 떠 있는 동안)
  document.documentElement.classList.add("splash-lock");

  if (document.readyState === "complete") hide();
  else window.addEventListener("load", hide, { once: true });
  setTimeout(hide, MAX); // 세이프가드
})();
