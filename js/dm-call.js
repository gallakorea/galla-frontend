/* 📞 GALLA 보이스톡·페이스톡 — 1:1 WebRTC 통화
   구조(운영비 ~0원):
   · 미디어는 폰↔폰 직결(P2P). 직결 실패 시에만 Cloudflare TURN 중계(무료 1TB/월)
   · ICE 설정은 turn-cred 엣지 함수가 1시간짜리 임시 자격증명으로 발급 — 장기 비밀은 서버에만
   · 시그널링 = Supabase Realtime broadcast (유저마다 call:<uid> 채널)
   · 벨: 접속 중이면 어느 페이지든 풀스크린 벨(이 파일이 자동 부팅) +
     부재 시 푸시 '보이스톡이 왔어요'(탭→대화방→부재중 기록에서 다시 걸기)
   · 앱 출시 대비: 시그널링·UI는 그대로 두고 네이티브 래핑 시 푸시만 FCM/CallKit로 바꿔 끼우면 된다 */
(function () {
  // 🔊 수신음 엔진 자동 로드(GALLA_SFX) — 통화는 어느 페이지서든 부팅되므로 여기서 보장
  if (!window.GALLA_SFX && !document.querySelector('script[data-galla-sfx]')) {
    try {
      const s = document.createElement('script');
      s.src = '/js/dm-sound.js?v=072459'; s.async = true; s.setAttribute('data-galla-sfx', '1');
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
  let sb = null, ME = null, chanMine = null, chanPeer = null;
  let pc = null, localStream = null, CUR = null;   // {peer,name,dir,video,pendIce,offer,connectedAt}
  let ringT = null, timerT = null, t0 = 0, iceCache = null, iceAt = 0, facing = 'user', remoteStream = null;
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

  function peerChan(uid) {
    return new Promise(res => {
      const ch = sb.channel('call:' + uid);
      let done = false;
      ch.subscribe(st => { if (st === 'SUBSCRIBED' && !done) { done = true; res(ch); } });
      // 모바일망에선 조인이 1~2초를 넘기도 한다 — 성급히 돌려주면 미가입 send로 유실된다
      setTimeout(() => { if (!done) { done = true; res(ch); } }, 8000);
    });
  }
  async function send(msg) {
    if (!chanPeer) return;
    // 채널이 아직 조인 전이면 잠깐 기다린다 — 미가입 채널 send는 소리 없이 버려진다
    for (let i = 0; i < 20 && chanPeer.state !== 'joined'; i++) await new Promise(r => setTimeout(r, 250));
    try { await chanPeer.send({ type: 'broadcast', event: 'signal', payload: { ...msg, from: ME, to: CUR?.peer || msg.to } }); } catch (_) {}
  }

  function listen(_sb, me) {
    sb = _sb; ME = me;
    if (chanMine || !sb || !ME) return;
    chanMine = sb.channel('call:' + ME)
      .on('broadcast', { event: 'signal' }, ({ payload }) => onSignal(payload || {}))
      .subscribe();
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
  async function onSignal(p) {
    if (p.to !== ME || p.from === ME) return;
    if (p.t === 'offer') {
      if (CUR) { const ch = await peerChan(p.from); ch.send({ type: 'broadcast', event: 'signal', payload: { t: 'busy', from: ME, to: p.from } }); try { sb.removeChannel(ch); } catch (_) {} return; }
      CUR = { peer: p.from, name: p.name || '갈라 친구', dir: 'in', video: !!p.video, offer: p.sdp, pendIce: [] };
      chanPeer = await peerChan(p.from);
      paintUI('incoming');
      try { navigator.vibrate?.([300, 150, 300, 150, 300]); } catch (_) {}
      try { window.GALLA_SFX?.ringInStart(); } catch (_) {}   // 🔔 수신 벨소리
      ringT = setTimeout(() => endCall('timeout'), 40000);
      return;
    }
    if (!CUR || p.from !== CUR.peer) return;
    if (p.t === 'answer') {
      try {
        await pc.setRemoteDescription({ type: 'answer', sdp: p.sdp });
        // ★ answer보다 먼저 도착해 버퍼된 ICE 후보를 여기서 소비 — 발신자 쪽에 이 소비가
        //   없어서 실망(교차망)에서 '연결 중' 고착이 났다(수신자만 accept에서 소비하고 있었다)
        for (const c of (CUR?.pendIce || []).splice(0)) { try { await pc.addIceCandidate(c); } catch (_) {} }
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
    pc.oniceconnectionstatechange = () => {
      if (!pc) return;
      if (['connected', 'completed'].includes(pc.iceConnectionState) && CUR && !CUR.connectedAt) {
        clearTimeout(ringT); stopRings(); CUR.connectedAt = Date.now(); startTimer(); paintUI('oncall');
      }
    };
    pc.onconnectionstatechange = () => {
      if (!pc) return;
      if (pc.connectionState === 'connected') {
        clearTimeout(ringT); stopRings();
        if (CUR && !CUR.connectedAt) CUR.connectedAt = Date.now();
        startTimer(); paintUI('oncall');
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
    chanPeer = await peerChan(peer);
    await buildPC();
    paintUI('outgoing');
    try { window.GALLA_SFX?.ringOutStart(); } catch (_) {}   // 📞 발신 링백
    const offer = await pc.createOffer();
    offer.sdp = tuneOpus(offer.sdp);
    await pc.setLocalDescription(offer);
    let myName = '갈라';
    try { const { data } = await sb.from('users').select('nickname').eq('id', ME).single(); myName = data?.nickname || myName; } catch (_) {}
    send({ t: 'offer', sdp: offer.sdp, name: myName, video: !!video });
    // 부재 대비: 상대 기기에 '보이스톡이 왔어요' 푸시(서버가 스레드 관계 검증)
    try { sb.functions.invoke('send-push', { body: { kind: 'call', id: peer, video: !!video } }).catch(() => {}); } catch (_) {}
    ringT = setTimeout(() => { toast('응답이 없어요 — 부재중 알림을 남겼어요'); endCall('noanswer'); }, 30000);
    } catch (e) {
      console.error('[call] start', e);
      const nm = CUR?.name;
      try { pc?.close(); } catch (_) {} pc = null;
      try { localStream?.getTracks().forEach(t => t.stop()); } catch (_) {} localStream = null;
      if (chanPeer) { try { sb.removeChannel(chanPeer); } catch (_) {} chanPeer = null; }
      CUR = null;
      paintErr(nm, '통화를 시작하지 못했어요 (' + ((e && e.name) || '오류') + ')');
    }
  }

  async function accept() {
    if (!CUR || CUR.dir !== 'in') return;
    // 웹에서 '받기' — 자동 거절하지 않는다(같은 계정의 앱 기기가 받을 수 있게).
    // 안내만 띄우고 벨은 유지.
    if (!(window.GALLA_isApp && window.GALLA_isApp())) return appOnlyNotice();
    clearTimeout(ringT);
    await primePermHint(CUR.video);
    try { localStream = await getMedia(CUR.video); }
    catch (e) { const nm = CUR.name, v = CUR.video; send({ t: 'decline' }); endCall('micfail', true); return paintErr(nm, explainMediaErr(e, v)); }
    if (localStream._videoFallback && CUR.video) { CUR.video = false; toast('카메라를 쓸 수 없어 육성톡으로 받아요'); }
    try {
      await buildPC();
      await pc.setRemoteDescription({ type: 'offer', sdp: CUR.offer });
      for (const c of CUR.pendIce.splice(0)) { try { await pc.addIceCandidate(c); } catch (_) {} }
      const ans = await pc.createAnswer();
      ans.sdp = tuneOpus(ans.sdp);
      await pc.setLocalDescription(ans);
      send({ t: 'answer', sdp: ans.sdp });
      paintUI('connecting');
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

  function stopRings() { try { window.GALLA_SFX?.ringInStop(); window.GALLA_SFX?.ringOutStop(); } catch (_) {} }
  function endCall(reason, remote) {
    if (recRec) { try { recRec.stop(); } catch (_) {} }   // 끊기면 녹음도 저장하며 종료
    SPK = false; REMUTE = false;
    stopRings();   // 🔕 벨·링백 정지
    clearTimeout(ringT); clearInterval(timerT);
    if (!remote && CUR) send({ t: 'hangup' });
    logCall(reason);
    try { pc?.close(); } catch (_) {}
    pc = null;
    try { localStream?.getTracks().forEach(t => t.stop()); } catch (_) {}
    localStream = null; remoteStream = null;
    if (chanPeer) { try { sb.removeChannel(chanPeer); } catch (_) {} chanPeer = null; }
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
      if (c === 'accept') accept();
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

  /* 어느 페이지에 있어도 벨이 울린다 — supabaseClient가 뜨면 스스로 수신 대기 */
  (function autoBoot() {
    let tries = 0;
    const go = async () => {
      const _sb = window.supabaseClient;
      if (!_sb) { if (tries++ < 25) setTimeout(go, 400); return; }
      try {
        const { data } = await _sb.auth.getSession();
        const uid = data?.session?.user?.id;
        if (uid) listen(_sb, uid);
      } catch (_) {}
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
    else go();
  })();
})();
