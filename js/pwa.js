/* =========================================================
   pwa.js — 서비스워커 등록 + 업데이트 처리 (전 페이지 로드)
   - /sw.js 를 루트 스코프로 등록
   - 새 버전 감지 시 즉시 적용(skipWaiting) 후 다음 내비게이션에 반영
   - file:// (로컬 파일 열람)에선 등록 안 함
   ========================================================= */
(function () {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;
  // 📦 로컬 번들(네이티브 앱)로 로드된 경우 SW 불필요 — 자산이 이미 로컬. 웹/원격로딩은 그대로 등록.
  if (location.protocol === 'capacitor:' || location.hostname === 'localhost') return;

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

    /* ── 버전 프로브 ─────────────────────────────────────────
       SW의 controllerchange는 sw.js '파일 내용'이 바뀔 때만 발생한다.
       평소 배포는 자산 버전(?v=)만 바뀌므로 SW는 그대로 → 열려 있는
       PWA는 영원히 옛 코드를 돈다(사장님이 반나절 옛 버전을 본 원인).
       → 화면 복귀 때마다(최소 3분 간격) 서버 HTML의 v번호를 읽어
         내 페이지 v와 다르면 갱신한다. */
    /* ⚠️ 무한 새로고침 사고(2026-08-08) 수정 — 두 가지가 겹쳤다:
       ① 내 쪽은 '첫 <script>의 v', 서버 쪽은 'HTML 전체의 첫 ?v='(대개 CSS)를 읽어
          **서로 다른 파일을 비교**했다. admin.html은 CSS가 0806113, 첫 스크립트가 080412라
          영원히 "서버가 더 최신" → 리로드 → 같은 판정 → 무한 루프.
       ② 정규식이 \d{6} 고정이라 7자리 버전(0806134)을 080613으로 잘라 먹어
          같은 날 재배포(0806130~134)를 구분도 못 했다.
       → 양쪽 모두 '스크립트 태그들의 최대 버전'을 전체 자릿수로 비교한다(동일 기준). */
    const VER_IN_SCRIPTS = /<script[^>]*?[?&]v=(\d{5,9})/gi;
    const maxVer = (nums) => nums.reduce((a, b) => (b > a ? b : a), 0);
    const myVer = () => maxVer([...document.scripts]
      .map(x => (x.src.match(/[?&]v=(\d{5,9})/) || [])[1])
      .filter(Boolean).map(Number));
    let lastProbe = 0;
    async function probeVersion() {
      const mine = myVer();
      if (!mine) return;
      if (Date.now() - lastProbe < 180000) return;
      lastProbe = Date.now();
      try {
        const html = await (await fetch(location.pathname + location.search, {
          cache: 'no-store', headers: { 'x-galla-probe': '1' } })).text();
        const serverVers = [...html.matchAll(VER_IN_SCRIPTS)].map(m => Number(m[1]));
        const server = maxVer(serverVers);
        /* '다르면'이 아니라 '더 최신이면'만 — SW 캐시가 옛 HTML을 돌려주면
           다르다는 이유로 옛 버전으로 리로드하는 루프가 생긴다 */
        if (!server || server <= mine) return;
        /* 🛡 루프 안전망 — 버전 때문에 리로드한 직후 또 같은 판정이 나오면(캐시·프록시 등)
           무한 새로고침이 된다. 10분 내 같은 목표 버전으로는 한 번만 리로드한다. */
        try {
          const k = 'galla_verReload';
          const prev = JSON.parse(sessionStorage.getItem(k) || '{}');
          if (prev.v === server && Date.now() - (prev.t || 0) < 600000) return;
          sessionStorage.setItem(k, JSON.stringify({ v: server, t: Date.now() }));
        } catch (_) {}
        const busy = document.querySelector('#dm-call.on, #pager-call, .dmc-card') ||
          /INPUT|TEXTAREA/.test(document.activeElement?.tagName || '');
        if (!busy) location.reload();
        // 작업 중이면 다음 복귀 때 다시 판정(강제 리로드로 입력을 날리지 않는다)
      } catch (_) {}
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) probeVersion(); });
    setTimeout(probeVersion, 4000);   // 앱 복원 직후 1회
  });
})();
