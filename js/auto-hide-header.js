/* ============================================================
   인스타식 자동 숨김 헤더 (index)
   - 아래로 스크롤 → 헤더(＋·로고·하트) 숨김
   - 위로 스크롤 → 다시 표시
   - 최상단 근처에선 항상 표시
   ============================================================ */
(function () {
  var header = document.querySelector('.header.header-common') || document.querySelector('.header');
  if (!header) return;

  var lastY = window.scrollY || window.pageYOffset || 0;
  var ticking = false;
  var THRESH = 6;      // 미세 떨림 무시
  var TOP_ZONE = 70;   // 최상단 근처(px)에선 항상 노출

  function update() {
    ticking = false;
    var y = window.scrollY || window.pageYOffset || 0;

    if (y <= TOP_ZONE) { header.classList.remove('hide'); lastY = y; return; }

    var dy = y - lastY;
    if (Math.abs(dy) < THRESH) return;

    if (dy > 0) header.classList.add('hide');     // 아래로 → 숨김
    else header.classList.remove('hide');         // 위로 → 표시
    lastY = y;
  }

  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }, { passive: true });
})();
