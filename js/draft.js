/* =========================================================
   📝 GALLA 공용 임시저장(draft) — 모든 글쓰기 공통 (2026-07-23)
   ---------------------------------------------------------
   · 입력할 때마다 자동 저장(디바운스 0.4s) → 실수로 나가도 안 날아간다.
   · 재진입 시 조용히 복원 + "이어서 작성 중" 토스트.
   · 저장될 때마다 '저장됨' 미세 표시(안심 신호).
   · 발행 성공 시 clear(). 7일 지나면 자동 만료.
   사용:
     const d = GALLA_draft('plaza', ['plaza-title','plaza-body','plaza-category']);
     d.restore();                 // 폼 만들어진 뒤 1회
     ... 발행 성공 시 d.clear();
   ========================================================= */
(function () {
  const PREFIX = 'galla_draft_';
  const MAX_AGE = 30 * 24 * 3600 * 1000;   // 30일 보관(인스타 초안 방식)

  function css() {
    if (document.getElementById('galla-draft-css')) return;
    const s = document.createElement('style'); s.id = 'galla-draft-css';
    s.textContent = `
      #galla-draft-chip{position:fixed;left:50%;bottom:calc(90px + env(safe-area-inset-bottom,0px));
        transform:translateX(-50%) translateY(6px);z-index:2147483401;
        display:flex;align-items:center;gap:6px;padding:7px 14px;border-radius:999px;
        background:rgba(24,26,34,.96);border:1px solid rgba(255,255,255,.12);
        color:#cfd5e0;font-size:12px;font-weight:800;
        box-shadow:0 8px 24px rgba(0,0,0,.5);opacity:0;pointer-events:none;
        transition:opacity .18s ease,transform .18s ease}
      #galla-draft-chip.on{opacity:1;transform:translateX(-50%) translateY(0)}
      #galla-draft-chip b{color:#8fe3a0}
    `;
    document.head.appendChild(s);
  }
  function chip(msg, accent) {
    css();
    let c = document.getElementById('galla-draft-chip');
    if (!c) { c = document.createElement('div'); c.id = 'galla-draft-chip'; document.body.appendChild(c); }
    c.innerHTML = accent ? `<b>${msg}</b>` : msg;
    requestAnimationFrame(() => c.classList.add('on'));
    clearTimeout(c._h);
    c._h = setTimeout(() => c.classList.remove('on'), accent ? 2400 : 1400);
  }

  window.GALLA_draft = function (key, ids) {
    const K = PREFIX + key;
    const els = () => ids.map(id => document.getElementById(id)).filter(Boolean);
    const read = () => { const o = {}; els().forEach(e => { o[e.id] = e.value; }); return o; };
    const hasText = (o) => Object.values(o).some(v => v && String(v).trim());

    let saveT = null;
    const save = () => {
      clearTimeout(saveT);
      saveT = setTimeout(() => {
        const o = read();
        if (!hasText(o)) { try { localStorage.removeItem(K); } catch (_) {} return; }
        try { localStorage.setItem(K, JSON.stringify({ v: o, t: Date.now() })); } catch (_) {}
        chip('임시저장됨');
      }, 400);
    };
    // 디바운스 무시하고 지금 즉시 저장(임시저장 버튼 등에서)
    const saveNow = () => {
      clearTimeout(saveT);
      const o = read();
      if (!hasText(o)) { try { localStorage.removeItem(K); } catch (_) {} return; }
      try { localStorage.setItem(K, JSON.stringify({ v: o, t: Date.now() })); } catch (_) {}
    };
    // 유효한(만료 안 된, 내용 있는) 임시저장이 있는지
    const has = () => {
      let d; try { d = JSON.parse(localStorage.getItem(K) || 'null'); } catch (_) { return false; }
      if (!d || !d.v) return false;
      if (Date.now() - (d.t || 0) > MAX_AGE) return false;
      return hasText(d.v);
    };
    const clear = () => { clearTimeout(saveT); try { localStorage.removeItem(K); } catch (_) {} };
    const restore = () => {
      let d; try { d = JSON.parse(localStorage.getItem(K) || 'null'); } catch (_) { return false; }
      if (!d || !d.v) return false;
      if (Date.now() - (d.t || 0) > MAX_AGE) { clear(); return false; }
      if (!hasText(d.v)) return false;
      els().forEach(e => {
        const val = d.v[e.id];
        if (val != null && val !== '' && !e.value) {   // 이미 입력된 값은 덮지 않음
          e.value = val;
          e.dispatchEvent(new Event('input', { bubbles: true }));
          e.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      setTimeout(() => chip('📝 이어서 작성 중이에요', true), 350);
      return true;
    };

    // 자동 저장 바인딩(중복 방지)
    els().forEach(e => {
      if (e.dataset.draftBound) return;
      e.dataset.draftBound = '1';
      ['input', 'change'].forEach(ev => e.addEventListener(ev, save));
    });

    return { save, saveNow, restore, clear, has };
  };
})();
