/* =========================================================
   pwa.js — 서비스워커 등록 + 업데이트 처리 (전 페이지 로드)
   - /sw.js 를 루트 스코프로 등록
   - 새 버전 감지 시 즉시 적용(skipWaiting) 후 다음 내비게이션에 반영
   - file:// (로컬 파일 열람)에선 등록 안 함
   ========================================================= */
(function () {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(reg => {
        // 새 워커가 대기 상태로 설치되면 즉시 활성화 요청
        function promote(worker) {
          if (worker) worker.postMessage('skipWaiting');
        }
        if (reg.waiting) promote(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) promote(nw);
          });
        });
      })
      .catch(() => {});

    // 컨트롤러 교체(새 SW 활성) 시 1회 새로고침으로 최신 셸 반영
    let refreshed = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshed) return;
      refreshed = true;
      // 사용자가 보는 중 갑작스런 리로드 방지: 다음 페이지 진입에 자연 반영되도록 생략 가능하나,
      // 셸 일관성을 위해 조용히 갱신
    });
  });
})();
