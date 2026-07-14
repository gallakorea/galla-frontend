/* ============================================================
   인스타식 자동 숨김 헤더 (index)
   - 아래로 스크롤 → 헤더(＋·로고·하트) 숨김
   - 위로 스크롤 → 다시 표시
   - 최상단 근처에선 항상 표시
   (스크롤 핸들러에서 직접 토글 — rAF 의존성 제거로 어떤 환경에서도 동작)
   ============================================================ */
(function () {
  var header = document.querySelector('.header.header-common') || document.querySelector('.header');
  if (!header) return;

  var lastY = window.scrollY || window.pageYOffset || 0;
  var hidden = false;
  var THRESH = 6;      // 미세 떨림 무시
  var TOP_ZONE = 70;   // 최상단 근처(px)에선 항상 노출

  function setHidden(h) {
    if (h === hidden) return;          // 상태 변화 없으면 DOM 안 건드림
    hidden = h;
    header.classList.toggle('hide', h);
  }

  window.addEventListener('scroll', function () {
    var y = window.scrollY || window.pageYOffset || 0;
    if (y <= TOP_ZONE) { setHidden(false); lastY = y; return; }
    var dy = y - lastY;
    if (Math.abs(dy) < THRESH) return;
    setHidden(dy > 0);                 // 아래로 → 숨김, 위로 → 표시
    lastY = y;
  }, { passive: true });
})();
