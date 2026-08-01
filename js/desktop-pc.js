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
  const ago = iso => {
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
        <b>GALLA</b>
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
      <button class="pcl-getapp" type="button" aria-label="갈라 앱 받기">📲 <span>앱 받기</span></button>
      <div class="pcl-foot">
        여론이 에너지가 되는 곳<br>
        <a href="help-permissions.html">도움말</a> · <a href="#" id="pclBug">버그 신고</a>
      </div>`;
    document.body.appendChild(el);

    el.querySelector('.pcl-write').onclick = () => {
      if (window.openWriteHub) window.openWriteHub('galla');
      else (window.GALLA_nav||function(u){location.href=u})('write.html');
    };
    el.querySelector('.pcl-galvis').onclick = () => { window.GALLA_openFriend ? window.GALLA_openFriend() : (window.GALLA_askGalvis && window.GALLA_askGalvis({})); };
    el.querySelector('.pcl-getapp').onclick = () => { window.GALLA_appDownload && window.GALLA_appDownload('getapp'); };
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
  function fill(id, html, moreHref, moreLabel) {
    const el = document.querySelector(`#${id} .pcr-body`);
    if (!el) return;
    if (!html) { document.getElementById(id)?.remove(); return; }
    el.innerHTML = html + (moreHref ? `<a class="pcr-more" href="${moreHref}">${moreLabel} →</a>` : '');
  }

  async function buildRight() {
    if (document.getElementById('pc-right')) return;
    const el = document.createElement('aside');
    el.id = 'pc-right';
    el.innerHTML =
      card('pcr-battle', '실시간 전황', true) +
      card('pcr-hot', '지금 뜨는 영상') +
      card('pcr-predict', '오늘의 예측') +
      card('pcr-rooms', '난장 라이브', true) +
      // 📲 앱 다운로드 프로모(정적) — 갈비스와 함께 핵심 전환 트리거
      `<section class="pcr-card pcr-getapp"><h3>📲 갈라 앱</h3>
        <div class="pcr-body"><p class="pcr-dl-t">알림·통화·오프라인까지 — <b>앱으로 더 크게</b></p>
        <button class="pcr-dl" type="button">앱 받기</button></div></section>`;
    document.body.appendChild(el);
    el.querySelector('.pcr-dl')?.addEventListener('click', () => { window.GALLA_appDownload && window.GALLA_appDownload('getapp'); });

    const supa = await sb();
    if (!supa) { el.remove(); return; }

    // ① 실시간 전황 — 지금 가장 뜨거운 이슈(찬반 합산 상위)
    try {
      const { data } = await supa.from('issues')
        .select('id,title,pro_count,con_count,view_count,created_at')
        .order('created_at', { ascending: false }).limit(24);
      const hot = (data || [])
        .map(r => ({ ...r, heat: (r.pro_count || 0) + (r.con_count || 0) }))
        .sort((a, b) => b.heat - a.heat).slice(0, 4);
      fill('pcr-battle', hot.map(r => {
        const p = r.pro_count || 0, c = r.con_count || 0, t = Math.max(1, p + c);
        return `<a class="pcr-row" href="issue.html?id=${r.id}">
          <b>${esc(r.title)}</b>
          <div class="pcr-odds"><span class="yes" style="width:${Math.round(p / t * 100)}%"></span><span class="no" style="width:${Math.round(c / t * 100)}%"></span></div>
          <i>찬 ${p} · 반 ${c} · ${ago(r.created_at)}</i>
        </a>`;
      }).join(''), 'index.html', '전장 전체 보기');
    } catch (_) { fill('pcr-battle', ''); }

    // ①.5 지금 뜨는 영상 — 핫튜브(유튜브 인기 급상승, 롱폼 상위). 임베드 재생은 트렌드 탭에서.
    try {
      const { data } = await supa.from('youtube_hot')
        .select('video_id,title,channel_title,view_count')
        .eq('feed', 'all').eq('is_short', false)
        .not('channel_title', 'ilike', '%- Topic')
        .order('rank', { ascending: true }).limit(4);
      const sN = n => { n = Number(n) || 0; return n >= 100000000 ? (n/1e8).toFixed(1).replace(/\.0$/,'')+'억' : n >= 10000 ? (n/1e4).toFixed(1).replace(/\.0$/,'')+'만' : String(n); };
      fill('pcr-hot', (data || []).map(v => `
        <a class="pcr-row" href="search.html?video=${encodeURIComponent(v.video_id)}">
          <b>${esc(v.title)}</b>
          <i>${esc(v.channel_title || '')}${v.view_count ? ' · 조회 ' + sN(v.view_count) : ''}</i>
        </a>`).join(''), 'search.html', '핫튜브 전체 보기');
    } catch (_) { fill('pcr-hot', ''); }

    // ② 오늘의 예측 — 마감 임박 순(살아있는 마켓)
    try {
      const { data } = await supa.from('markets')
        .select('id,question,total_pool,volume,close_at,resolved')
        .eq('resolved', false)
        .order('close_at', { ascending: true }).limit(3);
      fill('pcr-predict', (data || []).map(m => `
        <a class="pcr-row" href="predict-market.html?id=${m.id}">
          <b>${esc(m.question)}</b>
          <i>상금풀 ${Number(m.total_pool || 0).toLocaleString()} GP · ${until(m.close_at)}</i>
        </a>`).join(''), 'predict.html', '예측 전체 보기');
    } catch (_) { fill('pcr-predict', ''); }

    // ③ 난장 라이브 — 최근 대화가 있는 방
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
      document.getElementById('pc-right')?.remove();
      buildRight();
    }, 90000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
  MQ.addEventListener?.('change', () => { if (MQ.matches) boot(); });
})();
