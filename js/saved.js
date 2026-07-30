/* ============================================================
   보관(저장 허브) — 이슈·예측·광장·뉴스 저장을 한 곳에서
   이중모드: 웹=MPA / 앱=SPA(로더 DCL 캡처). 탐색은 GALLA_nav.
   FK 임베드 의존 없이 2단계(북마크 id → 콘텐츠 조회)로 안전하게.
   ============================================================ */
(function () {
  const nav = (u) => (window.GALLA_nav || function (x) { location.href = x; })(u);
  const esc = (s) => (s == null ? '' : String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));

  const TYPES = {
    issue:   { table: 'bookmarks',            fk: 'issue_id',  ctable: 'issues',      cols: 'id,title,thumbnail_url,images,category', icon: '⚔️',
      map: (c) => ({ title: c.title, thumb: c.thumbnail_url || (Array.isArray(c.images) && c.images[0]) || '', kicker: c.category || '이슈', dest: `issue.html?id=${c.id}` }) },
    predict: { table: 'market_bookmarks',     fk: 'market_id', ctable: 'markets',     cols: 'id,question,image_url,category', icon: '🔮',
      map: (c) => ({ title: c.question, thumb: c.image_url || '', kicker: c.category || '예측', dest: `predict-market.html?id=${c.id}` }) },
    plaza:   { table: 'plaza_bookmarks',      fk: 'post_id',   ctable: 'plaza_posts', cols: 'id,title,thumbnail,cover_image,category', icon: '🏛️',
      map: (c) => ({ title: c.title, thumb: c.thumbnail || c.cover_image || '', kicker: c.category || '광장', dest: `plaza_detail.html?id=${c.id}` }) },
    news:    { table: 'galla_news_bookmarks', fk: 'news_id',   ctable: 'galla_news',  cols: 'id,title,hero_image,category', icon: '📰', wide: true,
      map: (c) => ({ title: c.title, thumb: c.hero_image || '', kicker: c.category || '뉴스', dest: `search.html?gn=${c.id}` }) },
  };

  function initSaved() {
    const sb = window.supabaseClient;
    const listBox = document.getElementById('sv-list');
    const tabs = document.querySelectorAll('.sv-tab');
    if (!listBox) return;
    let CUR = 'issue', ME = null;
    const cache = {};

    const back = document.getElementById('sv-back');
    if (back) back.addEventListener('click', () => {
      if (document.body.dataset.page === 'spa' && window.GALLA_SPA && window.GALLA_SPA.pop && window.GALLA_SPA.pop()) return;
      if (history.length > 1) history.back(); else nav('settings.html');
    });

    async function load(type) {
      CUR = type;
      tabs.forEach(t => t.classList.toggle('active', t.dataset.t === type));
      if (cache[type]) { render(type, cache[type]); return; }
      listBox.innerHTML = '<div class="sv-loading">불러오는 중…</div>';
      if (!sb) { listBox.innerHTML = '<div class="sv-empty">연결 오류</div>'; return; }
      if (!ME) { const { data } = await sb.auth.getSession(); ME = data?.session?.user?.id || null; }
      if (!ME) { listBox.innerHTML = '<div class="sv-empty"><b>로그인이 필요해요.</b></div>'; return; }

      const cfg = TYPES[type];
      const { data: bms } = await sb.from(cfg.table).select(`${cfg.fk}, created_at`).eq('user_id', ME).order('created_at', { ascending: false }).limit(100);
      const ids = [...new Set((bms || []).map(b => b[cfg.fk]))];
      if (!ids.length) { cache[type] = []; render(type, []); return; }
      const { data: rows } = await sb.from(cfg.ctable).select(cfg.cols).in('id', ids);
      const byId = {}; (rows || []).forEach(r => byId[r.id] = r);
      // 저장 순서(북마크 순) 보존
      const items = ids.map(id => byId[id]).filter(Boolean).map(cfg.map);
      cache[type] = items;
      render(type, items);
    }

    function render(type, items) {
      const cfg = TYPES[type];
      // 탭 카운트
      const tab = [...tabs].find(t => t.dataset.t === type);
      if (tab && !tab.querySelector('.sv-cnt')) tab.insertAdjacentHTML('beforeend', ` <span class="sv-cnt">${items.length}</span>`);
      else if (tab) tab.querySelector('.sv-cnt').textContent = items.length;

      if (!items.length) {
        listBox.innerHTML = `<div class="sv-empty"><b>저장한 ${type === 'issue' ? '이슈' : type === 'predict' ? '예측' : type === 'plaza' ? '광장 글' : '뉴스'}가 없어요.</b><br>마음에 드는 콘텐츠에서 🔖 저장을 눌러보세요.</div>`;
        return;
      }
      listBox.innerHTML = '<div class="sv-list">' + items.map((it, i) => `
        <div class="sv-card" data-dest="${esc(it.dest)}">
          ${it.thumb ? `<img class="sv-thumb${cfg.wide ? ' wide' : ''}" src="${esc(it.thumb)}" loading="lazy" onerror="this.classList.add('none');this.removeAttribute('src');this.textContent='${cfg.icon}'">`
                     : `<div class="sv-thumb${cfg.wide ? ' wide' : ''} none">${cfg.icon}</div>`}
          <div class="sv-info">
            <div class="sv-kicker">${cfg.icon} ${esc(it.kicker)}</div>
            <div class="sv-ttl">${esc(it.title || '(제목 없음)')}</div>
          </div>
          <button class="sv-unsave" data-idx="${i}" aria-label="저장 해제" title="저장 해제">🔖</button>
        </div>`).join('') + '</div>';

      listBox.querySelectorAll('.sv-card').forEach(el => el.addEventListener('click', (e) => {
        if (e.target.closest('.sv-unsave')) return;
        nav(el.dataset.dest);
      }));
      listBox.querySelectorAll('.sv-unsave').forEach(btn => btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const idx = Number(btn.dataset.idx);
        const dest = items[idx].dest;
        // dest에서 id 추출
        const m = dest.match(/[?&](?:id|gn)=([^&]+)/);
        const cid = m ? decodeURIComponent(m[1]) : null;
        if (cid == null) return;
        btn.disabled = true;
        const { error } = await sb.from(cfg.table).delete().eq('user_id', ME).eq(cfg.fk, cid);
        if (error) { btn.disabled = false; return; }
        try { window.GALLA_toast && window.GALLA_toast('저장을 해제했어요'); } catch (_) {}
        cache[type].splice(idx, 1);
        render(type, cache[type]);
      }));
    }

    tabs.forEach(t => t.addEventListener('click', () => { if (t.dataset.t !== CUR) load(t.dataset.t); }));
    load('issue');
  }

  window.GALLA_PAGE_SAVED = { init: initSaved };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initSaved);
  else initSaved();
})();
