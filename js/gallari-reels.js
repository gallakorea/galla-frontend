/* ============================================================
   숏판 릴스 페이지 — 진입 창구만. 피드를 모아 공용 릴스 엔진(shorts.js)으로 연다.
   ⚠️ 2026-09-14 까지 이 파일은 따로 도는 두 번째 릴스 엔진이었다. 이슈 항목을 표시용 진영바로만
      그려 투표가 안 됐고, 고정 상단바(숏판) 위에 슬라이드 상단(⚔️ 정치)이 겹쳤고, 좌상단이 +
      (숏판 올리기)라 나갈 길이 없었다. 이제 이슈·숏판 모두 같은 엔진, 같은 화면이다.
      숏판 슬라이드 모양·동작 = js/reels-mix.js(GALLA_ReelPost).
   이중모드: 웹=MPA / 앱=SPA(로더가 DCL 핸들러를 가로채 방문마다 다시 부른다).
   ============================================================ */
(function () {
  const nav = (u) => (window.GALLA_nav || function (x) { location.href = x; })(u);
  let OPEN = false;

  function getStart() {
    const g = (k) => { let v = new URLSearchParams(location.search).get(k); if (!v) { const h = location.hash || ''; const qi = h.indexOf('?'); if (qi >= 0) v = new URLSearchParams(h.slice(qi + 1)).get(k); } return v; };
    return { id: g('start') || null, type: g('t') === 'issue' ? 'issue' : 'post', user: g('user') || null,
             at: parseFloat(g('at') || '0') || 0 };
  }

  // 릴스를 닫으면 이 페이지도 같이 나간다 — 빈 검은 화면에 남기지 않는다.
  function leave() {
    OPEN = false;
    if (document.body.dataset.page === 'spa' && window.GALLA_SPA && window.GALLA_SPA.pop && window.GALLA_SPA.pop()) return;
    if (window.GALLA_back) { window.GALLA_back('index.html'); return; }
    if (history.length > 1) history.back(); else nav('index.html');
  }

  /* 릴스 뒤에 깔리는 자리 — 프로필·이슈로 갔다가 돌아오면 이게 보인다. */
  function idle(root, msg) {
    root.innerHTML = `<div class="grl-idle">${msg ? `<p>${msg}</p>` : ''}
      ${msg ? '' : '<button type="button" class="grl-idle-btn" data-act="replay">처음부터 다시 보기</button>'}
      <button type="button" class="grl-idle-btn ghost" data-act="back">뒤로</button></div>`;
    root.querySelector('[data-act="back"]').onclick = leave;
    const re = root.querySelector('[data-act="replay"]');
    if (re) re.onclick = () => start(root, false);
  }

  async function start(root, first) {
    const st = getStart();
    const ok = await window.GALLA_openReels({
      feed: { user: st.user },
      startType: st.type, startId: st.id,
      at: first ? st.at : 0,
      onClose: leave,
    });
    OPEN = !!ok;
    idle(root, ok ? '' : '아직 볼 영상이 없어요.<br>첫 숏판을 올려보세요.');
  }

  async function boot() {
    const root = document.getElementById('grl-root');
    if (!root) return;
    if (!window.supabaseClient || !window.GALLA_openReels) { root.innerHTML = '<div class="grl-loading">연결 오류</div>'; return; }
    root.innerHTML = '<div class="grl-loading">불러오는 중…</div>';
    await start(root, true);
  }

  /* SPA 스택에서 이 페이지가 뒤로가기로 빠지면 릴스(문서 최상단 오버레이)도 조용히 닫는다. */
  window.addEventListener('popstate', () => {
    if (!OPEN) return;
    if (!document.getElementById('grl-root') || !document.getElementById('grl-root').isConnected) {
      OPEN = false;
      if (window.GALLA_shortsCloseSilently) window.GALLA_shortsCloseSilently();
    }
  });

  window.GALLA_PAGE_GALLARI_REELS = { init: boot };
  document.addEventListener('DOMContentLoaded', boot);
  if (document.readyState !== 'loading' && document.body.dataset.page !== 'spa') boot();
})();
