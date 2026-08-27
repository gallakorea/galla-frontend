/* ============================================================
   갈라리 상세 — 세로=쓰레드/인스타식, 가로=유튜브식 + 일반 댓글
   이중모드: 웹=MPA 독립문서(SEO 타깃), 앱=SPA(로더 DCL 캡처). id는 search·hash 둘 다 지원.
   ============================================================ */
(function () {
  const nav = (u) => (window.GALLA_nav || function (x) { location.href = x; })(u);
  const esc = (s) => (s == null ? '' : String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
  const timeago = (t) => {
    const d = (Date.now() - new Date(t).getTime()) / 1000;
    if (d < 60) return '방금'; if (d < 3600) return Math.floor(d / 60) + '분 전';
    if (d < 86400) return Math.floor(d / 3600) + '시간 전'; if (d < 604800) return Math.floor(d / 86400) + '일 전';
    return new Date(t).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
  };
  function getParam(k) {
    const s = new URLSearchParams(location.search).get(k); if (s) return s;
    const h = location.hash || ''; const qi = h.indexOf('?');
    if (qi >= 0) return new URLSearchParams(h.slice(qi + 1)).get(k);
    return null;
  }
  const HEART = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.5 1-1a5.5 5.5 0 0 0 0-7.9z"/></svg>';
  const CHAT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
  const SHARE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/></svg>';

  async function initGallariPost() {
    const sb = window.supabaseClient;
    const root = document.getElementById('glp-root');
    if (!root) return;
    const id = getParam('id');
    if (!id) { root.innerHTML = '<div class="glp-cempty">콘텐츠를 찾을 수 없어요.</div>'; return; }

    // 뒤로
    const back = document.getElementById('glp-back');
    if (back) back.addEventListener('click', () => {
      if (document.body.dataset.page === 'spa' && window.GALLA_SPA && window.GALLA_SPA.pop && window.GALLA_SPA.pop()) return;
      if (history.length > 1) history.back(); else nav('gallari.html');
    });

    if (!sb) { root.innerHTML = '<div class="glp-cempty">연결 오류</div>'; return; }
    const { data: { session } } = await sb.auth.getSession();
    const me = session?.user?.id || null;

    const { data: post, error } = await sb.from('posts').select('*').eq('id', id).maybeSingle();
    if (error || !post) { root.innerHTML = '<div class="glp-cempty">삭제되었거나 없는 콘텐츠예요.</div>'; return; }

    const [{ data: author }, { data: myLike }] = await Promise.all([
      sb.from('users').select('id,nickname,avatar_url').eq('id', post.user_id).maybeSingle(),
      me ? sb.from('post_likes').select('post_id').eq('post_id', id).eq('user_id', me).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const ava = (u) => window.GALLA_avatarSrc ? window.GALLA_avatarSrc((u || {}).avatar_url, 96) : ((u || {}).avatar_url || (window.GALLA_DEFAULT_AVATAR || ''));
    let liked = !!myLike, likeCount = post.like_count || 0;

    window.GALLA_DOMAIN = post.kind === 'horizontal' ? 'long' : 'short';
    document.getElementById('glp-top-title').textContent = post.kind === 'horizontal' ? (post.title || '롱판') : (author?.nickname || '숏판');

    // ⋯ 소유자/관리자 관리 메뉴(수정·삭제) — 공용 owner-actions 재사용
    const moreBtn = document.getElementById('glp-more');
    if (moreBtn && window.GALLA_canManage) {
      window.GALLA_canManage(post.user_id).then((can) => {
        if (!can) return;
        moreBtn.hidden = false;
        moreBtn.onclick = () => window.GALLA_openOwnerMenu({
          table: 'posts', id: post.id, ownerId: post.user_id, label: post.kind === 'horizontal' ? '롱판' : '숏판',
          editFields: post.kind === 'horizontal'
            ? [{ key: 'title', label: '제목', type: 'text', value: post.title || '' },
               { key: 'caption', label: '설명', type: 'textarea', value: post.caption || '' }]
            : [{ key: 'caption', label: '내용', type: 'textarea', value: post.caption || '' }],
          onSaved: (patch) => {
            if (patch.title != null && post.kind === 'horizontal') {
              post.title = patch.title;
              const tEl = document.querySelector('.glp-title'); if (tEl) tEl.textContent = patch.title;
              document.getElementById('glp-top-title').textContent = patch.title || '롱판';
            }
            if (patch.caption != null) {
              post.caption = patch.caption;
              const cEl = document.querySelector('.glp-caption');
              if (cEl) cEl.innerHTML = post.kind === 'horizontal' ? esc(patch.caption)
                : `<b>${esc(author?.nickname || '')}</b>  ${esc(patch.caption)}`;
            }
          },
          onDeleted: () => {
            if (document.body.dataset.page === 'spa' && window.GALLA_SPA && window.GALLA_SPA.pop && window.GALLA_SPA.pop()) return;
            nav('gallari.html');
          },
        });
      }).catch(() => {});
    }

    // ---- 미디어 ----
    let mediaHtml = '';
    if (post.kind === 'horizontal') {
      // 롱판 — 단일 가로영상
      if (post.video_url) mediaHtml = `<div class="glp-media horizontal"><video src="${esc(post.video_url)}" controls playsinline preload="metadata" poster="${esc(post.thumbnail_url || '')}"></video></div>`;
    } else {
      // 🎠 숏판 — 혼합 캐러셀(사진+영상). 정규화기로 media[]/레거시 모두 처리.
      const media = (window.GALLA_issueMedia ? window.GALLA_issueMedia(post) : []) || [];
      const vSlide = (m) => `<video data-hls="${esc(m.url)}" controls playsinline muted preload="none" poster="${esc(m.thumb || '')}"></video>`;
      if (media.length === 1) {
        const m = media[0];
        mediaHtml = `<div class="glp-media vertical">${m.type === 'video' ? vSlide(m) : `<img src="${esc(m.url)}">`}</div>`;
      } else if (media.length > 1) {
        const slides = media.map(m => m.type === 'video' ? vSlide(m) : `<img src="${esc(m.url)}">`).join('');
        mediaHtml = `<div class="glp-carousel"><div class="glp-slides">${slides}</div>
          <div class="glp-dots">${media.map((_, i) => `<i class="${i === 0 ? 'on' : ''}"></i>`).join('')}</div></div>`;
      }
    }

    const headHtml = `<div class="glp-head">
      <img class="glp-ava" src="${esc(ava(author))}" onerror="this.style.visibility='hidden'">
      <div class="glp-hinfo"><div class="glp-nick">${esc(author?.nickname || '익명')}</div><div class="glp-time">${timeago(post.created_at)}</div></div>
    </div>`;

    const actionsHtml = `<div class="glp-actions">
      <button class="glp-act glp-like${liked ? ' on' : ''}" id="glp-like">${HEART}<span id="glp-likec">${likeCount}</span></button>
      <button class="glp-act" id="glp-cfocus">${CHAT}<span>${post.comment_count || 0}</span></button>
      <button class="glp-act" id="glp-share">${SHARE}</button>
      <button class="glp-act" data-galvis data-gv-type="gallari" data-gv-id="${esc(post.id)}" data-gv-title="${esc((post.caption || post.title || '게시물').slice(0, 120))}" aria-label="갈비스와 얘기"><svg class="gv-galvis" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="8.2" stroke-width="1.5" stroke-dasharray="2.3 2.2"/><circle cx="12" cy="12" r="4.7" stroke-width="1.3"/><circle cx="12" cy="12" r="1.9" fill="currentColor" stroke="none"/></svg></button>
      <button class="glp-support" id="glp-support">🎁 후원</button>
    </div>`;

    const tagsHtml = (Array.isArray(post.tags) && post.tags.length)
      ? `<div class="glp-tags">${post.tags.map(t => `<span>#${esc(t)}</span>`).join('')}</div>` : '';

    // ---- kind별 조립 ----
    let body;
    const donationsHtml = '<div id="glp-donations" class="glp-donations"></div>';
    if (post.kind === 'horizontal') {
      // 유튜브 watch식: 영상(상단 고정) → 제목 → 조회·시간 → 액션 → 크리에이터(팔로우) → 후원자 → 설명(접기) → 태그 → 댓글 → 다음 영상
      const metaRow = `<div class="glp-vmeta">조회 ${(post.view_count || 0).toLocaleString()}회 · ${timeago(post.created_at)}</div>`;
      const creatorRow = `<div class="glp-creator">
        <img class="glp-ava sm" src="${esc(ava(author))}" data-prof="${esc(post.user_id)}" onerror="this.style.visibility='hidden'">
        <div class="glp-cr-info"><div class="glp-nick">${esc(author?.nickname || '익명')}</div><div class="glp-cr-sub">GALLA 크리에이터</div></div>
        ${me && post.user_id !== me ? `<button class="glp-follow-btn js-follow" data-uid="${esc(post.user_id)}">+ 팔로우</button>` : ''}
      </div>`;
      const descHtml = post.caption
        ? `<div class="glp-desc collapsed" id="glp-desc"><div class="glp-desc-body">${esc(post.caption)}</div><button type="button" class="glp-desc-more" id="glp-desc-more">…더보기</button></div>` : '';
      body = mediaHtml
        + '<div class="glp-watch">'
        + (post.title ? `<div class="glp-title">${esc(post.title)}</div>` : '')
        + metaRow + actionsHtml + creatorRow + donationsHtml + descHtml + tagsHtml
        + '</div>';
    } else {
      body = headHtml + mediaHtml + actionsHtml + donationsHtml
        + (post.caption ? `<div class="glp-caption"><b>${esc(author?.nickname || '')}</b>  ${esc(post.caption)}</div>` : '')
        + tagsHtml;
    }

    root.innerHTML = body
      + '<div class="glp-div"></div>'
      + '<div class="glp-csec"><div class="glp-ctitle">댓글 <span id="glp-ccount">' + (post.comment_count || 0) + '</span></div><div class="glp-clist" id="glp-clist"><div class="glp-cempty">불러오는 중…</div></div></div>'
      + (post.kind === 'horizontal' ? '<div class="glp-div"></div><div id="glp-related" class="glp-related"></div>' : '')
      + '<div class="glp-cbar"><input id="glp-cinput" placeholder="' + (me ? '댓글 달기…' : '로그인하고 댓글 달기') + '" ' + (me ? '' : 'disabled') + '><button id="glp-csend" ' + (me ? '' : 'disabled') + '>게시</button></div>';

    // 🎬 영상 슬라이드 HLS 부착(Cloudflare Stream .m3u8) — 탭하면 재생(controls)
    root.querySelectorAll('video[data-hls]').forEach(v => {
      const src = v.getAttribute('data-hls'); if (!src) return;
      if (window.GALLA_attachHls) window.GALLA_attachHls(v, src); else v.src = src;
    });

    // 캐러셀 도트
    const slides = root.querySelector('.glp-slides');
    if (slides) {
      const dots = root.querySelectorAll('.glp-dots i');
      slides.addEventListener('scroll', () => {
        const i = Math.round(slides.scrollLeft / slides.clientWidth);
        dots.forEach((d, k) => d.classList.toggle('on', k === i));
      }, { passive: true });
    }

    // 좋아요
    document.getElementById('glp-like').addEventListener('click', async () => {
      if (!me) { alert('로그인이 필요해요.'); return; }
      const btn = document.getElementById('glp-like'), c = document.getElementById('glp-likec');
      liked = !liked; likeCount += liked ? 1 : -1;
      btn.classList.toggle('on', liked); c.textContent = likeCount;
      try { window.BattleFX?.haptic?.('tap'); } catch (_) {}
      const r = liked
        ? await sb.from('post_likes').insert({ post_id: id, user_id: me })
        : await sb.from('post_likes').delete().eq('post_id', id).eq('user_id', me);
      if (r.error && r.error.code !== '23505') { liked = !liked; likeCount += liked ? 1 : -1; btn.classList.toggle('on', liked); c.textContent = likeCount; }
    });

    // 후원(GC) — 갈라코인 후원 시트(donate.js). 창작자 이름 전달.
    document.getElementById('glp-support').addEventListener('click', () => {
      if (me && post.user_id === me) { (window.GALLA_toast || alert)('내 콘텐츠예요 — 후원은 받는 쪽이에요'); return; }
      if (!me) { alert('로그인하고 후원할 수 있어요.'); return; }
      if (window.openDonatePost) window.openDonatePost(id, author?.nickname || '창작자');
      else (window.GALLA_toast || alert)('후원 준비 중이에요');
    });

    // 공유 — /share/post/<id> OG 엣지 렌더 링크로
    document.getElementById('glp-share').addEventListener('click', () => {
      const shareUrl = window.GALLA_SITE + '/share/post/' + id;
      const text = post.title || post.caption || '콘텐츠';
      if (window.GALLA_share) window.GALLA_share({ url: shareUrl, title: 'GALLA', text });
      else if (navigator.share) navigator.share({ title: 'GALLA', text, url: shareUrl }).catch(() => {});
      else { try { navigator.clipboard.writeText(shareUrl); } catch (_) {} (window.GALLA_toast || alert)('링크를 복사했어요'); }
    });

    // 후원자 요약(슈퍼챗) — 후원 성공 시 donate.js가 다시 부른다
    async function renderDonations() {
      const box = document.getElementById('glp-donations'); if (!box) return;
      const { data } = await sb.rpc('post_donations', { p_post_id: id });
      if (!data || !data.count) { box.innerHTML = ''; return; }
      const won = (n) => (n || 0).toLocaleString() + '원';
      const rows = data.rows || [];
      box.innerHTML = `<div class="glp-don-sum">🎁 후원 ${data.count}명 · ${won(data.total)}</div>`
        + rows.slice(0, 3).map(r => `<div class="glp-don-row"><b>${esc(r.name)}</b> ${won(r.amount)}${r.message ? ' · ' + esc(r.message) : ''}</div>`).join('');
    }
    window.GALLA_renderPostDonations = renderDonations;
    renderDonations();

    // 댓글
    loadComments(sb, id, me, ava);
    const focusC = () => { const el = document.getElementById('glp-cinput'); el && !el.disabled && el.focus(); };
    document.getElementById('glp-cfocus').addEventListener('click', focusC);

    // 조회수 +1 (뷰어도 가능한 SECURITY DEFINER RPC)
    try { sb.rpc('bump_post_view', { p_id: id }); } catch (_) {}

    // 롱판(유튜브식) 부가 UX — 설명 접기·프로필·팔로우·다음 영상
    if (post.kind === 'horizontal') {
      const dmore = document.getElementById('glp-desc-more');
      const desc = document.getElementById('glp-desc');
      if (dmore && desc) {
        // 2줄 안 넘으면 더보기 숨김
        requestAnimationFrame(() => { const b = desc.querySelector('.glp-desc-body'); if (b && b.scrollHeight <= b.clientHeight + 2) dmore.style.display = 'none'; });
        dmore.addEventListener('click', () => {
          desc.classList.toggle('collapsed');
          dmore.textContent = desc.classList.contains('collapsed') ? '…더보기' : '접기';
        });
      }
      root.querySelectorAll('[data-prof]').forEach(a => a.addEventListener('click', () => nav('mypage.html?user=' + a.dataset.prof)));
      try { window.GALLA_bindFollow && window.GALLA_bindFollow(root); } catch (_) {}
      loadRelated(sb, id);
    }
  }

  // 다음 영상 — 다른 롱판 목록
  async function loadRelated(sb, curId) {
    const box = document.getElementById('glp-related'); if (!box) return;
    const { data } = await sb.from('posts')
      .select('id,title,caption,thumbnail_url,images,user_id,view_count,created_at')
      .eq('kind', 'horizontal').eq('is_published', true).neq('moderation_status', 'blocked').neq('id', curId)
      .order('created_at', { ascending: false }).limit(12);
    if (!data || !data.length) { box.innerHTML = ''; return; }
    const uids = [...new Set(data.map(r => r.user_id))];
    const { data: us } = await sb.from('users').select('id,nickname').in('id', uids);
    const U = {}; (us || []).forEach(u => U[u.id] = u);
    box.innerHTML = '<div class="glp-related-h">다음 영상</div>' + data.map(r => {
      const t = r.thumbnail_url || (Array.isArray(r.images) && r.images[0]) || '';
      return `<div class="glp-rel" data-id="${r.id}">
        <div class="glp-rel-thumb">${t ? `<img src="${esc(t)}" loading="lazy">` : ''}<span class="glp-rel-play">▶</span></div>
        <div class="glp-rel-info"><div class="glp-rel-t">${esc(r.title || r.caption || '(제목 없음)')}</div>
          <div class="glp-rel-m">${esc((U[r.user_id] || {}).nickname || '익명')} · 조회 ${(r.view_count || 0).toLocaleString()}회</div></div>
      </div>`;
    }).join('');
    box.querySelectorAll('.glp-rel').forEach(el => el.addEventListener('click', () => nav('gallari-post.html?id=' + el.dataset.id)));
  }

  let REPLY_TO = null;
  async function loadComments(sb, postId, me, ava) {
    const list = document.getElementById('glp-clist');
    const { data: comments } = await sb.from('post_comments')
      .select('id,user_id,parent_id,body,like_count,created_at')
      .eq('post_id', postId).order('created_at', { ascending: true }).limit(300);

    if (!comments || !comments.length) { list.innerHTML = '<div class="glp-cempty">첫 댓글을 남겨보세요.</div>'; wireInput(sb, postId, me, ava); return; }

    const uids = [...new Set(comments.map(c => c.user_id))];
    const [{ data: users }, myLikes] = await Promise.all([
      sb.from('users').select('id,nickname,avatar_url').in('id', uids),
      me ? sb.from('post_comment_likes').select('comment_id').eq('user_id', me).in('comment_id', comments.map(c => c.id)) : Promise.resolve({ data: [] }),
    ]);
    const U = {}; (users || []).forEach(u => U[u.id] = u);
    const likedSet = new Set((myLikes.data || []).map(r => r.comment_id));

    const tops = comments.filter(c => !c.parent_id);
    const repliesBy = {}; comments.filter(c => c.parent_id).forEach(c => { (repliesBy[c.parent_id] = repliesBy[c.parent_id] || []).push(c); });

    const row = (c, isReply) => {
      const u = U[c.user_id] || {};
      const on = likedSet.has(c.id);
      return `<div class="glp-c${isReply ? ' reply' : ''}" data-cid="${c.id}">
        <img class="glp-cava" src="${esc(ava(u))}" onerror="this.style.visibility='hidden'">
        <div class="glp-cmain">
          <div class="glp-cnick">${esc(u.nickname || '익명')}<span class="glp-ctime">${timeago(c.created_at)}</span></div>
          <div class="glp-cbody">${esc(c.body)}</div>
          <div class="glp-cfoot">
            <button class="glp-clike${on ? ' on' : ''}" data-cid="${c.id}">♥ <span>${c.like_count || 0}</span></button>
            ${isReply ? '' : `<button class="glp-creply" data-cid="${c.id}" data-nick="${esc(u.nickname || '익명')}">답글</button>`}
            <button class="glp-cshare" data-cid="${c.id}" data-body="${esc(c.body || '')}" aria-label="댓글 공유">🔗</button>
          </div>
        </div>
      </div>`;
    };
    list.innerHTML = tops.map(c => row(c, false) + (repliesBy[c.id] || []).map(r => row(r, true)).join('')).join('');

    // 댓글 좋아요
    list.querySelectorAll('.glp-clike').forEach(b => b.addEventListener('click', async () => {
      if (!me) { alert('로그인이 필요해요.'); return; }
      const cid = Number(b.dataset.cid); const span = b.querySelector('span');
      const on = b.classList.toggle('on'); span.textContent = Math.max(0, Number(span.textContent) + (on ? 1 : -1));
      const r = on ? await sb.from('post_comment_likes').insert({ comment_id: cid, user_id: me })
                   : await sb.from('post_comment_likes').delete().eq('comment_id', cid).eq('user_id', me);
      if (r.error && r.error.code !== '23505') { const back = b.classList.toggle('on'); span.textContent = Math.max(0, Number(span.textContent) + (back ? 1 : -1)); }
    }));
    // 답글
    list.querySelectorAll('.glp-creply').forEach(b => b.addEventListener('click', () => {
      REPLY_TO = Number(b.dataset.cid);
      const el = document.getElementById('glp-cinput');
      if (el) { el.placeholder = `@${b.dataset.nick} 님에게 답글…`; el.focus(); }
    }));
    // 🔗 댓글 공유 — 인용 카드(/share/comment/post/<cid>)
    list.querySelectorAll('.glp-cshare').forEach(b => b.addEventListener('click', () => {
      const cid = b.dataset.cid;
      const url = window.GALLA_shareCommentUrl ? window.GALLA_shareCommentUrl('post', cid) : (window.GALLA_SITE + '/share/comment/post/' + cid);
      const raw = String(b.dataset.body || '').replace(/\s+/g, ' ').trim();
      const title = '🗯️ ' + (raw ? `“${raw.slice(0, 40)}”` : '이 댓글');
      const text = '갈라에서 이 댓글에 받아쳐봐';
      if (window.GALLA_share) window.GALLA_share({ url, title, text });
      else if (navigator.share) navigator.share({ title, text, url }).catch(() => {});
      else { try { navigator.clipboard.writeText(url); window.GALLA_toast && GALLA_toast('🔗 댓글 링크 복사됨'); } catch (_) {} }
    }));
    wireInput(sb, postId, me, ava);
  }

  function wireInput(sb, postId, me, ava) {
    const input = document.getElementById('glp-cinput'), send = document.getElementById('glp-csend');
    if (!input || !send || input.dataset.wired) return;
    input.dataset.wired = '1';
    const submit = async () => {
      if (!me) { alert('로그인이 필요해요.'); return; }
      const body = input.value.trim(); if (!body) return;
      send.disabled = true;
      const { error } = await sb.from('post_comments').insert({ post_id: postId, user_id: me, parent_id: REPLY_TO, body });
      send.disabled = false;
      if (error) { alert('댓글 등록 실패'); return; }
      input.value = ''; input.placeholder = '댓글 달기…'; REPLY_TO = null;
      try { window.BattleFX?.haptic?.('tap'); } catch (_) {}
      const cc = document.getElementById('glp-ccount'); if (cc) cc.textContent = Number(cc.textContent || 0) + 1;
      loadComments(sb, postId, me, ava);
    };
    send.addEventListener('click', submit);
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } });
  }

  window.GALLA_PAGE_GALLARI_POST = { init: initGallariPost };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initGallariPost);
  else initGallariPost();
})();
