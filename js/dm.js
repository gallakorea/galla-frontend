/* =========================================================
   DM — 1:1 다이렉트 메시지 (광장 헤더)
   window.initDM('#plazaDmBtn')  헤더 버튼에 바인딩 + 안읽음 뱃지
   window.startDM(userId, nickname)  특정 유저와 대화 시작(외부 진입점용)
   ========================================================= */
(function () {
  // 클라이언트는 페이지마다 초기화 시점이 달라 지연 해결(initDM/startDM 진입 시 확정)
  let supabase = window.supabaseClient;
  let ME = null, ROOT = null, BTN = null, BADGE = null;
  let curThread = null, curPeer = null, msgChan = null, inboxChan = null;
  const nickCache = {};

  const esc = s => (s == null ? '' : String(s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
  const avatarColor = id => {
    let h = 0; for (const c of (id || '')) h = (h * 31 + c.charCodeAt(0)) % 360;
    return `hsl(${h} 55% 45%)`;
  };
  const timeLabel = ts => {
    const d = new Date(ts), now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    const diff = (now - d) / 86400000;
    if (diff < 7) return ['일', '월', '화', '수', '목', '금', '토'][d.getDay()] + '요일';
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  async function nicksFor(ids) {
    const need = [...new Set(ids)].filter(id => id && !(id in nickCache));
    if (need.length) {
      const { data } = await supabase.from('user_profiles')
        .select('user_id, nickname').in('user_id', need);
      (data || []).forEach(p => { nickCache[p.user_id] = p.nickname || '익명'; });
      need.forEach(id => { if (!(id in nickCache)) nickCache[id] = '익명'; });
    }
    return nickCache;
  }

  function buildRoot() {
    if (ROOT) return ROOT;
    ROOT = document.createElement('div');
    ROOT.id = 'dm-root';
    ROOT.className = 'dm-root';
    ROOT.innerHTML = `
      <div class="dm-dim"></div>
      <div class="dm-panel" role="dialog" aria-label="메시지">
        <div class="dm-view" data-view="inbox">
          <div class="dm-head">
            <button class="dm-x" data-act="close" aria-label="닫기">✕</button>
            <span class="dm-title">메시지</span>
            <button class="dm-compose" data-act="compose" aria-label="새 메시지">✎</button>
          </div>
          <div class="dm-list" id="dm-inbox"></div>
        </div>
        <div class="dm-view" data-view="thread" hidden>
          <div class="dm-head">
            <button class="dm-back" data-act="toInbox" aria-label="뒤로">‹</button>
            <span class="dm-title" id="dm-peer">대화</span>
            <span class="dm-head-sp"></span>
          </div>
          <div class="dm-msgs" id="dm-msgs"></div>
          <form class="dm-inputbar" id="dm-form">
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
      </div>`;
    document.body.appendChild(ROOT);

    ROOT.querySelector('.dm-dim').addEventListener('click', closeDM);
    ROOT.addEventListener('click', e => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'close') closeDM();
      else if (act === 'compose') showView('compose'), initSearch();
      else if (act === 'toInbox') { detachThread(); curThread = curPeer = null; showView('inbox'); loadInbox(); }
    });
    ROOT.querySelector('#dm-form').addEventListener('submit', onSend);
    const ta = ROOT.querySelector('#dm-input');
    ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; });
    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(e); }
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
    loadInbox();
  }
  function closeDM() {
    if (!ROOT) return;
    ROOT.classList.remove('open');
    document.body.style.overflow = '';
    detachThread();
    curThread = curPeer = null;
  }

  /* ---------- 인박스 ---------- */
  async function loadInbox() {
    const box = ROOT.querySelector('#dm-inbox');
    const { data: threads } = await supabase.from('dm_threads')
      .select('id,user_lo,user_hi,last_message,last_sender,last_message_at')
      .order('last_message_at', { ascending: false });
    if (!threads || !threads.length) {
      box.innerHTML = `<div class="dm-empty">아직 대화가 없어요.<br><span>✎ 를 눌러 새 메시지를 시작하세요.</span></div>`;
      return;
    }
    const peers = threads.map(t => t.user_lo === ME ? t.user_hi : t.user_lo);
    await nicksFor(peers);
    // 안읽음: 내가 받은 미독 메시지
    const { data: unread } = await supabase.from('dm_messages')
      .select('thread_id').is('read_at', null).neq('sender_id', ME);
    const unreadBy = {};
    (unread || []).forEach(m => { unreadBy[m.thread_id] = (unreadBy[m.thread_id] || 0) + 1; });

    box.innerHTML = threads.map(t => {
      const peer = t.user_lo === ME ? t.user_hi : t.user_lo;
      const name = nickCache[peer] || '익명';
      const u = unreadBy[t.id] || 0;
      const preview = (t.last_sender === ME ? '나: ' : '') + (t.last_message || '');
      return `
        <button class="dm-thread${u ? ' dm-unread' : ''}" data-tid="${t.id}" data-peer="${peer}" data-name="${esc(name)}">
          <span class="dm-ava" style="background:${avatarColor(peer)}">${esc(name.charAt(0))}</span>
          <span class="dm-thread-mid">
            <span class="dm-thread-name">${esc(name)}</span>
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
  }

  /* ---------- 대화 ---------- */
  async function openThread(tid, peer, name) {
    curThread = tid; curPeer = peer;
    ROOT.querySelector('#dm-peer').textContent = name;
    showView('thread');
    const wrap = ROOT.querySelector('#dm-msgs');
    wrap.innerHTML = `<div class="dm-loading">불러오는 중…</div>`;
    const { data: msgs } = await supabase.from('dm_messages')
      .select('id,sender_id,body,created_at').eq('thread_id', tid)
      .order('created_at', { ascending: true });
    renderMsgs(msgs || []);
    await markRead(tid);
    attachThread(tid);
    setTimeout(() => ROOT.querySelector('#dm-input')?.focus(), 50);
  }

  function renderMsgs(msgs) {
    const wrap = ROOT.querySelector('#dm-msgs');
    wrap.innerHTML = msgs.map(m => `
      <div class="dm-bubble ${m.sender_id === ME ? 'me' : 'you'}">
        <span class="dm-bub-body">${esc(m.body)}</span>
        <span class="dm-bub-time">${new Date(m.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>`).join('');
    wrap.scrollTop = wrap.scrollHeight;
  }
  function appendMsg(m) {
    const wrap = ROOT.querySelector('#dm-msgs');
    const near = wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight < 80;
    wrap.insertAdjacentHTML('beforeend', `
      <div class="dm-bubble ${m.sender_id === ME ? 'me' : 'you'}">
        <span class="dm-bub-body">${esc(m.body)}</span>
        <span class="dm-bub-time">${new Date(m.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>`);
    if (near || m.sender_id === ME) wrap.scrollTop = wrap.scrollHeight;
  }

  async function onSend(e) {
    e.preventDefault();
    const ta = ROOT.querySelector('#dm-input');
    const body = ta.value.trim();
    if (!body || !curThread) return;
    ta.value = ''; ta.style.height = 'auto';
    const { data, error } = await supabase.from('dm_messages')
      .insert({ thread_id: curThread, sender_id: ME, body }).select().single();
    if (error) { console.error(error); return; }
    appendMsg(data);
  }

  async function markRead(tid) {
    await supabase.from('dm_messages').update({ read_at: new Date().toISOString() })
      .eq('thread_id', tid).is('read_at', null).neq('sender_id', ME);
    refreshBadge();
  }

  function attachThread(tid) {
    detachThread();
    msgChan = supabase.channel('dm-thread-' + tid)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dm_messages', filter: `thread_id=eq.${tid}` },
        ({ new: m }) => {
          if (m.sender_id === ME) return; // 내 메시지는 이미 낙관적 표시
          appendMsg(m);
          markRead(tid);
        })
      .subscribe();
  }
  function detachThread() {
    // 채널만 정리. curThread/curPeer는 뷰 전환(닫기/목록) 시점에 초기화
    if (msgChan) { supabase.removeChannel(msgChan); msgChan = null; }
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
        const { data } = await supabase.from('user_profiles')
          .select('user_id,nickname').ilike('nickname', `%${q}%`).limit(20);
        const list = (data || []).filter(u => u.user_id !== ME);
        if (!list.length) { res.innerHTML = `<div class="dm-empty">검색 결과가 없어요.</div>`; return; }
        res.innerHTML = list.map(u => `
          <button class="dm-thread" data-peer="${u.user_id}" data-name="${esc(u.nickname || '익명')}">
            <span class="dm-ava" style="background:${avatarColor(u.user_id)}">${esc((u.nickname || '익').charAt(0))}</span>
            <span class="dm-thread-mid"><span class="dm-thread-name">${esc(u.nickname || '익명')}</span></span>
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
    inboxChan = supabase.channel('dm-inbox')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'dm_threads' },
        ({ new: t }) => {
          if (t.user_lo !== ME && t.user_hi !== ME) return;
          if (t.last_sender !== ME) refreshBadge();
          if (ROOT && ROOT.classList.contains('open') &&
              !ROOT.querySelector('[data-view="inbox"]').hidden) loadInbox();
        })
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
