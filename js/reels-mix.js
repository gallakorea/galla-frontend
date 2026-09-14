/* ============================================================
   릴스 공용 — 숏판 슬라이드 UI + 섞인 피드(이슈·숏판).
   ⚠️ 릴스 엔진은 shorts.js 하나다. 예전엔 숏판 릴스(gallari-reels.js)가 따로 돌며 이슈를
      '표시용 진영바'로 흉내 냈다 → 투표 먹통·뒤로가기 없음·상단 글자 겹침(2026-09-14 사장님).
      이제 이 파일은 숏판 슬라이드의 모양·동작과 피드 조립만 맡고, 넘기기·재생·상단 버튼·
      진영바는 전부 shorts.js 가 한다. 이슈 슬라이드는 어디서 열든 같은 화면이다.
   ============================================================ */
(function () {
  if (window.GALLA_ReelPost) return;   // 홈·이슈·숏판 릴스 페이지가 각자 실어도 한 번만

  const V = window.GALLA_V ? '?v=' + window.GALLA_V : '';
  const esc = (s) => (s == null ? '' : String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
  const timeago = (t) => { const d = (Date.now() - new Date(t).getTime()) / 1000;
    if (d < 60) return '방금'; if (d < 3600) return (d / 60 | 0) + '분'; if (d < 86400) return (d / 3600 | 0) + '시간'; return (d / 86400 | 0) + '일'; };
  const toast = (m) => (window.GALLA_toast || alert)(m);
  const sb = () => window.supabaseClient;
  const IC = {
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.5 1-1a5.5 5.5 0 0 0 0-7.9z"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5z"/></svg>',
    gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 12v10H4V12"/><path d="M2 7h20v5H2z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="12" cy="19" r="1.9"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg>',
    galvis: '<svg class="gv-galvis" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="8.2" stroke-width="1.5" stroke-dasharray="2.3 2.2"/><circle cx="12" cy="12" r="4.7" stroke-width="1.3"/><circle cx="12" cy="12" r="1.9" fill="currentColor" stroke="none"/></svg>',
  };

  /* 로그인 사용자 — 릴스를 열 때마다 세션을 다시 본다(로그아웃 뒤 남의 좋아요가 남지 않게). */
  let ME = undefined;
  async function me() {
    if (ME !== undefined) return ME;
    try { const { data } = await sb().auth.getSession(); ME = data?.session?.user?.id || null; } catch (_) { ME = null; }
    return ME;
  }

  function loadClassic(src) {
    return new Promise((res) => {
      const has = Array.from(document.scripts).some(s => (s.getAttribute('src') || '').replace(/^\.\//, '/').split('?')[0] === src);
      if (has) return res();
      const s = document.createElement('script');
      s.src = src + V; s.async = false;
      s.onload = s.onerror = () => res();
      document.head.appendChild(s);
    });
  }
  function ensureCss(href) {
    const base = href.split('/').pop();
    if (Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some(l => (l.getAttribute('href') || '').split('?')[0].split('/').pop() === base)) return;
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href + V; document.head.appendChild(l);
  }

  /* 엔진과 그 의존을 필요한 것만 싣는다. shorts.js 는 SPA 어댑터와 **같은 URL** 로 import 해야
     모듈이 한 벌만 돈다(다른 ?v= 로 두 번 실으면 문서 위임 핸들러가 두 번 붙는다). */
  let engineP = null;
  function ensureEngine() {
    if (window.__OPEN_SHORTS_INTERNAL__ && window.GALLA_VoteBar && window.GALLA_attachHls) return Promise.resolve();
    if (engineP) return engineP;
    engineP = (async () => {
      ['/css/shorts.css', '/css/vote-bar.css', '/css/gallari-reels.css'].forEach(ensureCss);
      const need = [];
      if (!window.GALLA_attachHls) need.push('/js/hls-attach.js');
      if (!window.GALLA_setSound) need.push('/js/media-sound.js');
      if (!window.GALLA_VoteBar) need.push('/js/vote-bar.js');
      if (!window.GALLA_share) need.push('/js/share-sheet.js');
      await Promise.all(need.map(loadClassic));
      if (!window.GALLA_VOTE) { try { await import('/js/vote.core.js' + V); } catch (e) { console.warn('[reels] vote.core', e); } }
      if (!window.__OPEN_SHORTS_INTERNAL__) { try { await import('/js/shorts.js' + V); } catch (e) { console.warn('[reels] shorts', e); } }
    })().finally(() => { engineP = null; });
    return engineP;
  }

  const avatar = (u) => window.GALLA_avatarSrc ? window.GALLA_avatarSrc(u, 96) : (u || window.GALLA_DEFAULT_AVATAR || '');

  /* ── 숏판 슬라이드: 우측 레일 + 하단 작성자·캡션 (영상은 엔진이 깐다) ── */
  function html(x) {
    const uid = esc(x.user_id || '');
    return `
      <div class="grl-rail">
        <button class="grl-act grl-like" type="button"><span class="ic">${IC.heart}</span><b class="c">${x.like_count || 0}</b></button>
        <button class="grl-act grl-comment" type="button">${IC.chat}<b class="cc">${x.comment_count || 0}</b></button>
        <button class="grl-act grl-share" type="button">${IC.send}<b>공유</b></button>
        <button class="grl-act" type="button" data-galvis data-gv-type="shorts" data-gv-id="${x.id}" data-gv-title="${esc(String(x.caption || '숏판 영상').slice(0, 120))}" aria-label="갈비스와 얘기"><span class="ic">${IC.galvis}</span><b>갈비스</b></button>
        <button class="grl-act support grl-support" type="button">${IC.gift}<b>후원</b></button>
        <button class="grl-act grl-more" type="button" hidden aria-label="관리">${IC.more}<b>관리</b></button>
      </div>
      <div class="grl-bottom">
        <div class="grl-userrow">
          <img class="grl-bava" src="${esc(avatar(x.avatar_url))}" data-prof="${uid}" alt="" onerror="this.style.visibility='hidden'">
          <span class="grl-uname" data-prof="${uid}">${esc(x.author || '익명')}</span>
          <button class="grl-follow2 js-follow" type="button" data-uid="${uid}" hidden>팔로우</button>
        </div>
        ${x.caption ? `<div class="grl-cap-box"><div class="grl-cap">${esc(x.caption)}</div><button class="grl-cap-more" type="button" hidden>… 더보기</button></div>` : ''}
      </div>`;
  }

  /* ctx: { remove() — 이 슬라이드를 엔진에서 걷어낸다, leave(fn) — 릴스를 조용히 닫고 fn 실행 } */
  function wire(el, x, ctx) {
    ctx = ctx || {};
    const leave = ctx.leave || ((fn) => fn());
    // 캡션 펼치기 — 넘칠 때만 '더보기'
    const capBox = el.querySelector('.grl-cap-box');
    if (capBox) {
      const cap = capBox.querySelector('.grl-cap'), more = capBox.querySelector('.grl-cap-more');
      setTimeout(() => { if (more && cap.scrollHeight - cap.clientHeight > 2) more.hidden = false; }, 60);
      const toggle = () => { const open = cap.classList.toggle('open'); if (more) more.textContent = open ? '접기' : '… 더보기'; };
      cap.addEventListener('click', toggle);
      more?.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
    }
    // 프로필 — 릴스를 닫고 간다(SPA 는 스택 push)
    el.querySelectorAll('[data-prof]').forEach(a => a.addEventListener('click', () => {
      const u = a.dataset.prof; if (!u) return;
      leave(() => {
        if (document.body.dataset.page === 'spa' && window.GALLA_gotoProfile) window.GALLA_gotoProfile(u);
        else (window.GALLA_nav || function (v) { location.href = v; })('mypage.html?user=' + encodeURIComponent(u));
      });
    }));
    // 공유
    el.querySelector('.grl-share')?.addEventListener('click', () => {
      const url = window.GALLA_SITE + '/share/post/' + x.id, text = x.caption || 'GALLA';
      if (window.GALLA_share) window.GALLA_share({ url, title: 'GALLA', text });
      else if (navigator.share) navigator.share({ title: 'GALLA', text, url }).catch(() => {});
      else { try { navigator.clipboard.writeText(url); } catch (_) {} toast('링크 복사됨'); }
    });
    // 좋아요
    let liked = false, lc = x.like_count || 0;
    const likeBtn = el.querySelector('.grl-like');
    const paint = () => { likeBtn.classList.toggle('on', liked); likeBtn.querySelector('.c').textContent = lc; };
    me().then((uid) => {
      if (!uid) return;
      sb().from('post_likes').select('post_id').eq('post_id', x.id).eq('user_id', uid).maybeSingle()
        .then(({ data }) => { liked = !!data; paint(); });
      const fb = el.querySelector('.js-follow');
      if (fb && x.user_id && x.user_id !== uid) { fb.hidden = false; if (window.GALLA_bindFollow) window.GALLA_bindFollow(el); }
    });
    likeBtn.addEventListener('click', async () => {
      const uid = await me();
      if (!uid) { (window.GALLA_needLogin || toast)('로그인하고 좋아요를 누를 수 있어요'); return; }
      liked = !liked; lc += liked ? 1 : -1; paint();
      try { window.BattleFX?.haptic?.('tap'); } catch (_) {}
      const r = liked ? await sb().from('post_likes').insert({ post_id: x.id, user_id: uid })
                      : await sb().from('post_likes').delete().eq('post_id', x.id).eq('user_id', uid);
      if (r.error && r.error.code !== '23505') { liked = !liked; lc += liked ? 1 : -1; paint(); }
    });
    // 댓글
    el.querySelector('.grl-comment').addEventListener('click', () => openComments(x, el));
    // 후원 — 홈에는 donate.js 가 안 실려 있다. 누를 때 싣는다.
    el.querySelector('.grl-support').addEventListener('click', async () => {
      const uid = await me();
      if (uid && x.user_id === uid) { toast('내 콘텐츠예요'); return; }
      if (!uid) { (window.GALLA_needLogin || toast)('로그인하고 후원할 수 있어요'); return; }
      if (!window.openDonatePost) await loadClassic('/js/donate.js');
      if (window.openDonatePost) window.openDonatePost(x.id, x.author || '');
      else toast('후원 준비 중');
    });
    // ⋯ 관리(수정·삭제) — 공용 owner-actions
    const moreBtn = el.querySelector('.grl-more');
    if (moreBtn && window.GALLA_canManage) {
      window.GALLA_canManage(x.user_id).then((can) => {
        if (!can) return;
        moreBtn.hidden = false;
        moreBtn.addEventListener('click', () => window.GALLA_openOwnerMenu({
          table: 'posts', id: x.id, ownerId: x.user_id, label: '숏판',
          editFields: [{ key: 'caption', label: '내용', type: 'textarea', value: x.caption || '' }],
          onSaved: (patch) => { if (patch.caption == null) return; x.caption = patch.caption; const c = el.querySelector('.grl-cap'); if (c) c.textContent = patch.caption; },
          onDeleted: () => { if (ctx.remove) ctx.remove(); },
        }));
      }).catch(() => {});
    }
  }

  /* ── 댓글 시트(숏판, 일반 댓글) ── */
  async function openComments(x, slideEl) {
    document.getElementById('grl-cdim')?.remove();
    const uid = await me();
    const dim = document.createElement('div'); dim.id = 'grl-cdim'; dim.className = 'grl-cdim';
    dim.innerHTML = `<div class="grl-csheet">
      <div class="grl-cgrip"></div>
      <div class="grl-chead"><span>댓글 <b id="grl-cc"></b></span><button class="grl-cx" id="grl-cx" type="button" aria-label="닫기">✕</button></div>
      <div class="grl-clist" id="grl-clist"><div class="grl-cempty">불러오는 중…</div></div>
      <div class="grl-cbar">
        <input id="grl-cin" placeholder="${uid ? '따뜻한 댓글 남기기…' : '로그인하고 댓글'}" ${uid ? '' : 'disabled'}>
        <button id="grl-csend" type="button" ${uid ? '' : 'disabled'}>게시</button>
      </div></div>`;
    document.body.appendChild(dim);
    (void dim.offsetWidth, dim.classList.add('on'));
    const close = () => { dim.classList.remove('on'); setTimeout(() => dim.remove(), 220); };
    dim.addEventListener('click', (e) => { if (e.target === dim) close(); });
    dim.querySelector('#grl-cx').onclick = close;
    const list = dim.querySelector('#grl-clist');
    const load = async () => {
      const { data: cs } = await sb().from('post_comments').select('id,user_id,body,like_count,created_at')
        .eq('post_id', x.id).is('parent_id', null).order('created_at', { ascending: false }).limit(200);
      dim.querySelector('#grl-cc').textContent = (cs || []).length || '';
      if (!cs || !cs.length) { list.innerHTML = '<div class="grl-cempty">첫 댓글을 남겨보세요 💬</div>'; return; }
      const { data: us } = await sb().from('users').select('id,nickname,avatar_url').in('id', [...new Set(cs.map(c => c.user_id))]);
      const U = {}; (us || []).forEach(u => U[u.id] = u);
      const liked = new Set();
      if (uid) { const { data: ml } = await sb().from('post_comment_likes').select('comment_id').eq('user_id', uid).in('comment_id', cs.map(c => c.id)); (ml || []).forEach(r => liked.add(r.comment_id)); }
      list.innerHTML = cs.map(c => { const u = U[c.user_id] || {};
        return `<div class="grl-c"><img class="grl-cava" src="${esc(window.GALLA_avatarSrc ? window.GALLA_avatarSrc(u.avatar_url, 72) : (u.avatar_url || ''))}" alt="" onerror="this.style.visibility='hidden'">
          <div class="grl-cmain"><div class="grl-cnick">${esc(u.nickname || '익명')}<span>${timeago(c.created_at)}</span></div>
            <div class="grl-cbody">${esc(c.body)}</div></div>
          <button class="grl-clike${liked.has(c.id) ? ' on' : ''}" type="button" data-cid="${c.id}">${IC.heart}<b>${c.like_count || 0}</b></button></div>`;
      }).join('');
      list.querySelectorAll('.grl-clike').forEach(b => b.addEventListener('click', async () => {
        if (!uid) { (window.GALLA_needLogin || toast)('로그인이 필요해요'); return; }
        const cid = Number(b.dataset.cid), cnt = b.querySelector('b');
        const on = b.classList.toggle('on'); cnt.textContent = Math.max(0, Number(cnt.textContent) + (on ? 1 : -1));
        const r = on ? await sb().from('post_comment_likes').insert({ comment_id: cid, user_id: uid })
                     : await sb().from('post_comment_likes').delete().eq('comment_id', cid).eq('user_id', uid);
        if (r.error && r.error.code !== '23505') { const back = b.classList.toggle('on'); cnt.textContent = Math.max(0, Number(cnt.textContent) + (back ? 1 : -1)); }
      }));
    };
    load();
    const send = dim.querySelector('#grl-csend'), inp = dim.querySelector('#grl-cin');
    const submit = async () => {
      const body = inp.value.trim(); if (!body || !uid) return;
      send.disabled = true;
      const { error } = await sb().from('post_comments').insert({ post_id: x.id, user_id: uid, body });
      send.disabled = false;
      if (error) { toast('등록 실패'); return; }
      inp.value = ''; load();
      try { window.BattleFX?.haptic?.('tap'); } catch (_) {}
      const cc = slideEl.querySelector('.grl-comment .cc'); if (cc) cc.textContent = Number(cc.textContent || 0) + 1;
    };
    send.onclick = submit; inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } };
  }

  /* ── 피드 조립 ── */
  const lf = (q) => (window.GALLA_lfilter || function (v) { return v; })(q);
  const POST_COLS = 'id,user_id,caption,images,media,video_url,thumbnail_url,like_count,comment_count,created_at';
  const ISSUE_COLS = 'id,user_id,title,video_url,thumbnail_url,category,faction_a,faction_b,created_at';
  // 🎠 캐러셀형(사진·영상 여러 개) 숏판은 릴스에서 뺀다 — 릴스는 단일 영상만(사장님 지시)
  const mediaCount = (p) => {
    try { const m = window.GALLA_issueMedia && window.GALLA_issueMedia(p); if (m) return m.length; } catch (_) {}
    if (Array.isArray(p.media) && p.media.length) return p.media.length;
    if (Array.isArray(p.images) && p.images.length) return p.images.length + (p.video_url ? 1 : 0);
    return (p.video_url || p.thumbnail_url) ? 1 : 0;
  };
  function postQuery() {
    return sb().from('posts').select(POST_COLS)
      .eq('kind', 'vertical').eq('is_published', true).neq('moderation_status', 'blocked')
      .is('link_url', null)                 // 🔗 링크 카드 = 재생할 파일이 없다
      .not('video_url', 'is', null);
  }
  async function withAuthors(rows) {
    const ids = [...new Set(rows.map(r => r.user_id).filter(Boolean))];
    if (!ids.length) return rows;
    const { data: us } = await sb().from('users').select('id,nickname,avatar_url').in('id', ids);
    const U = {}; (us || []).forEach(u => U[u.id] = u);
    rows.forEach(r => { const u = U[r.user_id] || {}; r.author = u.nickname || '익명'; r.avatar_url = u.avatar_url || null; });
    return rows;
  }
  async function fetchPosts(user) {
    const q = user ? postQuery().eq('user_id', user).order('created_at', { ascending: false }).limit(60)
                   : lf(postQuery().order('created_at', { ascending: false }).limit(24));
    const { data } = await q;
    return withAuthors((data || []).filter(p => mediaCount(p) <= 1).map(p => ({ _type: 'post', ...p })));
  }
  async function fetchIssues() {
    const { data } = await lf(sb().from('issues').select(ISSUE_COLS)
      .not('video_url', 'is', null).eq('status', 'normal').order('created_at', { ascending: false }).limit(24));
    return withAuthors((data || []).map(i => ({ _type: 'issue', ...i })));
  }
  async function fetchOne(type, id) {
    try {
      const { data } = type === 'issue'
        ? await sb().from('issues').select(ISSUE_COLS).eq('id', id).maybeSingle()
        : await postQuery().eq('id', id).maybeSingle();
      if (!data || !data.video_url) return null;
      return (await withAuthors([{ _type: type === 'issue' ? 'issue' : 'post', ...data }]))[0];
    } catch (_) { return null; }
  }
  /* 숏판 진입 피드: 특정 유저면 그 사람 숏판만, 아니면 숏판 2 : 이슈 1 */
  async function feed(opts) {
    opts = opts || {};
    if (opts.user) return fetchPosts(opts.user);
    const [P, I] = await Promise.all([fetchPosts(null), fetchIssues()]);
    const out = []; let pi = 0, ii = 0;
    while (pi < P.length || ii < I.length) {
      if (pi < P.length) out.push(P[pi++]);
      if (pi < P.length) out.push(P[pi++]);
      if (ii < I.length) out.push(I[ii++]);
    }
    return out;
  }
  /* 이슈 릴스(홈)에 끼울 숏판 — 5분 캐시. 첫 열림은 이슈만으로 즉시 띄우고 도착하면 뒤쪽에 섞는다. */
  let postCache = null, postAt = 0, postP = null;
  function mixPosts() {
    if (postCache && Date.now() - postAt < 300000) return Promise.resolve(postCache);
    if (!postP) postP = fetchPosts(null).then(r => { postCache = r; postAt = Date.now(); return r; }).catch(() => []).finally(() => { postP = null; });
    return postP;
  }

  /* ── 여는 창구 ──
     o = { items?, feed?: {user}, startType: 'issue'|'post', startId, at, onClose, mixPosts } */
  async function openReels(o) {
    o = o || {};
    let pending = null;
    if (!o.items) {   // 피드를 받아와야 하면 검은 막부터 — 누른 뒤 반응이 없어 보이면 두 번 누른다
      pending = document.createElement('div');
      pending.className = 'grl-pending';
      pending.innerHTML = '<div class="grl-spin"></div>';
      document.body.appendChild(pending);
    }
    try {
      await ensureEngine();
      let items = o.items || await feed(o.feed || {});
      const type = o.startType === 'issue' ? 'issue' : 'post';
      if (o.startId != null && !o.items) {
        const at = items.findIndex(x => x._type === type && String(x.id) === String(o.startId));
        if (at > 0) items.unshift(items.splice(at, 1)[0]);
        else if (at < 0) { const one = await fetchOne(type, o.startId); if (one) items.unshift(one); }
      }
      items = items.filter(x => x && x.video_url);
      if (!items.length || typeof window.openShorts !== 'function') { if (o.onEmpty) o.onEmpty(); return false; }
      const first = o.startId != null ? { t: type, id: o.startId } : { t: items[0]._type, id: items[0].id };
      window.openShorts(items, Number(first.id), o.at || 0, 'detail', { startType: first.t, onClose: o.onClose });
      if (o.mixPosts) mixPosts().then(ps => { if (ps && ps.length && window.GALLA_shortsMix) window.GALLA_shortsMix(ps, 2); });
      return true;
    } finally { if (pending) pending.remove(); }
  }

  /* 홈에서 숏판 목록을 미리 받아 둔다 — 릴스를 여는 순간 바로 섞이게(열린 뒤 늦게 끼우지 않게). */
  setTimeout(() => { try { if (sb() && document.querySelector('.card-media video, #shortsOverlay, [data-page="index"], body[data-page="spa"]')) mixPosts(); } catch (_) {} }, 3000);

  window.GALLA_ReelPost = { html, wire, openComments };
  window.GALLA_reelsFeed = feed;
  window.GALLA_openReels = openReels;
  window.GALLA_reelsEnsure = ensureEngine;
  try { sb()?.auth?.onAuthStateChange?.(() => { ME = undefined; }); } catch (_) {}
})();
