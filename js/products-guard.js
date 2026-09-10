/* 🍎 anti-steering — 갈라캐시 안내(products.html) 의 원화 가격표·외부 결제수단을 앱에서 감춘다.
   이 페이지는 웹 PG(포트원) 심사 요건으로 만든 원화 가격 안내다. 앱 안에서 외부 결제 가격·수단을
   보여주면 거절 사유이므로, 앱이면 가격 구역을 감추고 App Store 결제 안내로 바꾼다.

   ⚠️ 왜 인라인이 아니라 별도 파일인가 — SPA 뷰 로더(js/spa/view-loader.js)는 `script[src]` 만
      모아 실행하고 **인라인 <script> 는 버린다**. 예전엔 이 가드가 products.html 안의 인라인
      스크립트였어서, 앱(SPA)에서 딥링크·뒤로가기로 이 페이지에 들어오면 가드가 아예 돌지 않고
      6티어 원화 가격표와 「카카오페이·네이버페이·토스페이…」가 그대로 보였다(2026-09-10 QA).
   ⚠️ 왜 DOMContentLoaded 로 거는가 — SPA 는 한 번 로드한 페이지 스크립트를 재방문 때 다시
      실행하지 않고, 로드 중에 걸린 DCL 리스너만 되감아(replay) 부른다. 즉시 실행(IIFE)만 두면
      두 번째 방문부터 가드가 빠진다. MPA 에서도 DCL 은 그대로 한 번 돈다. */
(function () {
  function isApp() {
    try {
      return !!((window.GALLA_isApp && window.GALLA_isApp())
        || (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())
        || /GallaApp/i.test(navigator.userAgent || ""));
    } catch (_) { return false; }
  }
  function guard() {
    try {
      if (!isApp()) return;
      var web = document.getElementById("prWebPricing");
      var app = document.getElementById("prAppNotice");
      /* hidden 만으론 부족할 수 있다 — CSS display 규칙이 이기면 그대로 보인다(설정 항목에서 실측). */
      if (web) { web.hidden = true; web.style.display = "none"; }
      if (app) { app.hidden = false; app.style.display = ""; }
    } catch (_) {}
  }
  document.addEventListener("DOMContentLoaded", guard);
  if (document.readyState !== "loading") guard();
})();
