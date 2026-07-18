/* =========================================================
   DM — 1:1 다이렉트 메시지 (고도화 1차)
   방향: 카카오톡 대체재의 기본기 — 가볍고, 빠르고, 보안이 기본값.
   window.initDM('#plazaDmBtn')       헤더 버튼 바인딩 + 안읽음 뱃지
   window.startDM(userId, nickname)   특정 유저와 대화 시작
   window.GALLA_dmShare(payload)      콘텐츠를 DM으로 공유({type,id,title,thumb,url})
                                      → 대화 선택 → 카드 전송 (콘텐츠 유입 깔때기)

   1차에서 들어간 것:
   · 읽음 영수증(내 마지막 메시지에 '읽음') · 입력 중… · 온라인 표시(presence)
   · 답장(인용) · 보내기 취소(5분, 서버 RPC) · 이미지 전송 · 공유 카드
   · 보안: 수신자는 read_at만 만질 수 있다(컬럼 권한) — 본문 조작 구멍 봉쇄됨
   2차(별도): E2E 비밀대화(WebCrypto ECDH), 차단/신고, 푸시
   ========================================================= */
(function () {
  let supabase = window.supabaseClient;
  let ME = null, ROOT = null, BTN = null, BADGE = null;
  let curThread = null, curPeer = null, msgChan = null, inboxChan = null;
  let REPLY = null;            // 답장 대상 {id, body, mine}
  let PENDING_SHARE = null;    // 공유 카드 대기 payload
  let MSGS = {};               // id -> row (인용 렌더용)
  let typingTimer = null, typingHideTimer = null, peerOnline = false;
  const nickCache = {};

  const esc = s => (s == null ? '' : String(s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
  const avatarColor = id => {
    let h = 0; for (const c of (id || '')) h = (h * 31 + c.charCodeAt(0)) % 360;
    return `hsl(${h} 55% 45%)`;
  };
  const timeLabel = ts => {
    const d = new Date(ts), now = new Date();
    if (d.toDateString() === now.toDateString())
      return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    const diff = (now - d) / 86400000;
    if (diff < 7) return ['일', '월', '화', '수', '목', '금', '토'][d.getDay()] + '요일';
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };
  const hhmm = ts => new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

  /* 프로필 캐시 — 닉네임·아바타·bio는 users에서 읽는다(공개 컬럼).
     user_profiles는 PII 잠금 대상이라 여기 기대면 안 된다. */
  const PROFILES = {};   // id -> {nickname, avatar_url, bio}
  async function profilesFor(ids) {
    const need = [...new Set(ids)].filter(id => id && !(id in PROFILES));
    if (need.length) {
      const { data } = await supabase.from('users')
        .select('id,nickname,avatar_url,bio').in('id', need);
      (data || []).forEach(p => {
        PROFILES[p.id] = { nickname: p.nickname || '익명', avatar_url: p.avatar_url || null, bio: p.bio || '' };
        nickCache[p.id] = p.nickname || '익명';
      });
      need.forEach(id => { if (!(id in PROFILES)) { PROFILES[id] = { nickname: '익명', avatar_url: null, bio: '' }; nickCache[id] = '익명'; } });
    }
    return PROFILES;
  }
  async function nicksFor(ids) { await profilesFor(ids); return nickCache; }
  /* 아바타 — 실제 사진이 있으면 사진, 없으면 첫 글자 + 유저 고유색 그라디언트 */
  function avaHTML(id, size) {
    const p = PROFILES[id] || {};
    const cls = 'dm-ava' + (size === 'lg' ? ' lg' : size === 'sm' ? ' sm' : '');
    if (p.avatar_url) return `<span class="${cls}"><img src="${esc(p.avatar_url)}" alt="" loading="lazy"></span>`;
    const name = p.nickname || '익';
    return `<span class="${cls}" style="background:linear-gradient(135deg,${avatarColor(id)},#1a1c26)">${esc(name.charAt(0))}</span>`;
  }

  /* 다른 페이지에 없는 모듈(media-upload 등)을 필요할 때만 끌어온다 */
  function loadScript(src) {
    return new Promise((res, rej) => {
      const v = ([...document.scripts].map(s => s.src).find(u => /[?&]v=/.test(u)) || '').match(/[?&]v=(\d+)/);
      const s = document.createElement('script');
      s.src = src + (v ? '?v=' + v[1] : '');
      s.onload = res; s.onerror = () => rej(new Error('load:' + src));
      document.head.appendChild(s);
    });
  }

  /* ---------- 골격 ---------- */
  function buildRoot() {
    if (ROOT) return ROOT;
    ROOT = document.createElement('div');
    ROOT.id = 'dm-root';
    ROOT.className = 'dm-root';
    ROOT.innerHTML = `
      <div class="dm-dim"></div>
      <div class="dm-panel" role="dialog" aria-label="메시지">
        <div class="dm-view" data-view="inbox">
          <div class="dm-head has-btns">
            <button class="dm-x" data-act="close" aria-label="닫기">✕</button>
            <span class="dm-title">메시지</span>
            <span class="dm-head-btns">
              <button class="dm-gear" data-act="settings" aria-label="메시지 설정">⚙</button>
              <button class="dm-compose" data-act="compose" aria-label="새 메시지">✎</button>
            </span>
          </div>
          <div class="dm-tabs" role="tablist">
            <button class="dm-tab on" data-tab="chats" role="tab">💬 채팅</button>
            <button class="dm-tab" data-tab="friends" role="tab">👥 친구</button>
          </div>
          <div class="dm-share-banner" id="dm-share-banner" hidden></div>
          <div class="dm-list" id="dm-inbox-wrap">
            <div class="dm-sort-row"><button id="dm-sort" type="button"></button></div>
            <div id="dm-inbox"></div>
          </div>
          <div class="dm-list" id="dm-friends" hidden>
            <div class="dm-friend-search"><input id="dm-friend-q" placeholder="친구 검색…" autocomplete="off"></div>
            <div id="dm-friend-list"></div>
          </div>
        </div>
        <div class="dm-view" data-view="settings" hidden>
          <div class="dm-head">
            <button class="dm-back" data-act="toInbox" aria-label="뒤로">‹</button>
            <span class="dm-title">메시지 설정</span>
            <span class="dm-head-sp"></span>
          </div>
          <div class="dm-list" id="dm-settings">
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>🔍 검색 허용</b><i>끄면 다른 사람이 닉네임 검색으로 나를 찾을 수 없어요</i></span>
              <button class="dm-toggle" id="dm-set-search" type="button"></button>
            </div>
            <div class="dm-sec">🚫 차단한 사람</div>
            <div id="dm-block-list"></div>
            <div class="dm-sec">👁 숨긴 친구</div>
            <div id="dm-hidden-list"></div>
          </div>
        </div>
        <div class="dm-view" data-view="thread" hidden>
          <div class="dm-head">
            <button class="dm-back" data-act="toInbox" aria-label="뒤로">‹</button>
            <span class="dm-peer-wrap">
              <span class="dm-head-ava" id="dm-peer-ava"></span>
              <span class="dm-peer-col">
                <span class="dm-title" id="dm-peer">대화</span>
                <span class="dm-peer-sub" id="dm-peer-sub"></span>
              </span>
            </span>
            <span class="dm-head-sp"></span>
          </div>
          <div class="dm-msgs" id="dm-msgs"></div>
          <div class="dm-reply-strip" id="dm-reply-strip" hidden>
            <span class="dm-reply-info"><b>답장</b> <span id="dm-reply-preview"></span></span>
            <button type="button" class="dm-reply-x" id="dm-reply-x">✕</button>
          </div>
          <form class="dm-inputbar" id="dm-form">
            <button type="button" class="dm-attach" id="dm-attach" aria-label="사진 보내기">＋</button>
            <input type="file" id="dm-file" accept="image/*" hidden>
            <textarea id="dm-input" rows="1" placeholder="메시지 입력…"></textarea>
            <button type="submit" class="dm-send" aria-label="전송">➤</button>
          </form>
        </div>
        <div class="dm-view" data-view="compose" hidden>
          <div class="dm-head">
            <button class="dm-back" data-act="toInbox" aria-label="뒤로">‹</button>
            <span class="dm-title">새 메시지</span>
            <span class="dm-head-sp"></span>
          </div>
          <div class="dm-search-wrap">
            <input id="dm-search" placeholder="닉네임으로 검색…" autocomplete="off">
          </div>
          <div class="dm-list" id="dm-results"></div>
        </div>
      </div>
      <div class="dm-menu" id="dm-menu" hidden></div>`;
    document.body.appendChild(ROOT);

    ROOT.querySelector('.dm-dim').addEventListener('click', closeDM);
    ROOT.addEventListener('click', e => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'close') closeDM();
      else if (act === 'compose') showView('compose'), initSearch();
      else if (act === 'settings') { showView('settings'); loadSettings(); }
      else if (act === 'toInbox') { detachThread(); curThread = curPeer = null; clearReply(); showView('inbox'); loadInbox(); }
      const tab = e.target.closest('.dm-tab')?.dataset.tab;
      if (tab) setTab(tab);
    });
    ROOT.querySelector('#dm-friend-q').addEventListener('input', e => filterFriends(e.target.value));
    ROOT.querySelector('#dm-sort').addEventListener('click', () => {
      SORT = SORT === 'recent' ? 'unread' : 'recent';
      try { localStorage.setItem('galla_dm_sort', SORT); } catch (_) {}
      loadInbox();
    });
    // 친구·채팅 행 길게 누르기 → 관리 메뉴 (말풍선 메뉴와 같은 문법)
    bindLongPress(ROOT.querySelector('#dm-friend-list'), '.dm-friend', friendMenu);
    bindLongPress(ROOT.querySelector('#dm-inbox'), '.dm-thread', threadMenu);
    ROOT.querySelector('#dm-form').addEventListener('submit', onSend);
    ROOT.querySelector('#dm-reply-x').addEventListener('click', clearReply);
    ROOT.querySelector('#dm-attach').addEventListener('click', () => ROOT.querySelector('#dm-file').click());
    ROOT.querySelector('#dm-file').addEventListener('change', onPickImage);

    const ta = ROOT.querySelector('#dm-input');
    ta.addEventListener('input', () => {
      ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
      sendTyping();
    });
    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(e); }
    });

    // 말풍선 길게 누르기/우클릭 → 답장·복사·보내기 취소
    const msgs = ROOT.querySelector('#dm-msgs');
    let pressT = null;
    msgs.addEventListener('contextmenu', e => {
      const b = e.target.closest('.dm-bubble'); if (!b) return;
      e.preventDefault(); openMenu(b, e.clientX, e.clientY);
    });
    msgs.addEventListener('pointerdown', e => {
      const b = e.target.closest('.dm-bubble'); if (!b) return;
      pressT = setTimeout(() => openMenu(b, e.clientX, e.clientY), 480);
    });
    ['pointerup', 'pointermove', 'pointercancel'].forEach(ev =>
      msgs.addEventListener(ev, () => clearTimeout(pressT)));
    document.addEventListener('click', e => {
      const menu = document.getElementById('dm-menu');
      if (menu && !menu.hidden && !e.target.closest('#dm-menu')) menu.hidden = true;
    });
    return ROOT;
  }

  function showView(name) {
    ROOT.querySelectorAll('.dm-view').forEach(v => { v.hidden = v.dataset.view !== name; });
  }
  function openDM() {
    buildRoot();
    ROOT.classList.add('open');
    document.body.style.overflow = 'hidden';
    showView('inbox');
    paintShareBanner();
    loadInbox();
  }
  function closeDM() {
    if (!ROOT) return;
    ROOT.classList.remove('open');
    document.body.style.overflow = '';
    detachThread();
    curThread = curPeer = null;
    PENDING_SHARE = null;
    clearReply();
  }

  /* ---------- 공유 깔때기 ---------- */
  function paintShareBanner() {
    const b = ROOT.querySelector('#dm-share-banner');
    if (!PENDING_SHARE) { b.hidden = true; return; }
    b.hidden = false;
    b.innerHTML = `📤 <b>${esc(PENDING_SHARE.title || '콘텐츠')}</b> 를 보낼 대화를 고르세요
      <button type="button" id="dm-share-cancel">취소</button>`;
    b.querySelector('#dm-share-cancel').onclick = () => { PENDING_SHARE = null; paintShareBanner(); };
  }
  window.GALLA_dmShare = async function (payload) {
    supabase = window.supabaseClient || supabase;
    if (!ME) {
      const { data: sess } = await supabase.auth.getSession();
      ME = sess?.session?.user?.id || null;
    }
    if (!ME) return promptLogin();
    PENDING_SHARE = payload;
    openDM();
  };

  /* ---------- 탭: 채팅 / 친구 ---------- */
  function setTab(tab) {
    ROOT.querySelectorAll('.dm-tab').forEach(t => t.classList.toggle('on', t.dataset.tab === tab));
    ROOT.querySelector('#dm-inbox-wrap').hidden = tab !== 'chats';
    ROOT.querySelector('#dm-friends').hidden = tab !== 'friends';
    if (tab === 'friends') loadFriends();
  }

  /* ---------- 관리 상태 (즐겨찾기·숨김·차단·방 고정·정렬) ---------- */
  let SORT = 'recent';
  try { SORT = localStorage.getItem('galla_dm_sort') || 'recent'; } catch (_) {}
  const PREF = { favs: new Set(), hidden: new Set(), blocks: new Set(), threads: {}, searchable: true, loaded: false };
  async function loadPrefs(force) {
    if (PREF.loaded && !force) return;
    const [f, h, b, tp, st] = await Promise.all([
      supabase.from('dm_favs').select('peer').eq('user_id', ME),
      supabase.from('dm_hidden').select('hidden').eq('user_id', ME),
      supabase.from('dm_blocks').select('blocked').eq('user_id', ME),
      supabase.from('dm_thread_prefs').select('thread_id,pinned,left_at').eq('user_id', ME),
      supabase.from('dm_settings').select('searchable').eq('user_id', ME).maybeSingle(),
    ]);
    PREF.favs = new Set((f.data || []).map(r => r.peer));
    PREF.hidden = new Set((h.data || []).map(r => r.hidden));
    PREF.blocks = new Set((b.data || []).map(r => r.blocked));
    PREF.threads = {};
    (tp.data || []).forEach(r => { PREF.threads[r.thread_id] = r; });
    PREF.searchable = st.data ? st.data.searchable !== false : true;
    PREF.loaded = true;
  }

  /* ---------- 길게 누르기 공용 ---------- */
  function bindLongPress(container, selector, handler) {
    let t = null;
    container.addEventListener('contextmenu', e => {
      const el = e.target.closest(selector); if (!el) return;
      e.preventDefault(); handler(el, e.clientX, e.clientY);
    });
    container.addEventListener('pointerdown', e => {
      const el = e.target.closest(selector); if (!el) return;
      t = setTimeout(() => { el.dataset.pressed = '1'; handler(el, e.clientX, e.clientY); }, 480);
    });
    ['pointerup', 'pointermove', 'pointercancel'].forEach(ev =>
      container.addEventListener(ev, () => clearTimeout(t)));
    // 길게 눌러 메뉴를 연 경우 이어지는 클릭(대화 열기)을 무시
    container.addEventListener('click', e => {
      const el = e.target.closest(selector);
      if (el && el.dataset.pressed) { delete el.dataset.pressed; e.stopImmediatePropagation(); e.preventDefault(); }
    }, true);
  }
  function popMenu(x, y, items, onPick) {
    const menu = document.getElementById('dm-menu');
    menu.innerHTML = items.map(i => `<button data-m="${i.k}"${i.danger ? ' class="danger"' : ''}>${i.label}</button>`).join('');
    menu.hidden = false;
    menu.style.left = Math.min(x, window.innerWidth - 180) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - items.length * 44 - 20) + 'px';
    menu.onclick = e => {
      const k = e.target.closest('[data-m]')?.dataset.m;
      menu.hidden = true;
      if (k) onPick(k);
    };
  }

  /* ---------- 친구 관리 메뉴: 즐겨찾기 / 숨기기 / 차단 ---------- */
  function friendMenu(el, x, y) {
    const peer = el.dataset.peer, name = el.dataset.name;
    const fav = PREF.favs.has(peer);
    popMenu(x, y, [
      { k: 'fav', label: fav ? '⭐ 즐겨찾기 해제' : '⭐ 즐겨찾기' },
      { k: 'hide', label: '👁 목록에서 숨기기' },
      { k: 'block', label: '🚫 차단', danger: true },
    ], async k => {
      if (k === 'fav') {
        if (fav) { PREF.favs.delete(peer); await supabase.from('dm_favs').delete().eq('user_id', ME).eq('peer', peer); }
        else { PREF.favs.add(peer); await supabase.from('dm_favs').insert({ user_id: ME, peer }); }
        renderFriends(FRIENDS);
      } else if (k === 'hide') {
        PREF.hidden.add(peer);
        await supabase.from('dm_hidden').insert({ user_id: ME, hidden: peer });
        renderFriends(FRIENDS);
      } else if (k === 'block') {
        if (!confirm(`${name} 님을 차단할까요?\n서로 메시지를 보낼 수 없게 되고, 상대에게는 알리지 않습니다.`)) return;
        PREF.blocks.add(peer);
        await supabase.from('dm_blocks').insert({ user_id: ME, blocked: peer });
        renderFriends(FRIENDS);
      }
    });
  }

  /* ---------- 채팅방 관리 메뉴: 고정 / 나가기 ---------- */
  function threadMenu(el, x, y) {
    const tid = el.dataset.tid;
    const p = PREF.threads[tid] || {};
    popMenu(x, y, [
      { k: 'pin', label: p.pinned ? '📌 고정 해제' : '📌 상단 고정' },
      { k: 'leave', label: '🚪 나가기', danger: true },
    ], async k => {
      if (k === 'pin') {
        const pinned = !p.pinned;
        PREF.threads[tid] = { ...p, thread_id: tid, pinned };
        await supabase.from('dm_thread_prefs')
          .upsert({ thread_id: tid, user_id: ME, pinned }, { onConflict: 'thread_id,user_id' });
        loadInbox();
      } else if (k === 'leave') {
        if (!confirm('이 대화를 나갈까요?\n목록에서 사라지고, 새 메시지가 오면 다시 나타납니다.')) return;
        const left_at = new Date().toISOString();
        PREF.threads[tid] = { ...p, thread_id: tid, left_at };
        await supabase.from('dm_thread_prefs')
          .upsert({ thread_id: tid, user_id: ME, left_at, pinned: false }, { onConflict: 'thread_id,user_id' });
        loadInbox();
      }
    });
  }

  /* ---------- 설정: 검색 허용 + 차단/숨김 관리 ---------- */
  async function loadSettings() {
    await loadPrefs(true);
    const tg = ROOT.querySelector('#dm-set-search');
    const paintTg = () => { tg.classList.toggle('on', PREF.searchable); tg.textContent = PREF.searchable ? '켜짐' : '꺼짐'; };
    paintTg();
    tg.onclick = async () => {
      PREF.searchable = !PREF.searchable;
      paintTg();
      await supabase.from('dm_settings')
        .upsert({ user_id: ME, searchable: PREF.searchable }, { onConflict: 'user_id' });
    };
    const paintList = async (boxId, set, table, col) => {
      const box = ROOT.querySelector(boxId);
      const ids = [...set];
      if (!ids.length) { box.innerHTML = `<div class="dm-set-empty">없음</div>`; return; }
      await profilesFor(ids);
      box.innerHTML = ids.map(id => `
        <div class="dm-set-row">
          ${avaHTML(id)}
          <span class="dm-set-mid"><b>${esc(PROFILES[id]?.nickname || '익명')}</b></span>
          <button class="dm-unset" data-id="${id}" type="button">해제</button>
        </div>`).join('');
      box.querySelectorAll('.dm-unset').forEach(btn => btn.onclick = async () => {
        const id = btn.dataset.id;
        set.delete(id);
        await supabase.from(table).delete().eq('user_id', ME).eq(col, id);
        paintList(boxId, set, table, col);
      });
    };
    paintList('#dm-block-list', PREF.blocks, 'dm_blocks', 'blocked');
    paintList('#dm-hidden-list', PREF.hidden, 'dm_hidden', 'hidden');
  }

  /* ---------- 친구 (팔로우 기반 — 갈라의 친구는 팔로우 관계) ---------- */
  let FRIENDS = [];   // [{id, mutual}]
  async function loadFriends() {
    const box = ROOT.querySelector('#dm-friend-list');
    if (!FRIENDS.length) box.innerHTML = `<div class="dm-loading">불러오는 중…</div>`;
    const [{ data: ing }, { data: ers }] = await Promise.all([
      supabase.from('follows').select('following').eq('follower', ME),
      supabase.from('follows').select('follower').eq('following', ME),
      loadPrefs(),
    ]);
    const followers = new Set((ers || []).map(r => r.follower));
    FRIENDS = (ing || []).map(r => ({ id: r.following, mutual: followers.has(r.following) }))
      .sort((a, b) => (b.mutual ? 1 : 0) - (a.mutual ? 1 : 0));   // 맞팔 먼저
    await profilesFor(FRIENDS.map(f => f.id));
    renderFriends(FRIENDS);
  }
  function friendRow(f) {
    const p = PROFILES[f.id] || {};
    return `
      <button class="dm-friend" data-peer="${f.id}" data-name="${esc(p.nickname || '익명')}">
        ${avaHTML(f.id)}
        <span class="dm-thread-mid">
          <span class="dm-thread-name">${esc(p.nickname || '익명')}${f.mutual ? ' <i class="dm-mutual">맞팔</i>' : ''}</span>
          ${p.bio ? `<span class="dm-thread-prev">${esc(p.bio)}</span>` : ''}
        </span>
        <span class="dm-friend-go">💬</span>
      </button>`;
  }
  function renderFriends(list) {
    const box = ROOT.querySelector('#dm-friend-list');
    // 숨김·차단은 목록에서 제외 (해제는 ⚙ 설정에서)
    const vis = list.filter(f => !PREF.hidden.has(f.id) && !PREF.blocks.has(f.id));
    if (!vis.length) {
      box.innerHTML = `<div class="dm-empty">아직 친구가 없어요.<br><span>마음에 드는 사람을 팔로우하면 여기에 떠요.</span></div>`;
      return;
    }
    const favs = vis.filter(f => PREF.favs.has(f.id));
    const rest = vis.filter(f => !PREF.favs.has(f.id));
    box.innerHTML =
      (favs.length ? `<div class="dm-sec">⭐ 즐겨찾기 <b>${favs.length}</b></div>` + favs.map(friendRow).join('') : '') +
      `<div class="dm-sec">친구 <b>${rest.length}</b></div>` + rest.map(friendRow).join('');
    box.querySelectorAll('.dm-friend').forEach(el => {
      el.addEventListener('click', () => startDM(el.dataset.peer, el.dataset.name));
    });
    staggerRows(box, '.dm-friend');
  }
  function filterFriends(q) {
    q = (q || '').trim().toLowerCase();
    if (!q) return renderFriends(FRIENDS);
    renderFriends(FRIENDS.filter(f => {
      const p = PROFILES[f.id] || {};
      return (p.nickname || '').toLowerCase().includes(q) || (p.bio || '').toLowerCase().includes(q);
    }));
  }

  /* ---------- 인박스 (고정 우선 · 정렬 · 나간 방 제외) ---------- */
  async function loadInbox() {
    const box = ROOT.querySelector('#dm-inbox');
    const sortBtn = ROOT.querySelector('#dm-sort');
    if (sortBtn) sortBtn.textContent = (SORT === 'unread' ? '안 읽은 메시지 순' : '최신 메시지 순') + ' ▾';
    const [{ data: threads }] = await Promise.all([
      supabase.from('dm_threads')
        .select('id,user_lo,user_hi,last_message,last_sender,last_message_at')
        .order('last_message_at', { ascending: false }),
      loadPrefs(),
    ]);
    // 나간 방은 제외하되, 나간 뒤 새 메시지가 왔으면 다시 보인다(카톡 문법)
    const list = (threads || []).filter(t => {
      const p = PREF.threads[t.id];
      return !(p?.left_at && new Date(t.last_message_at) <= new Date(p.left_at));
    });
    if (!list.length) {
      box.innerHTML = `<div class="dm-empty">아직 대화가 없어요.<br><span>✎ 를 눌러 새 메시지를 시작하세요.</span></div>`;
      return;
    }
    const peers = list.map(t => t.user_lo === ME ? t.user_hi : t.user_lo);
    await nicksFor(peers);
    const { data: unread } = await supabase.from('dm_messages')
      .select('thread_id').is('read_at', null).neq('sender_id', ME);
    const unreadBy = {};
    (unread || []).forEach(m => { unreadBy[m.thread_id] = (unreadBy[m.thread_id] || 0) + 1; });

    // 정렬: 📌 고정이 항상 맨 위 → 그 안에서 선택한 기준
    list.sort((a, b) => {
      const pa = PREF.threads[a.id]?.pinned ? 1 : 0, pb = PREF.threads[b.id]?.pinned ? 1 : 0;
      if (pa !== pb) return pb - pa;
      if (SORT === 'unread') {
        const ua = unreadBy[a.id] || 0, ub = unreadBy[b.id] || 0;
        if (ua !== ub) return ub - ua;
      }
      return new Date(b.last_message_at) - new Date(a.last_message_at);
    });

    box.innerHTML = list.map(t => {
      const peer = t.user_lo === ME ? t.user_hi : t.user_lo;
      const name = nickCache[peer] || '익명';
      const u = unreadBy[t.id] || 0;
      const pinned = !!PREF.threads[t.id]?.pinned;
      const preview = (t.last_sender === ME ? '나: ' : '') + (t.last_message || '');
      return `
        <button class="dm-thread${u ? ' dm-unread' : ''}" data-tid="${t.id}" data-peer="${peer}" data-name="${esc(name)}">
          ${avaHTML(peer)}
          <span class="dm-thread-mid">
            <span class="dm-thread-name">${pinned ? '📌 ' : ''}${esc(name)}</span>
            <span class="dm-thread-prev">${esc(preview)}</span>
          </span>
          <span class="dm-thread-side">
            <span class="dm-thread-time">${timeLabel(t.last_message_at)}</span>
            ${u ? `<span class="dm-dot">${u}</span>` : ''}
          </span>
        </button>`;
    }).join('');
    box.querySelectorAll('.dm-thread').forEach(el => {
      el.addEventListener('click', () => openThread(el.dataset.tid, el.dataset.peer, el.dataset.name));
    });
    staggerRows(box, '.dm-thread');
  }

  /* ---------- 대화 ---------- */
  async function openThread(tid, peer, name) {
    curThread = tid; curPeer = peer;
    ROOT.querySelector('#dm-peer').textContent = name;
    await profilesFor([peer]);
    ROOT.querySelector('#dm-peer-ava').innerHTML = avaHTML(peer, 'sm');
    setPeerSub('');
    showView('thread');
    const wrap = ROOT.querySelector('#dm-msgs');
    wrap.innerHTML = `<div class="dm-loading">불러오는 중…</div>`;
    const { data: msgs } = await supabase.from('dm_messages')
      .select('id,sender_id,body,kind,meta,reply_to,deleted_at,read_at,created_at')
      .eq('thread_id', tid).order('created_at', { ascending: true });
    MSGS = {};
    (msgs || []).forEach(m => { MSGS[m.id] = m; });
    renderMsgs(msgs || []);
    await markRead(tid);
    attachThread(tid);
    // 공유 대기 중이었으면 카드 전송
    if (PENDING_SHARE) {
      const p = PENDING_SHARE; PENDING_SHARE = null; paintShareBanner();
      await sendMessage({ kind: 'share', body: p.title || '콘텐츠 공유', meta: {
        type: p.type || 'link', id: p.id || null, title: p.title || '', thumb: p.thumb || null, url: p.url || null,
      }});
    }
    setTimeout(() => ROOT.querySelector('#dm-input')?.focus(), 50);
  }

  function bubbleHTML(m) {
    const mine = m.sender_id === ME;
    let inner;
    if (m.deleted_at) {
      inner = `<span class="dm-bub-body dm-deleted">🚫 삭제된 메시지입니다</span>`;
    } else if (m.kind === 'image' && m.meta?.url) {
      inner = `<img class="dm-bub-img" src="${esc(m.meta.url)}" alt="사진" loading="lazy">`;
    } else if (m.kind === 'share' && m.meta) {
      // 앱 안에서는 내부 링크 우선 — /share/ 엣지 URL은 OG 카드용이라 한 번 더 튕긴다
      const PAGE = { issue: 'issue', predict: 'predict-market', plaza: 'plaza_detail', news: 'news' };
      const href = (m.meta.type && PAGE[m.meta.type] && m.meta.id)
        ? `${PAGE[m.meta.type]}.html?id=${m.meta.id}`
        : (m.meta.url || '#');
      inner = `<a class="dm-share-card" href="${esc(href)}">
          ${m.meta.thumb ? `<span class="dm-share-thumb" style="background-image:url('${esc(m.meta.thumb)}')"></span>` : ''}
          <span class="dm-share-mid">
            <span class="dm-share-title">${esc(m.meta.title || '콘텐츠')}</span>
            <span class="dm-share-src">GALLA에서 보기 ›</span>
          </span></a>`;
    } else {
      inner = `<span class="dm-bub-body">${esc(m.body)}</span>`;
    }
    // 인용(답장)
    let quote = '';
    if (m.reply_to && MSGS[m.reply_to]) {
      const q = MSGS[m.reply_to];
      const qtext = q.deleted_at ? '삭제된 메시지' : q.kind === 'image' ? '📷 사진' : q.kind === 'share' ? '🔗 ' + (q.meta?.title || '공유') : q.body;
      quote = `<span class="dm-quote">${esc(String(qtext).slice(0, 60))}</span>`;
    }
    return `
      <div class="dm-bubble ${mine ? 'me' : 'you'}" data-id="${m.id}" data-mine="${mine ? 1 : 0}" data-at="${m.created_at}" data-del="${m.deleted_at ? 1 : 0}">
        ${quote}${inner}
        <span class="dm-bub-time">${hhmm(m.created_at)}${mine ? `<b class="dm-receipt" data-read="${m.read_at ? 1 : 0}">${m.read_at ? '읽음' : ''}</b>` : ''}</span>
      </div>`;
  }
  function renderMsgs(msgs) {
    const wrap = ROOT.querySelector('#dm-msgs');
    wrap.innerHTML = msgs.map(bubbleHTML).join('');
    // 마지막 12개만 폭포 등장(--i) — 긴 대화 전체를 애니메이션하면 소음이다
    const kids = [...wrap.children];
    kids.slice(-12).forEach((el, i) => { el.style.setProperty('--i', i); el.classList.add('in'); });
    wrap.scrollTop = wrap.scrollHeight;
    paintReceipts();
  }
  function appendMsg(m) {
    MSGS[m.id] = m;
    const wrap = ROOT.querySelector('#dm-msgs');
    const near = wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight < 80;
    wrap.insertAdjacentHTML('beforeend', bubbleHTML(m));
    wrap.lastElementChild?.classList.add('new');   // 새 메시지는 튀어 들어온다
    if (near || m.sender_id === ME) wrap.scrollTop = wrap.scrollHeight;
    paintReceipts();
  }
  /* 리스트 폭포 등장 — 행마다 28ms씩 시차 */
  function staggerRows(container, selector) {
    [...container.querySelectorAll(selector)].slice(0, 14).forEach((el, i) => {
      el.style.setProperty('--i', i); el.classList.add('in');
    });
  }
  /* '읽음'은 내 마지막 읽힌 메시지에만 — 전부 달면 소음이다(카톡과 같은 문법) */
  function paintReceipts() {
    const mine = [...ROOT.querySelectorAll('.dm-bubble.me .dm-receipt')];
    mine.forEach(r => { r.textContent = ''; });
    for (let i = mine.length - 1; i >= 0; i--) {
      if (mine[i].dataset.read === '1') { mine[i].textContent = '읽음'; break; }
    }
  }

  /* ---------- 전송 ---------- */
  async function sendMessage(fields) {
    const row = { thread_id: curThread, sender_id: ME, body: fields.body || '', kind: fields.kind || 'text',
                  meta: fields.meta || null, reply_to: fields.reply_to || null };
    const { data, error } = await supabase.from('dm_messages').insert(row).select().single();
    if (error) { console.error('[dm] send', error); return null; }
    appendMsg(data);
    return data;
  }
  async function onSend(e) {
    e.preventDefault();
    const ta = ROOT.querySelector('#dm-input');
    const body = ta.value.trim();
    if (!body || !curThread) return;
    ta.value = ''; ta.style.height = 'auto';
    const sendBtn = ROOT.querySelector('.dm-send');
    if (sendBtn) { sendBtn.classList.remove('fly'); void sendBtn.offsetWidth; sendBtn.classList.add('fly'); }
    const reply_to = REPLY?.id || null;
    clearReply();
    await sendMessage({ body, reply_to });
  }
  async function onPickImage(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f || !curThread) return;
    if (!window.GALLA_UPLOAD_MEDIA) {
      try { await loadScript('/js/media-upload.js'); } catch (_) { return alert('사진 전송을 준비하지 못했어요.'); }
    }
    const wrap = ROOT.querySelector('#dm-msgs');
    const tmp = document.createElement('div');
    tmp.className = 'dm-bubble me dm-uploading';
    tmp.innerHTML = `<span class="dm-bub-body">📷 사진 보내는 중…</span>`;
    wrap.appendChild(tmp); wrap.scrollTop = wrap.scrollHeight;
    try {
      const url = await window.GALLA_UPLOAD_MEDIA(f, 'image');
      tmp.remove();
      await sendMessage({ kind: 'image', body: '📷 사진', meta: { url } });
    } catch (err) {
      tmp.querySelector('.dm-bub-body').textContent = '⚠️ 사진 전송 실패';
      setTimeout(() => tmp.remove(), 2500);
    }
  }

  /* ---------- 답장 ---------- */
  function setReply(m) {
    REPLY = m;
    const strip = ROOT.querySelector('#dm-reply-strip');
    const prev = m.deleted_at ? '삭제된 메시지' : m.kind === 'image' ? '📷 사진' : m.kind === 'share' ? '🔗 공유' : m.body;
    ROOT.querySelector('#dm-reply-preview').textContent = String(prev).slice(0, 40);
    strip.hidden = false;
    ROOT.querySelector('#dm-input').focus();
  }
  function clearReply() {
    REPLY = null;
    const s = ROOT?.querySelector('#dm-reply-strip'); if (s) s.hidden = true;
  }

  /* ---------- 말풍선 메뉴 ---------- */
  function openMenu(bubbleEl, x, y) {
    const id = bubbleEl.dataset.id, m = MSGS[id];
    if (!m) return;
    const menu = document.getElementById('dm-menu');
    const mine = bubbleEl.dataset.mine === '1';
    const fresh = Date.now() - new Date(m.created_at).getTime() < 5 * 60 * 1000;
    const items = [];
    if (!m.deleted_at) items.push(`<button data-m="reply">↩️ 답장</button>`);
    if (!m.deleted_at && m.kind === 'text') items.push(`<button data-m="copy">📋 복사</button>`);
    if (mine && !m.deleted_at && fresh) items.push(`<button data-m="unsend" class="danger">🗑 보내기 취소</button>`);
    if (!items.length) return;
    menu.innerHTML = items.join('');
    menu.hidden = false;
    const mw = 150;
    menu.style.left = Math.min(x, window.innerWidth - mw - 10) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - 140) + 'px';
    menu.onclick = async e => {
      const act = e.target.closest('[data-m]')?.dataset.m;
      menu.hidden = true;
      if (act === 'reply') setReply(m);
      else if (act === 'copy') { try { await navigator.clipboard.writeText(m.body); } catch (_) {} }
      else if (act === 'unsend') {
        const { data } = await supabase.rpc('dm_unsend', { p_msg: id });
        if (!data?.ok) return alert(data?.reason === 'too_late' ? '5분이 지나 취소할 수 없어요.' : '취소하지 못했어요.');
        applyUpdate({ ...m, deleted_at: new Date().toISOString(), body: '', meta: null });
      }
    };
  }

  /* ---------- 실시간: 수신·읽음·삭제·입력중·온라인 ---------- */
  function applyUpdate(m) {
    MSGS[m.id] = { ...(MSGS[m.id] || {}), ...m };
    const el = ROOT.querySelector(`.dm-bubble[data-id="${m.id}"]`);
    if (!el) return;
    el.outerHTML = bubbleHTML(MSGS[m.id]);
    paintReceipts();
  }
  function setPeerSub(text, cls) {
    const s = ROOT.querySelector('#dm-peer-sub');
    if (!s) return;
    s.textContent = text || (peerOnline ? '온라인' : '');
    s.className = 'dm-peer-sub' + (cls ? ' ' + cls : peerOnline && !text ? ' on' : '');
    // 온라인이면 헤더 아바타에 초록 링이 맥동한다
    ROOT.querySelector('#dm-peer-ava')?.classList.toggle('on', peerOnline);
  }

  /* 타이핑 말풍선 — 헤더 텍스트만으로는 심심하다. 상대 자리에서 점 3개가 튄다. */
  let typingBubbleTimer = null;
  function showTypingBubble() {
    const wrap = ROOT.querySelector('#dm-msgs');
    if (!wrap) return;
    let el = wrap.querySelector('.dm-typing');
    if (!el) {
      el = document.createElement('div');
      el.className = 'dm-bubble you dm-typing';
      el.innerHTML = '<span class="dm-typing-dots"><i></i><i></i><i></i></span>';
      wrap.appendChild(el);
      wrap.scrollTop = wrap.scrollHeight;
    }
    clearTimeout(typingBubbleTimer);
    typingBubbleTimer = setTimeout(hideTypingBubble, 3500);
  }
  function hideTypingBubble() {
    clearTimeout(typingBubbleTimer);
    ROOT?.querySelector('.dm-typing')?.remove();
  }
  function sendTyping() {
    if (!msgChan || !curThread) return;
    if (typingTimer) return;               // 1.5초에 한 번만 쏜다
    typingTimer = setTimeout(() => { typingTimer = null; }, 1500);
    msgChan.send({ type: 'broadcast', event: 'typing', payload: { user: ME } });
  }

  function attachThread(tid) {
    detachThread();
    // ★ 핸들러들은 msgChan(모듈 변수)이 아니라 지역 ch를 참조한다.
    //   msgChan은 스레드 전환 시 null이 되는데, 그 뒤 늦게 도착한 presence/subscribe 이벤트가
    //   msgChan을 읽으면 null 참조로 터진다(테스트 하네스가 실제로 잡아낸 경합).
    const ch = supabase.channel('dm-thread-' + tid, { config: { presence: { key: ME } } });
    ch
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dm_messages', filter: `thread_id=eq.${tid}` },
        async ({ new: m }) => {
          if (m.sender_id === ME) return;
          if (m.reply_to && !MSGS[m.reply_to]) {
            const { data: q } = await supabase.from('dm_messages')
              .select('id,sender_id,body,kind,meta,deleted_at').eq('id', m.reply_to).maybeSingle();
            if (q) MSGS[q.id] = q;
          }
          setPeerSub('');   // 메시지가 왔으면 입력 중 표시는 끝
          hideTypingBubble();
          appendMsg(m);
          markRead(tid);
        })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'dm_messages', filter: `thread_id=eq.${tid}` },
        ({ new: m }) => applyUpdate(m))     // 읽음 영수증·보내기 취소가 여기로 흘러온다
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (!payload || payload.user === ME) return;
        setPeerSub('입력 중…', 'typing');
        showTypingBubble();
        clearTimeout(typingHideTimer);
        typingHideTimer = setTimeout(() => setPeerSub(''), 3000);
      })
      .on('presence', { event: 'sync' }, () => {
        if (msgChan !== ch) return;   // 이미 다른 스레드로 넘어갔으면 무시
        const st = ch.presenceState();
        peerOnline = Object.keys(st).includes(curPeer);
        setPeerSub('');
      })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') ch.track({ at: Date.now() });
      });
    msgChan = ch;
  }
  function detachThread() {
    if (msgChan) { supabase.removeChannel(msgChan); msgChan = null; }
    peerOnline = false;
    clearTimeout(typingHideTimer);
  }

  async function markRead(tid) {
    await supabase.from('dm_messages').update({ read_at: new Date().toISOString() })
      .eq('thread_id', tid).is('read_at', null).neq('sender_id', ME);
    refreshBadge();
  }

  /* ---------- 새 메시지(유저 검색) ---------- */
  let searchTimer = null;
  function initSearch() {
    const inp = ROOT.querySelector('#dm-search');
    const res = ROOT.querySelector('#dm-results');
    inp.value = ''; res.innerHTML = '';
    inp.focus();
    inp.oninput = () => {
      clearTimeout(searchTimer);
      const q = inp.value.trim();
      if (q.length < 1) { res.innerHTML = ''; return; }
      searchTimer = setTimeout(async () => {
        // ★ users 직접 ilike가 아니라 dm_search RPC — '검색 허용' 꺼둔 사람과
        //   차단 관계는 서버가 결과에서 제외한다(클라 필터는 우회 가능).
        const { data } = await supabase.rpc('dm_search', { p_q: q });
        const list = (data || []).filter(u => u.id !== ME);
        if (!list.length) { res.innerHTML = `<div class="dm-empty">검색 결과가 없어요.</div>`; return; }
        list.forEach(u => { PROFILES[u.id] = { nickname: u.nickname || '익명', avatar_url: u.avatar_url, bio: u.bio || '' }; nickCache[u.id] = u.nickname || '익명'; });
        res.innerHTML = list.map(u => `
          <button class="dm-thread" data-peer="${u.id}" data-name="${esc(u.nickname || '익명')}">
            ${avaHTML(u.id)}
            <span class="dm-thread-mid">
              <span class="dm-thread-name">${esc(u.nickname || '익명')}</span>
              ${u.bio ? `<span class="dm-thread-prev">${esc(u.bio)}</span>` : ''}
            </span>
          </button>`).join('');
        res.querySelectorAll('.dm-thread').forEach(el => {
          el.addEventListener('click', () => startDM(el.dataset.peer, el.dataset.name));
        });
      }, 220);
    };
  }

  async function startDM(userId, nickname) {
    supabase = window.supabaseClient || supabase;
    if (!ME) {
      const { data: sess } = await supabase.auth.getSession();
      ME = sess?.session?.user?.id || null;
    }
    if (!ME) return promptLogin();
    const { data: tid, error } = await supabase.rpc('dm_thread_with', { other: userId });
    if (error) { console.error(error); return; }
    if (!ROOT || !ROOT.classList.contains('open')) openDM();
    nickCache[userId] = nickname || nickCache[userId] || '익명';
    openThread(tid, userId, nickCache[userId]);
  }
  window.startDM = startDM;

  /* ---------- 뱃지 ---------- */
  async function refreshBadge() {
    if (!ME || !BADGE) return;
    const { count } = await supabase.from('dm_messages')
      .select('id', { count: 'exact', head: true }).is('read_at', null).neq('sender_id', ME);
    if (count && count > 0) { BADGE.textContent = count > 99 ? '99+' : count; BADGE.hidden = false; }
    else BADGE.hidden = true;
  }
  function attachInboxRealtime() {
    if (inboxChan) return;
    // ★ 비용·부하: 필터 없이 구독하면 '전체 스레드 갱신 × 접속자 수'만큼 서버가 팬아웃을
    //   계산한다(운영비 질문에 답하다 발견). 스레드의 내 자리가 user_lo일 수도 hi일 수도
    //   있는데 postgres_changes 필터는 OR을 못 하므로, 같은 채널에 필터 다른 바인딩 2개.
    const onThread = ({ new: t }) => {
      if (t.last_sender !== ME) refreshBadge();
      if (ROOT && ROOT.classList.contains('open') &&
          !ROOT.querySelector('[data-view="inbox"]').hidden) loadInbox();
    };
    inboxChan = supabase.channel('dm-inbox-' + ME)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'dm_threads', filter: 'user_lo=eq.' + ME }, onThread)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'dm_threads', filter: 'user_hi=eq.' + ME }, onThread)
      .subscribe();
  }

  function promptLogin() {
    if (confirm('로그인이 필요합니다. 로그인하시겠어요?')) location.href = 'login.html';
  }

  window.initDM = async function (btnSelector) {
    supabase = window.supabaseClient || supabase;
    if (!supabase) return;
    BTN = document.querySelector(btnSelector);
    if (!BTN) return;
    BADGE = BTN.querySelector('.dm-badge');
    const { data: sess } = await supabase.auth.getSession();
    ME = sess?.session?.user?.id || null;
    BTN.addEventListener('click', () => { ME ? openDM() : promptLogin(); });
    if (ME) { refreshBadge(); attachInboxRealtime(); }
  };
})();
