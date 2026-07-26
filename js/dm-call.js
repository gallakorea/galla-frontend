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
      s.src = '/js/dm-sound.js?v=072632'; s.async = true; s.setAttribute('data-galla-sfx', '1');
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
  };
  let sb = null, ME = null, chanSig = null;
  let pc = null, localStream = null, CUR = null;   // {peer,name,dir,video,pendIce,offer,connectedAt}
  let ringT = null, timerT = null, reoffT = null, t0 = 0, iceCache = null, iceAt = 0, facing = 'user', remoteStream = null;
  let SPK = false;                     // 스피커 모드(끄면 수화부/이어피스 라우팅)
  let REMUTE = false;                  // 상대 소리 끔
  let recRec = null, recChunks = [], recCtx = null, recT0 = 0;   // 통화 녹음
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

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
    try { sb.rpc('send_call_sig', { p_to: to, p_t: msg.t, p_payload: { ...msg, from: ME } }).then(() => {}, () => {}); } catch (_) {}
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
    // 🟢 통화 시그널링 = DB 트리거 → Realtime Broadcast 직송(카톡급). 로그인 시점부터 상시 구독이라
    //    조인 지연·콜드스타트 없음, 지연 수십 ms. offer/answer/ice/hangup 전부 이 경로 → 첫 통화도 즉시.
    chanSig = newSigChannel();
    // ⚡ 콜드스타트 수신 폴링 — realtime 웹소켓이 데워지기 전(로그인 직후 ~15초) 들어오는 offer를
    //    REST로도 확인한다(REST는 워밍업 지연 없음). 이게 없으면 앱 켜자마자 걸려온 첫 통화의 벨이
    //    5초 늦게 울려 '1차 실패'가 났다. 15초 지나거나 통화가 잡히면 중단(비용 무시 가능).
    try {
      let coldMax = -1, coldN = 0, coldIt = null;   // coldMax<0 = 최초 조회 전(그 사이 온 offer는 created_at로 잡음)
      const coldTick = async () => {
        if (coldN++ > 60 || CUR) { if (coldIt) clearInterval(coldIt); return; }
        try {
          let q = sb.from('call_sig').select('id,from_uid,t,payload').eq('to_uid', ME).order('id', { ascending: true });
          q = coldMax < 0 ? q.gte('created_at', new Date(Date.now() - 20000).toISOString()) : q.gt('id', coldMax);
          const { data: rows } = await q;
          for (const r of (rows || [])) { coldMax = Math.max(coldMax, r.id); if (r.t === 'offer') onSigBroadcast({ payload: r.payload, t: r.t, from_uid: r.from_uid }); }
        } catch (_) {}
      };
      coldTick();   // 즉시 1회(대기 없음)
      coldIt = setInterval(coldTick, 250);   // 이후 0.5초 간격, 최대 15초
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
    if (p.t === 'offer') {
      // 같은 상대의 offer 재전송(내가 잠깐 suspend돼 첫 offer를 놓쳤을 수 있음) — busy 처리하면 안 된다.
      if (CUR && CUR.peer === p.from) {
        // 최신 상대 좌표 갱신 + 이미 받았으면 내 좌표(answer)를 다시 보내준다.
        if (p.session) CUR._remote = { session: p.session, tracks: p.tracks };
        if (CUR._mine) send({ t: 'answer', session: CUR._mine.session, tracks: CUR._mine.tracks });
        return;
      }
      // 다른 상대와 통화/수신 중이면 진짜 busy
      if (CUR) { send({ t: 'busy', to: p.from }); return; }
      CUR = { peer: p.from, name: p.name || '갈라 친구', dir: 'in', video: !!p.video, _remote: { session: p.session, tracks: p.tracks } };
      try { iceConfig().catch(() => {}); } catch (_) {}   // ⚡ 받기 전에 TURN 미리 데움 → 수락 즉시 answer
      startSigPoll();   // ⚡ 콜드스타트 구간 이후 신호(ice 등)도 REST로 즉시
      paintUI('incoming');
      try { window.GALLA_SFX?.unlock?.(); } catch (_) {}
      try { window.GALLA_SFX?.ringInStart(); } catch (_) {}   // 🔔 수신 벨소리(웹오디오)
      startRingHaptic();                                       // 📳 진동 링 — iOS 네이티브는 navigator.vibrate가 안 먹혀 Capacitor 햅틱으로
      ringT = setTimeout(() => endCall('timeout'), 40000);
      // 잠금화면 CallKit에서 이미 '받기'를 눌렀다면(푸시가 offer보다 먼저 도착) 즉시 수락
      try { if (window.__gallaCallKitConsume && window.__gallaCallKitConsume()) accept('consume'); } catch (_) {}
      return;
    }
    if (!CUR || p.from !== CUR.peer) return;
    if (p.t === 'accepted') {
      // 📞 상대가 '받기'를 누른 즉시 발신자 통화중 전환 + 내 마이크 음소거 해제(상대가 이제 들을 수 있게).
      if (CUR.dir === 'out') {
        try { localStream && localStream.getAudioTracks().forEach(t => { t.enabled = true; }); } catch (_) {}
        wbeacon('accepted-unmute out en=' + (localStream && localStream.getAudioTracks().map(t => t.enabled).join(',')) + ' remoteTracks=' + (remoteStream && remoteStream.getTracks().length));
        if (!CUR.connectedAt) { clearTimeout(ringT); stopRings(); CUR.connectedAt = Date.now(); startTimer(); paintUI('oncall'); nativeAudioOn(); }
      }
      return;
    }
    if (p.t === 'answer') {
      // 발신자: 수신자의 SFU 좌표를 받아 그 트랙을 구독(미디어 연결). 중복 answer는 무시.
      if (CUR._gotAnswer) return;
      CUR._gotAnswer = true;
      clearInterval(reoffT); reoffT = null;
      try { cfSubscribe({ session: p.session, tracks: p.tracks }); } catch (e) { console.error('[call] sub', e); }
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

  // ── ☁️ Cloudflare Calls SFU 미디어 엔진 (1:1 즉시통화) ─────────────────────
  //    각자 SFU 세션 생성 → 로컬 트랙 발행(오디오는 음소거로 시작) → 상대 트랙 구독.
  //    ICE는 SFU가 내부 처리(P2P NAT 뚫기 없음). 시그널(call_sig)은 SDP 대신 {session,tracks} 좌표만 교환.
  function wbeacon(m) { try { sb && sb.rpc('log_client_error', { p_kind: 'call-audio', p_message: 'SFU ' + m, p_ver: 'diag' }).then(() => {}, () => {}); } catch (_) {} }
  function sfu(path, method, body) {
    return sb.functions.invoke('rtc-sfu', { body: { path, method, body: body || {} } })
      .then(r => { if (r && r.error) wbeacon('invoke-err ' + path + ' ' + (r.error.message || r.error)); return r && r.data; })
      .catch(e => { wbeacon('invoke-throw ' + path + ' ' + ((e && e.message) || e)); return null; });
  }
  // SFU 세션 생성 + localStream 발행. 반환 {session, tracks:[{name,kind}]}. 실패 시 throw(폴백 유도).
  async function cfSetup() {
    const ice = await iceConfig();
    pc = new RTCPeerConnection({ iceServers: ice.iceServers || [], bundlePolicy: 'max-bundle' });
    remoteStream = new MediaStream();
    pc.ontrack = e => { try { if (e.streams && e.streams[0]) remoteStream = e.streams[0]; else if (e.track) remoteStream.addTrack(e.track); if (e.track) wbeacon('ontrack ' + e.track.kind + ' streams=' + (e.streams ? e.streams.length : 0) + ' total=' + remoteStream.getTracks().length); attachMedia(); } catch (_) {} };
    pc.oniceconnectionstatechange = () => { if (pc) wbeacon('iceState ' + pc.iceConnectionState); };
    pc.onconnectionstatechange = () => {
      if (!pc) return;
      wbeacon('pcState ' + pc.connectionState);
      if (pc.connectionState === 'connected') nativeAudioOn();
      else if (['failed', 'closed'].includes(pc.connectionState)) { if (CUR && CUR.connectedAt) endCall('netfail'); }
    };
    // 🔬 5초 후 실제 수신 패킷 확인 — SFU→폰 미디어가 진짜 흐르는지(무음이 재생문제인지 미수신인지 확정)
    setTimeout(async () => {
      try {
        if (!pc || !CUR) return;
        let inA = 0, inB = 0, ic = '?';
        const st = await pc.getStats();
        st.forEach(r => {
          if (r.type === 'inbound-rtp' && (r.kind === 'audio' || r.mediaType === 'audio')) { inA = r.packetsReceived || 0; inB = r.bytesReceived || 0; }
          if (r.type === 'candidate-pair' && r.state === 'succeeded') ic = 'ok';
        });
        wbeacon('stats5s inPkt=' + inA + ' inByt=' + inB + ' pair=' + ic + ' ice=' + pc.iceConnectionState + ' conn=' + pc.connectionState);
      } catch (e) { wbeacon('stats5s-err ' + ((e && e.message) || e)); }
    }, 5000);
    // 1) 세션 부트스트랩 — CF SFU는 /sessions/new에 recvonly offer 동봉 필수
    pc.addTransceiver('audio', { direction: 'recvonly' });
    const boot = await pc.createOffer();
    await pc.setLocalDescription(boot);
    const sess = await sfu('/sessions/new', 'POST', { sessionDescription: { type: 'offer', sdp: boot.sdp } });
    wbeacon('sessNew ok=' + (sess && sess.ok) + ' reason=' + (sess && sess.reason) + ' hasId=' + !!(sess && sess.data && sess.data.sessionId) + ' status=' + (sess && sess.status));
    if (!sess || sess.reason === 'unconfigured' || !sess.data || !sess.data.sessionId || !sess.data.sessionDescription) {
      throw new Error('sfu-session(' + (sess && (sess.reason || (sess.data && sess.data.errorDescription)) || '?') + ')');
    }
    await pc.setRemoteDescription(sess.data.sessionDescription);
    const cf = { session: sess.data.sessionId, subs: new Set(), q: Promise.resolve() };
    if (!CUR) throw new Error('cancelled');
    CUR._cf = cf;
    // 2) 로컬 트랙 발행(오디오 음소거로 시작 — 받기 전 상대가 못 듣게)
    //    ⚠️ tr.mid는 setLocalDescription '후'에야 채워진다 — 그 전에 읽으면 null이라 SFU가 발행 거부.
    const trs = [], items = [];
    localStream.getTracks().forEach(t => {
      if (t.kind === 'audio') t.enabled = false;
      const tr = pc.addTransceiver(t, { direction: 'sendonly' });
      const name = t.kind[0] + '-' + String(ME).slice(0, 6) + '-' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
      trs.push({ tr, trackName: name }); items.push({ name, kind: t.kind });
    });
    const pub = await pc.createOffer();
    pub.sdp = tuneOpus(pub.sdp);
    await pc.setLocalDescription(pub);
    const res = await sfu(`/sessions/${cf.session}/tracks/new`, 'POST', {
      sessionDescription: { type: 'offer', sdp: pub.sdp },
      tracks: trs.map(x => ({ location: 'local', mid: x.tr.mid, trackName: x.trackName })),
    });
    wbeacon('publish ok=' + (res && res.ok) + ' hasSD=' + !!(res && res.data && res.data.sessionDescription) + ' err=' + (res && res.data && (res.data.errorDescription || (res.data.tracks && res.data.tracks[0] && res.data.tracks[0].errorCode))));
    if (!res || !res.ok || !res.data || !res.data.sessionDescription) throw new Error('sfu-publish');
    await pc.setRemoteDescription(res.data.sessionDescription);
    return { session: cf.session, tracks: items };
  }
  // 상대 트랙 구독(SFU가 내 pc로 상대 트랙을 밀어준다). remote = {session, tracks:[{name,kind}]}
  function cfSubscribe(remote) {
    const cf = CUR && CUR._cf;
    wbeacon('cfSubscribe cf=' + !!cf + ' remoteSess=' + (remote && remote.session ? 'y' : 'n') + ' tracks=' + (remote && remote.tracks && remote.tracks.length));
    if (!cf || !remote || !remote.session || !Array.isArray(remote.tracks)) return;
    for (const tk of remote.tracks) {
      if (!tk || !tk.name) continue;
      const key = remote.session + '|' + tk.name;
      if (cf.subs.has(key)) continue;
      cf.subs.add(key);
      cf.q = cf.q.then(() => cfSubOne(cf, remote.session, tk.name, key)).catch(() => {});
    }
  }
  async function cfSubOne(cf, session, trackName, key) {
    for (let i = 0; i < 8; i++) {
      if (!CUR || CUR._cf !== cf || !pc) { cf.subs.delete(key); return; }
      try {
        const res = await sfu(`/sessions/${cf.session}/tracks/new`, 'POST', { tracks: [{ location: 'remote', sessionId: session, trackName }] });
        const sd = res && res.data && res.data.sessionDescription;
        if (res && res.ok && sd && sd.type === 'offer') {
          await pc.setRemoteDescription(sd);
          const ans = await pc.createAnswer();
          await pc.setLocalDescription(ans);
          const rn = await sfu(`/sessions/${cf.session}/renegotiate`, 'PUT', { sessionDescription: { type: 'answer', sdp: ans.sdp } });
          wbeacon('subOK try=' + i + ' renegOk=' + (rn && rn.ok));
          return;   // 성공
        }
        const err = res && res.data && res.data.tracks && res.data.tracks[0] && res.data.tracks[0].errorCode;
        wbeacon('subRetry try=' + i + ' ok=' + (res && res.ok) + ' sdType=' + (sd && sd.type) + ' err=' + err);
        if (err && err !== 'not_found_track_error') break;   // 발행자가 아직 안 켰으면 재시도
      } catch (e) { break; }
      await new Promise(r => setTimeout(r, 900));
    }
    cf.subs.delete(key);   // 실패 → 재-answer 시 다시 구독 가능
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
  async function buildPC() {
    pc = new RTCPeerConnection(await iceConfig());
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    pc.onicecandidate = e => { if (e.candidate) send({ t: 'ice', cand: e.candidate }); };
    pc.ontrack = e => {
      // ★ 스트림은 변수로 들고 있는다 — paintUI가 innerHTML을 다시 그릴 때마다
      //   <audio>/<video>가 새 요소로 바뀌므로 매번 재부착해야 한다
      //   (이걸 안 해서 '연결됐는데 소리가 안 들리는' 버그가 났다)
      if (e.streams[0]) remoteStream = e.streams[0];
      attachMedia();
    };
    // ⚠️ 발신자는 answer를 실제로 받은 뒤에만 '통화중'으로 — iosrtc가 미디어 전에 connectionState를
    //    조기에 'connected'로 보고해(inPkt/outPkt=0) answer도 오기 전 통화중으로 튀는 버그가 있다.
    //    수신자(dir==='in')는 accept 시점에 이미 협상 완료라 무관.
    const readyToTalk = () => !CUR || CUR.dir === 'in' || CUR._gotAnswer;
    pc.oniceconnectionstatechange = () => {
      if (!pc) return;
      if (['connected', 'completed'].includes(pc.iceConnectionState) && CUR && !CUR.connectedAt && readyToTalk()) {
        clearTimeout(ringT); stopRings(); CUR.connectedAt = Date.now(); startTimer(); paintUI('oncall'); nativeAudioOn();
      }
    };
    pc.onconnectionstatechange = () => {
      if (!pc) return;
      if (pc.connectionState === 'connected') {
        if (!readyToTalk()) return;   // answer 전 조기 connected 무시(발신자 오탐 방지)
        clearTimeout(ringT); stopRings();
        if (CUR && !CUR.connectedAt) CUR.connectedAt = Date.now();
        startTimer(); paintUI('oncall'); nativeAudioOn();
      } else if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
        if (CUR) endCall(pc.connectionState === 'failed' ? 'netfail' : 'ended');
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
    if (CUR || !sb || !ME) return;
    if (!(window.GALLA_isApp && window.GALLA_isApp())) return appOnlyNotice();
    if (!window.RTCPeerConnection) return toast('이 브라우저는 통화를 지원하지 않아요');
    CUR = { peer, name: name || '갈라 친구', dir: 'out', video: !!video, pendIce: [] };
    paintUI('preparing');   // 즉시 화면부터 — '눌렀는데 아무 일도 없음'을 없앤다
    await primePermHint(!!video);
    try { localStream = await getMedia(!!video); }
    catch (e) { const nm = CUR.name; CUR = null; return paintErr(nm, explainMediaErr(e, video), () => start(peer, name, video)); }
    if (localStream._videoFallback && CUR.video) { CUR.video = false; toast('카메라를 쓸 수 없어 육성톡으로 걸어요'); }
    try {
    await ensureSigJoined();   // 📡 시그널 수신 채널 조인 보장(첫 통화 즉시 전환)
    startSigPoll();            // ⚡ 콜드스타트 구간 answer를 REST 폴링으로 즉시 잡기(발신 '거는중' 고착 방지)
    const mine = await cfSetup();   // ☁️ SFU 세션 생성 + 마이크 발행(음소거로 시작)
    CUR._mine = mine;
    nativeAudioOn();   // 🔊 오디오 유닛 미리 켬(미디어 흐르는 순간 바로 소리)
    paintUI('outgoing');
    nativeStartOutgoing(CUR.name);   // 📞 발신도 CallKit에 보고 → 발신자도 네이티브 통화화면+CallKit 오디오(대칭)
    try { window.GALLA_SFX?.ringOutStart(); } catch (_) {}   // 📞 발신 링백
    let myName = '갈라';
    try { const { data } = await sb.from('users').select('nickname').eq('id', ME).single(); myName = data?.nickname || myName; } catch (_) {}
    send({ t: 'offer', session: mine.session, tracks: mine.tracks, name: myName, video: !!video });
    // 부재 대비: 상대 기기에 '보이스톡이 왔어요' 푸시(서버가 스레드 관계 검증)
    try { sb.functions.invoke('send-push', { body: { kind: 'call', id: peer, video: !!video } }).catch(() => {}); } catch (_) {}
    // 📞 iOS VoIP 푸시 — 잠금화면 CallKit 벨(앱이 백그라운드/종료 상태여도 울림). 토큰 없으면 서버가 조용히 스킵.
    try { sb.functions.invoke('call-push', { body: { to: peer, video: !!video } }).catch(() => {}); } catch (_) {}
    // 🔁 offer(SFU 좌표) 재전송 — 상대가 잠금/백그라운드로 suspend돼 첫 offer를 놓쳤을 수 있어 answer 받을 때까지 반복
    clearInterval(reoffT);
    reoffT = setInterval(() => {
      if (!CUR || CUR.dir !== 'out' || CUR.connectedAt || CUR._gotAnswer) { clearInterval(reoffT); reoffT = null; return; }
      try { send({ t: 'offer', session: mine.session, tracks: mine.tracks, name: myName, video: !!video }); } catch (_) {}
    }, 1200);
    ringT = setTimeout(() => { toast('응답이 없어요 — 부재중 알림을 남겼어요'); endCall('noanswer'); }, 45000);   // 콜드스타트(상대 앱 죽어있음) 여유
    } catch (e) {
      console.error('[call] start', e);
      wbeacon('start-catch ' + ((e && e.message) || e));
      const nm = CUR?.name;
      try { pc?.close(); } catch (_) {} pc = null;
      try { localStream?.getTracks().forEach(t => t.stop()); } catch (_) {} localStream = null;
      CUR = null;
      paintErr(nm, '통화를 시작하지 못했어요 (' + ((e && e.message) || '오류') + ')');
    }
  }

  async function accept(via) {
    if (!CUR || CUR.dir !== 'in') return;
    if (CUR._accepting) return;   // 수락 신호가 여러 번 와도 한 번만
    CUR._accepting = true;
    if (!(window.GALLA_isApp && window.GALLA_isApp())) { CUR._accepting = false; return appOnlyNotice(); }
    clearTimeout(ringT);
    send({ t: 'accepted' });   // 📞 받기 탭 '즉시' 발신자 통화중 전환
    [250, 800].forEach(d => setTimeout(() => { if (CUR && CUR.connectedAt) send({ t: 'accepted' }); }, d));   // 유실 대비 재전송
    await primePermHint(CUR.video);
    try { localStream = await getMedia(CUR.video); }
    catch (e) { const nm = CUR.name, v = CUR.video; send({ t: 'decline' }); endCall('micfail', true); return paintErr(nm, explainMediaErr(e, v)); }
    if (localStream._videoFallback && CUR.video) { CUR.video = false; toast('카메라를 쓸 수 없어 육성톡으로 받아요'); }
    try {
      const mine = await cfSetup();      // ☁️ 내 SFU 세션 + 마이크 발행
      CUR._mine = mine;
      cfSubscribe(CUR._remote);          // ☁️ 상대 트랙 구독(SFU 중계)
      try { localStream.getAudioTracks().forEach(t => { t.enabled = true; }); } catch (_) {}   // 받았으니 음소거 해제
      send({ t: 'answer', session: mine.session, tracks: mine.tracks });
      [250, 700, 1500].forEach(d => setTimeout(() => { if (CUR && CUR._mine) send({ t: 'answer', session: CUR._mine.session, tracks: CUR._mine.tracks }); }, d));   // 유실 대비
      if (!CUR.connectedAt) { CUR.connectedAt = Date.now(); startTimer(); }
      stopRings(); paintUI('oncall'); nativeAudioOn();
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
  function nativeStartOutgoing(name) { _nativeCall({ action: 'startOutgoing', name: String(name || '갈라') }); }
  // 📞 연결 완료 보고(발신측 통화시간 카운트 + 오디오 확정).
  function nativeAudioOn() { _nativeCall({ action: 'connected' }); }
  function endCall(reason, remote) {
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
    if (!remote && CUR) send({ t: 'hangup' });
    logCall(reason);
    try { pc?.close(); } catch (_) {}
    pc = null;
    try { localStream?.getTracks().forEach(t => t.stop()); } catch (_) {}
    localStream = null; remoteStream = null;
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

  function attachMedia() {
    // [통화 음량] 설정을 실제 재생에 반영 — 폰 볼륨과 별개로 상대 목소리만 조절
    setTimeout(() => {
      const v = Math.min(1, (PREF().callVolume ?? 100) / 100);
      document.querySelectorAll('#dm-call audio, #dm-call video').forEach(el => { el.volume = v; });
    }, 120);
    if (remoteStream) {
      const el = document.getElementById(CUR?.video ? 'dm-call-remote' : 'dm-call-audio');
      if (el && el.srcObject !== remoteStream) { el.srcObject = remoteStream; el.play?.().catch(() => {}); }
      applyAudioRoute();   // 상대 소리 끔 상태 유지
    }
    if (CUR?.video && localStream) {
      const lv = document.getElementById('dm-call-local');
      if (lv && !lv.srcObject) { lv.srcObject = new MediaStream(localStream.getVideoTracks()); lv.play?.().catch(() => {}); }
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

  /* 📹 통화 중 음성↔면상 전환은 SFU 재발행이 필요 — 추후 지원. 지금은 통화 시작 때 선택한 모드로 진행. */
  async function upgradeToVideo() { toast('면상톡 전환은 준비 중이에요 — 처음부터 면상톡으로 걸어주세요'); }
  async function downgradeToAudio() { toast('전환은 준비 중이에요'); }

  /* 🔊 스피커 모드 — iOS는 <audio>=스피커 / <video playsinline>=수화부로 라우팅된다.
     싱크 요소를 갈아끼우는 것이 웹에서 가장 확실한 라우팅 전환. */
  function applyAudioRoute() {
    const sink = document.getElementById('dm-call-audio') || document.getElementById('dm-call-remote');
    if (sink) sink.muted = REMUTE;
  }

  /* ⏺ 통화 녹음 — 내 목소리+상대 목소리를 믹스해 저장 후 대화방에 남긴다.
     (한국: 대화 당사자 간 녹음은 합법. 저장 전 상대에게 자동 고지 문자를 보낸다) */
  async function toggleRecord(btn) {
    if (recRec) { try { recRec.stop(); } catch (_) {} return; }
    if (!localStream || !remoteStream) return toast('연결된 뒤에 녹음할 수 있어요');
    try {
      recCtx = new (window.AudioContext || window.webkitAudioContext)();
      const dest = recCtx.createMediaStreamDestination();
      [localStream, remoteStream].forEach(st => {
        if (st.getAudioTracks().length) recCtx.createMediaStreamSource(new MediaStream(st.getAudioTracks())).connect(dest);
      });
      const mime = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
      recRec = new MediaRecorder(dest.stream, mime ? { mimeType: mime, audioBitsPerSecond: 96000 } : undefined);
      recChunks = []; recT0 = Date.now();
      recRec.ondataavailable = e => { if (e.data?.size) recChunks.push(e.data); };
      recRec.onstop = async () => {
        const dur = Math.round((Date.now() - recT0) / 1000);
        const blob = new Blob(recChunks, { type: recRec.mimeType || 'audio/webm' });
        recRec = null; try { recCtx.close(); } catch (_) {} recCtx = null;
        document.querySelector('[data-c="rec"]')?.classList.remove('recing');
        if (dur < 1 || !blob.size) return;
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
      recRec.start(1000);
      btn?.classList.add('recing');
      toast('⏺ 녹음 시작 — 상대에게도 고지돼요');
      send({ t: 'recnotice' });   // 상대 화면에 '녹음 중' 고지
    } catch (e) { recRec = null; toast('이 기기에선 통화 녹음이 안 돼요'); }
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
    box.innerHTML = `
      ${video
        ? `<video id="dm-call-remote" autoplay playsinline></video>
           <video id="dm-call-local" autoplay playsinline muted></video>`
        : (SPK
          ? `<audio id="dm-call-audio" autoplay></audio>`
          : `<video id="dm-call-audio" autoplay playsinline style="width:0;height:0;position:absolute;opacity:0;pointer-events:none"></video>`)}
      <div class="dmc-card">
        ${video && state === 'oncall' ? '' : `<span class="dmc-ava${state === 'incoming' || state === 'outgoing' ? ' ring' : ''}">${esc(name.charAt(0) || '갈')}</span>`}
        <div class="dmc-name">${name}</div>
        <div class="dmc-state">${stateTxt}<span id="dm-call-timer">${state === 'oncall' ? '00:00' : ''}</span></div>
        <div class="dmc-btns">
          ${state === 'incoming' ? `
            <button class="dmc-btn accept" data-c="accept" aria-label="받기">${IC.phone}</button>
            <button class="dmc-btn end" data-c="decline" aria-label="거절">${IC.phone}</button>`
          : `
            ${state === 'oncall' ? `
              <button class="dmc-btn mute" data-c="mute" aria-label="내 마이크 끄기">${IC.mic}</button>
              <button class="dmc-btn${SPK ? ' on2' : ''}" data-c="spk" aria-label="스피커">${IC.spk}</button>
              <button class="dmc-btn${REMUTE ? ' off' : ''}" data-c="remute" aria-label="상대 소리 끄기">${REMUTE ? IC.spkoff : IC.spk}</button>
              <button class="dmc-btn rec" data-c="rec" aria-label="통화 녹음">${IC.rec}</button>
              ${video
                ? `<button class="dmc-btn" data-c="camoff" aria-label="카메라 끄기">${IC.cam}</button>
                   <button class="dmc-btn" data-c="flip" aria-label="카메라 전환">${IC.flip}</button>
                   <button class="dmc-btn" data-c="toaudio" aria-label="음성으로 전환">${IC.phone}</button>`
                : `<button class="dmc-btn" data-c="tovideo" aria-label="면상톡으로 전환">${IC.cam}</button>`}` : ''}
            <button class="dmc-btn end" data-c="hangup" aria-label="끊기">${IC.phone}</button>`}
        </div>
      </div>`;
    attachMedia();   // 리페인트로 새로 생긴 미디어 요소에 스트림 재부착
    box.onclick = e => {
      const c = e.target.closest('[data-c]')?.dataset.c;
      if (c === 'accept') accept('tap');
      else if (c === 'decline') decline();
      else if (c === 'hangup') endCall('ended');
      else if (c === 'flip') flipCam();
      else if (c === 'spk') { SPK = !SPK; paintUI(box.dataset.state); }
      else if (c === 'remute') { REMUTE = !REMUTE; applyAudioRoute(); paintUI(box.dataset.state); }
      else if (c === 'rec') toggleRecord(e.target.closest('[data-c="rec"]'));
      else if (c === 'tovideo') upgradeToVideo();
      else if (c === 'toaudio') downgradeToAudio();
      else if (c === 'mute' || c === 'camoff') {
        const kind = c === 'mute' ? 'audio' : 'video';
        const t = localStream?.getTracks().find(x => x.kind === kind);
        if (!t) return;
        t.enabled = !t.enabled;
        const b = box.querySelector(`[data-c="${c}"]`);
        b.classList.toggle('off', !t.enabled);
        if (c === 'mute') b.innerHTML = t.enabled ? IC.mic : IC.micoff;
        else b.innerHTML = t.enabled ? IC.cam : IC.camoff;
      }
    };
  }

  window.GALLA_call = {
    listen, start,
    supported: () => !!window.RTCPeerConnection,   // 마이크 가용성은 시도 시점에 판정 — iOS 홈화면 앱은 mediaDevices가 조건부라 여기서 자르면 오탐
    _debug: () => ({ cur: CUR && { peer: CUR.peer, dir: CUR.dir, video: CUR.video }, pcState: pc?.connectionState || null }),
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
