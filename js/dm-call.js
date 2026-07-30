/* 📞 GALLA 보이스톡·페이스톡 — 1:1 WebRTC 통화
   구조(운영비 ~0원):
   · 미디어는 폰↔폰 직결(P2P). 직결 실패 시에만 Cloudflare TURN 중계(무료 1TB/월)
   · ICE 설정은 turn-cred 엣지 함수가 1시간짜리 임시 자격증명으로 발급 — 장기 비밀은 서버에만
   · 시그널링 = DB 신뢰 전송(call_sig 테이블 + Postgres Changes 상시 구독) — 유실·조인지연 없음(카톡급)
   · 벨: 접속 중이면 어느 페이지든 풀스크린 벨(이 파일이 자동 부팅) +
     부재 시 푸시 '보이스톡이 왔어요'(탭→대화방→부재중 기록에서 다시 걸기)
   · 앱 출시 대비: 시그널링·UI는 그대로 두고 네이티브 래핑 시 푸시만 FCM/CallKit로 바꿔 끼우면 된다 */
(function () {
  // 📞 판(iframe) 모드 — 네이티브 앱에선 통화 엔진이 최상위(app-shell)에서 돈다(거기서만 네이티브 WebRTC/CallKit 브릿지).
  //    판 안에선 엔진을 띄우지 않고 '발신 요청'만 최상위로 넘긴다. 웹(브라우저)은 페이지가 top이라 이 분기 안 탐 = 기존대로.
  if (window.top !== window.self) {
    var _O = location.origin;
    window.GALLA_call = {
      start: function (peer, name, video) { try { parent.postMessage({ galla: 'shell', t: 'callstart', peer: peer, name: name || '', video: !!video }, _O); } catch (_) {} },
      listen: function () {},
      supported: function () { return true; },
      _debug: function () { return { iframeForward: true }; }
    };
    return;
  }
  // 🔊 수신음 엔진 자동 로드(GALLA_SFX) — 통화는 어느 페이지서든 부팅되므로 여기서 보장
  if (!window.GALLA_SFX && !document.querySelector('script[data-galla-sfx]')) {
    try {
      const s = document.createElement('script');
      s.src = '/js/dm-sound.js?v=072920'; s.async = true; s.setAttribute('data-galla-sfx', '1');
      document.head.appendChild(s);
    } catch (_) {}
  }
  const I = (w, inner) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  const IC = {
    phone: I(20, '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>'),
    mic: I(18, '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/>'),
    micoff: I(18, '<line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/>'),
    cam: I(18, '<path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/>'),
    camoff: I(18, '<path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/><line x1="1" y1="1" x2="23" y2="23"/>'),
    flip: I(18, '<path d="M1 4v6h6"/><path d="M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>'),
    spk: I(18, '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"/>'),
    spkoff: I(18, '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>'),
    rec: I(18, '<circle cx="12" cy="12" r="6" fill="currentColor" stroke="none"/>'),
    // 🎧 '상대 소리'(내가 듣는 것) — 스피커폰 아이콘과 확실히 구분되게 헤드폰 모양
    hear: I(18, '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="2" y="13.5" width="4.5" height="7.5" rx="1.8"/><rect x="17.5" y="13.5" width="4.5" height="7.5" rx="1.8"/>'),
    hearoff: I(18, '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="2" y="13.5" width="4.5" height="7.5" rx="1.8"/><rect x="17.5" y="13.5" width="4.5" height="7.5" rx="1.8"/><line x1="2" y1="2.5" x2="22" y2="22.5"/>'),
  };
  let sb = null, ME = null, chanSig = null, _myNick = null;
  let pc = null, localStream = null, CUR = null;   // {peer,name,dir,video,pendIce,offer,connectedAt}
  let ringT = null, timerT = null, reoffT = null, t0 = 0, iceCache = null, iceAt = 0, facing = 'user', remoteStream = null;
  const _recentEnded = new Map();   // 👻 방금 끝낸 통화 callId→종료시각(ms). 발신자 reoffer 루프가 decline을 놓쳐 계속 쏘는 '끊으면 바로 다시 전화' 유령 차단용.
  let lastCallEndAt = 0;   // 🔒 유령발신 차단 — 통화 종료 직후 튀는 관통(ghost) 발신을 막기 위한 종료시각
  // 📞 Agora 미디어 전환 — 시그널링(벨·수락·CallKit)은 그대로, 소리/영상만 Agora. iosrtc 미디어(getMedia/PC/SDP) 우회.
  const AGORA = !!(window.GALLA_agora);
  try { window.__agoraLog = (m) => { try { wb('AG ' + m); } catch (_) {} }; } catch (_) {}
  function agoraUid() { // ME(유저 uuid)→uint32 결정적 해시(발신·수신 서로 다른 값 보장)
    const s = String(ME || Math.random()); let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return (h >>> 0) || 1;
  }
  async function agoraConnect(cur) {
    if (!AGORA || !cur || cur._agoraJoined) return;
    cur._agoraJoined = true;
    try {
      // 🔊 ⭐ 마이크 캡처 '전에' 세션을 .playAndRecord로 — 링백(.playback)이나 CallKit 세션 위에서
      //    Agora가 createMicrophoneAudioTrack을 하면 녹음 불가라 멈춘다. 순서가 핵심(한방향 소리 근본해결).
      nativeAgoraAudio();
      await window.GALLA_agora.join(cur.callId, agoraUid(), !!cur.video, {
        onPeerLeft: () => { try { if (CUR === cur) endCall('ended', true); } catch (_) {} },
        onRemoteVideo: (t) => { cur._agRemote = t; renderAgoraVideo(); },   // 상대 카메라 트랙
        onLocalVideo:  (t) => { cur._agLocal = t;  renderAgoraVideo(); },   // 내 카메라 트랙
      });
      if (CUR === cur) {
        if (!cur.connectedAt) { cur.connectedAt = Date.now(); startTimer(); }
        stopRings(); paintUI('oncall');
        nativeAgoraAudio();   // 재확정(영상 여부 반영) + 라우팅
        applyNativeRoute();   // 스피커/수화부 라우팅(영상=스피커)
      }
    } catch (e) { wb('agora connect FAIL ' + (e && e.message || e)); }
  }
  // Agora 영상 트랙을 통화 UI의 div 컨테이너에 재생. 콜백(트랙 도착)과 paintUI(요소 재생성) 양쪽에서 호출되며,
  //   컨테이너가 아직 없거나 이미 그 컨테이너에 붙어있으면(중복 play 방지) 건너뛴다.
  function renderAgoraVideo() {
    if (!AGORA || !CUR) return;
    try {
      const r = document.getElementById('dm-call-remote'), l = document.getElementById('dm-call-local');
      wb('AGV render r=' + (!!r) + ' l=' + (!!l) + ' rt=' + (!!CUR._agRemote) + ' lt=' + (!!CUR._agLocal));
      if (r && CUR._agRemote && CUR._agRemote.__el !== r) { try { CUR._agRemote.play('dm-call-remote', { fit: 'cover' }); CUR._agRemote.__el = r; wb('AGV remote played'); } catch (e) { wb('AGV remote play err ' + (e && e.message)); } }
      if (l && CUR._agLocal  && CUR._agLocal.__el  !== l) { try { CUR._agLocal.play('dm-call-local',  { fit: 'cover', mirror: true }); CUR._agLocal.__el = l; wb('AGV local played'); } catch (e) { wb('AGV local play err ' + (e && e.message)); } }
    } catch (_) {}
  }
  let SPK = false;                     // 스피커 모드(끄면 수화부/이어피스 라우팅)
  let REMUTE = false;                  // 상대 소리 끔
  let recRec = null, recChunks = [], recCtx = null, recT0 = 0;   // 통화 녹음
  let _ctMode = null, _ctPeer = null, _ctWake = null, _ctLoopT = null;   // 🔬 자가 테스트(디버그): 'caller'|'accept'
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // 프라미스 타임아웃 — getUserMedia 등 iosrtc 호출이 간헐적으로 영영 멈추는 것을 깨기 위해.
  function withTimeout(p, ms, label) {
    return Promise.race([Promise.resolve(p), new Promise((_, rej) => setTimeout(() => { const e = new Error(label || 'timeout'); e.name = 'Timeout'; rej(e); }, ms))]);
  }

  /* ── ICE 설정: TURN 자격증명(1시간) 30분 캐시, 실패 시 STUN만 ── */
  async function iceConfig() {
    if (iceCache && Date.now() - iceAt < 30 * 60 * 1000) return iceCache;
    try {
      const { data } = await sb.functions.invoke('turn-cred', { body: {} });
      if (data?.iceServers) { iceCache = { iceServers: data.iceServers }; iceAt = Date.now(); return iceCache; }
    } catch (_) {}
    return { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
  }

  // 📞 시그널링 = DB 신뢰 전송(카톡급). 채널 조인·유실 없이 상대의 상시 구독으로 즉시 배달.
  function send(msg) {
    const to = (CUR && CUR.peer) || msg.to;
    if (!to || !sb) return;
    if (['offer', 'answer', 'accepted', 'hangup'].includes(msg.t)) wb('tx-' + msg.t);
    try { sb.rpc('send_call_sig', { p_to: to, p_t: msg.t, p_payload: { ...msg, from: ME } }).then(() => {}, () => {}); } catch (_) {}
  }
  // 🔬 통화 흐름 추적(간헐 실패 규명용) — 통화당 몇 줄만 남긴다.
  function wb(m) { try { const c = sb || window.supabaseClient; c && c.rpc('log_client_error', { p_kind: 'call-audio', p_message: 'T ' + m + ' d=' + (CUR ? CUR.dir : '-'), p_ver: 'diag' }).then(() => {}, () => {}); } catch (_) {} }
  function statusBeacon(tag) {
    try {
      const la = localStream && localStream.getAudioTracks()[0];
      const ra = remoteStream && remoteStream.getAudioTracks && remoteStream.getAudioTracks()[0];
      wb(tag + ' ice=' + (pc && pc.iceConnectionState) + ' conn=' + (pc && pc.connectionState) +
         ' la=' + (la ? (la.enabled ? 'on' : 'mut') : 'none') + ' ra=' + (ra ? ra.readyState : 'none') +
         ' pre=' + (CUR && (CUR._preconnected ? 'y' : (CUR._preFail ? 'fail' : 'n'))) +
         ' eng=' + (window.__iosrtcReady ? 'iosrtc' : 'webkit') + ' spa=' + (document.body && document.body.dataset.page === 'spa' ? 'y' : 'n') +
         ' sink=' + (document.getElementById('dm-call-audio') ? 'y' : 'n'));
    } catch (_) {}
  }

  // ⚡ 콜드스타트 대비 시그널 폴링 — realtime 웹소켓이 막 연결돼 첫 몇 초간 broadcast를 놓칠 때,
  //    call_sig를 REST로 직접 읽어 offer/answer를 즉시 잡는다(REST는 워밍업 지연 없음). 연결되면 중단.
  //    onSignal이 중복 신호를 방어하므로 broadcast와 겹쳐도 안전.
  let pollT = null, pollSeen = null;
  function startSigPoll() {
    if (pollT || !sb || !ME) return;
    // ⚠️ '통화 시작 직전(-3초)부터'의 신호를 매번 전부 조회하고, 이미 처리한 id만 건너뛴다.
    //    (최대 id 기준으로 '이후'만 보면, 콜드 워밍업으로 폴링이 늦게 시작될 때 그 사이 도착한
    //     answer가 기준 이하라 영영 안 잡혀 발신자가 '통화중' 전환 실패했다.)
    const since = new Date(Date.now() - 3000).toISOString();
    pollSeen = new Set();
    let ticks = 0;
    pollT = setInterval(async () => {
      if (!CUR || CUR.connectedAt || ++ticks > 48) { stopSigPoll(); return; }   // 연결됐거나 12초 지나면 중단
      try {
        const { data } = await sb.from('call_sig').select('id,from_uid,t,payload').eq('to_uid', ME).gte('created_at', since).order('id', { ascending: true });
        const fresh = (data || []).filter(r => !pollSeen.has(r.id));
        for (const r of fresh) { pollSeen.add(r.id); onSigBroadcast({ payload: r.payload, t: r.t, from_uid: r.from_uid }); }
      } catch (_) {}
    }, 250);
  }
  function stopSigPoll() { if (pollT) { clearInterval(pollT); pollT = null; } pollSeen = null; }

  // 통화 시그널 broadcast 수신 → onSignal. DB 트리거(call_sig INSERT)가 이 토픽으로 즉시 직송한다.
  function onSigBroadcast(payload) {
    try { const d = payload || {}; onSignal({ ...(d.payload || {}), t: d.t, from: d.from_uid, to: ME }); } catch (_) {}
  }
  function newSigChannel() {
    // 프라이빗 broadcast 채널 — 인증은 앱의 전역 realtime 세션(알림·삐삐 RLS 구독과 동일)을 사용.
    return sb.channel('callsig:' + ME, { config: { private: true } })
      .on('broadcast', { event: 'sig' }, ({ payload }) => onSigBroadcast(payload))
      .subscribe();
  }
  function listen(_sb, me) {
    sb = _sb; ME = me;
    if (chanSig || !sb || !ME) return;
    // ⚡ 발신 지연 줄이기: TURN 자격증명 미리 데우고(첫 buildPC 즉시), 내 닉네임 캐시(오퍼 전 DB조회 제거).
    try { iceConfig().catch(() => {}); } catch (_) {}
    try { sb.from('users').select('nickname').eq('id', ME).single().then(r => { _myNick = (r && r.data && r.data.nickname) || _myNick; }, () => {}); } catch (_) {}
    // 🟢 통화 시그널링 = DB 트리거 → Realtime Broadcast 직송(카톡급). 로그인 시점부터 상시 구독이라
    //    조인 지연·콜드스타트 없음, 지연 수십 ms. offer/answer/ice/hangup 전부 이 경로 → 첫 통화도 즉시.
    chanSig = newSigChannel();
    // ⚡ 콜드스타트 수신 폴링 — realtime 웹소켓이 데워지기 전(로그인 직후 ~15초) 들어오는 offer를
    //    REST로도 확인한다(REST는 워밍업 지연 없음). 이게 없으면 앱 켜자마자 걸려온 첫 통화의 벨이
    //    5초 늦게 울려 '1차 실패'가 났다. 15초 지나거나 통화가 잡히면 중단(비용 무시 가능).
    try {
      // ⚡ 수신 offer 폴 — realtime broadcast가 유휴 웹소켓에서 5~6초씩 늦게 오는 것(사장님 '전화 안옴')의 백스톱.
      //    부팅 직후 15초는 250ms(빠르게), 이후엔 통화 안 할 때 1.5초 간격으로 '계속' 돈다 → offer 최대 1.5초 내 포착.
      //    앱이 백그라운드면 setTimeout이 어차피 멈추므로 자원 부담 없음(포그라운드 사용자만).
      let coldMax = -1, coldN = 0;
      const coldTick = async () => {
        if (!sb || !ME) return;
        if (!CUR) {   // 통화 중이면 startSigPoll이 담당 → 이때만 offer 조회
          try {
            let q = sb.from('call_sig').select('id,from_uid,t,payload').eq('to_uid', ME).order('id', { ascending: true });
            q = coldMax < 0 ? q.gte('created_at', new Date(Date.now() - 20000).toISOString()) : q.gt('id', coldMax);
            const { data: rows } = await q;
            for (const r of (rows || [])) { coldMax = Math.max(coldMax, r.id); if (r.t === 'offer') onSigBroadcast({ payload: r.payload, t: r.t, from_uid: r.from_uid }); }
          } catch (_) {}
        }
        coldN++;
        setTimeout(coldTick, coldN < 60 ? 250 : 1500);   // 첫 15초 250ms → 이후 1.5초 상시
      };
      coldTick();   // 즉시 1회(대기 없음)
    } catch (_) {}
    // ⚡ 부팅 시 TURN 자격증명을 미리 데워둔다 — 통화 시작·수락 때 buildPC가 turn-cred를 기다리지 않아
    //    연결 체감이 몇 초 → 1초대로 단축된다(30분 캐시).
    try { iceConfig().catch(() => {}); } catch (_) {}
    // 📟 삐삐 액정 팝업도 전 페이지에서 — dm 페이지 밖에서도 '삐삐가 왔습니다'가 떠야 한다
    if (!window.__pagerRingOn) {
      window.__pagerRingOn = true;
      sb.channel('pagering:' + ME)
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'pager_messages', filter: 'box_owner=eq.' + ME },
          async ({ new: row }) => {
            try {
              if (!window.GALLA_PAGER) {
                const v = ([...document.scripts].map(x => x.src).find(u => /[?&]v=/.test(u)) || '').match(/[?&]v=(\d+)/);
                await new Promise((res, rej) => {
                  const sc = document.createElement('script');
                  sc.src = '/js/dm-pager.js' + (v ? '?v=' + v[1] : '');
                  sc.onload = res; sc.onerror = rej; document.head.appendChild(sc);
                });
              }
              let name = '누군가';
              try {
                const { data: u } = await sb.from('users').select('nickname').eq('id', row.sender_id).maybeSingle();
                name = u?.nickname || name;
              } catch (_) {}
              window.GALLA_PAGER.popup({ name, kind: row.kind, code: row.code });
              window.GALLA_pagerRefresh?.();   // 삐삐 화면이 열려 있으면 목록도
            } catch (_) {}
          })
        .subscribe();
    }
  }
  // 📡 시그널 수신 채널(callsig:<ME>) 조인 보장 — 죽어 있으면 재구독. 통화 시작 전 짧게 확인.
  async function ensureSigJoined() {
    for (let i = 0; i < 12; i++) {
      if (chanSig && chanSig.state === 'joined') return;
      if (!chanSig || ['closed', 'errored'].includes(chanSig.state)) {
        try { if (chanSig) sb.removeChannel(chanSig); } catch (_) {}
        chanSig = null;
        if (sb && ME) chanSig = newSigChannel();
      }
      await new Promise(r => setTimeout(r, 200));
    }
  }
  async function onSignal(p) {
    if (p.to !== ME || p.from === ME) return;
    if (['offer', 'answer', 'accepted', 'hangup'].includes(p.t)) wb('rx-' + p.t);
    if (p.t === 'offer') {
      // 👻 유령 벨 차단 — 콜드스타트 REST 폴링이 '지난 통화'의 offer를 재생할 수 있다.
      //    15초 넘게 묵은 offer는 무시(발신자는 answer 올 때까지 1.2초마다 재전송하므로 산 통화는 안 놓친다).
      if (p.at && Date.now() - p.at > 15000) return;
      // 👻 "끊으면 바로 다시 전화" 유령 차단 — 내가 방금 끝낸(끊은/거절한) 통화의 재-offer는 새 수신벨을 만들지 않는다.
      //    발신자 reoffer 루프가 내 decline/hangup을 놓쳐(realtime 유실) 계속 같은 offer를 쏘는 것이라, 같은 callId면 무시.
      //    새 통화(다른 callId)는 그대로 받는다.
      if (p.callId && _recentEnded.has(p.callId) && Date.now() - _recentEnded.get(p.callId) < 45000) { wb('rx-offer ignored recently-ended ' + String(p.callId).slice(0, 8)); return; }
      // 같은 상대의 offer 재전송(내가 잠깐 suspend돼 첫 offer를 놓쳤을 수 있음) — busy 처리하면 안 된다.
      if (CUR && CUR.peer === p.from) {
        // 이미 answer를 만들었으면 다시 보내준다(발신자가 answer를 놓쳐 계속 재전송 중일 수 있음).
        if (CUR._lastAnswer) send({ t: 'answer', sdp: CUR._lastAnswer });
        return;   // 아직 안 받았으면 무시(수신벨은 이미 떠 있음)
      }
      // 다른 상대와 통화/수신 중이면 진짜 busy
      if (CUR) { send({ t: 'busy', to: p.from }); return; }
      CUR = { peer: p.from, name: p.name || '갈라 친구', dir: 'in', video: !!p.video, offer: p.sdp, pendIce: [], callId: p.callId || '' };
      // 📞 웹이 offer를 처리함 = 앱이 살아있음(포그라운드/도달가능) → 발신자에게 'ring' ack.
      //    발신자는 이 ack가 오면 '끊을 때 realtime hangup으로 끝난다'고 보고 취소 푸시를 안 보낸다(깜빡임 방지).
      try { send({ t: 'ring' }); } catch (_) {}
      try { iceConfig().catch(() => {}); } catch (_) {}   // ⚡ 받기 전에 TURN 미리 데움 → 수락 즉시 answer
      startSigPoll();   // ⚡ 콜드스타트 구간 이후 신호(ice 등)도 REST로 즉시
      // 📞 웹 수신벨 = 포그라운드 통화의 주 UI(realtime로 빠르게). CallKit(VoIP 푸시)은 잠금/백그라운드 보너스.
      //    ⚠️ VoIP 푸시 스로틀링(오늘 report+end 남발로 유발)으로 푸시가 11초씩 늦으니, 포그라운드는 웹벨에 의존한다.
      paintUI('incoming');
      try { window.GALLA_SFX?.unlock?.(); } catch (_) {}
      try { window.GALLA_SFX?.resumeAfterCall?.(); } catch (_) {}   // 이전 통화 suspend 해제(벨 무음 방지)
      try { window.GALLA_SFX?.ringInStart(); } catch (_) {}   // 🔔 수신 벨소리(웹오디오)
      startRingHaptic();                                       // 📳 진동 링
      ringT = setTimeout(() => endCall('timeout'), 40000);
      // 🔬 자가 테스트 '자동 수신' 모드 — CallKit 탭 없이 벨 뜨면 바로 수락(디버그 전용)
      if (_ctMode === 'accept') { setTimeout(() => { try { if (CUR && CUR.dir === 'in' && !CUR._accepting) accept('selftest'); } catch (_) {} }, 900); }
      // 🎤 벨 중 '마이크만' 미리 준비(음소거) → 받기 시 getMedia 대기 0 = 전환 즉시.
      //    PC·answer는 안 만든다(프리커넥트 레이스 없음). 권한 있을 때만(프롬프트로 벨 방해 X).
      //    ⚠️ AGORA면 절대 프리웜 금지 — iosrtc getMedia가 마이크를 잡고 있으면 Agora createMicrophoneAudioTrack이
      //       그 마이크를 못 잡아 멈춘다(받는 사람만 publish 실패 = '거는 사람만 소리'의 진짜 원인). Agora가 자기 마이크 관리.
      if (!AGORA) (async () => {
        const cur = CUR;
        try {
          if ((await micPermState()) !== 'granted') return;
          if (CUR !== cur || localStream) return;
          const st = await getMedia(!!p.video);
          if (CUR !== cur || localStream) { try { st.getTracks().forEach(t => t.stop()); } catch (_) {} return; }
          try { st.getAudioTracks().forEach(t => { t.enabled = false; }); } catch (_) {}   // 음소거 대기
          localStream = st;
          wb('mic-prewarm ok');
        } catch (_) {}
      })();
      preconnectIncoming();   // (비활성) 프리커넥트 자리 — 위 마이크 프리웜으로 대체
      // 잠금화면 CallKit에서 이미 '받기'를 눌렀다면(푸시가 offer보다 먼저 도착) 즉시 수락
      try { if (window.__gallaCallKitConsume && window.__gallaCallKitConsume()) accept('consume'); } catch (_) {}
      return;
    }
    if (!CUR || p.from !== CUR.peer) return;
    if (p.t === 'ring') {
      // 📞 수신자 웹이 offer를 처리함(=포그라운드/도달가능) → 끊을 때 realtime hangup으로 CallKit이 끝나므로
      //    취소 VoIP 푸시를 보내지 않는다(취소 푸시의 reportNewIncomingCall이 깜빡임을 만드는 것 방지).
      if (CUR.dir === 'out') { CUR._foreground = true; wb('ring-ack fg'); }   // 📞 푸시는 그대로 보낸다(잠금 대비) — 억제는 수신자 인앱 수락 시 네이티브가
      return;
    }
    if (p.t === 'qastep') { try { _qaBanner(p.text || ''); } catch (_) {} return; }   // 🔬 QA 배너 동기화(수신폰에도 같은 단계 표시)
    if (p.t === 'accepted') {
      // 📞 상대가 '받기'를 누른 순간. Agora면 발신자도 이제 채널 join(→ 양쪽 미디어 연결).
      if (CUR.dir === 'out') {
        if (AGORA) { clearTimeout(ringT); agoraConnect(CUR); return; }
        try { localStream && localStream.getTracks().forEach(t => { t.enabled = true; }); } catch (_) {}
        if (!CUR.connectedAt) {
          clearTimeout(ringT); stopRings(); CUR.connectedAt = Date.now(); startTimer(); paintUI('oncall'); nativeAudioOn(); armAudioKick(); armVideoRenderKick(); applyNativeRoute();
        }
      }
      return;
    }
    if (p.t === 'answer') {
      if (CUR._gotAnswer) return;   // 재전송된 answer 중복 처리 방지(setRemoteDescription 상태오류 회피)
      CUR._gotAnswer = true;
      clearInterval(reoffT); reoffT = null;   // 🔁 answer 받았으니 offer 재전송 중단
      try {
        await pc.setRemoteDescription({ type: 'answer', sdp: p.sdp });
        // ★ answer보다 먼저 도착해 버퍼된 ICE 후보를 여기서 소비(교차망 '연결중' 고착 방지)
        for (const c of (CUR?.pendIce || []).splice(0)) { try { await pc.addIceCandidate(c); } catch (_) {} }
        // 📞 answer는 '미디어 경로만' 연결한다 — 프리커넥트로 링 중에 미리 도착할 수 있으므로
        //    UI 전환은 하지 않는다(전환·음소거 해제는 'accepted' 신호가 전담).
        nativeAudioOn();
      } catch (e) { console.error('[call]', e); }
    }
    else if (p.t === 'ice') {
      if (pc && pc.remoteDescription) { try { await pc.addIceCandidate(p.cand); } catch (_) {} }
      else CUR.pendIce.push(p.cand);
    }
    else if (p.t === 'reoffer') {
      // 통화 중 전환(영상↔음성) 재협상 — 상대가 영상을 켜면 내 화면도 영상 레이아웃으로
      try {
        await pc.setRemoteDescription({ type: 'offer', sdp: p.sdp });
        const ans = await pc.createAnswer();
        ans.sdp = tuneOpus(ans.sdp);
        await pc.setLocalDescription(ans);
        send({ t: 'reanswer', sdp: ans.sdp });
        const nowVideo = !!p.video || !!(remoteStream && remoteStream.getVideoTracks().some(t => t.readyState === 'live'));
        if (CUR.video !== nowVideo) { CUR.video = nowVideo; SPK = nowVideo; paintUI('oncall'); toast(nowVideo ? '상대가 면상톡으로 전환했어요' : '상대가 음성으로 전환했어요'); }
      } catch (e) { console.error('[call] reoffer', e); }
    }
    else if (p.t === 'reanswer') {
      try { await pc.setRemoteDescription({ type: 'answer', sdp: p.sdp }); } catch (e) { console.error('[call] reanswer', e); }
    }
    else if (p.t === 'vmode') {
      // Agora 통화 중 상대의 영상 on/off 알림 — 내 UI 레이아웃을 상대에 맞춘다(영상은 Agora onRemoteVideo로 도착)
      const nowVideo = !!p.video;
      if (CUR && CUR.video !== nowVideo) { CUR.video = nowVideo; SPK = nowVideo; paintUI('oncall'); renderAgoraVideo(); toast(nowVideo ? '상대가 면상톡으로 전환했어요' : '상대가 음성으로 전환했어요'); }
    }
    else if (p.t === 'recnotice') { toast('⏺ 상대가 통화를 녹음하고 있어요'); }
    else if (p.t === 'hangup' || p.t === 'decline' || p.t === 'busy') {
      endCall(p.t === 'busy' ? 'busy' : p.t === 'decline' ? 'declined' : 'ended', true);
    }
  }

  /* 설정(js/dm.js의 로컬 취향)을 통화가 실제로 반영한다 — 저장만 하고 무시하면 가짜다 */
  const PREF = () => (window.GALLA_dmPrefs ? window.GALLA_dmPrefs() : {});

  async function micPermState() {
    try { const st = await navigator.permissions.query({ name: 'microphone' }); return st.state; }
    catch (_) { return 'unknown'; }
  }
  /* 권한 창이 뜨기 직전 안내 — '이번만 허용'을 누르면 통화마다 다시 묻는다는 걸 모른다 */
  async function primePermHint(video) {
    const st = await micPermState();
    if (st === 'prompt' || st === 'unknown') {
      toast(`${video ? '카메라·마이크' : '마이크'} 창이 뜨면 [허용]을 눌러주세요 — '이번만'은 통화마다 다시 물어요`);
    }
    return st;
  }
  /* Opus 고음질 튜닝 — WebRTC 기본은 저비트레이트 좁은대역이라 통화가 먹먹하다.
     FEC(패킷손실 복구)·64kbps·48kHz 광대역·DTX off(끊김 없는 연속 음질). */
  function tuneOpus(sdp) {
    try {
      const m = sdp.match(/a=rtpmap:(\d+)\s+opus\/48000/i);
      if (!m) return sdp;
      const pt = m[1];
      const params = 'minptime=10;useinbandfec=1;stereo=0;maxaveragebitrate=64000;maxplaybackrate=48000;usedtx=0;cbr=0';
      const fmtpRe = new RegExp('a=fmtp:' + pt + ' [^\\r\\n]*');
      if (fmtpRe.test(sdp)) return sdp.replace(fmtpRe, 'a=fmtp:' + pt + ' ' + params);
      return sdp.replace(new RegExp('(a=rtpmap:' + pt + ' opus/48000/2\\r?\\n)'), '$1a=fmtp:' + pt + ' ' + params + '\r\n');
    } catch (_) { return sdp; }
  }

  async function getMedia(video) {
    const md = navigator.mediaDevices;
    if (!md?.getUserMedia) { const e = new Error('nomedia'); e.name = 'NoMediaDevices'; throw e; }
    try {
      // [면상톡 저데이터] — 화질을 낮춰 데이터·불안정 회선에 대응
      const low = !!PREF().lowData;
      return await md.getUserMedia({
        // ⚠️ sampleRate/channelCount 같은 하드 제약은 iOS에서 AEC(에코 제거)를
        //    무력화하는 사례가 있다 — 처리 계열 3종만 요청(울림의 주범 제거)
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: video ? (low
          ? { facingMode: facing, width: { ideal: 480 }, height: { ideal: 360 }, frameRate: { max: 20 } }
          : { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } }) : false,
      });
    } catch (e) {
      // 일부 안드로이드가 고급 제약에서 넘어진다 — 소박한 제약으로 한 번 더
      if (e && (e.name === 'OverconstrainedError' || e.name === 'TypeError' || e.name === 'AbortError'))
        return md.getUserMedia({ audio: true, video: !!video });
      // 카메라가 없거나 다른 앱이 점유 중인 폰 — 면상톡을 육성톡으로 강등해 연결은 살린다
      if (video && e && (e.name === 'NotFoundError' || e.name === 'NotReadableError' || e.name === 'DevicesNotFoundError' || e.name === 'TrackStartError')) {
        const st = await md.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        st._videoFallback = true;
        return st;
      }
      throw e;
    }
  }
  function explainMediaErr(e, video) {
    const n = (e && e.name) || String(e);
    if (n === 'NoMediaDevices')
      return '이 환경에선 마이크 접근이 막혀 있어요 — 아이폰 홈 화면 앱은 iOS 16.4 이상이 필요해요. 사파리에서 galla.im을 열면 바로 돼요';
    if (n === 'NotAllowedError' || n === 'PermissionDeniedError')
      return (video ? '카메라·마이크' : '마이크') + ' 권한이 거부돼 있어요 — 브라우저 설정에서 갈라(galla.im)의 권한을 허용해 주세요';
    if (n === 'NotFoundError') return '마이크를 찾을 수 없어요';
    if (n === 'NotReadableError') return '다른 앱이 마이크를 쓰고 있어요 — 닫고 다시 시도해 주세요';
    return '통화를 시작하지 못했어요 (' + n + ')';
  }
  /* 실패를 소리 없이 삼키지 않는다 — 이유가 적힌 화면을 남긴다 */
  function paintErr(name, msg, retry) {
    let box = document.getElementById('dm-call');
    if (!box) { box = document.createElement('div'); box.id = 'dm-call'; document.body.appendChild(box); requestAnimationFrame(() => box.classList.add('on')); }
    clearTimeout(box._rm);   // ★ endCall이 예약한 제거 취소 — 안 하면 에러 화면이 250ms 만에 증발
    box.classList.add('on'); box.classList.remove('video');
    box.dataset.state = 'error';
    box.innerHTML = `
      <div class="dmc-card">
        <span class="dmc-ava">${esc((name || '갈').charAt(0))}</span>
        <div class="dmc-name">${esc(name || '')}</div>
        <div class="dmc-state dmc-err">${esc(msg)}</div>
        ${/권한|허용|막혀/.test(msg || '') ? `<button class="dmc-retry" data-c="fix" type="button">권한 켜는 법 보기</button>` : ''}
        ${retry ? `<button class="dmc-retry" data-c="retry" type="button">권한 허용했어요 — 다시 걸기</button>` : ''}
        <div class="dmc-btns"><button class="dmc-btn end" data-c="close" aria-label="닫기">${IC.phone}</button></div>
      </div>`;
    box.onclick = async e => {
      const c = e.target.closest('[data-c]')?.dataset.c;
      if (c === 'close') { box.classList.remove('on'); setTimeout(() => box.remove(), 250); }
      else if (c === 'retry' && retry) { box.remove(); retry(); }
      else if (c === 'fix') {
        // 통화는 카메라까지 필요하다 — 마이크·카메라를 한 자리에서 해결
        if (!window.GALLA_micHelp) {
          const v = ([...document.scripts].map(x => x.src).find(u => /[?&]v=/.test(u)) || '').match(/[?&]v=(\d+)/);
          await new Promise(res => { const sc = document.createElement('script'); sc.src = '/js/mic-help.js' + (v ? '?v=' + v[1] : ''); sc.onload = sc.onerror = res; document.head.appendChild(sc); });
        }
        window.GALLA_micHelp?.({ video: /카메라/.test(msg || '') });
        window.addEventListener('galla:mic-granted', () => { box.remove(); retry?.(); }, { once: true });
      }
    };
  }
  /* 설정 화면 등에서 권한을 미리 받아둔다 — 성공 시 즉시 반납(불 안 켬) */
  window.GALLA_callWarmup = async function () {
    const st = await micPermState();
    if (st === 'granted') return 'granted';
    toast(`마이크 창이 뜨면 [허용]을 눌러주세요 — 한 번 허용하면 통화 때 다시 묻지 않아요`);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach(t => t.stop());
      return 'granted';
    } catch (e) { return (e && e.name) || 'error'; }
  };
  async function buildPC(addLocal = true) {
    wb('buildPC start addLocal=' + addLocal);
    pc = new RTCPeerConnection(await iceConfig());
    wb('buildPC pc-ok');
    // 발신자(offer)는 트랙을 먼저 넣고 offer 생성. 수신자(answer)는 setRemoteDescription(offer) '후'에
    //   트랙을 넣어야(addLocal=false로 여기선 스킵) 수신자 트랙이 offer의 m-line에 붙어 발신자가 받는다.
    if (addLocal) localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    let _iceN = 0;
    pc.onicecandidate = e => { if (e.candidate) { _iceN++; if (_iceN === 1 || _iceN === 5) wb('icecand#' + _iceN); send({ t: 'ice', cand: e.candidate }); } else wb('icecand-end n=' + _iceN); };
    pc.onicegatheringstatechange = () => { if (pc) wb('icegather=' + pc.iceGatheringState); };
    pc.ontrack = e => {
      // ⚠️ iosrtc는 '유효한 blobId를 가진 plugin MediaStream'만 렌더한다. ontrack이 주는 원본
      //   스트림(e.streams[0])이 그 스트림이다 — new MediaStream()+addTrack으로 갈아끼우면 blobId가
      //   없어 검은 화면이 났다. 원본 스트림을 유지하고, 트랙만 오면 같은 스트림에 합친다(blobId 보존).
      try {
        const s0 = e.streams && e.streams[0];
        if (s0 && typeof s0.getBlobId === 'function') {
          if (remoteStream !== s0) {
            // 기존 스트림에 있던 트랙을 원본 스트림으로 합쳐 하나로 유지
            if (remoteStream && remoteStream.getTracks) {
              remoteStream.getTracks().forEach(t => { try { if (!s0.getTracks().some(x => x.id === t.id)) s0.addTrack(t); } catch (_) {} });
            }
            remoteStream = s0;
          }
        } else if (e.track) {
          if (!remoteStream) { try { remoteStream = new MediaStream(); } catch (_) {} }
          try { if (remoteStream && !remoteStream.getTracks().some(t => t.id === e.track.id)) remoteStream.addTrack(e.track); } catch (_) {}
        }
        // 📹 실제 수신 트랙 id를 이벤트에서 직접 잡아 네이티브 렌더에 쓴다(stream 기반 id는 blobId 없는
        //   스트림에서 헛값일 수 있어 발신자가 수신자 영상을 못 그리던 것 — 이벤트 트랙 id는 확실히 등록됨).
        if (e.track && e.track.kind === 'video' && CUR) CUR._rvTrackId = e.track.id;
        wb('ontrack ' + (e.track && e.track.kind) + ' s0blob=' + !!(s0 && s0.getBlobId && s0.getBlobId()) + ' tid=' + (e.track && e.track.id ? e.track.id.slice(0, 8) : '-') + ' rv=' + (remoteStream && remoteStream.getVideoTracks ? remoteStream.getVideoTracks().length : '?') + ' ra=' + (remoteStream && remoteStream.getAudioTracks ? remoteStream.getAudioTracks().length : '?'));
      } catch (_) {}
      attachMedia();
    };
    // ⚠️ connect 핸들러는 '오디오 유닛 켜기'만 — UI 전환(통화중)은 오직 accept(수신자)와 'accepted'
    //    신호(발신자)가 제어한다. 프리커넥트(벨 중 ICE 미리 연결) 때 벨 화면이 통화중으로 튀지 않게.
    pc.oniceconnectionstatechange = () => {
      if (!pc) return;
      wb('ice=' + pc.iceConnectionState);
      if (['connected', 'completed'].includes(pc.iceConnectionState)) {
        // 복구됨 — disconnected 유예 타이머가 걸려 있으면 취소(끊김 오판 방지)
        if (CUR && CUR._dropT) { clearTimeout(CUR._dropT); CUR._dropT = null; wb('drop-recover'); }
        nativeAudioOn(); armAudioStatDiag();
      }
    };
    pc.onconnectionstatechange = () => {
      if (!pc) return;
      wb('conn=' + pc.connectionState);
      if (pc.connectionState === 'connected') {
        if (CUR && CUR._dropT) { clearTimeout(CUR._dropT); CUR._dropT = null; wb('drop-recover2'); }
        nativeAudioOn();
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        // failed/closed = 종결 상태 → 즉시 종료(활성 통화만).
        if (CUR && CUR.connectedAt) endCall(pc.connectionState === 'failed' ? 'netfail' : 'ended');
      } else if (pc.connectionState === 'disconnected') {
        // ⚠️ disconnected는 '일시적' — WebRTC가 스스로 connected로 복구하는 경우가 많다.
        //    즉시 끊으면 한쪽 네트워크 순간 끊김에 통화 전체가 죽는다("한쪽만 끊김"의 원인).
        //    8초 유예 후에도 안 돌아오면 그때 종료. connected 되면 위에서 타이머 취소.
        if (CUR && CUR.connectedAt && !CUR._dropT) {
          wb('drop-grace');
          CUR._dropT = setTimeout(() => {
            if (!pc || !CUR || !CUR.connectedAt) return;
            const st = pc.connectionState, ist = pc.iceConnectionState;
            if (['connected', 'completed'].includes(st) || ['connected', 'completed'].includes(ist)) { wb('drop-late-recover'); return; }
            wb('drop-timeout end'); endCall('ended');
          }, 8000);
        }
      }
    };
  }

  /* 통화는 앱 전용(사장님 결정) — 웹은 수화부 라우팅·에코 제어가 막혀
     통화 품질을 보장할 수 없다. 웹에서는 안내만. */
  function appOnlyNotice() {
    const box = document.createElement('div');
    box.id = 'dm-call-apponly';
    box.style.cssText = 'position:fixed;inset:0;z-index:100002;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.6)';
    box.innerHTML = `
      <div style="width:min(320px,88vw);background:linear-gradient(180deg,#181a20,#0d0e12);border:1px solid rgba(255,255,255,.09);border-radius:20px;padding:26px 20px 16px;text-align:center;box-shadow:0 24px 60px rgba(0,0,0,.6)">
        <div style="font-size:34px;margin-bottom:10px">📱</div>
        <div style="font-size:16px;font-weight:900;color:#fff;line-height:1.4">육성톡·면상톡은<br>갈라 앱 전용이에요</div>
        <div style="margin-top:8px;font-size:13px;color:#9aa2b5;line-height:1.65">최고 음질과 안정적인 연결을 위해<br>앱에서 이용해 주세요.</div>
        <button type="button" style="width:100%;margin-top:18px;padding:13px 0;border:none;border-radius:13px;cursor:pointer;background:linear-gradient(135deg,#6a7bff,#3a5bff);color:#fff;font-size:14px;font-weight:900;font-family:inherit">확인</button>
      </div>`;
    box.querySelector('button').onclick = () => box.remove();
    box.addEventListener('click', e => { if (e.target === box) box.remove(); });
    document.body.appendChild(box);
  }

  async function start(peer, name, video) {
    // 🔬 유령 추적 — start()를 부른 트리거·종료후 경과·신뢰클릭 여부를 남긴다(9초 유령 규명).
    try { wb('start ENTER trig=' + (window.__callTrig || '?') + ' since=' + (Date.now() - lastCallEndAt) + ' cur=' + (CUR ? 1 : 0) + ' peer=' + String(peer || '').slice(0, 6)); window.__callTrig = null; } catch (_) {}
    if (CUR || !sb || !ME) return;
    // 🔒 유령발신 원천차단 — 통화 종료 직후(2초 내) 발신은 '끊기 탭 관통(ghost click)'으로 튄 것이라 무시.
    //    사람은 통화 끝나고 '다시 걸기'를 의식적으로 누르므로 2초는 지난다. (같은 스코프라 문서경계·캐시 무관하게 확실)
    if (Date.now() - lastCallEndAt < 2000) { try { wb('start blocked (ghost <2s)'); } catch (_) {} return; }
    if (!(window.GALLA_isApp && window.GALLA_isApp())) return appOnlyNotice();
    if (!window.RTCPeerConnection) return toast('이 브라우저는 통화를 지원하지 않아요');
    CUR = { peer, name: name || '갈라 친구', dir: 'out', video: !!video, pendIce: [], callId: (crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + '-' + Math.round(1e9 * ((ME || 'x').charCodeAt(0) / 128))) };
    paintUI('preparing');   // 즉시 화면부터 — '눌렀는데 아무 일도 없음'을 없앤다
    await primePermHint(!!video);
    if (!AGORA) {   // iosrtc 미디어 준비 — Agora면 미디어는 join 시 Agora가 잡으므로 우회
      try { localStream = await getMedia(!!video); }
      catch (e) { const nm = CUR.name; CUR = null; return paintErr(nm, explainMediaErr(e, video), () => start(peer, name, video)); }
      if (localStream._videoFallback && CUR.video) { CUR.video = false; toast('카메라를 쓸 수 없어 육성톡으로 걸어요'); }
    }
    try {
    await ensureSigJoined();   // 📡 시그널 수신 채널 조인 보장(첫 통화 즉시 전환)
    startSigPoll();            // ⚡ 콜드스타트 구간 answer를 REST 폴링으로 즉시 잡기(발신 '거는중' 고착 방지)
    let offer;
    if (AGORA) {
      offer = { sdp: 'agora' };   // 🔊 Agora: 실제 SDP 불필요 — offer는 '벨 울려라' 신호일 뿐, 수락되면 양쪽 join
    } else {
    await buildPC();
    // 🔇 상대가 받기 전엔 내 마이크 음소거(ICE는 미리 뚫리되 소리는 안 새게). 'accepted'가 오면 푼다.
    try { if (!CUR.connectedAt && !CUR._userMuted) localStream.getAudioTracks().forEach(t => { t.enabled = false; }); } catch (_) {}
    }
    // ⚠️ 발신 '벨 울리는 동안'엔 네이티브 voiceChat 세션을 켜지 않는다(WebAudio 링백 눌림 방지).
    paintUI('outgoing');
    nativeStartOutgoing(CUR.name);   // 📞 발신도 CallKit에 보고 → 발신자도 네이티브 통화화면+CallKit 오디오(대칭)
    _nativeCall({ action: 'ringSession' });   // 📞 발신 벨 동안 .playback 세션(무음스위치 무시) → 링백이 무음모드서도 울림(카톡식)
    try { window.GALLA_SFX?.resumeAfterCall?.(); } catch (_) {}   // 이전 통화의 suspend 해제(안 하면 링백 무음)
    try { window.GALLA_SFX?.ringOutStart(); } catch (_) {}   // 📞 발신 링백
    if (!AGORA) {
    const o = await pc.createOffer();
    o.sdp = tuneOpus(o.sdp);
    offer = o;
    await pc.setLocalDescription(offer);
    }
    // 닉네임은 캐시 사용(오퍼 전 DB조회 블로킹 제거 → 전환 빠르게). 캐시 없으면 백그라운드로 채워 다음 통화에.
    let myName = _myNick || '갈라';
    if (!_myNick) { try { sb.from('users').select('nickname').eq('id', ME).single().then(r => { _myNick = (r && r.data && r.data.nickname) || _myNick; }, () => {}); } catch (_) {} }
    send({ t: 'offer', sdp: offer.sdp, name: myName, video: !!video, at: Date.now(), callId: CUR.callId });
    // 🔬 자가테스트(caller)는 VoIP/푸시를 끈다 — 하네스가 CallKit을 울려놓고 웹으로 자동수락하면
    //    CallKit이 세션을 물고 안 놓아 다음 통화 활성화가 충돌(caller=false ERR). 순수 웹 수락 경로로 측정.
    if (_ctMode !== 'caller') {
      // 부재 대비: 상대 기기에 '보이스톡이 왔어요' 푸시(서버가 스레드 관계 검증)
      try { sb.functions.invoke('send-push', { body: { kind: 'call', id: peer, video: !!video } }).catch(() => {}); } catch (_) {}
      // 📞 iOS VoIP 푸시 — 정석(Apple/Vonage): ring-ack로 '막지 않는다'. 잠금폰은 오직 CallKit 푸시로만
      //    벨이 울리므로 '항상' 보낸다(수신자가 잠기기 직전 ring-ack만 주고 잠기면, 예전엔 푸시를 막아 연결 자체가 죽었음).
      //    포그라운드 중복벨은 수신자가 '인앱으로 받는 순간'(callHandledInApp) 네이티브가 그 통화를 억제해 방지.
      const _cur = CUR;
      _cur._pushT = setTimeout(() => {
        if (CUR !== _cur || _cur.connectedAt) { _cur._pushT = null; return; }   // 이미 연결됐을 때만 스킵
        try { sb.functions.invoke('call-push', { body: { to: peer, video: !!video, callId: _cur.callId } }).catch(() => {}); } catch (_) {}
        _cur._pushSent = true; _cur._pushT = null;
      }, 1500);
    }
    // 🔁 offer 재전송 — 상대가 잠금/백그라운드로 suspend돼 있으면 첫 offer(실시간 브로드캐스트)는
    //    큐잉 없이 사라진다(그래서 '받는 쪽 벨은 떴는데 거는 쪽은 계속 거는중'). 푸시로 깨어나 채널에
    //    재구독한 뒤 다음 재전송을 잡도록, answer 받을 때까지 1.2초마다 같은 offer를 다시 쏜다
    //    (broadcast 유실 복구를 빠르게 — 1차 실패·연결 지연 최소화).
    clearInterval(reoffT);
    reoffT = setInterval(() => {
      if (!CUR || CUR.dir !== 'out' || CUR.connectedAt || CUR._gotAnswer) { clearInterval(reoffT); reoffT = null; return; }
      try { send({ t: 'offer', sdp: offer.sdp, name: myName, video: !!video, at: Date.now(), callId: CUR.callId }); } catch (_) {}
    }, 1200);
    ringT = setTimeout(() => { toast('응답이 없어요 — 부재중 알림을 남겼어요'); endCall('noanswer'); }, 45000);   // 콜드스타트(상대 앱 죽어있음) 여유
    } catch (e) {
      console.error('[call] start', e);
      const nm = CUR?.name;
      try { pc?.close(); } catch (_) {} pc = null;
      try { localStream?.getTracks().forEach(t => t.stop()); } catch (_) {} localStream = null;
      CUR = null;
      paintErr(nm, '통화를 시작하지 못했어요 (' + ((e && e.name) || '오류') + ')');
    }
  }

  // 수신자 answer 생성 공용 — PC 구성 → offer 반영 → answer 전송(중복 재전송 포함).
  //    muted=true면 마이크를 음소거로 붙인다(프리커넥트: ICE는 뚫되 받기 전 소리 안 새게).
  async function buildAnswer(cur, muted) {
    // 🛡️ 죽은 통화 가드 — getMedia가 느려(이전 통화 마이크 미해제) 대기하는 동안 발신자가 끊으면
    //    cur이 null이 되어 아래 cur.offer에서 'null is not an object'로 터진다. 조용히 접는다.
    if (!cur || !cur.offer) { wb('bA abort0 cur=' + (cur ? 'y' : 'n') + ' offer=' + (cur && cur.offer ? 'y' : 'n')); return; }
    // 트랙은 setRemoteDescription '후'에 붙인다(양방향 소리 확인된 방식). 발신자가 수신자 영상을 못 보던 건
    //   s0blob과 무관하게 ontrack 이벤트의 실제 트랙 id로 네이티브 렌더를 잡아 해결한다(CUR._rvTrackId).
    wb('bA enter muted=' + muted + ' ls=' + (localStream ? localStream.getTracks().length : 'none'));
    try {
      await buildPC(false);
      nativeAudioOn();   // 🔊 셋업 시점에 오디오 유닛 미리 켬(CallKit didActivate와 이중 안전)
      await pc.setRemoteDescription({ type: 'offer', sdp: cur.offer });
      wb('bA srd-ok');
      // ⚠️ async await(buildPC·setRemoteDescription) 도중 통화가 끝나면 localStream/pc가 null이 된다 → 크래시 방지 가드.
      if (CUR !== cur || !localStream || !pc) { wb('bA abort ls=' + (localStream ? 'y' : 'n') + ' pc=' + (pc ? 'y' : 'n') + ' cur=' + (CUR === cur)); return; }
      try { for (const tx of pc.getTransceivers()) { try { tx.direction = 'sendrecv'; } catch (_) {} } } catch (_) {}   // 방향 sendrecv 강제
      localStream.getTracks().forEach(t => { try { pc.addTrack(t, localStream); } catch (_) {} });
      if (muted) { try { if (!cur.connectedAt && !cur._userMuted) localStream.getAudioTracks().forEach(t => { t.enabled = false; }); } catch (_) {} }
      for (const c of cur.pendIce.splice(0)) { try { if (!pc) break; await pc.addIceCandidate(c); } catch (_) {} }
      // ⚠️ addIceCandidate await 도중에도 통화가 끝날 수 있다 → createAnswer 직전 재확인(pc null 크래시 방지).
      if (CUR !== cur || !pc) { wb('bA abort2 pc=' + (pc ? 'y' : 'n') + ' cur=' + (CUR === cur)); return; }
      const ans = await pc.createAnswer();
    ans.sdp = tuneOpus(ans.sdp);
    await pc.setLocalDescription(ans);
    // 🔬 answer의 각 m-line 방향 확인 — sendrecv여야 발신자가 수신자 미디어를 받는다
    try {
      const dirs = (ans.sdp.match(/m=(audio|video)[\s\S]*?(?=m=|$)/g) || []).map(b => {
        const k = b.match(/m=(\w+)/)[1];
        const d = (b.match(/a=(sendrecv|sendonly|recvonly|inactive)/) || [])[1] || '?';
        return k[0] + ':' + d;
      }).join(' ');
      wb('ANSDIR ' + dirs);
    } catch (_) {}
      cur._lastAnswer = ans.sdp;   // 발신자가 offer를 재전송하면 이 answer를 되돌려준다
      send({ t: 'answer', sdp: ans.sdp });
      wb('bA sent-answer');
      // 📡 answer 중복 전송 — 시그널 유실 시 발신자 '거는중' 고착 방지(발신자는 _gotAnswer로 중복 무시)
      [250, 600, 1200, 2200].forEach(d => setTimeout(() => { if (CUR === cur && cur._lastAnswer && !cur.connectedAt) send({ t: 'answer', sdp: cur._lastAnswer }); }, d));
    } catch (e) {
      wb('bA THROW ' + String((e && (e.name + ':' + e.message)) || e).slice(0, 90));
      throw e;
    }
  }

  // 🚀 벨 울리는 동안 ICE 미리 연결(카톡식 즉시통화) — 마이크 음소거로 answer까지 미리 보내 P2P 경로 완성.
  //    받기 누르면 음소거만 풀려 소리가 '즉시' 난다. 마이크 권한이 이미 허용된 경우에만(프롬프트로 링 방해 방지).
  async function preconnectIncoming() {
    // 🧯 협상 단순화·결정화: 프리커넥트 전면 비활성. 벨 중 미리 협상하던 것이 offer/answer/accept 경로와
    //    겹쳐 통화마다 한쪽만 되던 레이스의 주범이었다. 이제 '받기' 시점에 딱 한 번 깨끗이 협상한다.
    return;
    const cur = CUR;
    if (!cur || cur.dir !== 'in' || pc || cur._accepting) return;
    cur._preRunning = true;
    try {
      if ((await micPermState()) !== 'granted') return;   // 권한 미허용 → 받기 눌러야 프롬프트(폴백)
      if (CUR !== cur || pc || cur._accepting) return;    // 그 사이 받았으면 accept에 양보
      const stream = await getMedia(cur.video);
      if (CUR !== cur || pc) { try { stream.getTracks().forEach(t => t.stop()); } catch (_) {} return; }
      localStream = stream;
      if (stream._videoFallback && cur.video) cur.video = false;
      await buildAnswer(cur, true);   // 마이크 음소거로 협상 완료(ICE가 벨 중에 뚫린다)
      cur._preconnected = true;
    } catch (_) {
      cur._preFail = true;
      try { pc?.close(); } catch (_) {} pc = null;
      try { localStream?.getTracks().forEach(t => t.stop()); } catch (_) {} localStream = null;
    } finally { cur._preRunning = false; }
  }

  async function accept(via) {
    if (!CUR || CUR.dir !== 'in') return;
    if (CUR._accepting) return;   // CallKit 수락 신호가 여러 번 와도 한 번만(중복 getMedia/PC 방지)
    CUR._accepting = true;
    // 웹에서 '받기' — 자동 거절하지 않는다(같은 계정의 앱 기기가 받을 수 있게). 안내만 띄우고 벨은 유지.
    if (!(window.GALLA_isApp && window.GALLA_isApp())) { CUR._accepting = false; return appOnlyNotice(); }
    clearTimeout(ringT);
    // 📞 인앱(포그라운드) '받기' 탭 순간, 이 통화의 CallKit 푸시를 네이티브가 억제 → 뒤늦게 온 VoIP 푸시의 중복벨 방지.
    //    CallKit로 받은 경우(ckAnswer/consume/arm)는 억제하지 않는다(그 CallKit이 실제 통화 UI라서).
    if (via === 'tap' && CUR.callId) { try { _nativeCall({ action: 'callHandledInApp', callId: CUR.callId }); } catch (_) {} }
    send({ t: 'accepted' });   // 📞 받기 탭 '즉시' 발신자 통화중 전환 + 발신자 마이크 해제
    [300, 900].forEach(d => setTimeout(() => { if (CUR && CUR.connectedAt) send({ t: 'accepted' }); }, d));   // 유실 대비
    // 🔊 Agora: 수신자도 채널 join → 양쪽 미디어 연결(iosrtc 프리커넥트·getMedia·buildAnswer 전부 우회)
    if (AGORA) { await withTimeout(primePermHint(CUR.video), 3000).catch(() => {}); await agoraConnect(CUR); return; }
    // 프리커넥트가 진행 중이면 완료를 기다려 그 결과 재사용(최대 ~2.4초 — 동시 셋업 경합 방지)
    for (let i = 0; i < 30 && CUR._preRunning; i++) await new Promise(r => setTimeout(r, 80));
    if (CUR && CUR._preconnected && localStream) {
      // 🚀 벨 중에 ICE 이미 뚫림 — 마이크 음소거만 풀면 즉시 양방향 소리
      try { localStream.getTracks().forEach(t => { t.enabled = true; }); } catch (_) {}
      if (!CUR.connectedAt) { CUR.connectedAt = Date.now(); startTimer(); }
      stopRings(); paintUI('oncall'); nativeAudioOn(); armAudioKick(); armVideoRenderKick(); applyNativeRoute();
      return;
    }
    // 폴백: 프리커넥트 안 됨(권한 없었거나 실패) — 기존 전체 셋업(마이크 켠 채)
    wb('accept fallback getmedia');
    try { await withTimeout(primePermHint(CUR.video), 3000); } catch (_) {}   // 프롬프트가 걸려도 통화는 진행
    // ⚠️ iosrtc getUserMedia가 '이전 통화 마이크 미해제'로 간헐적으로 영영 멈춤(사장님 로그: getmedia-ok 안 옴).
    //    → 타임아웃 걸고, 멈추면 네이티브 오디오를 강제로 내렸다가(마이크 해제) 간단 제약으로 재시도.
    if (!localStream) {
      try { localStream = await withTimeout(getMedia(CUR.video), 6000, 'gm-timeout'); }   // iosrtc getUserMedia는 CallKit 경로서 3~5초 걸릴 수 있음 → 6초
      catch (e1) {
        wb('accept getmedia RETRY ' + String((e1 && e1.name) || e1).slice(0, 24));
        // ⚠️ 'end'가 아니라 'micRelease' — 'end'는 CallKit 통화까지 종료해 '받자마자 끊김'을 만든다. 마이크(ADM)만 해제.
        try { _nativeCall({ action: 'micRelease' }); } catch (_) {}
        await new Promise(r => setTimeout(r, 300));
        try { localStream = await withTimeout(getMedia(false), 6000, 'gm-timeout2'); }   // 재시도: 오디오만
        catch (e2) { wb('accept getmedia FAIL ' + String((e2 && e2.name) || e2).slice(0, 30)); const nm = CUR.name, v = CUR.video; send({ t: 'decline' }); endCall('micfail', true); return paintErr(nm, explainMediaErr(e2, v)); }
      }
    }
    wb('accept getmedia-ok → buildAnswer');
    // 🛡️ getMedia가 느린 사이 발신자가 끊었으면(CUR 비워짐) 여기서 접는다 — 죽은 통화에 buildAnswer 하면
    //    'cur.offer null' 실패로 가짜 '통화 연결 실패' 에러가 뜬다. 마이크만 정리하고 조용히 종료.
    if (!CUR || CUR.dir !== 'in' || !CUR.offer) { wb('accept abort — ended during getmedia'); try { localStream && localStream.getTracks().forEach(t => t.stop()); } catch (_) {} localStream = null; return; }
    if (localStream._videoFallback && CUR.video) { CUR.video = false; toast('카메라를 쓸 수 없어 육성톡으로 받아요'); }
    try {
      if (!pc) await buildAnswer(CUR, false);
      try { localStream.getTracks().forEach(t => { t.enabled = true; }); } catch (_) {}
      if (!CUR.connectedAt) { CUR.connectedAt = Date.now(); startTimer(); }
      stopRings(); paintUI('oncall'); nativeAudioOn(); armAudioKick(); armVideoRenderKick(); applyNativeRoute();
    } catch (e) {
      console.error('[call] accept', e);
      const nm = CUR?.name;
      endCall('acceptfail', true);
      paintErr(nm, '통화 연결에 실패했어요 (' + ((e && e.name) || '오류') + ')');
    }
  }
  function decline() { send({ t: 'decline' }); endCall('declined_me', true); }

  /* 통화 기록 — 발신자가 남긴다: 부재중(연결 못 함)·통화 종료(시간).
     대화방에 말풍선(kind='call')으로 떠서 '다시 걸기' 콜백 깔때기가 된다 */
  async function logCall(reason) {
    if (PREF().callLog === false) return;   // [대화에 통화 기록 남기기] 끔
    // ★ CUR 스냅샷 — endCall이 이 함수를 기다리지 않고 CUR을 비우므로,
    //   await 이후 CUR을 읽으면 null 참조로 조용히 죽는다(기록 유실의 정체)
    const c = CUR;
    if (!c || c.dir !== 'out') return;
    const connected = !!c.connectedAt;
    if (!connected && !['noanswer', 'declined', 'busy'].includes(reason)) return;
    try {
      const { data: tid } = await sb.rpc('dm_thread_with', { other: c.peer });
      if (!tid) return;
      const meta = { video: !!c.video, status: connected ? 'ended' : 'missed',
                     dur: connected ? Math.round((Date.now() - c.connectedAt) / 1000) : 0 };
      const { data: row } = await sb.from('dm_messages')
        .insert({ thread_id: tid, sender_id: ME, body: connected ? '통화' : '부재중', kind: 'call', meta })
        .select().single();
      if (row && !connected) { try { sb.functions.invoke('send-push', { body: { kind: 'dm', id: row.id } }).catch(() => {}); } catch (_) {} }
    } catch (_) {}
  }

  // 📳 진동 링 — 수신 벨. iOS 네이티브는 navigator.vibrate가 무동작이라 Capacitor 햅틱(GALLA_haptic)으로,
  //    안드로이드/웹은 navigator.vibrate로. 오디오가 suspended여도 최소한 '왔다'는 알림이 되게.
  let ringHapT = null;
  function startRingHaptic() {
    stopRingHaptic();
    const buzz = () => {
      try { window.GALLA_haptic && window.GALLA_haptic('vote'); } catch (_) {}
      try { navigator.vibrate && navigator.vibrate([300, 150, 300, 150, 300]); } catch (_) {}
    };
    buzz();
    ringHapT = setInterval(buzz, 2000);
  }
  function stopRingHaptic() {
    if (ringHapT) { clearInterval(ringHapT); ringHapT = null; }
    try { navigator.vibrate && navigator.vibrate(0); } catch (_) {}
  }
  function stopRings() { try { window.GALLA_SFX?.ringInStop(); window.GALLA_SFX?.ringOutStop(); } catch (_) {} stopRingHaptic(); }
  // 📞 네이티브 CallKit 콜 종료 신호 — 웹 통화가 끝나면 CallKit UI도 내려야(수신자에 통화 잔류 방지).
  //    커스텀 URL 스킴을 숨김 iframe으로 열어 AppDelegate에 알린다(메인 프레임 이동 없음).
  function _nativeCall(payload) {
    try {
      if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.gallaCall) {
        window.webkit.messageHandlers.gallaCall.postMessage(payload);
      }
    } catch (_) {}
  }
  function nativeEndCallKit() { _nativeCall({ action: 'end' }); }
  // 📞 발신 통화를 네이티브 CallKit에 보고 → 발신자도 네이티브 통화화면 + CallKit 오디오(수신측과 대칭 = 소리 확실).
  function nativeStartOutgoing(name) { _nativeCall({ action: 'startOutgoing', name: String(name || '갈라'), video: !!(CUR && CUR.video) }); }
  // 📞 연결 완료 보고(발신측 통화시간 카운트 + 오디오 확정).
  function nativeAudioOn() {
    // 📞 면상톡은 스피커폰 기본 ON — 웹 SPK를 true로 맞춰 네이티브 스피커 버튼(speakerOn=true)과 동기화한다.
    //    (안 그러면 SPK=false로 시작해 스피커버튼 탭 시 SPK가 false→true가 돼 '스피커→수화부 전환'이 안 먹음)
    //    사용자가 한번이라도 토글하면(_spkUserSet) 그 뜻을 존중해 더 강제하지 않는다. 음성통화는 SPK 안 건드림.
    if (CUR && CUR.video && !CUR._spkUserSet) SPK = true;
    _nativeCall({ action: 'connected', video: !!(CUR && CUR.video) });
  }
  // 📞 Agora 통화 오디오 세션 — 링백 정리 + .playAndRecord(마이크 캡처 가능). iosrtc ADM은 안 켜 Agora와 마이크 충돌 방지.
  function nativeAgoraAudio() { _nativeCall({ action: 'agoraAudio', video: !!(CUR && CUR.video) }); }
  // 🔬 네이티브(Swift callAudioOn)가 실제 오디오 세션 상태를 여기로 올린다 → 서버 비콘으로 확인
  window.__nativeCallLog = function (m) { try { wb('NATIVE ' + m); } catch (_) {} };
  // 🔈 출력 라우팅 — 음성통화 기본은 수화부(귀), 면상톡·스피커버튼은 스피커(카톡식).
  // 영상통화는 기본 스피커(폰을 얼굴에서 떼고 봐서 수화부면 사실상 무음). 단, 사용자가 스피커 버튼을
  //   직접 누르면(_spkUserSet) 그 뜻(SPK)을 존중 → 수화부 전환 가능.
  function applyNativeRoute() {
    // 🔇 통화 연결 시 WebAudio(링백·벨) 컨텍스트를 재워 iOS 오디오 세션을 네이티브 통화에 양보.
    //    WebAudio가 세션을 물고 있으면 네이티브 WebRTC 소리가 안 나고 발신 링백도 안 꺼졌다(사장님).
    try { window.GALLA_SFX?.suspendForCall?.(); } catch (_) {}
    _nativeCall({ action: 'route', speaker: !!(SPK || (CUR && CUR.video && !CUR._spkUserSet)) });
  }
  // 🎚 수신 지터버퍼(playout delay) 최소화 — 통화 딜레이의 주범. 0 힌트로 버퍼를 최소로.
  function setLowLatency() {
    try {
      pc && pc.getReceivers && pc.getReceivers().forEach(r => {
        if (r.track && r.track.kind === 'audio') {
          try { if ('playoutDelayHint' in r) r.playoutDelayHint = 0; } catch (_) {}
          try { if ('jitterBufferTarget' in r) r.jitterBufferTarget = 0; } catch (_) {}
        }
      });
    } catch (_) {}
  }
  // 🔬 연결 3초 뒤 1회: 오디오 흐름 + 딜레이(중계/RTT/지터버퍼) 진단.
  let _statDiagDone = false;
  function armAudioStatDiag() {
    if (_statDiagDone) return; _statDiagDone = true;
    setLowLatency();
    setTimeout(async () => {
      try {
        let ain = 0, aout = 0, pin = 0, pout = 0, jbd = 0, jbe = 0, rtt = 0, relay = '?';
        const st = pc && await pc.getStats();
        st && st.forEach(r => {
          if (r.type === 'inbound-rtp' && (r.kind === 'audio' || r.mediaType === 'audio')) { ain = r.bytesReceived || 0; pin = r.packetsReceived || 0; jbd = r.jitterBufferDelay || 0; jbe = r.jitterBufferEmittedCount || 0; }
          if (r.type === 'outbound-rtp' && (r.kind === 'audio' || r.mediaType === 'audio')) { aout = r.bytesSent || 0; pout = r.packetsSent || 0; }
          if (r.type === 'candidate-pair' && (r.nominated || r.selected || r.state === 'succeeded')) { rtt = r.currentRoundTripTime || rtt; }
          if (r.type === 'local-candidate' && r.candidateType) relay = r.candidateType;   // relay면 TURN 경유
        });
        const jbMs = jbe > 0 ? Math.round(jbd / jbe * 1000) : -1;
        wb('LAT rtt=' + Math.round(rtt * 1000) + 'ms jitBuf=' + jbMs + 'ms cand=' + relay);
        const asink = document.getElementById('dm-call-audio');
        const brg = !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.gallaCall);
        // 로컬 마이크 트랙 상태 — muted=true면 iosrtc ADM이 캡처를 못 하는 것(0패킷의 근원 구분)
        const lt = localStream && localStream.getAudioTracks && localStream.getAudioTracks()[0];
        const sndr = pc && pc.getSenders && pc.getSenders().find(s => s.track && s.track.kind === 'audio');
        const rt = remoteStream && remoteStream.getAudioTracks && remoteStream.getAudioTracks()[0];
        wb('AUD in=' + ain + '/' + pin + 'p out=' + aout + '/' + pout + 'p brg=' + brg +
           ' Lmute=' + (lt ? lt.muted : '-') + ' Len=' + (lt ? lt.enabled : '-') + ' Lrs=' + (lt ? lt.readyState : '-') +
           ' snd=' + (sndr && sndr.track ? sndr.track.readyState : 'none') +
           ' Rmute=' + (rt ? rt.muted : '-') + ' Rrs=' + (rt ? rt.readyState : '-'));
      } catch (e) { wb('AUD-diag-err ' + String((e && e.name) || e).slice(0, 30)); }
    }, 3000);
  }
  // 📞 통화 확립 1초·2.5초 뒤 ADM 강제 재시작(킥) — 프리커넥트/콜드스타트로 오디오 유닛이
  //    비활성 세션에 물려 죽어 있어도 살아나게 하는 안전장치(무음 방지). 통화당 1회 예약.
  function armAudioKick() {
    const cur = CUR;
    if (!cur || cur._kickArmed) return;
    cur._kickArmed = true;
    // 🎤 마이크를 통화 내내 켜진 상태로 유지한다. (손가락이 하단 마이크 버튼을 실수로 눌러 음소거되면
    //    상대가 소리를 못 듣던 문제 — 당분간 음소거 무시하고 항상 켠다. 정식 음소거는 UX 정리 후 복원.)
    // ⚠️ 사용자가 직접 음소거(_userMuted)했으면 강제 언뮤트하지 않는다 — 안 그러면 음소거 버튼이 800ms만에 풀려 '안 먹힘'.
    const unmute = () => { try { if (CUR === cur && !cur._userMuted) localStream && localStream.getAudioTracks().forEach(t => { if (!t.enabled) t.enabled = true; }); } catch (_) {} };
    unmute();
    cur._micHold = setInterval(() => { if (CUR === cur && cur.connectedAt) unmute(); else { clearInterval(cur._micHold); } }, 800);
    [200, 1000, 2500, 5000].forEach(d => setTimeout(() => { if (CUR === cur && cur.connectedAt) { unmute(); _nativeCall({ action: 'kick' }); } }, d));
    setTimeout(() => { if (CUR === cur && cur.connectedAt) statusBeacon('6s'); }, 6000);
  }
  // 📞 면상톡 렌더 킥 — CallKit 콜드스타트로 첫 렌더를 놓쳐 검은화면일 때, 연결 후 여러 번 force 재부착.
  //    (같은 트랙id면 네이티브가 스킵하므로 force로 강제 재부착. 트랙이 늦게 살아나도 잡는다.)
  function armVideoRenderKick() {
    const cur = CUR;
    if (!cur || !cur.video || cur._vkArmed) return;
    cur._vkArmed = true;
    [800, 1800, 3200, 5000, 7500].forEach(d => setTimeout(() => {
      if (CUR !== cur || !cur.connectedAt) return;
      const rid = cur._rvTrackId || liveVideoId(remoteStream), lid = liveVideoId(localStream);
      if (rid || lid) { _nativeCall({ action: 'videoTracks', remoteTrackId: rid || '', localTrackId: lid || '', force: true }); wb('vkick r=' + (rid || '-').slice(0, 6) + ' l=' + (lid || '-').slice(0, 6)); }
    }, d));
  }
  // 📞 앱이 포그라운드로 돌아온 순간(네이티브 applicationDidBecomeActive) 호출된다.
  //    CallKit로 받으면 렌더가 백그라운드 전환 중 일어나 영상이 검게 굳는 문제 → 완전히 활성화된 지금 강제 재부착.
  window.GALLA_callForegroundKick = function () {
    try {
      const cur = CUR;
      if (!cur || !cur.video || !cur.connectedAt) return;
      // 로컬 카메라가 백그라운드에서 멈춰 있으면 트랙을 깨워 프레임을 다시 흘린다.
      try { localStream && localStream.getVideoTracks().forEach(t => { if (t.enabled === false) t.enabled = true; }); } catch (_) {}
      [0, 400, 1000, 2000].forEach(d => setTimeout(() => {
        if (CUR !== cur || !cur.connectedAt) return;
        const rid = cur._rvTrackId || liveVideoId(remoteStream), lid = liveVideoId(localStream);
        if (rid || lid) { _nativeCall({ action: 'videoTracks', remoteTrackId: rid || '', localTrackId: lid || '', force: true }); wb('fgkick r=' + (rid || '-').slice(0, 6) + ' l=' + (lid || '-').slice(0, 6)); }
      }, d));
    } catch (_) {}
  };
  function endCall(reason, remote) {
    lastCallEndAt = Date.now();   // 🔒 유령발신 차단용 — 이 직후 2초 발신은 관통으로 무시
    // 🔒👻 유령 수신벨 차단 — 통화가 끝나면 이 callId를 네이티브 억제목록에 넣어, 애플 VoIP 스로틀로
    //    뒤늦게(수 초 후) 도착하는 '벨 푸시'가 유령 수신벨을 울리지 않게 한다(발신자·수신자 양쪽에서 호출돼도 무해).
    try { if (CUR && CUR.callId) _nativeCall({ action: 'callHandledInApp', callId: CUR.callId }); } catch (_) {}
    // 👻 방금 끝낸 callId 기록 — 발신자 reoffer 유령벨('끊으면 바로 다시 전화') 차단. 오래된 항목은 정리.
    try {
      if (CUR && CUR.callId) {
        _recentEnded.set(CUR.callId, Date.now());
        if (_recentEnded.size > 40) { const cut = Date.now() - 60000; for (const [k, v] of _recentEnded) if (v < cut) _recentEnded.delete(k); }
      }
    } catch (_) {}
    if (AGORA) { try { window.GALLA_agora.leave(); } catch (_) {} }   // 🔊 Agora 채널 나가기
    if (recRec) { try { recRec.stop(); } catch (_) {} }   // 끊기면 녹음도 저장하며 종료
    SPK = false; REMUTE = false;
    stopSigPoll();
    stopRings();   // 🔕 벨·링백 정지
    nativeEndCallKit();   // CallKit 콜도 함께 종료(수신자 화면 잔류 방지)
    // ⚠️ CallKit 수락 대기 상태를 반드시 정리 — 안 하면 45초 안에 온 '다음' 수신 통화가
    //    사용자 탭 없이 자동 수락돼(발신쪽이 받기도 전에 통화 전환) 버린다.
    callKitPendingAnswer = false;
    try { window.__ckAnswer = null; } catch (_) {}
    clearTimeout(ringT); clearInterval(timerT); clearInterval(reoffT); reoffT = null;
    try { if (CUR && CUR._micHold) clearInterval(CUR._micHold); } catch (_) {}
    try { if (CUR && CUR._pushT) { clearTimeout(CUR._pushT); CUR._pushT = null; } } catch (_) {}   // 예약된 VoIP 푸시 취소(끊으면 안 보냄)
    if (!remote && CUR) send({ t: 'hangup' });
    // 📞👻 발신자가 끊으면 수신 CallKit을 종료하는 '취소 VoIP 푸시' — 단, 상대가 realtime로 도달 가능하면 보내지 않는다.
    //    iOS는 '모든 VoIP 푸시에 reportNewIncomingCall 강제'라 취소 푸시도 수신화면을 잠깐 띄운다(이름을 안 불러와 '갈라 친구'
    //    유령 수신벨 = 사장님이 본 '끊으면 바로 다시 전화'). 통화가 연결됐거나(connectedAt) ring-ack를 받았으면(_foreground)
    //    상대 웹이 살아있어 realtime hangup으로 CallKit이 깔끔히 종료되므로 취소 푸시는 불필요 + 유령만 만든다.
    //    순수 잠금화면(ring-ack 없음·연결 전, 웹이 offer를 못 받아 CallKit 벨만 뜬 경우)에만 취소 푸시로 그 벨을 끈다.
    try {
      if (!remote && CUR && CUR.dir === 'out' && CUR._pushSent && CUR.callId && CUR.peer && sb && sb.functions
          && !CUR.connectedAt && !CUR._foreground) {
        sb.functions.invoke('call-push', { body: { to: CUR.peer, callId: CUR.callId, cancel: true } }).catch(() => {});
      }
    } catch (_) {}
    logCall(reason);
    try { pc?.close(); } catch (_) {}
    pc = null;
    try { localStream?.getTracks().forEach(t => t.stop()); } catch (_) {}
    localStream = null; remoteStream = null;
    _statDiagDone = false;   // 다음 통화 진단 재무장
    try { window.GALLA_SFX?.resumeAfterCall?.(); } catch (_) {}   // 통화 끝 → WebAudio 복구(다음 벨소리)
    try { document.documentElement.classList.remove('gcall-video'); } catch (_) {}
    CUR = null;
    const box = document.getElementById('dm-call');
    if (box) {
      if (reason === 'busy') toast('상대가 통화 중이에요');
      else if (reason === 'declined') toast('상대가 통화를 거절했어요');
      else if (reason === 'netfail') toast('연결에 실패했어요 — 잠시 후 다시 시도해 주세요');
      box.classList.remove('on');
      // 제거는 예약으로 — 직후 paintErr가 같은 박스를 재활용할 수 있게 취소 가능해야 한다
      box._rm = setTimeout(() => box.remove(), 250);
    }
  }

  // 📺 iosrtc 네이티브 비디오 렌더러 수동 부착 — srcObject만으론 렌더러가 안 붙는 케이스(검은 화면)를
  //    ①observeVideo(공식 수동 API) ②src=createObjectURL(구식이지만 가장 확실한 경로: 속성 감시에 걸림)
  //    이중으로 부착한다. iosrtc MediaStream은 Blob 파생이라 createObjectURL이 유효하다.
  function iosrtcAttach(el) {
    try {
      const r = window.__iosrtc;
      if (!r || !el || el._iosrtcMediaStreamRendererId) return;
      const st = el.srcObject;
      if (!st) return;
      if (r.observeVideo) r.observeVideo(el);
      if (!el._iosrtcMediaStreamRendererId && typeof st.getBlobId === 'function' && !el.getAttribute('src')) {
        try { el.setAttribute('src', URL.createObjectURL(st)); } catch (_) {}
      }
    } catch (_) {}
  }
  // 📺 영상 렌더러가 붙을 때까지 재부착 — 프리커넥트(수신자)는 스트림이 영상요소보다 먼저 와서
  //    한 번의 부착을 놓친다. srcObject를 null→재설정(loadstart 강제)하고 붙을 때까지 짧게 재시도.
  function ensureVideoRender(el, stream) {
    let n = 0, painted = 0;
    const tick = () => {
      if (!el || !el.isConnected || !stream) return;
      const attached = !!el._iosrtcMediaStreamRendererId;
      if (!attached) {
        try { el.removeAttribute('src'); el.srcObject = null; el.srcObject = stream; } catch (_) {}   // loadstart 재발동
        iosrtcAttach(el);
      }
      // ⚠️ 붙어도(rendererId 있어도) iosrtc가 프레임을 간헐적으로 안 그린다(검은 원격). videoWidth로
      //    실제 그려지는지 보고, 안 그려지면 refreshVideos로 계속 깨운다. 그려진 뒤에도 몇 번 더 확정.
      try { window.__iosrtc?.refreshVideos?.(); } catch (_) {}
      if (attached && el.videoWidth > 0) { if (++painted >= 3) return; }   // 3회 연속 그려짐 확인되면 종료
      if (++n < 30) setTimeout(tick, 350);   // 붙어도 프레임 그려질 때까지 ~10초 재시도
    };
    tick();
  }
  function attachMedia() {
    // [통화 음량] 설정을 실제 재생에 반영 — 폰 볼륨과 별개로 상대 목소리만 조절
    setTimeout(() => {
      const v = Math.min(1, (PREF().callVolume ?? 100) / 100);
      document.querySelectorAll('#dm-call audio, #dm-call video').forEach(el => { el.volume = v; });
    }, 120);
    // 📞 영상통화도 영상은 '네이티브'가 그리지만, 원격 오디오는 <audio> 싱크에 붙여야 iosrtc가 재생한다
    //    (싱크가 없으면 양쪽 다 소리가 안 남 — 영상·음성 공통 오디오 싱크 = #dm-call-audio).
    if (remoteStream) {
      const el = document.getElementById('dm-call-audio');
      if (el && el.srcObject !== remoteStream) { el.srcObject = remoteStream; el.play?.().catch(() => {}); }
      if (el) iosrtcAttach(el);
      applyAudioRoute();   // 상대 소리 끔 상태 유지
    }
    // 📞 면상톡: 원격 영상 트랙이 (늦게) 도착하면 네이티브 통화 화면에 트랙 id를 갱신 → 네이티브가 직접 렌더.
    if (CUR?.video && CUR.connectedAt) {
      const rid = CUR._rvTrackId || liveVideoId(remoteStream), lid = liveVideoId(localStream);
      if (rid && (CUR._nvRid !== rid || CUR._nvLid !== lid)) { CUR._nvRid = rid; CUR._nvLid = lid; _nativeCall({ action: 'videoTracks', remoteTrackId: rid, localTrackId: lid }); }
    }
    // 렌더러 위치/크기 동기화(리페인트 직후 좌표 반영)
    setTimeout(() => { try { window.__iosrtc && window.__iosrtc.refreshVideos && window.__iosrtc.refreshVideos(); } catch (_) {} }, 300);
    // 🔬 면상톡 렌더러 진단(1회) — iosrtc 네이티브 렌더러가 실제로 붙는지 3초 뒤 확인
    if (CUR?.video && !CUR._vidDiag && CUR.connectedAt) {
      CUR._vidDiag = true;
      setTimeout(() => {
        try {
          const r = document.getElementById('dm-call-remote'), l = document.getElementById('dm-call-local');
          const rt = remoteStream && remoteStream.getVideoTracks && remoteStream.getVideoTracks()[0];
          const lt = localStream && localStream.getVideoTracks && localStream.getVideoTracks()[0];
          const rc = r && r.getBoundingClientRect();
          wb('VID rEl=' + !!r + ' rRend=' + (r && r._iosrtcMediaStreamRendererId) + ' rTrk=' + (rt ? rt.readyState + '/' + rt.enabled : 'none') +
             ' lRend=' + (l && l._iosrtcMediaStreamRendererId) + ' lTrk=' + (lt ? lt.readyState + '/' + lt.enabled : 'none') +
             ' rect=' + (rc ? Math.round(rc.width) + 'x' + Math.round(rc.height) : '-') +
             ' blob=' + (remoteStream && typeof remoteStream.getBlobId === 'function' ? 'y' : 'n'));
        } catch (e) { wb('VID-err ' + ((e && e.message) || e)); }
        // 🔬 오디오 진단 — 원격 오디오 트랙 상태 + 라우트 + 싱크 부착(소리 안남 원인 규명)
        try {
          const at = remoteStream && remoteStream.getAudioTracks && remoteStream.getAudioTracks()[0];
          const asink = document.getElementById('dm-call-audio');
          const lat = localStream && localStream.getAudioTracks && localStream.getAudioTracks()[0];
          wb('AUD rAudio=' + (at ? at.readyState + '/en' + at.enabled + '/mu' + at.muted : 'none') +
             ' sink=' + (asink ? (asink.srcObject ? 'set' : 'nosrc') : 'noel') +
             ' lAudio=' + (lat ? lat.readyState + '/en' + lat.enabled : 'none') +
             ' spk=' + (!!(SPK || (CUR && CUR.video && !CUR._spkUserSet))) + ' d=' + (CUR && CUR.dir === 'out' ? 'out' : 'in'));
        } catch (e) { wb('AUD-err ' + ((e && e.message) || e)); }
        // 🔬 오디오 RTP 유입 측정 — 패킷이 오면 전송은 정상(=재생/에코제거 문제), 0이면 전송 문제
        try {
          if (pc && pc.getStats) pc.getStats().then(st => {
            let inA = null;
            st.forEach(r => { if (r.type === 'inbound-rtp' && (r.kind === 'audio' || r.mediaType === 'audio')) inA = r; });
            wb('APKT in=' + !!inA + ' pkts=' + (inA ? (inA.packetsReceived || 0) : '?') + ' bytes=' + (inA ? (inA.bytesReceived || 0) : '?') + ' lvl=' + (inA ? (inA.audioLevel != null ? inA.audioLevel : '?') : '?'));
          }, () => {});
        } catch (_) {}
        // 🔬 프레임 유입 측정 — videoWidth가 0이 아니면 프레임이 실제로 들어와 디코드된 것.
        try {
          const rr = document.getElementById('dm-call-remote'), ll = document.getElementById('dm-call-local');
          const rvt = remoteStream && remoteStream.getVideoTracks && remoteStream.getVideoTracks()[0];
          const box = document.getElementById('dm-call'), card = box && box.querySelector('.dmc-card'), btns = box && box.querySelector('.dmc-btns');
          const cardR = card && card.getBoundingClientRect();
          wb('UI state=' + (box && box.dataset.state) + ' card=' + !!card + ' btns=' + (btns ? btns.children.length : 'no') + ' cardTop=' + (cardR ? Math.round(cardR.top) : '-') + ' cardH=' + (cardR ? Math.round(cardR.height) : '-'));
          wb('VW remote=' + (rr && rr.videoWidth) + 'x' + (rr && rr.videoHeight) + ' local=' + (ll && ll.videoWidth) + 'x' + (ll && ll.videoHeight) +
             ' rMuted=' + (rvt ? rvt.muted : '?') + ' rEnabled=' + (rvt ? rvt.enabled : '?') +
             ' vrecv=' + (pc.getReceivers ? pc.getReceivers().filter(x => x.track && x.track.kind === 'video').length : '?'));
        } catch (e) { wb('VW-err ' + ((e && e.message) || e)); }
      }, 4000);
    }
  }
  function startTimer() {
    t0 = Date.now();
    clearInterval(timerT);
    timerT = setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      const el = document.getElementById('dm-call-timer');
      if (el) el.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    }, 1000);
  }
  function toast(t) {
    let el = document.getElementById('dm-mini-toast');
    if (!el) { el = document.createElement('div'); el.id = 'dm-mini-toast'; document.body.appendChild(el); }
    el.textContent = t; el.classList.add('on'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), 2600);
  }

  async function flipCam() {
    if (AGORA) { if (CUR?.video) { try { await window.GALLA_agora.switchCamera(); } catch (_) {} } return; }
    if (!localStream || !CUR?.video) return;
    facing = facing === 'user' ? 'environment' : 'user';
    try {
      const ns = await getMedia(true);
      const nv = ns.getVideoTracks()[0];
      const sender = pc.getSenders().find(x => x.track?.kind === 'video');
      if (sender && nv) await sender.replaceTrack(nv);
      localStream.getVideoTracks().forEach(t => { t.stop(); localStream.removeTrack(t); });
      localStream.addTrack(nv);
      ns.getAudioTracks().forEach(t => t.stop());   // 오디오는 기존 트랙 유지
      const lv = document.getElementById('dm-call-local');
      if (lv) { lv.srcObject = new MediaStream([nv]); lv.play?.().catch(() => {}); }
    } catch (_) { toast('카메라 전환에 실패했어요'); }
  }

  /* ── 재협상 — 통화 중 트랙 추가/제거(영상↔음성 전환)를 상대와 합의 ── */
  async function renegotiate() {
    if (!pc) return;
    const offer = await pc.createOffer();
    offer.sdp = tuneOpus(offer.sdp);
    await pc.setLocalDescription(offer);
    send({ t: 'reoffer', sdp: offer.sdp, video: !!CUR?.video });
  }

  /* 📹 음성 → 면상톡 전환: 내 카메라를 켜서 트랙을 추가하고 재협상 */
  async function upgradeToVideo() {
    if (!CUR || CUR.video) return;
    if (AGORA) {
      try {
        await window.GALLA_agora.setVideo(true, { onLocalVideo: (t) => { CUR._agLocal = t; renderAgoraVideo(); } });
        CUR.video = true; SPK = true;
        send({ t: 'vmode', video: true });   // 상대 UI도 영상 레이아웃으로
        paintUI('oncall'); renderAgoraVideo(); toast('📹 면상톡으로 전환했어요');
      } catch (e) { toast('카메라를 켤 수 없어요'); }
      return;
    }
    try {
      const ns = await getMedia(true);
      const nv = ns.getVideoTracks()[0];
      if (!nv) throw new Error('nocam');
      ns.getAudioTracks().forEach(t => t.stop());   // 오디오는 기존 트랙 유지
      localStream.addTrack(nv);
      pc.addTrack(nv, localStream);
      CUR.video = true;
      SPK = true;                                    // 면상톡은 스피커가 자연스럽다
      await renegotiate();
      paintUI('oncall');
      toast('📹 면상톡으로 전환했어요');
    } catch (e) { toast('카메라를 켤 수 없어요'); }
  }

  /* 📞 면상톡 → 음성 전환: 영상 트랙 제거·정지 후 재협상 */
  async function downgradeToAudio() {
    if (!CUR || !CUR.video) return;
    if (AGORA) {
      try {
        await window.GALLA_agora.setVideo(false);
        if (CUR._agLocal) CUR._agLocal.__el = null;
        CUR._agLocal = null; CUR.video = false; SPK = false;
        send({ t: 'vmode', video: false });
        paintUI('oncall'); toast('📞 음성 통화로 전환했어요');
      } catch (e) { toast('전환에 실패했어요'); }
      return;
    }
    try {
      pc.getSenders().filter(x => x.track?.kind === 'video').forEach(sn => { try { pc.removeTrack(sn); } catch (_) {} });
      localStream.getVideoTracks().forEach(t => { t.stop(); localStream.removeTrack(t); });
      CUR.video = false;
      SPK = false;                                   // 음성은 수화부로
      await renegotiate();
      paintUI('oncall');
      toast('📞 음성 통화로 전환했어요');
    } catch (e) { toast('전환에 실패했어요'); }
  }

  /* 🔊 스피커 모드 — iOS는 <audio>=스피커 / <video playsinline>=수화부로 라우팅된다.
     싱크 요소를 갈아끼우는 것이 웹에서 가장 확실한 라우팅 전환. */
  function applyAudioRoute() {
    const sink = document.getElementById('dm-call-audio') || document.getElementById('dm-call-remote');
    if (sink) sink.muted = REMUTE;
    // 🔇 iosrtc는 원격 오디오를 '네이티브'로 재생한다 → 웹 <audio>.muted가 안 먹혀 '상대 소리 끄기'가 무효였다.
    //    원격 트랙 자체를 enabled=false로 죽여 무음화(표준 WebRTC: 비활성 원격 트랙은 무음 출력).
    try { if (remoteStream && remoteStream.getAudioTracks) remoteStream.getAudioTracks().forEach(t => { t.enabled = !REMUTE; }); } catch (_) {}
  }

  /* ⏺ 통화 녹음 — 내 목소리+상대 목소리를 믹스해 저장 후 대화방에 남긴다.
     (한국: 대화 당사자 간 녹음은 합법. 저장 전 상대에게 자동 고지 문자를 보낸다) */
  async function toggleRecord(btn) {
    if (recRec) { try { recRec.stop(); } catch (_) {} return; }
    if (!localStream || !remoteStream) { wb('rec no-stream ls=' + !!localStream + ' rs=' + !!remoteStream); return toast('연결된 뒤에 녹음할 수 있어요'); }
    wb('rec start la=' + localStream.getAudioTracks().length + ' ra=' + remoteStream.getAudioTracks().length + ' MR=' + !!window.MediaRecorder);
    try {
      recCtx = new (window.AudioContext || window.webkitAudioContext)();
      const dest = recCtx.createMediaStreamDestination();
      let srcN = 0;
      [localStream, remoteStream].forEach(st => {
        if (st.getAudioTracks().length) {
          try { recCtx.createMediaStreamSource(new MediaStream(st.getAudioTracks())).connect(dest); srcN++; }
          catch (se) { wb('rec src FAIL ' + String((se && se.name) || se).slice(0, 30)); }
        }
      });
      wb('rec sources=' + srcN + '/2 ctx=' + recCtx.state);
      // 🔇 iosrtc 통화 오디오는 네이티브 재생이라 WebAudio가 못 잡는다(createMediaStreamSource InvalidStateError).
      //    소스가 하나도 안 붙으면 무음 파일만 나오므로, 가짜 녹음을 시작하지 않고 정직하게 알린다(추후 네이티브 녹음 과제).
      if (srcN === 0) { try { recCtx.close(); } catch (_) {} recCtx = null; return toast('이 기기에선 통화 녹음이 아직 안 돼요'); }
      const mime = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
      recRec = new MediaRecorder(dest.stream, mime ? { mimeType: mime, audioBitsPerSecond: 96000 } : undefined);
      recChunks = []; recT0 = Date.now();
      recRec.ondataavailable = e => { if (e.data?.size) recChunks.push(e.data); };
      recRec.onstop = async () => {
        const dur = Math.round((Date.now() - recT0) / 1000);
        const blob = new Blob(recChunks, { type: recRec.mimeType || 'audio/webm' });
        recRec = null; try { recCtx.close(); } catch (_) {} recCtx = null;
        document.querySelector('[data-c="rec"] .dmc-btn')?.classList.remove('recing');
        wb('rec stop dur=' + dur + ' size=' + blob.size + ' chunks=' + recChunks.length);
        if (dur < 1 || !blob.size) { toast(blob.size ? '녹음이 너무 짧아요' : '녹음된 소리가 없어요(이 기기 제약)'); return; }
        toast('📼 녹음 저장 중…');
        try {
          if (!window.GALLA_UPLOAD_MEDIA) await new Promise((res, rej) => {
            const v = ([...document.scripts].map(x => x.src).find(u => /[?&]v=/.test(u)) || '').match(/[?&]v=(\d+)/);
            const sc = document.createElement('script'); sc.src = '/js/media-upload.js' + (v ? '?v=' + v[1] : '');
            sc.onload = res; sc.onerror = rej; document.head.appendChild(sc); });
          const ext = (recChunks[0]?.type || blob.type).includes('mp4') ? 'm4a' : 'webm';
          const f = new File([blob], `call-rec.${ext}`, { type: blob.type });
          const url = await window.GALLA_UPLOAD_MEDIA(f, 'audio');
          const { data: tid } = await sb.rpc('dm_thread_with', { other: CUR?.peer });
          if (tid) await sb.from('dm_messages').insert({
            thread_id: tid, sender_id: ME, body: '📼 통화 녹음', kind: 'voice', meta: { url, dur, rec: true } });
          toast('📼 통화 녹음을 대화방에 저장했어요');
        } catch (e) { toast('녹음 저장에 실패했어요'); }
      };
      recRec.onerror = ev => wb('rec MR-error ' + String((ev && ev.error && ev.error.name) || ev).slice(0, 30));
      recRec.start(1000);
      wb('rec started mime=' + (recRec.mimeType || '?'));
      btn?.classList.add('recing');
      toast('⏺ 녹음 시작 — 상대에게도 고지돼요');
      send({ t: 'recnotice' });   // 상대 화면에 '녹음 중' 고지
    } catch (e) { recRec = null; wb('rec THROW ' + String((e && (e.name + ':' + e.message)) || e).slice(0, 60)); toast('이 기기에선 통화 녹음이 안 돼요'); }
  }

  function paintUI(state) {
    let box = document.getElementById('dm-call');
    if (!box) {
      box = document.createElement('div');
      box.id = 'dm-call';
      document.body.appendChild(box);
      requestAnimationFrame(() => box.classList.add('on'));
    }
    const video = !!CUR?.video;
    const name = esc(CUR?.name || '');
    const stateTxt = { preparing: '연결 준비 중…', outgoing: video ? '면상톡 거는 중…' : '육성톡 거는 중…',
                       incoming: video ? '면상톡이 왔어요 — 면상 까라' : '육성톡이 왔어요',
                       connecting: '연결 중…', oncall: '' }[state] || '';
    box.dataset.state = state;
    box.classList.toggle('video', video);
    box.classList.toggle('agora', AGORA);   // Agora 경로: 영상은 HTML에 직접 렌더(네이티브 오버레이 X)
    // 📺 영상 통화 중엔 페이지를 투명화(영상은 웹뷰 뒤로) → UI가 검은 영상에 안 덮이게.
    //    단 Agora는 영상이 웹뷰 '안'에 렌더되므로 투명화하면 안 됨.
    try { document.documentElement.classList.toggle('gcall-video', video && !AGORA); } catch (_) {}
    box.innerHTML = `
      ${video
        ? (AGORA
          // Agora는 컨테이너 div에 자체 <video>를 넣는다(<video>에 직접 넣으면 렌더 안 됨).
          ? `<div id="dm-call-remote"></div><div id="dm-call-local"></div>`
          : `<video id="dm-call-remote" autoplay playsinline></video>
           <video id="dm-call-local" autoplay playsinline muted></video>
           <audio id="dm-call-audio" autoplay></audio>`)
        : (SPK
          ? `<audio id="dm-call-audio" autoplay></audio>`
          : `<video id="dm-call-audio" autoplay playsinline style="width:0;height:0;position:absolute;opacity:0;pointer-events:none"></video>`)}
      <div class="dmc-card">
        ${video && state === 'oncall' ? '' : `<span class="dmc-ava${state === 'incoming' || state === 'outgoing' ? ' ring' : ''}">${esc(name.charAt(0) || '갈')}</span>`}
        <div class="dmc-name">${name}</div>
        <div class="dmc-state">${stateTxt}<span id="dm-call-timer">${state === 'oncall' ? '00:00' : ''}</span></div>
        <div class="dmc-btns">
          ${state === 'incoming' ? `
            <span class="dmc-ctl" data-c="accept"><button class="dmc-btn accept" tabindex="-1" aria-label="받기">${IC.phone}</button><i>받기</i></span>
            <span class="dmc-ctl" data-c="decline"><button class="dmc-btn end" tabindex="-1" aria-label="거절">${IC.phone}</button><i>거절</i></span>`
          : `
            ${state === 'oncall' ? `
              <span class="dmc-ctl" data-c="mute"><button class="dmc-btn mute${CUR && CUR._userMuted ? ' off' : ''}" tabindex="-1" aria-label="음소거">${CUR && CUR._userMuted ? IC.micoff : IC.mic}</button><i>음소거</i></span>
              <span class="dmc-ctl" data-c="spk"><button class="dmc-btn${SPK ? ' on2' : ''}" tabindex="-1" aria-label="스피커">${IC.spk}</button><i>스피커</i></span>
              <span class="dmc-ctl" data-c="remute"><button class="dmc-btn${REMUTE ? ' off' : ''}" tabindex="-1" aria-label="상대 소리">${REMUTE ? IC.hearoff : IC.hear}</button><i>상대 소리</i></span>
              ${video
                ? `<span class="dmc-ctl" data-c="camoff"><button class="dmc-btn" tabindex="-1" aria-label="카메라 끄기">${IC.cam}</button><i>카메라</i></span>
                   <span class="dmc-ctl" data-c="flip"><button class="dmc-btn" tabindex="-1" aria-label="카메라 전환">${IC.flip}</button><i>전환</i></span>
                   <span class="dmc-ctl" data-c="toaudio"><button class="dmc-btn" tabindex="-1" aria-label="음성으로 전환">${IC.phone}</button><i>음성</i></span>`
                : `<span class="dmc-ctl" data-c="tovideo"><button class="dmc-btn" tabindex="-1" aria-label="면상톡으로 전환">${IC.cam}</button><i>비디오</i></span>`}` : ''}
            <span class="dmc-ctl" data-c="hangup"><button class="dmc-btn end" tabindex="-1" aria-label="끊기">${IC.phone}</button><i>종료</i></span>`}
        </div>
      </div>`;
    attachMedia();   // 리페인트로 새로 생긴 미디어 요소에 스트림 재부착
    if (AGORA) {
      // Agora 면상톡: 네이티브 오버레이 미사용. 저장해둔 Agora 트랙을 새로 만들어진 div에 재생.
      _nativeCall({ action: 'videoUI', show: false });
      if (video && state === 'oncall') renderAgoraVideo();
    } else if (video && state === 'oncall') {
      // 📞 면상톡(iosrtc): 네이티브 통화 화면(원격/로컬 영상 + 버튼) 표시. 영상 트랙 id를 넘겨 네이티브가 직접 그린다.
      _nativeCall({ action: 'videoUI', show: true, name: CUR?.name || '', localTrackId: liveVideoId(localStream), remoteTrackId: (CUR && CUR._rvTrackId) || liveVideoId(remoteStream) });
    } else _nativeCall({ action: 'videoUI', show: false });
    box.onclick = e => {
      const c = e.target.closest('[data-c]')?.dataset.c;
      // 🔬 유령 클릭 진단 — trust=false면 합성(프로그램), true면 실제 터치/OS. xy=클릭좌표.
      wb('boxclick c=' + c + ' trust=' + (e.isTrusted ? 1 : 0) + ' xy=' + Math.round(e.clientX || -1) + ',' + Math.round(e.clientY || -1));
      callAction(c);
    };
  }
  // 스트림에서 '살아있는 최신' 영상 트랙 id — 음성↔영상 재전환 시 옛 트랙이 누적돼 멈춘 화면이
  //   나오던 것 방지(readyState 'live'인 마지막 트랙 우선).
  function liveVideoId(s) {
    if (!s || !s.getVideoTracks) return '';
    const ts = s.getVideoTracks();
    const live = ts.filter(t => t.readyState === 'live');
    const t = live[live.length - 1] || ts[ts.length - 1];
    return (t && t.id) || '';
  }
  // 통화 버튼 액션 — 웹 버튼과 네이티브 오버레이(window.GALLA_callAction)가 공용으로 호출한다.
  function callAction(c) {
    if (!c) return;
    wb('callAction ' + c);   // 🔬 네이티브 버튼 → JS 도달 확인
    const box = document.getElementById('dm-call');
    // 영상통화 통화중이면 버튼 시각 상태는 네이티브가 관리 → paintUI 재실행(영상 재전송) 안 한다.
    //   단 Agora 면상톡은 버튼도 웹이 관리하므로 정상 repaint 한다.
    const nativeVid = !AGORA && box && box.classList.contains('video') && box.dataset.state === 'oncall';
    const repaint = () => { if (box && !nativeVid) paintUI(box.dataset.state); };
    if (c === 'accept') accept('tap');
    else if (c === 'decline') decline();
    else if (c === 'hangup') endCall('ended');
    else if (c === 'flip') flipCam();
    else if (c === 'spk') { SPK = !SPK; if (CUR) CUR._spkUserSet = true; applyNativeRoute(); repaint(); }
    else if (c === 'remute') { REMUTE = !REMUTE; applyAudioRoute(); repaint(); }
    else if (c === 'rec') toggleRecord(box && box.querySelector('[data-c="rec"] .dmc-btn'));
    else if (c === 'tovideo') upgradeToVideo();
    else if (c === 'toaudio') downgradeToAudio();
    else if (c === 'mute' || c === 'camoff') {
      let enabled;
      if (AGORA) {   // 🔊 Agora 트랙 토글
        if (c === 'mute') { CUR._agMuted = !CUR._agMuted; enabled = !CUR._agMuted; window.GALLA_agora.setMute(CUR._agMuted); if (CUR) CUR._userMuted = CUR._agMuted; }
        else { CUR._agCamOff = !CUR._agCamOff; enabled = !CUR._agCamOff; window.GALLA_agora.setCamEnabled(enabled); }
      } else {
        const kind = c === 'mute' ? 'audio' : 'video';
        const t = localStream?.getTracks().find(x => x.kind === kind);
        if (!t) return;
        t.enabled = !t.enabled; enabled = t.enabled;
        if (c === 'mute' && CUR) CUR._userMuted = !t.enabled;
      }
      const b = box && box.querySelector(`[data-c="${c}"] .dmc-btn`);
      if (b) { b.classList.toggle('off', !enabled); b.innerHTML = c === 'mute' ? (enabled ? IC.mic : IC.micoff) : (enabled ? IC.cam : IC.camoff); }
    }
  }
  window.GALLA_callAction = c => { wb('nativeBtn ' + c); callAction(c); };   // 네이티브 오버레이 버튼 → 브릿지(출처 로그)

  // 🔬 부팅 버전 비콘 — 폰이 실제로 최신 JS를 받았는지 확정(버전전파 진단). cb=페이지에 '다시걸기' 버튼 존재 수.
  setTimeout(() => { try { wb('boot v=' + (window.GALLA_V || '?') + ' cb=' + document.querySelectorAll('.dm-callback').length); } catch (_) {} }, 6000);
  window.GALLA_call = {
    listen, start,
    _ghostLog: (m) => { try { wb('GHOST ' + m); } catch (_) {} },   // 유령 차단 로그(가드가 실제로 잡는지 확인)
    supported: () => !!window.RTCPeerConnection,   // 마이크 가용성은 시도 시점에 판정 — iOS 홈화면 앱은 mediaDevices가 조건부라 여기서 자르면 오탐
    _debug: () => ({ cur: CUR && { peer: CUR.peer, dir: CUR.dir, video: CUR.video }, pcState: pc?.connectionState || null }),
  };

  /* ── 🔬 자가 테스트 하네스 (디버그 전용) ───────────────────────────────
     실기기 2대가 스스로 걸고/받고/끊어 로그(client_errors 'call-audio')만으로 원인 추적.
     서버 플래그(get_call_selftest RPC)로 원격 arming — 폰 탭 없이 관리자가 SQL로 켜고 끈다.
     화면은 Wake Lock으로 유지(iOS 16.4+). 앞단(포그라운드) 통화 경로만 검증한다. */
  async function _ctWakeOn() {
    try { if (navigator.wakeLock && !_ctWake) { _ctWake = await navigator.wakeLock.request('screen'); _ctWake.addEventListener('release', () => { _ctWake = null; }); wb('selftest wakelock-on'); } } catch (e) { wb('selftest wakelock-err ' + String((e && e.name) || e).slice(0, 20)); }
  }
  function _ctWakeOff() { try { _ctWake && _ctWake.release(); } catch (_) {} _ctWake = null; }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && _ctMode) _ctWakeOn(); });

  function _ctStop() { _ctMode = null; _ctPeer = null; if (_ctLoopT) { clearTimeout(_ctLoopT); _ctLoopT = null; } _ctWakeOff(); wb('selftest STOP'); try { if (CUR) endCall('ended'); } catch (_) {} }
  function _ctCallerCycle() {
    if (_ctMode !== 'caller' && _ctMode !== 'callerV') return;   // callerV = 면상톡(영상) 자동테스트
    if (_ctLoopT) { clearTimeout(_ctLoopT); _ctLoopT = null; }
    if (!_ctPeer) { wb('selftest caller NO-PEER'); _ctLoopT = setTimeout(_ctCallerCycle, 15000); return; }
    if (!CUR) {
      if (!ME || !sb) { wb('selftest not-ready'); _ctLoopT = setTimeout(_ctCallerCycle, 6000); return; }
      const vid = (_ctMode === 'callerV');
      wb('selftest DIAL ' + String(_ctPeer).slice(0, 8) + (vid ? ' [VIDEO]' : ''));
      try { start(_ctPeer, '자가테스트', vid); } catch (e) { wb('selftest dial-err ' + String((e && e.name) || e).slice(0, 20)); }
      if (vid) _ctVideoQA(); else _ctButtonQA();   // 🔬 영상이면 영상 렌더 진단, 음성이면 버튼 QA
    }
    // 68초 통화 → 끊고 15초 쉬고 반복(면상톡 버튼+소리 QA 시퀀스 ~55초 확보)
    _ctLoopT = setTimeout(() => { try { if (CUR) endCall('ended'); } catch (_) {} _ctLoopT = setTimeout(_ctCallerCycle, 15000); }, 68000);
  }
  // 🔬 화면 배너 — 사장님이 '지금 무슨 단계'인지 보고 소리를 확인하게. 양쪽 폰 동기화(발신자가 상대에게도 전송).
  function _qaBanner(text) {
    try {
      let el = document.getElementById('qa-banner');
      if (!el) { el = document.createElement('div'); el.id = 'qa-banner';
        el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#0b0b0b;color:#39ff14;font:900 16px/1.45 -apple-system,sans-serif;padding:calc(env(safe-area-inset-top,0px) + 10px) 14px 10px;text-align:center;border-bottom:2px solid #39ff14;white-space:pre-line';
        document.body.appendChild(el); }
      if (text) { el.textContent = text; el.style.display = 'block'; } else { el.style.display = 'none'; }
    } catch (_) {}
  }
  // 🔬 버튼+소리 자동 QA — 프로그램이 각 버튼을 눌러 상태를 로그로 검증하고, 배너로 사장님 청취를 안내(무인 조작).
  async function _ctButtonQA() {
    const cur = CUR; const nap = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 30 && (!cur || !cur.connectedAt); i++) await nap(500);   // 연결 대기(최대 15초)
    if (!cur || cur !== CUR || !cur.connectedAt) return;
    const micEn = () => { try { const t = localStream && localStream.getAudioTracks()[0]; return t ? t.enabled : '?'; } catch (_) { return 'err'; } };
    const step = (text, ms) => { _qaBanner(text); try { send({ t: 'qastep', text }); } catch (_) {} wb('QA ' + text.replace(/\n/g, ' ')); return nap(ms); };
    await step('① 연결됨 — 소리 들리나요?\n(수신폰 귀에 대보세요) 6초', 6000);
    try { callAction('mute'); } catch (_) {} await step('② 음소거 ON — 소리 끊겨야 정상\nenabled=' + micEn() + ' 6초', 6000);
    wb('QA-RESULT mute enabled=' + micEn() + ' (기대 false=성공)');
    try { callAction('mute'); } catch (_) {} await step('③ 음소거 해제 — 소리 복구\nenabled=' + micEn() + ' 6초', 6000);
    const spk0 = SPK; try { callAction('spk'); } catch (_) {} await step('④ 스피커 전환 — 소리 커지나\nSPK ' + spk0 + '→' + SPK + ' 6초', 6000);
    try { callAction('spk'); } catch (_) {} await nap(500);
    const rm0 = REMUTE; try { callAction('remute'); } catch (_) {} await step('⑤ 상대 소리 끄기 — 소리 끊겨야\nREMUTE ' + rm0 + '→' + REMUTE + ' 6초', 6000);
    try { callAction('remute'); } catch (_) {} await step('⑥ 상대 소리 복구 — 소리 복구 6초', 6000);
    await step('QA 완료 — 곧 재시작', 2000);
    try { send({ t: 'qastep', text: '' }); } catch (_) {} _qaBanner('');
    wb('QA done');
  }
  // 🔬 면상톡(영상) 자동 진단 — 연결 후 로컬/원격 영상 트랙·네이티브 렌더 상태를 로그로, 배너로 청취·시청 안내.
  async function _ctVideoQA() {
    const cur = CUR; const nap = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 30 && (!cur || !cur.connectedAt); i++) await nap(500);
    if (!cur || cur !== CUR || !cur.connectedAt) { wb('QAV no-connect'); return; }
    const step = (text, ms) => { _qaBanner(text); try { send({ t: 'qastep', text }); } catch (_) {} wb('QAV ' + text.replace(/\n/g, ' ')); return nap(ms); };
    const lv = () => { try { const t = localStream && localStream.getVideoTracks()[0]; return t ? t.readyState : 'none'; } catch (_) { return 'err'; } };
    const rv = () => { try { const t = remoteStream && remoteStream.getVideoTracks()[0]; return t ? t.readyState : 'none'; } catch (_) { return 'none'; } };
    await nap(2500);
    const micEn = () => { try { const t = localStream && localStream.getAudioTracks()[0]; return t ? t.enabled : '?'; } catch (_) { return 'err'; } };
    const vidEn = () => { try { const t = localStream && localStream.getVideoTracks()[0]; return t ? t.enabled : '?'; } catch (_) { return 'err'; } };
    wb('QAV tracks localVid=' + lv() + ' remoteVid=' + rv() + ' rvId=' + ((cur._rvTrackId || 'none')).slice(0, 8));
    await step('📹 화면 양쪽 나오나요?\n(상대 풀스크린 + 내 화면 우상단) 8초', 8000);
    await step('🔊 소리 나나요? (스피커폰)\n발신폰 근처서 소리내보세요 8초', 8000);
    try { callAction('mute'); } catch (_) {} await step('② 음소거 — 소리 끊겨야\nmic꺼짐=' + (micEn() === false) + ' 7초', 7000);
    wb('QAV-R mute mic=' + micEn() + ' (기대 false)');
    try { callAction('mute'); } catch (_) {} await step('③ 음소거 해제 — 소리 복구 6초', 6000);
    try { callAction('camoff'); } catch (_) {} await step('④ 카메라 끄기 — 상대화면서 내가 검게\nvid꺼짐=' + (vidEn() === false) + ' 8초', 8000);
    wb('QAV-R camoff vid=' + vidEn() + ' (기대 false)');
    try { callAction('camoff'); } catch (_) {} await step('⑤ 카메라 켜기 — 내 영상 복구 6초', 6000);
    try { callAction('flip'); } catch (_) {} await step('⑥ 카메라 전환(앞↔뒤) 6초', 6000);
    try { callAction('spk'); } catch (_) {} await step('⑦ 스피커 토글 SPK=' + SPK + ' 4초', 4000);
    try { callAction('spk'); } catch (_) {} await nap(500);
    await step('면상톡 QA 완료 — 곧 재시작', 2000);
    try { send({ t: 'qastep', text: '' }); } catch (_) {} _qaBanner('');
    wb('QAV done');
  }
  function _ctApply(mode, peer) {
    const changed = (mode !== _ctMode) || (peer && peer !== _ctPeer);
    if (mode === 'caller' || mode === 'callerV') { _ctMode = mode; _ctPeer = peer || _ctPeer; _ctWakeOn(); if (changed || !_ctLoopT) _ctCallerCycle(); }
    else if (mode === 'accept') { _ctMode = 'accept'; _ctWakeOn(); if (changed) wb('selftest ACCEPT-MODE'); }
    else if (_ctMode) { _ctStop(); }
  }
  // 서버 폴 — 관리자가 SQL로 심은 플래그를 15초마다 읽어 반영(원격 on/off).
  //   ⚠️ listen()은 DM 모듈이 떠야 호출돼 sb/ME가 늦다 → 폴이 전역 클라이언트/세션에서 직접 끌어와
  //      엔진을 부팅(listen)하고, 탭 위치와 무관하게 스스로 켜진다. 하트비트로 상태를 항상 남긴다.
  let _ctPollN = 0;
  async function _ctPoll() {
    _ctPollN++;
    try {
      let _sb = sb || window.supabaseClient, _me = ME;
      if (_sb && !_me) { try { const { data } = await _sb.auth.getSession(); _me = data && data.session && data.session.user && data.session.user.id || null; } catch (_) {} }
      if (_sb && _me) {
        if (!sb || !ME) { try { listen(_sb, _me); } catch (_) {} }   // 엔진 부팅 보장(탭 무관)
        const { data, error } = await _sb.rpc('get_call_selftest');
        if (error) { if (_ctPollN <= 3 || _ctMode) wb('selftest rpc-err ' + String(error.message || error).slice(0, 30)); }
        else {
          if (_ctPollN <= 2 || _ctMode) wb('selftest poll me=' + String(_me).slice(0, 6) + ' -> ' + ((data && data.mode) || 'null'));
          _ctApply((data && data.mode) || null, (data && data.peer) || null);
        }
      } else if (_ctPollN <= 4) { wb('selftest wait sb=' + !!_sb + ' me=' + !!_me); }
    } catch (e) { if (_ctPollN <= 3) wb('selftest poll-err ' + String((e && e.name) || e).slice(0, 24)); }
    setTimeout(_ctPoll, 15000);
  }
  setTimeout(_ctPoll, 4000);
  // 수동 오버라이드(콘솔/디버그 패널용)
  window.GALLA_callTest = {
    accept() { _ctApply('accept'); },
    caller(peerId) { if (!peerId) return alert('상대 전체 ID 필요'); _ctApply('caller', String(peerId)); },
    stop: _ctStop,
    myId: () => ME,
  };

  /* ── 📞 네이티브 CallKit / VoIP 푸시 브릿지 (AppDelegate.swift ↔ 웹) ──
     · GALLA_onVoipToken(token): PushKit 토큰을 받아 save_call_token('ios', …)로 저장 → call-push가 조회
     · GALLA_callKitAnswer(callerId): 잠금화면에서 '받기' → 웹 통화 수락
       (VoIP 푸시가 WebRTC offer보다 먼저 도착할 수 있어, offer가 아직이면 예약해 뒀다가 도착 즉시 수락)
     · GALLA_callKitDecline(callerId): '거절/종료' → 웹 통화 거절 */
  let callKitPendingAnswer = false;
  // 📞 VoIP 토큰 저장 — 네이티브가 웹뷰/로그인보다 먼저 토큰을 넘길 수 있어(그럼 유실),
  //    ①보류했다가 ②세션이 생기는 즉시 저장한다. save_call_token은 idempotent upsert라 재호출 안전.
  let _pendingVoipToken = null, _voipAuthHooked = false, _voipSaved = '';
  async function _saveVoipToken(token) {
    try {
      const _sb = window.supabaseClient;
      if (!_sb || !token) return false;
      if (_voipSaved === token) return true;   // 이미 저장한 토큰이면 스킵
      const { data } = await _sb.auth.getSession();
      const uid = data?.session?.user?.id;
      if (!uid) { _pendingVoipToken = token; return false; }   // 로그인 전 — 보류
      await _sb.rpc('save_call_token', { p_platform: 'ios', p_token: String(token) });
      _voipSaved = token; _pendingVoipToken = null;
      return true;
    } catch (_) { return false; }
  }
  window.GALLA_onVoipToken = function (token) {
    if (!token) return;
    _pendingVoipToken = token;
    _saveVoipToken(token).then(ok => {
      if (ok) return;
      // 아직 로그인 전 → 로그인되는 순간 자동 저장하도록 auth 상태 변화 훅(한 번만)
      const _sb = window.supabaseClient;
      if (_sb && !_voipAuthHooked) {
        _voipAuthHooked = true;
        try {
          _sb.auth.onAuthStateChange((_e, sess) => {
            if (sess?.user?.id && _pendingVoipToken) _saveVoipToken(_pendingVoipToken);
          });
        } catch (_) {}
      }
    });
  };
  function armCallKitAnswer() {
    callKitPendingAnswer = true;
    if (CUR && CUR.dir === 'in' && !CUR._accepting) { try { accept('arm'); } catch (_) {} }   // offer 이미 와 있으면 즉시 수락
    setTimeout(() => { callKitPendingAnswer = false; }, 45000);   // 콜드스타트 여유(앱 죽은 상태서 깨어나 구독까지)
  }
  window.GALLA_callKitAnswer = function (callerId) {
    // 영속 스태시 — 통화엔진 로드 전에 이 함수가 다른 정의(app-shell 포워더)로 불렸어도 유실 안 되게
    try { window.__ckAnswer = { callerId: callerId || '', at: Date.now() }; } catch (_) {}
    // 이미 offer가 도착해 수신벨이 떠 있으면 바로 수락
    if (CUR && CUR.dir === 'in') { try { accept('ckAnswer'); } catch (_) {} return; }
    // 아직이면 예약 — onSignal(offer)에서 도착 즉시 수락
    armCallKitAnswer();
  };
  // 콜드스타트: 엔진 로드 전에 CallKit '받기'가 왔으면 app-shell이 window.__ckAnswer에 stash해 둠 → 부팅 시 소비
  try { if (window.__ckAnswer && Date.now() - window.__ckAnswer.at < 45000) armCallKitAnswer(); } catch (_) {}
  window.GALLA_callKitDecline = function () {
    callKitPendingAnswer = false;
    if (!CUR || CUR.dir !== 'in') return;
    // 통화 중(수락/연결됨)에 CallKit '종료'를 누르면 → 정상 종료로 처리(상대에게 hangup 전송, 발신자 '통화중' 잔류 방지).
    // 아직 안 받았으면 → 거절.
    if (CUR._accepting || CUR.connectedAt) { try { endCall('ended'); } catch (_) {} }
    else { try { decline(); } catch (_) {} }
  };
  // offer 도착 시 CallKit 수락이 예약돼 있었으면 자동 수락되도록 훅
  window.__gallaCallKitConsume = function () {
    if (callKitPendingAnswer) { callKitPendingAnswer = false; return true; }
    return false;
  };
  // 📞 최상위 셸(app-shell)이 네이티브에서 받아 중계한 통화 브릿지 메시지 처리
  //    (네이티브 evalJS는 최상위 웹뷰만 때리므로, 이 iframe은 셸의 postMessage로 받는다)
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin) return;
    const m = e.data;
    if (!m || m.galla !== 'shellcmd') return;
    if (m.t === 'voipToken') { try { window.GALLA_onVoipToken(m.token); } catch (_) {} }
    else if (m.t === 'callKitAnswer') { try { window.GALLA_callKitAnswer(m.callerId); } catch (_) {} }
    else if (m.t === 'callKitDecline') { try { window.GALLA_callKitDecline(m.callerId); } catch (_) {} }
  });

  /* 어느 페이지에 있어도 벨이 울린다 — supabaseClient가 뜨면 스스로 수신 대기 */
  (function autoBoot() {
    let tries = 0;
    const go = async () => {
      const _sb = window.supabaseClient;
      if (!_sb) { if (tries++ < 25) setTimeout(go, 400); return; }
      try {
        const { data } = await _sb.auth.getSession();
        const uid = data?.session?.user?.id;
        if (uid) { listen(_sb, uid); if (_pendingVoipToken) _saveVoipToken(_pendingVoipToken); }
      } catch (_) {}
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
    else go();
  })();
})();
