/* 📞 GALLA 보이스톡·페이스톡 — 1:1 WebRTC 통화
   구조(운영비 ~0원):
   · 미디어는 폰↔폰 직결(P2P). 직결 실패 시에만 Cloudflare TURN 중계(무료 1TB/월)
   · ICE 설정은 turn-cred 엣지 함수가 1시간짜리 임시 자격증명으로 발급 — 장기 비밀은 서버에만
   · 시그널링 = Supabase Realtime broadcast (유저마다 call:<uid> 채널)
   · 벨: 접속 중이면 어느 페이지든 풀스크린 벨(이 파일이 자동 부팅) +
     부재 시 푸시 '보이스톡이 왔어요'(탭→대화방→부재중 기록에서 다시 걸기)
   · 앱 출시 대비: 시그널링·UI는 그대로 두고 네이티브 래핑 시 푸시만 FCM/CallKit로 바꿔 끼우면 된다 */
(function () {
  const I = (w, inner) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  const IC = {
    phone: I(20, '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>'),
    mic: I(18, '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/>'),
    micoff: I(18, '<line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/>'),
    cam: I(18, '<path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/>'),
    camoff: I(18, '<path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/><line x1="1" y1="1" x2="23" y2="23"/>'),
    flip: I(18, '<path d="M1 4v6h6"/><path d="M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>'),
  };
  let sb = null, ME = null, chanMine = null, chanPeer = null;
  let pc = null, localStream = null, CUR = null;   // {peer,name,dir,video,pendIce,offer,connectedAt}
  let ringT = null, timerT = null, t0 = 0, iceCache = null, iceAt = 0, facing = 'user', remoteStream = null;
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
  }
  async function onSignal(p) {
    if (p.to !== ME || p.from === ME) return;
    if (p.t === 'offer') {
      if (CUR) { const ch = await peerChan(p.from); ch.send({ type: 'broadcast', event: 'signal', payload: { t: 'busy', from: ME, to: p.from } }); try { sb.removeChannel(ch); } catch (_) {} return; }
      CUR = { peer: p.from, name: p.name || '갈라 친구', dir: 'in', video: !!p.video, offer: p.sdp, pendIce: [] };
      chanPeer = await peerChan(p.from);
      paintUI('incoming');
      try { navigator.vibrate?.([300, 150, 300, 150, 300]); } catch (_) {}
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
    else if (p.t === 'hangup' || p.t === 'decline' || p.t === 'busy') {
      endCall(p.t === 'busy' ? 'busy' : p.t === 'decline' ? 'declined' : 'ended', true);
    }
  }

  async function getMedia(video) {
    const md = navigator.mediaDevices;
    if (!md?.getUserMedia) { const e = new Error('nomedia'); e.name = 'NoMediaDevices'; throw e; }
    try {
      return await md.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: video ? { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      });
    } catch (e) {
      // 일부 안드로이드가 고급 제약에서 넘어진다 — 소박한 제약으로 한 번 더
      if (e && (e.name === 'OverconstrainedError' || e.name === 'TypeError' || e.name === 'AbortError'))
        return md.getUserMedia({ audio: true, video: !!video });
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
  function paintErr(name, msg) {
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
        <div class="dmc-btns"><button class="dmc-btn end" data-c="close" aria-label="닫기">${IC.phone}</button></div>
      </div>`;
    box.onclick = e => {
      if (e.target.closest('[data-c="close"]')) { box.classList.remove('on'); setTimeout(() => box.remove(), 250); }
    };
  }
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
        clearTimeout(ringT); CUR.connectedAt = Date.now(); startTimer(); paintUI('oncall');
      }
    };
    pc.onconnectionstatechange = () => {
      if (!pc) return;
      if (pc.connectionState === 'connected') {
        clearTimeout(ringT);
        if (CUR && !CUR.connectedAt) CUR.connectedAt = Date.now();
        startTimer(); paintUI('oncall');
      } else if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
        if (CUR) endCall(pc.connectionState === 'failed' ? 'netfail' : 'ended');
      }
    };
  }

  async function start(peer, name, video) {
    if (CUR || !sb || !ME) return;
    if (!window.RTCPeerConnection) return toast('이 브라우저는 통화를 지원하지 않아요');
    CUR = { peer, name: name || '갈라 친구', dir: 'out', video: !!video, pendIce: [] };
    paintUI('preparing');   // 즉시 화면부터 — '눌렀는데 아무 일도 없음'을 없앤다
    try { localStream = await getMedia(!!video); }
    catch (e) { const nm = CUR.name; CUR = null; return paintErr(nm, explainMediaErr(e, video)); }
    try {
    chanPeer = await peerChan(peer);
    await buildPC();
    paintUI('outgoing');
    const offer = await pc.createOffer();
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
    clearTimeout(ringT);
    try { localStream = await getMedia(CUR.video); }
    catch (e) { const nm = CUR.name, v = CUR.video; send({ t: 'decline' }); endCall('micfail', true); return paintErr(nm, explainMediaErr(e, v)); }
    try {
      await buildPC();
      await pc.setRemoteDescription({ type: 'offer', sdp: CUR.offer });
      for (const c of CUR.pendIce.splice(0)) { try { await pc.addIceCandidate(c); } catch (_) {} }
      const ans = await pc.createAnswer();
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

  function endCall(reason, remote) {
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
    if (remoteStream) {
      const el = document.getElementById(CUR?.video ? 'dm-call-remote' : 'dm-call-audio');
      if (el && el.srcObject !== remoteStream) { el.srcObject = remoteStream; el.play?.().catch(() => {}); }
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
        : `<audio id="dm-call-audio" autoplay></audio>`}
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
              <button class="dmc-btn mute" data-c="mute" aria-label="음소거">${IC.mic}</button>
              ${video ? `<button class="dmc-btn" data-c="camoff" aria-label="카메라 끄기">${IC.cam}</button>
                         <button class="dmc-btn" data-c="flip" aria-label="카메라 전환">${IC.flip}</button>` : ''}` : ''}
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
