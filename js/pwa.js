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
    /* ⚠️ 2026-08-19 재설계 — '서버 최신 버전 vs 내 페이지 자산 버전' 비교는 틀렸다.
       version.txt 는 배포 전체의 최대 버전인데 myVer() 는 '이 페이지가 참조하는' 최대 버전이다.
       admin·login·app 처럼 최신 자산을 안 싣는 페이지는 항상 mine < server 가 되어
       열 때마다 리로드가 걸린다(실측: 18개 페이지가 이 상태였다).
       → 비교 대상을 바꾼다. '내 페이지의 자산 버전'이 아니라
         '이 문서를 로드했을 때의 배포 번호'와 '지금의 배포 번호'를 비교한다.
         페이지가 무엇을 싣든 무관하고, 열어둔 탭에 새 배포가 나가면 그때만 갱신된다. */
    let lastProbe = 0;
    let baseVer = null;          // 이 문서를 로드한 시점의 배포 번호
    function doReload() {
      /* 🛡 루프 안전망 — 리로드 직후 또 같은 판정이 나오면(캐시·프록시) 무한 새로고침이 된다.
         10분 내 같은 목표 버전으로는 한 번만. */
      try {
        const k = 'galla_verReload';
        const prev = JSON.parse(sessionStorage.getItem(k) || '{}');
        if (prev.v === baseVer && Date.now() - (prev.t || 0) < 600000) return;
        sessionStorage.setItem(k, JSON.stringify({ v: baseVer, t: Date.now() }));
      } catch (_) {}
      const busy = document.querySelector('#dm-call.on, #pager-call, .dmc-card') ||
        /INPUT|TEXTAREA/.test(document.activeElement?.tagName || '');
      if (!busy) location.reload();
      // 작업 중이면 다음 복귀 때 다시 판정(강제 리로드로 입력을 날리지 않는다)
    }
    async function probeVersion() {
      if (Date.now() - lastProbe < 180000) return;
      lastProbe = Date.now();
      try {
        /* 📉 예전엔 '현재 문서 HTML 전체'를 다시 받아 버전을 읽었다(트렌드 26,627 B).
           페이지마다·복귀마다 도니 회선을 먹었다. version.txt 는 7 B·no-store 다. */
        let dep = 0;
        try {
          const t = await (await fetch('/version.txt', { cache: 'no-store' })).text();
          dep = Number((String(t).match(/\d{5,9}/) || [])[0] || 0);
        } catch (_) { /* 아래 폴백 */ }

        if (!dep) {
          /* version.txt 를 못 읽으면 예전 방식으로 폴백 — 단, 이때는 '같은 페이지의 HTML'끼리
             비교하므로 페이지별 버전 편차 문제가 없다. */
          const mine = maxVer([...document.scripts]
            .map(x => (x.src.match(/[?&]v=(\d{5,9})/) || [])[1]).filter(Boolean).map(Number));
          if (!mine) return;
          const html = await (await fetch(location.pathname + location.search, {
            cache: 'no-store', headers: { 'x-galla-probe': '1' } })).text();
          const server = maxVer([...html.matchAll(VER_IN_SCRIPTS)].map(m => Number(m[1])));
          if (server > mine) { baseVer = server; doReload(); }
          return;
        }

        if (baseVer === null) {
          baseVer = dep;
          /* ⚠️ '기준만 잡는다'가 감옥이었다 — 이미 뒤처진 채 오래 상주한 PWA 는
             version.txt 의 '변화'만 기다리며 자기가 낡았는지 영영 몰랐다
             (실측: 사장님 PWA 가 8/14 코드로 일주일 — "규칙이 다 깨졌다"의 정체).
             첫 판정에서 '이 문서의 배포 도장(meta galla-ver, 전 HTML 동일)'과 비교해
             문서가 낡았으면 즉시 리로드한다. 도장은 페이지별 편차가 없어 오탐도 없다. */
          const meta = document.querySelector('meta[name="galla-ver"]');
          const mine = Number(((meta && meta.content) || '').match(/\d{5,9}/) || 0);
          if (mine && dep > mine) doReload();
          return;
        }
        if (dep === baseVer) return;                        // 배포 변화 없음
        baseVer = dep;                                      // 새 배포가 나갔다
        doReload();
      } catch (_) { /* 판정 실패는 조용히 — 다음 복귀 때 다시 */ }
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) probeVersion(); });
    setTimeout(probeVersion, 4000);   // 앱 복원 직후 1회
  });
})();
