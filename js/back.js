/* =========================================================
   back.js — 안전한 뒤로가기 (전 페이지 공용)

   ⚠️ 기존 문제
     - 그냥 history.back() → 공유 링크·PWA 콜드스타트처럼 '앱 내부 이력이 없는'
       진입에서는 앱 밖(브라우저 이전 사이트/빈 탭)으로 튕겨 나간다.
     - history.length > 1 도 부정확하다. length엔 다른 사이트 이력까지 포함돼
       "1보다 크다"가 곧 "우리 앱에서 왔다"를 의미하지 않는다.

   ✅ 판정 기준
     앱 내부에서 이동해 왔는가(= 같은 오리진 referrer 또는 우리가 심어둔 마커)
     → 그렇다면 history.back(), 아니면 페이지별 fallback 으로 이동한다.

   사용법
     <button data-back>…</button>                 // 기본 fallback: index.html
     <button data-back="galla-predict.html">…</button>
     window.GALLA_back('mypage.html')
========================================================= */
(function () {
  const KEY = "galla_nav_depth";

  // 앱 내부 이동일 때마다 깊이를 쌓는다(뒤로가기 안전 판정용)
  function bumpDepth() {
    try {
      const fromApp = sameOriginReferrer();
      const d = Number(sessionStorage.getItem(KEY) || 0);
      sessionStorage.setItem(KEY, String(fromApp ? d + 1 : 0));
    } catch (_) { /* 시크릿 모드 등 — 무시 */ }
  }

  function sameOriginReferrer() {
    if (!document.referrer) return false;
    try { return new URL(document.referrer).origin === location.origin; }
    catch (_) { return false; }
  }

  function canGoBack() {
    if (sameOriginReferrer()) return true;
    try { return Number(sessionStorage.getItem(KEY) || 0) > 0; }
    catch (_) { return false; }
  }

  window.GALLA_back = function (fallback) {
    if (canGoBack() && history.length > 1) { history.back(); return; }
    location.href = fallback || "index.html";
  };

  bumpDepth();

  // [data-back] 위임 — 값이 있으면 그게 fallback
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-back]");
    if (!el) return;
    e.preventDefault();
    window.GALLA_back(el.getAttribute("data-back") || undefined);
  });
})();
