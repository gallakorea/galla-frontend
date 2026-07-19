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
    bell:    I(14, '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>'),
    more:    I(14, '<circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/><circle cx="5" cy="12" r="1.6"/>'),
    lock:    I(14, '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'),
    like:    I(12, '<path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>'),
    dislike: I(12, '<path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3z"/><path d="M17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3"/>'),
    bolt:    I(12, '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>'),
    leave:   I(12, '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>'),
    crew:    I(12, '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
    mic:     I(17, '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/>'),
    smile:   I(17, '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>'),
    play:    I(13, '<polygon points="5 3 19 12 5 21 5 3"/>'),
    pause:   I(13, '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>'),
    cam:     I(17, '<path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/>'),
    timer:   I(14, '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M9 2h6"/>'),
    phone:   I(17, '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>'),
    flag:    I(12, '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>'),
    cog:     I(17, '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
  };

  let supabase = window.supabaseClient;
  let ME = null, ROOT = null, BTN = null, BADGE = null;
  let curThread = null, curPeer = null, msgChan = null, inboxChan = null;
  let curRoom = null, roomChan = null, MY_ROOMS = new Set(), ROOMS = [], GROUPS = [], GSEL = new Set(), GMODE = 'create';
  let curExpire = null;   // 현재 스레드의 사라지는 메시지 타이머(초)
  let mailChan = null;
  const PEER_THREADS = {};   // peerId -> threadId (우편함 시도-복호 후보)
  const EXP_LABEL = { 3600: '1시간', 86400: '24시간', 604800: '7일' };
  const E2E_PLAIN = {};   // msgId -> 복호된 평문(null이면 이 기기에서 못 엶)
  const SECRETS = (() => { try { return new Set(JSON.parse(localStorage.getItem('galla_dm_secrets') || '[]')); } catch (_) { return new Set(); } })();
  const secretOn = tid => SECRETS.has(tid);
  const setSecret = (tid, on) => {
    if (on) SECRETS.add(tid); else SECRETS.delete(tid);
    try { localStorage.setItem('galla_dm_secrets', JSON.stringify([...SECRETS])); } catch (_) {}
  };
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
  // 페이지 모드(dm.html): 오버레이가 아니라 헤더·네비 사이 본문으로 렌더 —
  // "DM은 기능이 아니라 페이지" (네비·헤더가 그대로 보여야 한다)
  const PAGE_MODE = () => document.body.dataset.page === 'dm';
  function buildRoot() {
    if (ROOT) return ROOT;
    ROOT = document.createElement('div');
    ROOT.id = 'dm-root';
    ROOT.className = 'dm-root' + (PAGE_MODE() ? ' page' : '');
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
            <button class="dm-tab" data-tab="rooms" role="tab">난장</button>
            <button class="dm-tab" data-tab="pager" role="tab">삐삐<span class="dm-tab-dot" id="pgr-tab-dot" hidden></span></button>
            <button class="dm-tab dm-tab-set" data-tab="set" role="tab" aria-label="메시지 설정">${ICONS.cog}</button>
          </div>
          <div class="dm-share-banner" id="dm-share-banner" hidden></div>
          <div class="dm-list" id="dm-inbox-wrap">
            <div class="dm-invites" id="dm-invites" hidden></div>
            <div class="dm-folders" id="dm-folders" hidden></div>
            <div id="dm-inbox"></div>
          </div>
          <div class="dm-list" id="dm-friends" hidden>
            <div class="dm-friend-search">
              <input id="dm-friend-q" placeholder="친구 검색…" autocomplete="off">
              <button class="dm-add-btn" data-act="addFriend" type="button">${ICONS.plus} 친구 추가</button>
            </div>
            <div id="dm-friend-list"></div>
          </div>
          <div class="dm-list" id="dm-pager" hidden></div>
          <div class="dm-list" id="dm-rooms" hidden>
            <form class="dm-room-form" id="dm-room-form" hidden>
              <input id="dm-room-title" maxlength="30" placeholder="난장 이름 (예: 오늘의 축구 한판)" autocomplete="off">
              <input id="dm-room-topic" maxlength="100" placeholder="주제 한 줄 (선택)" autocomplete="off">
              <div class="dm-room-form-btns">
                <button type="button" id="dm-room-cancel">취소</button>
                <button type="submit" id="dm-room-go">${ICONS.plus} 난장 열기</button>
              </div>
            </form>
            <div class="dm-friend-search dm-room-bar">
              <span class="dm-room-hint">주제를 정해 아무나 뛰어드는 오픈 채팅</span>
              <button class="dm-add-btn" data-act="newRoom" type="button">${ICONS.plus} 난장 열기</button>
            </div>
            <div id="dm-room-list"></div>
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
              <button id="dm-prof-voice" type="button">${ICONS.phone} 육성톡</button>
              <button id="dm-prof-video" type="button">${ICONS.cam} 면상톡</button>
              <button id="dm-prof-pager" type="button" class="span2">📟 삐삐 남기기</button>
            </div>
            <div id="dm-prof-identity"><div class="dm-loading">아이덴티티 분석 중…</div></div>
          </div>
        </div>
        <div class="dm-view" data-view="privacy" hidden>
          <div class="dm-head">
            <button class="dm-back" data-act="toSettings" aria-label="뒤로">${ICONS.back}</button>
            <span class="dm-title">개인 · 보안</span>
            <span class="dm-head-sp"></span>
          </div>
          <div class="dm-list" id="dm-privacy">
            <div class="dm-sec">${ICONS.lock}나를 찾는 방법</div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>검색 허용</b><i>끄면 다른 사람이 닉네임 검색으로 나를 찾을 수 없어요</i></span>
              <button class="dm-toggle" id="dm-set-search" type="button"></button>
            </div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>그룹채팅방 참여 설정</b><i>친구가 아닌 사람이 단체방에 초대하면 먼저 확인하고 들어가요</i></span>
              <button class="dm-toggle" id="dm-set-gate" type="button"></button>
            </div>

            <div class="dm-sec">${ICONS.lock}잠금</div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>화면 잠금</b><i id="dm-lock-sub">메시지를 열 때 4자리 비밀번호를 물어봐요 (이 기기에만 저장)</i></span>
              <button class="dm-mic-btn" id="dm-set-lock" type="button">꺼짐</button>
            </div>
            <div class="dm-set-note">🔒 비밀대화는 대화방 메뉴에서 켤 수 있어요. 켜면 이 기기에서만 풀리는 자물쇠로 잠겨 서버도 내용을 못 봅니다.</div>

            <div class="dm-sec">${ICONS.more}계정</div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>개인정보 관리</b><i>닉네임·프로필·계정 정보</i></span>
              <a class="dm-mic-btn" href="/account-edit.html">관리</a>
            </div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>내 아이템함 · 상점</b><i>이모티콘·유령권 등 보유 아이템과 구매</i></span>
              <button class="dm-mic-btn" data-act="openShop" type="button">열기</button>
            </div>

            <div class="dm-sec">${ICONS.block}차단한 사람</div>
            <div id="dm-block-list"></div>
            <div class="dm-sec">${ICONS.eyeoff}숨긴 친구</div>
            <div id="dm-hidden-list"></div>
          </div>
        </div>
        <div class="dm-view" data-view="callset" hidden>
          <div class="dm-head">
            <button class="dm-back" data-act="toSettings" aria-label="뒤로">${ICONS.back}</button>
            <span class="dm-title">통화</span>
            <span class="dm-head-sp"></span>
          </div>
          <div class="dm-list" id="dm-callset">
            <div class="dm-sec">${ICONS.phone}통화 기록</div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>대화에 통화 기록 남기기</b><i>육성톡·면상톡을 하면 대화방에 기록이 남아요(다시 걸기 편해요)</i></span>
              <button class="dm-toggle" data-pref="callLog" type="button"></button>
            </div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>통화 이력 지우기</b><i id="dm-calllog-sub">대화방에 남은 통화 기록을 모두 삭제해요</i></span>
              <button class="dm-mic-btn" data-act="clearCalls" type="button">초기화</button>
            </div>

            <div class="dm-sec">${ICONS.bell}벨소리</div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>전화 올 때 소리</b><i>고르면 바로 들려드려요 · 내 기기에만 적용돼요</i></span>
              <span class="dm-seg" data-pref-seg="ringTone">
                <button type="button" data-v="none">무음</button>
                <button type="button" data-v="ring">기본</button>
                <button type="button" data-v="pager">삐삐</button>
              </span>
            </div>

            <div class="dm-sec">${ICONS.lock}권한</div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>마이크 권한</b><i>미리 허용해두면 통화·음성 메시지에서 다시 묻지 않아요</i></span>
              <button class="dm-mic-btn" id="dm-set-mic" type="button">확인 중…</button>
            </div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>카메라 권한</b><i>면상톡(영상통화)에 필요해요</i></span>
              <button class="dm-mic-btn" id="dm-set-cam" type="button">확인 중…</button>
            </div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>마이크·카메라가 안 될 때</b><i>기기별로 권한 켜는 방법</i></span>
              <a class="dm-mic-btn" href="/help-permissions.html">도움말</a>
            </div>

            <div class="dm-sec">${ICONS.sliders || ICONS.chat}통화 중</div>
            <div class="dm-set-col">
              <span class="dm-set-mid"><b>상대 목소리 크기</b><i id="dm-vol-txt">폰 볼륨과 별개로 조절해요</i></span>
              <span class="dm-size-row"><em>🔈</em>
                <input type="range" id="dm-callvol" min="0" max="150" step="10">
                <em class="big">🔊</em></span>
            </div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>면상톡 저데이터</b><i>화질을 낮춰 데이터를 아끼고, 신호가 약할 때 더 안정적이에요</i></span>
              <button class="dm-toggle" data-pref="lowData" type="button"></button>
            </div>
          </div>
        </div>
        <div class="dm-view" data-view="etc" hidden>
          <div class="dm-head">
            <button class="dm-back" data-act="toSettings" aria-label="뒤로">${ICONS.back}</button>
            <span class="dm-title">기타</span>
            <span class="dm-head-sp"></span>
          </div>
          <div class="dm-list" id="dm-etc">
            <div class="dm-sec">${ICONS.more}편의 기능</div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>흔들어서 버그 신고</b><i>폰을 흔들면 신고 창이 열려요 — 이상한 화면을 바로 알려주세요</i></span>
              <button class="dm-toggle" data-pref="shake" type="button"></button>
            </div>

            <div class="dm-sec">${ICONS.chat}동영상</div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>자동 재생</b><i>피드·릴스의 영상을 알아서 재생할지</i></span>
              <span class="dm-seg" data-pref-seg="videoAuto">
                <button type="button" data-v="always">항상</button>
                <button type="button" data-v="wifi">Wi-Fi만</button>
                <button type="button" data-v="never">안 함</button>
              </span>
            </div>

            <div class="dm-sec">${ICONS.search}검색</div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>최근 검색어 저장</b><i>끄면 검색 기록을 남기지 않아요</i></span>
              <button class="dm-toggle" data-pref="searchHistory" type="button"></button>
            </div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>검색 기록 지우기</b><i id="dm-search-sub">지금까지 저장된 검색어를 지워요</i></span>
              <button class="dm-mic-btn" data-act="clearSearch" type="button">지우기</button>
            </div>
          </div>
        </div>
        <div class="dm-view" data-view="theme" hidden>
          <div class="dm-head">
            <button class="dm-back" data-act="toSettings" aria-label="뒤로">${ICONS.back}</button>
            <span class="dm-title">테마</span>
            <span class="dm-head-sp"></span>
          </div>
          <div class="dm-list" id="dm-theme">
            <div class="dm-prev"><div class="dm-prev-in">
              <div class="dm-bubble you">이 색이 갈라의 포인트가 돼요</div>
              <div class="dm-bubble me">내 말풍선은 이렇게 보여요</div>
            </div></div>
            <div class="dm-sec">${ICONS.sliders || ICONS.chat}포인트 색</div>
            <div class="dm-set-col">
              <span class="dm-set-mid"><i>버튼·내 말풍선·강조에 쓰이는 색이에요. 앱 전체에 바로 적용됩니다.</i></span>
              <span class="dm-theme-row" id="dm-accents"></span>
            </div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>이모티콘</b><i>기본 그림체·크기·최근 기록</i></span>
              <button class="dm-mic-btn" data-act="stickerSet" type="button">설정</button>
            </div>
            <div class="dm-set-note">
              🌙 갈라는 <b>밤에 보기 좋은 어두운 화면</b>을 기본으로 설계했어요(순흑 배경 + 인디고).
              밝은 화면(라이트 모드)은 색만 바꾸는 게 아니라 51개 화면을 다시 맞춰야 해서
              따로 준비 중입니다 — 지금은 포인트 색으로 취향을 맞춰주세요.
            </div>
          </div>
        </div>
        <div class="dm-view" data-view="stickerset" hidden>
          <div class="dm-head">
            <button class="dm-back" data-act="toSettings" aria-label="뒤로">${ICONS.back}</button>
            <span class="dm-title">이모티콘</span>
            <span class="dm-head-sp"></span>
          </div>
          <div class="dm-list" id="dm-stickerset">
            <div class="dm-sec">${ICONS.smile}기본 스타일</div>
            <div class="dm-set-col">
              <span class="dm-set-mid"><b>어떤 그림체를 좋아하세요?</b><i>같은 😀도 그림체마다 느낌이 달라요 — 고른 그림체로 먼저 열려요</i></span>
              <div class="dm-stk-pick" id="dm-stk-style-pick"></div>
            </div>
            <div class="dm-sec">${ICONS.chat}표시</div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>이모티콘 크기</b><i>대화에 붙는 이모티콘 크기</i></span>
              <span class="dm-seg" data-pref-seg="stkSize">
                <button type="button" data-v="s">작게</button>
                <button type="button" data-v="m">보통</button>
                <button type="button" data-v="l">크게</button>
              </span>
            </div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>최근 쓴 것 먼저</b><i>자주 쓰는 이모티콘을 피커 맨 앞에 모아둬요</i></span>
              <button class="dm-toggle" data-pref="stkRecent" type="button"></button>
            </div>
            <div class="dm-sec">${ICONS.more}정리</div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>최근 사용 기록</b><i id="dm-stk-recent-sub">불러오는 중…</i></span>
              <button class="dm-mic-btn" data-act="stkClear" type="button">비우기</button>
            </div>
            <div class="dm-set-note">
              🎨 갈라의 이모티콘은 <b>전부 무료 오픈 라이선스</b>예요(Noto·Twemoji·Fluent 등).
              구독 없이 다 쓰실 수 있고, 나만의 이모티콘은 상점에서 만들 수 있어요.
            </div>
          </div>
        </div>
        <div class="dm-view" data-view="display" hidden>
          <div class="dm-head">
            <button class="dm-back" data-act="toSettings" aria-label="뒤로">${ICONS.back}</button>
            <span class="dm-title">화면</span>
            <span class="dm-head-sp"></span>
          </div>
          <div class="dm-list" id="dm-display">
            <!-- 바꾸면 바로 보이는 미리보기 — 설명보다 눈이 빠르다 -->
            <div class="dm-prev" id="dm-prev">
              <div class="dm-prev-label">미리보기</div>
              <div class="dm-prev-in">
                <div class="dm-prev-head">대화 상대</div>
                <div class="dm-bubble you">우주 통신규약을 꿈꾸는 갈라</div>
                <div class="dm-bubble me">가나다라 ABC 123</div>
                <div class="dm-prev-bar">메시지 입력…</div>
              </div>
            </div>

            <div class="dm-sec">${ICONS.chat}글자 크기</div>
            <div class="dm-set-col">
              <span class="dm-size-row"><em>가</em>
                <input type="range" id="dm-fsize" min="80" max="150" step="5">
                <em class="big">가</em></span>
              <span class="dm-set-mid"><i id="dm-fsize-txt"></i></span>
            </div>

            <div class="dm-sec">${ICONS.edit}글씨체</div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>대화 글씨체</b><i>읽기 편한 쪽으로 골라주세요</i></span>
              <span class="dm-seg" data-pref-seg="fontFace">
                <button type="button" data-v="sys">기본</button>
                <button type="button" data-v="round">둥근</button>
                <button type="button" data-v="serif">명조</button>
              </span>
            </div>

            <div class="dm-sec">${ICONS.img || ICONS.chat}배경화면</div>
            <div class="dm-set-col">
              <span class="dm-set-mid"><b>색상 배경</b></span>
              <span class="dm-bg-row" id="dm-bg-colors"></span>
            </div>
            <div class="dm-set-col">
              <span class="dm-set-mid"><b>무늬 배경</b><i>직접 그린 무늬라 저작권 걱정이 없어요</i></span>
              <span class="dm-bg-row" id="dm-bg-patterns"></span>
            </div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>앨범에서 사진 선택</b><i>내 사진을 대화 배경으로</i></span>
              <button class="dm-mic-btn" data-act="bgPhoto" type="button">고르기</button>
              <input type="file" id="dm-bg-file" accept="image/*" hidden>
            </div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>배경 없애기</b><i>기본 검정 배경으로 되돌려요</i></span>
              <button class="dm-mic-btn" data-act="bgReset" type="button">초기화</button>
            </div>

            <div class="dm-sec">❄️ 배경 효과</div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>눈 내리는 채팅방</b><i>대화창에 눈이 내려요. 집중이 안 되면 꺼두세요</i></span>
              <button class="dm-toggle" data-pref="snow" type="button"></button>
            </div>

            <div class="dm-sec">${ICONS.sliders || ICONS.chat}화면 방향</div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>세로 고정</b><i id="dm-orient-sub">폰을 눕혀도 화면이 돌지 않아요</i></span>
              <button class="dm-toggle" id="dm-set-orient" type="button"></button>
            </div>
          </div>
        </div>
        <div class="dm-view" data-view="dataset" hidden>
          <div class="dm-head">
            <button class="dm-back" data-act="toSettings" aria-label="뒤로">${ICONS.back}</button>
            <span class="dm-title">데이터 및 저장공간</span>
            <span class="dm-head-sp"></span>
          </div>
          <div class="dm-list" id="dm-dataset">
            <div class="dm-sec">${ICONS.lock}저장공간 관리</div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>이 기기가 쓰는 공간</b><i id="dm-storage-sub">계산 중…</i></span>
              <span class="dm-set-val" id="dm-storage-val">…</span>
            </div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>임시 데이터 삭제</b><i>캐시된 이미지·화면 파일을 지워요. 대화는 지워지지 않아요</i></span>
              <button class="dm-mic-btn" data-act="clearCache" type="button">삭제</button>
            </div>

            <div class="dm-sec">${ICONS.img || ICONS.chat}미디어 전송 품질</div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>사진 화질</b><i>낮출수록 빨리 가고 데이터를 아껴요</i></span>
              <span class="dm-seg" data-pref-seg="photoQuality">
                <button type="button" data-v="save">절약</button>
                <button type="button" data-v="high">고화질</button>
                <button type="button" data-v="origin">원본</button>
              </span>
            </div>
            <div class="dm-set-note" id="dm-quality-note"></div>

            <div class="dm-sec">${ICONS.chat}미디어 자동 다운로드</div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>데이터 절약 모드</b><i>모바일 데이터일 땐 사진을 눌러야 불러와요 (Wi-Fi에선 평소대로)</i></span>
              <button class="dm-toggle" data-pref="dataSaver" type="button"></button>
            </div>
          </div>
        </div>
        <div class="dm-view" data-view="backup" hidden>
          <div class="dm-head">
            <button class="dm-back" data-act="toSettings" aria-label="뒤로">${ICONS.back}</button>
            <span class="dm-title">백업</span>
            <span class="dm-head-sp"></span>
          </div>
          <div class="dm-list" id="dm-backup">
            <div class="dm-backup-hero">
              <b>대화는 서버에 안전하게 있어요</b>
              <i>갈라는 대화를 계정에 저장해요. 폰을 바꾸거나 앱을 지웠다 깔아도 로그인만 하면 그대로 있습니다 — 따로 백업하지 않아도 돼요.</i>
            </div>
            <div class="dm-sec">${ICONS.chat}내 대화 내려받기</div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>대화 내보내기</b><i id="dm-export-sub">텍스트 파일로 저장 — 보관하거나 검색용으로 쓰세요</i></span>
              <button class="dm-mic-btn" data-act="exportChats" type="button">내보내기</button>
            </div>
            <div class="dm-set-note">
              ⚠️ <b>비밀대화</b>는 이 기기에서만 풀리는 자물쇠로 잠겨 있어요. 서버에도 암호문만 있어서 <b>백업·복원·내보내기 모두 안 됩니다</b> — 기기를 바꾸면 이전 비밀대화는 볼 수 없어요. 그게 비밀대화의 약속입니다.
            </div>
            <div class="dm-set-note">
              📟 삐삐 음성과 사진은 계정에 함께 보관돼요. 다만 <b>보낸 삐삐는 원래 다시 볼 수 없습니다</b>(그 시절 규칙이에요).
            </div>
          </div>
        </div>
        <div class="dm-view" data-view="chatset2" hidden>
          <div class="dm-head">
            <button class="dm-back" data-act="toSettings" aria-label="뒤로">${ICONS.back}</button>
            <span class="dm-title">채팅</span>
            <span class="dm-head-sp"></span>
          </div>
          <div class="dm-list" id="dm-chatset2">
            <div class="dm-sec">${ICONS.chat}채팅방</div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>메시지 입력 중 상태 보기</b><i>상대가 입력 중인 걸 보고, 내 상태도 알려줘요. 끄면 양쪽 다 안 보여요</i></span>
              <button class="dm-toggle" data-pref="typing" type="button"></button>
            </div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>내 난장 관리</b><i>내가 만들거나 들어간 오픈 채팅방</i></span>
              <button class="dm-mic-btn" data-act="goRooms" type="button">관리</button>
            </div>

            <div class="dm-sec">📟 삐삐</div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>내 삐삐 번호</b><i id="dm-set-pager-sub">확인 중…</i></span>
              <button class="dm-mic-btn" data-act="goPager" type="button">사서함</button>
            </div>

            <div class="dm-sec">${ICONS.chat}미디어</div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>동영상 자동재생</b><i>말풍선 속 영상을 자동으로 재생해요 (데이터 절약하려면 끄기)</i></span>
              <button class="dm-toggle" data-pref="autoplay" type="button"></button>
            </div>

            <div class="dm-sec">${ICONS.chat}말풍선</div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>밀어서 답장</b><i>말풍선을 오른쪽으로 살짝 밀면 답장이 걸려요</i></span>
              <button class="dm-toggle" data-pref="swipeReply" type="button"></button>
            </div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>두 번 탭해서 리액션</b><i>말풍선을 두 번 탭하면 ❤️ — 꾹 누르면 골라서 달 수 있어요</i></span>
              <button class="dm-toggle" data-pref="reactions" type="button"></button>
            </div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>글자 크기</b><i id="dm-chat-size-sub">대화 글씨 크기 — 화면 설정에서 조절해요</i></span>
              <button class="dm-mic-btn" data-act="displaySet" type="button">조절</button>
            </div>

            <div class="dm-sec">${ICONS.send}입력창</div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>엔터로 보내기</b><i>끄면 엔터는 줄바꿈, 보내기는 전송 버튼으로</i></span>
              <button class="dm-toggle" data-pref="enter" type="button"></button>
            </div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>간편녹음 버튼</b><i>입력창의 🎤 버튼 — 꾹 눌러 음성 메시지를 보내요</i></span>
              <button class="dm-toggle" data-pref="voiceBtn" type="button"></button>
            </div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>키보드 툴바</b><i>입력창 위에 사진·이모티콘·GIF·음성·삐삐 바로가기 줄을 띄워요</i></span>
              <button class="dm-toggle" data-pref="kbToolbar" type="button"></button>
            </div>
          </div>
        </div>
        <div class="dm-view" data-view="notiset" hidden>
          <div class="dm-head">
            <button class="dm-back" data-act="toSettings" aria-label="뒤로">${ICONS.back}</button>
            <span class="dm-title">알림</span>
            <span class="dm-head-sp"></span>
          </div>
          <div class="dm-list" id="dm-notiset">
            <div class="dm-set-warn" id="dm-noti-warn" hidden>
              <b>기기 설정의 갈라 알림이 꺼져 있어요</b>
              <i>새 메시지를 바로 확인하려면 알림을 켜 주세요.</i>
              <a class="dm-mic-btn" href="/help-permissions.html">설정하러 가기</a>
            </div>
            <div class="dm-sec">${ICONS.bell}기본</div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>푸시 알림</b><i>앱을 닫아도 기기 알림으로 받아요</i></span>
              <button class="dm-toggle" id="dm-set-push2" type="button"></button>
            </div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>알림음</b><i>소리를 고르면 바로 들려드려요</i></span>
              <span class="dm-seg" data-pref-seg="tone">
                <button type="button" data-v="none">무음</button>
                <button type="button" data-v="ding">딩동</button>
                <button type="button" data-v="pager">삐삐</button>
              </span>
            </div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>소리</b><i>알림음을 재생해요</i></span>
              <button class="dm-toggle" data-pref="sound" type="button"></button>
            </div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>진동</b><i>짧게 울려요</i></span>
              <button class="dm-toggle" data-pref="vibrate" type="button"></button>
            </div>

            <div class="dm-sec">${ICONS.chat}표시 방식</div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>내용 미리보기</b><i>끄면 "새 메시지"만 뜨고 본문은 감춰요</i></span>
              <button class="dm-toggle" data-pref="preview" type="button"></button>
            </div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>사진·이모티콘 미리보기</b><i>이미지 알림에 썸네일을 함께 보여줘요</i></span>
              <button class="dm-toggle" data-pref="mediaPreview" type="button"></button>
            </div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>앱 실행 중 알림</b><i>갈라를 보고 있을 때도 알림을 띄워요</i></span>
              <button class="dm-toggle" data-pref="foreground" type="button"></button>
            </div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>안 읽은 알림 배너</b><i>앱에 들어왔을 때 쌓인 메시지·삐삐를 상단에 알려요</i></span>
              <button class="dm-toggle" data-pref="banner" type="button"></button>
            </div>

            <div class="dm-sec">${ICONS.search}키워드 알림</div>
            <div class="dm-set-col">
              <span class="dm-set-mid"><b>이 단어가 오면 꼭 알려주세요</b><i>쉼표로 여러 개 — 집중 시간에도 이 알림만은 울려요</i></span>
              <input class="dm-set-input" id="dm-kw" placeholder="예: 회의, 급해, 내이름" maxlength="120">
            </div>

            <div class="dm-sec">${ICONS.lock}집중 시간</div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>방해받지 않기</b><i>이 시간엔 소리·진동·배너를 모두 끕니다</i></span>
              <button class="dm-toggle" data-pref="dndOn" type="button"></button>
            </div>
            <div class="dm-set-row" id="dm-dnd-range">
              <span class="dm-set-mid"><b>시간대</b><i>자정을 넘겨도 괜찮아요</i></span>
              <span class="dm-time-row">
                <input type="time" class="dm-set-time" id="dm-dnd-from">
                <em>~</em>
                <input type="time" class="dm-set-time" id="dm-dnd-to">
              </span>
            </div>
          </div>
        </div>
        <div class="dm-view" data-view="settings" hidden>
          <div class="dm-head">
            <button class="dm-back" data-act="toInbox" aria-label="뒤로">${ICONS.back}</button>
            <span class="dm-title">메시지 설정</span>
            <span class="dm-head-sp"></span>
          </div>
          <div class="dm-list" id="dm-settings">
            <!-- 내 정보 -->
            <div class="dm-set-me" id="dm-set-me">
              <span class="dm-set-me-ava" id="dm-set-ava"></span>
              <span class="dm-set-me-tx"><b id="dm-set-nick">…</b><i id="dm-set-sub">불러오는 중</i></span>
              <a class="dm-set-manage" href="/account-edit.html">관리</a>
            </div>

            <!-- 카테고리만 남긴다. 세부는 각 화면에서 —
                 한 화면에 다 늘어놓으면 '설정이 많다'가 아니라 '못 찾겠다'가 된다 -->
            <div class="dm-cat" data-act="notiSet">
              <span class="dm-cat-ic">${ICONS.bell}</span>
              <span class="dm-cat-tx"><b>알림</b><i>푸시 · 알림음 · 미리보기 · 키워드 · 집중 시간</i></span>
              <span class="dm-cat-go">${ICONS.chev || '›'}</span>
            </div>
            <div class="dm-cat" data-act="chatSet2">
              <span class="dm-cat-ic">${ICONS.chat}</span>
              <span class="dm-cat-tx"><b>채팅</b><i>입력 중 표시 · 밀어서 답장 · 리액션 · 삐삐</i></span>
              <span class="dm-cat-go">${ICONS.chev || '›'}</span>
            </div>
            <div class="dm-cat" data-act="displaySet">
              <span class="dm-cat-ic">${ICONS.sliders}</span>
              <span class="dm-cat-tx"><b>화면</b><i>글자 크기 · 글씨체 · 배경화면 · 화면 방향</i></span>
              <span class="dm-cat-go">${ICONS.chev || '›'}</span>
            </div>
            <div class="dm-cat" data-act="themeSet">
              <span class="dm-cat-ic">${ICONS.smile}</span>
              <span class="dm-cat-tx"><b>테마 · 이모티콘</b><i>포인트 색 · 기본 그림체 · 크기</i></span>
              <span class="dm-cat-go">${ICONS.chev || '›'}</span>
            </div>
            <div class="dm-cat" data-act="callSet">
              <span class="dm-cat-ic">${ICONS.phone}</span>
              <span class="dm-cat-tx"><b>통화</b><i>벨소리 · 음량 · 저데이터 · 마이크/카메라 권한</i></span>
              <span class="dm-cat-go">${ICONS.chev || '›'}</span>
            </div>
            <div class="dm-cat" data-act="privacySet">
              <span class="dm-cat-ic">${ICONS.lock}</span>
              <span class="dm-cat-tx"><b>개인 · 보안</b><i>검색 허용 · 화면 잠금 · 차단 · 숨김</i></span>
              <span class="dm-cat-go">${ICONS.chev || '›'}</span>
            </div>
            <div class="dm-cat" data-act="dataSet">
              <span class="dm-cat-ic">${ICONS.image || ICONS.chat}</span>
              <span class="dm-cat-tx"><b>데이터 · 저장공간</b><i>사용 공간 · 사진 화질 · 데이터 절약</i></span>
              <span class="dm-cat-go">${ICONS.chev || '›'}</span>
            </div>
            <div class="dm-cat" data-act="backupSet">
              <span class="dm-cat-ic">${ICONS.eyeoff || ICONS.chat}</span>
              <span class="dm-cat-tx"><b>백업</b><i>대화 보관 안내 · 내보내기</i></span>
              <span class="dm-cat-go">${ICONS.chev || '›'}</span>
            </div>
            <div class="dm-cat" data-act="etcSet">
              <span class="dm-cat-ic">${ICONS.more}</span>
              <span class="dm-cat-tx"><b>기타</b><i>흔들어 신고 · 동영상 자동재생 · 검색 기록</i></span>
              <span class="dm-cat-go">${ICONS.chev || '›'}</span>
            </div>
            <div class="dm-cat" data-act="bugReport">
              <span class="dm-cat-ic">🐞</span>
              <span class="dm-cat-tx"><b>버그 신고</b><i>안 되는 게 있으면 알려주세요</i></span>
              <span class="dm-cat-go">${ICONS.chev || '›'}</span>
            </div>
            <div class="dm-set-ver" id="dm-set-ver"></div>
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
            <span class="dm-head-btns">
              <button class="dm-gear" data-act="voicecall" aria-label="육성톡">${ICONS.phone}</button>
              <button class="dm-gear" data-act="videocall" aria-label="면상톡">${ICONS.cam}</button>
              <button class="dm-gear" data-act="chatset" aria-label="대화 설정">${ICONS.menu}</button>
            </span>
          </div>
          <div class="dm-msgs" id="dm-msgs"></div>
          <div class="dm-reply-strip" id="dm-reply-strip" hidden>
            <span class="dm-reply-info"><b>답장</b> <span id="dm-reply-preview"></span></span>
            <button type="button" class="dm-reply-x" id="dm-reply-x"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          </div>
          <div class="dm-ptt" id="dm-ptt" hidden>
            <div class="dm-ptt-slot">
              <span class="dm-ptt-lock" id="dm-ptt-lock">${ICONS.lock}<i>잠금</i></span>
              <span class="dm-ptt-cancel" id="dm-ptt-cancel">${ICONS.x}<i>취소</i></span>
            </div>
            <div class="dm-ptt-panel">
              <span class="dm-ptt-dot"></span>
              <span class="dm-ptt-time" id="dm-rec-time">0:00</span>
              <span class="dm-ptt-wave" id="dm-ptt-wave"></span>
              <span class="dm-ptt-hint" id="dm-ptt-hint">손을 떼면 전송 · 위로 밀어 취소</span>
            </div>
          </div>
          <div class="dm-stk" id="dm-stk" hidden>
            <div class="dm-stk-top">
              <input id="dm-stk-q" placeholder="이모티콘 검색… (웃음, 하트, 빡침…)" autocomplete="off">
              <div class="dm-stk-tabs">
                <button type="button" class="on" data-sk="emoji">이모지</button>
                <button type="button" data-sk="sticker">스티커</button>
                <button type="button" data-sk="mine">내 것</button>
                <button type="button" data-sk="mix">믹스</button>
                <button type="button" data-sk="gifs">GIF</button>
              </div>
            </div>
            <div class="dm-stk-styles" id="dm-stk-styles"></div>
            <div class="dm-stk-cats" id="dm-stk-cats"></div>
            <div class="dm-mk" id="dm-mk" hidden>
              <div class="dm-mk-presets" id="dm-mk-presets"></div>
              <div class="dm-mk-row">
                <input id="dm-mk-q" maxlength="80" placeholder="어떤 이모티콘? (예: 커피 들고 조는 고양이)" autocomplete="off">
                <button type="button" id="dm-mk-go">만들기</button>
              </div>
              <div class="dm-mk-hint" id="dm-mk-hint"></div>
            </div>
            <div class="dm-stk-grid" id="dm-stk-grid"><div class="dm-loading">불러오는 중…</div></div>
            <div class="dm-stk-credit" id="dm-stk-credit">움직이는 스티커 · Noto Emoji by Google (CC BY 4.0)</div>
          </div>
          <div class="dm-kbtool" id="dm-kbtool" hidden>
            <button type="button" data-kb="photo">🖼 사진</button>
            <button type="button" data-kb="emoji">😀 이모티콘</button>
            <button type="button" data-kb="gif">GIF</button>
            <button type="button" data-kb="voice">🎤 음성</button>
            <button type="button" data-kb="pager">📟 삐삐</button>
          </div>
          <form class="dm-inputbar" id="dm-form">
            <button type="button" class="dm-attach" id="dm-attach" aria-label="사진 보내기">${ICONS.plus}</button>
            <input type="file" id="dm-file" accept="image/*" hidden>
            <textarea id="dm-input" rows="1" placeholder="메시지 입력…"></textarea>
            <button type="button" class="dm-ib" id="dm-voice" aria-label="음성 메시지">${ICONS.mic}</button>
            <button type="button" class="dm-ib" id="dm-sticker" aria-label="이모티콘">${ICONS.smile}</button>
            <button type="submit" class="dm-send" aria-label="전송">${ICONS.send}</button>
          </form>
        </div>
        <div class="dm-view" data-view="room" hidden>
          <div class="dm-head">
            <button class="dm-back" data-act="roomToList" aria-label="뒤로">${ICONS.back}</button>
            <span class="dm-peer-wrap">
              <span class="dm-peer-col">
                <span class="dm-title" id="dm-room-name">난장</span>
                <span class="dm-peer-sub" id="dm-room-sub"></span>
              </span>
            </span>
            <button class="dm-gear" data-act="roomMenu" aria-label="난장 메뉴">${ICONS.menu}</button>
          </div>
          <div class="dm-msgs" id="dm-room-msgs"></div>
          <div class="dm-room-gate" id="dm-room-gate" hidden></div>
          <form class="dm-inputbar" id="dm-room-send">
            <textarea id="dm-room-input" rows="1" placeholder="메시지 입력…"></textarea>
            <button type="submit" class="dm-send" aria-label="전송">${ICONS.send}</button>
          </form>
        </div>
        <div class="dm-view" data-view="gnew" hidden>
          <div class="dm-head">
            <button class="dm-back" data-act="gnewBack" aria-label="뒤로">${ICONS.back}</button>
            <span class="dm-title" id="dm-gnew-headtitle">단체 채팅</span>
            <span class="dm-head-sp"></span>
          </div>
          <div class="dm-list" id="dm-gnew">
            <div class="dm-gnew-titlewrap">
              <input id="dm-gnew-title" maxlength="30" placeholder="방 이름 (비우면 멤버 이름으로)" autocomplete="off">
            </div>
            <div class="dm-sec">친구 선택 <span class="dm-sec-sub" id="dm-gnew-cnt"></span></div>
            <div id="dm-gnew-list"></div>
            <div class="dm-gnew-gowrap">
              <button id="dm-gnew-go" type="button" disabled>${ICONS.crew} 만들기</button>
            </div>
          </div>
        </div>
        <div class="dm-view" data-view="roommem" hidden>
          <div class="dm-head">
            <button class="dm-back" data-act="toRoom" aria-label="뒤로">${ICONS.back}</button>
            <span class="dm-title">멤버</span>
            <span class="dm-head-sp"></span>
          </div>
          <div class="dm-list" id="dm-roommem"></div>
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
          <button class="dm-gnew-entry" data-act="gnew" type="button">${ICONS.crew} 단체 채팅 만들기</button>
          <div class="dm-list" id="dm-results"></div>
        </div>
      </div>
      <div class="dm-menu" id="dm-menu" hidden></div>`;
    (PAGE_MODE() && document.getElementById('dm-page-host') || document.body).appendChild(ROOT);

    ROOT.querySelector('.dm-dim').addEventListener('click', closeDM);
    ROOT.addEventListener('click', async e => {
      const cb = e.target.closest('.dm-callback');
      if (cb) { window.GALLA_call?.start(cb.dataset.peer, nickCache[cb.dataset.peer], cb.dataset.video === '1'); return; }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'close') closeDM();
      else if (act === 'compose') showView('compose'), initSearch();
      else if (act === 'settings') { headMenu(e.target.closest('[data-act]')); }
      else if (act === 'addFriend') { showView('add'); initAdd(); }
      else if (act === 'toFriends') { goBack('friends'); }
      else if (act === 'chatset') { openChatSet(); }
      else if (act === 'toThread') { if (DEPTH > 0) history.back(); else showView('thread'); }
      else if (act === 'toInbox') { goBack(); }
      else if (act === 'newRoom') { roomFormShow(true); }
      else if (act === 'roomToList') { goBack('rooms'); }
      else if (act === 'roomMenu') { roomMenu(e.target.closest('[data-act]')); }
      else if (act === 'gnew') { showView('gnew'); initGnew('create'); }
      else if (act === 'gnewBack') {
        if (DEPTH > 0) history.back();
        else if (GMODE === 'invite') showView('room');
        else { showView('compose'); initSearch(); }
      }
      else if (act === 'toRoom') { if (DEPTH > 0) history.back(); else showView('room'); }
      else if (act === 'goPager') { backToInbox('pager'); }
      else if (act === 'notiSet') { showView('notiset'); loadNotiSet(); }
      else if (act === 'chatSet2') { showView('chatset2'); loadChatSet2(); }
      else if (act === 'displaySet') { showView('display'); loadDisplay(); }
      else if (act === 'themeSet') { showView('theme'); loadTheme(); applyDisplay(); }
      else if (act === 'callSet') { showView('callset'); loadCallSet(); }
      else if (act === 'privacySet') { showView('privacy'); loadPrivacy(); }
      else if (act === 'openShop') {
        /* 상점은 items.js가 띄운다.
           ⚠️ 스크립트만 불러오면 열리긴 하는데 items.css가 없어 모든 요소가
           position:static으로 깔려 화면 흐름에 파묻힌다 — '안 열린다'로 보였다.
           스타일을 먼저 붙이고 연다. */
        const v = ([...document.scripts].map(x => x.src).find(u => /[?&]v=/.test(u)) || '').match(/[?&]v=(\d+)/);
        const ver = v ? '?v=' + v[1] : '';
        if (!document.querySelector('link[href*="items.css"]')) {
          await new Promise(res => {
            const l = document.createElement('link');
            l.rel = 'stylesheet'; l.href = '/css/items.css' + ver;
            l.onload = l.onerror = res; document.head.appendChild(l);
          });
        }
        if (!window.openShop) {
          await new Promise(res => { const sc = document.createElement('script'); sc.src = '/js/items.js' + ver; sc.onload = sc.onerror = res; document.head.appendChild(sc); });
        }
        if (window.openShop) window.openShop();
        else toastMini('상점을 여는 데 실패했어요 — 잠시 후 다시 시도해주세요');
      }
      else if (act === 'etcSet') { showView('etc'); loadEtc(); }
      else if (act === 'clearCalls') { await clearCalls(e.target.closest('[data-act]')); }
      else if (act === 'clearSearch') {
        try { localStorage.removeItem('galla_recent_searches'); } catch (_) {}
        toastMini('검색 기록을 지웠어요'); loadEtc();
      }
      else if (act === 'stickerSet') { showView('stickerset'); loadStickerSet(); }
      else if (act === 'stkClear') {
        try { localStorage.removeItem(STK_RECENT_KEY); } catch (_) {}
        toastMini('최근 사용 기록을 비웠어요'); loadStickerSet();
      }
      else if (act === 'bgPhoto') { ROOT.querySelector('#dm-bg-file')?.click(); }
      else if (act === 'bgReset') { UI.bgKind = 'none'; UI.bgValue = ''; savePrefs(); applyDisplay(); loadDisplay(); toastMini('기본 배경으로 되돌렸어요'); }
      else if (act === 'dataSet') { showView('dataset'); loadDataSet(); }
      else if (act === 'backupSet') { showView('backup'); }
      else if (act === 'clearCache') { await clearCaches(e.target.closest('[data-act]')); }
      else if (act === 'exportChats') { await exportChats(e.target.closest('[data-act]')); }
      else if (act === 'goRooms') { backToInbox('rooms'); }
      else if (act === 'toSettings') { goBack(); }
      else if (act === 'bugReport') {
        if (!window.GALLA_openBugReport) {
          const v = ([...document.scripts].map(x => x.src).find(u => /[?&]v=/.test(u)) || '').match(/[?&]v=(\d+)/);
          await new Promise(res => { const sc = document.createElement('script'); sc.src = '/js/bug-report.js' + (v ? '?v=' + v[1] : ''); sc.onload = sc.onerror = res; document.head.appendChild(sc); });
        }
        window.GALLA_openBugReport?.(location.href);
      }
      else if (act === 'voicecall' || act === 'videocall') {
        if (!window.GALLA_call?.supported()) toastMini('이 브라우저에선 통화를 지원하지 않아요');
        else window.GALLA_call.start(curPeer, nickCache[curPeer] || PROFILES[curPeer]?.nickname, act === 'videocall');
      }
      const tab = e.target.closest('.dm-tab')?.dataset.tab;
      if (tab === 'set') { showView('settings'); loadSettings(); }
      else if (tab) setTab(tab);
    });
    ROOT.querySelector('#dm-friend-q').addEventListener('input', e => filterFriends(e.target.value));
    // 친구·채팅 행 길게 누르기 → 관리 메뉴 (말풍선 메뉴와 같은 문법)
    bindLongPress(ROOT.querySelector('#dm-friend-list'), '.dm-friend', friendMenu);
    bindLongPress(ROOT.querySelector('#dm-inbox'), '.dm-thread', threadMenu);
    // ⬇️ 당겨서 새로고침 — PWA 전체화면엔 브라우저 기본 당김이 없다
    bindPullRefresh(ROOT.querySelector('#dm-inbox-wrap'), async () => { PREF.loaded = false; await loadInbox(); refreshBadge(); });
    bindPullRefresh(ROOT.querySelector('#dm-friends'), async () => { PREF.loaded = false; FRIENDS = []; await loadFriends(); });
    ROOT.querySelector('#dm-form').addEventListener('submit', onSend);
    ROOT.querySelector('#dm-room-form').addEventListener('submit', onCreateRoom);
    ROOT.querySelector('#dm-room-cancel').addEventListener('click', () => roomFormShow(false));
    ROOT.querySelector('#dm-room-send').addEventListener('submit', onRoomSend);
    const rta = ROOT.querySelector('#dm-room-input');
    rta.addEventListener('input', () => { rta.style.height = 'auto'; rta.style.height = Math.min(rta.scrollHeight, 120) + 'px'; });
    rta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onRoomSend(e); } });
    bindPullRefresh(ROOT.querySelector('#dm-rooms'), loadRooms);
    bindPullRefresh(ROOT.querySelector('#dm-pager'), async () => { await window.GALLA_PAGER?.refresh(ROOT.querySelector('#dm-pager')); });
    // 삐삐 미확인 수 → 탭 점. 삐삐 화면을 안 봐도 '왔다'는 걸 안다
    document.addEventListener('galla:pager-unread', e => paintPagerDot(e.detail));
    ROOT.querySelector('#dm-gnew-go').addEventListener('click', createGroup);
    ROOT.querySelector('#dm-reply-x').addEventListener('click', clearReply);
    ROOT.querySelector('#dm-attach').addEventListener('click', () => ROOT.querySelector('#dm-file').click());
    bindPTT(ROOT.querySelector('#dm-voice'));
    ROOT.querySelector('#dm-sticker').addEventListener('click', toggleStk);
    ROOT.querySelector('#dm-stk-q').addEventListener('input', () => {
      clearTimeout(stkTimer);
      stkTimer = setTimeout(() => paintStk(), STK_KIND === 'gifs' ? 350 : 120);   // 로컬 검색은 즉각
    });
    ROOT.querySelectorAll('.dm-stk-tabs button').forEach(b => b.addEventListener('click', () => {
      ROOT.querySelectorAll('.dm-stk-tabs button').forEach(x => x.classList.toggle('on', x === b));
      STK_KIND = b.dataset.sk; paintStk();
    }));
    ROOT.querySelector('#dm-stk-styles').addEventListener('click', async e => {
      const tf = e.target.closest('[data-tf]');
      if (tf) {
        const on = tf.dataset.tf === '1';
        if (on && !TOSSFACE) toastMini('토스페이스를 처음 켜면 12MB를 받아요 — 한 번만 받으면 계속 써요');
        TOSSFACE = on;
        try { localStorage.setItem(TF_KEY, on ? '1' : '0'); } catch (_) {}
        applyTossface(); paintStk();
        return;
      }
      const b = e.target.closest('[data-si]'); if (!b) return;
      STK_STYLE = b.dataset.si;
      try { localStorage.setItem('galla_stk_style', STK_STYLE); } catch (_) {}
      // 입체(Fluent)는 이름 매핑표가 있어야 URL이 나온다
      const st = window.GALLA_STK?.styles.find(x => x.id === STK_STYLE);
      if (st?.needsMap && !window[st.needsMap]) { try { await loadScript('/js/dm-fluent.js'); } catch (_) {} }
      paintStk();
    });
    // 이미지 로드 실패 → 다음 스타일 URL로 (capture: error는 버블하지 않는다)
    ROOT.querySelector('#dm-stk-grid').addEventListener('error', e => {
      const img = e.target;
      if (!img.dataset || img.dataset.src !== 'stk') return;
      let rest = [];
      try { rest = JSON.parse(img.dataset.alt || '[]'); } catch (_) {}
      if (!rest.length) { img.style.display = 'none'; return; }
      const next = rest.shift();
      img.dataset.alt = JSON.stringify(rest);
      img.src = next; img.dataset.full = next;
    }, true);
    ROOT.querySelector('#dm-mk').addEventListener('click', e => {
      const pre = e.target.closest('[data-mk]');
      if (pre) { const p = MK_PRESETS[+pre.dataset.mk]; ROOT.querySelector('#dm-mk-q').value = p.p; makeSticker(p.p); return; }
      if (e.target.closest('#dm-mk-go')) makeSticker(ROOT.querySelector('#dm-mk-q').value);
    });
    ROOT.querySelector('#dm-mk-q').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); makeSticker(e.target.value); }
    });
    // 내가 만든 것 길게 누르기 → 삭제
    bindLongPress(ROOT.querySelector('#dm-stk-grid'), 'img[data-src="mine"]', (el, x, y) => {
      popMenu(x, y, [{ k: 'del', label: '삭제', danger: true }], async () => {
        await supabase.from('my_stickers').delete().eq('id', el.dataset.id);
        paintMine();
      });
    });
    ROOT.querySelector('#dm-stk-cats').addEventListener('click', e => {
      const mb = e.target.closest('[data-mb]');
      if (mb) { MIX_BASE = mb.dataset.mb; paintMix(); return; }
      const b = e.target.closest('[data-ci]'); if (!b) return;
      STK_CAT = +b.dataset.ci;
      ROOT.querySelector('#dm-stk-q').value = '';
      paintStk();
    });
    ROOT.querySelector('#dm-stk-grid').addEventListener('click', e => {
      // 이모지: 입력창에 삽입(인스타 문법 — 글과 섞어 쓴다)
      const emo = e.target.closest('.dm-emo');
      if (emo) {
        const ta = ROOT.querySelector('#dm-input');
        const at = ta.selectionStart ?? ta.value.length;
        ta.value = ta.value.slice(0, at) + emo.dataset.ch + ta.value.slice(ta.selectionEnd ?? at);
        ta.focus(); ta.selectionStart = ta.selectionEnd = at + emo.dataset.ch.length;
        return;
      }
      // 스티커·GIF: 바로 전송
      const img = e.target.closest('img[data-full]');
      if (!img || !curThread) return;
      if (secretOn(curThread)) return toastMini('비밀대화에선 텍스트만 보낼 수 있어요 (암호화 보장)');
      const src = img.dataset.src;
      const isGif = src === 'giphy';
      sendMessage({ kind: 'gif', body: isGif ? '🎬 GIF' : '🎬 이모티콘',
                    meta: { url: img.dataset.full, sticker: !isGif,
                            src: isGif ? 'giphy' : src === 'mix' ? 'kitchen' : src === 'mine' ? 'ai' : STK_STYLE } });
    });
    // 음성 재생 — 한 번에 하나만
    // 키보드 툴바 — 새 기능을 또 만들지 않고 이미 있는 버튼을 눌러준다
    ROOT.querySelector('#dm-kbtool')?.addEventListener('click', e => {
      const k = e.target.closest('[data-kb]')?.dataset.kb;
      if (!k) return;
      if (k === 'photo') ROOT.querySelector('#dm-attach')?.click();
      else if (k === 'emoji' || k === 'gif') ROOT.querySelector('#dm-sticker')?.click();
      else if (k === 'voice') toastMini('🎤 버튼을 꾹 누르면 음성이 녹음돼요');
      else if (k === 'pager') pagerLeave(curPeer, nickCache[curPeer]);
    });
    // 폴더 칩
    ROOT.querySelector('#dm-folders')?.addEventListener('click', e => {
      const b = e.target.closest('[data-f]');
      if (!b) return;
      CUR_FOLDER = b.dataset.f;
      paintFolderBar();
      loadInbox();
    });
    bindSwipeReply(ROOT.querySelector('#dm-msgs'));
    bindReact(ROOT.querySelector('#dm-msgs'));
    applyChatPrefs();
    applyDisplay();
    ROOT.querySelector('#dm-msgs').addEventListener('click', e => {
      const b = e.target.closest('.dm-vplay'); if (!b) return;
      if (VAUDIO && !VAUDIO.paused && VAUDIO._btn === b) { VAUDIO.pause(); return; }
      if (VAUDIO) { VAUDIO.pause(); VAUDIO._btn && (VAUDIO._btn.innerHTML = ICONS.play); }
      // iOS는 webm 재생 불가 — 다 받고 실패하는 대신 바로 알린다
      if (IS_IOS && /\.webm(\?|$)/i.test(b.dataset.url)) {
        VAUDIO = null;
        return toastMini('이 음성은 옛 형식이라 아이폰에서 재생할 수 없어요 — 새 음성부터는 정상이에요');
      }
      VAUDIO = new Audio(); VAUDIO._btn = b;
      /* 길이 정보가 없는 webm은 스트리밍(범위 요청)으로 재생하면 소리가 안 나는
         기기가 있다 — 통째로 받아 blob으로 틀면 안정적이다. 실패하면 원래 URL로. */
      /* mp4 등은 바로 스트리밍해 즉시 재생한다. 통째로 받아오면 그만큼 기다려야 해
         '로딩이 길다'고 느껴진다 — 길이 정보가 없는 옛 webm에만 blob을 쓴다. */
      (async () => {
        VAUDIO.preload = 'auto';
        if (/\.webm(\?|$)/i.test(b.dataset.url)) {
          try {
            const res = await fetch(b.dataset.url);
            if (!res.ok) throw new Error(res.status);
            VAUDIO._obj = URL.createObjectURL(await res.blob());
            VAUDIO.src = VAUDIO._obj;
          } catch (_) { VAUDIO.src = b.dataset.url; }
        } else {
          VAUDIO.src = b.dataset.url;
        }
        VAUDIO.play().catch(() => { b.innerHTML = ICONS.play; toastMini('재생하지 못했어요'); });
      })();
      b.innerHTML = ICONS.pause;
      VAUDIO.onpause = () => { b.innerHTML = ICONS.play; };
      VAUDIO.onerror = () => { b.innerHTML = ICONS.play; toastMini('재생하지 못했어요'); };
      VAUDIO.onended = () => {
        b.innerHTML = ICONS.play;
        // 다음 음성 말풍선이 있으면 이어서 — 손 안 대고 죽 듣는다
        const all = [...ROOT.querySelectorAll('#dm-msgs .dm-vplay')];
        const next = all[all.indexOf(b) + 1];
        if (next) setTimeout(() => next.click(), 350);
      };
    });
    ROOT.querySelector('#dm-file').addEventListener('change', onPickImage);

    const ta = ROOT.querySelector('#dm-input');
    ta.addEventListener('input', () => {
      ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
      sendTyping();
    });
    ta.addEventListener('keydown', e => {
      // 설정 [엔터로 보내기]가 꺼져 있으면 엔터는 줄바꿈으로 둔다
      if (e.key === 'Enter' && !e.shiftKey && UI.enter) { e.preventDefault(); onSend(e); }
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
    // 브라우저·제스처 뒤로가기 → 직전 DM 뷰로
    window.addEventListener('popstate', e => {
      if (!PAGE_MODE() || !ROOT) return;
      const target = e.state?.dmv || 'inbox';
      DEPTH = e.state?.d || 0;
      if (target === CUR_VIEW) return;
      POPPING = true;
      leaveView(CUR_VIEW);
      showView(target);
      if (target === 'inbox') { loadInbox(); applyPendingTab(); }
      POPPING = false;
    });
    // 상세에서 오른쪽으로 밀면 뒤로(전 기기 동일 동작 — 엣지 스와이프가 없는 기기 대비)
    bindDetailSwipeBack();
    document.addEventListener('click', e => {
      const menu = document.getElementById('dm-menu');
      // ⚠️ 여는 버튼(⚙)은 제외 — 여는 클릭이 document까지 버블돼 같은 틱에 도로 닫아버렸다
      //   ("설정 버튼이 작동 안 한다"의 정체. 길게 누르기 메뉴는 click으로 안 열려 무사했다)
      if (menu && !menu.hidden && !e.target.closest('#dm-menu, [data-act="settings"], [data-act="roomMenu"]')) menu.hidden = true;
    });
    return ROOT;
  }

  /* DM 상세는 '페이지 안의 페이지'다. 브라우저 뒤로가기/오른쪽 스와이프가 dm.html을
     통째로 떠나 제각각인 곳으로 가지 않도록, 상세로 들어갈 때 히스토리를 쌓는다.
     → 뒤로가기 = 직전 뷰. 화면의 뒤로 버튼도 같은 경로(history.back)를 쓴다. */
  let CUR_VIEW = 'inbox', POPPING = false, DEPTH = 0;
  function leaveView(name) {
    if (name === 'thread') { detachThread(); curThread = curPeer = null; clearReply(); }
    else if (name === 'room') { detachRoom(); curRoom = null; }
  }
  /* 뒤로 = 직전 뷰. 우리가 쌓은 히스토리가 있으면 그걸 쓰고, 없으면 목록으로. */
  function goBack(fallbackTab) {
    if (DEPTH > 0) { history.back(); return; }
    leaveView(CUR_VIEW);
    showView('inbox');
    if (fallbackTab) setTab(fallbackTab); else loadInbox();
  }
  let PENDING_TAB = null;
  /* 설정 안쪽에서 '목록의 어떤 탭'으로 가고 싶을 때 —
     showView('inbox')는 쌓인 히스토리를 되감으므로(비동기) 그 직후에 탭을 바꾸면
     popstate 렌더에 덮인다. 그래서 탭을 예약해두고 렌더가 끝난 뒤 적용한다. */
  function backToInbox(tab) {
    PENDING_TAB = tab || null;
    if (CUR_VIEW === 'inbox') { applyPendingTab(); return; }
    showView('inbox');
  }
  function applyPendingTab() {
    if (!PENDING_TAB) return;
    const t = PENDING_TAB; PENDING_TAB = null;
    setTab(t);
  }
  function showView(name) {
    if (PAGE_MODE() && !POPPING && name !== CUR_VIEW) {
      if (name !== 'inbox') {
        history.pushState({ dmv: name, d: ++DEPTH }, '');
      } else if (DEPTH > 0) {
        // 목록 복귀는 쌓아둔 항목을 되감아 소비한다 → 렌더는 popstate가 맡는다.
        // (되감기가 불발되는 환경 대비 안전망)
        const n = DEPTH;
        setTimeout(() => { if (DEPTH === n && CUR_VIEW !== 'inbox') { DEPTH = 0; showView('inbox'); applyPendingTab(); } }, 400);
        history.go(-n);
        return;
      }
    }
    CUR_VIEW = name;
    ROOT.querySelectorAll('.dm-view').forEach(v => { v.hidden = v.dataset.view !== name; });
    // 페이지 모드 크롬 규칙:
    // · 페이지 헤더(GALLA)는 메인(목록)에서만 — 상세(대화방·프로필…)는 자체 헤드가 유일한 헤더
    // · 네비는 입력바와 물리적으로 겹치는 '대화방'에서만 숨김 — 프로필·설정 등은 유지
    if (PAGE_MODE()) {
      document.body.classList.toggle('dm-detail', name !== 'inbox');
      document.body.classList.toggle('dm-immersive', name === 'thread' || name === 'room');
      // 직전 뷰의 스크롤이 만든 헤더 숨김·네비 축소가 눌러붙지 않게 전환마다 리셋
      window.GALLA_navReset?.();
    }
  }
  /* 상세 뷰에서 오른쪽으로 밀면 뒤로 — 뒤로 버튼과 완전히 같은 동작.
     가로 스크롤 영역(이모티콘 시트·암호책 등)과 통화·모달 위에선 무시한다. */
  function bindDetailSwipeBack() {
    let sx = 0, sy = 0, armed = false;
    const NO_SWIPE = '.dm-stk-grid, .dm-stk-cats, .dm-stk-styles, .dm-mk-presets, .pgr-book-scroll, .dm-msgs img, input, textarea';
    ROOT.addEventListener('touchstart', e => {
      armed = false;
      if (e.touches.length !== 1) return;
      if (!document.body.classList.contains('dm-detail')) return;
      if (document.querySelector('#pager-call.on, #pager-book.on, #dm-call.on, #pager-guide.on')) return;
      if (e.target.closest(NO_SWIPE)) return;
      /* ⚠️ 화면 왼쪽 가장자리는 브라우저의 '뒤로가기 제스처' 구역이다.
         여기서 우리가 또 뒤로가기를 하면 두 단계 물러나 엉뚱한 화면으로 나간다
         (설정 상세에서 밀었더니 설정이 아니라 DM 목록으로 빠지던 원인).
         가장자리는 브라우저에 맡기고, 우리는 안쪽 스와이프만 처리한다. */
      if (e.touches[0].clientX <= 28) return;
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; armed = true;
    }, { passive: true });
    ROOT.addEventListener('touchend', e => {
      if (!armed) return;
      armed = false;
      const dx = e.changedTouches[0].clientX - sx;
      const dy = e.changedTouches[0].clientY - sy;
      if (dx > 72 && Math.abs(dx) > Math.abs(dy) * 1.6) goBack();
    }, { passive: true });
  }

  /* 삐삐 알림은 채팅 토스트가 아니라 '액정 팝업'으로 — 감성이 곧 기능이다 */
  async function pagerRing(row) {
    if (!(await ensurePager())) return;
    let name = nickCache[row.sender_id];
    if (!name) { await profilesFor([row.sender_id]); name = nickCache[row.sender_id]; }
    window.GALLA_PAGER.popup({ name, kind: row.kind, code: row.code });
  }
  function attachPagerRealtime() {
    if (!ME || window.__pagerRingOn) return;   // dm-call.js가 이미 전 페이지 구독 중이면 중복 금지
    window.__pagerRingOn = true;
    supabase.channel('pager:' + ME)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pager_messages', filter: 'box_owner=eq.' + ME },
        ({ new: row }) => {
          pagerRing(row);
          refreshPagerBadge();
          // 삐삐 탭을 보고 있으면 목록도 즉시 갱신 — '들어왔는데 안 보임' 방지
          if (!ROOT.querySelector('#dm-pager')?.hidden) window.GALLA_pagerRefresh?.();
        })
      .subscribe();
  }

  /* iOS 키보드가 문서를 밀어 올린 뒤 되돌리지 않아 헤더가 어긋나는 문제 —
     포커스가 빠지거나 키보드가 닫히면(visualViewport 변화) 문서를 원위치로 되돌린다.
     CSS로 문서 스크롤을 잠갔지만, iOS는 그래도 밀 때가 있어 JS로 한 번 더 받친다. */
  /* ⌨️ 키보드가 올라오면 실제로 보이는 높이가 줄어드는데, 100dvh는 기기마다
     반응이 제각각이라 입력창이 키보드 뒤로 숨거나 화면이 밀린다.
     visualViewport가 알려주는 '진짜 보이는 높이'를 CSS 변수로 넘겨 패널이 그 안에 맞춘다. */
  function bindViewportFit() {
    if (window.__dmVvBound || !window.visualViewport) return;
    window.__dmVvBound = true;
    const vv = window.visualViewport;
    const fit = () => {
      document.documentElement.style.setProperty('--dm-vvh', Math.round(vv.height) + 'px');
      // 키보드가 열리면 대화 맨 아래를 계속 보여준다
      const msgs = ROOT?.querySelector('#dm-msgs');
      if (msgs && document.activeElement?.id === 'dm-input') msgs.scrollTop = msgs.scrollHeight;
    };
    vv.addEventListener('resize', fit);
    vv.addEventListener('scroll', fit);
    fit();
  }

  function lockPageScroll() {
    if (!PAGE_MODE() || window.__dmScrollLock) return;
    window.__dmScrollLock = true;
    const snap = () => {
      // 내부 스크롤러는 그대로 두고 '문서'만 원위치
      if (window.scrollY !== 0) window.scrollTo(0, 0);
      const se = document.scrollingElement;
      if (se && se.scrollTop !== 0) se.scrollTop = 0;
    };
    // 입력에서 빠져나올 때(키보드 닫힘)
    document.addEventListener('focusout', () => setTimeout(snap, 60), true);
    // 포커스 직후에도 문서가 밀리면 되돌린다(내부 스크롤러가 알아서 보여준다)
    document.addEventListener('focusin', e => {
      if (e.target.matches?.('input, textarea')) setTimeout(snap, 120);
    }, true);
    // 키보드 열림/닫힘은 visualViewport 크기 변화로 잡힌다
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => setTimeout(snap, 60));
      window.visualViewport.addEventListener('scroll', snap);
    }
    window.addEventListener('orientationchange', () => setTimeout(snap, 200));
    document.addEventListener('scroll', snap, { passive: true });
  }

  let e2eBooted = false;
  function openDM() {
    buildRoot();
    // 화면 잠금이 켜져 있으면 먼저 확인 — 실패하면 목록을 가린 채 되돌아간다
    if (UI.lockPin) {
      ensureUnlocked().then(ok => {
        if (ok) return;
        if (PAGE_MODE()) location.href = 'index.html';
        else closeDM();
      });
    }
    // ⚠️ CSS가 늦거나 캐시가 꼬여도 '옛 오버레이 화면(왼쪽 X)'이 뜨지 않게 JS로 못 박는다
    if (PAGE_MODE()) {
      ROOT.classList.add('page');
      const oldHead = ROOT.querySelector('[data-view="inbox"] > .dm-head');
      if (oldHead) oldHead.hidden = true;
      ROOT.querySelector('.dm-dim')?.remove();
    }
    applyTossface();
    if (STK_STYLE === 'fluent' && !window.GALLA_FLUENT) loadScript('/js/dm-fluent.js').catch(() => {});
    if (!e2eBooted && ME && window.GALLA_e2e?.supported()) {
      e2eBooted = true;
      window.GALLA_e2e.ready(supabase, ME).catch(() => {});
    }
    if (ME && window.GALLA_call?.supported()) window.GALLA_call.listen(supabase, ME);
    if (ME && window.GALLA_e2e?.supported()) attachMailbox();
    if (ME) { attachPagerRealtime(); refreshPagerBadge(); }
    lockPageScroll();
    bindViewportFit();
    // 계정이 바뀌면(같은 폰에서 로그아웃→다른 계정) 이전 계정 화면·상태가 남지 않게 통째로 리로드
    try {
      supabase.auth.onAuthStateChange?.((_ev, sess) => {
        const uid = sess?.user?.id || null;
        if (ME && uid && uid !== ME) location.reload();
      });
    } catch (_) {}
    // bfcache 복원 시 삐삐 탭이 열려 있으면 현재 세션 기준으로 다시 그린다
    window.addEventListener('pageshow', e => {
      if (e.persisted && !ROOT.querySelector('#dm-pager')?.hidden) loadPager();
    });
    // ?pager=1 로 들어오면 바로 사서함, 아니면 마지막으로 보던 탭 복원
    try {
      if (new URLSearchParams(location.search).get('pager')) setTimeout(() => setTab('pager'), 60);
      else {
        const last = sessionStorage.getItem(TAB_KEY);
        if (last && last !== 'chats') setTimeout(() => setTab(last), 60);
      }
    } catch (_) {}
    if (PAGE_MODE()) bindPageHeader();
    ROOT.classList.add('open');
    document.body.style.overflow = 'hidden';
    showView('inbox');
    paintShareBanner();
    loadInbox();
  }
  function closeDM() {
    if (PAGE_MODE()) { location.href = 'index.html'; return; }
    if (!ROOT) return;
    ROOT.classList.remove('open');
    document.body.style.overflow = '';
    detachThread();
    detachRoom(); curRoom = null;
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
    if (!PAGE_MODE()) {   // 페이지로 넘어가서 대화를 고른다 (오버레이 금지)
      try { sessionStorage.setItem('galla_dm_share', JSON.stringify(payload)); } catch (_) {}
      location.href = 'dm.html';
      return;
    }
    PENDING_SHARE = payload;
    openDM();
  };

  /* ---------- 탭: 채팅 / 친구 ---------- */
  const TAB_KEY = 'galla_dm_tab';
  function setTab(tab) {
    // 리로드·복귀 후에도 보던 탭으로 돌아오게(채팅으로 튕기지 않게)
    try { sessionStorage.setItem(TAB_KEY, tab); } catch (_) {}
    EDIT = false;   // 편집은 일시적 모드 — 탭을 바꾸면 해제(켠 채 넘어가면 다른 탭 메뉴가 '완료'로 떠서 헷갈린다)
    ROOT.querySelectorAll('.dm-tab').forEach(t => t.classList.toggle('on', t.dataset.tab === tab));
    ROOT.querySelector('#dm-inbox-wrap').hidden = tab !== 'chats';
    ROOT.querySelector('#dm-friends').hidden = tab !== 'friends';
    ROOT.querySelector('#dm-rooms').hidden = tab !== 'rooms';
    ROOT.querySelector('#dm-pager').hidden = tab !== 'pager';
    if (tab === 'friends') loadFriends();
    else if (tab === 'rooms') loadRooms();
    else if (tab === 'pager') loadPager();
    else loadInbox();
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
    ROOT.querySelector('#dm-prof-voice').onclick = () => callFrom(peer, p.nickname || name, false);
    ROOT.querySelector('#dm-prof-video').onclick = () => callFrom(peer, p.nickname || name, true);
    ROOT.querySelector('#dm-prof-pager').onclick = () => pagerLeave(peer, p.nickname || name);
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
      <button class="dm-cs-act" data-cs="voice" type="button">${ICONS.phone} 육성톡</button>
      <button class="dm-cs-act" data-cs="video" type="button">${ICONS.cam} 면상톡</button>
      <button class="dm-cs-act" data-cs="pager" type="button">📟 삐삐 남기기 <i class="dm-cs-note">사서함에 음성/숫자</i></button>
      <button class="dm-cs-act" data-cs="duel" type="button">${ICONS.swords} 일기토 신청</button>
      <button class="dm-cs-act" data-cs="expire" type="button">${ICONS.timer} 사라지는 메시지 <i class="dm-cs-state${curExpire ? ' on' : ''}">${curExpire ? EXP_LABEL[curExpire] : '끔'}</i></button>
      <button class="dm-cs-act" data-cs="secret" type="button">${ICONS.lock} 비밀대화 <i class="dm-cs-state${secretOn(curThread) ? ' on' : ''}">${secretOn(curThread) ? '켜짐' : '꺼짐'}</i></button>
      <button class="dm-cs-act danger" data-cs="report" type="button">${ICONS.flag} 신고</button>
      <button class="dm-cs-act danger" data-cs="block" type="button">${ICONS.block} 차단</button>
      <button class="dm-cs-act danger" data-cs="leave" type="button">${ICONS.leave} 채팅방 나가기</button>`;

    box.querySelector('#dm-cs-peer').onclick = () => openProfile(curPeer, p.nickname);
    box.querySelectorAll('.dm-cs-thumb').forEach(t => t.onclick = () => openLightbox(t.dataset.url));
    box.querySelectorAll('[data-cs]').forEach(b => b.onclick = async () => {
      const k = b.dataset.cs;
      if (k === 'pin') { await doThreadAct('pin', curThread); openChatSet(); }
      else if (k === 'voice' || k === 'video') { callFrom(curPeer, p.nickname, k === 'video'); }
      else if (k === 'pager') { pagerLeave(curPeer, p.nickname); }
      else if (k === 'secret') {
        if (secretOn(curThread)) { setSecret(curThread, false); paintSecretUI(); openChatSet(); return; }
        if (!window.GALLA_e2e?.supported()) return toastMini('이 브라우저에선 비밀대화를 쓸 수 없어요');
        await window.GALLA_e2e.ready(supabase, ME);
        const ok = await window.GALLA_e2e.peerReady(supabase, ME, curPeer);
        if (!ok) return toastMini('상대가 아직 비밀대화 준비가 안 됐어요 — 상대가 DM을 한 번 열면 켤 수 있어요');
        setSecret(curThread, true); paintSecretUI(); openChatSet();
        toastMini('비밀대화 시작 — 발신자 기록이 서버에 남지 않고, 이 기기에서만 열려요');
      }
      else if (k === 'report') {
        const r0 = b.getBoundingClientRect();
        reportFlow('user', curPeer, r0.left, r0.top - 10);
      }
      else if (k === 'expire') {
        const r0 = b.getBoundingClientRect();
        // ⚠️ 여는 클릭이 document 닫기 핸들러에 잡히지 않게 한 틱 미룬다(⚙ 메뉴에서 배운 것)
        setTimeout(() => popMenu(r0.left, Math.max(60, r0.top - 170), [
          { k: '0', label: (!curExpire ? '✓ ' : ' ') + '끄기' },
          { k: '3600', label: (curExpire === 3600 ? '✓ ' : ' ') + '1시간 뒤 사라짐' },
          { k: '86400', label: (curExpire === 86400 ? '✓ ' : ' ') + '24시간 뒤 사라짐' },
          { k: '604800', label: (curExpire === 604800 ? '✓ ' : ' ') + '7일 뒤 사라짐' },
        ], async v => {
          const secs = Number(v) || null;
          const { error } = await supabase.from('dm_threads')
            .update({ expire_secs: secs }).eq('id', curThread);
          if (error) return toastMini('설정하지 못했어요');
          curExpire = secs;
          paintExpBanner(); openChatSet();
          toastMini(secs ? `${EXP_LABEL[secs]} 뒤 메시지가 자동으로 사라져요 — 서버에서도 지워져요` : '사라지는 메시지를 껐어요');
        }), 0);
      }
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
  function toastMini(text) {
    let el = document.getElementById('dm-mini-toast');
    if (!el) { el = document.createElement('div'); el.id = 'dm-mini-toast'; document.body.appendChild(el); }
    el.textContent = text;
    el.classList.add('on');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('on'), 2600);
  }
  /* 🚨 신고 — 사유 고르면 접수. 서버 트리거가 관리자에게 알림을 민다 */
  function reportFlow(kind, id, x, y) {
    // 메뉴 안에서 호출되면 innerHTML 교체로 클릭 target이 detach돼 document 닫기 핸들러가
    // 새 메뉴를 같은 틱에 도로 닫는다 — 한 틱 미뤄 연다
    setTimeout(() => popMenu(x, y, [
      { k: 'spam', label: '스팸·도배' },
      { k: 'abuse', label: '욕설·혐오' },
      { k: 'sexual', label: '성적·불쾌' },
      { k: 'scam', label: '사기·사칭' },
      { k: 'etc', label: '기타' },
    ], async reason => {
      const { error } = await supabase.from('reports')
        .insert({ reporter: ME, target_kind: kind, target_id: id, reason });
      toastMini(error ? '신고 접수에 실패했어요' : '신고가 접수됐어요. 검토 후 조치할게요.');
    }), 0);
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
  /* 통화 진입 공용 — 지원 확인 + 이름 보정. 프로필·친구 메뉴·서랍이 모두 이리로 */
  function callFrom(peer, name, video) {
    if (!window.GALLA_call?.supported()) return toastMini('이 브라우저에선 통화를 지원하지 않아요');
    window.GALLA_call.start(peer, name || nickCache[peer] || PROFILES[peer]?.nickname, !!video);
  }
  function friendMenu(el, x, y) {
    const peer = el.dataset.peer, name = el.dataset.name;
    popMenu(x, y, [
      { k: 'voice', label: '육성톡' },
      { k: 'video', label: '면상톡' },
      { k: 'pager', label: '📟 삐삐 남기기' },
      { k: 'fav', label: PREF.favs.has(peer) ? '즐겨찾기 해제' : '즐겨찾기' },
      { k: 'hide', label: '목록에서 숨기기' },
      { k: 'block', label: '차단', danger: true },
    ], k => {
      if (k === 'voice' || k === 'video') return callFrom(peer, name, k === 'video');
      if (k === 'pager') return pagerLeave(peer, name);
      doFriendAct(k, peer, name);
    });
  }
  function threadMenu(el, x, y) {
    const tid = el.dataset.tid;
    if (!tid) return;   // 단체 채팅 행(.dm-gchat)은 1:1 고정/나가기 메뉴 대상이 아니다
    popMenu(x, y, [
      { k: 'pin', label: PREF.threads[tid]?.pinned ? '고정 해제' : '상단 고정' },
      { k: 'folder', label: '폴더로 옮기기' },
      { k: 'leave', label: '나가기', danger: true },
    ], k => (k === 'folder' ? assignFolder(tid) : doThreadAct(k, tid)));
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
  /* 🎛 로컬 설정(계정이 아니라 이 기기의 취향) — 서버 왕복 없이 즉시 반영된다.
     겉모습만 늘리지 않고 전부 실제 동작에 연결한다. */
  const PREF_KEY = 'galla_dm_prefs';
  const PREF_DEF = {
    preview: true, banner: true, sound: true, vibrate: true, enter: true, fontsize: 'm',
    mediaPreview: true,      // 사진·이모티콘 미리보기
    foreground: true,        // 앱을 보고 있을 때도 알림 띄우기
    tone: 'ding',            // 알림음: none | ding | pager
    keywords: '',            // 키워드 알림(쉼표 구분)
    dndOn: false, dndFrom: '23:00', dndTo: '07:00',   // 집중(방해금지) 시간
    lockPin: '',             // 화면 잠금 PIN(해시)
    typing: true,            // 입력 중 상태 주고받기
    swipeReply: true,        // 말풍선 밀어서 답장
    voiceBtn: true,          // 입력창 간편녹음 버튼
    autoplay: true,          // 영상 말풍선 자동재생
    reactions: true,         // 두 번 탭 리액션
    kbToolbar: false,        // 입력창 위 빠른 도구 줄
    fontScale: 100,          // 글자 크기 85~130 (%)
    fontFace: 'sys',         // 글씨체: sys | round | serif
    bgKind: 'none',          // 배경: none | color | pattern | photo
    bgValue: '',             // 색상값 / 패턴 id / 사진 dataURL
    snow: false,             // 눈 내리는 채팅방
    accent: 'indigo',        // 포인트 색 테마
    stkStyle: '',            // 이모티콘 기본 스타일(빈값=모듈 기본)
    stkSize: 'm',            // 이모티콘 크기
    stkRecent: true,         // 최근 쓴 이모티콘 먼저 보여주기
    callLog: true,           // 통화 기록을 대화에 남기기
    ringTone: 'ring',        // 벨소리: ring | pager | none
    callVolume: 100,         // 상대 목소리 크기 0~150
    lowData: false,          // 면상톡 저데이터
    shake: true,             // 흔들어서 버그 신고
    videoAuto: 'always',     // 동영상 자동재생: always | wifi | never
    searchHistory: true,     // 최근 검색어 저장
    photoQuality: 'high',    // 사진 화질: origin | high | save
    dataSaver: false,        // 모바일 데이터에서 미디어 아끼기
  };
  let UI = { ...PREF_DEF };
  try { UI = { ...PREF_DEF, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') }; } catch (_) {}
  window.GALLA_dmPrefs = () => UI;
  function savePrefs() {
    try { localStorage.setItem(PREF_KEY, JSON.stringify(UI)); } catch (_) {}
    applyPrefs();
  }
  /* 알림음은 파일 없이 합성한다(저작권·용량 0). 미리듣기와 실제 알림이 같은 소리. */
  let TONE_AC = null;
  function playTone(kind) {
    const k = kind || UI.tone;
    if (k === 'none') return;
    try {
      TONE_AC = TONE_AC || new (window.AudioContext || window.webkitAudioContext)();
      const ac = TONE_AC;
      if (ac.state === 'suspended') ac.resume();
      const now = ac.currentTime;
      const notes = k === 'pager' ? [[1400, 0], [1400, .12], [1100, .24]] : [[880, 0], [1320, .09]];
      notes.forEach(([f, t]) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = k === 'pager' ? 'square' : 'sine';
        o.frequency.value = f;
        g.gain.setValueAtTime(.0001, now + t);
        g.gain.exponentialRampToValueAtTime(.16, now + t + .01);
        g.gain.exponentialRampToValueAtTime(.0001, now + t + .1);
        o.connect(g); g.connect(ac.destination);
        o.start(now + t); o.stop(now + t + .12);
      });
    } catch (_) {}
  }
  /* 집중(방해금지) 시간이면 소리·진동·배너를 모두 죽인다. 자정을 넘는 범위도 처리. */
  function inDND() {
    if (!UI.dndOn) return false;
    const [fh, fm] = String(UI.dndFrom || '23:00').split(':').map(Number);
    const [th, tm] = String(UI.dndTo || '07:00').split(':').map(Number);
    const d = new Date(), cur = d.getHours() * 60 + d.getMinutes();
    const a = fh * 60 + fm, b = th * 60 + tm;
    return a <= b ? (cur >= a && cur < b) : (cur >= a || cur < b);
  }
  function hitsKeyword(text) {
    const ks = String(UI.keywords || '').split(',').map(x => x.trim()).filter(Boolean);
    if (!ks.length) return null;
    const t = String(text || '');
    return ks.find(k => t.includes(k)) || null;
  }
  window.GALLA_dmNotify = { playTone, inDND, hitsKeyword };

  function applyPrefs() {
    /* ⚠️ 글자 크기 조절기가 두 곳(3단 + 슬라이더)에 있어 서로 곱해졌다.
       "보통"을 눌러도 슬라이더가 130%면 커진 채라 '안 먹는다'로 보였다.
       조절기는 슬라이더 하나로 통합하고, 3단은 기본값(m)으로 고정한다. */
    document.documentElement.dataset.dmFont = 'm';
    const r = document.documentElement;
    r.style.setProperty('--dm-font-scale', (UI.fontScale || 100) / 100);
    r.dataset.dmFace = UI.fontFace || 'sys';
  }
  applyPrefs();

  /* 알림 상세 — 토글·세그먼트·입력을 한 화면에서 즉시 반영한다.
     '설정만 있고 안 먹는 항목'을 만들지 않으려고 전부 showDmToast/배너에 연결돼 있다. */
  function loadNotiSet() {
    const host = ROOT.querySelector('#dm-notiset');
    if (!host) return;
    // 기기 알림이 꺼져 있으면 맨 위에 경고(카톡과 동일한 자리)
    const warn = host.querySelector('#dm-noti-warn');
    if (warn) warn.hidden = !(typeof Notification !== 'undefined' && Notification.permission === 'denied');

    host.querySelectorAll('[data-pref]').forEach(btn => {
      const k = btn.dataset.pref;
      const paint = () => btn.classList.toggle('on', !!UI[k]);
      paint();
      btn.onclick = () => {
        UI[k] = !UI[k]; savePrefs(); paint();
        if (k === 'sound' && UI.sound) playTone();          // 켜는 즉시 들려준다
        if (k === 'dndOn') paintDnd();
      };
    });
    const seg = host.querySelector('[data-pref-seg="tone"]');
    if (seg) {
      const paintSeg = () => seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === UI.tone));
      paintSeg();
      seg.onclick = e => {
        const b = e.target.closest('button[data-v]');
        if (!b) return;
        UI.tone = b.dataset.v; savePrefs(); paintSeg(); playTone();   // 고르면 바로 미리듣기
      };
    }
    const kw = host.querySelector('#dm-kw');
    if (kw) {
      kw.value = UI.keywords || '';
      kw.oninput = () => { UI.keywords = kw.value; savePrefs(); };
    }
    const from = host.querySelector('#dm-dnd-from'), to = host.querySelector('#dm-dnd-to');
    const paintDnd = () => {
      const row = host.querySelector('#dm-dnd-range');
      if (row) row.classList.toggle('off', !UI.dndOn);
    };
    if (from && to) {
      from.value = UI.dndFrom; to.value = UI.dndTo;
      from.onchange = () => { UI.dndFrom = from.value || '23:00'; savePrefs(); };
      to.onchange = () => { UI.dndTo = to.value || '07:00'; savePrefs(); };
    }
    paintDnd();
    // 푸시 토글 — 이제 이 화면이 유일한 자리라 직접 배선한다
    const ptg = host.querySelector('#dm-set-push2');
    if (ptg) {
      const paintPush = async () => {
        const st = await (window.GALLA_pushStatus?.() ?? 'unsupported');
        ptg.classList.toggle('on', st === 'on');
        ptg.dataset.st = st;
      };
      paintPush();
      ptg.onclick = async () => {
        const st = ptg.dataset.st;
        try {
          if (st === 'on') { await window.GALLA_pushDisable(); toastMini('푸시 알림을 껐어요'); }
          else if (st === 'unsupported') { toastMini('이 브라우저는 푸시를 지원하지 않아요 — 아이폰은 홈 화면에 추가 후 앱에서 켜주세요'); }
          else if (st === 'denied') { toastMini('알림이 차단돼 있어요 — 기기 설정에서 갈라 알림을 허용해주세요'); }
          else { await window.GALLA_pushEnable(); toastMini('푸시 알림을 켰어요'); }
        } catch (e) {
          toastMini(String(e.message) === 'denied' ? '알림 권한이 거부됐어요' : '푸시 설정에 실패했어요');
        }
        paintPush();
      };
    }
  }

  /* 채팅 상세 — 토글은 전부 실제 동작에 연결돼 있다(입력중 표시·밀어서 답장·
     간편녹음 버튼·자동재생·엔터 전송·글자 크기). */
  async function loadChatSet2() {
    const host = ROOT.querySelector('#dm-chatset2');
    if (!host) return;
    // 내 삐삐 번호 (설정 메인에서 이 화면으로 옮겨왔다)
    (async () => {
      const el = host.querySelector('#dm-set-pager-sub');
      if (!el) return;
      try {
        const { data } = await supabase.rpc('pager_my_box');
        el.textContent = data?.activated === false ? '아직 개통 전이에요 — 사서함에서 번호를 받으세요'
          : (data?.number || '번호를 불러오지 못했어요');
      } catch (_) { el.textContent = '번호를 불러오지 못했어요'; }
    })();
    /* 그룹 초대 게이트는 '서버가 판단할 설정'이라 계정에 저장한다
       (로컬에 두면 다른 사람이 나를 초대할 때 서버가 알 수 없다) */
    const gate = host.querySelector('#dm-set-gate');
    if (gate) {
      const { data } = await supabase.from('dm_user_settings').select('gate_group_invite').eq('user_id', ME).maybeSingle();
      let on = !!data?.gate_group_invite;
      const paint = () => gate.classList.toggle('on', on);
      paint();
      gate.onclick = async () => {
        on = !on; paint();
        const { error } = await supabase.from('dm_user_settings')
          .upsert({ user_id: ME, gate_group_invite: on, updated_at: new Date().toISOString() });
        if (error) { on = !on; paint(); toastMini('설정을 저장하지 못했어요'); }
        else toastMini(on ? '모르는 사람의 초대는 먼저 확인할게요' : '초대를 바로 받습니다');
      };
    }
    host.querySelectorAll('[data-pref]').forEach(btn => {
      const k = btn.dataset.pref;
      const paint = () => btn.classList.toggle('on', !!UI[k]);
      paint();
      btn.onclick = () => { UI[k] = !UI[k]; savePrefs(); paint(); applyChatPrefs(); };
    });
    // 글자 크기는 화면 설정의 슬라이더 하나로 통합 — 여기선 현재 값만 알려준다
    const sizeSub = host.querySelector('#dm-chat-size-sub');
    if (sizeSub) sizeSub.textContent = `지금 ${UI.fontScale}% — 화면 설정에서 조절해요`;
  }
  /* 설정을 화면에 즉시 반영 — 저장만 하고 안 먹는 설정은 만들지 않는다 */
  function applyChatPrefs() {
    const v = ROOT?.querySelector('#dm-voice');
    if (v) v.hidden = !UI.voiceBtn;
    const kb = ROOT?.querySelector('#dm-kbtool');
    if (kb) kb.hidden = !UI.kbToolbar;
    ROOT?.querySelectorAll('video[data-dm-vid]').forEach(el => {
      el.autoplay = !!UI.autoplay;
      if (!UI.autoplay) { try { el.pause(); } catch (_) {} }
    });
  }

  /* 📞 통화 설정 — 값은 dm-call.js가 window.GALLA_dmPrefs()로 읽어 실제로 쓴다.
     여기서 저장만 하고 통화가 무시하면 그건 가짜 설정이다. */
  function loadCallSet() {
    const host = ROOT.querySelector('#dm-callset');
    if (!host) return;
    host.querySelectorAll('[data-pref]').forEach(btn => {
      const k = btn.dataset.pref;
      const paint = () => btn.classList.toggle('on', !!UI[k]);
      paint();
      btn.onclick = () => { UI[k] = !UI[k]; savePrefs(); paint(); };
    });
    const seg = host.querySelector('[data-pref-seg="ringTone"]');
    if (seg) {
      const paintSeg = () => seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === UI.ringTone));
      paintSeg();
      seg.onclick = e => {
        const b = e.target.closest('button[data-v]');
        if (!b) return;
        UI.ringTone = b.dataset.v; savePrefs(); paintSeg();
        if (UI.ringTone !== 'none') playTone(UI.ringTone === 'pager' ? 'pager' : 'ding');   // 미리듣기
      };
    }
    const vol = host.querySelector('#dm-callvol'), vtxt = host.querySelector('#dm-vol-txt');
    if (vol) {
      vol.value = UI.callVolume;
      const paint = () => { if (vtxt) vtxt.textContent = `현재 ${UI.callVolume}% ${UI.callVolume === 100 ? '(기본)' : UI.callVolume > 100 ? '— 크게' : ''}`; };
      paint();
      vol.oninput = () => {
        UI.callVolume = +vol.value; savePrefs(); paint();
        // 통화 중이면 즉시 반영
        document.querySelectorAll('#dm-call audio, #dm-call video').forEach(el => { el.volume = Math.min(1, UI.callVolume / 100); });
      };
    }
    // 마이크·카메라 권한 (메인에서 이 화면으로 옮겨왔다)
    bindPermButton(host.querySelector('#dm-set-mic'), 'microphone', { audio: true });
    bindPermButton(host.querySelector('#dm-set-cam'), 'camera', { video: true });
    // 통화 기록 개수
    (async () => {
      const sub = host.querySelector('#dm-calllog-sub');
      if (!sub) return;
      const { count } = await supabase.from('dm_messages')
        .select('id', { count: 'exact', head: true }).eq('kind', 'call').eq('sender_id', ME);
      sub.textContent = count ? `내가 남긴 통화 기록 ${count}건` : '남은 통화 기록이 없어요';
    })();
  }
  /* 권한 버튼 공용 — 마이크·카메라가 같은 흐름을 쓴다(중복 구현 금지).
     ⚠️ permissions.query는 사파리 등에서 마이크·카메라를 아예 지원하지 않아
     늘 'unknown'을 준다 → 허용해놨는데도 계속 '허용받기'로 보였다(제보).
     그래서 3단으로 확인한다:
       ① permissions.query (되는 브라우저)
       ② enumerateDevices의 라벨 — 권한을 준 적이 있어야 기기 이름이 보인다
       ③ 이 기기에서 성공했던 기록(localStorage) */
  const PERM_OK_KEY = n => 'galla_perm_' + n;
  async function realPermState(permName, kind) {
    try {
      const st = (await navigator.permissions.query({ name: permName })).state;
      if (st === 'granted' || st === 'denied') return st;
    } catch (_) {}
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      const mine = devs.filter(d => d.kind === kind);
      if (mine.length && mine.some(d => d.label)) return 'granted';   // 라벨이 보이면 허용된 것
    } catch (_) {}
    try { if (localStorage.getItem(PERM_OK_KEY(permName)) === '1') return 'granted'; } catch (_) {}
    return 'prompt';
  }
  async function bindPermButton(btn, permName, constraints) {
    if (!btn) return;
    const kind = constraints.video ? 'videoinput' : 'audioinput';
    const paint = async () => {
      const st = await realPermState(permName, kind);
      btn.textContent = st === 'granted' ? '허용됨' : st === 'denied' ? '차단됨' : '허용받기';
      btn.classList.toggle('ok', st === 'granted');
      btn.dataset.st = st;
    };
    await paint();
    btn.onclick = async () => {
      if (btn.dataset.st === 'granted') return toastMini('이미 허용돼 있어요');
      try {
        const s = await navigator.mediaDevices.getUserMedia(constraints);
        s.getTracks().forEach(t => t.stop());
        try { localStorage.setItem(PERM_OK_KEY(permName), '1'); } catch (_) {}
        toastMini('준비 완료 — 이제 다시 묻지 않아요');
      } catch (_) {
        try { localStorage.removeItem(PERM_OK_KEY(permName)); } catch (_) {}
        if (!window.GALLA_micHelp) {
          const v = ([...document.scripts].map(x => x.src).find(u => /[?&]v=/.test(u)) || '').match(/[?&]v=(\d+)/);
          await new Promise(res => { const sc = document.createElement('script'); sc.src = '/js/mic-help.js' + (v ? '?v=' + v[1] : ''); sc.onload = sc.onerror = res; document.head.appendChild(sc); });
        }
        window.GALLA_micHelp?.({ video: !!constraints.video });
      }
      paint();
    };
  }

  async function clearCalls(btn) {
    if (!confirm('대화방에 남은 통화 기록을 모두 지울까요?\n(대화 내용은 그대로 남습니다)')) return;
    if (btn) { btn.disabled = true; btn.textContent = '지우는 중…'; }
    const { error } = await supabase.from('dm_messages').delete().eq('kind', 'call').eq('sender_id', ME);
    if (btn) { btn.disabled = false; btn.textContent = '초기화'; }
    toastMini(error ? '지우지 못했어요' : '통화 기록을 지웠어요');
    loadCallSet();
  }

  /* ⚙ 기타 */
  function loadEtc() {
    const host = ROOT.querySelector('#dm-etc');
    if (!host) return;
    host.querySelectorAll('[data-pref]').forEach(btn => {
      const k = btn.dataset.pref;
      const paint = () => btn.classList.toggle('on', !!UI[k]);
      paint();
      btn.onclick = () => {
        UI[k] = !UI[k]; savePrefs(); paint();
        if (k === 'shake' && UI.shake) window.GALLA_enableShakeReport?.();
      };
    });
    const seg = host.querySelector('[data-pref-seg="videoAuto"]');
    if (seg) {
      const paintSeg = () => seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === UI.videoAuto));
      paintSeg();
      seg.onclick = e => {
        const b = e.target.closest('button[data-v]');
        if (!b) return;
        UI.videoAuto = b.dataset.v; savePrefs(); paintSeg();
        document.documentElement.dataset.videoAuto = UI.videoAuto;   // 피드·릴스가 읽는다
      };
    }
    document.documentElement.dataset.videoAuto = UI.videoAuto;
    const sub = host.querySelector('#dm-search-sub');
    if (sub) {
      let n = 0;
      try { n = (JSON.parse(localStorage.getItem('galla_recent_searches') || '[]') || []).length; } catch (_) {}
      sub.textContent = n ? `저장된 검색어 ${n}개` : '저장된 검색어가 없어요';
    }
  }

  /* 🎨 테마 — 포인트 색만 바꾼다. 어두운 화면은 갈라의 정체성이라 유지하고,
     라이트 모드는 51개 화면을 다시 맞추는 별도 과제라 지금은 약속하지 않는다. */
  const ACCENTS = {
    indigo:  { name: '인디고', c1: '#6a7bff', c2: '#3a5bff' },
    gold:    { name: '골드',   c1: '#f5c451', c2: '#d99b1f' },
    emerald: { name: '에메랄드', c1: '#48d99b', c2: '#1fa771' },
    rose:    { name: '로즈',   c1: '#ff7d9b', c2: '#e0435f' },
    violet:  { name: '바이올렛', c1: '#b57cff', c2: '#7c3ff0' },
    cyan:    { name: '시안',   c1: '#5fd5f0', c2: '#1f9fc4' },
  };
  function applyAccent() {
    const a = ACCENTS[UI.accent] || ACCENTS.indigo;
    const r = document.documentElement.style;
    r.setProperty('--accent', a.c2);
    r.setProperty('--accent-2', a.c1);
    r.setProperty('--accent-grad', `linear-gradient(135deg, ${a.c1} 0%, ${a.c2} 100%)`);
    r.setProperty('--accent-glow', `0 6px 22px ${a.c2}52`);
    r.setProperty('--dm-mine', a.c2);
  }
  applyAccent();
  function loadTheme() {
    const box = ROOT.querySelector('#dm-accents');
    if (!box) return;
    box.innerHTML = Object.entries(ACCENTS).map(([id, a]) =>
      `<button type="button" class="dm-acc${UI.accent === id ? ' on' : ''}" data-acc="${id}"
        style="background:linear-gradient(135deg,${a.c1},${a.c2})"><span>${a.name}</span></button>`).join('');
    box.onclick = e => {
      const b = e.target.closest('[data-acc]');
      if (!b) return;
      UI.accent = b.dataset.acc; savePrefs(); applyAccent(); loadTheme();
      toastMini(`${ACCENTS[UI.accent].name}으로 바꿨어요`);
    };
  }

  /* 😀 이모티콘 설정 — 실제 피커(dm-stickers.js)와 같은 저장소를 쓴다 */
  const STK_RECENT_KEY = 'galla_stk_recent';
  async function loadStickerSet() {
    const host = ROOT.querySelector('#dm-stickerset');
    if (!host) return;
    if (!window.GALLA_STK) {
      const v = ([...document.scripts].map(x => x.src).find(u => /[?&]v=/.test(u)) || '').match(/[?&]v=(\d+)/);
      for (const f of ['/js/dm-fluent.js', '/js/dm-stickers.js']) {
        await new Promise(res => { const sc = document.createElement('script'); sc.src = f + (v ? '?v=' + v[1] : ''); sc.onload = sc.onerror = res; document.head.appendChild(sc); });
      }
    }
    /* ⚠️ '노토·트위터·블롭'은 개발자 용어다 — 사용자는 그게 뭔지 알 수 없다.
       같은 이모지를 그림체별로 실제로 그려 보여주고, 이름은 느낌말로 바꾼다. */
    const SAMPLE = '😀';
    const NICE = {
      noto:   { name: '움직이는', hint: '살아 움직여요' },
      notos:  { name: '동글동글', hint: '가장 익숙한 그림체' },
      twe:    { name: '깔끔한',   hint: '단순하고 또렷해요' },
      fluent: { name: '입체',     hint: '3D처럼 도톰해요' },
      blob:   { name: '말랑',     hint: '옛 안드로이드 물방울' },
      open:   { name: '손그림',   hint: '연필로 그린 느낌' },
      toss:   { name: '토스',     hint: '토스페이스' },
    };
    const styles = window.GALLA_STK?.styles || [];
    const sbox = host.querySelector('#dm-stk-style-pick');
    if (sbox) {
      if (!styles.length) {
        sbox.innerHTML = '<span class="dm-set-empty">이모티콘을 준비하는 중이에요 — 잠시 후 다시 열어주세요</span>';
      } else {
        const cps = window.GALLA_STK.cpsOf(SAMPLE);
        const cur = UI.stkStyle || styles[0].id;
        sbox.innerHTML = styles.map(st => {
          let url = '';
          try { url = window.GALLA_STK.urlOf(cps, st.id) || ''; } catch (_) {}
          const n = NICE[st.id] || { name: st.label, hint: '' };
          return `<button type="button" class="dm-stk-card${cur === st.id ? ' on' : ''}" data-st="${st.id}">
            ${url ? `<img src="${esc(url)}" alt="">` : `<span class="dm-stk-fb">${SAMPLE}</span>`}
            <b>${esc(n.name)}</b><i>${esc(n.hint)}</i></button>`;
        }).join('');
        // 못 불러오는 그림체는 빈 네모를 남기지 말고 숨긴다
        sbox.querySelectorAll('img').forEach(im => {
          im.onerror = () => im.closest('.dm-stk-card')?.remove();
        });
      }
      sbox.onclick = e => {
        const b = e.target.closest('[data-st]');
        if (!b) return;
        UI.stkStyle = b.dataset.st; savePrefs();
        try { localStorage.setItem('galla_stk_style', UI.stkStyle); } catch (_) {}
        sbox.querySelectorAll('.dm-stk-card').forEach(c => c.classList.toggle('on', c.dataset.st === UI.stkStyle));
        toastMini('기본 그림체를 바꿨어요');
      };
    }
    host.querySelectorAll('[data-pref]').forEach(btn => {
      const k = btn.dataset.pref;
      const paint = () => btn.classList.toggle('on', !!UI[k]);
      paint();
      btn.onclick = () => { UI[k] = !UI[k]; savePrefs(); paint(); };
    });
    const seg = host.querySelector('[data-pref-seg="stkSize"]');
    if (seg) {
      const paintSeg = () => seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === UI.stkSize));
      paintSeg();
      seg.onclick = e => {
        const b = e.target.closest('button[data-v]');
        if (!b) return;
        UI.stkSize = b.dataset.v; savePrefs(); paintSeg();
        document.documentElement.dataset.stkSize = UI.stkSize;
      };
    }
    document.documentElement.dataset.stkSize = UI.stkSize;
    const sub = host.querySelector('#dm-stk-recent-sub');
    if (sub) {
      let n = 0;
      try { n = (JSON.parse(localStorage.getItem(STK_RECENT_KEY) || '[]') || []).length; } catch (_) {}
      sub.textContent = n ? `최근 쓴 이모티콘 ${n}개를 기억하고 있어요` : '아직 기록이 없어요';
    }
  }

  /* 🖼 화면 — 글자·글씨체·배경·눈 효과·화면 방향.
     배경 무늬는 외부 이미지 없이 직접 그린 SVG라 저작권·용량 걱정이 없다. */
  /* ⚠️ 처음엔 전부 #0b0c10 언저리라 골라도 '변화 없음'으로 보였다(실제로 그런 제보).
     어두운 화면을 지키되 서로는 확실히 구분되는 색으로 다시 골랐다. */
  const BG_COLORS = [
    { v: '#0b0c10', n: '기본' },
    { v: '#12203c', n: '네이비' },
    { v: '#241640', n: '퍼플' },
    { v: '#0f2a20', n: '포레스트' },
    { v: '#35131f', n: '와인' },
    { v: '#0d2b30', n: '틸' },
    { v: '#2a2612', n: '카키' },
    { v: '#1b2430', n: '슬레이트' },
  ];
  /* 무늬는 외부 이미지 없이 직접 그린 SVG.
     ⚠️ 속성에 큰따옴표를 쓰면 url("…") 값이 거기서 끊긴다 — 무늬가 통째로 안 나왔다.
     작은따옴표만 쓰고, 전체를 encodeURIComponent로 감싸 안전하게 만든다. */
  const BG_PATTERNS = {
    dots:  `<circle cx='10' cy='10' r='1.4' fill='rgba(255,255,255,.13)'/>`,
    grid:  `<path d='M0 20h40M20 0v40' stroke='rgba(255,255,255,.08)' stroke-width='1'/>`,
    waves: `<path d='M0 20q10-10 20 0t20 0' fill='none' stroke='rgba(255,255,255,.1)' stroke-width='1.4'/>`,
    stars: `<path d='M20 8l1.8 5.4H27l-4.4 3.2 1.7 5.4-4.3-3.4-4.3 3.4 1.7-5.4L13 13.4h5.2z' fill='rgba(255,255,255,.09)'/>`,
  };
  const PATTERN_LABEL = { dots: '점', grid: '격자', waves: '물결', stars: '별' };
  function patternURL(id) {
    const inner = BG_PATTERNS[id] || BG_PATTERNS.dots;
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'>${inner}</svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }

  /* 설정을 화면 전체에 반영.
     ⚠️ 배경과 눈을 .dm-msgs(스크롤 영역) 안에 넣었더니 두 가지가 깨졌다:
       · 눈송이가 스크롤 컨텐츠가 돼 scrollHeight를 늘려 대화가 멈춘 것처럼 굴었고
       · 눈송이가 '첫 자식'이 되면서 말풍선 바닥 정렬(margin-top:auto)을 훔쳐가
         대화 정렬이 깨졌다
     → 배경은 스크롤되지 않는 부모(뷰)에, 눈은 별도 오버레이 층에 그린다. */
  function bgTargets() {
    /* ⚠️ 미리보기는 두 곳(테마·화면 설정)에 있다. querySelector로 하나만 잡으면
       DOM에서 먼저 나오는 '숨겨진' 미리보기만 칠해져, 보고 있는 화면은 그대로였다
       (배경을 골라도 미리보기가 안 바뀌던 원인). 전부 칠한다. */
    return [
      ROOT?.querySelector('.dm-view[data-view="thread"]'),
      ROOT?.querySelector('.dm-view[data-view="room"]'),
      ...(ROOT ? ROOT.querySelectorAll('.dm-prev-in') : []),
    ].filter(Boolean);
  }
  function applyDisplay() {
    const r = document.documentElement;
    r.style.setProperty('--dm-font-scale', (UI.fontScale || 100) / 100);
    r.dataset.dmFace = UI.fontFace || 'sys';
    bgTargets().forEach(el => {
      el.classList.add('dm-bg-host');
      if (UI.bgKind === 'color') {
        el.style.backgroundColor = UI.bgValue; el.style.backgroundImage = '';
      } else if (UI.bgKind === 'pattern') {
        el.style.backgroundColor = '#0b0c10'; el.style.backgroundImage = patternURL(UI.bgValue);
      } else if (UI.bgKind === 'photo' && UI.bgValue) {
        el.style.backgroundColor = '#000';
        el.style.backgroundImage = `linear-gradient(rgba(0,0,0,.45), rgba(0,0,0,.45)), url(${UI.bgValue})`;
        el.style.backgroundSize = 'cover'; el.style.backgroundPosition = 'center';
      } else {
        el.style.backgroundColor = ''; el.style.backgroundImage = '';
      }
      paintSnow(el);
    });
  }
  /* ❄️ 눈 — 스크롤과 무관한 오버레이 층에만 그린다(레이아웃에 영향 0) */
  function paintSnow(host) {
    let layer = host.querySelector(':scope > .dm-snow');
    if (!UI.snow) { layer?.remove(); return; }
    if (layer) return;                     // 이미 내리는 중이면 다시 만들지 않는다
    layer = document.createElement('div');
    layer.className = 'dm-snow';
    layer.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 24; i++) {
      const f = document.createElement('i');
      f.style.left = Math.random() * 100 + '%';
      f.style.animationDuration = (5 + Math.random() * 7) + 's';
      f.style.animationDelay = (-Math.random() * 10) + 's';
      f.style.opacity = 0.25 + Math.random() * 0.5;
      f.style.fontSize = (7 + Math.random() * 9) + 'px';
      f.textContent = '❄';
      layer.appendChild(f);
    }
    host.appendChild(layer);
  }

  function loadDisplay() {
    const host = ROOT.querySelector('#dm-display');
    if (!host) return;
    applyDisplay();
    // 글자 크기
    const sl = host.querySelector('#dm-fsize'), txt = host.querySelector('#dm-fsize-txt');
    if (sl) {
      sl.value = UI.fontScale;
      const paint = () => {
        const px = Math.round(14.5 * (UI.fontScale / 100) * 10) / 10;
        if (txt) txt.textContent = `${UI.fontScale}% · 글씨 ${px}px${UI.fontScale === 100 ? ' (기본)' : ''}`;
      };
      paint();
      sl.oninput = () => { UI.fontScale = +sl.value; savePrefs(); applyDisplay(); paint(); };
    }
    // 글씨체
    const seg = host.querySelector('[data-pref-seg="fontFace"]');
    if (seg) {
      const paintSeg = () => seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === UI.fontFace));
      paintSeg();
      seg.onclick = e => {
        const b = e.target.closest('button[data-v]');
        if (!b) return;
        UI.fontFace = b.dataset.v; savePrefs(); applyDisplay(); paintSeg();
      };
    }
    // 색상·무늬
    const cbox = host.querySelector('#dm-bg-colors');
    if (cbox) cbox.innerHTML = BG_COLORS.map(c =>
      `<button type="button" class="dm-bg-sw${UI.bgKind === 'color' && UI.bgValue === c.v ? ' on' : ''}" data-color="${c.v}"
        style="background-color:${c.v}"><span>${c.n}</span></button>`).join('');
    const pbox = host.querySelector('#dm-bg-patterns');
    if (pbox) pbox.innerHTML = Object.keys(BG_PATTERNS).map(id =>
      `<button type="button" class="dm-bg-sw dm-bg-pat${UI.bgKind === 'pattern' && UI.bgValue === id ? ' on' : ''}" data-pat="${id}"
        style="background-color:#0b0c10;background-image:${patternURL(id)}"><span>${PATTERN_LABEL[id] || ''}</span></button>`).join('');
    host.querySelectorAll('[data-color],[data-pat]').forEach(b => {
      b.onclick = () => {
        if (b.dataset.color) { UI.bgKind = 'color'; UI.bgValue = b.dataset.color; }
        else { UI.bgKind = 'pattern'; UI.bgValue = b.dataset.pat; }
        savePrefs(); applyDisplay(); loadDisplay();
        toastMini('배경을 바꿨어요 — 대화방에도 적용됐어요');
      };
    });
    // 로컬 토글(눈)
    host.querySelectorAll('[data-pref]').forEach(btn => {
      const k = btn.dataset.pref;
      const paint = () => btn.classList.toggle('on', !!UI[k]);
      paint();
      btn.onclick = () => { UI[k] = !UI[k]; savePrefs(); paint(); applyDisplay(); };
    });
    // 사진 배경
    const file = host.querySelector('#dm-bg-file');
    if (file) file.onchange = async e => {
      const f = e.target.files?.[0]; e.target.value = '';
      if (!f) return;
      const small = await shrinkTo(f, 720, 0.7);
      const rd = new FileReader();
      rd.onload = () => {
        try {
          UI.bgKind = 'photo'; UI.bgValue = rd.result; savePrefs();
          applyDisplay(); loadDisplay(); toastMini('배경을 바꿨어요');
        } catch (_) { toastMini('사진이 너무 커요 — 더 작은 사진으로 해주세요'); }
      };
      rd.readAsDataURL(small);
    };
    // 화면 방향 — standalone(홈 화면 앱)에서만 잠글 수 있다. 브라우저는 막혀 있다
    const ori = host.querySelector('#dm-set-orient'), osub = host.querySelector('#dm-orient-sub');
    if (ori) {
      const locked = !!UI.portraitLock;
      ori.classList.toggle('on', locked);
      const can = !!(screen.orientation && screen.orientation.lock);
      if (osub && !can) osub.textContent = '이 브라우저에선 고정할 수 없어요 — 홈 화면에 추가한 앱에서 됩니다';
      ori.onclick = async () => {
        UI.portraitLock = !UI.portraitLock; savePrefs();
        ori.classList.toggle('on', !!UI.portraitLock);
        try {
          if (UI.portraitLock) await screen.orientation.lock('portrait');
          else screen.orientation.unlock();
        } catch (_) { toastMini('이 브라우저에선 방향을 고정할 수 없어요 — 앱으로 설치하면 됩니다'); }
      };
    }
  }
  /* 사진 축소 공용 — 배경/전송이 같은 방식을 쓴다 */
  function shrinkTo(file, max, q) {
    return new Promise(resolve => {
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const long = Math.max(img.width, img.height);
        const r = long > max ? max / long : 1;
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * r); cv.height = Math.round(img.height * r);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        cv.toBlob(b => resolve(b || file), 'image/jpeg', q);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  /* 💾 데이터·저장공간 — 숫자는 추정이 아니라 브라우저가 알려주는 실측값을 쓴다 */
  const QUALITY_NOTE = {
    save:   '가로 1080px로 줄여 보내요. 카톡 "일반 화질"쯤 — 데이터가 가장 적게 들어요.',
    high:   '가로 1600px로 줄여 보내요. 눈으로 보기엔 원본과 거의 같아요(기본값).',
    origin: '찍은 그대로 보내요. 화질은 최고지만 용량이 크고 느려요.',
  };
  const fmtBytes = n => n >= 1073741824 ? (n / 1073741824).toFixed(2) + 'GB'
    : n >= 1048576 ? (n / 1048576).toFixed(1) + 'MB'
    : n >= 1024 ? Math.round(n / 1024) + 'KB' : (n || 0) + 'B';
  async function loadDataSet() {
    const host = ROOT.querySelector('#dm-dataset');
    if (!host) return;
    host.querySelectorAll('[data-pref]').forEach(btn => {
      const k = btn.dataset.pref;
      const paint = () => btn.classList.toggle('on', !!UI[k]);
      paint();
      btn.onclick = () => { UI[k] = !UI[k]; savePrefs(); paint(); };
    });
    const seg = host.querySelector('[data-pref-seg="photoQuality"]');
    const note = host.querySelector('#dm-quality-note');
    const paintSeg = () => {
      seg?.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === UI.photoQuality));
      if (note) note.textContent = QUALITY_NOTE[UI.photoQuality] || '';
    };
    paintSeg();
    if (seg) seg.onclick = e => {
      const b = e.target.closest('button[data-v]');
      if (!b) return;
      UI.photoQuality = b.dataset.v; savePrefs(); paintSeg();
    };
    // 실제 사용량 — navigator.storage.estimate()가 브라우저 실측치를 준다
    const val = host.querySelector('#dm-storage-val'), sub = host.querySelector('#dm-storage-sub');
    try {
      const est = await navigator.storage.estimate();
      if (val) val.textContent = fmtBytes(est.usage || 0);
      if (sub) sub.textContent = est.quota
        ? `이 브라우저가 갈라에 허용한 공간 ${fmtBytes(est.quota)} 중`
        : '캐시된 이미지·화면 파일';
    } catch (_) {
      if (val) val.textContent = '알 수 없음';
      if (sub) sub.textContent = '이 브라우저는 사용량을 알려주지 않아요';
    }
  }
  async function clearCaches(btn) {
    if (btn) { btn.disabled = true; btn.textContent = '지우는 중…'; }
    let freed = 0;
    try {
      const before = (await navigator.storage.estimate()).usage || 0;
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
      const after = (await navigator.storage.estimate()).usage || 0;
      freed = Math.max(0, before - after);
    } catch (_) {}
    if (btn) { btn.disabled = false; btn.textContent = '삭제'; }
    toastMini(freed ? `${fmtBytes(freed)}를 비웠어요` : '비울 임시 데이터가 없었어요');
    loadDataSet();
  }
  /* 📤 대화 내보내기 — 서버에 있다고 해서 '내 것'이 아닌 건 아니다.
     읽을 수 있는 텍스트로 뽑아준다(비밀대화는 원리상 제외). */
  async function exportChats(btn) {
    if (!ME) return;
    if (btn) { btn.disabled = true; btn.textContent = '모으는 중…'; }
    try {
      const { data: ths } = await supabase.from('dm_threads').select('id,user_lo,user_hi');
      const peers = (ths || []).map(t => (t.user_lo === ME ? t.user_hi : t.user_lo));
      await profilesFor(peers);
      let out = `GALLA 대화 내보내기\n생성: ${new Date().toLocaleString('ko-KR')}\n\n`;
      let n = 0;
      for (const t of (ths || [])) {
        const peer = t.user_lo === ME ? t.user_hi : t.user_lo;
        const name = PROFILES[peer]?.nickname || '상대';
        const { data: ms } = await supabase.from('dm_messages')
          .select('sender_id, kind, body, created_at, deleted_at')
          .eq('thread_id', t.id).order('created_at').limit(2000);
        const rows = (ms || []).filter(m => !m.deleted_at && m.kind !== 'e2e');
        if (!rows.length) continue;
        out += `\n───── ${name} 님과의 대화 (${rows.length}개) ─────\n`;
        rows.forEach(m => {
          const who = m.sender_id === ME ? '나' : name;
          const when = new Date(String(m.created_at) + 'Z').toLocaleString('ko-KR');
          const what = m.kind === 'text' ? (m.body || '')
            : m.kind === 'voice' ? '[음성 메시지]'
            : m.kind === 'image' ? '[사진]' : `[${m.kind}]`;
          out += `[${when}] ${who}: ${what}\n`;
          n++;
        });
      }
      out += `\n\n총 ${n}개 메시지 · 비밀대화는 이 기기에서만 풀리므로 포함되지 않았습니다.\n`;
      const blob = new Blob([out], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `galla-대화-${new Date().toISOString().slice(0, 10)}.txt`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toastMini(`${n}개 메시지를 내보냈어요`);
    } catch (e) {
      console.error('[dm] export', e);
      toastMini('내보내기에 실패했어요');
    }
    if (btn) { btn.disabled = false; btn.textContent = '내보내기'; }
  }

  /* 🔒 화면 잠금 — 이 기기에서만 쓰는 4자리 잠금.
     계정 비밀번호가 아니라 '어깨너머·잠깐 빌려준 폰' 대비용이라 로컬에만 둔다.
     평문 저장은 안 하고 해시만 남긴다. */
  async function pinHash(pin) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('galla-dm-lock:' + pin));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  function askPin(title, sub) {
    return new Promise(resolve => {
      const dim = document.createElement('div');
      dim.className = 'dm-pin-dim';
      dim.innerHTML = `<div class="dm-pin">
        <b>${esc(title)}</b><i>${esc(sub || '')}</i>
        <input type="password" inputmode="numeric" maxlength="4" class="dm-pin-in" autocomplete="off">
        <div class="dm-pin-btns">
          <button type="button" data-p="cancel">취소</button>
          <button type="button" data-p="ok" class="pri">확인</button>
        </div></div>`;
      document.body.appendChild(dim);
      const input = dim.querySelector('.dm-pin-in');
      setTimeout(() => input.focus(), 60);
      const done = v => { dim.remove(); resolve(v); };
      dim.onclick = e => {
        if (e.target === dim || e.target.closest('[data-p="cancel"]')) return done(null);
        if (e.target.closest('[data-p="ok"]')) return done(input.value.trim());
      };
      input.onkeydown = e => { if (e.key === 'Enter') done(input.value.trim()); };
    });
  }
  async function toggleLock(btn) {
    if (UI.lockPin) {
      const cur = await askPin('잠금 해제', '현재 비밀번호를 입력하세요');
      if (cur === null) return;
      if (await pinHash(cur) !== UI.lockPin) return toastMini('비밀번호가 달라요');
      UI.lockPin = ''; savePrefs();
      try { sessionStorage.removeItem('galla_dm_unlocked'); } catch (_) {}
      toastMini('화면 잠금을 껐어요');
    } else {
      const a = await askPin('화면 잠금 설정', '숫자 4자리를 정하세요');
      if (a === null) return;
      if (!/^\d{4}$/.test(a)) return toastMini('숫자 4자리로 입력해주세요');
      const b = await askPin('한 번 더', '같은 숫자를 다시 입력하세요');
      if (b === null) return;
      if (a !== b) return toastMini('두 번 입력한 값이 달라요');
      UI.lockPin = await pinHash(a); savePrefs();
      try { sessionStorage.setItem('galla_dm_unlocked', '1'); } catch (_) {}
      toastMini('이 기기에서 메시지를 열 때 물어볼게요');
    }
    paintLockBtn(btn);
  }
  function paintLockBtn(btn) {
    const b = btn || ROOT?.querySelector('#dm-set-lock');
    if (!b) return;
    b.textContent = UI.lockPin ? '켜짐' : '꺼짐';
    b.classList.toggle('ok', !!UI.lockPin);
  }
  /* 잠금이 켜져 있으면 DM을 열 때 한 번 묻는다(세션 내 1회) */
  async function ensureUnlocked() {
    if (!UI.lockPin) return true;
    try { if (sessionStorage.getItem('galla_dm_unlocked') === '1') return true; } catch (_) {}
    for (let i = 0; i < 3; i++) {
      const v = await askPin('메시지 잠금', '비밀번호 4자리를 입력하세요');
      if (v === null) return false;
      if (await pinHash(v) === UI.lockPin) {
        try { sessionStorage.setItem('galla_dm_unlocked', '1'); } catch (_) {}
        return true;
      }
      toastMini('비밀번호가 달라요');
    }
    return false;
  }

  async function loadSettings() {
    /* 메인은 '어디로 갈지'만 보여준다 — 세부 배선은 각 하위 화면의 로더가 맡는다.
       (한 화면에 다 늘어놓으면 설정이 많은 게 아니라 못 찾는 화면이 된다) */
    (async () => {
      await profilesFor([ME]);
      const me = PROFILES[ME] || {};
      const ava = ROOT.querySelector('#dm-set-ava');
      if (ava) ava.innerHTML = avaHTML(ME);
      const nick = ROOT.querySelector('#dm-set-nick');
      if (nick) nick.textContent = me.nickname || '나';
      const sub = ROOT.querySelector('#dm-set-sub');
      if (sub) sub.textContent = '프로필·닉네임 변경은 [관리]에서';
    })();
    const verEl = ROOT.querySelector('#dm-set-ver');
    if (verEl) {
      const v = ([...document.scripts].map(x => x.src).find(u => /[?&]v=/.test(u)) || '').match(/[?&]v=(\d+)/);
      verEl.textContent = 'GALLA · 버전 ' + (v ? v[1] : '-');
    }
  }

  /* 차단·숨김 목록 — 개인·보안 화면에서 쓴다(예전엔 loadSettings 안에 있었다) */
  const paintList = async (boxId, set, table, col) => {
    const box = ROOT.querySelector(boxId);
    if (!box) return;
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

  /* 🔐 개인·보안 — 메인에 흩어져 있던 항목을 한자리에 모았다 */
  async function loadPrivacy() {
    const host = ROOT.querySelector('#dm-privacy');
    if (!host) return;
    await loadPrefs(true);
    // 검색 허용
    const sBtn = host.querySelector('#dm-set-search');
    if (sBtn) {
      const paint = () => sBtn.classList.toggle('on', !!PREF.searchable);
      paint();
      sBtn.onclick = async () => {
        PREF.searchable = !PREF.searchable;
        paint();
        await supabase.from('dm_settings')
          .upsert({ user_id: ME, searchable: PREF.searchable }, { onConflict: 'user_id' });
        toastMini(PREF.searchable ? '검색으로 나를 찾을 수 있어요' : '검색에서 나를 숨겼어요');
      };
    }
    // 그룹 초대 게이트(서버 저장)
    const gate = host.querySelector('#dm-set-gate');
    if (gate) {
      const { data } = await supabase.from('dm_user_settings').select('gate_group_invite').eq('user_id', ME).maybeSingle();
      let on = !!data?.gate_group_invite;
      const paint = () => gate.classList.toggle('on', on);
      paint();
      gate.onclick = async () => {
        on = !on; paint();
        const { error } = await supabase.from('dm_user_settings')
          .upsert({ user_id: ME, gate_group_invite: on, updated_at: new Date().toISOString() });
        if (error) { on = !on; paint(); toastMini('설정을 저장하지 못했어요'); }
        else toastMini(on ? '모르는 사람의 초대는 먼저 확인할게요' : '초대를 바로 받습니다');
      };
    }
    // 화면 잠금
    const lockBtn = host.querySelector('#dm-set-lock');
    if (lockBtn) { paintLockBtn(lockBtn); lockBtn.onclick = () => toggleLock(lockBtn); }
    // 차단·숨김 목록
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
  /* ---------- 📟 삐삐 (음성사서함) — 채팅과 다른 문법이라 별도 모듈 ---------- */
  async function ensurePager() {
    if (!window.GALLA_PAGER) { try { await loadScript('/js/dm-pager.js'); } catch (_) {} }
    return !!window.GALLA_PAGER;
  }
  function paintPagerDot(n) {
    const dot = ROOT?.querySelector('#pgr-tab-dot');
    if (!dot) return;
    dot.hidden = !n;
    dot.textContent = n > 99 ? '99+' : (n || '');
  }
  /* 삐삐 탭에 들어가지 않아도 미확인 수를 안다(뱃지 전용 가벼운 조회) */
  async function refreshPagerBadge() {
    if (!ME) return;
    try {
      const { count } = await supabase.from('pager_messages')
        .select('id', { count: 'exact', head: true })
        .eq('box_owner', ME).is('listened_at', null);
      paintPagerDot(count || 0);
    } catch (_) {}
  }
  async function loadPager() {
    const host = ROOT.querySelector('#dm-pager');
    host.innerHTML = `<div class="dm-loading">삐삐를 켜는 중…</div>`;
    if (!(await ensurePager())) { host.innerHTML = `<div class="dm-set-empty">삐삐를 불러오지 못했어요</div>`; return; }
    window.GALLA_PAGER.mount(host);
    window.GALLA_pagerRefresh = () => window.GALLA_PAGER.mount(host);
  }
  async function pagerLeave(peer, name) {
    if (!(await ensurePager())) return toastMini('삐삐를 불러오지 못했어요');
    window.GALLA_PAGER.leaveTo(peer, name || nickCache[peer] || PROFILES[peer]?.nickname);
  }
  window.GALLA_openPager = () => {
    if (PAGE_MODE()) { showView('inbox'); setTab('pager'); }
    else location.href = 'dm.html?pager=1';
  };

  /* ---------- 난장: 오픈 채팅방 (카카오 오픈채팅 문법) ----------
     방 목록·멤버 수는 공개, 메시지는 참여자만(RLS가 강제) — 미참여 방은 게이트 화면 */
  /* ---------- 단체 채팅: 친구 골라 비공개 그룹(kind='group') — 채팅 탭에 산다 ---------- */
  async function initGnew(mode) {
    GMODE = mode || 'create';
    GSEL = new Set();
    const invite = GMODE === 'invite';
    ROOT.querySelector('#dm-gnew-headtitle').textContent = invite ? '멤버 초대' : '단체 채팅';
    ROOT.querySelector('.dm-gnew-titlewrap').hidden = invite;   // 초대엔 방 이름이 없다
    ROOT.querySelector('#dm-gnew-title').value = '';
    const box = ROOT.querySelector('#dm-gnew-list');
    box.innerHTML = `<div class="dm-loading">친구 불러오는 중…</div>`;
    const [{ data: ing }, { data: ers }, memRes] = await Promise.all([
      supabase.from('follows').select('following').eq('follower', ME),
      supabase.from('follows').select('follower').eq('following', ME),
      invite ? supabase.from('open_room_members').select('user_id').eq('room_id', curRoom.id)
             : Promise.resolve({ data: [] }),
    ]);
    const already = new Set((memRes.data || []).map(m => m.user_id));
    const mine = new Set((ing || []).map(r => r.following));
    const ids = [...new Set((ers || []).map(r => r.follower))]
      .filter(id => mine.has(id) && !already.has(id));
    if (!ids.length) {
      box.innerHTML = invite
        ? `<div class="dm-empty">초대할 수 있는 친구가 없어요.<br><span>맞팔 친구가 모두 이미 방에 있어요.</span></div>`
        : `<div class="dm-empty">맞팔 친구가 있어야 단체 채팅을 만들 수 있어요.</div>`;
      paintGnewCnt(); return;
    }
    await profilesFor(ids);
    box.innerHTML = ids.map(id => `
      <button class="dm-friend dm-gpick" data-uid="${id}" type="button">
        ${avaHTML(id)}
        <span class="dm-thread-mid"><span class="dm-thread-name">${esc(nickCache[id] || '익명')}</span></span>
        <span class="dm-gcheck"></span>
      </button>`).join('');
    box.querySelectorAll('.dm-gpick').forEach(el => el.addEventListener('click', () => {
      const id = el.dataset.uid;
      if (GSEL.has(id)) GSEL.delete(id); else GSEL.add(id);
      el.classList.toggle('sel', GSEL.has(id));
      paintGnewCnt();
    }));
    staggerRows(box, '.dm-gpick');
    paintGnewCnt();
  }
  function paintGnewCnt() {
    const invite = GMODE === 'invite';
    const min = invite ? 1 : 2;
    ROOT.querySelector('#dm-gnew-cnt').textContent =
      GSEL.size ? `— ${GSEL.size}명 선택` : (invite ? '' : '— 2명부터 (1명이면 그냥 1:1)');
    const go = ROOT.querySelector('#dm-gnew-go');
    go.disabled = GSEL.size < min;
    go.innerHTML = `${ICONS.crew} ${invite ? '초대하기' : '만들기'}`;
  }
  async function createGroup() {
    if (GMODE === 'invite') {
      if (!GSEL.size || !curRoom) return;
      const { error } = await supabase.from('open_room_members')
        .insert([...GSEL].map(u => ({ room_id: curRoom.id, user_id: u })));
      if (error) { console.error('[dm] invite', error); return; }
      // 멤버 수는 서버 트리거가 정답 — 방 행을 다시 읽어 헤더에 반영
      const { data: fresh } = await supabase.from('open_rooms')
        .select('*').eq('id', curRoom.id).single();
      if (fresh) curRoom = fresh;
      ROOT.querySelector('#dm-room-sub').textContent = `${curRoom.member_count}명`;
      showView('room');
      return;
    }
    if (GSEL.size < 2) return;
    let title = ROOT.querySelector('#dm-gnew-title').value.trim();
    if (!title) {
      const names = [...GSEL].slice(0, 3).map(id => nickCache[id] || '익명');
      title = names.join(', ') + (GSEL.size > 3 ? ` 외 ${GSEL.size - 3}` : '');
    }
    const { data: rid, error } = await supabase.rpc('open_group_create',
      { p_title: title.slice(0, 30), p_members: [...GSEL] });
    if (error) { console.error('[dm] group create', error); return; }
    const { data: r } = await supabase.from('open_rooms').select('*').eq('id', rid).single();
    if (r) { MY_ROOMS.add(r.id); openRoom(r); }
  }

  /* 멤버 보기 — 방장 먼저, 방장 배지 */
  async function openRoomMembers() {
    showView('roommem');
    const box = ROOT.querySelector('#dm-roommem');
    box.innerHTML = `<div class="dm-loading">불러오는 중…</div>`;
    const { data: mem } = await supabase.from('open_room_members')
      .select('user_id,joined_at').eq('room_id', curRoom.id).order('joined_at');
    const ids = (mem || []).map(m => m.user_id)
      .sort((a, b) => (b === curRoom.owner_id) - (a === curRoom.owner_id));
    await profilesFor(ids);
    box.innerHTML = `<div class="dm-sec">${ICONS.crew}멤버 ${ids.length}명</div>` + ids.map(id => `
      <div class="dm-friend dm-mem-row">
        ${avaHTML(id)}
        <span class="dm-thread-mid"><span class="dm-thread-name">${esc(nickCache[id] || '익명')}${id === ME ? ' <i class="dm-mem-me">나</i>' : ''}</span></span>
        ${id === curRoom.owner_id ? `<span class="dm-mem-owner">방장</span>` : ''}
      </div>`).join('');
    staggerRows(box, '.dm-mem-row');
  }

  /* 만들기 폼과 '난장 열기' 토글 바는 상호 배타 — 같이 보이면 '열기'가 두 개라 헷갈린다 */
  function roomFormShow(show) {
    ROOT.querySelector('#dm-room-form').hidden = !show;
    ROOT.querySelector('.dm-room-bar').hidden = show;
    if (show) ROOT.querySelector('#dm-room-title').focus();
  }
  async function loadRooms() {
    const box = ROOT.querySelector('#dm-room-list');
    if (!box.innerHTML) box.innerHTML = `<div class="dm-loading">불러오는 중…</div>`;
    const [{ data: rooms }, { data: mine }] = await Promise.all([
      supabase.from('open_rooms')
        .select('id,owner_id,title,topic,member_count,last_message,last_message_at,created_at,kind')
        .eq('kind', 'open')
        .order('created_at', { ascending: false }).limit(60),
      supabase.from('open_room_members').select('room_id').eq('user_id', ME),
    ]);
    MY_ROOMS = new Set((mine || []).map(r => r.room_id));
    ROOMS = (rooms || []).sort((a, b) =>
      new Date(b.last_message_at || b.created_at) - new Date(a.last_message_at || a.created_at));
    const joined = ROOMS.filter(r => MY_ROOMS.has(r.id));
    const others = ROOMS.filter(r => !MY_ROOMS.has(r.id));
    if (!ROOMS.length) {
      box.innerHTML = `<div class="dm-empty">아직 열린 난장이 없어요.<br><span>첫 판을 벌여보세요 — 주제는 자유.</span></div>`;
      return;
    }
    const sec = t => `<div class="dm-sec">${t}</div>`;
    box.innerHTML =
      (joined.length ? sec('참여 중') + joined.map(roomRow).join('') : '') +
      (others.length ? sec('둘러보기') + others.map(roomRow).join('') : '');
    box.querySelectorAll('.dm-room-row').forEach(el => {
      el.addEventListener('click', () => {
        const r = ROOMS.find(x => x.id === el.dataset.rid);
        if (r) openRoom(r);
      });
    });
    staggerRows(box, '.dm-room-row');
  }
  function roomRow(r) {
    const t = r.last_message_at || r.created_at;
    const mineRoom = MY_ROOMS.has(r.id);
    return `
      <button class="dm-thread dm-room-row" data-rid="${r.id}">
        <span class="dm-ava" style="background:linear-gradient(135deg,${avatarColor(r.id)},#1a1c26)">${esc((r.title || '난').charAt(0))}</span>
        <span class="dm-thread-mid">
          <span class="dm-thread-name">${esc(r.title)}<span class="dm-room-cnt">${ICONS.crew}${r.member_count}</span></span>
          <span class="dm-thread-prev">${esc(mineRoom ? (r.last_message || r.topic || '대화를 시작해보세요') : (r.topic || r.last_message || '새 난장'))}</span>
        </span>
        <span class="dm-thread-side"><span class="dm-thread-time">${timeLabel(t)}</span></span>
      </button>`;
  }
  async function onCreateRoom(e) {
    e.preventDefault();
    const title = ROOT.querySelector('#dm-room-title').value.trim();
    const topic = ROOT.querySelector('#dm-room-topic').value.trim();
    if (!title) return;
    const { data: rid, error } = await supabase.rpc('open_room_create', { p_title: title, p_topic: topic });
    if (error) { console.error('[dm] room create', error); return; }
    roomFormShow(false);
    ROOT.querySelector('#dm-room-title').value = '';
    ROOT.querySelector('#dm-room-topic').value = '';
    await loadRooms();
    const r = ROOMS.find(x => x.id === rid);
    if (r) openRoom(r);
  }
  async function openRoom(r) {
    curRoom = r;
    ROOT.querySelector('#dm-room-name').textContent = r.title;
    ROOT.querySelector('#dm-room-sub').textContent = `${r.member_count}명`;
    showView('room');
    paintRoomGate(!MY_ROOMS.has(r.id));
    if (MY_ROOMS.has(r.id)) {
      await loadRoomMsgs();
      attachRoom(r.id);
      setTimeout(() => ROOT.querySelector('#dm-room-input')?.focus(), 50);
    }
  }
  /* 미참여 방: 메시지는 RLS가 막는다 — 주제 소개 + 뛰어들기 게이트 */
  function paintRoomGate(show) {
    const gate = ROOT.querySelector('#dm-room-gate');
    const bar = ROOT.querySelector('#dm-room-send');
    const msgs = ROOT.querySelector('#dm-room-msgs');
    gate.hidden = !show; bar.hidden = show; msgs.hidden = show;
    if (!show) return;
    const r = curRoom;
    gate.innerHTML = `
      <span class="dm-gate-ava dm-ava lg" style="background:linear-gradient(135deg,${avatarColor(r.id)},#1a1c26)">${esc((r.title || '난').charAt(0))}</span>
      <div class="dm-gate-title">${esc(r.title)}</div>
      ${r.topic ? `<div class="dm-gate-topic">${esc(r.topic)}</div>` : ''}
      <div class="dm-gate-cnt">${ICONS.crew} ${r.member_count}명이 떠드는 중</div>
      <button type="button" class="dm-gate-join" id="dm-room-join-btn">${ICONS.bolt} 뛰어들기</button>`;
    gate.querySelector('#dm-room-join-btn').onclick = async () => {
      const { error } = await supabase.from('open_room_members').insert({ room_id: r.id, user_id: ME });
      if (error) { console.error('[dm] room join', error); return; }
      MY_ROOMS.add(r.id); r.member_count++;
      ROOT.querySelector('#dm-room-sub').textContent = `${r.member_count}명`;
      paintRoomGate(false);
      await loadRoomMsgs();
      attachRoom(r.id);
    };
  }
  async function loadRoomMsgs() {
    const wrap = ROOT.querySelector('#dm-room-msgs');
    wrap.innerHTML = `<div class="dm-loading">불러오는 중…</div>`;
    const { data: msgs } = await supabase.from('open_messages')
      .select('id,sender_id,body,kind,created_at')
      .eq('room_id', curRoom.id).order('created_at', { ascending: false }).limit(100);
    const list = (msgs || []).reverse();
    await profilesFor(list.map(m => m.sender_id));
    wrap.innerHTML = list.map(roomBubbleHTML).join('');
    [...wrap.children].slice(-12).forEach((el, i) => { el.style.setProperty('--i', i); el.classList.add('in'); });
    wrap.scrollTop = wrap.scrollHeight;
  }
  /* 단체방 문법: 남의 말은 아바타+닉네임을 단다(1:1엔 없던 것) */
  function roomBubbleHTML(m) {
    const mine = m.sender_id === ME;
    const bubble = `<div class="dm-bubble ${mine ? 'me' : 'you'}" data-id="${m.id}">
        <span class="dm-bub-body">${esc(m.body)}</span>
        <span class="dm-bub-time">${hhmm(m.created_at)}</span>
      </div>`;
    if (mine) return bubble;
    return `<div class="dm-gmsg" data-id="${m.id}">
        <span class="dm-gava" data-user="${m.sender_id}">${avaHTML(m.sender_id, 'sm')}</span>
        <span class="dm-gcol">
          <span class="dm-gname">${esc(nickCache[m.sender_id] || '익명')}</span>
          ${bubble}
        </span>
      </div>`;
  }
  function appendRoomMsg(m) {
    const wrap = ROOT.querySelector('#dm-room-msgs');
    if (wrap.querySelector(`[data-id="${m.id}"]`)) return;   // 실시간·로컬 중복 방지
    const near = wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight < 80;
    wrap.insertAdjacentHTML('beforeend', roomBubbleHTML(m));
    wrap.lastElementChild?.classList.add('new');
    if (near || m.sender_id === ME) wrap.scrollTop = wrap.scrollHeight;
  }
  function attachRoom(rid) {
    detachRoom();
    // ⚠️ 핸들러는 지역 ch를 참조 — 모듈 변수(roomChan)를 참조하면 방 전환 경합에 진다(1:1에서 배운 것)
    const ch = supabase.channel('openroom:' + rid)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'open_messages', filter: 'room_id=eq.' + rid },
        async ({ new: m }) => {
          if (curRoom?.id !== rid) return;
          await profilesFor([m.sender_id]);
          appendRoomMsg(m);
        })
      .subscribe();
    roomChan = ch;
  }
  function detachRoom() {
    if (roomChan) { try { supabase.removeChannel(roomChan); } catch (_) {} roomChan = null; }
  }
  async function onRoomSend(e) {
    e.preventDefault();
    const ta = ROOT.querySelector('#dm-room-input');
    const body = ta.value.trim();
    if (!body || !curRoom) return;
    ta.value = ''; ta.style.height = 'auto';
    const btn = ROOT.querySelector('#dm-room-send .dm-send');
    if (btn) { btn.classList.remove('fly'); void btn.offsetWidth; btn.classList.add('fly'); }
    const { data, error } = await supabase.from('open_messages')
      .insert({ room_id: curRoom.id, sender_id: ME, body }).select().single();
    if (error) { console.error('[dm] room send', error); return; }
    appendRoomMsg(data);
    window.GALLA_pushSend?.('room', data.id);
  }
  function roomMenu(anchor) {
    if (!curRoom) return;
    const r0 = anchor.getBoundingClientRect();
    const own = curRoom.owner_id === ME;
    const member = MY_ROOMS.has(curRoom.id);
    const grp = curRoom.kind === 'group';
    const items = [{ k: 'members', label: '멤버 보기' }];
    if (member) items.push({ k: 'invite', label: '멤버 초대' });
    if (own) items.push({ k: 'close', label: (grp ? '채팅방' : '난장') + ' 닫기 (모두 해산)' });
    else {
      items.push({ k: 'report', label: '신고하기' });
      if (member) items.push({ k: 'leave', label: '나가기' });
    }
    popMenu(r0.right - 190, r0.bottom + 6, items, async k => {
      if (k === 'members') return openRoomMembers();
      if (k === 'invite') { showView('gnew'); initGnew('invite'); return; }
      if (k === 'report') return reportFlow('open_room', curRoom.id, r0.right - 190, r0.bottom + 6);
      if (k === 'close' && !confirm('닫으면 대화가 모두 사라져요. 닫을까요?')) return;
      if (k === 'close') await supabase.from('open_rooms').delete().eq('id', curRoom.id);
      else await supabase.from('open_room_members').delete()
        .eq('room_id', curRoom.id).eq('user_id', ME);
      const wasGrp = grp;
      detachRoom(); curRoom = null;
      showView('inbox');
      if (wasGrp) { setTab('chats'); } else setTab('rooms');
    });
  }

  /* 📁 채팅방 폴더 — 대화가 쌓이면 목록이 무너진다. 계정에 저장해 폰을 바꿔도 그대로. */
  let FOLDERS = [], THREAD_FOLDER = {}, CUR_FOLDER = 'all';
  async function loadFolders() {
    const [{ data: fs }, { data: tf }] = await Promise.all([
      supabase.from('dm_folders').select('id,name,sort').order('sort'),
      supabase.from('dm_thread_folders').select('thread_id,folder_id'),
    ]);
    FOLDERS = fs || [];
    THREAD_FOLDER = {};
    (tf || []).forEach(r => { THREAD_FOLDER[r.thread_id] = r.folder_id; });
  }
  function paintFolderBar() {
    const bar = ROOT.querySelector('#dm-folders');
    if (!bar) return;
    bar.hidden = !FOLDERS.length;
    if (!FOLDERS.length) return;
    bar.innerHTML = `<button type="button" class="dm-fchip${CUR_FOLDER === 'all' ? ' on' : ''}" data-f="all">전체</button>` +
      FOLDERS.map(f => `<button type="button" class="dm-fchip${CUR_FOLDER === f.id ? ' on' : ''}" data-f="${f.id}">${esc(f.name)}</button>`).join('');
  }
  async function assignFolder(threadId) {
    const opts = FOLDERS.map(f => `<button type="button" data-fid="${f.id}">${esc(f.name)}${THREAD_FOLDER[threadId] === f.id ? ' ✓' : ''}</button>`).join('');
    const dim = document.createElement('div');
    dim.className = 'dm-pin-dim';
    dim.innerHTML = `<div class="dm-pin dm-folder-pick">
      <b>폴더로 옮기기</b><i>대화를 정리해두면 찾기 쉬워요</i>
      <div class="dm-folder-list">${opts || '<span class="dm-set-empty">아직 폴더가 없어요</span>'}</div>
      <div class="dm-pin-btns">
        <button type="button" data-fid="">폴더에서 빼기</button>
        <button type="button" data-new="1" class="pri">+ 새 폴더</button>
      </div></div>`;
    document.body.appendChild(dim);
    dim.onclick = async e => {
      if (e.target === dim) return dim.remove();
      const nw = e.target.closest('[data-new]');
      if (nw) {
        const name = (prompt('폴더 이름 (12자 이내)') || '').trim();
        if (!name) return;
        const { data, error } = await supabase.from('dm_folders')
          .insert({ user_id: ME, name: name.slice(0, 12), sort: FOLDERS.length }).select().single();
        if (error) return toastMini('폴더를 만들지 못했어요');
        FOLDERS.push(data);
        await supabase.from('dm_thread_folders').upsert({ user_id: ME, thread_id: threadId, folder_id: data.id });
        THREAD_FOLDER[threadId] = data.id;
        dim.remove(); paintFolderBar(); loadInbox();
        return;
      }
      const b = e.target.closest('[data-fid]');
      if (!b) return;
      const fid = b.dataset.fid;
      if (fid) {
        await supabase.from('dm_thread_folders').upsert({ user_id: ME, thread_id: threadId, folder_id: fid });
        THREAD_FOLDER[threadId] = fid;
      } else {
        await supabase.from('dm_thread_folders').delete().eq('user_id', ME).eq('thread_id', threadId);
        delete THREAD_FOLDER[threadId];
      }
      dim.remove(); paintFolderBar(); loadInbox();
    };
  }

  /* 🚪 대기 중인 그룹 초대 — 설정을 켠 사람에게만 생긴다.
     읽기 전에 '누가·어떤 방으로' 부르는지 보고 결정하게 한다. */
  async function paintInvites() {
    const host = ROOT.querySelector('#dm-invites');
    if (!host) return;
    const { data: pend } = await supabase.from('open_room_members')
      .select('room_id').eq('user_id', ME).eq('state', 'pending');
    const ids = (pend || []).map(r => r.room_id);
    if (!ids.length) { host.hidden = true; host.innerHTML = ''; return; }
    const { data: rooms } = await supabase.from('open_rooms')
      .select('id,title,owner_id,member_count').in('id', ids);
    await profilesFor((rooms || []).map(r => r.owner_id));
    host.hidden = false;
    host.innerHTML = (rooms || []).map(r => `
      <div class="dm-invite" data-room="${r.id}">
        <span class="dm-invite-tx">
          <b>${esc(r.title || '단체 채팅')}</b>
          <i>${esc(PROFILES[r.owner_id]?.nickname || '누군가')}님이 초대했어요 · ${r.member_count || 0}명</i>
        </span>
        <button type="button" class="dm-invite-no" data-inv="no">거절</button>
        <button type="button" class="dm-invite-ok" data-inv="ok">참여</button>
      </div>`).join('');
    host.onclick = async e => {
      const b = e.target.closest('[data-inv]');
      if (!b) return;
      const row = b.closest('[data-room]');
      const accept = b.dataset.inv === 'ok';
      const { error } = await supabase.rpc('room_invite_respond', { p_room: row.dataset.room, p_accept: accept });
      if (error) return toastMini('처리하지 못했어요');
      toastMini(accept ? '참여했어요' : '초대를 거절했어요');
      loadInbox();
    };
  }

  async function loadInbox() {
    const box = ROOT.querySelector('#dm-inbox');
    // 단체 채팅(kind='group')은 RLS가 '내가 멤버인 방'만 돌려준다 — 채팅 탭에 1:1과 섞어 보인다
    const [{ data: threads }, { data: groups }] = await Promise.all([
      supabase.from('dm_threads')
        .select('id,user_lo,user_hi,last_message,last_sender,last_message_at')
        .order('last_message_at', { ascending: false }),
      supabase.from('open_rooms')
        .select('id,owner_id,title,member_count,last_message,last_message_at,created_at,kind')
        .eq('kind', 'group'),
      loadPrefs(),
      loadFolders(),
    ]);
    GROUPS = groups || [];
    paintFolderBar();
    paintInvites();
    (threads || []).forEach(t => { PEER_THREADS[t.user_lo === ME ? t.user_hi : t.user_lo] = t.id; });
    // 나간 방은 제외하되, 나간 뒤 새 메시지가 왔으면 다시 보인다(카톡 문법)
    const list = (threads || []).filter(t => {
      const p = PREF.threads[t.id];
      if (p?.left_at && new Date(t.last_message_at) <= new Date(p.left_at)) return false;
      if (CUR_FOLDER !== 'all' && THREAD_FOLDER[t.id] !== CUR_FOLDER) return false;   // 폴더 필터
      return true;
    });
    if (!list.length && !GROUPS.length) {
      box.innerHTML = `<div class="dm-empty">아직 대화가 없어요.<br><span>오른쪽 위 연필을 눌러 새 메시지를 시작하세요.</span></div>`;
      return;
    }
    const peers = list.map(t => t.user_lo === ME ? t.user_hi : t.user_lo);
    await nicksFor(peers);
    const { data: unread } = await supabase.from('dm_messages')
      .select('thread_id').is('read_at', null).neq('sender_id', ME);
    const unreadBy = {};
    (unread || []).forEach(m => { unreadBy[m.thread_id] = (unreadBy[m.thread_id] || 0) + 1; });

    // 정렬: 📌 고정이 항상 맨 위 → 그 안에서 선택한 기준. 단체 채팅도 같은 시간축에 섞인다
    const items = [
      ...list.map(t => ({ g: null, t, at: t.last_message_at || 0,
        pin: PREF.threads[t.id]?.pinned ? 1 : 0, unread: unreadBy[t.id] || 0 })),
      ...GROUPS.map(g => ({ g, t: null, at: g.last_message_at || g.created_at, pin: 0, unread: 0 })),
    ];
    items.sort((a, b) => {
      if (a.pin !== b.pin) return b.pin - a.pin;
      if (SORT === 'unread' && a.unread !== b.unread) return b.unread - a.unread;
      return new Date(b.at) - new Date(a.at);
    });

    box.innerHTML = items.map(it => {
      if (it.g) {
        const g = it.g;
        return `
        <button class="dm-thread dm-gchat" data-gid="${g.id}">
          <span class="dm-ava" style="background:linear-gradient(135deg,${avatarColor(g.id)},#1a1c26)">${esc((g.title || '단').charAt(0))}</span>
          <span class="dm-thread-mid">
            <span class="dm-thread-name">${esc(g.title)}<span class="dm-room-cnt">${ICONS.crew}${g.member_count}</span></span>
            <span class="dm-thread-prev">${esc(g.last_message || '대화를 시작해보세요')}</span>
          </span>
          <span class="dm-thread-side"><span class="dm-thread-time">${timeLabel(it.at)}</span></span>
        </button>`;
      }
      const t = it.t;
      const peer = t.user_lo === ME ? t.user_hi : t.user_lo;
      const name = nickCache[peer] || '익명';
      const u = unreadBy[t.id] || 0;
      const pinned = !!PREF.threads[t.id]?.pinned;
      // 서버 미리보기(dm_touch_thread)가 주는 이모지 접두를 라인 SVG로 — DM 아이콘은 전부 SVG 원칙
      const lm = t.last_message || '';
      const pvIcon = lm.startsWith('📷') || lm.startsWith('🎬') ? ICONS.img
        : lm.startsWith('🔗') ? ICONS.link
        : lm.startsWith('🔒') ? ICONS.lock
        : lm.startsWith('🎤') ? ICONS.mic
        : lm.startsWith('📞') ? ICONS.phone : '';
      const pvText = pvIcon ? lm.replace(/^(📷|🎬|🔗|🔒|🎤|📞)\s*/, '') : lm;
      const preview = (t.last_sender === ME ? '나: ' : '');
      return `
        <button class="dm-thread${u ? ' dm-unread' : ''}" data-tid="${t.id}" data-peer="${peer}" data-name="${esc(name)}">
          ${avaHTML(peer)}
          <span class="dm-thread-mid">
            <span class="dm-thread-name">${pinned ? ICONS.pin : ''}${esc(name)}</span>
            <span class="dm-thread-prev">${esc(preview)}${pvIcon}${esc(pvText)}</span>
          </span>
          ${EDIT ? editChipsThread(t.id) : `<span class="dm-thread-side">
            <span class="dm-thread-time">${t.last_message_at ? timeLabel(t.last_message_at) : ''}</span>
            ${u ? `<span class="dm-dot">${u}</span>` : ''}
          </span>`}
        </button>`;
    }).join('');
    box.querySelectorAll('.dm-thread[data-tid]').forEach(el => {
      el.addEventListener('click', () => { if (!EDIT) openThread(el.dataset.tid, el.dataset.peer, el.dataset.name); });
    });
    box.querySelectorAll('.dm-gchat').forEach(el => {
      el.addEventListener('click', () => {
        if (EDIT) return;
        const g = GROUPS.find(x => x.id === el.dataset.gid);
        if (g) { MY_ROOMS.add(g.id); openRoom(g); }
      });
    });
    if (EDIT) bindEditChips(box);
    staggerRows(box, '.dm-thread');
  }

  /* ---------- 대화 ---------- */
  function paintSecretUI() {
    const ta = ROOT.querySelector('#dm-input');
    const bar = ROOT.querySelector('#dm-form');
    const on = curThread && secretOn(curThread);
    if (ta) ta.placeholder = on ? '비밀 메시지 입력… (이 기기에서만 열려요)' : '메시지 입력…';
    if (bar) bar.classList.toggle('secret', !!on);
  }
  function paintExpBanner() {
    const view = ROOT.querySelector('[data-view="thread"]');
    let note = view.querySelector('.dm-exp-note');
    if (!curExpire) { note?.remove(); return; }
    if (!note) {
      note = document.createElement('div');
      note.className = 'dm-exp-note';
      view.querySelector('.dm-head').after(note);
    }
    note.innerHTML = `${ICONS.timer} 메시지가 <b>${EXP_LABEL[curExpire]}</b> 뒤 사라져요`;
  }
  async function openThread(tid, peer, name) {
    curThread = tid; curPeer = peer;
    paintSecretUI();
    curExpire = null; paintExpBanner();
    supabase.from('dm_threads').select('expire_secs').eq('id', tid).maybeSingle()
      .then(({ data }) => { if (curThread === tid) { curExpire = data?.expire_secs || null; paintExpBanner(); } });
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
    PEER_THREADS[peer] = tid;
    const hist = secHist(tid).map(r => {
      E2E_PLAIN[r.id] = r.b;
      return { id: r.id, sender_id: r.s, kind: 'e2e', body: '', created_at: new Date(r.ts).toISOString() };
    });
    const merged = [...(msgs || []), ...hist]
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    merged.forEach(m => { MSGS[m.id] = m; });
    renderMsgs(merged);
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
    } else if (m.kind === 'gif' && m.meta?.url) {
      inner = `<img class="dm-bub-img dm-stkimg" src="${esc(m.meta.url)}" loading="lazy" alt="이모티콘">`;
    } else if (m.kind === 'voice' && m.meta?.url) {
      const d = m.meta.dur || 0;
      inner = `<span class="dm-voice">
          <button type="button" class="dm-vplay" data-url="${esc(m.meta.url)}">${ICONS.play}</button>
          <span class="dm-vwave"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>
          <b>${Math.floor(d / 60)}:${String(d % 60).padStart(2, '0')}</b>
        </span>`;
    } else if (m.kind === 'call') {
      const v = !!m.meta?.video;
      const missed = m.meta?.status !== 'ended';
      const d = m.meta?.dur || 0;
      inner = `<span class="dm-call-card${missed ? ' missed' : ''}">
          ${ICONS.phone}
          <span class="dm-call-mid">
            <b>${missed ? '부재중 ' : ''}${v ? '면상톡' : '육성톡'}</b>
            <i>${missed ? (mine ? '응답 없음' : '전화가 왔었어요') : `${Math.floor(d / 60)}분 ${d % 60}초`}</i>
          </span>
          <button type="button" class="dm-callback" data-peer="${mine ? curPeer : m.sender_id}" data-video="${v ? 1 : 0}">다시 걸기</button>
        </span>`;
    } else if (m.kind === 'e2e') {
      const plain = E2E_PLAIN[m.id];
      inner = plain != null && plain !== false
        ? `<span class="dm-bub-body">${esc(plain)}</span><span class="dm-e2e-mark">${ICONS.lock}</span>`
        : `<span class="dm-bub-body dm-e2e-wait" data-e2e="${m.id}">${ICONS.lock} ${plain === false ? '이 기기에서 열 수 없는 비밀 메시지' : '비밀 메시지'}</span>`;
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
      inner = `<span class="dm-bub-body">${markKeywords(esc(m.body))}</span>`;
    }
    // 인용(답장)
    let quote = '';
    if (m.reply_to && MSGS[m.reply_to]) {
      const q = MSGS[m.reply_to];
      const qhtml = q.deleted_at ? `${ICONS.block} 삭제된 메시지`
        : q.kind === 'e2e' ? `${ICONS.lock} 비밀 메시지`
        : q.kind === 'image' ? `${ICONS.img} 사진`
        : q.kind === 'voice' ? `${ICONS.mic} 음성 메시지`
        : q.kind === 'gif' ? `${ICONS.img} 이모티콘`
        : q.kind === 'share' ? `${ICONS.link} ${esc(String(q.meta?.title || '공유').slice(0, 40))}`
        : esc(String(q.body || '').slice(0, 60));
      quote = `<span class="dm-quote">${qhtml}</span>`;
    }
    return `
      <div class="dm-bubble ${mine ? 'me' : 'you'}${m.kind === 'gif' ? ' stk' : ''}" data-id="${m.id}" data-mine="${mine ? 1 : 0}" data-at="${m.created_at}" data-del="${m.deleted_at ? 1 : 0}">
        ${quote}${inner}
        <span class="dm-bub-time">${hhmm(m.created_at)}${mine ? `<b class="dm-receipt" data-read="${m.read_at ? 1 : 0}">${m.read_at ? '읽음' : ''}</b>` : ''}</span>
        <span class="dm-reacts" data-for="${m.id}">${reactChips(m.id)}</span>
      </div>`;
  }
  /* ── 📬 비밀대화 우편함 — 서버엔 발신자 없는 암호문만, 역사는 이 기기에만 ── */
  function secHist(tid) {
    try { return JSON.parse(localStorage.getItem('galla_sec_hist:' + tid) || '[]'); }
    catch (_) { return []; }
  }
  function secHistAdd(tid, rec) {
    const h = secHist(tid);
    if (h.some(x => x.id === rec.id)) return;
    h.push(rec);
    while (h.length > 200) h.shift();
    try { localStorage.setItem('galla_sec_hist:' + tid, JSON.stringify(h)); } catch (_) {}
  }
  function attachMailbox() {
    if (mailChan || !ME) return;
    mailChan = supabase.channel('mailbox:' + ME)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'secret_mailbox', filter: 'recipient=eq.' + ME },
        ({ new: row }) => handleMail(row))
      .subscribe();
    drainMailbox();   // 접속 없던 사이 쌓인 우편 수거
  }
  async function drainMailbox() {
    const { data } = await supabase.from('secret_mailbox').select('*').order('created_at');
    for (const row of (data || [])) await handleMail(row);
  }
  /* 발신자 칸이 없으므로 '내 비밀대화 상대들'의 키로 시도-복호한다 —
     GCM 인증 실패 = 그 상대가 아님. 성공한 키의 주인이 곧 발신자다(키가 서명이다). */
  async function handleMail(row) {
    if (!window.GALLA_e2e?.supported() || !row?.payload) return;
    if (!Object.keys(PEER_THREADS).length) {
      const { data: ths } = await supabase.from('dm_threads').select('id,user_lo,user_hi');
      (ths || []).forEach(t => { PEER_THREADS[t.user_lo === ME ? t.user_hi : t.user_lo] = t.id; });
    }
    for (const [peer, tid] of Object.entries(PEER_THREADS)) {
      const plain = await window.GALLA_e2e.decrypt(supabase, ME, peer, row.payload);
      if (plain == null) continue;
      let env; try { env = JSON.parse(plain); } catch (_) { env = { b: plain }; }
      if (env.f && env.f !== peer) continue;   // 키 주인과 주장 발신자 불일치 = 위조
      const rec = { id: 'sec' + row.id, s: peer, b: String(env.b || ''), ts: env.ts || Date.parse(row.created_at) };
      secHistAdd(tid, rec);
      E2E_PLAIN[rec.id] = rec.b;
      if (curThread === tid) {
        const m = { id: rec.id, sender_id: peer, kind: 'e2e', body: '', created_at: new Date(rec.ts).toISOString() };
        MSGS[m.id] = m; appendMsg(m);
      } else {
        toastMini('비밀 메시지가 도착했어요');
      }
      await supabase.from('secret_mailbox').delete().eq('id', row.id);   // 수거 즉시 서버에서 소멸
      return;
    }
  }

  async function decryptPass() {
    if (!window.GALLA_e2e?.supported() || !curPeer) return;
    const peer = curPeer;
    const nodes = [...ROOT.querySelectorAll('#dm-msgs [data-e2e]')];
    for (const el of nodes) {
      const id = el.dataset.e2e, m = MSGS[id];
      if (!m || curPeer !== peer) return;   // 대화 전환 경합 방지
      const plain = await window.GALLA_e2e.decrypt(supabase, ME, peer, m.body);
      E2E_PLAIN[id] = plain != null ? plain : false;
      const cur = ROOT.querySelector(`#dm-msgs [data-e2e="${id}"]`);
      if (!cur) continue;
      if (plain != null) {
        cur.outerHTML = `<span class="dm-bub-body">${esc(plain)}</span><span class="dm-e2e-mark">${ICONS.lock}</span>`;
      } else {
        cur.innerHTML = `${ICONS.lock} 이 기기에서 열 수 없는 비밀 메시지`;
        cur.removeAttribute('data-e2e');
      }
    }
  }
  /* ❤️ 리액션 — 말풍선 두 번 탭이면 하트, 꾹 누르면 골라 달기.
     답장을 걸 만큼은 아닌 반응을 가볍게 남기는 자리. */
  const QUICK = ['❤️', '😂', '👍', '😮', '😢', '🔥'];
  let REACTS = {};                    // messageId -> { emoji: [userId…] }
  /* 키워드 알림은 토스트에서만 표시돼 '작동 안 한다'고 느껴졌다 —
     대화 안에서도 해당 낱말을 표시해 눈으로 확인되게 한다. */
  function markKeywords(html) {
    const ks = String(UI.keywords || '').split(',').map(x => x.trim()).filter(Boolean);
    if (!ks.length) return html;
    let out = html;
    ks.forEach(k => {
      const safe = esc(k).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out = out.replace(new RegExp(safe, 'g'), m => `<mark class="dm-kw">${m}</mark>`);
    });
    return out;
  }

  function reactChips(id) {
    const r = REACTS[id];
    if (!r) return '';
    return Object.entries(r).map(([em, users]) =>
      `<button type="button" class="dm-react${users.includes(ME) ? ' mine' : ''}" data-react="${esc(em)}" data-msg="${esc(id)}">${em}${users.length > 1 ? `<b>${users.length}</b>` : ''}</button>`
    ).join('');
  }
  function paintReacts(id) {
    ROOT?.querySelectorAll(`.dm-reacts[data-for="${CSS.escape(String(id))}"]`).forEach(el => {
      el.innerHTML = reactChips(id);
    });
  }
  async function loadReacts(ids) {
    if (!ids.length) return;
    const { data } = await supabase.from('dm_reactions').select('message_id, user_id, emoji').in('message_id', ids);
    REACTS = {};
    (data || []).forEach(r => {
      (REACTS[r.message_id] = REACTS[r.message_id] || {});
      (REACTS[r.message_id][r.emoji] = REACTS[r.message_id][r.emoji] || []).push(r.user_id);
    });
  }
  /* 낙관적 갱신 — 네트워크를 기다리면 '두 번 탭'의 맛이 죽는다 */
  async function toggleReact(msgId, emoji) {
    const cur = REACTS[msgId] || {};
    const mineEmoji = Object.keys(cur).find(em => cur[em].includes(ME));
    const same = mineEmoji === emoji;
    // 화면 먼저
    if (mineEmoji) {
      cur[mineEmoji] = cur[mineEmoji].filter(u => u !== ME);
      if (!cur[mineEmoji].length) delete cur[mineEmoji];
    }
    if (!same) (cur[emoji] = cur[emoji] || []).push(ME);
    REACTS[msgId] = cur;
    paintReacts(msgId);
    if (UI.sound) { try { navigator.vibrate?.(8); } catch (_) {} }
    // 서버
    try {
      if (same) await supabase.from('dm_reactions').delete().eq('message_id', msgId).eq('user_id', ME);
      else await supabase.from('dm_reactions').upsert({ message_id: msgId, user_id: ME, emoji }, { onConflict: 'message_id,user_id' });
    } catch (e) { console.warn('[dm] react', e); }
  }
  function openReactPicker(msgId, anchor) {
    document.querySelector('.dm-react-pop')?.remove();
    const pop = document.createElement('div');
    pop.className = 'dm-react-pop';
    pop.innerHTML = QUICK.map(em => `<button type="button" data-em="${em}">${em}</button>`).join('');
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    pop.style.top = Math.max(8, r.top - 52) + 'px';
    pop.style.left = Math.min(Math.max(8, r.left), innerWidth - pop.offsetWidth - 8) + 'px';
    void pop.getBoundingClientRect(); pop.classList.add('on');
    pop.onclick = e => {
      const b = e.target.closest('[data-em]');
      if (b) toggleReact(msgId, b.dataset.em);
      pop.remove();
    };
    setTimeout(() => document.addEventListener('click', () => pop.remove(), { once: true }), 0);
  }
  /* 두 번 탭 + 꾹 누르기 바인딩 */
  function bindReact(wrap) {
    if (!wrap || wrap.dataset.reactBound) return;
    wrap.dataset.reactBound = '1';
    let lastTap = 0, lastId = null, pressT = null;
    wrap.addEventListener('click', e => {
      if (e.target.closest('.dm-react')) {
        const b = e.target.closest('.dm-react');
        return toggleReact(b.dataset.msg, b.dataset.react);
      }
      if (!UI.reactions) return;
      const b = e.target.closest('.dm-bubble');
      if (!b || b.classList.contains('dm-typing')) return;
      const now = Date.now();
      if (lastId === b.dataset.id && now - lastTap < 320) { toggleReact(b.dataset.id, '❤️'); lastTap = 0; return; }
      lastTap = now; lastId = b.dataset.id;
    });
    wrap.addEventListener('touchstart', e => {
      if (!UI.reactions) return;
      const b = e.target.closest('.dm-bubble');
      if (!b) return;
      clearTimeout(pressT);
      pressT = setTimeout(() => openReactPicker(b.dataset.id, b), 520);
    }, { passive: true });
    ['touchend', 'touchmove', 'touchcancel'].forEach(t =>
      wrap.addEventListener(t, () => clearTimeout(pressT), { passive: true }));
  }

  function renderMsgs(msgs) {
    const wrap = ROOT.querySelector('#dm-msgs');
    // 리액션을 먼저 받아와 첫 렌더부터 함께 그린다(뒤늦게 튀어나오면 지저분하다)
    loadReacts(msgs.map(m => m.id)).then(() => {
      msgs.forEach(m => paintReacts(m.id));
    }).catch(() => {});
    wrap.innerHTML = msgs.map(bubbleHTML).join('');
    bindReact(wrap);
    // 마지막 12개만 폭포 등장(--i) — 긴 대화 전체를 애니메이션하면 소음이다
    const kids = [...wrap.children];
    kids.slice(-12).forEach((el, i) => { el.style.setProperty('--i', i); el.classList.add('in'); });
    wrap.scrollTop = wrap.scrollHeight;
    paintReceipts();
    decryptPass();
  }
  function appendMsg(m) {
    MSGS[m.id] = m;
    const wrap = ROOT.querySelector('#dm-msgs');
    const near = wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight < 80;
    wrap.insertAdjacentHTML('beforeend', bubbleHTML(m));
    wrap.lastElementChild?.classList.add('new');   // 새 메시지는 튀어 들어온다
    if (near || m.sender_id === ME) wrap.scrollTop = wrap.scrollHeight;
    paintReceipts();
    if (m.kind === 'e2e') decryptPass();
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

  /* ---------- 😀 무한 이모티콘 ----------
     이모지·스티커는 오픈 라이선스라 무제한 무료(갈라의 차별점).
     GIF(GIPHY)는 상점 아이템 자원이라 별도 탭으로 분리해 둔다. */
  let STK_KIND = 'emoji', stkTimer = null, STK_CAT = 0, STK_BOOTED = false;
  let STK_STYLE = (() => { try { return localStorage.getItem('galla_stk_style') || 'noto'; } catch (_) { return 'noto'; } })();
  function toggleStk() {
    const p = ROOT.querySelector('#dm-stk');
    p.hidden = !p.hidden;
    if (!p.hidden) { if (!STK_BOOTED) { STK_BOOTED = true; ensureStk().then(paintStk); } else paintStk(); }
  }
  async function ensureStk() {
    if (!window.GALLA_STK) { try { await loadScript('/js/dm-stickers.js'); } catch (_) {} }
  }
  /* 🍳 믹스 — 구글 이모지 키친 합성. 재료 하나 고르면 그놈으로 만든 병맛 조합이 쏟아진다 */
  let MIX_BASE = null;
  const kitchenUrl = v => {
    const [date, l, r] = v.split('|');
    return `https://www.gstatic.com/android/keyboard/emojikitchen/${date}/u${l}/u${l}_u${r}.png`;
  };
  async function ensureKitchen() {
    if (!window.GALLA_KITCHEN) { try { await loadScript('/js/dm-kitchen.js'); } catch (_) {} }
    return !!window.GALLA_KITCHEN;
  }
  async function paintMix() {
    const grid = ROOT.querySelector('#dm-stk-grid');
    const cats = ROOT.querySelector('#dm-stk-cats');
    const credit = ROOT.querySelector('#dm-stk-credit');
    grid.innerHTML = `<div class="dm-loading">불러오는 중…</div>`;
    if (!(await ensureKitchen())) { grid.innerHTML = `<div class="dm-set-empty">믹스를 불러오지 못했어요</div>`; return; }
    const K = window.GALLA_KITCHEN, S = window.GALLA_STK;
    const keys = Object.keys(K);
    if (!MIX_BASE || !K[MIX_BASE]) MIX_BASE = keys[0];
    cats.hidden = false;   // 카테고리 자리를 '재료 줄'로 재활용
    cats.innerHTML = keys.map(k =>
      `<button type="button" class="dm-mixbase${k === MIX_BASE ? ' on' : ''}" data-mb="${k}">${esc(S.charOf(k.split('-')))}</button>`).join('');
    credit.hidden = false;
    credit.textContent = '이모지 키친 · Google (Gboard 공개 이미지)';
    const combos = K[MIX_BASE] || {};
    const list = Object.keys(combos);
    grid.className = 'dm-stk-grid';
    grid.innerHTML = list.length
      ? list.map((other, i) => {
          const url = kitchenUrl(combos[other]);
          return `<img src="${esc(url)}" data-full="${esc(url)}" data-src="mix"${i >= 12 ? ' loading="lazy"' : ''} alt="">`;
        }).join('')
      : `<div class="dm-set-empty">이 이모지는 조합이 없어요</div>`;
    cats.querySelector('.on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }
  /* 🇰🇷 토스페이스 — 국산 이모지 폰트(원본 그대로 사용, 라이선스상 서브셋·이미지화 금지).
     12MB라 켤 때만 내려받는다(@font-face는 실제 사용 시에만 다운로드). */
  const TF_KEY = 'galla_tossface';
  let TOSSFACE = (() => { try { return localStorage.getItem(TF_KEY) === '1'; } catch (_) { return false; } })();
  function applyTossface() {
    document.body.classList.toggle('tossface', TOSSFACE);
  }
  /* 🎨 나만의 이모티콘 — AI 생성(유료). 가격·품질은 서버 설정(app_settings)에서 온다 */
  let MK_CFG = null, MK_BUSY = false;
  const MK_PRESETS = [
    { label: '내 갈라리안', p: '한국 커뮤니티 마스코트 캐릭터, 자신감 넘치는 표정' },
    { label: '빡친 나', p: '화가 잔뜩 나서 김이 나는 귀여운 캐릭터' },
    { label: '오열', p: '폭포수처럼 눈물 흘리며 우는 귀여운 캐릭터' },
    { label: '떡상 기원', p: '로켓 타고 하늘로 올라가는 신난 캐릭터' },
    { label: '월요병', p: '이불 속에서 나오기 싫어하는 좀비 같은 캐릭터' },
    { label: '치킨 뜯기', p: '치킨을 행복하게 뜯어먹는 통통한 캐릭터' },
  ];
  async function ensureMkCfg() {
    if (MK_CFG) return MK_CFG;
    const { data } = await supabase.from('app_settings').select('v').eq('k', 'ai_sticker').maybeSingle();
    MK_CFG = data?.v || { price: 500, set_price: 1500, daily_limit: 20 };
    return MK_CFG;
  }
  async function paintMine() {
    const grid = ROOT.querySelector('#dm-stk-grid');
    const mk = ROOT.querySelector('#dm-mk');
    ROOT.querySelector('#dm-stk-styles').hidden = true;
    ROOT.querySelector('#dm-stk-cats').hidden = true;
    ROOT.querySelector('#dm-stk-credit').hidden = true;
    mk.hidden = false;
    const cfg = await ensureMkCfg();
    ROOT.querySelector('#dm-mk-presets').innerHTML =
      MK_PRESETS.map((p, i) => `<button type="button" data-mk="${i}">${esc(p.label)}</button>`).join('');
    ROOT.querySelector('#dm-mk-go').textContent = `만들기 ${cfg.price}GP`;
    ROOT.querySelector('#dm-mk-hint').textContent = MK_BUSY
      ? '그리는 중… 20초쯤 걸려요' : `AI가 그려줘요 · 하루 ${cfg.daily_limit}개까지`;
    grid.className = 'dm-stk-grid';
    grid.innerHTML = `<div class="dm-loading">불러오는 중…</div>`;
    const { data } = await supabase.from('my_stickers')
      .select('id,url').eq('user_id', ME).order('created_at', { ascending: false }).limit(60);
    const list = data || [];
    grid.innerHTML = list.length
      ? list.map((r, i) => `<img src="${esc(r.url)}" data-full="${esc(r.url)}" data-src="mine" data-id="${r.id}"${i >= 12 ? ' loading="lazy"' : ''} alt="">`).join('')
      : `<div class="dm-set-empty">아직 만든 이모티콘이 없어요<br>위에 원하는 걸 적고 만들어보세요</div>`;
  }
  async function makeSticker(prompt) {
    if (MK_BUSY) return;
    const cfg = await ensureMkCfg();
    if (!prompt || prompt.trim().length < 2) return toastMini('무엇을 그릴지 적어주세요');
    MK_BUSY = true;
    const hint = ROOT.querySelector('#dm-mk-hint');
    const go = ROOT.querySelector('#dm-mk-go');
    go.disabled = true; hint.textContent = '그리는 중… 20초쯤 걸려요';
    try {
      const { data, error } = await supabase.functions.invoke('generate-sticker', { body: { prompt, count: 1 } });
      if (error || !data?.ok) {
        const why = data?.error || error?.message || '';
        hint.textContent =
          why === 'insufficient' ? `GP가 부족해요 (${cfg.price}GP 필요)` :
          why === 'daily_limit' ? '오늘 만들 수 있는 개수를 다 썼어요' :
          why === 'blocked_ip' ? `'${data.word}'처럼 남의 캐릭터·실존 인물은 만들 수 없어요` :
          why === 'blocked_moderation' ? '이런 내용은 만들 수 없어요' :
          '만들지 못했어요 — GP는 돌려드렸어요';
        return;
      }
      ROOT.querySelector('#dm-mk-q').value = '';
      // ⚠️ 순서 주의: paintMine이 안내문을 다시 그리므로 상태를 먼저 풀고, 완료 문구는 그 뒤에
      MK_BUSY = false;
      await paintMine();
      hint.textContent = `완성! ${data.charged}GP 사용 · 남은 GP ${Math.round(data.balance)}`;
    } catch (_) {
      hint.textContent = '만들지 못했어요 — GP는 돌려드렸어요';
    } finally {
      MK_BUSY = false; go.disabled = false;
    }
  }
  function paintStkStyles() {
    const box = ROOT.querySelector('#dm-stk-styles');
    if (STK_KIND === 'emoji') {
      box.hidden = false;
      box.innerHTML = `<button type="button" class="${!TOSSFACE ? 'on' : ''}" data-tf="0">기본</button>`
        + `<button type="button" class="${TOSSFACE ? 'on' : ''}" data-tf="1">토스페이스 🇰🇷</button>`;
      return;
    }
    const show = STK_KIND === 'sticker' && window.GALLA_STK;
    box.hidden = !show;
    if (!show) { box.innerHTML = ''; return; }
    box.innerHTML = window.GALLA_STK.styles
      .map(st => `<button type="button" class="${st.id === STK_STYLE ? 'on' : ''}" data-si="${st.id}">${esc(st.label)}</button>`).join('');
  }
  /* 스타일마다 커버리지가 달라(애니메이션 Noto는 ~80%) 순차 폴백시킨다 */
  function stkImgHTML(it, i) {
    const S = window.GALLA_STK;
    const chain = [STK_STYLE, ...S.styles.map(x => x.id).filter(x => x !== STK_STYLE)];
    const urls = chain.map(id => S.urlOf(it.cps, id)).filter(Boolean);
    if (!urls.length) return '';
    // ★ 첫 화면 몫은 eager — 시트가 짧으면 lazy 관찰이 멈춰 아무것도 안 뜨는 일이 있었다
    const lazy = i >= 12 ? ' loading="lazy"' : '';
    return `<img src="${esc(urls[0])}" data-full="${esc(urls[0])}" data-src="stk"
      data-alt="${esc(JSON.stringify(urls.slice(1)))}"${lazy} alt="${esc(it.kw.split(' ')[0] || '')}">`;
  }
  function paintStkCats() {
    const box = ROOT.querySelector('#dm-stk-cats');
    const free = STK_KIND === 'emoji' || STK_KIND === 'sticker';
    box.hidden = !free || !window.GALLA_STK;
    if (box.hidden) { box.innerHTML = ''; return; }
    box.innerHTML = window.GALLA_STK.cats
      .map((c, i) => `<button type="button" class="${i === STK_CAT ? 'on' : ''}" data-ci="${i}">${esc(c.label)}</button>`).join('');
  }
  async function paintStk() {
    await ensureStk();
    const grid = ROOT.querySelector('#dm-stk-grid');
    const credit = ROOT.querySelector('#dm-stk-credit');
    const q = ROOT.querySelector('#dm-stk-q').value.trim();
    ROOT.querySelector('#dm-stk-q').placeholder = STK_KIND === 'mix'
      ? '아래에서 재료 이모지를 골라보세요' : '이모티콘 검색… (웃음, 하트, 빡침…)';
    ROOT.querySelector('#dm-mk').hidden = STK_KIND !== 'mine';
    if (STK_KIND === 'mine') return paintMine();
    if (STK_KIND === 'mix') { ROOT.querySelector('#dm-stk-styles').hidden = true; return paintMix(); }
    paintStkStyles();
    paintStkCats();
    // GIF는 서버(GIPHY) — 유료 자원 탭
    if (STK_KIND === 'gifs') {
      credit.hidden = true;
      grid.className = 'dm-stk-grid';
      grid.innerHTML = `<div class="dm-loading">불러오는 중…</div>`;
      try {
        const { data } = await supabase.functions.invoke('gif-search', { body: { q, kind: 'gifs', limit: 30 } });
        const list = data?.results || [];
        grid.innerHTML = list.length
          ? list.map((g, i) => `<img src="${esc(g.preview)}" data-full="${esc(g.url)}" data-src="giphy"${i >= 12 ? ' loading="lazy"' : ''} alt="">`).join('')
          : `<div class="dm-set-empty">검색 결과가 없어요</div>`;
      } catch (_) { grid.innerHTML = `<div class="dm-set-empty">불러오지 못했어요</div>`; }
      return;
    }
    const S = window.GALLA_STK;
    if (!S) { grid.innerHTML = `<div class="dm-set-empty">이모티콘을 불러오지 못했어요</div>`; return; }
    const items = S.search(q) || S.cats[STK_CAT].items;
    if (STK_KIND === 'emoji') {
      credit.hidden = !TOSSFACE;
      credit.textContent = '이 서비스에는 토스팀에서 제공한 토스페이스가 적용되어 있습니다';
      grid.className = 'dm-stk-grid emoji';
      grid.innerHTML = items.length
        ? items.map(it => `<button type="button" class="dm-emo" data-ch="${esc(S.charOf(it.cp))}">${esc(S.charOf(it.cp))}</button>`).join('')
        : `<div class="dm-set-empty">그런 이모지는 없어요</div>`;
    } else {
      credit.hidden = false;
      credit.textContent = (S.styles.find(x => x.id === STK_STYLE) || S.styles[0]).credit;
      grid.className = 'dm-stk-grid';
      grid.innerHTML = items.length
        ? items.map(stkImgHTML).join('')
        : `<div class="dm-set-empty">그런 스티커는 없어요</div>`;
    }
  }

  /* ---------- 🎙 워키토키 음성 (위챗 문법) ----------
     꾹 눌러 말하고 떼면 즉시 전송. 위로 밀면 취소, 더 밀면 잠금(핸즈프리).
     카톡처럼 '버튼 눌러 → 녹음창 열고 → 녹음 → 전송'하는 단계를 전부 없앤 게 핵심. */
  let VREC = null, vrecT = null, VAUDIO = null, PTT = null;
  /* 🎤 마이크 예열 — 꾹 누르는 순간 권한 팝업이 뜨면 그 팝업이 포인터를 가로채
     pointercancel이 나고, 손을 뗀 것으로 처리돼 녹음이 조용히 취소된다.
     ([허용]을 눌러도 이미 늦다 = "녹음이 안 된다"의 정체)
     → 첫 사용 때는 녹음 대신 권한만 받아두고, 다음 누름부터 바로 녹음한다. */
  let MIC_OK = false;
  (async () => {
    // 같은 판정을 쓴다 — permissions.query가 막힌 브라우저에서도 예열을 건너뛰게
    try { MIC_OK = (await realPermState('microphone', 'audioinput')) === 'granted'; }
    catch (_) {}
  })();
  /* 🎤 마이크 재사용 — 한 번 열어둔 스트림을 잠깐 붙들었다가 반납한다.
     연속으로 녹음할 때 권한 요청·장치 열기를 반복하지 않아 특히 아이폰에서
     "매번 묻는" 느낌이 줄어든다. 다만 마이크 표시등이 오래 켜져 있으면
     불안하므로 15초만 유지하고, 화면을 벗어나면 즉시 반납한다. */
  /* ⚠️ iOS: MediaRecorder와 Web Audio(AudioContext)가 같은 스트림을 동시에 물면
     녹음이 0바이트로 끝난다 — 소리 크기 측정을 아이폰에선 건너뛴다.
     (안드로이드는 정상이라 무음 감지를 유지한다) */
  const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const MIC_HOLD_MS = 15000;
  function micCache() { return (window.__gallaMic = window.__gallaMic || {}); }
  function micLive() {
    const c = micCache();
    return c.stream && c.stream.getAudioTracks().some(t => t.readyState === 'live') ? c.stream : null;
  }
  function micRelease(now) {
    const c = micCache();
    if (!c.stream) return;
    clearTimeout(c.timer);
    const stop = () => { try { c.stream.getTracks().forEach(t => t.stop()); } catch (_) {} c.stream = null; };
    if (now) stop(); else c.timer = setTimeout(stop, MIC_HOLD_MS);
  }
  if (!window.__gallaMicBound) {
    window.__gallaMicBound = true;
    document.addEventListener('visibilitychange', () => { if (document.hidden) micRelease(true); });
  }
  async function warmMic() {
    if (MIC_OK) return true;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach(t => t.stop());
      MIC_OK = true;
      return true;
    } catch (_) { return false; }
  }
  function bindPTT(btn) {
    let sx = 0, sy = 0;
    const CANCEL_DY = -70, LOCK_DY = -130;
    btn.style.touchAction = 'none';
    btn.addEventListener('pointerdown', async e => {
      if (PTT?.locked) { stopVoiceRec(false); return; }   // 잠금 상태에선 탭 = 전송
      e.preventDefault();
      // 권한이 아직이면 이번 누름은 '허용받기'로만 쓴다 — 팝업과 녹음을 겹치지 않게
      if (!MIC_OK) {
        const ok = await warmMic();
        PTT = null;
        if (ok) return toastMini('마이크 준비 완료 — 이제 꾹 누르고 말해보세요');
        if (!window.GALLA_micHelp) {
          const v = ([...document.scripts].map(x => x.src).find(u => /[?&]v=/.test(u)) || '').match(/[?&]v=(\d+)/);
          await new Promise(res => { const sc = document.createElement('script'); sc.src = '/js/mic-help.js' + (v ? '?v=' + v[1] : ''); sc.onload = sc.onerror = res; document.head.appendChild(sc); });
        }
        return void window.GALLA_micHelp?.({});
      }
      sx = e.clientX; sy = e.clientY;
      PTT = { armed: null, locked: false, id: e.pointerId };
      try { btn.setPointerCapture(e.pointerId); } catch (_) {}
      await startVoiceRec();
    });
    btn.addEventListener('pointermove', e => {
      if (!PTT || PTT.locked || !VREC) return;
      const dy = e.clientY - sy;
      const next = dy < LOCK_DY ? 'lock' : dy < CANCEL_DY ? 'cancel' : null;
      if (next !== PTT.armed) { PTT.armed = next; paintPTT(); }
    });
    const end = () => {
      if (!PTT || !VREC) { PTT = null; return; }
      if (PTT.armed === 'lock') { PTT.locked = true; PTT.armed = null; paintPTT(); return; }   // 손 떼도 계속
      const cancel = PTT.armed === 'cancel';
      PTT = null;
      stopVoiceRec(cancel);
    };
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointercancel', end);
  }
  function paintPTT() {
    const box = ROOT.querySelector('#dm-ptt');
    const hint = ROOT.querySelector('#dm-ptt-hint');
    const btn = ROOT.querySelector('#dm-voice');
    box.dataset.armed = PTT?.armed || '';
    box.classList.toggle('locked', !!PTT?.locked);
    btn.classList.toggle('rec', !!VREC);
    if (!hint) return;
    hint.textContent = PTT?.locked ? '핸즈프리 — 마이크를 탭하면 전송'
      : PTT?.armed === 'cancel' ? '손을 떼면 취소돼요'
      : PTT?.armed === 'lock' ? '손을 떼면 계속 녹음(핸즈프리)'
      : '손을 떼면 전송 · 위로 밀어 취소';
  }
  async function startVoiceRec() {
    if (VREC || !curThread) return;
    if (secretOn(curThread)) { PTT = null; return toastMini('비밀대화에선 텍스트만 보낼 수 있어요 (암호화 보장)'); }
    if (!window.MediaRecorder || !navigator.mediaDevices?.getUserMedia) {
      PTT = null; return toastMini('이 브라우저는 음성 메시지를 지원하지 않아요');
    }
    let stream = micLive();
    // ⚠️ 음질 제약(처리 끄기·48kHz)은 일부 안드로이드에서 '무음 스트림'을 만든다 —
    // 검증된 단순 요청만 쓰고 음질은 비트레이트로 확보한다
    try {
      if (!stream) stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micCache().stream = stream; clearTimeout(micCache().timer);
    }
    catch (e) {
      PTT = null; MIC_OK = false;
      console.warn('[dm] voice mic', e?.name);
      return toastMini('마이크를 열지 못했어요 — 한 번 더 눌러주세요');
    }
    if (!PTT) { micRelease(); return; }   // 권한 대기 중 손을 뗐다
    /* ⚠️ mp4 우선. MediaRecorder가 만든 webm은 길이(duration) 정보가 없어
       안드로이드에서 '재생은 되는데 소리가 안 나는' 일이 생기고,
       iOS 사파리는 webm을 아예 재생하지 못한다(= 아이폰에선 안 들림).
       mp4는 길이가 정상이고 모든 기기에서 재생된다. */
    const mime = MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4'
      : MediaRecorder.isTypeSupported('audio/mp4;codecs=mp4a.40.2') ? 'audio/mp4;codecs=mp4a.40.2'
      : MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
    const chunks = [];
    const t0 = Date.now();
    const bps = 128000;   // 말소리엔 충분히 여유 있는 값(기기 기본값이 낮게 잡히는 걸 방지)
    const rec = new MediaRecorder(stream, Object.assign(mime ? { mimeType: mime } : {}, { audioBitsPerSecond: bps }));
    VREC = rec;
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    /* 입력 레벨 감시 — 권한이 나도 무음만 담기는 경우가 있다(마이크 가림·다른 앱
       점유·블루투스 기기). 파일 크기는 정상이라 보내고 나서야 알게 되므로 미리 잡는다. */
    try {
      if (IS_IOS) throw new Error('skip-ios');
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const an = ac.createAnalyser(); an.fftSize = 512;
      ac.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.fftSize);
      rec._peak = 0;
      rec._lvl = setInterval(() => {
        an.getByteTimeDomainData(buf);
        for (let i = 0; i < buf.length; i++) {
          const d = Math.abs(buf[i] - 128);
          if (d > rec._peak) rec._peak = d;
        }
      }, 120);
      rec._ac = ac;
    } catch (_) {}
    rec.onstop = async () => {
      micRelease();          // 곧바로 끄지 않고 잠깐 붙들었다가 반납(연속 녹음 대비)
      clearInterval(rec._lvl);
      try { rec._ac?.close(); } catch (_) {}
      const peak = rec._peak || 0;
      const cancelled = rec._cancel;
      const dur = Math.round((Date.now() - t0) / 1000);
      VREC = null; PTT = null; paintRec(false);
      if (cancelled) return;
      if (dur < 1) return toastMini('너무 짧아요 — 꾹 눌러서 말해주세요');
      // peak 3 미만 = 무음. 측정을 못 한 기기(IS_IOS)는 판정하지 않는다
      if (!IS_IOS && peak < 3) {
        if (!window.GALLA_micHelp) {
          const v = ([...document.scripts].map(x => x.src).find(u => /[?&]v=/.test(u)) || '').match(/[?&]v=(\d+)/);
          await new Promise(res => { const sc = document.createElement('script'); sc.src = '/js/mic-help.js' + (v ? '?v=' + v[1] : ''); sc.onload = sc.onerror = res; document.head.appendChild(sc); });
        }
        return void window.GALLA_micHelp?.({ silent: true });
      }
      const type = rec.mimeType || 'audio/webm';
      const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
      const f = new File(chunks, 'voice.' + ext, { type });
      if (!window.GALLA_UPLOAD_MEDIA) {
        try { await loadScript('/js/media-upload.js'); } catch (_) { return toastMini('전송을 준비하지 못했어요'); }
      }
      const wrap = ROOT.querySelector('#dm-msgs');
      const tmp = document.createElement('div');
      tmp.className = 'dm-bubble me dm-uploading';
      tmp.innerHTML = `<span class="dm-bub-body">${ICONS.mic} 음성 보내는 중…</span>`;
      wrap.appendChild(tmp); wrap.scrollTop = wrap.scrollHeight;
      try {
        const url = await window.GALLA_UPLOAD_MEDIA(f, 'audio');
        tmp.remove();
        await sendMessage({ kind: 'voice', body: '🎤 음성 메시지', meta: { url, dur } });
      } catch (err) {
        console.error('[dm] voice upload', err);
        tmp.querySelector('.dm-bub-body').textContent = '음성 전송 실패 — ' + (err?.message || '업로드 오류');
        setTimeout(() => tmp.remove(), 4000);
      }
    };
    rec.start();
    paintRec(true, t0);
    paintPTT();
    // 60초 넘으면 자동 전송(무한 녹음 방지)
    rec._maxT = setTimeout(() => { if (VREC === rec) stopVoiceRec(false); }, 60000);
  }
  function stopVoiceRec(cancel) {
    if (!VREC) return;
    clearTimeout(VREC._maxT);
    VREC._cancel = !!cancel;
    try { VREC.stop(); } catch (_) {}
  }
  function paintRec(on, t0) {
    const box = ROOT.querySelector('#dm-ptt');
    const btn = ROOT.querySelector('#dm-voice');
    box.hidden = !on;
    btn.classList.toggle('rec', on);
    clearInterval(vrecT);
    if (!on) { box.dataset.armed = ''; box.classList.remove('locked'); return; }
    const wave = ROOT.querySelector('#dm-ptt-wave');
    if (wave && !wave.children.length) wave.innerHTML = '<i></i>'.repeat(18);
    const el = ROOT.querySelector('#dm-rec-time');
    vrecT = setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      // 살아있는 파형(마이크 분석 없이 가볍게 — 배터리·CPU를 안 먹는다)
      if (wave) [...wave.children].forEach(b => { b.style.height = (6 + Math.random() * 22).toFixed(0) + 'px'; });
    }, 120);
  }

  /* ---------- 전송 ---------- */
  async function sendMessage(fields) {
    const row = { thread_id: curThread, sender_id: ME, body: fields.body || '', kind: fields.kind || 'text',
                  meta: fields.meta || null, reply_to: fields.reply_to || null };
    const { data, error } = await supabase.from('dm_messages').insert(row).select().single();
    if (error) {
      console.error('[dm] send', error);
      // 조용한 실패 금지 — DB 제약·권한 문제를 사용자가 알 수 있어야 한다
      toastMini(/check constraint/i.test(error.message || '')
        ? '이 종류의 메시지를 아직 보낼 수 없어요 (서버 설정)'
        : '메시지를 보내지 못했어요 — 잠시 후 다시');
      return null;
    }
    if (fields.plain != null) E2E_PLAIN[data.id] = fields.plain;   // 내 화면엔 평문으로
    appendMsg(data);
    window.GALLA_pushSend?.('dm', data.id);
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
    if (secretOn(curThread)) {
      // 📬 우편함: 발신자·스레드가 암호문 '안'에만 있다 — dm_messages를 거치지 않는다
      const ts = Date.now();
      const env = JSON.stringify({ f: ME, t: curThread, b: body, ts });
      const enc = await window.GALLA_e2e?.encrypt(supabase, ME, curPeer, env);
      if (!enc) { ta.value = body; return toastMini('비밀대화를 준비하지 못했어요 — 잠시 후 다시 시도해주세요'); }
      const { error } = await supabase.from('secret_mailbox').insert({ recipient: curPeer, payload: enc });
      if (error) { ta.value = body; return toastMini('보내지 못했어요 — 잠시 후 다시'); }
      const rec = { id: 'secL' + ts, s: ME, b: body, ts };
      secHistAdd(curThread, rec);
      E2E_PLAIN[rec.id] = body;
      const m = { id: rec.id, sender_id: ME, kind: 'e2e', body: '', created_at: new Date(ts).toISOString() };
      MSGS[m.id] = m; appendMsg(m);
      return;
    }
    await sendMessage({ body, reply_to });
  }
  /* 사진 화질 설정을 실제 전송에 반영 — 설정만 있고 안 먹으면 가짜다.
     캔버스로 긴 변을 줄여 JPEG로 다시 굽는다(원본 선택 시 그대로 통과). */
  const QUALITY_MAX = { save: 1080, high: 1600, origin: 0 };
  function shrinkImage(file) {
    const max = QUALITY_MAX[UI.photoQuality] || 0;
    if (!max || !/^image\/(jpe?g|png|webp)$/i.test(file.type)) return Promise.resolve(file);
    return new Promise(resolve => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const long = Math.max(img.width, img.height);
        if (long <= max) return resolve(file);             // 이미 작으면 손대지 않는다
        const r = max / long;
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * r); cv.height = Math.round(img.height * r);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        cv.toBlob(b => {
          if (!b || b.size >= file.size) return resolve(file);   // 되레 커지면 원본이 낫다
          resolve(new File([b], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }));
        }, 'image/jpeg', UI.photoQuality === 'save' ? 0.72 : 0.86);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }
  async function onPickImage(e) {
    let f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f || !curThread) return;
    f = await shrinkImage(f);
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
  /* 👉 밀어서 답장 — 말풍선을 오른쪽으로 살짝 밀면 답장이 걸린다.
     세로 스크롤을 방해하지 않도록 가로 이동이 세로보다 확실히 클 때만 반응하고,
     설정에서 끌 수 있다. */
  function bindSwipeReply(wrap) {
    if (!wrap || wrap.dataset.swipeBound) return;
    wrap.dataset.swipeBound = '1';
    let sx = 0, sy = 0, el = null, on = false;
    wrap.addEventListener('touchstart', e => {
      el = null; on = false;
      if (!UI.swipeReply || e.touches.length !== 1) return;
      const b = e.target.closest('.dm-bubble');
      if (!b || b.classList.contains('dm-typing')) return;
      el = b; sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    }, { passive: true });
    wrap.addEventListener('touchmove', e => {
      if (!el) return;
      const dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
      if (!on && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.8) on = true;
      if (!on) return;
      const shift = Math.max(0, Math.min(64, dx));
      el.style.transform = `translateX(${shift}px)`;
      el.style.transition = 'none';
      el.classList.toggle('reply-armed', shift > 44);
    }, { passive: true });
    const end = () => {
      if (!el) return;
      const armed = el.classList.contains('reply-armed');
      el.style.transition = 'transform .2s cubic-bezier(.2,1,.3,1)';
      el.style.transform = '';
      el.classList.remove('reply-armed');
      if (armed) {
        const m = MSGS[el.dataset.id];
        if (m) { setReply(m); try { navigator.vibrate?.(10); } catch (_) {} }
      }
      el = null; on = false;
    };
    wrap.addEventListener('touchend', end, { passive: true });
    wrap.addEventListener('touchcancel', end, { passive: true });
  }

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
    if (!mine && !m.deleted_at) items.push(`<button data-m="report" class="danger">신고</button>`);
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
      else if (act === 'report') reportFlow('dm_message', id, x, y);
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
  // 끈 사람은 남의 것도 안 본다(주고받기가 대칭이어야 공평하다)
  function showTypingBubble() {
    if (!UI.typing) return;                // 내 상태를 안 주면 남의 것도 안 본다(대칭)
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
    if (!UI.typing) return;                // [입력 중 상태] 끔 — 내 것도 안 보낸다
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
      /* 리액션 실시간 — 상대가 하트를 달면 내 화면에도 바로 뜬다.
         메시지 단위 필터가 없으므로(테이블에 thread_id가 없다) 들어온 뒤
         현재 방 메시지인지 확인하고 반영한다. */
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'dm_reactions' },
        ({ eventType, new: n, old: o }) => {
          const row = n && n.message_id ? n : o;
          if (!row || !MSGS[row.message_id]) return;
          const id = row.message_id;
          const cur = REACTS[id] = REACTS[id] || {};
          // 한 사람당 하나 — 이전 것 제거 후 반영
          Object.keys(cur).forEach(em => {
            cur[em] = cur[em].filter(u => u !== row.user_id);
            if (!cur[em].length) delete cur[em];
          });
          if (eventType !== 'DELETE' && n?.emoji) (cur[n.emoji] = cur[n.emoji] || []).push(n.user_id);
          paintReacts(id);
        })
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

  /* ---------- 뱃지 ----------
     하단 네비의 메시지 탭은 '안 읽은 DM + 안 들은 삐삐'를 합쳐 보여준다.
     삐삐를 빼면 호출이 와 있어도 네비가 조용해서 못 알아챈다. */
  let LAST_NAV_N = 0;
  async function refreshBadge() {
    if (!ME) return;
    const [dm, pg] = await Promise.all([
      supabase.from('dm_messages').select('id', { count: 'exact', head: true })
        .is('read_at', null).neq('sender_id', ME),
      supabase.from('pager_messages').select('id', { count: 'exact', head: true })
        .eq('box_owner', ME).is('listened_at', null),
    ]);
    const dmN = dm?.count || 0, pgN = pg?.count || 0;
    const total = dmN + pgN;
    const paint = (el, n) => {
      if (!el) return;
      if (n > 0) { el.textContent = n > 99 ? '99+' : n; el.hidden = false; }
      else el.hidden = true;
    };
    paint(BADGE, dmN);                                    // DM 화면 안의 뱃지는 메시지만
    const nav = document.getElementById('navDmBadge');
    paint(nav, total);                                    // 네비는 삐삐까지 합산
    // 새로 늘어났을 때만 살짝 튀어 시선을 끈다(계속 흔들리면 피로하다)
    if (nav && total > LAST_NAV_N) {
      nav.classList.remove('pop'); void nav.getBoundingClientRect(); nav.classList.add('pop');
      nav.title = pgN ? `안 읽은 메시지 ${dmN} · 안 들은 삐삐 ${pgN}` : `안 읽은 메시지 ${dmN}`;
    }
    if (total > LAST_NAV_N) showMsgBanner(dmN, pgN);
    LAST_NAV_N = total;
  }
  // 삐삐 수신·확인 때도 네비 숫자를 맞춘다
  document.addEventListener('galla:pager-unread', () => { refreshBadge(); });

  /* 📢 상단 배너 — 뱃지와 역할을 나눈다.
       · 뱃지(하단 네비): 상시 '몇 개 쌓였나'
       · 토스트/삐삐 액정팝업: '지금 막 도착했다'
       · 이 배너: 앱에 들어왔는데 **안 읽은 게 쌓여 있다**는 걸 놓치지 않게
     같은 소식을 세 번 알리지 않도록: DM 페이지에선 안 뜨고, 닫으면 그 세션 동안
     다시 안 뜨며, 숫자가 더 늘어났을 때만 다시 등장한다. */
  const BANNER_KEY = 'galla_msg_banner_dismissed';
  function bannerCSS() {
    if (document.getElementById('msgban-css')) return;
    const st = document.createElement('style');
    st.id = 'msgban-css';
    st.textContent = `
      #msg-banner{position:fixed;left:10px;right:10px;top:calc(8px + env(safe-area-inset-top,0px));
        z-index:11400;max-width:460px;margin:0 auto;display:flex;align-items:center;gap:11px;
        padding:11px 12px;border-radius:15px;cursor:pointer;text-align:left;
        background:linear-gradient(135deg,#2b3aa8,#1b2a80);border:1px solid rgba(255,255,255,.14);
        box-shadow:0 14px 40px rgba(0,0,0,.5);color:#fff;font:800 13.5px/1.45 inherit;
        transform:translateY(-140%);transition:transform .34s cubic-bezier(.2,1,.3,1)}
      #msg-banner.on{transform:translateY(0)}
      #msg-banner .mb-ic{flex:0 0 auto;width:34px;height:34px;border-radius:11px;display:flex;
        align-items:center;justify-content:center;background:rgba(255,255,255,.16)}
      #msg-banner .mb-ic svg{width:18px;height:18px;fill:#fff}
      #msg-banner .mb-tx{flex:1;min-width:0}
      #msg-banner .mb-tx i{display:block;font-style:normal;font-weight:600;font-size:12px;opacity:.82;margin-top:1px}
      #msg-banner .mb-go{flex:0 0 auto;background:rgba(255,255,255,.18);border:none;border-radius:9px;
        padding:7px 11px;color:#fff;font-weight:900;font-size:12.5px;cursor:pointer}
      #msg-banner .mb-x{flex:0 0 auto;background:none;border:none;color:rgba(255,255,255,.72);
        font-size:17px;line-height:1;cursor:pointer;padding:2px 3px}
      @media (prefers-reduced-motion:reduce){#msg-banner{transition:none}}
    `;
    document.head.appendChild(st);
  }
  let bannerShownAt = 0;
  function showMsgBanner(dmN, pgN) {
    if (!UI.banner || inDND()) return;                               // 설정에서 끔 / 집중 시간
    if (PAGE_MODE() || document.body.dataset.page === 'dm') return;   // DM 안에선 불필요
    const total = dmN + pgN;
    if (total <= 0) return;
    try {
      const seen = +(sessionStorage.getItem(BANNER_KEY) || 0);
      if (total <= seen) return;            // 이미 닫은 만큼이면 다시 안 띄운다
    } catch (_) {}
    bannerCSS();
    let el = document.getElementById('msg-banner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'msg-banner';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    const icon = pgN && !dmN ? 'pager' : 'chat';
    const title = pgN && !dmN ? `삐삐 ${pgN}통이 와 있어요`
      : dmN && !pgN ? `안 읽은 메시지 ${dmN}개`
      : `메시지 ${dmN}개 · 삐삐 ${pgN}통`;
    const sub = pgN ? '사서함에 접속하면 들을 수 있어요' : '탭하면 바로 열려요';
    el.innerHTML = `<span class="mb-ic">${window.GALLA_svgIcon ? window.GALLA_svgIcon(icon) : ''}</span>
      <span class="mb-tx"><b>${esc(title)}</b><i>${esc(sub)}</i></span>
      <button class="mb-go" type="button">보기</button>
      <button class="mb-x" type="button" aria-label="닫기">×</button>`;
    const close = (remember) => {
      el.classList.remove('on');
      if (remember) { try { sessionStorage.setItem(BANNER_KEY, String(total)); } catch (_) {} }
      setTimeout(() => el.remove(), 340);
    };
    el.onclick = e => {
      if (e.target.closest('.mb-x')) return close(true);
      close(true);
      location.href = pgN && !dmN ? 'dm.html?pager=1' : 'dm.html';
    };
    void el.getBoundingClientRect();
    el.classList.add('on');
    bannerShownAt = Date.now();
    clearTimeout(el._t);
    el._t = setTimeout(() => { if (document.getElementById('msg-banner')) close(false); }, 8000);
  }
  /* 📨 새 메시지 토스트 — DM을 안 보고 있을 때 어느 화면에서든 알린다. 탭하면 그 대화로. */
  let toastTimer = null;
  async function showDmToast(t) {
    if (!UI.foreground && !document.hidden) return;      // [앱 실행 중 알림] 끔
    if (inDND() && !hitsKeyword(t.last_message || '')) return;   // 집중 시간
    const peer = t.user_lo === ME ? t.user_hi : t.user_lo;
    await profilesFor([peer]);
    const p = PROFILES[peer] || {};
    let el = document.getElementById('dm-toast');
    if (!el) {
      el = document.createElement('button');
      el.id = 'dm-toast'; el.type = 'button';
      document.body.appendChild(el);
    }
    // [내용 미리보기]가 꺼져 있으면 본문을 감춘다(어깨너머 방지)
    const raw = t.last_message || '';
    const kw = hitsKeyword(raw);
    const body = UI.preview ? esc(raw.slice(0, 40)) : '새 메시지가 도착했어요';
    el.classList.toggle('kw', !!kw);
    el.innerHTML = `${avaHTML(peer)}<span class="dm-toast-mid"><b>${esc(p.nickname || '새 메시지')}${kw ? ` · 「${esc(kw)}」` : ''}</b><i>${body}</i></span>`;
    // 집중 시간엔 조용히(키워드는 예외 — 놓치면 안 되는 말이라 등록한 것)
    const quiet = inDND() && !kw;
    if (!quiet) {
      if (UI.sound) playTone();
      if (UI.vibrate) { try { navigator.vibrate?.(kw ? [12, 60, 12] : 12); } catch (_) {} }
    }
    el.onclick = () => {
      hide();
      if (PAGE_MODE()) startDM(peer, p.nickname);
      else location.href = 'dm.html?dm=' + encodeURIComponent(peer);
    };
    requestAnimationFrame(() => el.classList.add('on'));
    try { window.BattleFX?.haptic?.('tap'); } catch (_) {}
    clearTimeout(toastTimer);
    function hide() { el.classList.remove('on'); }
    toastTimer = setTimeout(hide, 5000);
  }

  function attachInboxRealtime() {
    if (inboxChan) return;
    // ★ 비용·부하: 필터 없이 구독하면 '전체 스레드 갱신 × 접속자 수'만큼 서버가 팬아웃을
    //   계산한다(운영비 질문에 답하다 발견). 스레드의 내 자리가 user_lo일 수도 hi일 수도
    //   있는데 postgres_changes 필터는 OR을 못 하므로, 같은 채널에 필터 다른 바인딩 2개.
    const onThread = ({ new: t }) => {
      if (t.last_sender !== ME) {
        refreshBadge();
        // 그 대화를 보고 있지 않다면 토스트 — 보고 있으면 attachThread가 이미 그린다
        const viewing = ROOT && ROOT.classList.contains('open') && curThread === t.id;
        if (!viewing) showDmToast(t);
      }
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

  window.GALLA_openDM = function () { ME ? openDM() : promptLogin(); };
  let INITED = false;
  window.initDM = async function (btnSelector) {
    supabase = window.supabaseClient || supabase;
    if (!supabase) return;
    // 헤더 버튼(있으면) + 하단 네비 DM 탭(있으면) 둘 다 바인딩
    BTN = btnSelector ? document.querySelector(btnSelector) : null;
    if (BTN) BADGE = BTN.querySelector('.dm-badge');
    const navBtn = document.querySelector('.nav-item[data-page="dm"]');
    if (!BTN && !navBtn && INITED) return;
    const { data: sess } = await supabase.auth.getSession();
    ME = sess?.session?.user?.id || null;
    if (BTN) BTN.addEventListener('click', () => { ME ? openDM() : promptLogin(); });
    if (navBtn && !navBtn.dataset.dmBound) {
      navBtn.dataset.dmBound = '1';
      navBtn.addEventListener('click', () => { ME ? openDM() : promptLogin(); });
    }
    if (INITED) { if (ME) refreshBadge(); return; }
    INITED = true;
    if (ME) { refreshBadge(); attachInboxRealtime(); }
    // 🔗 딥링크: ?dm=… 은 dm 페이지의 몫 — 다른 페이지에서 받으면 페이지로 넘긴다
    try {
      const q = new URLSearchParams(location.search);
      const dm = q.get('dm');
      if (dm && !PAGE_MODE()) { location.replace('dm.html?dm=' + encodeURIComponent(dm)); return; }
      if (PAGE_MODE()) {
        // 공유 픽업(갈라 친구 → 페이지로 넘어온 경우)
        try {
          const raw = sessionStorage.getItem('galla_dm_share');
          if (raw) { sessionStorage.removeItem('galla_dm_share'); PENDING_SHARE = JSON.parse(raw); }
        } catch (_) {}
        if (ME) {
          openDM();
          if (dm && dm !== '1') startDM(dm, null);
          if (dm) {
            q.delete('dm');
            history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash);
          }
        } else {
          // 비로그인: 페이지는 열되 로그인 안내
          openLoggedOut();
        }
      }
    } catch (_) {}
  };
  /* 페이지 모드: dm.html 상단 헤더의 ⚙·✎ (DM 내부 '메시지' 바는 CSS로 제거 — 헤더로 승격) */
  function bindPageHeader() {
    const g = document.getElementById('pgDmGear');
    const c = document.getElementById('pgDmCompose');
    if (g && !g.dataset.bound) { g.dataset.bound = '1'; g.addEventListener('click', () => headMenu(g)); }
    if (c && !c.dataset.bound) { c.dataset.bound = '1'; c.addEventListener('click', () => { buildRoot(); showView('compose'); initSearch(); }); }
  }

  function openLoggedOut() {
    buildRoot();
    ROOT.classList.add('open');
    showView('inbox');
    ROOT.querySelector('#dm-inbox').innerHTML =
      `<div class="dm-empty">로그인하면 메시지를 쓸 수 있어요.<br><br>
        <button type="button" class="dm-login-cta" onclick="location.href='login.html'">로그인</button></div>`;
  }

  // 네비 DM 탭이 있는 페이지는 호출 없이도 스스로 부팅 (기존 initDM 호출 페이지와 공존)
  (function autoBoot() {
    const boot = async () => {
      const sb = window.supabaseClient || (window.waitForSupabaseClient ? await window.waitForSupabaseClient() : null);
      if (!sb) return;
      if (document.querySelector('.nav-item[data-page="dm"]') && !INITED) window.initDM(null);
    };
    if (document.readyState !== 'loading') boot();
    else document.addEventListener('DOMContentLoaded', boot, { once: true });
  })();
})();
