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
        // ⑤ 맛집 — 사진 2장, 볼 때마다 바뀐다 (여행과 분리: 26.9.24 사장님)
        try {
          const { data } = await supa.rpc('food_browse', {});   // ⚠️ food_places 는 직접 읽기가 막혀 있다(RLS)
          const foods = [].concat(...(((data || {}).sections) || []).map(sec => (sec.places || []).filter(x => x.cover)));
          const cells = pick(foods, 2).map(x => ({ href: 'search.html?tab=food', img: x.cover, name: x.name,
            sub: [String(x.address || '').split(' ').slice(1, 2).join(''), x.category].filter(Boolean).join(' · ') }));
          fill('pcr-food', cells.length ? `<div class="pcr-grid">` + cells.map(c => `
            <a class="pcr-cell" href="${c.href}">${IMG(c.img, 300, 'pcr-cell-img')}<span class="pcr-cell-tx"><b>${esc(c.name)}</b><i>${esc(c.sub)}</i></span></a>`).join('') + `</div>` : '',
            'search.html?tab=food', '맛집 더 보기');
        } catch (_) { fill('pcr-food', ''); }
      }),
      job('pcr-travel', async () => {
        // ⑤-2 여행 — 사진 2장
        try {
          const { data } = await supa.from('travel_places')
            .select('id,name,city,country,photo').eq('status', 'live').not('photo', 'is', null).limit(60);
          const cells = pick(data, 2).map(x => ({ href: 'travel-place.html?id=' + encodeURIComponent(x.id),
            /* 도시·나라가 같으면 한 번만(예: '싱가포르 · 싱가포르') */
            img: x.photo, name: x.name,
            sub: (() => { const c = (x.city || '').trim(), n = (x.country || '').trim();
              return (c && n && c.toLowerCase() !== n.toLowerCase()) ? c + ' · ' + n : (c || n || '여행'); })() }));
          fill('pcr-travel', cells.length ? `<div class="pcr-grid">` + cells.map(c => `
            <a class="pcr-cell" href="${c.href}">${IMG(c.img, 300, 'pcr-cell-img')}<span class="pcr-cell-tx"><b>${esc(c.name)}</b><i>${esc(c.sub)}</i></span></a>`).join('') + `</div>` : '',
            'search.html?tab=travel', '여행 더 보기');
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
