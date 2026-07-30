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

    document.getElementById('glp-top-title').textContent = post.kind === 'horizontal' ? (post.title || '갈라리') : (author?.nickname || '갈라리');

    // ---- 미디어 ----
    let mediaHtml = '';
    if (post.video_url) {
      mediaHtml = `<div class="glp-media ${post.kind}"><video src="${esc(post.video_url)}" controls playsinline ${post.kind === 'vertical' ? 'muted' : ''} preload="metadata" poster="${esc(post.thumbnail_url || '')}"></video></div>`;
    } else if (Array.isArray(post.images) && post.images.length) {
      if (post.images.length === 1) {
        mediaHtml = `<div class="glp-media ${post.kind}"><img src="${esc(post.images[0])}"></div>`;
      } else {
        mediaHtml = `<div class="glp-carousel"><div class="glp-slides">${post.images.map(u => `<img src="${esc(u)}">`).join('')}</div>
          <div class="glp-dots">${post.images.map((_, i) => `<i class="${i === 0 ? 'on' : ''}"></i>`).join('')}</div></div>`;
      }
    }

    const headHtml = `<div class="glp-head">
      <img class="glp-ava" src="${esc(ava(author))}" onerror="this.style.visibility='hidden'">
      <div class="glp-hinfo"><div class="glp-nick">${esc(author?.nickname || '익명')}</div><div class="glp-time">${timeago(post.created_at)}</div></div>
    </div>`;

    const actionsHtml = `<div class="glp-actions">
      <button class="glp-act glp-like${liked ? ' on' : ''}" id="glp-like">${HEART}<span id="glp-likec">${likeCount}</span></button>
      <button class="glp-act" id="glp-cfocus">${CHAT}<span>${post.comment_count || 0}</span></button>
      <button class="glp-support" id="glp-support">🎁 후원</button>
    </div>`;

    const tagsHtml = (Array.isArray(post.tags) && post.tags.length)
      ? `<div class="glp-tags">${post.tags.map(t => `<span>#${esc(t)}</span>`).join('')}</div>` : '';

    // ---- kind별 조립 ----
    let body;
    if (post.kind === 'horizontal') {
      body = mediaHtml
        + (post.title ? `<div class="glp-title">${esc(post.title)}</div>` : '')
        + headHtml + actionsHtml
        + (post.caption ? `<div class="glp-caption">${esc(post.caption)}</div>` : '')
        + tagsHtml;
    } else {
      body = headHtml + mediaHtml + actionsHtml
        + (post.caption ? `<div class="glp-caption"><b>${esc(author?.nickname || '')}</b>  ${esc(post.caption)}</div>` : '')
        + tagsHtml;
    }

    root.innerHTML = body
      + '<div class="glp-div"></div>'
      + '<div class="glp-csec"><div class="glp-ctitle">댓글 <span id="glp-ccount">' + (post.comment_count || 0) + '</span></div><div class="glp-clist" id="glp-clist"><div class="glp-cempty">불러오는 중…</div></div></div>'
      + '<div class="glp-cbar"><input id="glp-cinput" placeholder="' + (me ? '댓글 달기…' : '로그인하고 댓글 달기') + '" ' + (me ? '' : 'disabled') + '><button id="glp-csend" ' + (me ? '' : 'disabled') + '>게시</button></div>';

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

    // 후원(GC) — 상세 결제 플로우는 ④단계에서 연결
    document.getElementById('glp-support').addEventListener('click', () => {
      if (window.GALLA_openSupport) window.GALLA_openSupport({ type: 'post', id, to: post.user_id });
      else if (window.GALLA_toast) window.GALLA_toast('갈라코인(GC) 후원은 곧 열려요');
      else alert('갈라코인(GC) 후원은 곧 열려요');
    });

    // 댓글
    loadComments(sb, id, me, ava);
    const focusC = () => { const el = document.getElementById('glp-cinput'); el && !el.disabled && el.focus(); };
    document.getElementById('glp-cfocus').addEventListener('click', focusC);
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
