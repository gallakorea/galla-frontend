/* =========================================================
   ↔️ 트렌드 탭 순서 바꾸기 — 편집 버튼 방식 (2026-07-22 재설계)
   ---------------------------------------------------------
   · 롱프레스 폐지 — 모바일 브라우저가 롱프레스를 '텍스트 선택'으로 가로채
     iOS/안드로이드 모두에서 정렬이 안 됐다(사장님 실기기 재현).
   · 대신 탭바 우측 끝 '편집(⇄)' 버튼 → 편집 모드: 탭이 흔들리며 드래그로 재배치
     → 완료(✓) 버튼으로 저장·종료. (아이폰 홈화면 앱 정렬 방식)
   · 편집 모드가 아닐 땐 탭이 평소처럼 전환만 됨 — 제스처 충돌 0.
   ========================================================= */
(function () {
  const KEY = 'galla_trend_tab_order';
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
    const order = [...h.querySelectorAll('.tab-item')].map(el => el.dataset.tab).filter(Boolean);
    try { localStorage.setItem(KEY, JSON.stringify(order)); } catch (_) {}
  }

  function css() {
    if (document.getElementById('tabord-css')) return;
    const s = document.createElement('style');
    s.id = 'tabord-css';
    s.textContent = `
      .tabs-header{ position:relative; padding-right:42px !important; }   /* 우측 버튼 자리 확보 — 탭은 그 아래로 스크롤 */
      /* 편집 진입 버튼 — 탭바 우측에 떠서 항상 보임 */
      .taborder-edit{
        position:absolute; right:5px; top:50%; transform:translateY(-50%); z-index:6;
        width:34px; height:34px; display:flex; align-items:center; justify-content:center;
        border:none; border-radius:10px;
        background:rgba(40,44,58,.96); box-shadow:-8px 0 12px rgba(10,10,14,.9);
        color:#aeb4c2; cursor:pointer; -webkit-tap-highlight-color:transparent;
      }
      .taborder-edit:active{ background:rgba(60,66,86,.98); }
      .tabs-header.reorder-mode .taborder-edit{ background:#4361ff; color:#fff; }
      .taborder-edit:active{ background:rgba(255,255,255,.12); }
      .taborder-edit svg{ width:18px; height:18px; }
      .tabs-header.reorder-mode .taborder-edit{ background:#4361ff; color:#fff; }

      /* 편집 모드: 탭이 흔들리고, 텍스트 선택 전면 차단 */
      .tabs-header.reorder-mode .tab-item{
        -webkit-user-select:none !important; user-select:none !important;
        -webkit-touch-callout:none !important; touch-action:none;
        animation:tabWiggle .4s ease-in-out infinite;
      }
      .tabs-header.reorder-mode .tab-item:nth-child(even){ animation-delay:.1s; }
      @keyframes tabWiggle{ 0%,100%{transform:rotate(-1.4deg)} 50%{transform:rotate(1.4deg)} }
      .tab-item.reordering{
        position:relative; z-index:5; opacity:.96;
        transform:translateX(var(--drag-x,0)) scale(1.1) !important;
        animation:none !important;
        box-shadow:0 10px 26px rgba(0,0,0,.5);
        border-radius:12px; background:rgba(40,44,58,.98) !important;
        transition:none !important;
      }
      .tabs-header.reorder-mode .tab-item:not(.reordering){
        transition:transform .18s cubic-bezier(.2,.9,.3,1);
      }
      .taborder-hint{
        position:fixed; left:50%; transform:translateX(-50%);
        top:calc(10px + env(safe-area-inset-top,0px)); z-index:11500;
        padding:8px 15px; border-radius:999px;
        background:rgba(24,26,34,.96); border:1px solid rgba(255,255,255,.14);
        color:#dfe3ec; font-size:12px; font-weight:800;
        box-shadow:0 10px 30px rgba(0,0,0,.5); pointer-events:none;
      }
      @media (prefers-reduced-motion:reduce){
        .tabs-header.reorder-mode .tab-item{ animation:none; }
      }
    `;
    document.head.appendChild(s);
  }

  const PEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 7l-4 5 4 5M16 7l4 5-4 5"/></svg>';
  const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';

  function boot() {
    const h = header();
    if (!h || h.dataset.orderBound) return;
    h.dataset.orderBound = '1';
    restore();
    css();

    // 편집 버튼 주입
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'taborder-edit';
    editBtn.setAttribute('aria-label', '탭 순서 편집');
    editBtn.innerHTML = PEN;
    h.appendChild(editBtn);

    let editing = false, drag = null, raf = 0, lastX = 0;

    function hint(t) {
      let el = document.querySelector('.taborder-hint');
      if (!t) { el?.remove(); return; }
      if (!el) { el = document.createElement('div'); el.className = 'taborder-hint'; document.body.appendChild(el); }
      el.textContent = t;
    }

    function enterEdit() {
      editing = true;
      h.classList.add('reorder-mode');
      editBtn.innerHTML = CHECK;
      hint('탭을 끌어 순서를 바꾸고, ✓ 를 눌러 저장하세요');
      try { navigator.vibrate?.(12); } catch (_) {}
    }
    function exitEdit() {
      editing = false;
      h.classList.remove('reorder-mode');
      editBtn.innerHTML = PEN;
      hint(null);
      save();
    }
    editBtn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      editing ? exitEdit() : enterEdit();
    });

    /* ── 편집 모드에서만 동작하는 드래그 정렬 ── */
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
          h.insertBefore(drag.el, sib); rebase(); try { navigator.vibrate?.(6); } catch (_) {} break;
        }
        if (dx > 0 && mid > c && sib.compareDocumentPosition(drag.el) & Node.DOCUMENT_POSITION_PRECEDING) {
          h.insertBefore(drag.el, sib.nextSibling); rebase(); try { navigator.vibrate?.(6); } catch (_) {} break;
        }
      }
    };
    const rebase = () => { drag.el.style.setProperty('--drag-x', '0px'); drag.startX = lastX; };

    h.addEventListener('pointerdown', (e) => {
      if (!editing) return;                       // 편집 모드에서만
      const el = e.target.closest('.tab-item');
      if (!el) return;
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
      lastX = e.clientX;
      drag = { el, startX: e.clientX };
      el.classList.add('reordering');
    });
    h.addEventListener('pointermove', (e) => {
      if (!drag) return;
      lastX = e.clientX;
      e.preventDefault();
      if (!raf) raf = requestAnimationFrame(render);
    });
    const endDrag = () => {
      cancelAnimationFrame(raf); raf = 0;
      if (!drag) return;
      drag.el.classList.remove('reordering');
      drag.el.style.removeProperty('--drag-x');
      drag = null;
      save();   // 실시간 저장 — ✓ 안 눌러도 안전
    };
    h.addEventListener('pointerup', endDrag);
    h.addEventListener('pointercancel', endDrag);
    // 편집 모드 중 텍스트 선택·컨텍스트 메뉴 원천 차단
    h.addEventListener('selectstart', (e) => { if (editing) e.preventDefault(); });
    h.addEventListener('contextmenu', (e) => { if (editing) e.preventDefault(); });
    // 편집 모드에서 탭 클릭(전환) 차단 — 정렬 중 실수 전환 방지
    h.addEventListener('click', (e) => {
      if (editing && e.target.closest('.tab-item')) { e.preventDefault(); e.stopPropagation(); }
    }, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
