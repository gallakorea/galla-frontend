/* ============================================================
   인스타식 자동 숨김 헤더 (index)
   - 아래로 스크롤 → 헤더(＋·로고·하트) 숨김
   - 위로 스크롤 → 다시 표시
   - 최상단 근처에선 항상 표시

   ⚠️ html·body 둘 다 overflow-y:auto라 기기에 따라 스크롤 주체가
      window / documentElement / body 로 달라짐(iOS는 body가 되기도 함).
      → capture 단계로 어떤 스크롤이든 잡고, 위치도 세 곳에서 읽어 대응.
   ============================================================ */
(function () {
  var header = document.querySelector('.header.header-common') || document.querySelector('.header');
  if (!header) return;

  function getY() {
    return window.pageYOffset ||
           document.documentElement.scrollTop ||
           document.body.scrollTop || 0;
  }

  var lastY = getY();
  var hidden = false;
  var THRESH = 6;      // 미세 떨림 무시
  var TOP_ZONE = 70;   // 최상단 근처(px)에선 항상 노출

  function setHidden(h) {
    if (h === hidden) return;
    hidden = h;
    header.classList.toggle('hide', h);
  }

  function onScroll(e) {
    // 이벤트 타깃이 스크롤 요소면 그 위치를 우선 사용(내부 스크롤러 대응)
    var y;
    var t = e && e.target;
    if (t && t.nodeType === 1 && typeof t.scrollTop === 'number' && t !== document) y = t.scrollTop;
    else y = getY();
    if (typeof y !== 'number') y = getY();

    if (y <= TOP_ZONE) { setHidden(false); lastY = y; return; }
    var dy = y - lastY;
    if (Math.abs(dy) < THRESH) return;
    setHidden(dy > 0);   // 아래로 → 숨김, 위로 → 표시
    lastY = y;
  }

  // capture:true → window가 아닌 요소가 스크롤해도 잡힌다
  window.addEventListener('scroll', onScroll, { passive: true, capture: true });
  document.addEventListener('scroll', onScroll, { passive: true, capture: true });
})();
