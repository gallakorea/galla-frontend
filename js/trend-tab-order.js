/* =========================================================
   ↔️ 트렌드 탭 순서 바꾸기 — 탭을 꾹 누르면 들리고, 좌우로 끌어 놓는다
   ---------------------------------------------------------
   · 짧게 누르면 평소대로 탭 전환(기존 동작 그대로)
   · 450ms 꾹 → 정렬 모드: 탭이 살짝 떠오르고, 끌면 형제들이 비켜선다
   · 놓으면 그 자리에 고정 + localStorage 저장 → 다음 방문에도 내 순서
   · 조그셔틀에서 배운 것 그대로: 포인터 캡처(벗어나도 유지),
     rAF 프레임당 1회 렌더, 취소돼도 즉시 죽지 않기
   ========================================================= */
(function () {
  const KEY = 'galla_trend_tab_order';
  const HOLD_MS = 450;

  const header = () => document.querySelector('.tabs-header');

  /* ── 저장된 순서 복원 — 새 탭이 생겨도(저장 목록에 없어도) 뒤에 붙어 살아남는다 ── */
  function restore() {
    const h = header();
    if (!h) return;
    let saved;
    try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) {}
    if (!Array.isArray(saved) || !saved.length) return;
    const items = [...h.querySelectorAll('.tab-item')];
    const byKey = Object.fromEntries(items.map(el => [el.dataset.tab, el]));
    saved.forEach(k => { if (byKey[k]) h.appendChild(byKey[k]); });
    items.forEach(el => { if (!saved.includes(el.dataset.tab)) h.appendChild(el); });
  }
  function save() {
    const h = header();
    if (!h) return;
    const order = [...h.querySelectorAll('.tab-item')].map(el => el.dataset.tab);
    try { localStorage.setItem(KEY, JSON.stringify(order)); } catch (_) {}
  }

  function css() {
    if (document.getElementById('tabord-css')) return;
    const s = document.createElement('style');
    s.id = 'tabord-css';
    s.textContent = `
      .tabs-header, .tabs-header *{ -webkit-touch-callout:none !important; -webkit-user-select:none !important; user-select:none !important; -webkit-tap-highlight-color:transparent; }
      .tabs-header .tab-item{ touch-action:pan-x; }
      .tab-item.reordering{
        position:relative;z-index:5;opacity:.95;
        transform:translateX(var(--drag-x,0)) scale(1.08);
        box-shadow:0 10px 26px rgba(0,0,0,.5);
        border-radius:12px;background:rgba(40,44,58,.98)!important;
        transition:none!important;
      }
      .tabs-header.reorder-mode .tab-item:not(.reordering){
        transition:transform .18s cubic-bezier(.2,.9,.3,1);
      }
      .tabs-header.reorder-mode{touch-action:none;overflow-x:hidden;}
      .tabord-hint{
        position:fixed;left:50%;transform:translateX(-50%);
        top:calc(10px + env(safe-area-inset-top,0px));z-index:11500;
        padding:8px 15px;border-radius:999px;
        background:rgba(24,26,34,.96);border:1px solid rgba(255,255,255,.14);
        color:#dfe3ec;font-size:12px;font-weight:800;
        box-shadow:0 10px 30px rgba(0,0,0,.5);pointer-events:none;
      }
      @media (prefers-reduced-motion:reduce){
        .tabs-header.reorder-mode .tab-item:not(.reordering){transition:none;}
      }
    `;
    document.head.appendChild(s);
  }

  function boot() {
    const h = header();
    if (!h || h.dataset.orderBound) return;
    h.dataset.orderBound = '1';
    restore();
    css();
    /* 길게 누르면 브라우저 '텍스트 선택'이 포인터를 가로채 홀드가 죽는다
       (에뮬레이터 실증: 핫트렌드 글자가 파랗게 선택됨). 이벤트 레벨에서 원천 차단. */
    h.addEventListener('selectstart', e => e.preventDefault());
    h.addEventListener('contextmenu', e => e.preventDefault());
    const clearSel = () => { try { const s = window.getSelection(); if (s && s.rangeCount) s.removeAllRanges(); } catch (_) {} };
    h.addEventListener('touchstart', clearSel, { passive: true });

    let holdT = null, drag = null, raf = 0, lastX = 0;

    const hint = (t) => {
      let el = document.querySelector('.tabord-hint');
      if (!t) { el?.remove(); return; }
      if (!el) { el = document.createElement('div'); el.className = 'tabord-hint'; document.body.appendChild(el); }
      el.textContent = t;
    };

    const start = (el, x) => {
      drag = { el, startX: x, baseLeft: el.getBoundingClientRect().left };
      h.classList.add('reorder-mode');
      el.classList.add('reordering');
      hint('좌우로 끌어 순서를 바꾸고, 놓으면 저장돼요');
      /* 페이지 좌우 스와이프는 '누르는 순간' 무장된다 — 정렬 모드가 열리는 시점엔
         이미 드래그가 진행 중이라(조그셔틀과 동일) touchcancel로 확실히 끊는다 */
      try { document.dispatchEvent(new TouchEvent('touchcancel', { bubbles: true })); }
      catch (_) { document.dispatchEvent(new Event('touchcancel', { bubbles: true })); }
      try { navigator.vibrate?.(12); } catch (_) {}
    };

    /* 끄는 동안: 내 탭은 손을 따라가고, 가운데가 이웃의 가운데를 넘으면 자리를 바꾼다.
       insertBefore로 실제 DOM을 옮기고 기준점을 다시 잡는다(장난감 sortable 문법). */
    const render = () => {
      raf = 0;
      if (!drag) return;
      const dx = lastX - drag.startX;
      drag.el.style.setProperty('--drag-x', dx + 'px');
      const mid = drag.el.getBoundingClientRect().left + drag.el.offsetWidth / 2;
      const sibs = [...h.querySelectorAll('.tab-item:not(.reordering)')];
      for (const sib of sibs) {
        const r = sib.getBoundingClientRect();
        const c = r.left + r.width / 2;
        if (dx < 0 && mid < c && sib.compareDocumentPosition(drag.el) & Node.DOCUMENT_POSITION_FOLLOWING) {
          h.insertBefore(drag.el, sib);
          rebase();
          try { navigator.vibrate?.(6); } catch (_) {}
          break;
        }
        if (dx > 0 && mid > c && sib.compareDocumentPosition(drag.el) & Node.DOCUMENT_POSITION_PRECEDING) {
          h.insertBefore(drag.el, sib.nextSibling);
          rebase();
          try { navigator.vibrate?.(6); } catch (_) {}
          break;
        }
      }
    };
    /* DOM을 옮긴 뒤엔 '지금 손 위치'가 새 0점 — 안 하면 탭이 순간이동한다 */
    const rebase = () => {
      drag.el.style.setProperty('--drag-x', '0px');
      drag.startX = lastX;
    };

    const end = (commit) => {
      clearTimeout(holdT); holdT = null;
      cancelAnimationFrame(raf); raf = 0;
      hint(null);
      if (!drag) return;
      const el = drag.el;
      el.classList.remove('reordering');
      el.style.removeProperty('--drag-x');
      h.classList.remove('reorder-mode');
      drag = null;
      if (commit) {
        save();
        el._skipClick = true;                 // 드래그 직후 따라오는 click이 탭을 전환시키지 않게
        setTimeout(() => { el._skipClick = false; }, 350);
      }
    };

    h.addEventListener('pointerdown', e => {
      const el = e.target.closest('.tab-item');
      if (!el) return;
      lastX = e.clientX;
      clearTimeout(holdT);
      holdT = setTimeout(() => {
        try { el.setPointerCapture(e.pointerId); } catch (_) {}
        start(el, lastX);
      }, HOLD_MS);
    });

    h.addEventListener('pointermove', e => {
      lastX = e.clientX;
      if (!drag) {
        /* 아직 정렬 모드 전 — 가로 스크롤·탭 넘김 의도면 홀드 취소 */
        if (holdT && Math.abs(e.movementX) + Math.abs(e.movementY) > 8) { clearTimeout(holdT); holdT = null; }
        return;
      }
      e.preventDefault();
      if (!raf) raf = requestAnimationFrame(render);
    });

    /* 정렬 중 문서 전체의 touchmove를 막는다 — 헤더 가로 스크롤과 페이지가
       손가락을 따라 움직이면 탭을 놓을 자리를 못 잡는다 */
    const blockTouch = e => { if (drag) e.preventDefault(); };
    document.addEventListener('touchmove', blockTouch, { passive: false });

    h.addEventListener('pointerup', () => end(true));
    /* 브라우저가 제스처를 가져가도(스크롤 등) 저장까지는 해준다 — 작업을 날리는 게 최악 */
    h.addEventListener('pointercancel', () => end(true));
    h.addEventListener('contextmenu', e => { if (drag) e.preventDefault(); });

    /* 드래그 직후의 click 무효화 — 캡처 단계에서 가로챈다 */
    h.addEventListener('click', e => {
      const el = e.target.closest('.tab-item');
      if (el?._skipClick) { e.preventDefault(); e.stopPropagation(); }
    }, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
