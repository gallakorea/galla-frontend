/* 📟 GALLA 삐삐 — 음성사서함 (1990년대 감성)
   채팅과 겹치지 않게 하는 게 전부다:
     채팅 = 즉시·실시간·읽음표시·입력중   (지금의 조급함)
     삐삐 = 호출만 오고, 내용은 사서함에 '접속해서' 듣는다 (그 시절의 기다림)
   그래서 여기엔 읽음표시도, 실시간 구독도, 답장 버튼도 없다 — 일부러.

   window.GALLA_PAGER = { mount(el), beep(), popup(msg) } */
(function () {
  const sb = () => window.supabaseClient;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ── 삐삐 암호책 — 모르면 못 읽는 게 재미의 절반이었다 ── */
  const CODES = [
    { n: '1004', m: '천사' },
    { n: '486', m: '사랑해' },
    { n: '8282', m: '빨리빨리' },
    { n: '1010235', m: '열렬히 사모해' },
    { n: '0404', m: '영원히 사랑해' },
    { n: '7942', m: '친구사이' },
    { n: '100', m: '백점 (최고야)' },
    { n: '505', m: 'SOS (도와줘)' },
    { n: '1717', m: '일찍일찍' },
    { n: '9090', m: '구경 와' },
    { n: '0242', m: '오늘 사이 좋게' },
    { n: '3535', m: '사무치게 사무치게' },
  ];
  const codeMeaning = n => (CODES.find(c => c.n === n) || {}).m || '';

  /* ── 소리: 파일 없이 합성한다(용량 0, 저작권 0). 그 시절 '삐-삐-' ── */
  let AC = null;
  function tone(freq, ms, when, gainV) {
    const ctx = AC;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'square'; o.frequency.value = freq;
    g.gain.setValueAtTime(0, ctx.currentTime + when);
    g.gain.linearRampToValueAtTime(gainV ?? 0.07, ctx.currentTime + when + 0.01);
    g.gain.setValueAtTime(gainV ?? 0.07, ctx.currentTime + when + ms / 1000 - 0.01);
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + when + ms / 1000);
    o.connect(g); g.connect(ctx.destination);
    o.start(ctx.currentTime + when); o.stop(ctx.currentTime + when + ms / 1000 + 0.02);
  }
  function beep(kind) {
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      if (AC.state === 'suspended') AC.resume();
      if (kind === 'ring') { [0, .18, .36].forEach(t => { tone(2300, 90, t); tone(1800, 90, t + .09); }); }
      else if (kind === 'connect') { tone(950, 120, 0); tone(1250, 160, .14); }
      else tone(1600, 260, 0);   // 인사말 뒤 '삐-'
    } catch (_) {}
  }

  /* ── 도착 알림: 채팅 토스트와 완전히 다른 '액정 팝업' ── */
  function popup({ name, kind, code }) {
    let el = document.getElementById('pager-pop');
    if (!el) {
      el = document.createElement('div');
      el.id = 'pager-pop';
      document.body.appendChild(el);
    }
    el.innerHTML = `
      <div class="pgr-pop-body">
        <div class="pgr-lcd">
          <div class="pgr-lcd-top">📟 삐삐가 왔습니다</div>
          <div class="pgr-lcd-main">${kind === 'code' ? esc(code) : '음성 1통'}</div>
          <div class="pgr-lcd-sub">${esc(name || '누군가')}${kind === 'code' && codeMeaning(code) ? ' · ' + esc(codeMeaning(code)) : ''}</div>
        </div>
        <div class="pgr-pop-btns">
          <button type="button" data-p="later">나중에</button>
          <button type="button" data-p="go">사서함 열기</button>
        </div>
      </div>`;
    el.classList.add('on');
    beep('ring');
    try { navigator.vibrate?.([90, 70, 90, 70, 90]); } catch (_) {}
    const close = () => { el.classList.remove('on'); setTimeout(() => el.remove(), 300); };
    el.onclick = e => {
      const p = e.target.closest('[data-p]')?.dataset.p;
      if (!p) return;
      close();
      if (p === 'go') window.GALLA_openPager?.();
    };
    clearTimeout(el._t);
    el._t = setTimeout(close, 12000);
  }

  /* ── 사서함 화면 ── */
  let BOX = null, PLAYING = null;

  async function mount(host) {
    host.innerHTML = `<div class="pgr-loading">삐삐를 켜는 중…</div>`;
    const { data } = await sb().rpc('pager_my_box');
    BOX = data?.ok ? data : { number: '012-????-???' };
    await render(host);
  }

  async function render(host) {
    const [{ data: msgs }, meId] = await Promise.all([
      sb().from('pager_messages').select('*').order('created_at', { ascending: false }).limit(50),
      Promise.resolve(null),
    ]);
    const list = msgs || [];
    const ids = [...new Set(list.map(m => m.sender_id))];
    let names = {};
    if (ids.length) {
      const { data: us } = await sb().from('users').select('id,nickname').in('id', ids);
      (us || []).forEach(u => { names[u.id] = u.nickname || '익명'; });
    }
    const unread = list.filter(m => !m.listened_at).length;

    host.innerHTML = `
      <div class="pgr-wrap">
        <div class="pgr-device">
          <div class="pgr-lcd">
            <div class="pgr-lcd-top">MY PAGER</div>
            <div class="pgr-lcd-main">${esc(BOX.number)}</div>
            <div class="pgr-lcd-sub">${unread ? `새 호출 ${unread}통` : '새 호출 없음'}</div>
          </div>
          <div class="pgr-actions">
            <button type="button" class="pgr-btn" data-a="copy">번호 복사</button>
            <button type="button" class="pgr-btn" data-a="greet">${BOX.greeting_url ? '인사말 다시 녹음' : '인사말 녹음'}</button>
          </div>
          ${BOX.greeting_url ? `<button type="button" class="pgr-greet-play" data-a="playgreet">▶ 내 인사말 듣기 (${BOX.greeting_dur || 0}초)</button>` : ''}
        </div>

        <div class="pgr-sec">받은 호출</div>
        <div class="pgr-list">
          ${list.length ? list.map(m => rowHTML(m, names[m.sender_id])).join('')
            : `<div class="pgr-empty">아직 아무도 삐삐를 치지 않았어요.<br><span>번호를 친구에게 알려주세요.</span></div>`}
        </div>
        <div class="pgr-note">삐삐엔 읽음 표시가 없어요. 들었는지는 나만 압니다.</div>
      </div>`;

    host.querySelectorAll('[data-a]').forEach(b => b.onclick = () => act(b.dataset.a, host));
    host.querySelectorAll('[data-msg]').forEach(el => el.onclick = () => openMsg(el.dataset.msg, list, names, host));
  }

  function rowHTML(m, name) {
    const t = new Date(m.created_at);
    const when = `${t.getMonth() + 1}/${t.getDate()} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
    const isNew = !m.listened_at;
    return `
      <button type="button" class="pgr-row${isNew ? ' new' : ''}" data-msg="${m.id}">
        <span class="pgr-row-ic">${m.kind === 'code' ? '숫자' : '음성'}</span>
        <span class="pgr-row-mid">
          <b>${m.kind === 'code' ? esc(m.code) + (codeMeaning(m.code) ? ` <i>${esc(codeMeaning(m.code))}</i>` : '') : `${m.dur || 0}초 음성`}</b>
          <span>${esc(name || '누군가')}</span>
        </span>
        <span class="pgr-row-t">${when}${isNew ? '<em>NEW</em>' : ''}</span>
      </button>`;
  }

  async function openMsg(id, list, names, host) {
    const m = list.find(x => x.id === id);
    if (!m) return;
    if (m.kind === 'code') {
      popup({ name: names[m.sender_id], kind: 'code', code: m.code });
    } else if (m.voice_url) {
      if (PLAYING) { PLAYING.pause(); PLAYING = null; }
      beep('connect');
      setTimeout(() => { PLAYING = new Audio(m.voice_url); PLAYING.play().catch(() => {}); }, 320);
    }
    if (!m.listened_at) {
      await sb().from('pager_messages').update({ listened_at: new Date().toISOString() }).eq('id', id);
      m.listened_at = new Date().toISOString();
      const el = host.querySelector(`[data-msg="${id}"]`);
      el?.classList.remove('new');
      el?.querySelector('em')?.remove();
    }
  }

  async function act(a, host) {
    if (a === 'copy') {
      try { await navigator.clipboard.writeText(BOX.number); } catch (_) {}
      window.GALLA_dmToast?.('번호를 복사했어요') || toast('번호를 복사했어요');
    } else if (a === 'playgreet') {
      if (PLAYING) PLAYING.pause();
      PLAYING = new Audio(BOX.greeting_url); PLAYING.play().catch(() => {});
    } else if (a === 'greet') {
      recordUI(host, null);   // 대상 없음 = 내 인사말
    }
  }

  function toast(t) {
    let el = document.getElementById('dm-mini-toast');
    if (!el) { el = document.createElement('div'); el.id = 'dm-mini-toast'; document.body.appendChild(el); }
    el.textContent = t; el.classList.add('on');
    clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), 2400);
  }

  /* ── 남기기: 사서함 '접속' 연출 → 인사말 → 삐 → 녹음 → 들어보고 → 보내기 ──
     녹음하자마자 날아가지 않는다. 한 번 들어보고 결정하는 그 머뭇거림이 이 기능의 감성이다. */
  async function leaveTo(peer, name) {
    const el = document.createElement('div');
    el.id = 'pager-call';
    el.innerHTML = `<div class="pgr-call-body"><div class="pgr-lcd">
        <div class="pgr-lcd-top">연결 중…</div>
        <div class="pgr-lcd-main">${esc(name || '')}</div>
        <div class="pgr-lcd-sub">삐삐 사서함</div>
      </div><div class="pgr-call-stage" id="pgr-stage"></div>
      <button type="button" class="pgr-call-x" data-c="close">닫기</button></div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('on'));
    el.onclick = e => {
      if (e.target.closest('[data-c="close"]')) { stopRec(true); el.classList.remove('on'); setTimeout(() => el.remove(), 250); }
    };
    beep('connect');

    const stage = el.querySelector('#pgr-stage');
    stage.innerHTML = `<div class="pgr-dial">···</div>`;
    // 상대 인사말 재생 → 삐 → 녹음 준비
    const { data: box } = await sb().from('pager_boxes').select('greeting_url,greeting_dur').eq('user_id', peer).maybeSingle();
    await new Promise(r => setTimeout(r, 700));
    el.querySelector('.pgr-lcd-top').textContent = '사서함 연결됨';
    if (box?.greeting_url) {
      stage.innerHTML = `<div class="pgr-dial">인사말 재생 중…</div>`;
      await new Promise(res => {
        const au = new Audio(box.greeting_url);
        au.onended = au.onerror = res;
        au.play().catch(res);
        setTimeout(res, 12000);
      });
    } else {
      stage.innerHTML = `<div class="pgr-dial">인사말이 없는 사서함입니다</div>`;
      await new Promise(r => setTimeout(r, 900));
    }
    beep('tone');
    await new Promise(r => setTimeout(r, 400));
    recordStage(stage, peer, el);
  }

  /* 녹음 단계 (남기기 / 인사말 공용) */
  let REC = null, RECT = null, CHUNKS = [], BLOB = null, RECURL = null;
  function stopRec(cancel) {
    clearInterval(RECT);
    if (REC && REC.state !== 'inactive') { REC._cancel = cancel; try { REC.stop(); } catch (_) {} }
  }
  function recordStage(stage, peer, modal) {
    const isGreeting = !peer;
    stage.innerHTML = `
      <div class="pgr-rec">
        <div class="pgr-rec-hint">${isGreeting ? '인사말을 녹음하세요' : '삐- 소리 후 메시지를 남겨주세요'}</div>
        <button type="button" class="pgr-rec-btn" data-r="start">● 녹음 시작</button>
        <div class="pgr-rec-time" id="pgr-rt"></div>
        <div class="pgr-rec-after" id="pgr-after" hidden>
          <button type="button" data-r="preview">▶ 들어보기</button>
          <button type="button" data-r="again">다시</button>
          <button type="button" data-r="send" class="go">${isGreeting ? '이걸로 저장' : '보내기'}</button>
        </div>
        ${isGreeting ? '' : `<div class="pgr-code">
          <div class="pgr-code-t">말 대신 숫자만 남기기</div>
          <div class="pgr-code-chips">${CODES.slice(0, 8).map(c => `<button type="button" data-code="${c.n}">${c.n}<i>${esc(c.m)}</i></button>`).join('')}</div>
          <div class="pgr-code-row"><input id="pgr-code-in" inputmode="numeric" maxlength="10" placeholder="직접 입력 (숫자)"><button type="button" data-r="sendcode">호출</button></div>
        </div>`}
      </div>`;

    stage.onclick = async e => {
      const chip = e.target.closest('[data-code]');
      if (chip) { await sendCode(peer, chip.dataset.code, modal); return; }
      const r = e.target.closest('[data-r]')?.dataset.r;
      if (!r) return;
      if (r === 'start') {
        if (REC) { stopRec(false); return; }
        await startRec(stage);
      } else if (r === 'preview') {
        if (RECURL) { const a = new Audio(RECURL); a.play().catch(() => {}); }
      } else if (r === 'again') {
        BLOB = null; RECURL = null;
        stage.querySelector('#pgr-after').hidden = true;
        stage.querySelector('[data-r="start"]').textContent = '● 녹음 시작';
        stage.querySelector('#pgr-rt').textContent = '';
      } else if (r === 'send') {
        await sendVoice(peer, modal, stage);
      } else if (r === 'sendcode') {
        const v = (stage.querySelector('#pgr-code-in').value || '').replace(/\D/g, '');
        if (!v) return toast('숫자를 입력해주세요');
        await sendCode(peer, v, modal);
      }
    };
  }
  async function startRec(stage) {
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (_) { return toast('마이크 권한이 필요해요'); }
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '';
    CHUNKS = []; BLOB = null; RECURL = null;
    const t0 = Date.now();
    REC = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    REC.ondataavailable = e => { if (e.data?.size) CHUNKS.push(e.data); };
    REC.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      clearInterval(RECT);
      const cancel = REC._cancel; const dur = Math.round((Date.now() - t0) / 1000);
      REC = null;
      stage.querySelector('[data-r="start"]').textContent = '● 녹음 시작';
      if (cancel) return;
      BLOB = new Blob(CHUNKS, { type: mime || 'audio/webm' });
      BLOB._dur = Math.max(1, dur);
      RECURL = URL.createObjectURL(BLOB);
      stage.querySelector('#pgr-rt').textContent = `${BLOB._dur}초 녹음됨`;
      stage.querySelector('#pgr-after').hidden = false;
    };
    REC.start();
    stage.querySelector('[data-r="start"]').textContent = '■ 그만 (녹음 중)';
    RECT = setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      stage.querySelector('#pgr-rt').textContent = `${s}초…`;
      if (s >= 60) stopRec(false);
    }, 250);
  }
  async function uploadVoice() {
    if (!window.GALLA_UPLOAD_MEDIA) {
      await new Promise((res, rej) => {
        const v = ([...document.scripts].map(s => s.src).find(u => /[?&]v=/.test(u)) || '').match(/[?&]v=(\d+)/);
        const s = document.createElement('script');
        s.src = '/js/media-upload.js' + (v ? '?v=' + v[1] : '');
        s.onload = res; s.onerror = rej; document.head.appendChild(s);
      });
    }
    const type = BLOB.type || 'audio/webm';
    const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
    const f = new File([BLOB], 'pager.' + ext, { type });
    return window.GALLA_UPLOAD_MEDIA(f, 'audio');
  }
  async function sendVoice(peer, modal, stage) {
    if (!BLOB) return toast('먼저 녹음해주세요');
    const btn = stage.querySelector('[data-r="send"]');
    btn.disabled = true; btn.textContent = '보내는 중…';
    try {
      const url = await uploadVoice();
      if (!peer) {
        const { data } = await sb().rpc('pager_set_greeting', { p_url: url, p_dur: BLOB._dur });
        if (!data?.ok) throw new Error('greeting');
        toast('인사말을 저장했어요');
        BOX.greeting_url = url; BOX.greeting_dur = BLOB._dur;
      } else {
        const { data } = await sb().rpc('pager_leave', { p_to: peer, p_kind: 'voice', p_url: url, p_dur: BLOB._dur, p_code: null });
        if (!data?.ok) throw new Error(data?.reason || 'send');
        toast('음성을 남겼어요 — 상대가 사서함에서 들을 거예요');
      }
      closeModal(modal);
      window.GALLA_pagerRefresh?.();
    } catch (e) {
      toast(String(e.message) === 'too_fast' ? '조금 천천히 남겨주세요' : '남기지 못했어요');
      btn.disabled = false; btn.textContent = peer ? '보내기' : '이걸로 저장';
    }
  }
  async function sendCode(peer, code, modal) {
    const { data } = await sb().rpc('pager_leave', { p_to: peer, p_kind: 'code', p_url: null, p_dur: null, p_code: code });
    if (!data?.ok) return toast(data?.reason === 'too_fast' ? '조금 천천히 남겨주세요' : '보내지 못했어요');
    beep('tone');
    toast(`${code} 호출을 보냈어요${codeMeaning(code) ? ' — ' + codeMeaning(code) : ''}`);
    closeModal(modal);
  }
  function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove('on');
    setTimeout(() => modal.remove(), 250);
  }

  /* 인사말 녹음도 같은 모달을 쓴다(대상 없음) */
  function recordUI(host, peer) {
    const el = document.createElement('div');
    el.id = 'pager-call';
    el.innerHTML = `<div class="pgr-call-body"><div class="pgr-lcd">
        <div class="pgr-lcd-top">인사말 녹음</div>
        <div class="pgr-lcd-main">${esc(BOX?.number || '')}</div>
        <div class="pgr-lcd-sub">사서함에 접속한 사람이 듣게 됩니다</div>
      </div><div class="pgr-call-stage" id="pgr-stage"></div>
      <button type="button" class="pgr-call-x" data-c="close">닫기</button></div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('on'));
    el.onclick = e => { if (e.target.closest('[data-c="close"]')) { stopRec(true); closeModal(el); } };
    recordStage(el.querySelector('#pgr-stage'), null, el);
    window.GALLA_pagerRefresh = () => mount(host);
  }

  window.GALLA_PAGER = { mount, beep, popup, leaveTo, CODES, codeMeaning };
})();
