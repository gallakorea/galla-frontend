/* =========================================================
   🎛 네비 조그셔틀 — 네비 아이콘을 꾹 누르면 부채꼴로 펼쳐지고,
   손가락을 움직여 항목을 고른 뒤 떼면 그리로 바로 간다.
   ---------------------------------------------------------
   왜 만드나: 들어가서 → 탭을 찾아 누르는 두 단계를, 한 동작으로 줄인다.
   원칙:
     · 짧게 누르면 평소대로 열기(기존 동작을 방해하지 않는다)
     · 길게 눌러야 펼쳐진다(오작동 방지 380ms)
     · 손가락을 떼는 순간 '그때 골라져 있던 것'이 실행된다(조그셔틀 문법)
     · 아무것도 안 고르고 떼면 그냥 기본 열기
   대상: DM 버튼(채팅·친구·난장·삐삐), 트렌드 버튼(검색·핫트렌드·뉴스·핫튜브·광장).
   트렌드 조그는 사용자가 저장한 탭 순서(galla_trend_tab_order)를 그대로 따른다.
   ========================================================= */
(function () {
  /* 📳 햅틱 — iOS WKWebView는 navigator.vibrate가 안 먹으므로 Capacitor Haptics로. 웹은 vibrate 폴백.
     조그 열림/항목 이동마다 진동을 '전부' 느끼게(사장님). */
  function hapt(kind) {
    try {
      const H = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics;
      if (H) {
        if (kind === "open" && H.impact) return void H.impact({ style: "Medium" });
        if (H.selectionChanged) return void H.selectionChanged();
        if (H.impact) return void H.impact({ style: "Light" });
        return;
      }
    } catch (_) {}
    try { navigator.vibrate?.(kind === "open" ? 14 : 8); } catch (_) {}
  }
  const I = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

  const DM_TABS = [
    { id: 'chats',   label: '채팅',
      icon: I('<path d="M21 11.5a8.4 8.4 0 0 1-8.4 8.4 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 0 1-.9-3.8 8.4 8.4 0 0 1 8.4-8.4h.5a8.5 8.5 0 0 1 8.1 8.1z"/>') },
    { id: 'friends', label: '친구',
      icon: I('<path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9.5" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>') },
    { id: 'rooms',   label: '난장',
      icon: I('<path d="M12 2s4.5 4.2 4.5 8.2a4.5 4.5 0 0 1-9 0c0-1.3.5-2.5 1.2-3.6"/><path d="M12 22a6 6 0 0 0 6-6c0-2-1-3.6-2.2-5"/><path d="M12 22a6 6 0 0 1-6-6c0-1.4.5-2.6 1.3-3.8"/>') },
    { id: 'pager',   label: '삐삐',
      icon: I('<rect x="2" y="5" width="20" height="14" rx="2.4"/><rect x="5" y="8" width="9" height="5" rx="1"/><circle cx="17.5" cy="9.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="17.5" cy="14.5" r="1.1" fill="currentColor" stroke="none"/>') },
  ];

  /* 트렌드 허브 탭 — search.html 탭바와 같은 항목·아이콘 톤 */
  const TREND_TABS = [
    { id: 'search',   label: '검색',
      icon: I('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>') },
    { id: 'trending', label: '핫트렌드',
      icon: I('<path d="M12 22a7 7 0 0 0 7-7c0-4-3-6-4.5-9.5C14 8 12.5 8.5 11 7 9 9 8.5 10.5 8.5 12c0 1-1 1.5-1.5 1-.7 1-2 2-2 2a7 7 0 0 0 7 7z"/>') },
    { id: 'news',     label: '뉴스',
      icon: I('<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h9A1.5 1.5 0 0 1 16 5.5V18a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2V5.5z"/><path d="M16 9h2.5A1.5 1.5 0 0 1 20 10.5V18a2 2 0 0 1-2 2"/><path d="M7.5 8h5M7.5 11.5h5M7.5 15h3"/>') },
    { id: 'hot',      label: '핫튜브',
      /* 유튜브 섹션으로 가는 항목 → 공식 아이콘(무변형·풀컬러) */
      icon: '<svg class="yt-official" width="28.4" height="20" viewBox="0 3.545 24 16.91" xmlns="http://www.w3.org/2000/svg" aria-label="YouTube"><path fill="#FF0000" d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z"/><path fill="#fff" d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>' },
    { id: 'plaza',    label: '광장',
      icon: I('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>') },
  ];
  /* 마이페이지 탭 조그 — 모아/갈라/숏판/롱판/예측/광장(마이페이지 탭바와 동일 순서). */
  const MY_ICONS = {
    all:     I('<rect x="3" y="3" width="7" height="7" rx="1.4"/><rect x="14" y="3" width="7" height="7" rx="1.4"/><rect x="3" y="14" width="7" height="7" rx="1.4"/><rect x="14" y="14" width="7" height="7" rx="1.4"/>'),
    galla:   I('<path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/>'),
    short:   I('<rect x="7.5" y="3" width="9" height="18" rx="2.2"/>'),      // 세로 비율
    long:    I('<rect x="3" y="6" width="18" height="12" rx="2.2"/>'),       // 가로 비율
    predict: I('<path d="M3 17l6-6 4 4 7-7"/><path d="M17 7h4v4"/>'),
    plaza:   I('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>'),
  };
  // 마이페이지 탭바가 아직 렌더 전이면(첫 조그) 이 기본값을 쓴다 — 탭 전체(숏판·롱판 포함)를 담아
  // '두 번째에야 다 뜨는' 버그 방지. (탭바가 뜨면 live가 우선이라 숨김 탭은 자동 반영된다.)
  const MY_DEFAULT = [
    { id: 'all', label: '모아', icon: MY_ICONS.all },
    { id: 'galla', label: '갈라', icon: MY_ICONS.galla },
    { id: 'short', label: '숏판', icon: MY_ICONS.short },
    { id: 'long', label: '롱판', icon: MY_ICONS.long },
    { id: 'predict', label: '예측', icon: MY_ICONS.predict },
    { id: 'plaza', label: '광장', icon: MY_ICONS.plaza },
  ];
  /* 마이페이지에 있으면 실제 보이는 탭바를 그대로(숨김 숏판/롱판 반영), 아니면 기본 4탭. */
  function mypageTabs() {
    const live = Array.from(document.querySelectorAll('.tabs .tab[data-tab]')).filter(t => !t.hidden);
    if (live.length) return live.map(t => ({ id: t.dataset.tab, label: t.textContent.trim(), icon: MY_ICONS[t.dataset.tab] || '' }));
    return MY_DEFAULT;
  }

  /* 사용자가 저장한 탭 순서를 조그에도 반영 — 탭바와 조그가 항상 같은 순서.
     열 때마다 읽는다(설정 시트에서 방금 바꾼 순서도 즉시 반영). */
  function trendTabsOrdered() {
    let saved; try { saved = JSON.parse(localStorage.getItem('galla_trend_tab_order') || 'null'); } catch (_) {}
    if (!Array.isArray(saved) || !saved.length) return TREND_TABS;
    const byId = Object.fromEntries(TREND_TABS.map(t => [t.id, t]));
    const out = saved.map(k => byId[k]).filter(Boolean);
    TREND_TABS.forEach(t => { if (!saved.includes(t.id)) out.push(t); });
    return out;
  }

  /* ➕ 글쓰기(＋) 조그 — 갈라/갈라리/예측/광장. 짧게 탭=create.html(기존), 꾹=조그로 바로 선택. */
  const WRITE_ICONS = {
    galla:   I('<path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/>'),
    gallari: I('<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="12" cy="12" r="3.5"/><circle cx="17" cy="7" r="1.2"/>'),
    predict: I('<path d="M3 17l6-6 4 4 7-7"/><path d="M17 7h4v4"/>'),
    plaza:   I('<path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.5 8.6 8.6 0 0 1-3.9-.9L3.5 20.5l1.4-5.1a8.4 8.4 0 0 1-.9-3.9A8.4 8.4 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5z"/>'),
  };
  const WRITE_ROUTE = { galla: 'write.html', short: 'gallari-write.html?kind=vertical', long: 'gallari-write.html?kind=horizontal', predict: 'galla-predict.html?compose=1', plaza: 'plaza.html?compose=1' };
  const WRITE_TABS = [
    { id: 'galla', label: '갈라', icon: WRITE_ICONS.galla },
    { id: 'short', label: '숏판', icon: WRITE_ICONS.gallari },
    { id: 'long', label: '롱판', icon: WRITE_ICONS.gallari },
    { id: 'predict', label: '예측', icon: WRITE_ICONS.predict },
    { id: 'plaza', label: '광장', icon: WRITE_ICONS.plaza },
  ];
  const WRITE_CFG = {
    tabs: () => WRITE_TABS,
    go(type) {
      // 가운데/취소(null) → 전체 선택 페이지(기존 짧은탭 동작과 동일). 선택 → 해당 작성 화면으로.
      //   갈라(발제)·숏판·롱판은 권한/피처 게이팅이 있어 create.html이 안전(잠금 표시) — 거기로 보낸다.
      //   예측·광장은 바로.
      const go = (u) => (window.GALLA_nav || function (x) { location.href = x; })(u);
      if (!type || type === 'galla' || type === 'short' || type === 'long') { go('create.html'); return; }
      go(WRITE_ROUTE[type] || 'create.html');
    },
  };
  // ＋(글쓰기) 버튼에 조그를 건다. 페이지마다 새로 생기므로 신규 버튼도 관찰해 바인딩.
  function bindWriteJogs() {
    document.querySelectorAll('[data-write-hub], #hdrWrite').forEach(b => bindJog(b, WRITE_CFG));
  }

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

  /* 안 읽은 수를 탭별로 얹어준다 — 고르기 전에 어디에 소식이 있는지 보인다 (DM 전용) */
  function dmBadges() {
    const out = {};
    const nav = document.getElementById('navDmBadge');
    if (nav && !nav.hidden) out.chats = nav.textContent;      // 합산값(대략)
    return out;
  }

  function open(tabs, badges, ox, oy) {
    css();
    let layer = document.getElementById('nav-jog');
    if (layer) layer.remove();
    layer = document.createElement('div');
    layer.id = 'nav-jog';
    layer.style.setProperty('--jx', ox + 'px');
    layer.style.setProperty('--jy', oy + 'px');

    /* 위쪽 반원에 부채꼴로 배치 — 아래는 네비·손가락이라 가린다.
       ⚠️ 버튼이 화면 좌/우 끝(예: 마이페이지=우측 끝)이면 부채꼴이 화면 밖으로
       넘쳐 항목이 잘린다(사장님 재현). 버튼의 가로 위치(frac)에 따라 부채꼴을
       화면 '안쪽'으로 기울이고, 가장자리일수록 좁게 펴 잘림을 막는다. */
    const vw = window.innerWidth || document.documentElement.clientWidth || 400;
    const vh = window.innerHeight || document.documentElement.clientHeight || 800;
    const frac = Math.max(0, Math.min(1, ox / vw));   // 0=좌단 · 1=우단
    const lean = 0.5 - frac;                          // 우측 버튼일수록 음수
    // 🔽 버튼이 화면 상단(＋ 등)이면 아래로, 하단(네비)이면 위로 펼친다 — 잘림 방지.
    const fanDown = oy < vh * 0.4;
    const centerDeg = fanDown ? (90 - lean * 80) : (270 + lean * 80);  // 아래(90)/위(270) 기준, 안쪽으로 기울임
    const spanDeg = Math.max(95, 150 - Math.abs(lean) * 110);  // 가장자리일수록 좁게
    const startDeg = centerDeg - spanDeg / 2;
    const bd = badges ? badges() : {};
    const items = tabs.map((t, i) => {
      const deg = tabs.length > 1 ? startDeg + (spanDeg / (tabs.length - 1)) * i : centerDeg;
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
    hapt("open");
    return { layer, items, ring, hint };
  }

  /* ── 공용 바인더 — 버튼 하나에 조그 문법 전체(홀드·각도 선택·마무리·자가 회수)를 건다.
     cfg: { tabs():[]  badges()?:{}  go(tabId|null) } */
  function bindJog(btn, cfg) {
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
      unbindDoc();   // ⚠️ 문서 리스너를 반드시 함께 제거 — 안 하면 docTouchMove의
                     // preventDefault가 남아 '조그 뒤 모든 제스처가 막힘'(사장님 재현).
    };
    /* 앱이 백그라운드로 갈 때만 안전 회수 — pointerup/pointercancel로는 절대 닫지
       않는다(정상 종료는 finish가, iOS 홈 제스처의 잦은 취소는 무시가 원칙). */
    const forceClose = () => { if (ui || docBound) clear(); };
    window.addEventListener('blur', forceClose);
    document.addEventListener('visibilitychange', () => { if (document.hidden) forceClose(); });

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
        hapt("pick");
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

    /* 손가락이 실제로 붙어 있는지 — 포인터가 취소돼도 touch 이벤트로 계속 안다.
       ⚠️ 안드로이드 웹뷰는 상태에 따라 롱프레스 도중 pointercancel을 던지는데,
       예전엔 그게 홀드 타이머를 죽여 '조그가 아예 안 열림'(앱 재시작 전까지)이
       됐다(사장님 재현: 페이지 왔다갔다 후 트렌드에서 DM·트렌드 조그 먹통). */
    let touchOn = false;
    btn.addEventListener('touchstart', () => { touchOn = true; }, { passive: true });
    document.addEventListener('touchend', () => {
      touchOn = false;
      if (!ui && holdT) { clearTimeout(holdT); holdT = null; }   // 홀드 전 손 뗌 → 평소 탭
    }, true);
    document.addEventListener('touchcancel', () => { touchOn = false; }, true);
    // 홀드 전 스크롤 의도(이동 14px+) — pointermove가 cancel로 끊겨도 touch로 감지
    btn.addEventListener('touchmove', e => {
      const t = e.touches[0];
      if (!ui && holdT && t && Math.hypot(t.clientX - sx, t.clientY - sy) > 14) {
        clearTimeout(holdT); holdT = null;
      }
    }, { passive: true });

    btn.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      sx = e.clientX; sy = e.clientY;
      try { btn.setPointerCapture(e.pointerId); } catch (_) {}
      clearTimeout(holdT);
      holdT = setTimeout(() => { ui = open(cfg.tabs(), cfg.badges, sx, sy); bindDoc(); }, HOLD_MS);
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
      btn._skipClick = true;
      setTimeout(() => { btn._skipClick = false; }, 400);
      cfg.go(tab || null);
    }
    btn.addEventListener('pointerup', finish);
    /* 취소가 와도 닫지 않는다 — iOS 홈 제스처·안드로이드 웹뷰가 자주 던진다.
       ① 열린 뒤: 문서 touch 이벤트가 계속 추적, 손 뗄 때 확정.
       ② 열리기 전: 손가락이 아직 붙어 있으면(touchOn) 홀드 타이머를 살려둔다 —
          여기서 죽이면 '조그가 아예 안 열림'이 재발한다. 손 뗌은 touchend가 처리. */
    btn.addEventListener('pointercancel', () => { if (!ui && !touchOn) clear(); });
    btn.addEventListener('contextmenu', e => { if (ui) e.preventDefault(); });

    btn.addEventListener('click', e => {
      if (btn._skipClick) { e.preventDefault(); e.stopPropagation(); btn._skipClick = false; }
    }, true);
  }

  function boot() {
    /* DM 조그 */
    bindJog(document.querySelector('.nav-item.nav-dm, .nav-item[data-page="dm"]'), {
      tabs: () => DM_TABS,
      badges: dmBadges,
      go(tab) {
        const onDm = document.body.dataset.page === 'dm';
        if (onDm && window.GALLA_dmSetTab && tab) return window.GALLA_dmSetTab(tab);
        // 셸 안이면 페이지 이동 대신 셸 전환(판 상주 유지)
        if (window.GALLA_shellGo) { window.GALLA_shellGo('dm', tab || null); return; }
        location.href = 'dm.html' + (tab ? '?tab=' + tab : '');
      },
    });

    /* 트렌드 조그 — 탭바 순서(사용자 저장)를 그대로 따른다 */
    bindJog(document.querySelector('.nav-item[data-page="trend"]'), {
      tabs: trendTabsOrdered,
      go(tab) {
        const onTrend = document.body.dataset.page === 'trend';
        if (onTrend && window.GALLA_trendSetTab && tab) return window.GALLA_trendSetTab(tab);
        if (window.GALLA_shellGo) { window.GALLA_shellGo('trend', tab || null); return; }
        location.href = 'search.html' + (tab ? '?tab=' + tab : '');
      },
    });

    /* 마이페이지 조그 — 모아/갈라/숏판/롱판/예측/광장 */
    bindJog(document.querySelector('.nav-item[data-page="mypage"]'), {
      tabs: mypageTabs,
      go(tab) {
        // 이미 마이페이지면 그 탭으로 바로 전환
        if (tab && window.GALLA_mypageSetTab && window.GALLA_mypageSetTab(tab)) return;
        // 다른 화면에서 왔으면 대기 탭 저장 후 마이페이지로 이동(마운트 시 적용)
        try { if (tab && tab !== 'all') sessionStorage.setItem('galla_mypage_tab', tab); } catch (_) {}
        if (window.GALLA_shellGo) { window.GALLA_shellGo('mypage', null); return; }
        location.href = 'mypage.html';
      },
    });

    /* ➕ 글쓰기 조그 — 현재 + 버튼들 바인딩 + 이후 뷰 전환으로 새로 생기는 것도 관찰해 바인딩(SPA) */
    bindWriteJogs();
    try {
      let moRaf = 0;
      const mo = new MutationObserver(() => { if (moRaf) return; moRaf = requestAnimationFrame(() => { moRaf = 0; bindWriteJogs(); }); });
      mo.observe(document.body, { childList: true, subtree: true });
    } catch (_) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
