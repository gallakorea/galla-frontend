/* =========================================================
   🎛 네비 조그셔틀 — 메시지 아이콘을 꾹 누르면 부채꼴로 펼쳐지고,
   손가락을 움직여 탭(채팅·친구·난장·삐삐)을 고른 뒤 떼면 그리로 바로 간다.
   ---------------------------------------------------------
   왜 만드나: DM에 들어가서 → 탭을 찾아 누르는 두 단계를, 한 동작으로 줄인다.
   원칙:
     · 짧게 누르면 평소대로 DM 열기(기존 동작을 방해하지 않는다)
     · 길게 눌러야 펼쳐진다(오작동 방지 380ms)
     · 손가락을 떼는 순간 '그때 골라져 있던 것'이 실행된다(조그셔틀 문법)
     · 아무것도 안 고르고 떼면 그냥 DM 열기
   ========================================================= */
(function () {
  const I = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const TABS = [
    { id: 'chats',   label: '채팅',
      icon: I('<path d="M21 11.5a8.4 8.4 0 0 1-8.4 8.4 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 0 1-.9-3.8 8.4 8.4 0 0 1 8.4-8.4h.5a8.5 8.5 0 0 1 8.1 8.1z"/>') },
    { id: 'friends', label: '친구',
      icon: I('<path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9.5" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>') },
    { id: 'rooms',   label: '난장',
      icon: I('<path d="M12 2s4.5 4.2 4.5 8.2a4.5 4.5 0 0 1-9 0c0-1.3.5-2.5 1.2-3.6"/><path d="M12 22a6 6 0 0 0 6-6c0-2-1-3.6-2.2-5"/><path d="M12 22a6 6 0 0 1-6-6c0-1.4.5-2.6 1.3-3.8"/>') },
    { id: 'pager',   label: '삐삐',
      icon: I('<rect x="2" y="5" width="20" height="14" rx="2.4"/><rect x="5" y="8" width="9" height="5" rx="1"/><circle cx="17.5" cy="9.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="17.5" cy="14.5" r="1.1" fill="currentColor" stroke="none"/>') },
  ];
  const HOLD_MS = 380;      // 이보다 길게 눌러야 펼쳐진다
  const RADIUS = 104;       // 부채꼴 반지름
  const DEAD_R = 14;        // 이 안쪽만 취소. 나머지는 거리와 무관하게 '방향'으로 다 잡힌다
  const STICKY = 10;        // 이미 고른 것은 10° 이상 확실히 벗어나야 바뀐다(경계 깜빡임 방지)

  function css() {
    if (document.getElementById('navjog-css')) return;
    const s = document.createElement('style');
    s.id = 'navjog-css';
    s.textContent = `
      #nav-jog{position:fixed;inset:0;z-index:2147483200;pointer-events:none;
        background:radial-gradient(60% 40% at var(--jx) var(--jy), rgba(6,8,14,.82), rgba(6,8,14,.55) 60%, rgba(6,8,14,.2));
        opacity:0;transition:opacity .18s ease}
      #nav-jog.on{opacity:1}
      .njg-item{position:absolute;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:22px;
        display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;
        background:rgba(24,26,34,.96);border:1px solid rgba(255,255,255,.14);
        box-shadow:0 12px 30px rgba(0,0,0,.55);
        transform:translate(0,0) scale(.3);opacity:0;
        transition:transform .26s cubic-bezier(.2,1.3,.3,1),opacity .18s,background .15s,border-color .15s}
      #nav-jog.on .njg-item{transform:translate(var(--dx),var(--dy)) scale(1);opacity:1}
      .njg-item i{font-style:normal;display:flex;line-height:0;color:#cdd9ff}
      .njg-item i svg{width:22px;height:22px}
      .njg-item.pick i{color:#fff}
      .njg-item b{font-size:10.5px;font-weight:900;color:#cfd5e0}
      .njg-item .njg-n{position:absolute;top:-5px;right:-5px;min-width:17px;height:17px;padding:0 4px;
        border-radius:999px;background:#ff4d67;border:2px solid #0a0b0f;color:#fff;
        font-size:9.5px;font-weight:900;display:flex;align-items:center;justify-content:center}
      /* 지금 골라진 것 — 크게, 밝게 */
      .njg-item.pick{background:var(--accent-grad,linear-gradient(135deg,#6a7bff,#3a5bff));
        border-color:transparent;box-shadow:0 14px 36px rgba(58,91,255,.5)}
      #nav-jog.on .njg-item.pick{transform:translate(var(--dx),var(--dy)) scale(1.18)}
      .njg-item.pick b{color:#fff}
      /* 손가락 위치를 따라다니는 링 */
      /* 링은 손가락을 매 프레임 직접 따라간다 — transition을 걸면 한 박자 늦어 끈적인다 */
      .njg-ring{position:absolute;width:54px;height:54px;margin:-27px 0 0 -27px;border-radius:50%;
        border:2px solid rgba(255,255,255,.35);pointer-events:none;will-change:transform}
      .njg-hint{position:absolute;left:0;right:0;text-align:center;font-size:12px;font-weight:800;
        color:#aab2c0;text-shadow:0 1px 4px rgba(0,0,0,.8)}
      @media (prefers-reduced-motion:reduce){
        #nav-jog,.njg-item{transition:none}
        #nav-jog.on .njg-item{transform:translate(var(--dx),var(--dy)) scale(1)}
      }
    `;
    document.head.appendChild(s);
  }

  /* 안 읽은 수를 탭별로 얹어준다 — 고르기 전에 어디에 소식이 있는지 보인다 */
  function badges() {
    const out = {};
    const nav = document.getElementById('navDmBadge');
    if (nav && !nav.hidden) out.chats = nav.textContent;      // 합산값(대략)
    return out;
  }

  function open(btn, ox, oy) {
    css();
    let layer = document.getElementById('nav-jog');
    if (layer) layer.remove();
    layer = document.createElement('div');
    layer.id = 'nav-jog';
    layer.style.setProperty('--jx', ox + 'px');
    layer.style.setProperty('--jy', oy + 'px');

    /* 위쪽 반원에 부채꼴로 배치 — 아래는 네비·손가락이라 가린다.
       200°~340°로 넓게 펼쳐 '위로 올리는' 동작에서도 방향이 또렷하게 갈린다. */
    const bd = badges();
    const items = TABS.map((t, i) => {
      const deg = 200 + (140 / (TABS.length - 1)) * i;
      const rad = deg * Math.PI / 180;
      const dx = Math.cos(rad) * RADIUS, dy = Math.sin(rad) * RADIUS;
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'njg-item';
      el.dataset.tab = t.id;
      el.style.left = ox + 'px';
      el.style.top = oy + 'px';
      el.style.setProperty('--dx', dx + 'px');
      el.style.setProperty('--dy', dy + 'px');
      el.style.transitionDelay = (i * 26) + 'ms';
      el.innerHTML = `<i>${t.icon}</i><b>${t.label}</b>` +
        (bd[t.id] ? `<span class="njg-n">${bd[t.id]}</span>` : '');
      el._pos = { x: ox + dx, y: oy + dy };
      el._deg = deg;                      // 각도로 고르기 위해 기억
      layer.appendChild(el);
      return el;
    });

    const ring = document.createElement('div');
    ring.className = 'njg-ring';
    ring.style.left = ox + 'px'; ring.style.top = oy + 'px';
    layer.appendChild(ring);

    const hint = document.createElement('div');
    hint.className = 'njg-hint';
    hint.style.top = (oy - RADIUS - 66) + 'px';
    hint.textContent = '손가락을 움직여 고르고, 떼면 이동';
    layer.appendChild(hint);

    document.body.appendChild(layer);
    document.body.style.overscrollBehavior = 'none';
    /* ⚠️ 네비의 좌우 페이지 스와이프가 같이 동작하면 화면이 밀려 고르기 힘들다.
       overlayOpen()이 #nav-jog를 보고 멈추지만, 이미 시작된 드래그는
       touchcancel을 보내 확실히 끊는다. */
    try {
      document.dispatchEvent(new TouchEvent('touchcancel', { bubbles: true }));
    } catch (_) {
      document.dispatchEvent(new Event('touchcancel', { bubbles: true }));
    }
    void layer.getBoundingClientRect();
    layer.classList.add('on');
    try { navigator.vibrate?.(14); } catch (_) {}
    return { layer, items, ring, hint };
  }

  function boot() {
    const btn = document.querySelector('.nav-item.nav-dm, .nav-item[data-page="dm"]');
    if (!btn || btn.dataset.jogBound) return;
    btn.dataset.jogBound = '1';
    /* 이 버튼 위에서는 브라우저 스크롤·확대 제스처를 쓰지 않는다.
       ⚠️ 이게 없으면 손가락이 움직이는 순간 브라우저가 제스처를 가져가면서
       touchcancel이 날아와 메뉴가 사라진다 — '고르러 가다 없어지던' 원인. */
    btn.style.touchAction = 'none';

    let holdT = null, ui = null, picked = null, sx = 0, sy = 0;
    let raf = 0, lastX = 0, lastY = 0;

    const clear = () => {
      clearTimeout(holdT); holdT = null;
      cancelAnimationFrame(raf); raf = 0;
      if (ui) { const l = ui.layer; l.classList.remove('on'); setTimeout(() => l.remove(), 200); }
      document.body.style.overscrollBehavior = '';
      ui = null; picked = null;
    };

    /* 각도로 고른다 — 거리 원 안에 정확히 들어가야 하는 방식은 손이 조금만
       빗나가도 선택이 풀려 뚝뚝 끊긴다. 조그셔틀처럼 '방향'만 맞으면 잡힌다. */
    const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
    const pickFor = (x, y) => {
      const dx = x - sx, dy = y - sy;
      if (Math.hypot(dx, dy) < DEAD_R) return null;
      const deg = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
      let best = null, bestD = 1e9;
      ui.items.forEach(el => {
        const d = angDiff((el._deg + 360) % 360, deg);
        if (d < bestD) { bestD = d; best = el; }
      });
      /* 경계에서 두 항목이 엎치락뒤치락하면 깜빡여서 '해제된 것처럼' 보인다 —
         이미 고른 게 있으면 확실히(10° 이상) 더 가까워질 때만 바꾼다. */
      if (picked && best !== picked) {
        const cur = angDiff((picked._deg + 360) % 360, deg);
        if (cur - bestD < STICKY) return picked;
      }
      return best;
    };

    const draw = () => {
      raf = 0;
      if (!ui) return;
      const x = lastX, y = lastY;
      ui.ring.style.transform = `translate(${x - sx}px, ${y - sy}px)`;
      const best = pickFor(x, y);
      if (best !== picked) {
        ui.items.forEach(el => el.classList.toggle('pick', el === best));
        picked = best;
        ui.hint.textContent = best
          ? best.querySelector('b').textContent + ' — 손을 떼면 이동'
          : '방향으로 고르세요 · 가운데는 취소';
        try { navigator.vibrate?.(8); } catch (_) {}
      }
    };
    const queue = (x, y) => {
      lastX = x; lastY = y;
      if (!raf) raf = requestAnimationFrame(draw);   // 매 프레임 한 번만 그린다
    };

    /* ⚠️ 아이폰은 화면 맨 아래에서 위로 미는 동작을 '홈 제스처'로 가로채며
       pointercancel을 던진다. 네비가 바로 그 자리에 있어서, 위로 올리면
       포인터가 끊기고 선택이 풀렸다(제보).
       → ① 취소돼도 메뉴를 닫지 않는다 ② 문서 전체에서 touch 이벤트로 계속 추적한다
         ③ 손을 떼는 건 어떤 경로로든(pointerup·touchend) 받는다 */
    let docBound = false;
    const onMove = (x, y) => { if (ui) queue(x, y); };
    const docPointerMove = e => { if (ui) { e.preventDefault?.(); onMove(e.clientX, e.clientY); } };
    const docTouchMove = e => {
      if (!ui || !e.touches[0]) return;
      e.preventDefault();                       // 페이지가 따라 움직이지 않게
      onMove(e.touches[0].clientX, e.touches[0].clientY);
    };
    const docEnd = e => {
      if (!ui) { unbindDoc(); return; }
      const t = e.changedTouches && e.changedTouches[0];
      if (t) onMove(t.clientX, t.clientY);      // 뗀 위치 기준으로 마지막 판정
      finish(e);
    };
    function bindDoc() {
      if (docBound) return;
      docBound = true;
      document.addEventListener('pointermove', docPointerMove, { passive: false });
      document.addEventListener('touchmove', docTouchMove, { passive: false });
      document.addEventListener('pointerup', docEnd);
      document.addEventListener('touchend', docEnd);
    }
    function unbindDoc() {
      if (!docBound) return;
      docBound = false;
      document.removeEventListener('pointermove', docPointerMove, { passive: false });
      document.removeEventListener('touchmove', docTouchMove, { passive: false });
      document.removeEventListener('pointerup', docEnd);
      document.removeEventListener('touchend', docEnd);
    }

    btn.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      sx = e.clientX; sy = e.clientY;
      try { btn.setPointerCapture(e.pointerId); } catch (_) {}
      clearTimeout(holdT);
      holdT = setTimeout(() => { ui = open(btn, sx, sy); bindDoc(); }, HOLD_MS);
    });

    btn.addEventListener('pointermove', e => {
      if (!ui) {
        if (Math.hypot(e.clientX - sx, e.clientY - sy) > 14) { clearTimeout(holdT); holdT = null; }
        return;
      }
      e.preventDefault();
      queue(e.clientX, e.clientY);
    });

    function finish(e) {
      const wasOpen = !!ui;
      const tab = picked?.dataset.tab;
      try { if (e?.pointerId != null) btn.releasePointerCapture(e.pointerId); } catch (_) {}
      unbindDoc();
      clear();
      if (!wasOpen) return;
      go(tab || null);
    }
    btn.addEventListener('pointerup', finish);
    /* 취소가 와도 닫지 않는다 — iOS 홈 제스처 때문에 자주 온다.
       문서 touch 이벤트가 계속 추적하고, 손을 뗄 때 확정된다. */
    btn.addEventListener('pointercancel', () => { if (!ui) clear(); });
    btn.addEventListener('contextmenu', e => { if (ui) e.preventDefault(); });

    btn.addEventListener('click', e => {
      if (btn._skipClick) { e.preventDefault(); e.stopPropagation(); btn._skipClick = false; }
    }, true);

    function go(tab) {
      btn._skipClick = true;
      setTimeout(() => { btn._skipClick = false; }, 400);
      const onDm = document.body.dataset.page === 'dm';
      if (onDm && window.GALLA_dmSetTab && tab) return window.GALLA_dmSetTab(tab);
      // 셸 안이면 페이지 이동 대신 셸 전환(판 상주 유지)
      if (window.GALLA_shellGo) { window.GALLA_shellGo('dm', tab || null); return; }
      location.href = 'dm.html' + (tab ? '?tab=' + tab : '');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
