/* 📞 GALLA 보이스톡 — 1:1 WebRTC 음성 통화
   구조(운영비 ~0원):
   · 음성은 폰↔폰 직결(P2P) — 서버를 거치지 않는다
   · 시그널링 = Supabase Realtime broadcast (유저마다 call:<uid> 채널을 듣는다)
   · STUN = 구글 공용(무료). TURN 없음(v1) — 일부 엄격한 NAT에선 연결 실패 가능, 그땐 문구로 안내
   · 벨은 '접속 중'인 상대에게만 울린다(dm.html을 열어둔 상태). 백그라운드 벨은 푸시+CallKit 영역 — PWA 한계 */
(function () {
  const I = (w, inner) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  const IC = {
    phone: I(20, '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>'),
    mic: I(18, '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/>'),
    micoff: I(18, '<line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/>'),
  };
  let sb = null, ME = null, chanMine = null, chanPeer = null;
  let pc = null, localStream = null, CUR = null;   // {peer, name, dir:'in'|'out', pendIce:[], offer}
  let ringT = null, timerT = null, t0 = 0;
  const CFG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function peerChan(uid) {
    // 채널은 통화 동안만 연다 — send는 구독된 채널에서만 나간다
    return new Promise(res => {
      const ch = sb.channel('call:' + uid);
      ch.subscribe(st => { if (st === 'SUBSCRIBED') res(ch); });
      setTimeout(() => res(ch), 1500);   // 하네스/저속망 안전판
    });
  }
  async function send(msg) {
    if (!chanPeer) return;
    try { await chanPeer.send({ type: 'broadcast', event: 'signal', payload: { ...msg, from: ME, to: CUR?.peer || msg.to } }); } catch (_) {}
  }

  /* ── 수신 대기 (dm.html 부팅 시) ── */
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
      CUR = { peer: p.from, name: p.name || '갈라 친구', dir: 'in', offer: p.sdp, pendIce: [] };
      chanPeer = await peerChan(p.from);
      paintUI('incoming');
      ringT = setTimeout(() => endCall('timeout'), 40000);
      return;
    }
    if (!CUR || p.from !== CUR.peer) return;
    if (p.t === 'answer') { try { await pc.setRemoteDescription({ type: 'answer', sdp: p.sdp }); } catch (e) { console.error('[call]', e); } }
    else if (p.t === 'ice') {
      if (pc && pc.remoteDescription) { try { await pc.addIceCandidate(p.cand); } catch (_) {} }
      else CUR.pendIce.push(p.cand);
    }
    else if (p.t === 'hangup' || p.t === 'decline' || p.t === 'busy') {
      endCall(p.t === 'busy' ? 'busy' : p.t === 'decline' ? 'declined' : 'ended', true);
    }
  }

  async function getMic() {
    return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  }
  function buildPC() {
    pc = new RTCPeerConnection(CFG);
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    pc.onicecandidate = e => { if (e.candidate) send({ t: 'ice', cand: e.candidate }); };
    pc.ontrack = e => {
      const au = document.getElementById('dm-call-audio');
      if (au && e.streams[0]) { au.srcObject = e.streams[0]; au.play().catch(() => {}); }
    };
    pc.onconnectionstatechange = () => {
      if (!pc) return;
      if (pc.connectionState === 'connected') { clearTimeout(ringT); startTimer(); paintUI('oncall'); }
      else if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
        if (CUR) endCall(pc.connectionState === 'failed' ? 'netfail' : 'ended');
      }
    };
  }

  /* ── 발신 ── */
  async function start(peer, name) {
    if (CUR || !sb || !ME) return;
    try { localStream = await getMic(); } catch (_) { return toast('마이크 권한이 필요해요'); }
    CUR = { peer, name: name || '갈라 친구', dir: 'out', pendIce: [] };
    chanPeer = await peerChan(peer);
    buildPC();
    paintUI('outgoing');
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    let myName = '갈라';
    try { const { data } = await sb.from('users').select('nickname').eq('id', ME).single(); myName = data?.nickname || myName; } catch (_) {}
    send({ t: 'offer', sdp: offer.sdp, name: myName });
    ringT = setTimeout(() => { toast('응답이 없어요 — 상대가 접속 중일 때만 벨이 울려요'); endCall('noanswer'); }, 30000);
  }

  /* ── 수락 ── */
  async function accept() {
    if (!CUR || CUR.dir !== 'in') return;
    clearTimeout(ringT);
    try { localStream = await getMic(); } catch (_) { endCall('micfail'); return toast('마이크 권한이 필요해요'); }
    buildPC();
    await pc.setRemoteDescription({ type: 'offer', sdp: CUR.offer });
    for (const c of CUR.pendIce.splice(0)) { try { await pc.addIceCandidate(c); } catch (_) {} }
    const ans = await pc.createAnswer();
    await pc.setLocalDescription(ans);
    send({ t: 'answer', sdp: ans.sdp });
    paintUI('connecting');
  }
  function decline() { send({ t: 'decline' }); endCall('declined_me', true); }

  function endCall(reason, remote) {
    clearTimeout(ringT); clearInterval(timerT);
    if (!remote && CUR) send({ t: 'hangup' });
    try { pc?.close(); } catch (_) {}
    pc = null;
    try { localStream?.getTracks().forEach(t => t.stop()); } catch (_) {}
    localStream = null;
    if (chanPeer) { try { sb.removeChannel(chanPeer); } catch (_) {} chanPeer = null; }
    CUR = null;
    const box = document.getElementById('dm-call');
    if (box) {
      if (reason === 'busy') toast('상대가 통화 중이에요');
      else if (reason === 'declined') toast('상대가 통화를 거절했어요');
      else if (reason === 'netfail') toast('연결에 실패했어요 — 네트워크 환경 문제일 수 있어요');
      box.classList.remove('on');
      setTimeout(() => box.remove(), 250);
    }
  }

  /* ── UI ── */
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
  function paintUI(state) {
    let box = document.getElementById('dm-call');
    if (!box) {
      box = document.createElement('div');
      box.id = 'dm-call';
      document.body.appendChild(box);
      requestAnimationFrame(() => box.classList.add('on'));
    }
    const name = esc(CUR?.name || '');
    const avatarLetter = name.charAt(0) || '갈';
    const stateTxt = { outgoing: '전화 거는 중…', incoming: '보이스톡이 왔어요', connecting: '연결 중…', oncall: '' }[state] || '';
    box.dataset.state = state;
    box.innerHTML = `
      <audio id="dm-call-audio" autoplay></audio>
      <div class="dmc-card">
        <span class="dmc-ava${state === 'incoming' || state === 'outgoing' ? ' ring' : ''}">${esc(avatarLetter)}</span>
        <div class="dmc-name">${name}</div>
        <div class="dmc-state">${stateTxt}<span id="dm-call-timer">${state === 'oncall' ? '00:00' : ''}</span></div>
        <div class="dmc-btns">
          ${state === 'incoming' ? `
            <button class="dmc-btn accept" data-c="accept" aria-label="받기">${IC.phone}</button>
            <button class="dmc-btn end" data-c="decline" aria-label="거절">${IC.phone}</button>`
          : `
            ${state === 'oncall' ? `<button class="dmc-btn mute" data-c="mute" aria-label="음소거">${IC.mic}</button>` : ''}
            <button class="dmc-btn end" data-c="hangup" aria-label="끊기">${IC.phone}</button>`}
        </div>
      </div>`;
    box.onclick = e => {
      const c = e.target.closest('[data-c]')?.dataset.c;
      if (c === 'accept') accept();
      else if (c === 'decline') decline();
      else if (c === 'hangup') endCall('ended');
      else if (c === 'mute') {
        const t = localStream?.getAudioTracks()[0];
        if (!t) return;
        t.enabled = !t.enabled;
        const b = box.querySelector('[data-c="mute"]');
        b.classList.toggle('off', !t.enabled);
        b.innerHTML = t.enabled ? IC.mic : IC.micoff;
      }
    };
  }

  window.GALLA_call = {
    listen, start,
    supported: () => !!(window.RTCPeerConnection && navigator.mediaDevices?.getUserMedia),
    _debug: () => ({ cur: CUR && { peer: CUR.peer, dir: CUR.dir }, pcState: pc?.connectionState || null }),
  };
})();
