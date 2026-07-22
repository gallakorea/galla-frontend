/* =========================================================
   ↔️ 트렌드 탭 순서 바꾸기 — 롱프레스 방식 (2026-07-22)
   ---------------------------------------------------------
   · 탭을 꾹(0.45s) 누르면 정렬 모드 → 좌우로 끌어 재배치 → 놓으면 저장.
   · iOS/안드로이드 롱프레스 텍스트 선택 차단의 핵심은 user-select:none —
     이게 캐시로 미적용돼 '파란 글자 선택'이 떴었다(사장님 재현). !important로 강제.
   · 짧게 누르면 평소대로 탭 전환.

   ⛔ 2026-07-22 전면 중단(사장님 지시) — 셸 스와이프·조그와의 충돌로 정렬 롱프레스가
      계속 말썽이라 기능 자체를 끈다. 탭은 '탭해서 전환'만. 순서 변경 없음.
      과거 저장된 커스텀 순서도 무시하고 항상 기본 순서. (되살리려면 아래 return 삭제)
   ========================================================= */
(function () {
  return;   // ← 정렬 기능 비활성화. 이 줄만 지우면 원복.
  const KEY = 'galla_trend_tab_order';
  const HOLD_MS = 450;
  const header = () => document.querySelector('.tabs-header');

  function restore() {
    const h = header(); if (!h) return;
    let saved; try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) {}
    if (!Array.isArray(saved) || !saved.length) return;
    const items = [...h.querySelectorAll('.tab-item')];
    const byKey = Object.fromEntries(items.map(el => [el.dataset.tab, el]));
    saved.forEach(k => { if (byKey[k]) h.appendChild(byKey[k]); });
    items.forEach(el => { if (!saved.includes(el.dataset.tab)) h.appendChild(el); });
  }
  function save() {
    const h = header(); if (!h) return;
    const order = [...h.querySelectorAll('.tab-item')].map(el => el.dataset.tab).filter(Boolean);
    try { localStorage.setItem(KEY, JSON.stringify(order)); } catch (_) {}
  }

  function css() {
    if (document.getElementById('tabord-css')) return;
    const s = document.createElement('style'); s.id = 'tabord-css';
    s.textContent = `
      /* 텍스트 선택·콜아웃 원천 차단 — 롱프레스 정렬의 필수 전제 */
      .tabs-header, .tabs-header *{
        -webkit-user-select:none !important; user-select:none !important;
        -webkit-touch-callout:none !important; -webkit-tap-highlight-color:transparent;
      }
      .tabs-header .tab-item{ touch-action:pan-x; }
      .tab-item.reordering{
        position:relative; z-index:5; opacity:.96;
        transform:translateX(var(--drag-x,0)) scale(1.1);
        box-shadow:0 10px 26px rgba(0,0,0,.5);
        border-radius:12px; background:rgba(40,44,58,.98) !important;
        transition:none !important;
      }
      .tabs-header.reorder-mode .tab-item:not(.reordering){
        transition:transform .18s cubic-bezier(.2,.9,.3,1);
      }
      .tabs-header.reorder-mode{ touch-action:none; }
      .taborder-hint{
        position:fixed; left:50%; transform:translateX(-50%);
        top:calc(10px + env(safe-area-inset-top,0px)); z-index:11500;
        padding:8px 15px; border-radius:999px;
        background:rgba(24,26,34,.96); border:1px solid rgba(255,255,255,.14);
        color:#dfe3ec; font-size:12px; font-weight:800;
        box-shadow:0 10px 30px rgba(0,0,0,.5); pointer-events:none;
      }
      @media (prefers-reduced-motion:reduce){
        .tabs-header.reorder-mode .tab-item:not(.reordering){ transition:none; }
      }
    `;
    document.head.appendChild(s);
  }

  function boot() {
    const h = header();
    if (!h || h.dataset.orderBound) return;
    h.dataset.orderBound = '1';
    restore(); css();

    let holdT = null, drag = null, raf = 0, lastX = 0;

    function hint(t) {
      let el = document.querySelector('.taborder-hint');
      if (!t) { el?.remove(); return; }
      if (!el) { el = document.createElement('div'); el.className = 'taborder-hint'; document.body.appendChild(el); }
      el.textContent = t;
    }
    function clearSel() { try { const s = window.getSelection(); if (s && s.rangeCount) s.removeAllRanges(); } catch (_) {} }

    const start = (el, x) => {
      drag = { el, startX: x };
      h.classList.add('reorder-mode');
      el.classList.add('reordering');
      clearSel();
      hint('좌우로 끌어 순서를 바꾸고, 놓으면 저장돼요');
      try { navigator.vibrate?.(12); } catch (_) {}
    };
    const render = () => {
      raf = 0; if (!drag) return;
      const dx = lastX - drag.startX;
      drag.el.style.setProperty('--drag-x', dx + 'px');
      const mid = drag.el.getBoundingClientRect().left + drag.el.offsetWidth / 2;
      for (const sib of h.querySelectorAll('.tab-item:not(.reordering)')) {
        const r = sib.getBoundingClientRect(), c = r.left + r.width / 2;
        if (dx < 0 && mid < c && sib.compareDocumentPosition(drag.el) & Node.DOCUMENT_POSITION_FOLLOWING) {
          h.insertBefore(drag.el, sib); rebase(); try { navigator.vibrate?.(6); } catch (_) {} break;
        }
        if (dx > 0 && mid > c && sib.compareDocumentPosition(drag.el) & Node.DOCUMENT_POSITION_PRECEDING) {
          h.insertBefore(drag.el, sib.nextSibling); rebase(); try { navigator.vibrate?.(6); } catch (_) {} break;
        }
      }
    };
    const rebase = () => { drag.el.style.setProperty('--drag-x', '0px'); drag.startX = lastX; };
    const end = (commit) => {
      clearTimeout(holdT); holdT = null;
      cancelAnimationFrame(raf); raf = 0;
      hint(null);
      if (!drag) return;
      const el = drag.el;
      el.classList.remove('reordering'); el.style.removeProperty('--drag-x');
      h.classList.remove('reorder-mode');
      drag = null;
      if (commit) {
        save();
        el._skipClick = true;
        setTimeout(() => { el._skipClick = false; }, 350);
      }
    };

    let pid = null;   // 추적 중인 포인터 id — 다른 손가락 이벤트 무시
    /* 어떤 경로로든(탭 오가며 끊김·홈제스처·앱전환) 남은 상태를 완전 회수.
       ⚠️ 이걸 안 하면 holdT가 손 뗀 뒤 늦게 발화 → drag가 '열린 채' 고정 →
       아래 document touchmove preventDefault가 문서 전체 스와이프를 영구히
       막아 '탭 오가면 정렬·전환 다 먹통'이 됐다(사장님 재현). */
    const reset = () => {
      clearTimeout(holdT); holdT = null;
      cancelAnimationFrame(raf); raf = 0;
      pid = null;
      if (drag) end(false);
      // 잔재 클래스/힌트 방어적 제거 (drag가 이미 null이어도)
      h.classList.remove('reorder-mode');
      h.querySelectorAll('.tab-item.reordering').forEach(el => {
        el.classList.remove('reordering'); el.style.removeProperty('--drag-x');
      });
      hint(null);
    };

    h.addEventListener('pointerdown', (e) => {
      const el = e.target.closest('.tab-item');
      if (!el) return;
      reset();                       // 시작 전 항상 클린 슬레이트
      pid = e.pointerId;
      lastX = e.clientX;
      holdT = setTimeout(() => {
        try { el.setPointerCapture(pid); } catch (_) {}
        start(el, lastX);
      }, HOLD_MS);
    });
    // 이동·해제는 문서 레벨에서 — 손가락이 탭바를 벗어나도 놓치지 않는다
    const onMove = (e) => {
      if (pid !== null && e.pointerId !== pid) return;
      lastX = e.clientX;
      if (!drag) {
        if (holdT && Math.abs(e.movementX) + Math.abs(e.movementY) > 8) { clearTimeout(holdT); holdT = null; pid = null; }
        return;
      }
      e.preventDefault();
      if (!raf) raf = requestAnimationFrame(render);
    };
    const onUp = (e) => {
      if (pid !== null && e.pointerId !== pid && e.type !== 'lostpointercapture') return;
      if (drag) end(true); else reset();
    };
    document.addEventListener('pointermove', onMove, { passive: false });
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onUp, true);
    document.addEventListener('lostpointercapture', onUp, true);
    // 백그라운드 전환·창 이탈 시에도 확실히 회수
    window.addEventListener('blur', reset);
    document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
    /* ★ 자가 복구 — 트렌드 판이 '다시 보일 때마다' 무조건 클린 상태로.
       셸(capacitor 웹뷰)은 로그인 화면을 다녀와도 페이지를 리로드하지 않고
       살아있는 채 재개하므로, 한 번 꼬인 잔재가 재설치 전까지 남았다(사장님 재현:
       DM·마이페이지=로그인 경유 후 정렬 먹통). 복귀 신호마다 reset()으로 원천 차단. */
    window.addEventListener('pageshow', reset);
    window.addEventListener('focus', reset);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reset(); });
    window.addEventListener('message', (e) => {
      if (e.origin !== location.origin) return;
      const m = e.data;
      if (m && m.galla === 'shellcmd' && (m.t === 'active' || m.t === 'scrolltop')) reset();
    });
    /* 정렬 중에만 문서 전체 touchmove 차단 — 이중 가드(drag AND 실제 .reordering
       DOM 존재)로, 만에 하나 drag가 남아도 문서를 영구 잠그지 않는다. */
    document.addEventListener('touchmove', (e) => {
      if (drag && h.querySelector('.tab-item.reordering')) e.preventDefault();
    }, { passive: false });
    h.addEventListener('touchstart', clearSel, { passive: true });
    h.addEventListener('selectstart', (e) => e.preventDefault());
    h.addEventListener('contextmenu', (e) => { if (drag) e.preventDefault(); });
    // 드래그 직후 click(전환) 무효화
    h.addEventListener('click', (e) => {
      const el = e.target.closest('.tab-item');
      if (el?._skipClick) { e.preventDefault(); e.stopPropagation(); }
    }, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
