/* ============================================================
   갈라리 피드 — 세로(릴스 그리드) / 가로(유튜브 리스트)
   이중모드: 웹=MPA 독립문서(SEO), 앱=SPA(로더가 DCL 캡처해 실행).
   탐색은 GALLA_nav(SPA면 스택 push, MPA면 문서 이동)로 통일.
   ============================================================ */
(function () {
  const nav = (u) => (window.GALLA_nav || function (x) { location.href = x; })(u);

  function initGallariFeed() {
    const sb = window.supabaseClient;
    const seg = document.querySelectorAll('.glf-seg button');
    const box = document.getElementById('glf-feed');
    if (!box) return;

    let KIND = 'vertical';
    let loading = false;
    const cache = {};   // kind -> html (재조회 최소화)

    const esc = (s) => (s == null ? '' : String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
    const PLAY = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
    const MULTI = '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M16 1H4a2 2 0 0 0-2 2v12h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z"/></svg>';
    const PLAY_LG = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="11" fill="rgba(0,0,0,.35)"/><path d="M9.5 7.5v9l7-4.5z" fill="#fff"/></svg>';

    async function load(kind) {
      if (loading) return;
      if (cache[kind]) { box.innerHTML = cache[kind]; bindItems(); return; }
      loading = true;
      box.innerHTML = '<div class="glf-loading">불러오는 중…</div>';
      if (!sb) { box.innerHTML = '<div class="glf-empty">연결 오류</div>'; loading = false; return; }

      // 🌍 읽기 필터 — 갈라리는 기본 global이라 대부분 그대로 보인다(언어 하나면 no-op).
      const { data: posts, error } = await (window.GALLA_lfilter || function (q) { return q; })(sb.from('posts')
        .select('id,user_id,kind,title,caption,images,media,video_url,thumbnail_url,like_count,comment_count,created_at,hot_score')
        .eq('kind', kind).eq('is_published', true)
        .neq('moderation_status', 'blocked')
        /* 랭킹: hot_score = (1+참여)^0.8 / (나이+2)^1.4 (10분 크론).
           참여가 0이면 사실상 최신순이 되므로 콘텐츠가 적어도 이상하지 않다. */
        .order('hot_score', { ascending: false })
        .order('created_at', { ascending: false }).limit(30));

      if (error) { box.innerHTML = '<div class="glf-empty">불러오기 실패</div>'; loading = false; return; }
      if (!posts || !posts.length) {
        box.innerHTML = `<div class="glf-empty"><b>아직 ${kind === 'vertical' ? '⚡ 숏판' : '🎬 롱판'} 콘텐츠가 없어요.</b><br>첫 ${kind === 'vertical' ? '숏판' : '롱판'}을 올려보세요.</div>`;
        loading = false; return;
      }

      /* 🔀 작성자 다양성 — 한 사람이 상단을 독식하지 못하게(공용 GALLA_diversify) */
      let feed = posts;
      if (window.GALLA_diversify) {
        feed = window.GALLA_diversify(posts, p => p.user_id, p => Number(p.hot_score) || 0);
      }

      // 작성자 프로필
      const ids = [...new Set(feed.map(p => p.user_id))];
      const { data: users } = await sb.from('users').select('id,nickname,avatar_url').in('id', ids);
      const U = {}; (users || []).forEach(u => U[u.id] = u);
      const ava = (uid) => {
        const u = U[uid] || {};
        return window.GALLA_avatarSrc ? window.GALLA_avatarSrc(u.avatar_url, 72) : (u.avatar_url || (window.GALLA_DEFAULT_AVATAR || ''));
      };
      const thumb = (p) => p.thumbnail_url || (Array.isArray(p.images) && p.images[0]) || '';

      let html;
      if (kind === 'vertical') {
        html = '<div class="glf-grid">' + feed.map(p => {
          const t = thumb(p);
          const mc = (Array.isArray(p.media) && p.media.length) ? p.media.length
            : (Array.isArray(p.images) && p.images.length ? p.images.length + (p.video_url ? 1 : 0) : ((p.video_url || p.thumbnail_url) ? 1 : 0));
          const isCar = mc > 1;   // 캐러셀 = 미디어 2개+ (릴스 제외 → 상세)
          const isVid = !!p.video_url && !isCar;
          return `<div class="glf-tile" data-id="${p.id}" data-car="${isCar ? 1 : 0}">
            ${t ? `<img src="${esc(t)}" loading="lazy">` : '<div style="width:100%;height:100%;background:#141420"></div>'}
            ${isCar ? `<span class="glf-multi">${MULTI}</span>` : (isVid ? `<span class="glf-play">${PLAY}</span>` : '')}
            <div class="glf-meta"><span>♥ ${p.like_count || 0}</span><span>💬 ${p.comment_count || 0}</span></div>
          </div>`;
        }).join('') + '</div>';
      } else {
        html = '<div class="glf-list">' + feed.map(p => {
          const t = thumb(p);
          const u = U[p.user_id] || {};
          return `<div class="glf-card" data-id="${p.id}">
            <div class="glf-thumb">
              ${t ? `<img src="${esc(t)}" loading="lazy">` : '<div style="width:100%;height:100%;background:#141420"></div>'}
              <div class="glf-play-lg">${PLAY_LG}</div>
            </div>
            <div class="glf-cbody">
              <img class="glf-cava" src="${esc(ava(p.user_id))}" onerror="this.style.visibility='hidden'">
              <div class="glf-cinfo">
                <div class="glf-ctitle">${esc(p.title || p.caption || '(제목 없음)')}</div>
                <div class="glf-cmeta">${esc(u.nickname || '익명')} · 조회 0 · ♥ ${p.like_count || 0}</div>
              </div>
            </div>
          </div>`;
        }).join('') + '</div>';
      }
      cache[kind] = html;
      box.innerHTML = html;
      bindItems();
      loading = false;
    }

    function bindItems() {
      box.querySelectorAll('[data-id]').forEach(el => {
        /* 📊 신호 — 이 카드가 화면에 1초 이상 보였는지(노출)와 눌렀는지(진입).
           노출이 있어야 '보여줬는데 안 눌렀다'를 알 수 있고, 그게 랭킹의 분모다. */
        if (window.GALLA_signal) window.GALLA_signal.card(el, { kind: KIND, id: el.dataset.id, surface: 'gallari' });
        el.addEventListener('click', () => {
          if (window.GALLA_signal) window.GALLA_signal.act(KIND, el.dataset.id, 'open', 'gallari');
          // 숏판 단일(세로) = 릴스로 / 숏판 캐러셀·롱판 = 상세로
          if (KIND === 'vertical' && el.dataset.car !== '1') nav('gallari-reels.html?start=' + el.dataset.id + '&t=post');
          else nav('gallari-post.html?id=' + el.dataset.id);
        });
      });
    }

    seg.forEach(b => b.addEventListener('click', () => {
      if (b.dataset.kind === KIND) return;
      KIND = b.dataset.kind;
      seg.forEach(x => x.classList.toggle('active', x.dataset.kind === KIND));
      load(KIND);
    }));

    // 헤더 버튼
    const backBtn = document.getElementById('glf-back');
    if (backBtn) backBtn.addEventListener('click', () => {
      if (document.body.dataset.page === 'spa' && window.GALLA_SPA && window.GALLA_SPA.pop && window.GALLA_SPA.pop()) return;
      if (history.length > 1) history.back(); else nav('index.html');
    });
    const addBtn = document.getElementById('glf-add');
    if (addBtn) addBtn.addEventListener('click', () => nav('gallari-write.html'));

    load(KIND);
  }

  window.GALLA_PAGE_GALLARI_FEED = { init: initGallariFeed };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initGallariFeed);
  else initGallariFeed();
})();
