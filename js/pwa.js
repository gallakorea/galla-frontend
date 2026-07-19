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

    /* 컨트롤러 교체(새 SW 활성) = 새 버전이 배포됐다는 뜻.
       ⚠️ 여기서 아무것도 안 하면 열어둔 탭은 새로고침 전까지 옛 코드를 계속 쓴다
       (실제로 방금 고친 녹음 포맷이 반영 안 돼 헤맸다).
       갑자기 리로드하면 입력·녹음 중인 걸 날리므로:
         · 화면을 보고 있으면 → 작은 안내 바 + [새로고침] 버튼
         · 탭을 떠났다 돌아오면 → 조용히 알아서 갱신 */
    let notified = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (notified) return;
      notified = true;
      const busy = () => document.querySelector('#dm-call.on, #pager-call, .dmc-card') ||
        /INPUT|TEXTAREA/.test(document.activeElement?.tagName || '');
      const reload = () => location.reload();
      // 다음에 탭으로 돌아왔을 때 조용히 갱신(작업 중이 아니면)
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && !busy()) reload();
      }, { once: true });

      const bar = document.createElement('div');
      bar.setAttribute('role', 'status');
      bar.style.cssText = 'position:fixed;left:12px;right:12px;bottom:calc(14px + env(safe-area-inset-bottom,0px));' +
        'z-index:2147483400;max-width:460px;margin:0 auto;display:flex;align-items:center;gap:10px;' +
        'padding:12px 14px;border-radius:16px;background:#181b23;border:1px solid rgba(255,255,255,.14);' +
        'box-shadow:0 14px 40px rgba(0,0,0,.5);color:#e7ebf3;font:600 13.5px/1.5 -apple-system,"Noto Sans KR",sans-serif';
      bar.innerHTML = '<span style="flex:1">새 버전이 준비됐어요</span>' +
        '<button type="button" style="border:none;border-radius:10px;padding:9px 14px;font-weight:900;font-size:13px;' +
        'color:#fff;background:linear-gradient(135deg,#6a7bff,#3a5bff);cursor:pointer">새로고침</button>' +
        '<button type="button" aria-label="닫기" style="border:none;background:none;color:#8a8f9a;font-size:18px;cursor:pointer">×</button>';
      const [go, close] = bar.querySelectorAll('button');
      go.onclick = reload;
      close.onclick = () => bar.remove();
      document.body.appendChild(bar);
      setTimeout(() => bar.remove(), 20000);
    });
  });
})();
