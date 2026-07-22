/* =========================================================
   ↔️ 트렌드 탭 순서 바꾸기 — 롱프레스 방식 (2026-07-22)
   ---------------------------------------------------------
   · 탭을 꾹(0.45s) 누르면 정렬 모드 → 좌우로 끌어 재배치 → 놓으면 저장.
   · iOS/안드로이드 롱프레스 텍스트 선택 차단의 핵심은 user-select:none —
     이게 캐시로 미적용돼 '파란 글자 선택'이 떴었다(사장님 재현). !important로 강제.
   · 짧게 누르면 평소대로 탭 전환.
   ========================================================= */
(function () {
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

    h.addEventListener('pointerdown', (e) => {
      const el = e.target.closest('.tab-item');
      if (!el) return;
      lastX = e.clientX;
      clearTimeout(holdT);
      holdT = setTimeout(() => {
        try { el.setPointerCapture(e.pointerId); } catch (_) {}
        start(el, lastX);
      }, HOLD_MS);
    });
    h.addEventListener('pointermove', (e) => {
      lastX = e.clientX;
      if (!drag) {
        if (holdT && Math.abs(e.movementX) + Math.abs(e.movementY) > 8) { clearTimeout(holdT); holdT = null; }
        return;
      }
      e.preventDefault();
      if (!raf) raf = requestAnimationFrame(render);
    });
    // 정렬 중 문서 전체 touchmove·선택 차단
    document.addEventListener('touchmove', (e) => { if (drag) e.preventDefault(); }, { passive: false });
    h.addEventListener('touchstart', clearSel, { passive: true });
    h.addEventListener('selectstart', (e) => e.preventDefault());
    h.addEventListener('contextmenu', (e) => { if (drag) e.preventDefault(); });
    h.addEventListener('pointerup', () => end(true));
    h.addEventListener('pointercancel', () => end(true));
    // 드래그 직후 click(전환) 무효화
    h.addEventListener('click', (e) => {
      const el = e.target.closest('.tab-item');
      if (el?._skipClick) { e.preventDefault(); e.stopPropagation(); }
    }, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
