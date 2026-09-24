/* =========================================================
   🖥 데스크톱 레일 — 좌측 내비 + 우측 라이브 패널 (A안 '라이브 3단')
   ---------------------------------------------------------
   · 1100px 미만에서는 아무것도 만들지 않는다(모바일이 기본)
   · 넓어지면 좌우 레일을 '추가'만 한다 — 기존 화면은 건드리지 않는다
   · 끄기 스위치: 주소에 ?pc=off (다시 켜기 ?pc=on) — 배포 없이 즉시 롤백
   ========================================================= */
(function () {
  const MQ = window.matchMedia('(min-width: 1100px)');
  const KILL = 'galla_pc_off';

  // ── 롤백 스위치 — 문제가 생기면 ?pc=off 한 번으로 모바일 화면 그대로 ──
  try {
    const q = new URLSearchParams(location.search).get('pc');
    if (q === 'off') localStorage.setItem(KILL, '1');
    if (q === 'on') localStorage.removeItem(KILL);
    if (localStorage.getItem(KILL) === '1') return;
  } catch (_) {}

  const I = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const NAV = [
    { key: 'index',   label: '홈',      href: 'index.html',
      icon: I('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>') },
    { key: 'predict', label: '갈라예측', href: 'galla-predict.html',
      icon: I('<path d="M3.5 18.5 9.5 12l4 4L21 7"/><path d="M15 7h6v6"/>') },
    { key: 'dm',      label: '메시지',   href: 'dm.html',
      icon: I('<path d="M21 11.5a8.4 8.4 0 0 1-8.4 8.4 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 0 1-.9-3.8 8.4 8.4 0 0 1 8.4-8.4h.5a8.5 8.5 0 0 1 8.1 8.1z"/>') },
    { key: 'trend',   label: '트렌드',   href: 'search.html',
      icon: I('<path d="M12 2s4.5 4.2 4.5 8.2a4.5 4.5 0 0 1-9 0C7.5 8.9 8 7.7 8.7 6.6"/><path d="M12 22a6 6 0 0 0 6-6c0-2-1-3.6-2.2-5"/><path d="M12 22a6 6 0 0 1-6-6c0-1.4.5-2.6 1.3-3.8"/>') },
    { key: 'mypage',  label: '마이',     href: 'mypage.html',
      icon: I('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-3.5 3.6-6 8-6s8 2.5 8 6"/>') },
  ];

  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  /* 타임존 오프셋(+00:00 등)이 이미 붙은 ISO에 'Z'를 또 붙이면 Invalid Date(NaN) */
  const ts = iso => { const s = String(iso);
    return new Date(/Z$|[+-]\d\d:?\d\d$/.test(s) ? s : s + 'Z').getTime(); };
  const ago = iso => { if (window.GALLA_ago) return window.GALLA_ago(iso); 
    const t = ts(iso); if (!isFinite(t)) return '';
    const d = (Date.now() - t) / 1000;
    if (d < 60) return '방금'; if (d < 3600) return Math.floor(d / 60) + '분 전';
    if (d < 86400) return Math.floor(d / 3600) + '시간 전'; return Math.floor(d / 86400) + '일 전';
  };
  const until = iso => {
    const t = ts(iso); if (!isFinite(t)) return '';
    const d = (t - Date.now()) / 1000;
    if (d <= 0) return '마감 임박';
    if (d < 3600) return '마감 ' + Math.max(1, Math.floor(d / 60)) + '분 남음';
    if (d < 86400) return '마감 ' + Math.floor(d / 3600) + '시간 남음';
    return '마감 ' + Math.floor(d / 86400) + '일 남음';
  };

  function buildLeft() {
    if (document.getElementById('pc-left')) return;
    const cur = document.body.dataset.page || '';
    const el = document.createElement('aside');
    el.id = 'pc-left';
    el.innerHTML = `
      <a class="pcl-logo" href="index.html">
        <img src="assets/app-icons/icon-192.png" alt="">
        <img class="pcl-word" src="/assets/logo.png" alt="GALLA"><!-- 글꼴 글자 대신 우리 로고(워드마크) — 가운데 헤더와 같은 그림(26.9.19 사장님) -->
      </a>
      ${NAV.map(n => `
        <a class="pcl-item${cur === n.key ? ' on' : ''}" href="${n.href}" data-key="${n.key}">
          ${n.icon}<span>${n.label}</span>
          ${n.key === 'dm' ? '<em class="pcl-badge" id="pclDmBadge" hidden></em>' : ''}
        </a>`).join('')}
      <button class="pcl-write" type="button">글쓰기</button>
      <button class="pcl-galvis" type="button" aria-label="갈비스와 대화">
        ${I('<circle cx="12" cy="12" r="8.2" stroke-dasharray="2.3 2.2"/><circle cx="12" cy="12" r="4.7"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/>')}
        <span>갈비스</span></button>
      <!-- 📱💻 앱 받기 — 모바일 앱과 갈라톡 PC 를 한 카드로(26.9.24 사장님: 더 세련되게).
           예전엔 점선 박스 '📲 앱 받기' 와 '💬 갈라톡 PC' 가 따로 떠 산만했고 이모지라 급조해 보였다.
           지금 쓰는 운영체제 버튼을 먼저·강조한다(윈도우면 Windows, 맥이면 Mac). -->
      <div class="pcl-app">
        <button class="pcl-getapp" type="button" aria-label="갈라 앱 받기">
          <span class="pcl-ic">${I('<rect x="7" y="2.5" width="10" height="19" rx="2.6"/><path d="M10.6 5.6h2.8"/>')}</span>
          <span class="pcl-tx"><b>모바일 앱</b><i>아이폰 · 안드로이드</i></span>
          <span class="pcl-go">${I('<path d="M9 5l7 7-7 7"/>')}</span>
        </button>
        <div class="pcl-app-sep"><span>갈라톡 PC</span></div>
        <div class="pcl-talk-btns">
          <a class="pcl-dl" id="pclDlWin" href="https://cdn.galla.im/desktop/GallaTalk-Setup-x64.exe" download aria-label="갈라톡 윈도우용 받기"><svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M3 5.5 10.5 4.4v7.1H3zM11.5 4.3 21 3v8.5h-9.5zM3 12.5h7.5v7.1L3 18.5zM11.5 12.5H21V21l-9.5-1.3z"/></svg><span>Windows</span></a>
          <a class="pcl-dl" id="pclDlMac" href="https://cdn.galla.im/desktop/GallaTalk-mac.dmg" download aria-label="갈라톡 맥용 받기"><svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M16.4 12.6c0-2.4 2-3.6 2.1-3.7-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.9-3.2-.8-1.6 0-3.1 1-4 2.4-1.7 3-.4 7.3 1.2 9.7.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.1-.8 1.5 0 1.9.8 3.2.8 1.3 0 2.1-1.2 2.9-2.4.9-1.4 1.3-2.7 1.3-2.8 0 0-2.4-.9-2.4-3.8zM14 5.4c.7-.8 1.1-1.9 1-3-1 0-2.1.7-2.8 1.5-.6.7-1.2 1.8-1 2.9 1.1.1 2.1-.6 2.8-1.4z"/></svg><span>Mac</span></a>
        </div>
      </div>
      <div class="pcl-foot">
        무엇을 하든 판이 되는 곳<br>
        <a href="help-permissions.html">도움말</a> · <a href="#" id="pclBug">버그 신고</a>
      </div>`;
    document.body.appendChild(el);

    el.querySelector('.pcl-write').onclick = () => {
      if (window.openWriteHub) window.openWriteHub('galla');
      else (window.GALLA_nav||function(u){location.href=u})('write.html');
    };
    el.querySelector('.pcl-galvis').onclick = () => { window.GALLA_openFriend ? window.GALLA_openFriend() : (window.GALLA_askGalvis && window.GALLA_askGalvis({})); };
    el.querySelector('.pcl-getapp').onclick = () => { window.GALLA_appDownload && window.GALLA_appDownload('getapp'); };
    /* ARM 윈도우(서피스 등)면 arm64 설치본으로 */
    try { if (/Windows/.test(navigator.userAgent) && /ARM|aarch64/i.test((navigator.userAgentData && navigator.userAgentData.platform) || navigator.userAgent)) el.querySelector('#pclDlWin').href = 'https://cdn.galla.im/desktop/GallaTalk-Setup-arm64.exe'; } catch (_) {}
    /* 지금 쓰는 운영체제 것을 먼저·강조 — 고르게 하지 말고 바로 누르게 */
    try {
      const mac = /Mac/i.test(navigator.userAgent) && !/iPhone|iPad/i.test(navigator.userAgent);
      const mine = el.querySelector(mac ? '#pclDlMac' : '#pclDlWin');
      if (mine) { mine.classList.add('is-mine'); mine.parentElement.prepend(mine); }
    } catch (_) {}
    el.querySelector('#pclBug').onclick = async e => {
      e.preventDefault();
      if (!window.GALLA_openBugReport) {
        const v = ([...document.scripts].map(x => x.src).find(u => /[?&]v=/.test(u)) || '').match(/[?&]v=(\d+)/);
        await new Promise(res => { const sc = document.createElement('script'); sc.src = 'js/bug-report.js' + (v ? '?v=' + v[1] : ''); sc.onload = sc.onerror = res; document.head.appendChild(sc); });
      }
      window.GALLA_openBugReport?.(location.href);
    };

    /* DM 뱃지는 숨겨진 모바일 네비의 것을 거울처럼 비춘다 —
       숫자 계산 로직을 두 번 만들면 어긋난다(원본 하나, 표시만 복제) */
    const src = document.getElementById('navDmBadge');
    const dst = el.querySelector('#pclDmBadge');
    if (src && dst) {
      const sync = () => { dst.textContent = src.textContent; dst.hidden = src.hidden; };
      sync();
      new MutationObserver(sync).observe(src, { childList: true, attributes: true, characterData: true, subtree: true });
    }

    /* 👤 '마이' 행 = 로그인한 아이디 표시(모바일 네비 아바타와 같은 원리·같은 캐시).
       로그인+사진: 원형 아바타 + 닉네임, 비로그인: 사람 아이콘 + '마이' 유지.
       → PC 와이드에서 "어느 계정으로 들어와 있는지" 한눈에(26.9.23 사장님). */
    (function paintMe(){
      const row = el.querySelector('.pcl-item[data-key="mypage"]');
      if (!row) return;
      const svg = row.querySelector('svg');
      const label = row.querySelector('span');
      const AV = 'galla_nav_avatar', NK = 'galla_nav_nick';
      const showAvatar = (url) => {
        let img = row.querySelector('img.pcl-avatar');
        if (!url) { if (img) { img.remove(); if (svg && !row.querySelector('svg')) row.insertBefore(svg, row.firstChild); } return; }
        if (!img) {
          img = document.createElement('img'); img.className = 'pcl-avatar'; img.alt = '';
          const cur = row.querySelector('svg'); if (cur) cur.replaceWith(img); else row.insertBefore(img, row.firstChild);
          img.onerror = function () { this.onerror = null; this.remove(); if (svg && !row.querySelector('svg')) row.insertBefore(svg, row.firstChild); };
        }
        if (img.src !== url) img.src = url;
      };
      const setNick = (n) => { if (label) label.textContent = n || '마이'; };
      try { const c = localStorage.getItem(AV); if (c) showAvatar(c); const n = localStorage.getItem(NK); if (n) setNick(n); } catch (_) {}
      (async () => {
        const sbc = window.supabaseClient || (window.waitForSupabaseClient ? await window.waitForSupabaseClient() : null);
        if (!sbc) return;
        let uid = null;
        try { const { data } = await sbc.auth.getSession(); uid = data?.session?.user?.id || null; } catch (_) { return; }
        if (!uid) { try { localStorage.removeItem(AV); localStorage.removeItem(NK); } catch (_) {} showAvatar(null); setNick('마이'); return; }
        try {
          const { data: u } = await sbc.from('users').select('avatar_url,nickname').eq('id', uid).maybeSingle();
          const photo = (u && u.avatar_url) ? (window.GALLA_avatarSrc ? window.GALLA_avatarSrc(u.avatar_url) : u.avatar_url) : null;
          const nick = (u && u.nickname) ? u.nickname : '';
          try { photo ? localStorage.setItem(AV, photo) : localStorage.removeItem(AV); nick ? localStorage.setItem(NK, nick) : localStorage.removeItem(NK); } catch (_) {}
          showAvatar(photo); setNick(nick);
        } catch (_) {}
      })();
    })();
  }

  /* ── 우측 라이브 패널 — 각 카드는 실패하면 조용히 사라진다(빈 껍데기 금지) ── */
  async function sb() {
    for (let i = 0; i < 40; i++) {
      if (window.supabaseClient) return window.supabaseClient;
      await new Promise(r => setTimeout(r, 150));
    }
    return null;
  }

  function card(id, title, live) {
    return `<section class="pcr-card" id="${id}">
      <h3>${live ? '<span class="dot"></span>' : ''}${title}</h3>
      <div class="pcr-body"><div class="pcr-empty">불러오는 중…</div></div>
    </section>`;
  }
  /* ⚠️ 새 패널(#pc-right) 안에서만 찾는다 — 90초 새로고침 때 옛 패널(#pc-right-old)에도 같은 id 카드가 있어,
     document 전체에서 찾으면 옛 패널을 채우고 옛 패널은 곧 치워져 새 패널이 「불러오는 중」에 갇혔다(26.9.19 사장님 제보) */
  function fill(id, html, moreHref, moreLabel) {
    const card = document.querySelector(`#pc-right #${id}`);
    const el = card && card.querySelector('.pcr-body');
    if (!el) return;
    if (!html) { card.remove(); return; }
    el.innerHTML = html + (moreHref ? `<a class="pcr-more" href="${moreHref}">${moreLabel} →</a>` : '');
    countUp(el);
  }
  /* 막대 옆 숫자를 0부터 굴린다 — 값이 '움직여서' 눈에 걸리게(26.9.24) */
  function countUp(root) {
    let slow = false;
    try { slow = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) {}
    if (slow || !root) return;
    root.querySelectorAll('.pcr-bar u').forEach((u, i) => {
      const m = String(u.textContent || '').match(/^([^0-9]*)([0-9][0-9,.]*)(.*)$/);
      if (!m) return;
      const to = parseFloat(m[2].replace(/,/g, ''));
      if (!isFinite(to)) return;
      const dec = (m[2].split('.')[1] || '').length;
      const fmt = v => m[1] + (dec ? v.toFixed(dec) : Math.round(v).toLocaleString()) + m[3];
      const t0 = performance.now() + i * 90 + 300, dur = 720;
      u.textContent = fmt(0);
      const step = now => {
        const k = Math.max(0, Math.min(1, (now - t0) / dur));
        u.textContent = fmt(to * (1 - Math.pow(1 - k, 3)));
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  /* 🔴 유튜브 콘텐츠가 재생되는 화면에서는 우리 지표 패널을 붙이지 않는다.
     YouTube API ToS III.E.4h — 유튜브 API 로 '독립적으로 계산·파생된 지표'를
     제공할 수 없다. 우리 찬반 수치·예측 시세는 유튜브와 무관한 자체 데이터지만,
     유튜브 플레이어 바로 옆에 놓이면 '영상에서 파생된 지표'로 읽힌다.
     실제로 2026-08-13 위반 통보서가 이 화면을 스크린샷으로 지목했다.
     특히 예측 카드의 거래량 표기는 유튜브 콘텐츠 옆에서 가장 위험한 조합이다.
     ⚠️ 유튜브 화면이 늘어나면 이 목록에 추가해야 한다. */
  const YT_PAGES = ['watch'];
  function isYouTubeSurface() {
    const p = document.body.dataset.page || '';
    if (YT_PAGES.indexOf(p) >= 0) return true;
    // 트렌드 허브의 '핫튜브' 탭도 유튜브 영상 화면이다
    /* ⚠️ 운영은 .html 없는 주소를 쓴다(https://galla.im/search?tab=hot).
       '/search.html$' 로만 맞추면 로컬에서만 통과하고 라이브에서 안 먹는다 —
       실제로 그렇게 배포돼 카드가 그대로 떴다. 확장자는 선택적으로 본다. */
    try {
      const u = new URL(location.href);
      if (/\/search(\.html)?$/.test(u.pathname) &&
          (u.searchParams.get('tab') === 'hot' || u.searchParams.get('video'))) return true;
      if (/\/watch(\.html)?$/.test(u.pathname)) return true;
    } catch (_) {}
    return false;
  }

  /* 🗂 오른쪽 패널 — 트렌드의 여러 코너를 썸네일과 함께(26.9.19 사장님: 「이슈 전황뿐 아니라 트렌드의 다양한 콤포넌트를 썸네일과, 너무 단순해」).
     순서: 이슈 전황 → 지금 뜨는 영상 → 갈라 예측 → 갈라뉴스 → 맛집·여행 → 광장 HOT → 난장 → 앱.
     각 카드는 실패하면 조용히 사라진다(빈 껍데기 금지). 움직임은 CSS(desktop.css pcr-*)만 — 등장·반짝·확대. */
  const TH = (u, w) => { try { return u ? (window.GALLA_thumb ? window.GALLA_thumb(u, w || 240) : u) : ''; } catch (_) { return u || ''; } };
  const IMG = (u, w, cls) => u ? `<span class="${cls || 'pcr-th'}"><img src="${esc(TH(u, w))}" alt="" loading="lazy" decoding="async" onerror="this.parentNode.classList.add('noimg');this.remove()"></span>` : `<span class="${cls || 'pcr-th'} noimg"></span>`;
  const sN = n => { n = Number(n) || 0; return n >= 1e8 ? (n/1e8).toFixed(1).replace(/\.0$/,'')+'억' : n >= 1e4 ? (n/1e4).toFixed(1).replace(/\.0$/,'')+'만' : n.toLocaleString(); };
  /* 볼 때마다 다음 테마로 — 같은 세션에서 한 바퀴 돌게(새로고침마다 하나씩 전진) */
  function rot(key, n) {
    if (!n) return 0;
    let i = 0;
    try { i = parseInt(sessionStorage.getItem('galla_pcr_rot_' + key) || '0', 10) || 0; } catch (_) {}
    try { sessionStorage.setItem('galla_pcr_rot_' + key, String((i + 1) % n)); } catch (_) {}
    return i % n;
  }
  /* 테마 표식 — 이모지 말고 선 아이콘(galla 톤). 무엇을 근거로 고른 줄인지 한눈에 */
  const ICON = {
    who: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/>',
    layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
    tag: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
    pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
    play: '<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>',
    award: '<circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>',
    zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    trend: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
    plane: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
    globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  };
  const ic = k => ICON[k] ? `<svg class="pcr-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>` : '';

  /* 테마 한 줄(왜 이게 떴는지) + 사진 두 장 + 숫자 한 줄(26.9.24 사장님: 한 줄은 사진, 한 줄은 차트) */
  function grid(theme, meta, cells, viz, opt) {
    if (!cells || !cells.length) return '';
    const o = opt || {};
    return `<div class="pcr-theme${o.tone ? ' tone-' + o.tone : ''}">${ic(o.icon)}<b>${esc(theme)}</b>${meta ? `<i>${esc(meta)}</i>` : ''}</div>` +
      `<div class="pcr-grid">` + cells.map(c => `
        <a class="pcr-cell" href="${c.href}">${IMG(c.img, 300, 'pcr-cell-img')}<span class="pcr-cell-tx"><b>${esc(c.name)}</b><i>${esc(c.sub)}</i></span></a>`).join('') + `</div>` +
      (o.tone ? (viz || '').replace('class="pcr-viz', `class="pcr-viz tone-${o.tone}`) : (viz || ''));
  }
  /* 가로 막대 — [{k:'다낭', v:159000, tx:'15.9만', hot:true}]. 막대는 CSS 로 자라고 값은 뒤따라 뜬다. */
  function bars(items, opt) {
    const rows = (items || []).filter(x => x && x.k && Number(x.v) > 0).slice(0, 3);
    if (rows.length < 2) return '';
    const max = Math.max(...rows.map(x => Number(x.v)));
    const min = Math.min(...rows.map(x => Number(x.v)));
    const flip = !!(opt && opt.low);            // 값이 작을수록 좋은 것(가격) 은 짧은 막대가 아니라 긴 막대로
    /* 14만·15.9만·16.8만처럼 붙어 있는 값은 비율로 그리면 셋 다 같아 보인다 — 폭을 펼쳐 차이를 보이게 */
    const span = (max - min) || 1;
    return `<div class="pcr-viz">` + rows.map((x, i) => {
      const v = Number(x.v);
      const norm = flip ? (max - v) / span : (v - min) / span;
      const p = .34 + .66 * norm;
      return `<span class="pcr-bar${x.hot ? ' is-hot' : ''}" style="--p:${Math.max(.18, Math.min(1, p)).toFixed(3)};--d:${i * 90}ms">
        <b>${esc(x.k)}</b><span class="pcr-bar-t"><i></i></span><u>${esc(x.tx || sN(v))}</u></span>`;
    }).join('') + `</div>`;
  }
  /* 꺾은선 — 환율 12개월처럼 흐름이 있는 값. 선이 왼쪽부터 그려지고 끝점이 깜빡인다. */
  function spark(pts, label, sub) {
    const a = (pts || []).map(Number).filter(v => isFinite(v));
    if (a.length < 6) return '';
    const lo = Math.min(...a), hi = Math.max(...a), rng = (hi - lo) || 1;
    const W = 100, H = 30, step = W / (a.length - 1);
    const xy = a.map((v, i) => [i * step, H - 3 - ((v - lo) / rng) * (H - 6)]);
    const line = xy.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
    const area = `${line} L${W} ${H} L0 ${H} Z`;
    const end = xy[xy.length - 1];
    return `<div class="pcr-viz pcr-sparkbox">
      <span class="pcr-spark-wrap">
      <svg class="pcr-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id="pcrSparkG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="currentColor" stop-opacity=".34"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/>
        </linearGradient></defs>
        <path class="pcr-spark-a" d="${area}" fill="url(#pcrSparkG)"/>
        <path class="pcr-spark-l" d="${line}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
      </svg>
      <span class="pcr-spark-dot" style="left:calc(${(end[0] / W * 100).toFixed(1)}% - 3px);top:calc(${(end[1] / H * 100).toFixed(1)}% - 3px)"></span>
      </span>
      <span class="pcr-spark-tx"><b>${esc(label)}</b>${sub ? `<i>${esc(sub)}</i>` : ''}</span>
    </div>`;
  }
  const pick = (arr, n) => { const a = (arr || []).slice(); for (let k = a.length - 1; k > 0; k--) { const r = Math.floor(Math.random() * (k + 1)); [a[k], a[r]] = [a[r], a[k]]; } return a.slice(0, n); };

  let QUIET = false;
  async function buildRight() {
    if (document.getElementById('pc-right')) return;
    const ytSurface = isYouTubeSurface();
    const el = document.createElement('aside');
    el.id = 'pc-right';
    if (QUIET) el.classList.add('pcr-quiet');
    el.innerHTML =
      (ytSurface ? '' : card('pcr-battle', '갈라 이슈 전황', true)) +
      card('pcr-hot', '지금 뜨는 영상') +
      (ytSurface ? '' : card('pcr-predict', '갈라 예측')) +
      card('pcr-news', '갈라뉴스') +
      card('pcr-food', '맛집') +
      card('pcr-travel', '여행') +
      card('pcr-plaza', '광장 HOT') +
      card('pcr-rooms', '난장 라이브', true) +
      /* 📱 앱 받기 — 이모지 대신 SVG, 왼쪽 레일 카드와 같은 톤(26.9.24 사장님) */
      `<section class="pcr-card pcr-getapp"><h3>${I('<rect x="7" y="2.5" width="10" height="19" rx="2.6"/><path d="M10.6 5.6h2.8"/>')}갈라 앱</h3>
        <div class="pcr-body"><p class="pcr-dl-t">알림·통화·오프라인까지 — <b>앱으로 더 크게</b></p>
        <button class="pcr-dl" type="button">앱 받기</button></div></section>`;
    document.body.appendChild(el);
    el.querySelector('.pcr-dl')?.addEventListener('click', () => { window.GALLA_appDownload && window.GALLA_appDownload('getapp'); });
    el.querySelectorAll('.pcr-card').forEach((c, k) => c.style.setProperty('--pcr-i', k));   // 차례로 떠오르기

    const supa = await sb();
    if (!supa) { el.remove(); return; }

    /* ⏱ 카드마다 따로·동시에 부른다. 예전엔 차례로 await 해서 요청 하나가 멈추면(로그인 세션 갱신 대기 등)
       뒤 카드까지 전부 「불러오는 중」에 갇혔다(26.9.19 사장님 제보). 8초 넘으면 한 번 더, 그래도 안 되면 그 카드만 걷는다. */
    const TO = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
    const job = (id, fn) => TO(fn(), 8000).catch(() => TO(fn(), 8000)).catch(() => fill(id, ''));
    await Promise.all([
      ytSurface ? null : job('pcr-battle', async () => {
        // ① 이슈 전황 — 찬반 합산 상위 4, 썸네일 + 줄다리기 막대
        try {
          const { data } = await supa.from('issues')
            .select('id,title,pro_count,con_count,created_at,card_thumb_url,thumbnail_url')
            .order('created_at', { ascending: false }).limit(30);
          const hot = (data || []).map(r => ({ ...r, heat: (r.pro_count || 0) + (r.con_count || 0) }))
            .sort((a, b) => b.heat - a.heat).slice(0, 4);
          fill('pcr-battle', hot.map((r, k) => {
            const p = r.pro_count || 0, c = r.con_count || 0, t = Math.max(1, p + c), pp = Math.round(p / t * 100);
            return `<a class="pcr-row pcr-media" href="issue.html?id=${r.id}">
              ${IMG(r.card_thumb_url || r.thumbnail_url, 160)}<em class="pcr-rank">${k + 1}</em>
              <span class="pcr-tx"><b>${esc(r.title)}</b>
                <span class="pcr-odds"><span class="yes" style="width:${pp}%"></span><span class="no" style="width:${100 - pp}%"></span></span>
                <i>찬 ${p} · 반 ${c} · ${ago(r.created_at)}</i></span>
            </a>`;
          }).join(''), 'index.html', '전장 전체 보기');
        } catch (_) { fill('pcr-battle', ''); }
      }),
      job('pcr-hot', async () => {
        // ② 지금 뜨는 영상 — 1위는 크게, 나머지는 작은 썸네일
        try {
          const { data } = await supa.from('youtube_hot')
            .select('video_id,title,channel_title,view_count,thumbnail,rank')
            .eq('feed', 'all').eq('is_short', false)
            .not('channel_title', 'ilike', '%- Topic')
            .order('rank', { ascending: true }).limit(4);
          const rows = data || [];
          fill('pcr-hot', rows.map((v, k) => {
            const href = `watch.html?v=${encodeURIComponent(v.video_id)}`;
            const th = v.thumbnail || `https://i.ytimg.com/vi/${encodeURIComponent(v.video_id)}/hqdefault.jpg`;
            if (k === 0) return `<a class="pcr-hero" href="${href}">
                <span class="pcr-hero-img"><img src="${esc(th)}" alt="" loading="lazy"></span>
                <span class="pcr-play"><svg viewBox="0 0 24 24" width="22" height="22" fill="#fff"><path d="M8 5.5v13l11-6.5z"/></svg></span>
                <em class="pcr-badge">🔥 1위</em>
                <span class="pcr-hero-tx"><b>${esc(v.title)}</b><i>${esc(v.channel_title || '')}${v.view_count ? ' · 조회 ' + sN(v.view_count) : ''}</i></span>
              </a>`;
            return `<a class="pcr-row pcr-media pcr-wide" href="${href}">
                <span class="pcr-th pcr-th-w"><img src="${esc(th)}" alt="" loading="lazy"></span><em class="pcr-rank">${k + 1}</em>
                <span class="pcr-tx"><b>${esc(v.title)}</b><i>${esc(v.channel_title || '')}${v.view_count ? ' · 조회 ' + sN(v.view_count) : ''}</i></span>
              </a>`;
          }).join(''), 'search.html?tab=hot', '핫튜브 전체 보기');
        } catch (_) { fill('pcr-hot', ''); }
      }),
      ytSurface ? null : job('pcr-predict', async () => {
        // ③ 갈라 예측 — 사진 타일 2개 + 마감
        try {
          const { data } = await supa.from('markets')
            .select('id,question,total_pool,close_at,image_url')
            .eq('resolved', false).gt('close_at', new Date().toISOString())
            .order('close_at', { ascending: true }).limit(4);
          fill('pcr-predict', `<div class="pcr-tiles">` + (data || []).map(m => `
            <a class="pcr-tile" href="predict-market.html?id=${m.id}">
              ${IMG(m.image_url, 360, 'pcr-tile-img')}
              <span class="pcr-tile-tx"><b>${esc(m.question)}</b><i>🪙 ${Number(m.total_pool || 0).toLocaleString()} GP · ${until(m.close_at)}</i></span>
            </a>`).join('') + `</div>`, 'galla-predict.html', '예측 전체 보기');
        } catch (_) { fill('pcr-predict', ''); }
      }),
      job('pcr-news', async () => {
        // ④ 갈라뉴스 — 대표 사진 + 제목
        try {
          const { data } = await supa.from('galla_news')
            .select('id,title,category,hero_image,published_at')
            .eq('status', 'published').order('published_at', { ascending: false }).limit(3);
          fill('pcr-news', (data || []).map(n => `
            <a class="pcr-row pcr-media" href="news.html?gn=${encodeURIComponent(n.id)}">
              ${IMG(n.hero_image, 160)}
              <span class="pcr-tx"><b>${esc(n.title)}</b><i>${esc(n.category || '')}${n.published_at ? ' · ' + ago(n.published_at) : ''}</i></span>
            </a>`).join(''), 'search.html?tab=news', '갈라뉴스 더 보기');
        } catch (_) { fill('pcr-news', ''); }
      }),
      job('pcr-food', async () => {
        /* ⑤ 맛집 — 테마가 돌아간다(26.9.24 사장님: 단조롭고 의미 없다).
           출처(누가 골랐나) · 여러 채널 겹침 · 착한 가격 · 지역 — 왜 이 집이 떴는지 제목이 말한다.
           한 테마가 비면 다음 테마로 넘어간다(빈 껍데기 금지). */
        const href = id => 'search.html?tab=food&place=' + encodeURIComponent(id);
        const sub = x => [String(x.address || '').split(' ').slice(1, 2).join(''), x.category].filter(Boolean).join(' · ');
        const fmap = async (opt) => {
          const { data } = await supa.rpc('food_map', Object.assign({ p_limit: 40, p_spread: true }, opt));
          return ((data || {}).places || []).filter(x => x.cover);
        };
        const themes = [
          { run: async () => {   // 누가 골랐나 — 지자체·유튜버·방송
              const { data } = await supa.rpc('food_browse', { p_per: 12, p_channels: 14 });
              const secs = (((data || {}).sections) || []).filter(x => (x.places || []).filter(pp => pp.cover).length >= 2);
              if (!secs.length) return null;
              const sec = secs[rot('food-src', secs.length)];
              const who = String(sec.name || '').trim();
              const top = secs.slice().sort((a, b) => (b.total || 0) - (a.total || 0)).slice(0, 3);
              return { t: sec.kind === 'gov' ? `${who}이 고른 집` : sec.kind === 'guide' ? `${who}에 오른 집` : `${who}이 다녀간 집`,
                m: `${sN(sec.total)}곳`, rows: (sec.places || []).filter(pp => pp.cover),
                icon: sec.kind === 'gov' ? 'award' : sec.kind === 'guide' ? 'zap' : 'play', tone: 'indigo',
                viz: bars(top.map(x => ({ k: String(x.name || '').slice(0, 7), v: x.total, tx: sN(x.total) + '곳',
                  hot: x.slug === sec.slug }))) };
            } },
          { run: async () => {   // 여러 채널이 겹치게 소개한 집 = 검증된 집
              const rows = await fmap({ p_min_shows: 3 });
              if (rows.length < 2) return null;
              const top = rows.slice().sort((a, b) => (b.channels || []).length - (a.channels || []).length).slice(0, 3);
              return { t: '세 곳 넘게 겹친 집', m: '여러 채널이 같이 갔다',
                rows: rows.map(x => ({ ...x, __sub: (x.channels || []).length ? `채널 ${x.channels.length}곳` : null })),
                icon: 'layers', tone: 'violet',
                viz: bars(top.map(x => ({ k: String(x.name || '').slice(0, 8), v: (x.channels || []).length,
                  tx: (x.channels || []).length + '곳 겹침' }))) };
            } },
          { run: async () => {   // 착한 가격
              const rows = await fmap({ p_good_price: true });
              if (rows.length < 2) return null;
              const cheap = rows.filter(x => x.min_price > 0).sort((a, b) => a.min_price - b.min_price).slice(0, 3);
              return { t: '지갑 가벼운 날', m: '착한 가격 가게',
                rows: rows.map(x => ({ ...x, __sub: x.min_price ? `${sN(x.min_price)}원부터` : null })),
                icon: 'tag', tone: 'mint',
                viz: bars(cheap.map(x => ({ k: String(x.name || '').slice(0, 8), v: x.min_price,
                  tx: x.min_price.toLocaleString() + '원' })), { low: true }) };
            } },
          { run: async () => {   // 지역 — 도시 하나씩 돌아가며
              const { data } = await supa.rpc('food_regions');
              const cities = [];
              for (const sd of (((data || {}).sido) || [])) for (const c of (sd.cities || [])) if (c.n >= 200) cities.push({ ...c, sido: sd.name });
              if (!cities.length) return null;
              const c = cities[rot('food-region', Math.min(cities.length, 24))];
              const rows = await fmap({ p_region: c.code });
              if (rows.length < 2) return null;
              const near = cities.filter(x => x.sido === c.sido).sort((a, b) => b.n - a.n).slice(0, 3);
              if (!near.some(x => x.code === c.code)) near[near.length - 1] = c;
              return { t: `${c.sido} ${c.name} 맛집`, m: `${sN(c.n)}곳`, rows, icon: 'pin', tone: 'indigo',
                viz: bars(near.map(x => ({ k: x.name, v: x.n, tx: sN(x.n) + '곳', hot: x.code === c.code }))) };
            } },
        ];
        try {
          const s0 = rot('food', themes.length);
          for (let k = 0; k < themes.length; k++) {
            let th = null;
            try { th = await themes[(s0 + k) % themes.length].run(); } catch (_) { th = null; }
            if (!th || (th.rows || []).length < 2) continue;
            const cells = pick(th.rows, 2).map(x => ({ href: href(x.id), img: x.cover, name: x.name, sub: x.__sub || sub(x) }));
            return fill('pcr-food', grid(th.t, th.m, cells, th.viz, { icon: th.icon, tone: th.tone }), 'search.html?tab=food', '맛집 더 보기');
          }
          fill('pcr-food', '');
        } catch (_) { fill('pcr-food', ''); }
      }),
      job('pcr-travel', async () => {
        /* ⑤-2 여행 — 테마 회전: 유튜버가 다녀간 / 맞대결 상위 / 나라별 / 새로 올라온 */
        const P = 'id,name,city,country,photo';
        const live = () => supa.from('travel_places').select(P).eq('status', 'live').not('photo', 'is', null);
        const byIds = async (ids) => {
          if (!ids.length) return [];
          const { data } = await live().in('id', ids.slice(0, 40));
          return data || [];
        };
        const themes = [
          { t: '유튜버가 다녀간 곳', run: async () => {
              const { data } = await supa.from('travel_place_sources').select('place_id,channel')
                .order('created_at', { ascending: false }).limit(60);
              const ch = {}; (data || []).forEach(r => { ch[r.place_id] = r.channel; });
              const slugs = [...new Set(Object.values(ch))].filter(Boolean).slice(0, 40);
              const nm = {};                                  // 슬러그 대신 채널 이름으로(kbstravel → KBS 여행)
              if (slugs.length) {
                const { data: cs } = await supa.from('travel_channels').select('slug,name').in('slug', slugs);
                (cs || []).forEach(c => { nm[c.slug] = c.name; });
              }
              const rows = await byIds([...new Set((data || []).map(r => r.place_id))]);
              const cnt = {}; (data || []).forEach(r => { if (r.channel) cnt[r.channel] = (cnt[r.channel] || 0) + 1; });
              const top = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]).slice(0, 3);
              return Object.assign(rows.map(r => ({ ...r, note: ch[r.id] ? (nm[ch[r.id]] || null) : null })),
                { __viz: bars(top.map(k => ({ k: String(nm[k] || k).slice(0, 8), v: cnt[k], tx: cnt[k] + '곳' }))), __icon: 'play', __tone: 'indigo' });
            } },
          { t: '맞대결 상위', run: async () => {
              const { data } = await supa.from('travel_vs_rank').select('place_id,score,wins')
                .order('score', { ascending: false }).limit(40);
              const w = {}; (data || []).forEach(r => { w[r.place_id] = r.wins; });
              const rows = await byIds((data || []).map(r => r.place_id));
              const out = rows.map(r => ({ ...r, note: w[r.id] ? `${w[r.id]}승` : null }));
              const top = out.filter(x => w[x.id] > 0).sort((a, b) => w[b.id] - w[a.id]).slice(0, 3);
              return Object.assign(out, { __viz: bars(top.map(x => ({ k: String(x.name || '').slice(0, 8), v: w[x.id], tx: w[x.id] + '승' }))), __icon: 'award', __tone: 'violet' });
            } },
          { t: '새로 올라온 곳', run: async () => {
              const { data } = await live().order('created_at', { ascending: false }).limit(40);
              const rows = data || [];
              const cnt = {}; rows.forEach(x => { if (x.country) cnt[x.country] = (cnt[x.country] || 0) + 1; });
              const top = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]).slice(0, 3);
              return Object.assign(rows, { __viz: bars(top.map(k => ({ k, v: cnt[k], tx: cnt[k] + '곳' }))), __icon: 'zap', __tone: 'indigo' });
            } },
          { t: null, run: async () => {   // 💱 환율 — 원화가 강해진 나라(= 지금 싸게 가는 곳)
              const fx = await fetch('/fx').then(r => r.ok ? r.json() : null).catch(() => null);
              if (!fx || !fx.ok) return [];
              for (const row of (fx.rows || []).slice(0, 8)) {
                if (!(row.pct > 1)) break;                       // 1% 미만이면 '싸졌다' 고 말하지 않는다
                const { data } = await live().eq('country', row.country).limit(20);
                if ((data || []).length >= 2) {
                  /* '싸다' 는 환율 이야기일 뿐 현지 물가와 다르다 — 말을 정확히 한다 */
                  const pts = (fx.series || {})[row.cur] || [];
                  return Object.assign(data.map(x => ({ ...x, __title: `원화가 강해진 ${row.country}`,
                    __meta: `1년 새 환율 ${row.pct}% 유리`, note: null })),
                    { __viz: spark(pts, `${row.krw.toLocaleString()}원 / ${row.unit > 1 ? row.unit + row.cur : row.cur}`,
                      `최근 12개월 · 원화 가치 ${row.pct > 0 ? '▲' : '▼'} ${Math.abs(row.pct)}%`), __icon: 'trend', __tone: 'violet' });
                }
              }
              return [];
            } },
          { t: null, run: async () => {   // ✈️ 항공권 — 서울에서 지금 싼 나라(트래블페이아웃 실거래 최저가)
              const { data: fd } = await supa.from('flight_deals')
                .select('city,country,price,depart_date').order('price').limit(40);
              const seen = new Set(), cand = [];
              for (const d of (fd || [])) { if (d.country && !seen.has(d.country)) { seen.add(d.country); cand.push(d); } }
              if (!cand.length) return [];
              const top = cand.slice(0, 6);
              const s0 = rot('travel-air', top.length);
              for (let k = 0; k < top.length; k++) {
                const d = top[(s0 + k) % top.length];
                const { data } = await live().eq('country', d.country).limit(20);
                if ((data || []).length >= 2) {
                  const won = v => (v >= 1e4 ? (v / 1e4).toFixed(1).replace(/\.0$/, '') + '만' : sN(v)) + '원';
                  const ko = /[가-힣]/.test(d.city || '') ? d.city : '';   // 한글 이름 없으면 도시는 빼고 값만
                  return Object.assign(data.map(x => ({ ...x, __title: `서울에서 지금 싼 ${d.country}`,
                    __meta: `${ko ? ko + ' ' : ''}왕복 ${won(d.price)}`, note: null })),
                    { __viz: bars([d, ...top.filter(x => x.country !== d.country)].slice(0, 3)   /* 제목에 쓴 나라는 차트에 꼭 넣는다 */
                      .sort((a, b) => a.price - b.price)
                      .map(x => ({ k: /[가-힣]/.test(x.city || '') ? x.city : x.country,
                        v: x.price, tx: won(x.price), hot: x.country === d.country })), { low: true }), __icon: 'plane', __tone: 'mint' });
                }
              }
              return [];
            } },
          { t: null, run: async () => {   // 나라별 — 제목은 나라 이름으로
              const { data } = await live().limit(300);
              const rows = (data || []).filter(x => x.country);
              if (!rows.length) return [];
              const byC = {}; rows.forEach(x => { (byC[x.country] = byC[x.country] || []).push(x); });
              const big = Object.keys(byC).filter(k => byC[k].length >= 2);
              if (!big.length) return [];
              const c = big[rot('travel-c', big.length)];
              const top = big.slice().sort((a, b) => byC[b].length - byC[a].length).slice(0, 3);
              if (!top.includes(c)) top[top.length - 1] = c;
              return Object.assign(byC[c].map(x => ({ ...x, __title: `${c} 여행` })),
                { __viz: bars(top.map(k => ({ k, v: byC[k].length, tx: byC[k].length + '곳', hot: k === c }))), __icon: 'globe', __tone: 'indigo' });
            } },
        ];
        try {
          const s0 = rot('travel', themes.length);
          for (let k = 0; k < themes.length; k++) {   // 한 테마가 비면 다음 테마로(빈 껍데기 금지)
            const th = themes[(s0 + k) % themes.length];
            let rows = [];
            try { rows = await th.run(); } catch (_) { rows = []; }
            if (!rows || rows.length < 2) continue;
            const cells = pick(rows, 2).map(x => ({
              href: 'travel-place.html?id=' + encodeURIComponent(x.id), img: x.photo, name: x.name,
              sub: x.note || (() => { let c = (x.city || '').trim(); const n = (x.country || '').trim();
                if (c && !/[가-힣]/.test(c) && /[가-힣]/.test(x.name || '')) c = '';   // 한글 이름 옆 영문 도시는 군더더기
                return (c && n && c.toLowerCase() !== n.toLowerCase()) ? c + ' · ' + n : (c || n || '여행'); })() }));
            const title = th.t || (rows[0] && rows[0].__title) || '가 볼 만한 곳';
            return fill('pcr-travel', grid(title, (rows[0] && rows[0].__meta) || '', cells, rows.__viz, { icon: rows.__icon, tone: rows.__tone }), 'search.html?tab=travel', '여행 더 보기');
          }
          fill('pcr-travel', '');
        } catch (_) { fill('pcr-travel', ''); }
      }),
      job('pcr-plaza', async () => {
        // ⑥ 광장 HOT — 추천 점수 순
        try {
          const { data } = await supa.from('plaza_posts')
            .select('id,title,category,up_count,down_count,cover_image,thumbnail,created_at')
            .order('hot_score', { ascending: false, nullsFirst: false }).limit(3);
          fill('pcr-plaza', (data || []).map(x => `
            <a class="pcr-row${(x.thumbnail || x.cover_image) ? ' pcr-media' : ''}" href="plaza_detail.html?id=${encodeURIComponent(x.id)}">
              ${(x.thumbnail || x.cover_image) ? IMG(x.thumbnail || x.cover_image, 160) : ''}
              <span class="pcr-tx"><b>${esc(x.title || '(제목 없음)')}</b><i>▲ ${(x.up_count || 0) - (x.down_count || 0)} · ${esc(x.category || '광장')} · ${ago(x.created_at)}</i></span>
            </a>`).join(''), 'search.html?tab=plaza', '광장 더 보기');
        } catch (_) { fill('pcr-plaza', ''); }
      }),
      job('pcr-rooms', async () => {
        // ⑦ 난장 라이브 — 최근 대화가 있는 방
        try {
          const { data } = await supa.from('open_rooms')
            .select('id,title,member_count,last_message,last_message_at,kind')
            .eq('kind', 'open')
            .order('last_message_at', { ascending: false, nullsFirst: false }).limit(3);
          fill('pcr-rooms', (data || []).map(r => `
            <a class="pcr-row" href="dm.html?tab=rooms">
              <b>${esc(r.title)}</b>
              <i>${r.member_count || 0}명 · ${r.last_message ? esc(String(r.last_message).slice(0, 22)) : '새 난장'}${r.last_message_at ? ' · ' + ago(r.last_message_at) : ''}</i>
            </a>`).join(''), 'dm.html?tab=rooms', '난장 전체 보기');
        } catch (_) { fill('pcr-rooms', ''); }
      }),
    ]);
  }

  let built = false;
  function boot() {
    if (!MQ.matches || built) return;
    built = true;
    buildLeft();
    buildRight();
    // 라이브 패널은 90초마다 새로 — 탭이 보일 때만(배터리·트래픽)
    setInterval(() => {
      if (document.hidden || !MQ.matches) return;
      /* 새 패널을 다 그린 뒤 옛 것을 걷는다 — 먼저 지우면 90초마다 패널이 통째로 깜빡였다. 새로 그릴 땐 등장 연출 없이 */
      const old = document.getElementById('pc-right');
      if (old) old.id = 'pc-right-old';
      QUIET = true;
      buildRight().finally(() => { QUIET = false; setTimeout(() => document.getElementById('pc-right-old')?.remove(), 400); });
    }, 90000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
  MQ.addEventListener?.('change', () => { if (MQ.matches) boot(); });
})();
