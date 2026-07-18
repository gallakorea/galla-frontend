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

  /* ── 삐삐 암호책 — 모르면 못 읽는 게 재미의 절반이었다.
     그 시절 실제로 쓰이던 숫자어들 + 숫자 발음 말장난. 카테고리로 골라 보낸다. ── */
  const CODEBOOK = [
    { cat: '사랑', list: [
      { n: '486', m: '사랑해' },
      { n: '1004', m: '천사' },
      { n: '0404', m: '영원히 사랑해' },
      { n: '0124', m: '영원히 사랑해 (영원히♥)' },
      { n: '1010235', m: '열렬히 사모해' },
      { n: '8949', m: '빨리 사귀자' },
      { n: '2825', m: '이제 그만 빨리와' },
      { n: '3505', m: '사랑해 오빠' },
      { n: '4500', m: '사랑해 (사오빵빵)' },
      { n: '7179', m: '친한 친구 이상' },
    ]},
    { cat: '우정', list: [
      { n: '7942', m: '친구사이' },
      { n: '79', m: '친구' },
      { n: '337', m: '삼삼칠 박수 (축하해)' },
      { n: '100', m: '백점 (최고야)' },
      { n: '2848', m: '이판사판 (한번 붙자)' },
      { n: '7676', m: '착찹착찹 (심란해)' },
      { n: '5555', m: '오~ 대박' },
      { n: '1818', m: '(화났다는 뜻…)' },
    ]},
    { cat: '일상', list: [
      { n: '8282', m: '빨리빨리' },
      { n: '275', m: '이리 와' },
      { n: '1414', m: '식사했어?' },
      { n: '1717', m: '일찍일찍 다녀' },
      { n: '9090', m: '구경 와' },
      { n: '981', m: '굿바이' },
      { n: '505', m: 'SOS (도와줘)' },
      { n: '1200', m: '지금 바빠' },
      { n: '0027', m: '땡땡이 치자' },
      { n: '045', m: '빵 사와' },
    ]},
    { cat: '뒤집어 읽기', list: [
      { n: '07734', m: '뒤집으면 hELLO (안녕)' },
      { n: '35006', m: '뒤집으면 gOOSE (거위…?)' },
      { n: '0.7734', m: '뒤집으면 hELLO' },
      { n: '3535', m: '사무치게 사무치게 (보고싶어)' },
      { n: '0242', m: '오늘 사이 좋게' },
    ]},
  ];
  const CODES = CODEBOOK.flatMap(c => c.list);
  const codeMeaning = n => (CODES.find(c => c.n === n) || {}).m || '';

  /* ── 📖 암호책 화면 — 골라서 보내거나(onPick), 그냥 구경하거나 ── */
  function openCodebook(onPick) {
    const el = document.createElement('div');
    el.id = 'pager-book';
    el.innerHTML = `
      <div class="pgr-book-body">
        <div class="pgr-book-head">
          <b>📖 추억의 삐삐 암호책</b>
          <span>${onPick ? '골라서 바로 호출' : '이런 뜻이었습니다'}</span>
        </div>
        <div class="pgr-book-scroll">
          ${CODEBOOK.map(c => `
            <div class="pgr-book-cat">${esc(c.cat)}</div>
            ${c.list.map(x => `
              <button type="button" class="pgr-book-row" data-bn="${esc(x.n)}" ${onPick ? '' : 'disabled'}>
                <b>${esc(x.n)}</b><span>${esc(x.m)}</span>${onPick ? '<i>호출</i>' : ''}
              </button>`).join('')}
          `).join('')}
        </div>
        <button type="button" class="pgr-call-x" data-b="close">닫기</button>
      </div>`;
    document.body.appendChild(el);
    void el.getBoundingClientRect();   // 강제 리플로우 — rAF는 스로틀 탭에서 안 불려 모달이 투명하게 남는다
    el.classList.add('on');
    const close = () => { el.classList.remove('on'); setTimeout(() => el.remove(), 250); };
    el.onclick = e => {
      if (e.target === el || e.target.closest('[data-b="close"]')) return close();
      const row = e.target.closest('[data-bn]');
      if (row && onPick) { close(); onPick(row.dataset.bn); }
    };
  }

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
          <div class="pgr-lcd-main">${kind === 'code' ? esc(code) : code ? '음성+' + esc(code) : '음성 1통'}</div>
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
            <button type="button" class="pgr-btn" data-a="book">📖 암호책</button>
            <button type="button" class="pgr-btn" data-a="greet">${BOX.greeting_url ? '인사말 재녹음' : '인사말 녹음'}</button>
          </div>
          ${BOX.greeting_url ? `<button type="button" class="pgr-greet-play" data-a="playgreet">▶ 내 인사말 듣기 (${BOX.greeting_dur || 0}초)</button>` : ''}
        </div>

        <div class="pgr-sec">삐삐 걸기</div>
        <div class="pgr-dialer">
          <div class="pgr-code-row">
            <input id="pgr-dial-in" inputmode="tel" maxlength="12" placeholder="012-0000-000" autocomplete="off">
            <button type="button" data-a="dial">호출</button>
          </div>
          <button type="button" class="pgr-friends-btn" data-a="pickfriend">주소록(친구)에서 고르기</button>
          <div class="pgr-dial-hint" id="pgr-dial-hint">번호만 알면 모르는 사람에게도 칠 수 있어요</div>
        </div>

        <div class="pgr-sec">받은 호출</div>
        <div class="pgr-list">
          ${list.length ? list.map(m => rowHTML(m, names[m.sender_id])).join('')
            : `<div class="pgr-empty">아직 아무도 삐삐를 치지 않았어요.<br><span>번호를 친구에게 알려주세요.</span></div>`}
        </div>
        <div class="pgr-note">삐삐엔 읽음 표시가 없어요. 들었는지는 나만 압니다.</div>
      </div>`;

    host.querySelectorAll('[data-a]').forEach(b => b.onclick = () => act(b.dataset.a, host));
    bindDial(host);
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
          <b>${m.kind === 'code'
            ? esc(m.code) + (codeMeaning(m.code) ? ` <i>${esc(codeMeaning(m.code))}</i>` : '')
            : `${m.dur || 0}초 음성` + (m.code ? ` + ${esc(m.code)}` + (codeMeaning(m.code) ? ` <i>${esc(codeMeaning(m.code))}</i>` : '') : '')}</b>
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
    if (a === 'dial') {
      const inp = host.querySelector('#pgr-dial-in');
      const hint = host.querySelector('#pgr-dial-hint');
      let n = (inp.value || '').replace(/[^0-9]/g, '');
      if (n.length < 9) { hint.textContent = '번호를 끝까지 입력해주세요 (012-0000-000)'; return; }
      n = n.slice(0, 10);
      const formatted = `${n.slice(0, 3)}-${n.slice(3, 7)}-${n.slice(7)}`;
      hint.textContent = '연결 중…';
      const { data } = await sb().rpc('pager_dial', { p_number: formatted });
      if (!data?.ok) { hint.textContent = '없는 번호예요 — 다시 확인해주세요'; beep('tone'); return; }
      hint.textContent = '번호만 알면 모르는 사람에게도 칠 수 있어요';
      inp.value = '';
      leaveTo(data.user_id, data.nickname);
      return;
    }
    if (a === 'pickfriend') { pickFriend(host); return; }
    if (a === 'book') { openCodebook(null); return; }
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

  /* 다이얼 입력 자동 하이픈(012-0000-000) */
  function bindDial(host) {
    const inp = host.querySelector('#pgr-dial-in');
    if (!inp) return;
    inp.addEventListener('input', () => {
      const d = inp.value.replace(/[^0-9]/g, '').slice(0, 10);
      inp.value = d.length > 7 ? `${d.slice(0,3)}-${d.slice(3,7)}-${d.slice(7)}`
        : d.length > 3 ? `${d.slice(0,3)}-${d.slice(3)}` : d;
    });
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); host.querySelector('[data-a="dial"]')?.click(); }
    });
  }

  /* 주소록(맞팔 친구) 골라 걸기 */
  async function pickFriend(host) {
    const me = (await sb().auth.getSession()).data?.session?.user?.id;
    const [{ data: ing }, { data: ers }] = await Promise.all([
      sb().from('follows').select('following').eq('follower', me),
      sb().from('follows').select('follower').eq('following', me),
    ]);
    const mine = new Set((ing || []).map(r => r.following));
    const ids = [...new Set((ers || []).map(r => r.follower))].filter(id => mine.has(id));
    let names = {};
    if (ids.length) {
      const { data: us } = await sb().from('users').select('id,nickname').in('id', ids);
      (us || []).forEach(u => { names[u.id] = u.nickname || '익명'; });
    }
    const el = document.createElement('div');
    el.id = 'pager-book';   // 암호책과 같은 시트 스타일 재사용
    el.innerHTML = `
      <div class="pgr-book-body">
        <div class="pgr-book-head"><b>📟 누구에게 칠까요</b><span>주소록 (맞팔 친구)</span></div>
        <div class="pgr-book-scroll">
          ${ids.length ? ids.map(id => `
            <button type="button" class="pgr-book-row" data-fr="${id}">
              <b style="min-width:auto">${esc((names[id] || '익').charAt(0))}</b>
              <span>${esc(names[id] || '익명')}</span><i>호출</i>
            </button>`).join('')
          : `<div class="pgr-empty">맞팔 친구가 없어요.<br><span>번호로 직접 걸어보세요.</span></div>`}
        </div>
        <button type="button" class="pgr-call-x" data-b="close">닫기</button>
      </div>`;
    document.body.appendChild(el);
    void el.getBoundingClientRect();
    el.classList.add('on');
    const close = () => { el.classList.remove('on'); setTimeout(() => el.remove(), 250); };
    el.onclick = e => {
      if (e.target === el || e.target.closest('[data-b="close"]')) return close();
      const row = e.target.closest('[data-fr]');
      if (row) { close(); leaveTo(row.dataset.fr, names[row.dataset.fr]); }
    };
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
    void el.getBoundingClientRect();   // 강제 리플로우 — rAF는 스로틀 탭에서 안 불려 모달이 투명하게 남는다
    el.classList.add('on');
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
          <div class="pgr-after-btns">
            <button type="button" data-r="preview">▶ 들어보기</button>
            <button type="button" data-r="again">다시</button>
            <button type="button" data-r="send" class="go">${isGreeting ? '이걸로 저장' : '보내기'}</button>
          </div>
          ${isGreeting ? '' : `<div class="pgr-with-code">
            <input id="pgr-wc-in" inputmode="numeric" maxlength="10" placeholder="숫자도 함께 (선택 — 예: 486)">
            <button type="button" data-r="wcbook">📖</button>
          </div>`}
        </div>
        ${isGreeting ? '' : `<div class="pgr-code">
          <div class="pgr-code-t">말 대신 숫자만 남기기 <button type="button" class="pgr-book-open" data-r="book">📖 암호책 전체</button></div>
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
      } else if (r === 'book') {
        openCodebook(code => sendCode(peer, code, modal));
      } else if (r === 'wcbook') {
        openCodebook(code => { const i = stage.querySelector('#pgr-wc-in'); if (i) i.value = code; });
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
        const wc = (stage.querySelector('#pgr-wc-in')?.value || '').replace(/[^0-9.]/g, '') || null;
        const { data } = await sb().rpc('pager_leave', { p_to: peer, p_kind: 'voice', p_url: url, p_dur: BLOB._dur, p_code: wc });
        if (!data?.ok) throw new Error(data?.reason || 'send');
        toast(wc ? `음성 + ${wc} 를 남겼어요` : '음성을 남겼어요 — 상대가 사서함에서 들을 거예요');
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
    void el.getBoundingClientRect();   // 강제 리플로우 — rAF는 스로틀 탭에서 안 불려 모달이 투명하게 남는다
    el.classList.add('on');
    el.onclick = e => { if (e.target.closest('[data-c="close"]')) { stopRec(true); closeModal(el); } };
    recordStage(el.querySelector('#pgr-stage'), null, el);
    window.GALLA_pagerRefresh = () => mount(host);
  }

  window.GALLA_PAGER = { mount, beep, popup, leaveTo, CODES, CODEBOOK, codeMeaning, openCodebook };
})();
