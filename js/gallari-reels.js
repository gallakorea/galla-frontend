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
    plus: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    // 인스타식 공유(종이비행기) — 숏판 전용(이슈는 기존 share 유지)
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg>',
  };

  let MUTED = true, ME = null, sb = null, PROF = {}, ENTRY = 'feed';

  function getStart() {
    const g = (k) => { let v = new URLSearchParams(location.search).get(k); if (!v) { const h = location.hash || ''; const qi = h.indexOf('?'); if (qi >= 0) v = new URLSearchParams(h.slice(qi + 1)).get(k); } return v; };
    return { id: g('start') || null, type: g('t') || 'post', user: g('user') || null };
  }

  async function initReels() {
    sb = window.supabaseClient;
    const root = document.getElementById('grl-root');
    if (!root) return;
    if (!sb) { root.innerHTML = '<div class="grl-loading">연결 오류</div>'; return; }
    const { data: sess } = await sb.auth.getSession();
    ME = sess?.session?.user?.id || null;

    const st = getStart();
    // 진입 구분(사장님 지시): user 파라미터 있으면 마이페이지/프로필 진입(‹ 뒤로), 없으면 갈라리 피드 진입(+ 올리기)
    ENTRY = st.user ? 'profile' : 'feed';
    // 🎠 캐러셀형(사진·영상 여러 개) 숏판은 릴스에서 제외 — 릴스는 '단일 미디어(주로 영상)'만.
    //    미디어가 2개 이상이면 캐러셀 → 상세/그리드에서 본다.
    const mediaCount = (p) => {
      try { const m = window.GALLA_issueMedia && window.GALLA_issueMedia(p); if (m) return m.length; } catch (_) {}
      if (Array.isArray(p.media) && p.media.length) return p.media.length;
      if (Array.isArray(p.images) && p.images.length) return p.images.length + (p.video_url ? 1 : 0);
      return (p.video_url || p.thumbnail_url) ? 1 : 0;
    };
    const notCarousel = (p) => mediaCount(p) <= 1;

    let feed = [];
    if (st.user) {
      // 👤 특정 유저의 숏판만 순차 (마이페이지/프로필에서 진입) — 이슈 섞지 않음
      const { data: posts } = await sb.from('posts').select('id,user_id,caption,images,media,video_url,thumbnail_url,like_count,comment_count,created_at')
        .eq('kind', 'vertical').eq('user_id', st.user).eq('is_published', true).neq('moderation_status', 'blocked')
        .order('created_at', { ascending: false }).limit(60);
      feed = (posts || []).filter(notCarousel).map(p => ({ _type: 'post', ...p }));
    } else {
      // 🌐 통합(숏판 + 이슈 영상) 인터리브 2:1
      const [{ data: posts }, { data: issues }] = await Promise.all([
        (window.GALLA_lfilter || function (q) { return q; })(sb.from('posts').select('id,user_id,caption,images,media,video_url,thumbnail_url,like_count,comment_count,created_at')
          .eq('kind', 'vertical').eq('is_published', true).neq('moderation_status', 'blocked')
          .order('created_at', { ascending: false }).limit(24)),
        (window.GALLA_lfilter || function (q) { return q; })(sb.from('issues').select('id,user_id,title,video_url,thumbnail_url,category,faction_a,faction_b,pro_count,con_count,created_at')
          .not('video_url', 'is', null).eq('status', 'normal').order('created_at', { ascending: false }).limit(24)),
      ]);
      const P = (posts || []).filter(notCarousel).map(p => ({ _type: 'post', ...p }));
      const I = (issues || []).map(i => ({ _type: 'issue', ...i }));
      let pi = 0, ii = 0;
      while (pi < P.length || ii < I.length) {
        if (pi < P.length) feed.push(P[pi++]);
        if (pi < P.length) feed.push(P[pi++]);
        if (ii < I.length) feed.push(I[ii++]);
      }
    }
    // 시작 항목 우선 배치
    if (st.id) {
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
    // 숏판(post) — 인스타 릴스식 UI. 상단 +/‹·릴스 타이틀은 글로벌 chrome 바(chrome())에서 처리
    return `<section class="grl-slide" data-type="post" data-id="${x.id}">
      ${mediaInner}
      <div class="grl-playpause">${IC.play}</div>
      <div class="grl-top"></div>
      <div class="grl-rail">
        <button class="grl-act grl-like"><span class="ic">${IC.heart}</span><b class="c">${x.like_count || 0}</b></button>
        <button class="grl-act grl-comment">${IC.chat}<b class="cc">${x.comment_count || 0}</b></button>
        <button class="grl-act grl-share">${IC.send}<b>공유</b></button>
        <button class="grl-act" data-galvis data-gv-type="shorts" data-gv-id="${x.id}" data-gv-title="${String(x.caption || '숏판 영상').replace(/"/g, '&quot;').slice(0, 120)}" aria-label="갈비스와 얘기"><span class="ic"><svg class="gv-galvis" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="8.2" stroke-width="1.5" stroke-dasharray="2.3 2.2"/><circle cx="12" cy="12" r="4.7" stroke-width="1.3"/><circle cx="12" cy="12" r="1.9" fill="currentColor" stroke="none"/></svg></span><b>갈비스</b></button>
        <button class="grl-act support grl-support">${IC.gift}<b>후원</b></button>
      </div>
      <div class="grl-bottom">
        <div class="grl-userrow">
          <img class="grl-bava" src="${esc(ava(x.user_id))}" data-prof="${esc(x.user_id)}" onerror="this.style.visibility='hidden'">
          <span class="grl-uname" data-prof="${esc(x.user_id)}">${esc(nick(x.user_id))}</span>
          ${ME && x.user_id !== ME ? `<button class="grl-follow2 js-follow" data-uid="${esc(x.user_id)}">팔로우</button>` : ''}
        </div>
        ${x.caption ? `<div class="grl-cap-box"><div class="grl-cap">${esc(x.caption)}</div><button class="grl-cap-more" type="button" hidden>… 더보기</button></div>` : ''}
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
    // 캡션 펼치기(인스타식 "… 더보기" / "접기") — 넘칠 때만 더보기 노출
    const capBox = el.querySelector('.grl-cap-box');
    if (capBox) {
      const cap = capBox.querySelector('.grl-cap');
      const more = capBox.querySelector('.grl-cap-more');
      requestAnimationFrame(() => { if (more && cap.scrollHeight - cap.clientHeight > 2) more.hidden = false; });
      const toggle = () => { const open = cap.classList.toggle('open'); if (more) more.textContent = open ? '접기' : '… 더보기'; };
      cap.addEventListener('click', toggle);
      more?.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
    }
    // 프로필
    el.querySelectorAll('[data-prof]').forEach(a => a.addEventListener('click', () => { const u = a.dataset.prof; if (u) nav('mypage.html?user=' + u); }));
    // 공유
    const shareUrl = () => x._type === 'issue' ? window.GALLA_SITE + '/share/issue/' + x.id : window.GALLA_SITE + '/share/post/' + x.id;
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
          /* 📊 신호 — 숏판은 '완주율'이 랭킹의 핵심이다(첫 3초 이탈이 지배적).
             재생 시작 시 한 번만 붙이고, 멈추거나 끝날 때 최대 시청률·머문 시간이 기록된다. */
          if (window.GALLA_signal) window.GALLA_signal.video(v, { kind: 'vertical', id: en.target.dataset.id || '', surface: 'reels' });
          v.muted = MUTED; v.play().catch(() => {});
          en.target.querySelector('.grl-playpause')?.classList.remove('show');
        } else { v.pause(); try { v.currentTime = v.currentTime; } catch (_) {} }
      });
    }, { threshold: [0, 0.6, 1] });
    root.querySelectorAll('.grl-slide').forEach(s => io.observe(s));
  }

  /* ── 댓글 시트(숏판, 일반 댓글) — 바텀시트 + 좋아요/시간, 깔끔 UI ── */
  async function openComments(x, slideEl) {
    document.getElementById('grl-cdim')?.remove();
    const dim = document.createElement('div'); dim.id = 'grl-cdim'; dim.className = 'grl-cdim';
    dim.innerHTML = `<div class="grl-csheet">
      <div class="grl-cgrip"></div>
      <div class="grl-chead"><span>댓글 <b id="grl-cc"></b></span><button class="grl-cx" id="grl-cx" aria-label="닫기">✕</button></div>
      <div class="grl-clist" id="grl-clist"><div class="grl-cempty">불러오는 중…</div></div>
      <div class="grl-cbar">
        <input id="grl-cin" placeholder="${ME ? '따뜻한 댓글 남기기…' : '로그인하고 댓글'}" ${ME ? '' : 'disabled'}>
        <button id="grl-csend" ${ME ? '' : 'disabled'}>게시</button>
      </div></div>`;
    document.body.appendChild(dim);
    requestAnimationFrame(() => dim.classList.add('on'));
    const close = () => { dim.classList.remove('on'); setTimeout(() => dim.remove(), 220); };
    dim.addEventListener('click', (e) => { if (e.target === dim) close(); });
    dim.querySelector('#grl-cx').onclick = close;

    const list = dim.querySelector('#grl-clist');
    const load = async () => {
      const [{ data: cs }, myLikes] = await Promise.all([
        sb.from('post_comments').select('id,user_id,body,like_count,created_at').eq('post_id', x.id).is('parent_id', null).order('created_at', { ascending: false }).limit(200),
        Promise.resolve({ data: [] }),
      ]);
      dim.querySelector('#grl-cc').textContent = (cs || []).length || '';
      if (!cs || !cs.length) { list.innerHTML = '<div class="grl-cempty">첫 댓글을 남겨보세요 💬</div>'; return; }
      const uids = [...new Set(cs.map(c => c.user_id))];
      const { data: us } = await sb.from('users').select('id,nickname,avatar_url').in('id', uids);
      const U = {}; (us || []).forEach(u => U[u.id] = u);
      const liked = new Set();
      if (ME) { const { data: ml } = await sb.from('post_comment_likes').select('comment_id').eq('user_id', ME).in('comment_id', cs.map(c => c.id)); (ml || []).forEach(r => liked.add(r.comment_id)); }
      list.innerHTML = cs.map(c => { const u = U[c.user_id] || {};
        return `<div class="grl-c"><img class="grl-cava" src="${esc(window.GALLA_avatarSrc ? window.GALLA_avatarSrc(u.avatar_url, 72) : (u.avatar_url || ''))}" onerror="this.style.visibility='hidden'">
          <div class="grl-cmain"><div class="grl-cnick">${esc(u.nickname || '익명')}<span>${timeago(c.created_at)}</span></div>
            <div class="grl-cbody">${esc(c.body)}</div></div>
          <button class="grl-clike${liked.has(c.id) ? ' on' : ''}" data-cid="${c.id}">${IC.heart}<b>${c.like_count || 0}</b></button></div>`;
      }).join('');
      list.querySelectorAll('.grl-clike').forEach(b => b.addEventListener('click', async () => {
        if (!ME) { alert('로그인이 필요해요.'); return; }
        const cid = Number(b.dataset.cid), cnt = b.querySelector('b');
        const on = b.classList.toggle('on'); cnt.textContent = Math.max(0, Number(cnt.textContent) + (on ? 1 : -1));
        const r = on ? await sb.from('post_comment_likes').insert({ comment_id: cid, user_id: ME }) : await sb.from('post_comment_likes').delete().eq('comment_id', cid).eq('user_id', ME);
        if (r.error && r.error.code !== '23505') { const back = b.classList.toggle('on'); cnt.textContent = Math.max(0, Number(cnt.textContent) + (back ? 1 : -1)); }
      }));
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
      try { window.BattleFX?.haptic?.('tap'); } catch (_) {}
      const cc = slideEl.querySelector('.grl-comment .cc'); if (cc) cc.textContent = Number(cc.textContent || 0) + 1;
    };
    send.onclick = submit; inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } };
  }

  /* ── 상단바(뒤로·음소거)는 슬라이드 위 고정 오버레이 1개 ── */
  function chrome() {
    const root = document.getElementById('grl-root');
    if (!root || document.getElementById('grl-chrome')) return;
    const bar = document.createElement('div');
    bar.id = 'grl-chrome';
    // 좌상단 버튼: 갈라리 피드 진입(user 없음)=+ (숏판 올리기) / 마이페이지·프로필 진입=‹ (뒤로)
    const feed = ENTRY === 'feed';
    bar.innerHTML = `<button class="grl-nav" id="grl-back" aria-label="${feed ? '숏판 올리기' : '뒤로'}">${feed ? IC.plus : IC.back}</button><span class="grl-chrome-title">숏판</span><button class="grl-mute" id="grl-mute" aria-label="소리">${MUTED ? IC.muteOn : IC.muteOff}</button>`;
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:3100;display:flex;align-items:center;gap:6px;height:calc(50px + env(safe-area-inset-top));padding:env(safe-area-inset-top) 12px 0;pointer-events:none';
    bar.querySelectorAll('button').forEach(b => b.style.pointerEvents = 'auto');
    document.body.appendChild(bar);
    bar.querySelector('#grl-back').onclick = () => {
      if (feed) { nav('gallari-write.html'); return; }   // + = 숏판 올리기
      navHide(false);
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

  function navHide(on) { try { window.GALLA_SPA && window.GALLA_SPA.navHide && window.GALLA_SPA.navHide(on); } catch (_) {} }
  async function boot() {
    navHide(true);                                  // 릴스 진입 = 하단 네비 숨김(몰입)
    window.__grlRestoreNav = () => navHide(false);
    window.addEventListener('popstate', function once() { window.removeEventListener('popstate', once); navHide(false); });
    await initReels(); chrome();
  }
  window.GALLA_PAGE_GALLARI_REELS = { init: boot };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
