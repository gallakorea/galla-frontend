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
    crew:    I(12, '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
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
            <button class="dm-tab dm-tab-set" data-tab="set" role="tab" aria-label="메시지 설정">${ICONS.cog}</button>
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
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>푸시 알림</b><i>새 메시지를 기기 알림으로 — 아이폰은 홈 화면에 추가한 앱에서만 돼요</i></span>
              <button class="dm-toggle" id="dm-set-push" type="button"></button>
            </div>
            <div class="dm-set-row">
              <span class="dm-set-mid"><b>통화 마이크 권한</b><i>미리 허용해두면 육성톡·면상톡 때 다시 묻지 않아요</i></span>
              <button class="dm-mic-btn" id="dm-set-mic" type="button">확인 중…</button>
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
          <form class="dm-inputbar" id="dm-form">
            <button type="button" class="dm-attach" id="dm-attach" aria-label="사진 보내기">${ICONS.plus}</button>
            <input type="file" id="dm-file" accept="image/*" hidden>
            <textarea id="dm-input" rows="1" placeholder="메시지 입력…"></textarea>
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
    ROOT.addEventListener('click', e => {
      const cb = e.target.closest('.dm-callback');
      if (cb) { window.GALLA_call?.start(cb.dataset.peer, nickCache[cb.dataset.peer], cb.dataset.video === '1'); return; }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'close') closeDM();
      else if (act === 'compose') showView('compose'), initSearch();
      else if (act === 'settings') { headMenu(e.target.closest('[data-act]')); }
      else if (act === 'addFriend') { showView('add'); initAdd(); }
      else if (act === 'toFriends') { showView('inbox'); setTab('friends'); }
      else if (act === 'chatset') { openChatSet(); }
      else if (act === 'toThread') { showView('thread'); }
      else if (act === 'toInbox') { detachThread(); curThread = curPeer = null; clearReply(); showView('inbox'); loadInbox(); }
      else if (act === 'newRoom') { roomFormShow(true); }
      else if (act === 'roomToList') { detachRoom(); curRoom = null; showView('inbox'); setTab('rooms'); }
      else if (act === 'roomMenu') { roomMenu(e.target.closest('[data-act]')); }
      else if (act === 'gnew') { showView('gnew'); initGnew('create'); }
      else if (act === 'gnewBack') {
        if (GMODE === 'invite') showView('room');
        else { showView('compose'); initSearch(); }
      }
      else if (act === 'toRoom') { showView('room'); }
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
    ROOT.querySelector('#dm-gnew-go').addEventListener('click', createGroup);
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
      if (menu && !menu.hidden && !e.target.closest('#dm-menu, [data-act="settings"], [data-act="roomMenu"]')) menu.hidden = true;
    });
    return ROOT;
  }

  function showView(name) {
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
  let e2eBooted = false;
  function openDM() {
    buildRoot();
    if (!e2eBooted && ME && window.GALLA_e2e?.supported()) {
      e2eBooted = true;
      window.GALLA_e2e.ready(supabase, ME).catch(() => {});
    }
    if (ME && window.GALLA_call?.supported()) window.GALLA_call.listen(supabase, ME);
    if (ME && window.GALLA_e2e?.supported()) attachMailbox();
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
  function setTab(tab) {
    EDIT = false;   // 편집은 일시적 모드 — 탭을 바꾸면 해제(켠 채 넘어가면 다른 탭 메뉴가 '완료'로 떠서 헷갈린다)
    ROOT.querySelectorAll('.dm-tab').forEach(t => t.classList.toggle('on', t.dataset.tab === tab));
    ROOT.querySelector('#dm-inbox-wrap').hidden = tab !== 'chats';
    ROOT.querySelector('#dm-friends').hidden = tab !== 'friends';
    ROOT.querySelector('#dm-rooms').hidden = tab !== 'rooms';
    if (tab === 'friends') loadFriends(); else if (tab === 'rooms') loadRooms(); else loadInbox();
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
      { k: 'fav', label: PREF.favs.has(peer) ? '즐겨찾기 해제' : '즐겨찾기' },
      { k: 'hide', label: '목록에서 숨기기' },
      { k: 'block', label: '차단', danger: true },
    ], k => {
      if (k === 'voice' || k === 'video') return callFrom(peer, name, k === 'video');
      doFriendAct(k, peer, name);
    });
  }
  function threadMenu(el, x, y) {
    const tid = el.dataset.tid;
    if (!tid) return;   // 단체 채팅 행(.dm-gchat)은 1:1 고정/나가기 메뉴 대상이 아니다
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
    const ptg = ROOT.querySelector('#dm-set-push');
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
          else if (st === 'denied') { toastMini('알림이 차단돼 있어요 — 기기 설정에서 GALLA 알림을 허용해주세요'); }
          else { await window.GALLA_pushEnable(); toastMini('푸시 알림을 켰어요'); }
        } catch (e) {
          toastMini(String(e.message) === 'denied' ? '알림 권한이 거부됐어요' : '푸시 설정에 실패했어요');
        }
        paintPush();
      };
    }
    const micBtn = ROOT.querySelector('#dm-set-mic');
    if (micBtn) {
      const paintMic = async () => {
        let st = 'unknown';
        try { st = (await navigator.permissions.query({ name: 'microphone' })).state; } catch (_) {}
        micBtn.textContent = st === 'granted' ? '허용됨' : st === 'denied' ? '차단됨' : '허용받기';
        micBtn.classList.toggle('ok', st === 'granted');
        micBtn.dataset.st = st;
      };
      paintMic();
      micBtn.onclick = async () => {
        if (micBtn.dataset.st === 'granted') return toastMini('이미 허용돼 있어요');
        if (micBtn.dataset.st === 'denied') return toastMini('브라우저 설정 → 사이트 설정 → 마이크에서 galla.im을 허용해 주세요');
        const r = await (window.GALLA_callWarmup?.() ?? 'unsupported');
        toastMini(r === 'granted' ? '통화 준비 완료 — 이제 다시 묻지 않아요' : '권한을 받지 못했어요');
        paintMic();
      };
    }
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
    ]);
    GROUPS = groups || [];
    (threads || []).forEach(t => { PEER_THREADS[t.user_lo === ME ? t.user_hi : t.user_lo] = t.id; });
    // 나간 방은 제외하되, 나간 뒤 새 메시지가 왔으면 다시 보인다(카톡 문법)
    const list = (threads || []).filter(t => {
      const p = PREF.threads[t.id];
      return !(p?.left_at && new Date(t.last_message_at) <= new Date(p.left_at));
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
        : lm.startsWith('🔒') ? ICONS.lock : '';
      const pvText = pvIcon ? lm.replace(/^(📷|🎬|🔗|🔒)\s*/, '') : lm;
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
      inner = `<span class="dm-bub-body">${esc(m.body)}</span>`;
    }
    // 인용(답장)
    let quote = '';
    if (m.reply_to && MSGS[m.reply_to]) {
      const q = MSGS[m.reply_to];
      const qhtml = q.deleted_at ? `${ICONS.block} 삭제된 메시지`
        : q.kind === 'e2e' ? `${ICONS.lock} 비밀 메시지`
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
  function renderMsgs(msgs) {
    const wrap = ROOT.querySelector('#dm-msgs');
    wrap.innerHTML = msgs.map(bubbleHTML).join('');
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

  /* ---------- 전송 ---------- */
  async function sendMessage(fields) {
    const row = { thread_id: curThread, sender_id: ME, body: fields.body || '', kind: fields.kind || 'text',
                  meta: fields.meta || null, reply_to: fields.reply_to || null };
    const { data, error } = await supabase.from('dm_messages').insert(row).select().single();
    if (error) { console.error('[dm] send', error); return null; }
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
    if (!ME) return;
    const { count } = await supabase.from('dm_messages')
      .select('id', { count: 'exact', head: true }).is('read_at', null).neq('sender_id', ME);
    const paint = el => {
      if (!el) return;
      if (count && count > 0) { el.textContent = count > 99 ? '99+' : count; el.hidden = false; }
      else el.hidden = true;
    };
    paint(BADGE);
    paint(document.getElementById('navDmBadge'));   // 하단 네비 DM 탭 뱃지
  }
  /* 📨 새 메시지 토스트 — DM을 안 보고 있을 때 어느 화면에서든 알린다. 탭하면 그 대화로. */
  let toastTimer = null;
  async function showDmToast(t) {
    const peer = t.user_lo === ME ? t.user_hi : t.user_lo;
    await profilesFor([peer]);
    const p = PROFILES[peer] || {};
    let el = document.getElementById('dm-toast');
    if (!el) {
      el = document.createElement('button');
      el.id = 'dm-toast'; el.type = 'button';
      document.body.appendChild(el);
    }
    el.innerHTML = `${avaHTML(peer)}<span class="dm-toast-mid"><b>${esc(p.nickname || '새 메시지')}</b><i>${esc((t.last_message || '').slice(0, 40))}</i></span>`;
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
