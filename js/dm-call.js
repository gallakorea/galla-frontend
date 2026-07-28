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
      s.src = '/js/dm-sound.js?v=072773'; s.async = true; s.setAttribute('data-galla-sfx', '1');
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
  let sb = null, ME = null, chanSig = null, _myNick = null;
  let pc = null, localStream = null, CUR = null;   // {peer,name,dir,video,pendIce,offer,connectedAt}
  let ringT = null, timerT = null, reoffT = null, t0 = 0, iceCache = null, iceAt = 0, facing = 'user', remoteStream = null;
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
    if (['offer', 'answer', 'accepted', 'hangup'].includes(p.t)) wb('rx-' + p.t);
    if (p.t === 'offer') {
      // 👻 유령 벨 차단 — 콜드스타트 REST 폴링이 '지난 통화'의 offer를 재생할 수 있다.
      //    15초 넘게 묵은 offer는 무시(발신자는 answer 올 때까지 1.2초마다 재전송하므로 산 통화는 안 놓친다).
      if (p.at && Date.now() - p.at > 15000) return;
      // 같은 상대의 offer 재전송(내가 잠깐 suspend돼 첫 offer를 놓쳤을 수 있음) — busy 처리하면 안 된다.
      if (CUR && CUR.peer === p.from) {
        // 이미 answer를 만들었으면 다시 보내준다(발신자가 answer를 놓쳐 계속 재전송 중일 수 있음).
        if (CUR._lastAnswer) send({ t: 'answer', sdp: CUR._lastAnswer });
        return;   // 아직 안 받았으면 무시(수신벨은 이미 떠 있음)
      }
      // 다른 상대와 통화/수신 중이면 진짜 busy
      if (CUR) { send({ t: 'busy', to: p.from }); return; }
      CUR = { peer: p.from, name: p.name || '갈라 친구', dir: 'in', video: !!p.video, offer: p.sdp, pendIce: [] };
      try { iceConfig().catch(() => {}); } catch (_) {}   // ⚡ 받기 전에 TURN 미리 데움 → 수락 즉시 answer
      startSigPoll();   // ⚡ 콜드스타트 구간 이후 신호(ice 등)도 REST로 즉시
      paintUI('incoming');
      try { window.GALLA_SFX?.unlock?.(); } catch (_) {}
      try { window.GALLA_SFX?.resumeAfterCall?.(); } catch (_) {}   // 이전 통화 suspend 해제(벨 무음 방지)
      try { window.GALLA_SFX?.ringInStart(); } catch (_) {}   // 🔔 수신 벨소리(웹오디오)
      startRingHaptic();                                       // 📳 진동 링 — iOS 네이티브는 navigator.vibrate가 안 먹혀 Capacitor 햅틱으로
      ringT = setTimeout(() => endCall('timeout'), 40000);
      // 🔬 자가 테스트 '자동 수신' 모드 — CallKit 탭 없이 벨 뜨면 바로 수락(디버그 전용)
      if (_ctMode === 'accept') { setTimeout(() => { try { if (CUR && CUR.dir === 'in' && !CUR._accepting) accept('selftest'); } catch (_) {} }, 900); }
      // 🎤 벨 중 '마이크만' 미리 준비(음소거) → 받기 시 getMedia 대기 0 = 전환 즉시.
      //    PC·answer는 안 만든다(프리커넥트 레이스 없음). 권한 있을 때만(프롬프트로 벨 방해 X).
      (async () => {
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
    if (p.t === 'accepted') {
      // 📞 상대가 '받기'를 누른 순간 — 프리커넥트로 ICE는 이미(또는 곧) 뚫려 있으니
      //    내 마이크 음소거만 풀고 통화중으로 전환하면 소리가 '즉시' 붙는다(카톡식).
      if (CUR.dir === 'out') {
        try { localStream && localStream.getTracks().forEach(t => { t.enabled = true; }); } catch (_) {}
        if (!CUR.connectedAt) {
          clearTimeout(ringT); stopRings(); CUR.connectedAt = Date.now(); startTimer(); paintUI('oncall'); nativeAudioOn(); armAudioKick(); applyNativeRoute();
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
    await buildPC();
    // 🔇 상대가 받기 전엔 내 마이크 음소거(ICE는 미리 뚫리되 소리는 안 새게). 'accepted'가 오면 푼다.
    //    ⚠️ 이미 연결됐으면(프리커넥트로 상대가 먼저 받아 accepted가 이 라인보다 먼저 도착) 음소거하지 않는다
    //       — 안 그러면 해제 뒤 다시 음소거돼 발신자 마이크가 굳는다(레이스).
    try { if (!CUR.connectedAt && !CUR._userMuted) localStream.getAudioTracks().forEach(t => { t.enabled = false; }); } catch (_) {}
    // ⚠️ 발신 '벨 울리는 동안'엔 네이티브 voiceChat 세션을 켜지 않는다 — 켜면 그 위 WebAudio 링백이
    //    수화부로 눌려 무음(사장님 "링백 안울림"). 오디오는 'accepted'(상대 받는 순간)·연결 시 켜진다
    //    (onSignal accepted→nativeAudioOn, ice/conn connected→nativeAudioOn). 무음은 audioSessionDidActivate가 보장.
    paintUI('outgoing');
    nativeStartOutgoing(CUR.name);   // 📞 발신도 CallKit에 보고 → 발신자도 네이티브 통화화면+CallKit 오디오(대칭)
    try { window.GALLA_SFX?.resumeAfterCall?.(); } catch (_) {}   // 이전 통화의 suspend 해제(안 하면 링백 무음)
    try { window.GALLA_SFX?.ringOutStart(); } catch (_) {}   // 📞 발신 링백
    wb('ringout ctx=' + (window.GALLA_SFX && window.GALLA_SFX.debugState ? window.GALLA_SFX.debugState() : 'nofn'));   // 🔬 링백 무음 진단
    setTimeout(() => wb('ringout+1s ctx=' + (window.GALLA_SFX && window.GALLA_SFX.debugState ? window.GALLA_SFX.debugState() : 'nofn')), 1000);
    const offer = await pc.createOffer();
    offer.sdp = tuneOpus(offer.sdp);
    await pc.setLocalDescription(offer);
    // 닉네임은 캐시 사용(오퍼 전 DB조회 블로킹 제거 → 전환 빠르게). 캐시 없으면 백그라운드로 채워 다음 통화에.
    let myName = _myNick || '갈라';
    if (!_myNick) { try { sb.from('users').select('nickname').eq('id', ME).single().then(r => { _myNick = (r && r.data && r.data.nickname) || _myNick; }, () => {}); } catch (_) {} }
    send({ t: 'offer', sdp: offer.sdp, name: myName, video: !!video, at: Date.now() });
    // 🔬 자가테스트(caller)는 VoIP/푸시를 끈다 — 하네스가 CallKit을 울려놓고 웹으로 자동수락하면
    //    CallKit이 세션을 물고 안 놓아 다음 통화 활성화가 충돌(caller=false ERR). 순수 웹 수락 경로로 측정.
    if (_ctMode !== 'caller') {
      // 부재 대비: 상대 기기에 '보이스톡이 왔어요' 푸시(서버가 스레드 관계 검증)
      try { sb.functions.invoke('send-push', { body: { kind: 'call', id: peer, video: !!video } }).catch(() => {}); } catch (_) {}
      // 📞 iOS VoIP 푸시 — 잠금화면 CallKit 벨(앱이 백그라운드/종료 상태여도 울림). 토큰 없으면 서버가 조용히 스킵.
      try { sb.functions.invoke('call-push', { body: { to: peer, video: !!video } }).catch(() => {}); } catch (_) {}
    }
    // 🔁 offer 재전송 — 상대가 잠금/백그라운드로 suspend돼 있으면 첫 offer(실시간 브로드캐스트)는
    //    큐잉 없이 사라진다(그래서 '받는 쪽 벨은 떴는데 거는 쪽은 계속 거는중'). 푸시로 깨어나 채널에
    //    재구독한 뒤 다음 재전송을 잡도록, answer 받을 때까지 1.2초마다 같은 offer를 다시 쏜다
    //    (broadcast 유실 복구를 빠르게 — 1차 실패·연결 지연 최소화).
    clearInterval(reoffT);
    reoffT = setInterval(() => {
      if (!CUR || CUR.dir !== 'out' || CUR.connectedAt || CUR._gotAnswer) { clearInterval(reoffT); reoffT = null; return; }
      try { send({ t: 'offer', sdp: offer.sdp, name: myName, video: !!video, at: Date.now() }); } catch (_) {}
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
    // 트랙은 setRemoteDescription '후'에 붙인다(양방향 소리 확인된 방식). 발신자가 수신자 영상을 못 보던 건
    //   s0blob과 무관하게 ontrack 이벤트의 실제 트랙 id로 네이티브 렌더를 잡아 해결한다(CUR._rvTrackId).
    wb('bA enter muted=' + muted + ' ls=' + (localStream ? localStream.getTracks().length : 'none'));
    try {
      await buildPC(false);
      nativeAudioOn();   // 🔊 셋업 시점에 오디오 유닛 미리 켬(CallKit didActivate와 이중 안전)
      await pc.setRemoteDescription({ type: 'offer', sdp: cur.offer });
      wb('bA srd-ok');
      try { for (const tx of pc.getTransceivers()) { try { tx.direction = 'sendrecv'; } catch (_) {} } } catch (_) {}   // 방향 sendrecv 강제
      localStream.getTracks().forEach(t => { try { pc.addTrack(t, localStream); } catch (_) {} });
      if (muted) { try { if (!cur.connectedAt && !cur._userMuted) localStream.getAudioTracks().forEach(t => { t.enabled = false; }); } catch (_) {} }
      for (const c of cur.pendIce.splice(0)) { try { await pc.addIceCandidate(c); } catch (_) {} }
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
    send({ t: 'accepted' });   // 📞 받기 탭 '즉시' 발신자 통화중 전환 + 발신자 마이크 해제
    [300, 900].forEach(d => setTimeout(() => { if (CUR && CUR.connectedAt) send({ t: 'accepted' }); }, d));   // 유실 대비
    // 프리커넥트가 진행 중이면 완료를 기다려 그 결과 재사용(최대 ~2.4초 — 동시 셋업 경합 방지)
    for (let i = 0; i < 30 && CUR._preRunning; i++) await new Promise(r => setTimeout(r, 80));
    if (CUR && CUR._preconnected && localStream) {
      // 🚀 벨 중에 ICE 이미 뚫림 — 마이크 음소거만 풀면 즉시 양방향 소리
      try { localStream.getTracks().forEach(t => { t.enabled = true; }); } catch (_) {}
      if (!CUR.connectedAt) { CUR.connectedAt = Date.now(); startTimer(); }
      stopRings(); paintUI('oncall'); nativeAudioOn(); armAudioKick(); applyNativeRoute();
      return;
    }
    // 폴백: 프리커넥트 안 됨(권한 없었거나 실패) — 기존 전체 셋업(마이크 켠 채)
    wb('accept fallback getmedia');
    try { await withTimeout(primePermHint(CUR.video), 3000); } catch (_) {}   // 프롬프트가 걸려도 통화는 진행
    // ⚠️ iosrtc getUserMedia가 '이전 통화 마이크 미해제'로 간헐적으로 영영 멈춤(사장님 로그: getmedia-ok 안 옴).
    //    → 타임아웃 걸고, 멈추면 네이티브 오디오를 강제로 내렸다가(마이크 해제) 간단 제약으로 재시도.
    if (!localStream) {
      try { localStream = await withTimeout(getMedia(CUR.video), 2000, 'gm-timeout'); }   // 2초 안에 안 오면 멈춘 것 → 복구
      catch (e1) {
        wb('accept getmedia RETRY ' + String((e1 && e1.name) || e1).slice(0, 24));
        try { _nativeCall({ action: 'end' }); } catch (_) {}   // 네이티브 ADM/마이크 강제 해제(수신자는 CallKit 없어 무해)
        await new Promise(r => setTimeout(r, 300));
        try { localStream = await withTimeout(getMedia(false), 3000, 'gm-timeout2'); }   // 재시도: 오디오만
        catch (e2) { wb('accept getmedia FAIL ' + String((e2 && e2.name) || e2).slice(0, 30)); const nm = CUR.name, v = CUR.video; send({ t: 'decline' }); endCall('micfail', true); return paintErr(nm, explainMediaErr(e2, v)); }
      }
    }
    wb('accept getmedia-ok → buildAnswer');
    if (localStream._videoFallback && CUR.video) { CUR.video = false; toast('카메라를 쓸 수 없어 육성톡으로 받아요'); }
    try {
      if (!pc) await buildAnswer(CUR, false);
      try { localStream.getTracks().forEach(t => { t.enabled = true; }); } catch (_) {}
      if (!CUR.connectedAt) { CUR.connectedAt = Date.now(); startTimer(); }
      stopRings(); paintUI('oncall'); nativeAudioOn(); armAudioKick(); applyNativeRoute();
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
  function nativeAudioOn() { _nativeCall({ action: 'connected' }); }
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
    const unmute = () => { try { if (CUR === cur) localStream && localStream.getAudioTracks().forEach(t => { if (!t.enabled) t.enabled = true; }); } catch (_) {} };
    unmute();
    cur._micHold = setInterval(() => { if (CUR === cur && cur.connectedAt) unmute(); else { clearInterval(cur._micHold); } }, 800);
    [200, 1000, 2500, 5000].forEach(d => setTimeout(() => { if (CUR === cur && cur.connectedAt) { unmute(); _nativeCall({ action: 'kick' }); } }, d));
    setTimeout(() => { if (CUR === cur && cur.connectedAt) statusBeacon('6s'); }, 6000);
  }
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
    try { if (CUR && CUR._micHold) clearInterval(CUR._micHold); } catch (_) {}
    if (!remote && CUR) send({ t: 'hangup' });
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
    // 📺 영상 통화 중엔 페이지를 투명화(영상은 웹뷰 뒤로) → UI가 검은 영상에 안 덮이게
    try { document.documentElement.classList.toggle('gcall-video', video); } catch (_) {}
    box.innerHTML = `
      ${video
        ? `<video id="dm-call-remote" autoplay playsinline></video>
           <video id="dm-call-local" autoplay playsinline muted></video>
           <audio id="dm-call-audio" autoplay></audio>`
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
    // 📞 면상톡: 네이티브 통화 화면(원격/로컬 영상 + 버튼) 표시. 영상 트랙 id를 넘겨 네이티브가 직접 그린다.
    if (video && state === 'oncall') {
      _nativeCall({ action: 'videoUI', show: true, name: CUR?.name || '', localTrackId: liveVideoId(localStream), remoteTrackId: (CUR && CUR._rvTrackId) || liveVideoId(remoteStream) });
    } else _nativeCall({ action: 'videoUI', show: false });
    box.onclick = e => callAction(e.target.closest('[data-c]')?.dataset.c);
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
    const nativeVid = box && box.classList.contains('video') && box.dataset.state === 'oncall';
    const repaint = () => { if (box && !nativeVid) paintUI(box.dataset.state); };
    if (c === 'accept') accept('tap');
    else if (c === 'decline') decline();
    else if (c === 'hangup') endCall('ended');
    else if (c === 'flip') flipCam();
    else if (c === 'spk') { SPK = !SPK; if (CUR) CUR._spkUserSet = true; applyNativeRoute(); repaint(); }
    else if (c === 'remute') { REMUTE = !REMUTE; applyAudioRoute(); repaint(); }
    else if (c === 'rec') toggleRecord(box && box.querySelector('[data-c="rec"]'));
    else if (c === 'tovideo') upgradeToVideo();
    else if (c === 'toaudio') downgradeToAudio();
    else if (c === 'mute' || c === 'camoff') {
      const kind = c === 'mute' ? 'audio' : 'video';
      const t = localStream?.getTracks().find(x => x.kind === kind);
      if (!t) return;
      t.enabled = !t.enabled;
      if (c === 'mute' && CUR) CUR._userMuted = !t.enabled;   // 사용자가 직접 끈 상태 기록(안전 언뮤트가 안 켜게)
      const b = box && box.querySelector(`[data-c="${c}"]`);
      if (b) { b.classList.toggle('off', !t.enabled); b.innerHTML = c === 'mute' ? (t.enabled ? IC.mic : IC.micoff) : (t.enabled ? IC.cam : IC.camoff); }
    }
  }
  window.GALLA_callAction = c => { wb('nativeBtn ' + c); callAction(c); };   // 네이티브 오버레이 버튼 → 브릿지(출처 로그)

  window.GALLA_call = {
    listen, start,
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
    if (_ctMode !== 'caller') return;
    if (_ctLoopT) { clearTimeout(_ctLoopT); _ctLoopT = null; }
    if (!_ctPeer) { wb('selftest caller NO-PEER'); _ctLoopT = setTimeout(_ctCallerCycle, 15000); return; }
    if (!CUR) {
      if (!ME || !sb) { wb('selftest not-ready'); _ctLoopT = setTimeout(_ctCallerCycle, 6000); return; }
      wb('selftest DIAL ' + String(_ctPeer).slice(0, 8));
      try { start(_ctPeer, '자가테스트', false); } catch (e) { wb('selftest dial-err ' + String((e && e.name) || e).slice(0, 20)); }
    }
    // 30초 통화 → 끊고 15초 쉬고 반복
    _ctLoopT = setTimeout(() => { try { if (CUR) endCall('ended'); } catch (_) {} _ctLoopT = setTimeout(_ctCallerCycle, 15000); }, 30000);
  }
  function _ctApply(mode, peer) {
    const changed = (mode !== _ctMode) || (peer && peer !== _ctPeer);
    if (mode === 'caller') { _ctMode = 'caller'; _ctPeer = peer || _ctPeer; _ctWakeOn(); if (changed || !_ctLoopT) _ctCallerCycle(); }
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
