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
      if (p === 'go') { if (window.GALLA_openPager) window.GALLA_openPager(); else location.href = 'dm.html?pager=1'; }
    };
    clearTimeout(el._t);
    el._t = setTimeout(close, 12000);
  }

  /* ── 사서함 화면 ── */
  let BOX = null, PLAYING = null;

  async function mount(host) {
    host.innerHTML = `<div class="pgr-loading">삐삐를 켜는 중…</div>`;
    const { data, error } = await sb().rpc('pager_my_box');
    if (!data?.ok) {
      // ★ 물음표 번호 폴백 금지 — '다 똑같은 번호'로 오해된다. 이유를 말하고 재시도.
      host.innerHTML = `<div class="pgr-empty">
          삐삐를 켜지 못했어요<br>
          <span>${esc(data?.reason === 'unauthorized' ? '로그인이 풀렸어요 — 새로고침하거나 다시 로그인해주세요' : (error?.message || '잠시 후 다시 시도해주세요'))}</span><br><br>
          <button type="button" class="pgr-btn" id="pgr-retry">다시 시도</button>
        </div>`;
      host.querySelector('#pgr-retry').onclick = () => mount(host);
      return;
    }
    if (!data.activated) { renderActivation(host, data.waiting || 0); return; }
    BOX = data;
    await render(host);
  }

  /* ── 🔄 조용한 새로고침 — 스크롤·재생 상태를 흔들지 않고 목록만 다시 그린다 ── */
  let REFRESHING = false;
  async function refresh(host) {
    if (REFRESHING || !host || host.hidden) return;
    // 사용자가 뭔가 하는 중이면(모달·녹음) 건드리지 않는다
    if (document.getElementById('pager-call') || document.getElementById('pager-book') || REC) return;
    REFRESHING = true;
    try {
      const { data } = await sb().rpc('pager_my_box');
      if (!data?.ok) return;
      if (!data.activated) { renderActivation(host, data.waiting || 0); return; }
      BOX = data;
      const scroller = host;                       // #dm-pager 자체가 스크롤 컨테이너
      const y = scroller.scrollTop;
      const dialVal = host.querySelector('#pgr-dial-in')?.value || '';
      await render(host);
      scroller.scrollTop = y;                      // 읽던 자리 유지
      const di = host.querySelector('#pgr-dial-in');
      if (di && dialVal) di.value = dialVal;       // 입력 중이던 번호 보존
    } catch (_) {} finally { REFRESHING = false; }
  }

  /* 자동 갱신: ① 앱 복귀(탭 전환·홈에서 돌아옴) ② 주기(25초) ③ 온라인 복구
     실시간(postgres_changes)이 주력이지만, 모바일은 백그라운드에서 소켓이 자주 끊긴다.
     그때도 '다녀와야 보이는' 일이 없도록 3중으로 받친다. */
  let autoBound = false, pollT = null;
  function startAuto(host) {
    clearInterval(pollT);
    pollT = setInterval(() => {
      if (document.visibilityState === 'visible' && !host.hidden) refresh(host);
    }, 25000);
    if (autoBound) return;
    autoBound = true;
    const wake = () => { if (document.visibilityState === 'visible') refresh(host); };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    window.addEventListener('online', wake);
    window.addEventListener('pageshow', e => { if (e.persisted) wake(); });
  }


  /* ── 📖 삐삐 사용 설명서 — 처음 온 사람에게 '그 시절'을 5장으로 설명한다.
     그림은 전부 인라인 SVG(외부 파일 0, 오프라인 OK, 레티나 선명). ── */
  const GUIDE_KEY = 'galla_pager_guide_v1';

  const ART = {
    // 진동하는 삐삐 기기
    pager: `<svg viewBox="0 0 200 150" class="pgr-art-svg">
      <g class="art-shake">
        <rect x="46" y="18" width="108" height="118" rx="16" fill="#1a1d24" stroke="#7dffa8" stroke-width="2"/>
        <rect x="58" y="32" width="84" height="46" rx="6" fill="#0d2b18" stroke="#2a9c58" stroke-width="1.5"/>
        <text x="100" y="62" text-anchor="middle" font-family="Courier New,monospace" font-size="20" fill="#7dffa8" class="art-blink">486</text>
        <circle cx="76" cy="98" r="9" fill="#2a3240"/><circle cx="100" cy="98" r="9" fill="#2a3240"/><circle cx="124" cy="98" r="9" fill="#2a3240"/>
        <rect x="76" y="116" width="48" height="7" rx="3.5" fill="#2a3240"/>
        <rect x="96" y="6" width="8" height="14" rx="3" fill="#7dffa8"/>
      </g>
      <g class="art-wave" stroke="#7dffa8" stroke-width="2.5" fill="none" stroke-linecap="round">
        <path d="M32 60 Q20 75 32 90"/><path d="M18 48 Q0 75 18 102"/>
        <path d="M168 60 Q180 75 168 90"/><path d="M182 48 Q200 75 182 102"/>
      </g>
    </svg>`,
    // 번호 뽑기 액정
    number: `<svg viewBox="0 0 200 150" class="pgr-art-svg">
      <rect x="18" y="34" width="164" height="70" rx="12" fill="#0d2b18" stroke="#2a9c58" stroke-width="2"/>
      <text x="100" y="66" text-anchor="middle" font-family="Courier New,monospace" font-size="11" fill="#5fd88a" letter-spacing="3">MY PAGER</text>
      <text x="100" y="90" text-anchor="middle" font-family="Courier New,monospace" font-size="21" fill="#7dffa8" letter-spacing="1" class="art-blink">012-486-1004</text>
      <g fill="#ffe89a" class="art-spark">
        <path d="M36 24 l3 7 7 3 -7 3 -3 7 -3-7 -7-3 7-3z"/>
        <path d="M166 110 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5-6 -6-2.5 6-2.5z"/>
      </g>
    </svg>`,
    // 떠다니는 숫자 암호
    codes: `<svg viewBox="0 0 200 150" class="pgr-art-svg">
      <g font-family="Courier New,monospace" font-weight="bold">
        <text x="34" y="42" font-size="22" fill="#7dffa8" class="art-float1">486</text>
        <text x="118" y="34" font-size="18" fill="#5fd88a" class="art-float2">8282</text>
        <text x="26" y="106" font-size="18" fill="#5fd88a" class="art-float2">1004</text>
        <text x="108" y="118" font-size="20" fill="#7dffa8" class="art-float1">0404</text>
        <text x="70" y="76" font-size="13" fill="#e6d9a3" class="art-blink">사 랑 해</text>
      </g>
      <g stroke="#2a9c58" stroke-width="1.2" opacity=".5" fill="none">
        <path d="M60 48 L92 70"/><path d="M140 44 L112 68"/><path d="M56 98 L88 84"/><path d="M118 108 L104 86"/>
      </g>
    </svg>`,
    // 공중전화 + 수화기
    phone: `<svg viewBox="0 0 200 150" class="pgr-art-svg">
      <rect x="58" y="16" width="84" height="118" rx="10" fill="#1a1d24" stroke="#7dffa8" stroke-width="2"/>
      <rect x="70" y="28" width="60" height="28" rx="4" fill="#0d2b18" stroke="#2a9c58" stroke-width="1.5"/>
      <text x="100" y="48" text-anchor="middle" font-family="Courier New,monospace" font-size="15" fill="#7dffa8" class="art-blink">삐—</text>
      <g fill="#2a3240">
        <rect x="72" y="66" width="14" height="11" rx="2"/><rect x="93" y="66" width="14" height="11" rx="2"/><rect x="114" y="66" width="14" height="11" rx="2"/>
        <rect x="72" y="82" width="14" height="11" rx="2"/><rect x="93" y="82" width="14" height="11" rx="2"/><rect x="114" y="82" width="14" height="11" rx="2"/>
        <rect x="72" y="98" width="14" height="11" rx="2"/><rect x="114" y="98" width="14" height="11" rx="2"/>
      </g>
      <rect x="93" y="98" width="14" height="11" rx="2" fill="#7dffa8" class="art-blink"/>
      <text x="100" y="107" text-anchor="middle" font-size="9" fill="#0d2b18" font-weight="bold">#</text>
      <g stroke="#7dffa8" stroke-width="3" fill="none" stroke-linecap="round" class="art-shake">
        <path d="M22 44 q0 -14 14 -14 l6 0 q6 0 6 8 l0 6 q0 6 -6 6 l-4 0"/>
        <path d="M22 44 l0 42"/>
        <path d="M22 86 q0 14 14 14 l6 0 q6 0 6 -8 l0 -6"/>
      </g>
    </svg>`,
    // 채팅 vs 삐삐
    versus: `<svg viewBox="0 0 200 150" class="pgr-art-svg">
      <g opacity=".45">
        <rect x="12" y="26" width="70" height="98" rx="10" fill="#16171c" stroke="#3a3f4a" stroke-width="1.5"/>
        <rect x="20" y="38" width="42" height="12" rx="6" fill="#3450d6"/>
        <rect x="32" y="56" width="42" height="12" rx="6" fill="#2a3240"/>
        <rect x="20" y="74" width="50" height="12" rx="6" fill="#3450d6"/>
        <text x="47" y="104" text-anchor="middle" font-size="8" fill="#6b7280">읽음 · 입력중…</text>
        <text x="47" y="116" text-anchor="middle" font-size="9" fill="#8b909b">지금</text>
      </g>
      <text x="100" y="82" text-anchor="middle" font-size="15" fill="#e6d9a3" font-weight="bold">VS</text>
      <g>
        <rect x="118" y="26" width="70" height="98" rx="10" fill="#1a1d24" stroke="#7dffa8" stroke-width="2"/>
        <rect x="128" y="40" width="50" height="26" rx="5" fill="#0d2b18" stroke="#2a9c58" stroke-width="1.2"/>
        <text x="153" y="58" text-anchor="middle" font-family="Courier New,monospace" font-size="13" fill="#7dffa8" class="art-blink">1004</text>
        <text x="153" y="88" text-anchor="middle" font-size="8" fill="#5fd88a">읽었는지 모름</text>
        <text x="153" y="104" text-anchor="middle" font-size="8" fill="#5fd88a">답장 버튼 없음</text>
        <text x="153" y="118" text-anchor="middle" font-size="9" fill="#e6d9a3">기다림</text>
      </g>
    </svg>`,
  };

  const GUIDE = [
    { art: ART.pager, t: '삐삐? 그게 뭔데요',
      b: '1997년. 문자 한 통에 30원 하던 시절,\n우리는 이 조그만 기계로 사랑을 고백했습니다.\n화면엔 <b>숫자만</b> 뜹니다.\n무슨 뜻인지는… <i>알아서 해석하세요.</i>' },
    { art: ART.number, t: '일단 번호부터 받으세요',
      b: '개통하면 <b>나만의 번호</b>가 나옵니다.\n랜덤으로 뽑거나, 마음에 드는 번호를 직접 고르거나.\n<b>486</b>이나 <b>1004</b>가 박힌 번호를 잡으면\n그날 하루 종일 어깨가 올라갑니다.' },
    { art: ART.codes, t: '숫자로 말합니다',
      b: '<b>486</b> 사랑해 · <b>8282</b> 빨리빨리 · <b>1004</b> 천사\n\n상대가 못 알아들으면? 그것도 낭만입니다.\n암호책은 앱 안에 있으니 <i>커닝하세요.</i>' },
    { art: ART.phone, t: '목소리도 남깁니다',
      b: '상대 사서함에 접속하면\n그 사람이 녹음한 <b>인사말</b>이 흘러나옵니다.\n<b>삐—</b> 소리가 나면 그때부터 녹음.\n급하면 <b>#</b>을 눌러 건너뛰세요.\n<i>(그 시절에도 다들 눌렀습니다)</i>' },
    { art: ART.versus, t: '채팅이랑은 다릅니다',
      b: '읽음 표시 <b>없습니다</b>.\n입력 중… <b>없습니다</b>.\n답장 버튼도 <b>없습니다</b>.\n\n상대가 들었는지 알 수 없고,\n그래서 하루 종일 궁금합니다.\n<b>그게 삐삐입니다.</b>' },
  ];

  function openGuide(onDone) {
    let i = 0;
    const el = document.createElement('div');
    el.id = 'pager-guide';
    const paint = () => {
      const g = GUIDE[i], last = i === GUIDE.length - 1;
      el.innerHTML = `
        <div class="pgr-gd-body">
          <div class="pgr-gd-art">${g.art}</div>
          <div class="pgr-gd-t">${g.t}</div>
          <div class="pgr-gd-b">${g.b.replace(/\n/g, '<br>')}</div>
          <div class="pgr-gd-dots">${GUIDE.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
          <div class="pgr-gd-btns">
            ${i > 0 ? '<button type="button" data-g="prev">이전</button>' : '<button type="button" data-g="skip">건너뛰기</button>'}
            <button type="button" data-g="${last ? 'done' : 'next'}" class="go">${last ? '번호 받으러 가기' : '다음'}</button>
          </div>
        </div>`;
    };
    paint();
    document.body.appendChild(el);
    void el.getBoundingClientRect();
    el.classList.add('on');
    beep('connect');
    const close = (done) => {
      try { localStorage.setItem(GUIDE_KEY, '1'); } catch (_) {}
      el.classList.remove('on');
      setTimeout(() => { el.remove(); if (done) onDone?.(); }, 260);
    };
    el.onclick = e => {
      const g = e.target.closest('[data-g]')?.dataset.g;
      if (!g) return;
      if (g === 'next') { i++; paint(); beep('tone'); }
      else if (g === 'prev') { i--; paint(); }
      else if (g === 'skip') close(false);
      else if (g === 'done') close(true);
    };
    // 좌우 스와이프로도 넘긴다
    let sx = 0;
    el.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
    el.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) < 50) return;
      if (dx < 0 && i < GUIDE.length - 1) { i++; paint(); }
      else if (dx > 0 && i > 0) { i--; paint(); }
    });
  }

  /* ── 📟 개통식 — 첫 진입의 의식. 번호를 '받는' 순간이 기억에 남아야 한다 ── */
  function renderActivation(host, waiting) {
    host.innerHTML = `
      <div class="pgr-wrap">
        <div class="pgr-device">
          <div class="pgr-lcd">
            <div class="pgr-lcd-top">NO SERVICE</div>
            <div class="pgr-lcd-main" id="pgr-act-num">--- ----</div>
            <div class="pgr-lcd-sub">미개통 삐삐</div>
          </div>
          ${waiting ? `<div class="pgr-act-wait">📨 이미 도착한 호출 <b>${waiting}통</b>이 개통을 기다리고 있어요</div>` : ''}
          <div class="pgr-act-copy">
            나만의 삐삐 번호를 개통하면<br>친구들이 음성과 암호를 남길 수 있어요
          </div>
          <div class="pgr-actions">
            <button type="button" class="pgr-btn go" data-a="actrand">랜덤으로 개통</button>
            <button type="button" class="pgr-btn" data-a="actpick">번호 골라 개통</button>
          </div>
          <button type="button" class="pgr-guide-open" data-a="guide">📖 삐삐가 뭔가요? (30초 설명서)</button>
        </div>
        <div class="pgr-note">그 시절처럼, 번호 하나로 시작합니다.</div>
      </div>`;
    host.querySelector('[data-a="actrand"]').onclick = () => activateRandom(host);
    host.querySelector('[data-a="actpick"]').onclick = () => pickNumber(host);
    host.querySelector('[data-a="guide"]').onclick = () => openGuide();
    // 처음 온 사람에겐 설명서를 먼저 — '이게 뭐지?'로 이탈하지 않게
    let seen = false;
    try { seen = localStorage.getItem(GUIDE_KEY) === '1'; } catch (_) {}
    if (!seen) setTimeout(() => openGuide(), 500);
  }

  /* 랜덤 개통 — 액정 숫자 스크램블 → 번호 확정 연출 */
  async function activateRandom(host) {
    const numEl = host.querySelector('#pgr-act-num');
    const topEl = host.querySelector('.pgr-lcd-top');
    const btns = host.querySelectorAll('.pgr-actions button');
    btns.forEach(b => b.disabled = true);
    topEl.textContent = 'CONNECTING…';
    // 숫자 굴리기(추첨 감성) + 틱 소리
    let ticks = 0;
    const roll = setInterval(() => {
      const r = () => Math.floor(Math.random() * 10);
      numEl.textContent = `012-${r()}${r()}${r()}-${r()}${r()}${r()}${r()}`;
      if (ticks++ % 3 === 0) beep('tone');
    }, 90);
    const [{ data }] = await Promise.all([
      sb().rpc('pager_activate_random'),
      new Promise(r => setTimeout(r, 1800)),   // 연출 최소 시간 — 너무 빨리 끝나면 심심하다
    ]);
    clearInterval(roll);
    if (!data?.ok) {
      btns.forEach(b => b.disabled = false);
      topEl.textContent = 'NO SERVICE';
      return toast('개통에 실패했어요 — 다시 시도해주세요');
    }
    numEl.textContent = data.number;
    topEl.textContent = 'MY PAGER';
    host.querySelector('.pgr-lcd-sub').textContent = '개통 완료!';
    beep('connect');
    try { navigator.vibrate?.([80, 60, 200]); } catch (_) {}
    toast(`개통을 축하합니다 — ${data.number}`);
    setTimeout(() => mount(host), 1400);
  }

  async function render(host) {
    const me = (await sb().auth.getSession()).data?.session?.user?.id;
    const { data: msgs } = await sb().from('pager_messages').select('*')
      .order('created_at', { ascending: false }).limit(80);
    const all = msgs || [];
    const list = all.filter(m => m.box_owner === me);        // 받은 호출
    const sent = all.filter(m => m.sender_id === me).slice(0, 15);   // 보낸 호출(이력만)
    const ids = [...new Set([...list.map(m => m.sender_id), ...sent.map(m => m.box_owner)])];
    let names = {}, nums = {};
    if (ids.length) {
      const [{ data: us }, { data: bs }] = await Promise.all([
        sb().from('users').select('id,nickname').in('id', ids),
        sb().from('pager_boxes').select('user_id,number').in('user_id', ids),
      ]);
      (us || []).forEach(u => { names[u.id] = u.nickname || '익명'; });
      (bs || []).forEach(b => { nums[b.user_id] = b.number; });
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
            <button type="button" class="pgr-btn" data-a="guide">❓ 사용법</button>
            <button type="button" class="pgr-btn" data-a="greet">${BOX.greeting_url ? '인사말 재녹음' : '인사말 녹음'}</button>
          </div>
          ${BOX.greeting_url ? `<button type="button" class="pgr-greet-play" data-a="playgreet">▶ 내 인사말 듣기 (${BOX.greeting_dur || 0}초)</button>` : ''}
          <button type="button" class="pgr-pick-open" data-a="pick">원하는 번호로 바꾸기 (선택 개통)</button>
        </div>

        <div class="pgr-sec">삐삐 걸기</div>
        <div class="pgr-dialer">
          <div class="pgr-dial-row">
            <span class="pgr-dial-prefix">012-</span>
            <input id="pgr-dial-in" inputmode="numeric" maxlength="9" placeholder="000-0000" autocomplete="off">
            <button type="button" class="pgr-dial-go" data-a="dial">호출</button>
          </div>
          <button type="button" class="pgr-friends-btn" data-a="pickfriend">주소록(친구)에서 고르기</button>
          <div class="pgr-dial-hint" id="pgr-dial-hint">번호만 알면 모르는 사람에게도 칠 수 있어요</div>
        </div>

        <div class="pgr-sec">받은 호출</div>
        <div class="pgr-list">
          ${list.length ? list.map(m => rowHTML(m, names[m.sender_id], nums[m.sender_id])).join('')
            : `<div class="pgr-empty">아직 아무도 삐삐를 치지 않았어요.<br><span>번호를 친구에게 알려주세요.</span></div>`}
        </div>
        ${sent.length ? `
        <div class="pgr-sec">보낸 호출 <span class="pgr-sec-sub">기록만 남아요 — 다시 들을 순 없어요</span></div>
        <div class="pgr-list dim">
          ${sent.map(m => sentRowHTML(m, names[m.box_owner], nums[m.box_owner])).join('')}
        </div>` : ''}
        <div class="pgr-note">삐삐엔 읽음 표시가 없어요. 들었는지는 나만 압니다.</div>
      </div>`;

    host.querySelectorAll('[data-a]').forEach(b => b.onclick = () => act(b.dataset.a, host));
    bindDial(host);
    startAuto(host);   // 실시간이 끊겨도 스스로 갱신되게
    host.querySelectorAll('[data-msg]').forEach(el => el.onclick = () => openMsg(el.dataset.msg, list, names, host));
    // 실시간·복귀·주기 갱신은 전부 이 경로로 — 스크롤 위치와 열린 상태를 지킨다
    window.GALLA_pagerRefresh = () => refresh(host);
    window.GALLA_pagerUnread = unread;
    document.dispatchEvent(new CustomEvent('galla:pager-unread', { detail: unread }));
  }

  /* 보낸 호출 — 재생 버튼 없음(주워담을 수 없는 감성 유지), 무엇을 언제 보냈는지만 */
  function sentRowHTML(m, name, num) {
    const t = new Date(m.created_at);
    const when = `${t.getMonth() + 1}/${t.getDate()} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
    const what = m.kind === 'code' ? esc(m.code)
      : m.code ? `음성 ${m.dur || 0}초 + ${esc(m.code)}` : `음성 ${m.dur || 0}초`;
    return `
      <div class="pgr-row sentrow">
        <span class="pgr-row-ic sent">발신</span>
        <span class="pgr-row-mid">
          <b>${what}</b>
          <span>→ ${num ? esc(num) + ' · ' : ''}${esc(name || '누군가')}</span>
        </span>
        <span class="pgr-row-t">${when}</span>
      </div>`;
  }
  function rowHTML(m, name, senderNum) {
    const t = new Date(m.created_at);
    const when = `${t.getMonth() + 1}/${t.getDate()} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
    const isNew = !m.listened_at;
    // 3케이스: 숫자만 / 음성만 / 음성+숫자
    const isMix = m.kind === 'voice' && m.code;
    const ic = m.kind === 'code' ? '숫자' : isMix ? '음+숫' : '음성';
    const main = m.kind === 'code'
      ? esc(m.code) + (codeMeaning(m.code) ? ` <i>${esc(codeMeaning(m.code))}</i>` : '')
      : isMix
        ? `▶ ${m.dur || 0}초 · ${esc(m.code)}` + (codeMeaning(m.code) ? ` <i>${esc(codeMeaning(m.code))}</i>` : '')
        : `▶ ${m.dur || 0}초 음성`;
    // 그 시절 감성: 발신 '삐삐 번호'가 먼저, 닉네임은 옆에(실용)
    const who = senderNum ? `${esc(senderNum)} · ${esc(name || '익명')}` : esc(name || '누군가');
    return `
      <button type="button" class="pgr-row${isNew ? ' new' : ''}${isMix ? ' mix' : ''}" data-msg="${m.id}">
        <span class="pgr-row-ic${m.kind === 'code' ? ' code' : ''}${isMix ? ' mix' : ''}">${ic}</span>
        <span class="pgr-row-mid">
          <b>${main}</b>
          <span>${who}</span>
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
      if (m.code) toast(`동봉된 암호: ${m.code}${codeMeaning(m.code) ? ' — ' + codeMeaning(m.code) : ''}`);
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
      const d = (inp.value || '').replace(/[^0-9]/g, '');
      if (d.length < DIAL_MAX) {
        hint.textContent = `뒤 ${DIAL_MAX}자리를 끝까지 입력해주세요`;
        hint.className = 'pgr-dial-hint bad';
        return;
      }
      const formatted = d.length === 7
        ? `012-${d.slice(0, 3)}-${d.slice(3)}`        // 012-XXX-XXXX (현재)
        : `012-${d.slice(0, 4)}-${d.slice(4)}`;       // 012-XXXX-XXXX (8자리 시대)
      hint.textContent = '연결 중…';
      const { data } = await sb().rpc('pager_dial', { p_number: formatted });
      if (!data?.ok) {
        hint.textContent = '없는 번호예요 — 다시 확인해주세요';
        hint.className = 'pgr-dial-hint bad';
        beep('tone'); return;
      }
      hint.textContent = '번호만 알면 모르는 사람에게도 칠 수 있어요';
      hint.className = 'pgr-dial-hint';
      inp.value = '';
      host.querySelector('[data-a="dial"]').disabled = true;
      leaveTo(data.user_id, data.nickname);
      return;
    }
    if (a === 'pickfriend') { pickFriend(host); return; }
    if (a === 'pick') { pickNumber(host); return; }
    if (a === 'guide') { openGuide(); return; }
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

  /* 다이얼 입력 — 012는 화면에 고정(타이핑 대상 아님), 뒤 7자리만 받는다.
     8자리 시대가 오면 allow8이 켜지고 한 자리 더 허용된다(다이얼은 양쪽 호환). */
  let DIAL_MAX = 7;
  function bindDial(host) {
    const inp = host.querySelector('#pgr-dial-in');
    const hint = host.querySelector('#pgr-dial-hint');
    if (!inp) return;
    // 현재 시대(7자리/8자리) 확인 — 실패해도 기본 7
    sb().from('app_settings').select('v').eq('k', 'pager').maybeSingle()
      .then(({ data }) => { if (data?.v && data.v.allow7 === false) DIAL_MAX = 8; })
      .catch(() => {});

    const fmt = d => d.length > 3 ? `${d.slice(0, 3)}-${d.slice(3)}` : d;
    inp.addEventListener('input', () => {
      let d = inp.value.replace(/[^0-9]/g, '');
      if (d.length > DIAL_MAX) {
        d = d.slice(0, DIAL_MAX);
        // "7자리 넘어가면 알람" — 조용히 자르지 않고 이유를 말한다
        hint.textContent = `삐삐 번호는 012 뒤 ${DIAL_MAX}자리예요`;
        hint.className = 'pgr-dial-hint bad';
        try { navigator.vibrate?.(40); } catch (_) {}
        beep('tone');
        clearTimeout(inp._warnT);
        inp._warnT = setTimeout(() => {
          hint.textContent = '번호만 알면 모르는 사람에게도 칠 수 있어요';
          hint.className = 'pgr-dial-hint';
        }, 2200);
      } else if (hint.classList.contains('bad')) {
        hint.textContent = '번호만 알면 모르는 사람에게도 칠 수 있어요';
        hint.className = 'pgr-dial-hint';
      }
      inp.value = fmt(d);
      host.querySelector('[data-a="dial"]').disabled = d.length < DIAL_MAX;
    });
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); host.querySelector('[data-a="dial"]')?.click(); }
    });
    host.querySelector('[data-a="dial"]').disabled = true;
  }

  /* 📱 번호 선택 개통 — 핸드폰 개통처럼. 가용 확인은 즉석, 최종 검증은 서버(경합 방어) */
  const fmt7 = d => d.length > 3 ? `${d.slice(0, 3)}-${d.slice(3)}` : d;
  async function pickNumber(host) {
    // 추천: 삐삐 암호가 들어간 번호 — 감성 + 재미
    const seeds = ['486', '1004', '8282', '7942', '0404'];
    const sug = [];
    for (const c of seeds.sort(() => Math.random() - .5).slice(0, 3)) {
      const rest = String(Math.floor(Math.random() * Math.pow(10, 7 - c.length))).padStart(7 - c.length, '0');
      sug.push(Math.random() < .5 ? c + rest : rest + c);
    }
    const el = document.createElement('div');
    el.id = 'pager-book';
    el.innerHTML = `
      <div class="pgr-book-body">
        <div class="pgr-book-head"><b>📱 번호 선택 개통</b><span>012- 뒤 7자리를 정하세요 (뒷자리 4개)</span></div>
        <div class="pgr-pick-wrap">
          <div class="pgr-pick-row">
            <span class="pgr-pick-prefix">012-</span>
            <input id="pgr-pick-in" inputmode="numeric" maxlength="8" placeholder="000-0000" autocomplete="off">
          </div>
          <div class="pgr-pick-stat" id="pgr-pick-stat">숫자 7자리를 입력하세요</div>
          <div class="pgr-pick-sug">
            ${sug.map(d => `<button type="button" data-sug="${d}">012-${fmt7(d)}</button>`).join('')}
          </div>
          <button type="button" class="pgr-pick-go" id="pgr-pick-go" disabled>이 번호로 개통</button>
        </div>
        <button type="button" class="pgr-call-x" data-b="close">닫기</button>
      </div>`;
    document.body.appendChild(el);
    void el.getBoundingClientRect();
    el.classList.add('on');
    const close = () => { el.classList.remove('on'); setTimeout(() => el.remove(), 250); };
    const inp = el.querySelector('#pgr-pick-in');
    const stat = el.querySelector('#pgr-pick-stat');
    const go = el.querySelector('#pgr-pick-go');
    let checkT = null, okDigits = null;
    const check = async () => {
      const d = inp.value.replace(/[^0-9]/g, '');
      okDigits = null; go.disabled = true;
      if (d.length < 7) { stat.textContent = '숫자 7자리를 입력하세요'; stat.className = 'pgr-pick-stat'; return; }
      const n = `012-${d.slice(0, 3)}-${d.slice(3, 7)}`;
      stat.textContent = '확인 중…';
      const { data } = await sb().from('pager_boxes').select('user_id').eq('number', n).maybeSingle();
      if (data) { stat.textContent = `${n} 은 이미 개통된 번호예요`; stat.className = 'pgr-pick-stat bad'; }
      else { stat.textContent = `${n} 사용 가능!`; stat.className = 'pgr-pick-stat good'; okDigits = d.slice(0, 7); go.disabled = false; }
    };
    inp.addEventListener('input', () => {
      const d = inp.value.replace(/[^0-9]/g, '').slice(0, 7);
      inp.value = fmt7(d);
      clearTimeout(checkT); checkT = setTimeout(check, 350);
    });
    el.onclick = async e => {
      if (e.target === el || e.target.closest('[data-b="close"]')) return close();
      const sg = e.target.closest('[data-sug]');
      if (sg) { inp.value = fmt7(sg.dataset.sug); check(); return; }
      if (e.target.closest('#pgr-pick-go') && okDigits) {
        go.disabled = true; go.textContent = '개통 중…';
        const { data } = await sb().rpc('pager_pick_number', { p_digits: okDigits });
        if (!data?.ok) {
          stat.textContent = data?.reason === 'taken' ? '한발 늦었어요 — 방금 다른 분이 개통했어요' : '개통하지 못했어요';
          stat.className = 'pgr-pick-stat bad';
          go.textContent = '이 번호로 개통'; return;
        }
        beep('connect');
        try { navigator.vibrate?.([80, 60, 200]); } catch (_) {}
        toast(`개통을 축하합니다 — ${data.number}`);
        BOX = BOX || {};
        BOX.number = data.number;
        close();
        mount(host);
      }
    };
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
      // 그 시절 문법: "삐 소리 후 녹음… 우물정자(#)를 누르시면 건너뜁니다"
      stage.innerHTML = `<div class="pgr-dial">인사말 재생 중…</div>
        <button type="button" class="pgr-skip" id="pgr-skip"># 건너뛰기</button>`;
      await new Promise(res => {
        const au = new Audio(box.greeting_url);
        let done = false;
        const fin = () => { if (done) return; done = true; try { au.pause(); } catch (_) {} res(); };
        au.onended = au.onerror = fin;
        au.play().catch(fin);
        stage.querySelector('#pgr-skip').onclick = () => { beep('tone'); fin(); };
        // 키보드 #(shift+3)로도 — 진짜 우물정자
        const onKey = e => { if (e.key === '#') { beep('tone'); fin(); document.removeEventListener('keydown', onKey); } };
        document.addEventListener('keydown', onKey);
        setTimeout(fin, 12000);
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
    if (REC && REC.state !== 'inactive') {
      REC._cancel = cancel;
      // 아직 한 조각도 안 들어온 기기 대비 — 멈추기 직전에 데이터를 달라고 한다
      try { if (!CHUNKS.length) REC.requestData(); } catch (_) {}
      try { REC.stop(); } catch (_) {}
    }
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
  /* 안드로이드에서 '녹음 시작 안 됨'의 정체는 대부분 조용한 예외다:
     ① 인앱 웹뷰(카톡·인스타·네이버)엔 MediaRecorder가 아예 없다
     ② isTypeSupported/new MediaRecorder/start()가 try 밖에서 던지면 아무 일도 안 일어난다
     ③ 일부 안드로이드는 timeslice 없이는 dataavailable을 안 흘려 0바이트로 끝난다
     → 전부 감싸고, 실패는 반드시 화면에 남긴다. */
  /* 권한·환경 문제는 문구만 던지지 않는다 — 바로 고칠 수 있는 시트를 연다 */
  async function openMicHelp(reason, extra) {
    if (!window.GALLA_micHelp) {
      const v = ([...document.scripts].map(s => s.src).find(u => /[?&]v=/.test(u)) || '').match(/[?&]v=(\d+)/);
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = '/js/mic-help.js' + (v ? '?v=' + v[1] : '');
        s.onload = res; s.onerror = rej; document.head.appendChild(s);
      }).catch(() => {});
    }
    window.GALLA_micHelp?.({ reason, ...(extra || {}) });
  }
  function recErrMsg(e) {
    const n = (e && e.name) || String(e);
    if (n === 'NoMediaRecorder')
      return '이 브라우저에선 녹음이 막혀 있어요 — 카톡·인스타 안의 브라우저라면 [크롬으로 열기]를 눌러주세요';
    if (n === 'NoMediaDevices')
      return '이 환경에선 마이크를 쓸 수 없어요 — 크롬·사파리에서 galla.im을 열어주세요';
    if (n === 'NotAllowedError' || n === 'PermissionDeniedError')
      return '마이크 권한이 거부돼 있어요 — 브라우저 설정 → 사이트 설정 → 마이크에서 galla.im을 허용해주세요';
    if (n === 'NotFoundError') return '마이크를 찾을 수 없어요';
    if (n === 'NotReadableError') return '다른 앱이 마이크를 쓰고 있어요 — 닫고 다시 시도해주세요';
    if (n === 'SecurityError') return '보안 정책(HTTPS)이 아니라 녹음할 수 없어요';
    return '녹음을 시작하지 못했어요 (' + n + ')';
  }
  function pickRecMime() {
    if (typeof MediaRecorder === 'undefined') return null;
    // mp4 우선 — webm은 길이 정보가 없어 재생이 무음이 되거나(안드로이드)
    // 아예 재생 불가(iOS)인 기기가 있다
    const cands = ['audio/mp4', 'audio/mp4;codecs=mp4a.40.2', 'audio/webm;codecs=opus',
                   'audio/webm', 'audio/ogg;codecs=opus', 'audio/aac', 'audio/3gpp'];
    for (const m of cands) { try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (_) {} }
    return '';   // 빈 문자열 = 브라우저 기본값으로 시도
  }
  /* 🎯 '무조건 되게' — 채팅방 음성 메시지(검증된 경로)와 똑같이 요청하고,
     실패하면 조건을 하나씩 낮추며 스스로 재시도한다.
     ⚠️ 삐삐는 녹음 직전에 인사말·비프를 재생한다 — 안드로이드는 재생 중인
        오디오가 장치를 붙들고 있으면 마이크 열기가 실패(NotReadableError)하므로
        무조건 먼저 소리를 정리하고 시작한다. */
  function releaseAudio() {
    try { PLAYING?.pause(); PLAYING = null; } catch (_) {}
    document.querySelectorAll('audio').forEach(a => { try { a.pause(); } catch (_) {} });
    try { if (AC && AC.state === 'running') AC.suspend(); } catch (_) {}
  }
  /* 🎤 마이크 재사용 — 한 번 열어둔 스트림을 잠깐 붙들었다가 반납한다.
     연속으로 녹음할 때 권한 요청·장치 열기를 반복하지 않아 특히 아이폰에서
     "매번 묻는" 느낌이 줄어든다. 다만 마이크 표시등이 오래 켜져 있으면
     불안하므로 15초만 유지하고, 화면을 벗어나면 즉시 반납한다. */
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
  async function getMicStream() {
    const md = navigator.mediaDevices;
    if (!md?.getUserMedia) { const e = new Error('nomedia'); e.name = 'NoMediaDevices'; throw e; }
    releaseAudio();
    const live = micLive();
    if (live) { clearTimeout(micCache().timer); return live; }
    // ① 채팅방과 동일한 가장 단순한 요청(이게 실기기에서 검증된 조합)
    // ② 잠깐 쉬고 재시도(장치 해제가 늦는 기기)
    // ③ 기본 마이크를 명시적으로 지정
    const attempts = [
      () => md.getUserMedia({ audio: true }),
      async () => { await new Promise(r => setTimeout(r, 400)); return md.getUserMedia({ audio: true }); },
      () => md.getUserMedia({ audio: { deviceId: 'default' } }),
    ];
    let last;
    for (const attempt of attempts) {
      try { const s = await attempt(); micCache().stream = s; return s; }
      catch (e) {
        last = e;
        console.warn('[pager:mic] 재시도', e.name);
        if (e.name === 'NotAllowedError' || e.name === 'SecurityError') break;   // 권한 거부는 재시도 무의미
      }
    }
    throw last;
  }
  async function startRec(stage) {
    const btn = stage.querySelector('[data-r="start"]');
    const rt = stage.querySelector('#pgr-rt');
    let stream = null;
    try {
      stage.querySelector('.pgr-err')?.remove();
      if (typeof MediaRecorder === 'undefined') { const e = new Error('norec'); e.name = 'NoMediaRecorder'; throw e; }
      if (btn) { btn.disabled = true; btn.textContent = '마이크 준비 중…'; }
      stream = await getMicStream();
      const mime = pickRecMime();
      CHUNKS = []; BLOB = null; RECURL = null;
      const t0 = Date.now();
      REC = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      REC.ondataavailable = e => { if (e.data?.size) CHUNKS.push(e.data); };
      REC.onerror = ev => { toast(recErrMsg(ev?.error || ev)); stopRec(true); };
      REC.onstop = () => {
        micRelease();        // 잠깐 붙들었다가 반납 — 연속으로 남길 때 다시 안 묻는다
        clearInterval(RECT);
        clearInterval(REC._lvl);
        try { REC._ac?.close(); } catch (_) {}
        const peak = REC._peak || 0;
        const cancel = REC._cancel; const dur = Math.round((Date.now() - t0) / 1000);
        REC = null;
        if (btn) btn.textContent = '● 녹음 시작';
        if (cancel) return;
        BLOB = new Blob(CHUNKS, { type: mime || 'audio/webm' });
        if (!BLOB.size) { BLOB = null; if (rt) rt.textContent = ''; return toast('소리가 담기지 않았어요 — 다시 시도해주세요'); }
        // peak 3 미만 = 사실상 무음(정상 발화는 보통 20 이상)
        if (peak < 3) {
          BLOB = null; if (rt) rt.textContent = '';
          return openMicHelp('', { silent: true });
        }
        BLOB._dur = Math.max(1, dur);
        RECURL = URL.createObjectURL(BLOB);
        if (rt) rt.textContent = `${BLOB._dur}초 녹음됨`;
        stage.querySelector('#pgr-after').hidden = false;
      };
      // 채팅방 음성과 동일하게 start() — timeslice는 일부 기기에서 되레 첫 청크를 잘랐다.
      // 대신 데이터가 하나도 안 쌓이면 stop 직전에 requestData로 받아낸다.
      // 입력 레벨 감시 — 권한이 나도 블루투스 라우팅·앱 점유로 무음이 들어올 수 있다.
      // 바이트 수는 정상인데 소리만 없는 이 경우가 사용자에겐 가장 답답하다.
      try {
        const ac = new (window.AudioContext || window.webkitAudioContext)();
        const an = ac.createAnalyser(); an.fftSize = 512;
        ac.createMediaStreamSource(stream).connect(an);
        const buf = new Uint8Array(an.fftSize);
        REC._peak = 0;
        REC._lvl = setInterval(() => {
          an.getByteTimeDomainData(buf);
          for (let i = 0; i < buf.length; i++) {
            const d = Math.abs(buf[i] - 128);
            if (d > REC._peak) REC._peak = d;
          }
        }, 120);
        REC._ac = ac;
      } catch (_) {}
      REC.start();
      if (btn) { btn.disabled = false; btn.textContent = '■ 그만 (녹음 중)'; }
      RECT = setInterval(() => {
        const s = Math.floor((Date.now() - t0) / 1000);
        if (rt) rt.textContent = `${s}초…`;
        if (s >= 60) stopRec(false);
      }, 250);
    } catch (e) {
      console.error('[pager:rec]', e);
      // 안내로 끝내지 않고 '해결 경로'를 띄운다 — 설정에서 찾아 헤매지 않게
      openMicHelp(recErrMsg(e));
      micRelease(true);
      REC = null;
      if (btn) { btn.disabled = false; btn.textContent = '● 녹음 시작'; }
      if (rt) rt.textContent = '';
      // 토스트는 2.4초 뒤 사라진다 — 사유는 모달 안에 남겨둔다
      let box = stage.querySelector('.pgr-err');
      if (!box) { box = document.createElement('div'); box.className = 'pgr-err'; stage.appendChild(box); }
      box.textContent = '⚠ ' + recErrMsg(e);
      toast(recErrMsg(e));
    }
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
    // 기기가 고른 포맷을 그대로 따른다(안드로이드는 webm이 아닐 수 있다)
    const ext = /mp4|m4a/.test(type) ? 'm4a' : /ogg/.test(type) ? 'ogg'
      : /aac/.test(type) ? 'aac' : /3gp/.test(type) ? '3gp'
      : /mpeg|mp3/.test(type) ? 'mp3' : 'webm';
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

  window.GALLA_PAGER = { mount, refresh, beep, popup, leaveTo, CODES, CODEBOOK, codeMeaning, openCodebook, openGuide };
})();
