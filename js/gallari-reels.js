/* ============================================================
   통합 릴스 엔진 — 이슈 영상 + 숏판(갈라리) 한 피드. scroll-snap 풀스크린.
   ⚠️ 기존 이슈 배틀 엔진(shorts.js)과 별개. 여기선 이슈 항목을 '영상+진영바(표시)+참전 CTA'로만
      보여주고, 실제 투표·배틀은 탭하면 이슈로 넘겨(엔진 분리). 숏판은 완전 처리(좋아요·댓글·공유·후원).
   이중모드: 웹=MPA / 앱=SPA(로더 DCL 캡처).
   ============================================================ */
(function () {
  const nav = (u) => (window.GALLA_nav || function (x) { location.href = x; })(u);
  const esc = (s) => (s == null ? '' : String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
  const timeago = (t) => { const d = (Date.now() - new Date(t).getTime()) / 1000;
    if (d < 60) return '방금'; if (d < 3600) return (d / 60 | 0) + '분'; if (d < 86400) return (d / 3600 | 0) + '시간'; return (d / 86400 | 0) + '일'; };
  const IC = {
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.5 1-1a5.5 5.5 0 0 0 0-7.9z"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5z"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/></svg>',
    gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 12v10H4V12"/><path d="M2 7h20v5H2z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    muteOn: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3z"/><path d="M16 8l5 5M21 8l-5 5" stroke="currentColor" stroke-width="2"/></svg>',
    muteOff: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3z"/><path d="M15 8a5 5 0 0 1 0 8" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  };

  let MUTED = true, ME = null, sb = null, PROF = {};

  function getStart() {
    const s = new URLSearchParams(location.search); let t = s.get('start'), ty = s.get('t');
    if (!t) { const h = location.hash || ''; const qi = h.indexOf('?'); if (qi >= 0) { const q = new URLSearchParams(h.slice(qi + 1)); t = q.get('start'); ty = q.get('t'); } }
    return t ? { id: t, type: ty || 'post' } : null;
  }

  async function initReels() {
    sb = window.supabaseClient;
    const root = document.getElementById('grl-root');
    if (!root) return;
    if (!sb) { root.innerHTML = '<div class="grl-loading">연결 오류</div>'; return; }
    const { data: sess } = await sb.auth.getSession();
    ME = sess?.session?.user?.id || null;

    // 데이터: 숏판(posts) + 이슈 영상
    const [{ data: posts }, { data: issues }] = await Promise.all([
      sb.from('posts').select('id,user_id,caption,images,video_url,thumbnail_url,like_count,comment_count,created_at')
        .eq('kind', 'vertical').eq('is_published', true).neq('moderation_status', 'blocked')
        .order('created_at', { ascending: false }).limit(24),
      sb.from('issues').select('id,user_id,title,video_url,thumbnail_url,category,faction_a,faction_b,pro_count,con_count,created_at')
        .not('video_url', 'is', null).eq('status', 'normal').order('created_at', { ascending: false }).limit(24),
    ]);
    const P = (posts || []).map(p => ({ _type: 'post', ...p }));
    const I = (issues || []).map(i => ({ _type: 'issue', ...i }));
    // 인터리브: 숏판 2 : 이슈 1 리듬
    const feed = [];
    let pi = 0, ii = 0;
    while (pi < P.length || ii < I.length) {
      if (pi < P.length) feed.push(P[pi++]);
      if (pi < P.length) feed.push(P[pi++]);
      if (ii < I.length) feed.push(I[ii++]);
    }
    // 시작 항목 우선 배치
    const st = getStart();
    if (st) {
      const idx = feed.findIndex(x => String(x.id) === String(st.id) && x._type === st.type);
      if (idx > 0) { const [it] = feed.splice(idx, 1); feed.unshift(it); }
    }
    if (!feed.length) { root.innerHTML = '<div class="grl-end">아직 볼 영상이 없어요.<br>첫 숏판을 올려보세요.</div>'; return; }

    // 작성자 프로필
    const ids = [...new Set(feed.map(x => x.user_id).filter(Boolean))];
    const { data: users } = await sb.from('users').select('id,nickname,avatar_url').in('id', ids);
    (users || []).forEach(u => PROF[u.id] = u);

    root.innerHTML = feed.map(slideHtml).join('') + '<div class="grl-end">끝까지 봤어요 👀<br>새 콘텐츠가 곧 더 올라와요.</div>';
    root.querySelectorAll('.grl-slide').forEach((el, i) => wireSlide(el, feed[i]));
    setupAutoplay(root);
  }

  const ava = (uid) => { const u = PROF[uid] || {}; return window.GALLA_avatarSrc ? window.GALLA_avatarSrc(u.avatar_url, 96) : (u.avatar_url || (window.GALLA_DEFAULT_AVATAR || '')); };
  const nick = (uid) => (PROF[uid] || {}).nickname || '익명';

  function slideHtml(x) {
    const mediaInner = x.video_url
      ? `<div class="grl-media"><video src="${esc(x.video_url)}" loop playsinline preload="metadata" poster="${esc(x.thumbnail_url || '')}"></video></div>`
      : (Array.isArray(x.images) && x.images.length
        ? `<div class="grl-media"><div class="grl-carousel">${x.images.map(u => `<img src="${esc(u)}">`).join('')}</div>${x.images.length > 1 ? `<div class="grl-cdots">${x.images.map((_, i) => `<i class="${i === 0 ? 'on' : ''}"></i>`).join('')}</div>` : ''}</div>`
        : `<div class="grl-media"><img src="${esc(x.thumbnail_url || '')}"></div>`);

    const railTop = `<img class="grl-ava" src="${esc(ava(x.user_id))}" data-prof="${esc(x.user_id)}" onerror="this.style.visibility='hidden'">`;

    if (x._type === 'issue') {
      return `<section class="grl-slide" data-type="issue" data-id="${x.id}">
        ${mediaInner}
        <div class="grl-playpause">${IC.play}</div>
        <div class="grl-top"><span class="grl-tag">⚔️ ${esc(x.category || '이슈')}</span></div>
        <div class="grl-rail">
          ${railTop}
          <button class="grl-act grl-share">${IC.share}<b>공유</b></button>
        </div>
        <div class="grl-issue-bar"><div class="gv" data-votebar></div></div>
        <div class="grl-bottom">
          <div class="grl-author">${esc(nick(x.user_id))}</div>
          <div class="grl-title">${esc(x.title || '')}</div>
          <button class="grl-join grl-open-issue">⚔️ 참전하기 · 찬반 붙기</button>
        </div>
      </section>`;
    }
    // 숏판(post)
    return `<section class="grl-slide" data-type="post" data-id="${x.id}">
      ${mediaInner}
      <div class="grl-playpause">${IC.play}</div>
      <div class="grl-top"><span class="grl-tag">⚡ 숏판</span></div>
      <div class="grl-rail">
        ${railTop}
        <button class="grl-act grl-like"><span class="ic">${IC.heart}</span><b class="c">${x.like_count || 0}</b></button>
        <button class="grl-act grl-comment">${IC.chat}<b class="cc">${x.comment_count || 0}</b></button>
        <button class="grl-act grl-share">${IC.share}<b>공유</b></button>
        <button class="grl-act support grl-support">${IC.gift}<b>후원</b></button>
      </div>
      <div class="grl-bottom">
        <div class="grl-author">${esc(nick(x.user_id))}${ME && x.user_id !== ME ? '<span class="grl-follow js-follow" data-uid="' + esc(x.user_id) + '">+ 팔로우</span>' : ''}</div>
        ${x.caption ? `<div class="grl-cap">${esc(x.caption)}</div>` : ''}
      </div>
    </section>`;
  }

  function wireSlide(el, x) {
    // 미디어 탭 = 재생/일시정지 토글, 더블탭 없음(스크롤 우선)
    const vid = el.querySelector('video');
    const pp = el.querySelector('.grl-playpause');
    if (vid) {
      el.querySelector('.grl-media').addEventListener('click', (e) => {
        if (e.target.closest('.grl-carousel')) return;
        if (vid.paused) { vid.play().catch(() => {}); pp.classList.remove('show'); }
        else { vid.pause(); pp.classList.add('show'); }
      });
    }
    // 캐러셀 도트
    const car = el.querySelector('.grl-carousel');
    if (car) { const dots = el.querySelectorAll('.grl-cdots i');
      car.addEventListener('scroll', () => { const i = Math.round(car.scrollLeft / car.clientWidth); dots.forEach((d, k) => d.classList.toggle('on', k === i)); }, { passive: true }); }
    // 캡션 펼치기
    const cap = el.querySelector('.grl-cap'); if (cap) cap.addEventListener('click', () => cap.classList.toggle('open'));
    // 프로필
    el.querySelectorAll('[data-prof]').forEach(a => a.addEventListener('click', () => { const u = a.dataset.prof; if (u) nav('mypage.html?user=' + u); }));
    // 공유
    const shareUrl = () => x._type === 'issue' ? location.origin + '/share/issue/' + x.id : location.origin + '/share/post/' + x.id;
    el.querySelector('.grl-share')?.addEventListener('click', () => {
      const url = shareUrl(), text = x.title || x.caption || 'GALLA';
      if (window.GALLA_share) window.GALLA_share({ url, title: 'GALLA', text });
      else if (navigator.share) navigator.share({ title: 'GALLA', text, url }).catch(() => {});
      else { try { navigator.clipboard.writeText(url); } catch (_) {} (window.GALLA_toast || alert)('링크 복사됨'); }
    });

    if (x._type === 'issue') {
      // 진영바(표시) — 공용 컴포넌트 재사용
      const gv = el.querySelector('[data-votebar]');
      if (gv && window.GALLA_VoteBar) window.GALLA_VoteBar.mount(gv, { factionA: x.faction_a || '찬성', factionB: x.faction_b || '반대', pro: x.pro_count || 0, con: x.con_count || 0 });
      el.querySelector('.grl-open-issue')?.addEventListener('click', () => nav('issue.html?id=' + x.id));
      return;
    }

    // 숏판 좋아요
    let liked = false, lc = x.like_count || 0;
    const likeBtn = el.querySelector('.grl-like');
    if (ME) sb.from('post_likes').select('post_id').eq('post_id', x.id).eq('user_id', ME).maybeSingle().then(({ data }) => { liked = !!data; likeBtn.classList.toggle('on', liked); });
    likeBtn?.addEventListener('click', async () => {
      if (!ME) { alert('로그인이 필요해요.'); return; }
      liked = !liked; lc += liked ? 1 : -1; likeBtn.classList.toggle('on', liked); likeBtn.querySelector('.c').textContent = lc;
      try { window.BattleFX?.haptic?.('tap'); } catch (_) {}
      const r = liked ? await sb.from('post_likes').insert({ post_id: x.id, user_id: ME }) : await sb.from('post_likes').delete().eq('post_id', x.id).eq('user_id', ME);
      if (r.error && r.error.code !== '23505') { liked = !liked; lc += liked ? 1 : -1; likeBtn.classList.toggle('on', liked); likeBtn.querySelector('.c').textContent = lc; }
    });
    // 댓글 시트
    el.querySelector('.grl-comment')?.addEventListener('click', () => openComments(x, el));
    // 후원
    el.querySelector('.grl-support')?.addEventListener('click', () => {
      if (ME && x.user_id === ME) { (window.GALLA_toast || alert)('내 콘텐츠예요'); return; }
      if (!ME) { alert('로그인하고 후원할 수 있어요.'); return; }
      if (window.openDonatePost) window.openDonatePost(x.id, nick(x.user_id));
      else (window.GALLA_toast || alert)('후원 준비 중');
    });
    // 팔로우 버튼(공용 follow.js가 바인딩)
    if (window.GALLA_bindFollow) setTimeout(() => window.GALLA_bindFollow(el), 0);
  }

  /* ── 자동재생: 화면에 든 슬라이드만 재생 ── */
  function setupAutoplay(root) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(en => {
        const v = en.target.querySelector('video'); if (!v) return;
        if (en.isIntersecting && en.intersectionRatio >= 0.6) {
          v.muted = MUTED; v.play().catch(() => {});
          en.target.querySelector('.grl-playpause')?.classList.remove('show');
        } else { v.pause(); try { v.currentTime = v.currentTime; } catch (_) {} }
      });
    }, { threshold: [0, 0.6, 1] });
    root.querySelectorAll('.grl-slide').forEach(s => io.observe(s));
  }

  /* ── 댓글 시트(숏판, 일반 댓글) ── */
  async function openComments(x, slideEl) {
    let dim = document.getElementById('grl-cdim');
    if (!dim) { dim = document.createElement('div'); dim.id = 'grl-cdim'; document.body.appendChild(dim); }
    dim.className = 'glp'; // 재사용: gallari-post.css 없으니 인라인 스타일
    dim.style.cssText = 'position:fixed;inset:0;z-index:3200;background:rgba(0,0,0,.5);display:flex;align-items:flex-end';
    dim.innerHTML = `<div style="width:100%;max-width:640px;margin:0 auto;background:#0e0e12;border-radius:18px 18px 0 0;max-height:80vh;display:flex;flex-direction:column">
      <div style="padding:12px;text-align:center;font-weight:900;color:#eee;border-bottom:1px solid rgba(255,255,255,.06)">댓글 <span id="grl-cc"></span> <button id="grl-cx" style="float:right;background:none;border:none;color:#888;font-size:20px">✕</button></div>
      <div id="grl-clist" style="flex:1;overflow:auto;padding:6px 0"><div style="text-align:center;color:#888;padding:30px">불러오는 중…</div></div>
      <div style="display:flex;gap:8px;padding:10px 12px calc(10px + env(safe-area-inset-bottom));border-top:1px solid rgba(255,255,255,.07)">
        <input id="grl-cin" placeholder="${ME ? '댓글 달기…' : '로그인하고 댓글'}" ${ME ? '' : 'disabled'} style="flex:1;padding:11px 14px;border-radius:999px;background:#0a0a0f;border:1px solid #1c1c1c;color:#fff;font-size:15px">
        <button id="grl-csend" ${ME ? '' : 'disabled'} style="border:none;background:#3b82f6;color:#fff;font-weight:800;padding:10px 16px;border-radius:999px">게시</button>
      </div></div>`;
    dim.onclick = (e) => { if (e.target === dim) dim.remove(); };
    dim.querySelector('#grl-cx').onclick = () => dim.remove();

    const list = dim.querySelector('#grl-clist');
    const load = async () => {
      const { data: cs } = await sb.from('post_comments').select('id,user_id,body,like_count,created_at').eq('post_id', x.id).is('parent_id', null).order('created_at', { ascending: false }).limit(200);
      dim.querySelector('#grl-cc').textContent = (cs || []).length || '';
      if (!cs || !cs.length) { list.innerHTML = '<div style="text-align:center;color:#888;padding:30px">첫 댓글을 남겨보세요.</div>'; return; }
      const uids = [...new Set(cs.map(c => c.user_id))];
      const { data: us } = await sb.from('users').select('id,nickname,avatar_url').in('id', uids);
      const U = {}; (us || []).forEach(u => U[u.id] = u);
      list.innerHTML = cs.map(c => { const u = U[c.user_id] || {};
        return `<div style="display:flex;gap:10px;padding:9px 14px"><img src="${esc(window.GALLA_avatarSrc ? window.GALLA_avatarSrc(u.avatar_url, 72) : (u.avatar_url || ''))}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;background:#222" onerror="this.style.visibility='hidden'">
        <div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:800;color:#eef1f8">${esc(u.nickname || '익명')} <span style="font-size:11px;color:#888;font-weight:600">${timeago(c.created_at)}</span></div>
        <div style="font-size:14px;color:#dfe3ec;margin-top:2px;white-space:pre-wrap;word-break:break-word">${esc(c.body)}</div></div></div>`; }).join('');
    };
    load();
    const send = dim.querySelector('#grl-csend'), inp = dim.querySelector('#grl-cin');
    const submit = async () => {
      const body = inp.value.trim(); if (!body || !ME) return;
      send.disabled = true;
      const { error } = await sb.from('post_comments').insert({ post_id: x.id, user_id: ME, body });
      send.disabled = false;
      if (error) { alert('등록 실패'); return; }
      inp.value = ''; load();
      const cc = slideEl.querySelector('.grl-comment .cc'); if (cc) cc.textContent = Number(cc.textContent || 0) + 1;
    };
    send.onclick = submit; inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } };
  }

  /* ── 상단바(뒤로·음소거)는 슬라이드 위 고정 오버레이 1개 ── */
  function chrome() {
    const root = document.getElementById('grl-root');
    if (!root || document.getElementById('grl-chrome')) return;
    const bar = document.createElement('div');
    bar.id = 'grl-chrome';
    bar.innerHTML = `<button class="grl-back" id="grl-back" aria-label="뒤로">${IC.back}</button><button class="grl-mute" id="grl-mute" aria-label="소리">${MUTED ? IC.muteOn : IC.muteOff}</button>`;
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:3100;display:flex;align-items:center;gap:10px;height:calc(50px + env(safe-area-inset-top));padding:env(safe-area-inset-top) 12px 0;pointer-events:none';
    bar.querySelectorAll('button').forEach(b => b.style.pointerEvents = 'auto');
    document.body.appendChild(bar);
    bar.querySelector('#grl-back').onclick = () => {
      document.getElementById('grl-chrome')?.remove();
      if (document.body.dataset.page === 'spa' && window.GALLA_SPA && window.GALLA_SPA.pop && window.GALLA_SPA.pop()) return;
      if (history.length > 1) history.back(); else nav('index.html');
    };
    bar.querySelector('#grl-mute').onclick = () => {
      MUTED = !MUTED;
      document.querySelectorAll('.grl-slide video').forEach(v => v.muted = MUTED);
      bar.querySelector('#grl-mute').innerHTML = MUTED ? IC.muteOn : IC.muteOff;
    };
  }

  async function boot() { await initReels(); chrome(); }
  window.GALLA_PAGE_GALLARI_REELS = { init: boot };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
