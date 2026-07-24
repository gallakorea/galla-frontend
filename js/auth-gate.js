/* ─────────────────────────────────────────────────────────────
   auth-gate.js — 이른(동기) 인증 가드
   gated 페이지(<head>에서 동기 로드)에서 세션 토큰이 없으면 렌더 전에 즉시 로그인으로.
   → 로그아웃 상태로 진입할 때 '배경이 잠깐 보였다 로그인으로 튕김'(플래시) 제거(사장님 제보).
   토큰이 있으면(만료 가능성 포함) 통과 → 이후 페이지의 정상 getSession 흐름이 처리.
   ───────────────────────────────────────────────────────────── */
(function () {
  var KEY = "sb-bidqauputnhkqepvdzrr-auth-token";
  try {
    if (localStorage.getItem(KEY)) return;   // 세션 있음 → 통과
  } catch (_) { return; }                     // 저장소 접근 불가 → 정상 흐름에 맡김
  try {
    var here = location.pathname.replace(/^\//, "") + location.search;
    var nx = (here && !/login\.html/.test(here)) ? "?next=" + encodeURIComponent(here) : "";
    // 셸 판(iframe) 안이면 셸 전체를 로그인으로(풀스크린) — 판만 바꾸면 셸 nav가 남는다.
    var w = window;
    try { if (window.top !== window.self && window.top.document.getElementById("shell-track")) w = window.top; } catch (_) {}
    w.location.replace("login.html" + nx);
  } catch (_) {}
})();
