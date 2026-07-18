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
  /* 라인 SVG 아이콘 — 옵시디언 콰이엇 (claude.ai/design apply/dm-js-patch.md) */
  const I = (w, inner) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  const ICONS = {
    x:       I(19, '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'),
    sliders: I(18, '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>'),
    edit:    I(18, '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>'),
    back:    I(21, '<polyline points="15 18 9 12 15 6"/>'),
    plus:    I(17, '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'),
    send:    I(15, '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>'),
    search:  I(15, '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>'),
    chat:    I(15, '<path d="M21 11.5a8.38 8.38 0 0 1-8.38 8.38 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 0 1-.9-3.8 8.38 8.38 0 0 1 8.38-8.38h.5a8.48 8.48 0 0 1 8.12 8.12v.5z"/>'),
    pin:     `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6f86ff" stroke-width="2" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z"/></svg>`,
    star:    `<svg width="11" height="11" viewBox="0 0 24 24" fill="#6f86ff" stroke="#6f86ff" stroke-width="1" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
    block:   `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ff4d67" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`,
    eyeoff:  I(12, '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>'),
    down:    I(11, '<polyline points="6 9 12 15 18 9"/>'),
    menu:    I(18, '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>'),
    img:     I(14, '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>'),
    link:    I(14, '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>'),
    swords:  I(14, '<path d="M6.92 5H5l9 9 1.92-1.92L6.92 5z"/><path d="M2 20.5L3.5 22l6.6-6.6-1.5-1.5L2 20.5z"/><path d="M19 3l-4.5 4.5 1.5 1.5L21 4.5V3h-2z"/>'),
    lock:    I(14, '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'),
    like:    I(12, '<path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>'),
    dislike: I(12, '<path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3z"/><path d="M17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3"/>'),
    bolt:    I(12, '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>'),
    leave:   I(12, '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>'),
  };

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
  /* ★ users.avatar_url은 완성 URL이 아니라 스토리지 경로("<uid>/avatar.jpg")다.
     mypage 등은 storage.getPublicUrl로 변환해 쓴다 — 날것으로 <img src>에 넣으면 전부 깨진다
     ("프로필 사진이 안 나온다"의 원인). http(s)·data:로 시작하면 이미 완성 URL이니 그대로. */
  function resolveAvatar(path) {
    if (!path) return null;
    if (/^(https?:|data:)/.test(path)) return path;
    try { return supabase.storage.from('profiles').getPublicUrl(path).data.publicUrl; }
    catch (_) { return null; }
  }
  async function profilesFor(ids) {
    const need = [...new Set(ids)].filter(id => id && !(id in PROFILES));
    if (need.length) {
      const { data } = await supabase.from('users')
        .select('id,nickname,avatar_url,bio').in('id', need);
      (data || []).forEach(p => {
        PROFILES[p.id] = { nickname: p.nickname || '익명', avatar_url: resolveAvatar(p.avatar_url), bio: p.bio || '' };
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
    const name = p.nickname || '익';
    const letter = `<span class="${cls}" style="background:linear-gradient(135deg,${avatarColor(id)},#1a1c26)">${esc(name.charAt(0))}</span>`;
    if (!p.avatar_url) return letter;
    // 사진이 깨지면(404 등) 브라우저의 '?' 깨진 이미지 대신 글자 아바타로 — img를 글자 위에 얹고
    // 로드 실패 시 제거해 뒤의 글자가 드러난다
    return `<span class="${cls}" style="background:linear-gradient(135deg,${avatarColor(id)},#1a1c26)">${esc(name.charAt(0))}<img src="${esc(p.avatar_url)}" alt="" loading="lazy" onerror="this.remove()"></span>`;
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
            <button class="dm-x" data-act="close" aria-label="닫기">${ICONS.x}</button>
            <span class="dm-title">메시지</span>
            <span class="dm-head-btns">
              <button class="dm-gear" data-act="settings" aria-label="메시지 설정">${ICONS.sliders}</button>
              <button class="dm-compose" data-act="compose" aria-label="새 메시지">${ICONS.edit}</button>
            </span>
          </div>
          <div class="dm-tabs" role="tablist">
            <button class="dm-tab on" data-tab="chats" role="tab">채팅</button>
            <button class="dm-tab" data-tab="friends" role="tab">친구</button>
          </div>
          <div class="dm-share-banner" id="dm-share-banner" hidden></div>
          <div class="dm-list" id="dm-inbox-wrap">
            <div id="dm-inbox"></div>
          </div>
          <div class="dm-list" id="dm-friends" hidden>
            <div class="dm-friend-search">
              <input id="dm-friend-q" placeholder="친구 검색…" autocomplete="off">
              <button class="dm-add-btn" data-act="addFriend" type="button">${ICONS.plus} 친구 추가</button>
            </div>
            <div id="dm-friend-list"></div>
          </div>
        </div>
        <div class="dm-view" data-view="add" hidden>
          <div class="dm-head">
            <button class="dm-back" data-act="toFriends" aria-label="뒤로">${ICONS.back}</button>
            <span class="dm-title">친구 추가</span>
            <span class="dm-head-sp"></span>
          </div>
          <div class="dm-list" id="dm-add">
            <div class="dm-mycode">
              <div class="dm-mycode-label">내 친구 코드</div>
              <div class="dm-mycode-code" id="dm-my-code">······</div>
              <div class="dm-mycode-btns">
                <button id="dm-code-copy" type="button">복사</button>
                <button id="dm-code-share" type="button">공유</button>
              </div>
              <div class="dm-mycode-hint">코드를 받은 친구는 가입 전이면 가입부터, 이미 갈라인이면 바로 친구가 돼요</div>
            </div>
            <div class="dm-sec">코드로 추가</div>
            <div class="dm-code-row">
              <input id="dm-code-in" maxlength="6" placeholder="친구 코드 6자리" autocomplete="off" autocapitalize="characters">
              <button id="dm-code-go" type="button">찾기</button>
            </div>
            <div id="dm-code-result"></div>
            <div class="dm-sec">${ICONS.search}닉네임으로 추가</div>
            <div class="dm-code-row"><input id="dm-add-q" placeholder="닉네임 검색…" autocomplete="off"></div>
            <div id="dm-add-results"></div>
            <div class="dm-sec">나를 팔로우한 사람 <span class="dm-sec-sub">— 맞팔하면 친구</span></div>
            <div id="dm-followback"></div>
          </div>
        </div>
        <div class="dm-view" data-view="profile" hidden>
          <div class="dm-head">
            <button class="dm-back" data-act="toFriends" aria-label="뒤로">${ICONS.back}</button>
            <span class="dm-title">프로필</span>
            <span class="dm-head-sp"></span>
          </div>
          <div class="dm-list" id="dm-prof">
            <div class="dm-prof-hero">
              <div class="dm-prof-ava" id="dm-prof-ava"></div>
              <div class="dm-prof-name" id="dm-prof-name"></div>
              <div class="dm-prof-bio" id="dm-prof-bio"></div>
              <div class="dm-prof-rel" id="dm-prof-rel"></div>
            </div>
            <div class="dm-prof-actions">
              <button id="dm-prof-chat" type="button">${ICONS.chat} 메시지</button>
              <button id="dm-prof-home" type="button">프로필 홈</button>
            </div>
            <div id="dm-prof-identity"><div class="dm-loading">아이덴티티 분석 중…</div></div>
          </div>
        </div>
        <div class="dm-view" data-view="settings" hidden>
          <div class="dm-head">
            <button class="dm-back" data-act="toInbox" aria-label="뒤로">${ICONS.back}</button>
            <span class="dm-title">메시지 설정</span>
            <span class="dm-head-sp"></span>
          </div>
          <div class="dm-list" id="dm-settings">
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>검색 허용</b><i>끄면 다른 사람이 닉네임 검색으로 나를 찾을 수 없어요</i></span>
              <button class="dm-toggle" id="dm-set-search" type="button"></button>
            </div>
            <div class="dm-sec">${ICONS.block}차단한 사람</div>
            <div id="dm-block-list"></div>
            <div class="dm-sec">${ICONS.eyeoff}숨긴 친구</div>
            <div id="dm-hidden-list"></div>
          </div>
        </div>
        <div class="dm-view" data-view="thread" hidden>
          <div class="dm-head">
            <button class="dm-back" data-act="toInbox" aria-label="뒤로">${ICONS.back}</button>
            <span class="dm-peer-wrap">
              <span class="dm-head-ava" id="dm-peer-ava"></span>
              <span class="dm-peer-col">
                <span class="dm-title" id="dm-peer">대화</span>
                <span class="dm-peer-sub" id="dm-peer-sub"></span>
              </span>
            </span>
            <button class="dm-gear" data-act="chatset" aria-label="대화 설정">${ICONS.menu}</button>
          </div>
          <div class="dm-msgs" id="dm-msgs"></div>
          <div class="dm-reply-strip" id="dm-reply-strip" hidden>
            <span class="dm-reply-info"><b>답장</b> <span id="dm-reply-preview"></span></span>
            <button type="button" class="dm-reply-x" id="dm-reply-x"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          </div>
          <form class="dm-inputbar" id="dm-form">
            <button type="button" class="dm-attach" id="dm-attach" aria-label="사진 보내기">${ICONS.plus}</button>
            <input type="file" id="dm-file" accept="image/*" hidden>
            <textarea id="dm-input" rows="1" placeholder="메시지 입력…"></textarea>
            <button type="submit" class="dm-send" aria-label="전송">${ICONS.send}</button>
          </form>
        </div>
        <div class="dm-view" data-view="chatset" hidden>
          <div class="dm-head">
            <button class="dm-back" data-act="toThread" aria-label="뒤로">${ICONS.back}</button>
            <span class="dm-title">대화 설정</span>
            <span class="dm-head-sp"></span>
          </div>
          <div class="dm-list" id="dm-chatset"></div>
        </div>
        <div class="dm-view" data-view="compose" hidden>
          <div class="dm-head">
            <button class="dm-back" data-act="toInbox" aria-label="뒤로">${ICONS.back}</button>
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
      else if (act === 'settings') { headMenu(e.target.closest('[data-act]')); }
      else if (act === 'addFriend') { showView('add'); initAdd(); }
      else if (act === 'toFriends') { showView('inbox'); setTab('friends'); }
      else if (act === 'chatset') { openChatSet(); }
      else if (act === 'toThread') { showView('thread'); }
      else if (act === 'toInbox') { detachThread(); curThread = curPeer = null; clearReply(); showView('inbox'); loadInbox(); }
      const tab = e.target.closest('.dm-tab')?.dataset.tab;
      if (tab) setTab(tab);
    });
    ROOT.querySelector('#dm-friend-q').addEventListener('input', e => filterFriends(e.target.value));
    // 친구·채팅 행 길게 누르기 → 관리 메뉴 (말풍선 메뉴와 같은 문법)
    bindLongPress(ROOT.querySelector('#dm-friend-list'), '.dm-friend', friendMenu);
    bindLongPress(ROOT.querySelector('#dm-inbox'), '.dm-thread', threadMenu);
    // ⬇️ 당겨서 새로고침 — PWA 전체화면엔 브라우저 기본 당김이 없다
    bindPullRefresh(ROOT.querySelector('#dm-inbox-wrap'), async () => { PREF.loaded = false; await loadInbox(); refreshBadge(); });
    bindPullRefresh(ROOT.querySelector('#dm-friends'), async () => { PREF.loaded = false; FRIENDS = []; await loadFriends(); });
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
      // ⚠️ 여는 버튼(⚙)은 제외 — 여는 클릭이 document까지 버블돼 같은 틱에 도로 닫아버렸다
      //   ("설정 버튼이 작동 안 한다"의 정체. 길게 누르기 메뉴는 click으로 안 열려 무사했다)
      if (menu && !menu.hidden && !e.target.closest('#dm-menu, [data-act="settings"]')) menu.hidden = true;
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
    b.innerHTML = `${ICONS.send} <b>${esc(PENDING_SHARE.title || '콘텐츠')}</b> 를 보낼 대화를 고르세요
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
    EDIT = false;   // 편집은 일시적 모드 — 탭을 바꾸면 해제(켠 채 넘어가면 다른 탭 메뉴가 '완료'로 떠서 헷갈린다)
    ROOT.querySelectorAll('.dm-tab').forEach(t => t.classList.toggle('on', t.dataset.tab === tab));
    ROOT.querySelector('#dm-inbox-wrap').hidden = tab !== 'chats';
    ROOT.querySelector('#dm-friends').hidden = tab !== 'friends';
    if (tab === 'friends') loadFriends(); else loadInbox();
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

  /* ---------- 👤 친구 프로필 (카톡 프로필 화면 문법) ----------
     친구를 누르면 바로 채팅이 아니라 프로필로 — 그 사람의 아이덴티티(갈라리안 등급·
     갈라치기 성향·전적)를 보여준다. 채팅은 여기의 '메시지' 버튼으로. */
  let PROF_TOKEN = 0;
  async function openProfile(peer, name) {
    const token = ++PROF_TOKEN;   // 빨리 뒤로 갔다가 다른 프로필을 열면 늦은 응답이 덮어쓰지 않게
    showView('profile');
    await profilesFor([peer]);
    if (token !== PROF_TOKEN) return;
    const p = PROFILES[peer] || {};
    ROOT.querySelector('#dm-prof-ava').innerHTML = avaHTML(peer, 'lg');
    ROOT.querySelector('#dm-prof-name').textContent = p.nickname || name || '익명';
    ROOT.querySelector('#dm-prof-bio').textContent = p.bio || '';
    const f = FRIENDS.find(x => x.id === peer);
    ROOT.querySelector('#dm-prof-rel').innerHTML = f?.mutual ? '<i class="dm-mutual">맞팔</i>' : '';
    ROOT.querySelector('#dm-prof-chat').onclick = () => startDM(peer, p.nickname || name);
    ROOT.querySelector('#dm-prof-home').onclick = () => { location.href = 'mypage.html?user=' + encodeURIComponent(peer); };

    // 아이덴티티 — 등급·성향 모듈이 이 페이지에 없으면 그때 끌어온다
    const box = ROOT.querySelector('#dm-prof-identity');
    box.innerHTML = '<div class="dm-loading">아이덴티티 분석 중…</div>';
    try {
      const need = [];
      if (!window.GALLA_gallianOf) need.push(loadScript('/js/gallian.js'));
      if (!window.GALLA_computeType) need.push(loadScript('/js/galla-type.js'));
      await Promise.all(need);
      const [g, t] = await Promise.all([
        window.GALLA_gallianOf(supabase, peer),
        window.GALLA_computeType(supabase, peer).catch(() => null),
      ]);
      if (token !== PROF_TOKEN) return;
      const r = g.raw || {};
      box.innerHTML = `
        <div class="dm-sec">아이덴티티</div>
        <div class="dm-idcard">
          <div class="dm-id-tier" style="color:${esc(g.tier.color)}">${esc(g.tier.name)} <b>Lv.${g.subLevel}</b></div>
          <div class="dm-id-sub">${esc(g.tier.sub)} · 갈라 지수 ${g.gi.toLocaleString()}</div>
        </div>
        ${t && !t.rookie ? `
        <div class="dm-idcard">
          <div class="dm-id-type">${esc(t.emoji)} ${esc(t.name)}</div>
          <div class="dm-id-bar"><i style="width:${t.proPct}%"></i></div>
          <div class="dm-id-sub dm-id-pct">${ICONS.like} ${t.proPct}% · ${ICONS.dislike} ${t.conPct}%</div>
          <div class="dm-id-tags">${(t.tags || []).slice(0, 4).map(x => `<span>${esc(x)}</span>`).join('')}</div>
        </div>` : ''}
        <div class="dm-idstats">
          <span><b>${r.issues || 0}</b>갈라</span>
          <span><b>${r.comments || 0}</b>댓글</span>
          <span><b>${r.acts || 0}</b>전투</span>
          <span><b>${r.votes || 0}</b>투표</span>
        </div>`;
    } catch (e) {
      if (token !== PROF_TOKEN) return;
      box.innerHTML = '<div class="dm-set-empty">아직 분석할 활동이 없어요</div>';
    }
  }

  /* ---------- ≡ 대화 설정 (카톡 채팅방 서랍 문법) ----------
     사진/링크 모아보기 · 상대 프로필 · 고정 · 일기토 · 차단 · 나가기.
     데이터는 이미 열린 대화의 MSGS를 그대로 쓴다(재조회 없음). */
  function openChatSet() {
    if (!curThread || !curPeer) return;
    showView('chatset');
    const p = PROFILES[curPeer] || {};
    const rows = Object.values(MSGS).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    // 📸 사진 (최근 9장) — 이 대화에서 주고받은 것
    const imgs = rows.filter(m => m.kind === 'image' && !m.deleted_at && m.meta?.url).slice(-9).reverse();
    // 🔗 링크 — 본문 URL + 공유 카드
    const links = [];
    rows.forEach(m => {
      if (m.deleted_at) return;
      if (m.kind === 'share' && m.meta) {
        const PAGE = { issue: 'issue', predict: 'predict-market', plaza: 'plaza_detail', news: 'news' };
        const href = (m.meta.type && PAGE[m.meta.type] && m.meta.id)
          ? `${PAGE[m.meta.type]}.html?id=${m.meta.id}` : (m.meta.url || null);
        if (href) links.push({ href, label: m.meta.title || '공유 콘텐츠', galla: true });
      } else if (m.kind === 'text' && m.body) {
        (m.body.match(/https?:\/\/[^\s<>"']+/g) || []).forEach(u => {
          let host = u; try { host = new URL(u).hostname; } catch (_) {}
          links.push({ href: u, label: host, galla: false });
        });
      }
    });
    const recentLinks = links.slice(-8).reverse();

    const box = ROOT.querySelector('#dm-chatset');
    box.innerHTML = `
      <button class="dm-cs-peer" id="dm-cs-peer" type="button">
        ${avaHTML(curPeer, 'sm')}
        <span class="dm-thread-mid">
          <span class="dm-thread-name">${esc(p.nickname || '대화 상대')}</span>
          <span class="dm-thread-prev">프로필 보기 ›</span>
        </span>
      </button>
      <div class="dm-sec">${ICONS.img}사진 <b>${imgs.length}</b></div>
      ${imgs.length
        ? `<div class="dm-cs-grid">${imgs.map(m => `<button type="button" class="dm-cs-thumb" data-url="${esc(m.meta.url)}" style="background-image:url('${esc(m.meta.url)}')"></button>`).join('')}</div>`
        : `<div class="dm-set-empty">주고받은 사진이 없어요</div>`}
      <div class="dm-sec">${ICONS.link}링크 <b>${recentLinks.length}</b></div>
      ${recentLinks.length
        ? recentLinks.map(l => `<a class="dm-cs-link" href="${esc(l.href)}"${l.galla ? '' : ' target="_blank" rel="noopener"'}>${l.galla ? ICONS.bolt + ' ' : ''}${esc(l.label)}</a>`).join('')
        : `<div class="dm-set-empty">주고받은 링크가 없어요</div>`}
      <div class="dm-sec">대화 관리</div>
      <button class="dm-cs-act" data-cs="pin" type="button">${ICONS.pin} ${PREF.threads[curThread]?.pinned ? '고정 해제' : '상단 고정'}</button>
      <button class="dm-cs-act" data-cs="duel" type="button">${ICONS.swords} 일기토 신청</button>
      <button class="dm-cs-act disabled" type="button">${ICONS.lock} 비밀대화 <i class="dm-soon">곧</i></button>
      <button class="dm-cs-act danger" data-cs="block" type="button">${ICONS.block} 차단</button>
      <button class="dm-cs-act danger" data-cs="leave" type="button">${ICONS.leave} 채팅방 나가기</button>`;

    box.querySelector('#dm-cs-peer').onclick = () => openProfile(curPeer, p.nickname);
    box.querySelectorAll('.dm-cs-thumb').forEach(t => t.onclick = () => openLightbox(t.dataset.url));
    box.querySelectorAll('[data-cs]').forEach(b => b.onclick = async () => {
      const k = b.dataset.cs;
      if (k === 'pin') { await doThreadAct('pin', curThread); openChatSet(); }
      else if (k === 'duel') { location.href = 'duel.html?challenge=' + encodeURIComponent(curPeer); }
      else if (k === 'block') {
        const before = PREF.blocks.size;
        await doFriendAct('block', curPeer, p.nickname || '');
        if (PREF.blocks.size > before) { detachThread(); curThread = curPeer = null; showView('inbox'); loadInbox(); }
      }
      else if (k === 'leave') {
        await doThreadAct('leave', curThread);
        // 나갔으면(취소 안 했으면) 목록으로
        if (PREF.threads[curThread]?.left_at) { detachThread(); curThread = curPeer = null; showView('inbox'); }
      }
    });
  }

  /* 사진 크게 보기 — 패널 안 라이트박스(탭하면 닫힘) */
  function openLightbox(url) {
    let lb = document.getElementById('dm-lightbox');
    if (!lb) {
      lb = document.createElement('div');
      lb.id = 'dm-lightbox';
      lb.addEventListener('click', () => { lb.classList.remove('on'); });
      document.body.appendChild(lb);
    }
    lb.innerHTML = `<img src="${esc(url)}" alt="">`;
    requestAnimationFrame(() => lb.classList.add('on'));
  }

  /* ---------- ⬇️ 당겨서 새로고침 ----------
     리스트 맨 위에서 아래로 70px 이상 당기면 스피너가 돌고 목록을 다시 불러온다.
     스크롤 중간에서는 절대 발동하지 않는다(scrollTop 0에서 시작한 제스처만). */
  function bindPullRefresh(container, onRefresh) {
    if (!container) return;
    let startY = 0, pulling = false, busy = false;
    let bar = document.createElement('div');
    bar.className = 'dm-ptr';
    bar.innerHTML = '<span class="dm-ptr-spin"></span>';
    container.prepend(bar);

    container.addEventListener('touchstart', e => {
      if (busy || container.scrollTop > 0) { pulling = false; return; }
      startY = e.touches[0].clientY; pulling = true;
    }, { passive: true });
    container.addEventListener('touchmove', e => {
      if (!pulling || busy) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0 || container.scrollTop > 0) { bar.style.height = '0px'; return; }
      // 고무줄 저항 — 당길수록 무거워진다
      const h = Math.min(90, dy * 0.45);
      bar.style.height = h + 'px';
      bar.classList.toggle('ready', h >= 58);
    }, { passive: true });
    container.addEventListener('touchend', async () => {
      if (!pulling || busy) return;
      pulling = false;
      const ready = bar.classList.contains('ready');
      if (!ready) { bar.style.height = '0px'; bar.classList.remove('ready'); return; }
      busy = true;
      bar.classList.add('busy'); bar.style.height = '54px';
      try { window.BattleFX?.haptic?.('tap'); } catch (_) {}
      try { await onRefresh(); } catch (_) {}
      bar.classList.remove('busy', 'ready');
      bar.style.height = '0px';
      busy = false;
    });
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

  /* ---------- 친구/채팅방 액션 (길게 누르기 메뉴와 편집 모드가 공유) ---------- */
  async function doFriendAct(k, peer, name) {
    if (k === 'fav') {
      const fav = PREF.favs.has(peer);
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
  }
  async function doThreadAct(k, tid) {
    const p = PREF.threads[tid] || {};
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
  }
  function friendMenu(el, x, y) {
    const peer = el.dataset.peer, name = el.dataset.name;
    popMenu(x, y, [
      { k: 'fav', label: PREF.favs.has(peer) ? '즐겨찾기 해제' : '즐겨찾기' },
      { k: 'hide', label: '목록에서 숨기기' },
      { k: 'block', label: '차단', danger: true },
    ], k => doFriendAct(k, peer, name));
  }
  function threadMenu(el, x, y) {
    const tid = el.dataset.tid;
    popMenu(x, y, [
      { k: 'pin', label: PREF.threads[tid]?.pinned ? '고정 해제' : '상단 고정' },
      { k: 'leave', label: '나가기', danger: true },
    ], k => doThreadAct(k, tid));
  }

  /* ---------- ⚙ 헤더 메뉴 (카톡의 정렬·편집·설정 드롭다운) ----------
     긴 여정을 줄인다: 정렬은 여기, 관리는 편집 모드로 드러낸다.
     길게 누르기 메뉴는 유지하되, 몰라도 편집 모드로 같은 일을 할 수 있다(발견성). */
  let EDIT = false;
  function headMenu(anchor) {
    const r = anchor.getBoundingClientRect();
    const isFriends = !ROOT.querySelector('#dm-friends').hidden;
    const items = isFriends
      ? [
          { k: 'add', label: '친구 추가' },
          { k: 'edit', label: EDIT ? '편집 완료' : '친구 목록 편집' },
          { k: 'full', label: '전체 설정' },
        ]
      : [
          { k: 'sortRecent', label: (SORT === 'recent' ? '✓ ' : ' ') + '최신 메시지 순' },
          { k: 'sortUnread', label: (SORT === 'unread' ? '✓ ' : ' ') + '안 읽은 메시지 순' },
          { k: 'edit', label: EDIT ? '편집 완료' : '채팅방 편집' },
          { k: 'full', label: '전체 설정' },
        ];
    popMenu(r.right - 170, r.bottom + 6, items, k => {
      if (k === 'sortRecent' || k === 'sortUnread') {
        SORT = k === 'sortUnread' ? 'unread' : 'recent';
        try { localStorage.setItem('galla_dm_sort', SORT); } catch (_) {}
        loadInbox();
      } else if (k === 'edit') {
        EDIT = !EDIT;
        if (isFriends) renderFriends(FRIENDS); else loadInbox();
      } else if (k === 'add') { showView('add'); initAdd(); }
      else if (k === 'full') { showView('settings'); loadSettings(); }
    });
  }
  /* 편집 모드 행동 칩 — 행 클릭(대화 열기) 대신 관리 버튼이 노출된다 */
  function editChipsFriend(f) {
    const fav = PREF.favs.has(f.id);
    return `<span class="dm-edit-chips">
      <button class="dm-chip${fav ? ' on' : ''}" data-ek="fav" data-peer="${f.id}" type="button">${ICONS.star}</button>
      <button class="dm-chip" data-ek="hide" data-peer="${f.id}" type="button">${ICONS.eyeoff}</button>
      <button class="dm-chip danger" data-ek="block" data-peer="${f.id}" type="button">${ICONS.block}</button>
    </span>`;
  }
  function editChipsThread(tid) {
    const pinned = !!PREF.threads[tid]?.pinned;
    return `<span class="dm-edit-chips">
      <button class="dm-chip${pinned ? ' on' : ''}" data-ek="pin" data-tid="${tid}" type="button">${ICONS.pin}</button>
      <button class="dm-chip danger" data-ek="leave" data-tid="${tid}" type="button">${ICONS.leave}</button>
    </span>`;
  }
  function bindEditChips(box) {
    box.querySelectorAll('.dm-chip').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation(); e.preventDefault();
      const { ek, peer, tid } = b.dataset;
      if (peer) {
        const name = b.closest('.dm-friend')?.dataset.name || '';
        doFriendAct(ek, peer, name);
      } else if (tid) doThreadAct(ek, tid);
    }, true));
  }

  /* ---------- 설정: 검색 허용 + 차단/숨김 관리 ---------- */
  async function loadSettings() {
    await loadPrefs(true);
    const tg = ROOT.querySelector('#dm-set-search');
    const paintTg = () => { tg.classList.toggle('on', PREF.searchable); tg.textContent = '';   /* 스위치는 CSS가 그림 */ };
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
        ${EDIT ? editChipsFriend(f) : `<span class="dm-friend-go">${ICONS.chat}</span>`}
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
      (favs.length ? `<div class="dm-sec">${ICONS.star}즐겨찾기 <b>${favs.length}</b></div>` + favs.map(friendRow).join('') : '') +
      `<div class="dm-sec">친구 <b>${rest.length}</b></div>` + rest.map(friendRow).join('');
    box.querySelectorAll('.dm-friend').forEach(el => {
      // 카톡 문법: 친구 탭에선 프로필 먼저, 채팅은 프로필의 '메시지' 버튼으로
      el.addEventListener('click', () => { if (!EDIT) openProfile(el.dataset.peer, el.dataset.name); });
    });
    if (EDIT) bindEditChips(box);
    staggerRows(box, '.dm-friend');
  }
  /* ---------- ➕ 친구 추가 (코드·닉네임·맞팔 대기) ---------- */
  let FOLLOWING = new Set();
  function addRow(u) {
    PROFILES[u.id] = PROFILES[u.id] || { nickname: u.nickname || '익명', avatar_url: resolveAvatar(u.avatar_url), bio: u.bio || '' };
    nickCache[u.id] = u.nickname || '익명';
    const following = FOLLOWING.has(u.id);
    return `
      <div class="dm-friend dm-add-row" data-peer="${u.id}">
        ${avaHTML(u.id)}
        <span class="dm-thread-mid">
          <span class="dm-thread-name">${esc(u.nickname || '익명')}</span>
          ${u.bio ? `<span class="dm-thread-prev">${esc(u.bio)}</span>` : ''}
        </span>
        <button class="dm-follow-btn${following ? ' done' : ''}" data-uid="${u.id}" type="button" ${following ? 'disabled' : ''}>
          ${following ? '✓ 친구' : '+ 팔로우'}
        </button>
      </div>`;
  }
  function bindFollowBtns(box) {
    box.querySelectorAll('.dm-follow-btn:not(.done)').forEach(btn => btn.onclick = async () => {
      const uid = btn.dataset.uid;
      btn.disabled = true; btn.textContent = '…';
      const { error } = await supabase.from('follows').insert({ follower: ME, following: uid });
      if (error && error.code !== '23505') {   // 23505 = 이미 팔로우(중복) — 성공으로 간주
        btn.disabled = false; btn.textContent = '+ 팔로우'; return;
      }
      FOLLOWING.add(uid);
      FRIENDS.push({ id: uid, mutual: false });
      // 같은 유저가 이 화면의 다른 섹션(코드 결과·검색·맞팔 대기)에도 떠 있을 수 있다
      // → 전부 ✓로 동기화. 맞팔 대기 행은 이제 '대기'가 아니므로 제거.
      ROOT.querySelectorAll(`#dm-add .dm-follow-btn[data-uid="${uid}"]`).forEach(b => {
        b.textContent = '✓ 친구'; b.classList.add('done'); b.disabled = true;
      });
      ROOT.querySelectorAll(`#dm-followback .dm-add-row[data-peer="${uid}"]`).forEach(r => r.remove());
      if (!ROOT.querySelector('#dm-followback .dm-add-row')) {
        const fb = ROOT.querySelector('#dm-followback');
        if (fb) fb.innerHTML = '<div class="dm-set-empty">지금은 없어요</div>';
      }
      try { window.BattleFX?.haptic?.('tap'); } catch (_) {}
    });
  }
  async function initAdd() {
    // 내가 팔로우 중인 목록(버튼 상태용) — 친구 탭을 안 거쳤을 수 있으니 직접
    const { data: ing } = await supabase.from('follows').select('following').eq('follower', ME);
    FOLLOWING = new Set((ing || []).map(r => r.following));

    // ① 내 친구 코드 — 초대 코드와 같은 코드(가입 유도 겸용)
    const codeEl = ROOT.querySelector('#dm-my-code');
    const { data: myCode } = await supabase.rpc('my_ref_code');
    codeEl.textContent = myCode || '------';
    const inviteUrl = 'https://galla.im/?ref=' + (myCode || '');
    ROOT.querySelector('#dm-code-copy').onclick = async () => {
      try { await navigator.clipboard.writeText(myCode || ''); codeEl.classList.add('flash'); setTimeout(() => codeEl.classList.remove('flash'), 600); } catch (_) {}
    };
    ROOT.querySelector('#dm-code-share').onclick = () => {
      const msg = `갈라에서 친구해요! 내 친구 코드: ${myCode} — ` + inviteUrl;
      if (window.GALLA_share) window.GALLA_share({ url: inviteUrl, title: 'GALLA 친구 추가', text: msg });
      else if (navigator.share) navigator.share({ title: 'GALLA', text: msg, url: inviteUrl }).catch(() => {});
      else navigator.clipboard?.writeText(msg);
    };

    // ② 코드로 찾기
    const codeIn = ROOT.querySelector('#dm-code-in');
    const codeRes = ROOT.querySelector('#dm-code-result');
    codeRes.innerHTML = '';
    const lookup = async () => {
      const q = codeIn.value.trim();
      if (q.length < 6) { codeRes.innerHTML = '<div class="dm-set-empty">6자리 코드를 입력하세요</div>'; return; }
      const { data } = await supabase.rpc('dm_find_by_code', { p_code: q });
      const u = (data || [])[0];
      codeRes.innerHTML = u ? addRow(u) : '<div class="dm-set-empty">해당 코드의 갈라인이 없어요</div>';
      if (u) bindFollowBtns(codeRes);
    };
    ROOT.querySelector('#dm-code-go').onclick = lookup;
    codeIn.onkeydown = e => { if (e.key === 'Enter') lookup(); };

    // ③ 닉네임 검색 (검색 허용·차단은 dm_search가 서버에서 거른다)
    const addQ = ROOT.querySelector('#dm-add-q');
    const addRes = ROOT.querySelector('#dm-add-results');
    addRes.innerHTML = '';
    let t = null;
    addQ.oninput = () => {
      clearTimeout(t);
      const q = addQ.value.trim();
      if (!q) { addRes.innerHTML = ''; return; }
      t = setTimeout(async () => {
        const { data } = await supabase.rpc('dm_search', { p_q: q });
        const list = (data || []).filter(u => u.id !== ME);
        addRes.innerHTML = list.length ? list.map(addRow).join('') : '<div class="dm-set-empty">검색 결과가 없어요</div>';
        bindFollowBtns(addRes);
      }, 250);
    };

    // ④ 나를 팔로우한 사람 중 내가 아직 안 한 사람 = 맞팔 대기 (카톡 '추천친구' 대응)
    const fbBox = ROOT.querySelector('#dm-followback');
    const { data: ers } = await supabase.from('follows').select('follower').eq('following', ME);
    const waiting = [...new Set((ers || []).map(r => r.follower))]
      .filter(id => !FOLLOWING.has(id) && !PREF.blocks.has(id));
    if (!waiting.length) { fbBox.innerHTML = '<div class="dm-set-empty">지금은 없어요</div>'; return; }
    await profilesFor(waiting);
    fbBox.innerHTML = waiting.map(id => addRow({ id, ...PROFILES[id] })).join('');
    bindFollowBtns(fbBox);
    staggerRows(fbBox, '.dm-add-row');
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
      box.innerHTML = `<div class="dm-empty">아직 대화가 없어요.<br><span>오른쪽 위 연필을 눌러 새 메시지를 시작하세요.</span></div>`;
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
      // 서버 미리보기(dm_touch_thread)가 주는 이모지 접두를 라인 SVG로 — DM 아이콘은 전부 SVG 원칙
      const lm = t.last_message || '';
      const pvIcon = lm.startsWith('📷') || lm.startsWith('🎬') ? ICONS.img
        : lm.startsWith('🔗') ? ICONS.link : '';
      const pvText = pvIcon ? lm.replace(/^(📷|🎬|🔗)\s*/, '') : lm;
      const preview = (t.last_sender === ME ? '나: ' : '');
      return `
        <button class="dm-thread${u ? ' dm-unread' : ''}" data-tid="${t.id}" data-peer="${peer}" data-name="${esc(name)}">
          ${avaHTML(peer)}
          <span class="dm-thread-mid">
            <span class="dm-thread-name">${pinned ? ICONS.pin : ''}${esc(name)}</span>
            <span class="dm-thread-prev">${esc(preview)}${pvIcon}${esc(pvText)}</span>
          </span>
          ${EDIT ? editChipsThread(t.id) : `<span class="dm-thread-side">
            <span class="dm-thread-time">${timeLabel(t.last_message_at)}</span>
            ${u ? `<span class="dm-dot">${u}</span>` : ''}
          </span>`}
        </button>`;
    }).join('');
    box.querySelectorAll('.dm-thread').forEach(el => {
      el.addEventListener('click', () => { if (!EDIT) openThread(el.dataset.tid, el.dataset.peer, el.dataset.name); });
    });
    if (EDIT) bindEditChips(box);
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
      inner = `<span class="dm-bub-body dm-deleted">${ICONS.block} 삭제된 메시지입니다</span>`;
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
      const qhtml = q.deleted_at ? `${ICONS.block} 삭제된 메시지`
        : q.kind === 'image' ? `${ICONS.img} 사진`
        : q.kind === 'share' ? `${ICONS.link} ${esc(String(q.meta?.title || '공유').slice(0, 40))}`
        : esc(String(q.body || '').slice(0, 60));
      quote = `<span class="dm-quote">${qhtml}</span>`;
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
    tmp.innerHTML = `<span class="dm-bub-body">${ICONS.img} 사진 보내는 중…</span>`;
    wrap.appendChild(tmp); wrap.scrollTop = wrap.scrollHeight;
    try {
      const url = await window.GALLA_UPLOAD_MEDIA(f, 'image');
      tmp.remove();
      await sendMessage({ kind: 'image', body: '📷 사진', meta: { url } });
    } catch (err) {
      tmp.querySelector('.dm-bub-body').textContent = '사진 전송 실패';
      setTimeout(() => tmp.remove(), 2500);
    }
  }

  /* ---------- 답장 ---------- */
  function setReply(m) {
    REPLY = m;
    const strip = ROOT.querySelector('#dm-reply-strip');
    const prev = m.deleted_at ? '삭제된 메시지' : m.kind === 'image' ? '사진' : m.kind === 'share' ? '공유' : m.body;
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
    if (!m.deleted_at) items.push(`<button data-m="reply">답장</button>`);
    if (!m.deleted_at && m.kind === 'text') items.push(`<button data-m="copy">복사</button>`);
    if (mine && !m.deleted_at && fresh) items.push(`<button data-m="unsend" class="danger">보내기 취소</button>`);
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
        list.forEach(u => { PROFILES[u.id] = { nickname: u.nickname || '익명', avatar_url: resolveAvatar(u.avatar_url), bio: u.bio || '' }; nickCache[u.id] = u.nickname || '익명'; });
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
