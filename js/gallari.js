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

      const { data: posts, error } = await sb.from('posts')
        .select('id,user_id,kind,title,caption,images,video_url,thumbnail_url,like_count,comment_count,created_at')
        .eq('kind', kind).eq('is_published', true)
        .neq('moderation_status', 'blocked')
        .order('created_at', { ascending: false }).limit(30);

      if (error) { box.innerHTML = '<div class="glf-empty">불러오기 실패</div>'; loading = false; return; }
      if (!posts || !posts.length) {
        box.innerHTML = `<div class="glf-empty"><b>아직 ${kind === 'vertical' ? '⚡ 숏판' : '🎬 롱판'} 콘텐츠가 없어요.</b><br>첫 갈라리를 올려보세요.</div>`;
        loading = false; return;
      }

      // 작성자 프로필
      const ids = [...new Set(posts.map(p => p.user_id))];
      const { data: users } = await sb.from('users').select('id,nickname,avatar_url').in('id', ids);
      const U = {}; (users || []).forEach(u => U[u.id] = u);
      const ava = (uid) => {
        const u = U[uid] || {};
        return window.GALLA_avatarSrc ? window.GALLA_avatarSrc(u.avatar_url, 72) : (u.avatar_url || (window.GALLA_DEFAULT_AVATAR || ''));
      };
      const thumb = (p) => p.thumbnail_url || (Array.isArray(p.images) && p.images[0]) || '';

      let html;
      if (kind === 'vertical') {
        html = '<div class="glf-grid">' + posts.map(p => {
          const t = thumb(p);
          const isVid = !!p.video_url;
          const isMulti = Array.isArray(p.images) && p.images.length > 1;
          return `<div class="glf-tile" data-id="${p.id}">
            ${t ? `<img src="${esc(t)}" loading="lazy">` : '<div style="width:100%;height:100%;background:#141420"></div>'}
            ${isVid ? `<span class="glf-play">${PLAY}</span>` : (isMulti ? `<span class="glf-multi">${MULTI}</span>` : '')}
            <div class="glf-meta"><span>♥ ${p.like_count || 0}</span><span>💬 ${p.comment_count || 0}</span></div>
          </div>`;
        }).join('') + '</div>';
      } else {
        html = '<div class="glf-list">' + posts.map(p => {
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
        el.addEventListener('click', () => {
          // 숏판(세로) = 상세 없이 릴스로 / 롱판(가로) = 유튜브식 상세로
          if (KIND === 'vertical') nav('gallari-reels.html?start=' + el.dataset.id + '&t=post');
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
