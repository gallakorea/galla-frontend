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
  const TABS = [
    { id: 'chats',   label: '채팅', icon: '💬' },
    { id: 'friends', label: '친구', icon: '👥' },
    { id: 'rooms',   label: '난장', icon: '🔥' },
    { id: 'pager',   label: '삐삐', icon: '📟' },
  ];
  const HOLD_MS = 380;      // 이보다 길게 눌러야 펼쳐진다
  const RADIUS = 104;       // 부채꼴 반지름
  const PICK_R = 42;        // 이 거리 안에 들어오면 '고른 것'

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
      .njg-item i{font-style:normal;font-size:21px;line-height:1}
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
      .njg-ring{position:absolute;width:54px;height:54px;margin:-27px 0 0 -27px;border-radius:50%;
        border:2px solid rgba(255,255,255,.35);pointer-events:none;
        transition:transform .06s linear}
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
       양끝이 네비에 붙지 않게 212°~328°로 살짝 좁혀 위로 띄운다. */
    const bd = badges();
    const items = TABS.map((t, i) => {
      const deg = 212 + (116 / (TABS.length - 1)) * i;
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
    void layer.getBoundingClientRect();
    layer.classList.add('on');
    try { navigator.vibrate?.(14); } catch (_) {}
    return { layer, items, ring, hint };
  }

  function boot() {
    const btn = document.querySelector('.nav-item.nav-dm, .nav-item[data-page="dm"]');
    if (!btn || btn.dataset.jogBound) return;
    btn.dataset.jogBound = '1';

    let holdT = null, ui = null, picked = null, sx = 0, sy = 0, moved = false;

    const clear = () => {
      clearTimeout(holdT); holdT = null;
      if (ui) { ui.layer.classList.remove('on'); const l = ui.layer; setTimeout(() => l.remove(), 200); }
      ui = null; picked = null;
    };

    const update = (x, y) => {
      if (!ui) return;
      ui.ring.style.transform = `translate(${x - parseFloat(ui.ring.style.left)}px, ${y - parseFloat(ui.ring.style.top)}px)`;
      let best = null, bestD = PICK_R;
      ui.items.forEach(el => {
        const d = Math.hypot(x - el._pos.x, y - el._pos.y);
        if (d < bestD) { bestD = d; best = el; }
      });
      if (best !== picked) {
        ui.items.forEach(el => el.classList.toggle('pick', el === best));
        picked = best;
        if (best) {
          ui.hint.textContent = best.querySelector('b').textContent + ' — 손을 떼면 이동';
          try { navigator.vibrate?.(8); } catch (_) {}
        } else {
          ui.hint.textContent = '손가락을 움직여 고르고, 떼면 이동';
        }
      }
    };

    btn.addEventListener('touchstart', e => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      sx = t.clientX; sy = t.clientY; moved = false;
      clearTimeout(holdT);
      holdT = setTimeout(() => { ui = open(btn, sx, sy); }, HOLD_MS);
    }, { passive: true });

    btn.addEventListener('touchmove', e => {
      const t = e.touches[0];
      if (!ui) {
        // 아직 안 펼쳐졌는데 많이 움직이면 스크롤 의도 — 취소
        if (Math.hypot(t.clientX - sx, t.clientY - sy) > 12) { clearTimeout(holdT); holdT = null; }
        return;
      }
      moved = true;
      e.preventDefault?.();
      update(t.clientX, t.clientY);
    }, { passive: false });

    const end = () => {
      const tab = picked?.dataset.tab;
      const wasOpen = !!ui;
      clear();
      if (!wasOpen) return;                     // 짧게 눌렀으면 기본 동작(링크 이동)에 맡긴다
      if (!tab) { go(null); return; }
      go(tab);
    };
    btn.addEventListener('touchend', end, { passive: true });
    btn.addEventListener('touchcancel', () => clear(), { passive: true });

    /* 펼친 상태에서 떼면 클릭이 뒤따라 발생해 두 번 이동한다 — 막는다 */
    btn.addEventListener('click', e => {
      if (btn._skipClick) { e.preventDefault(); e.stopPropagation(); btn._skipClick = false; }
    }, true);

    function go(tab) {
      btn._skipClick = true;
      setTimeout(() => { btn._skipClick = false; }, 400);
      const onDm = document.body.dataset.page === 'dm';
      if (onDm && window.GALLA_dmSetTab && tab) return window.GALLA_dmSetTab(tab);
      location.href = 'dm.html' + (tab ? '?tab=' + tab : '');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
