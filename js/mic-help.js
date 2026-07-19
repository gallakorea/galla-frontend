/* =========================================================
   🎙 마이크 권한 해결 시트 — "설정에서 찾으세요"로 끝내지 않는다
   ---------------------------------------------------------
   브라우저는 보안상 설정 화면을 직접 열어주는 API가 없다(있으면 악성 사이트가
   권한 화면으로 유인한다). 그래서 '진짜 되는 것'만 버튼으로 만들고,
   나머지는 기기별로 정확히 어디를 눌러야 하는지 그림으로 짚어준다.

     ① 인앱 브라우저(카톡·인스타·네이버) → 크롬으로 실제 전환 (intent://)
     ② 아직 안 물어본 상태 → 그 자리에서 권한 재요청
     ③ 이미 거부됨 → 주소창 자물쇠(ⓘ) 위치를 그림으로 + 새로고침 버튼
     ④ 어느 경우든 → 앱으로 설치하면 이 고생이 한 번으로 끝난다는 안내

   window.GALLA_micHelp({ reason }) 로 연다. 다른 페이지에서도 쓸 수 있게
   CSS를 스스로 주입하고 외부 의존이 없다.
   ========================================================= */
(function () {
  const UA = navigator.userAgent;
  const isAndroid = /Android/.test(UA);
  const isIOS = /iP(hone|ad|od)/.test(UA);
  /* 인앱 웹뷰 판별 — 카톡/인스타/페북/네이버/다음/라인/밴드.
     이들 대부분은 MediaRecorder나 마이크가 아예 막혀 있어 '설정'으로도 못 고친다.
     유일한 해법이 외부 브라우저 전환이라, 이 판별이 안내의 갈림길이다. */
  const isInApp = /KAKAOTALK|Instagram|FB_IAB|FBAN|FBAV|NAVER|DaumApps|Line\/|BAND|everytimeApp|inapp|snapchat/i.test(UA)
    || (isAndroid && /; wv\)/.test(UA));
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  async function permState() {
    try { return (await navigator.permissions.query({ name: 'microphone' })).state; }
    catch (_) { return 'unknown'; }
  }

  function css() {
    if (document.getElementById('michelp-css')) return;
    const s = document.createElement('style');
    s.id = 'michelp-css';
    s.textContent = `
      #mic-help{position:fixed;inset:0;z-index:2000001;display:flex;align-items:flex-end;justify-content:center;
        background:rgba(4,5,9,.82);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
        opacity:0;transition:opacity .22s ease}
      #mic-help.on{opacity:1}
      .mh-body{width:100%;max-width:480px;max-height:88vh;overflow-y:auto;background:#12141a;
        border-radius:22px 22px 0 0;border-top:1px solid rgba(255,255,255,.09);
        padding:20px 18px calc(22px + env(safe-area-inset-bottom,0px));
        transform:translateY(24px);transition:transform .3s cubic-bezier(.2,.9,.3,1.1)}
      #mic-help.on .mh-body{transform:translateY(0)}
      .mh-h{display:flex;align-items:center;gap:10px;margin-bottom:6px}
      .mh-h b{font-size:17px;font-weight:900;color:#fff}
      .mh-x{margin-left:auto;background:none;border:none;color:#8a8f9a;font-size:22px;line-height:1;cursor:pointer;padding:2px 4px}
      .mh-sub{font-size:13px;color:#a4abb8;line-height:1.6;margin-bottom:14px}
      .mh-btn{width:100%;border:none;border-radius:14px;padding:14px;font-size:14.5px;font-weight:900;cursor:pointer;
        background:linear-gradient(135deg,#6a7bff,#3a5bff);color:#fff;margin-bottom:9px}
      .mh-btn.ghost{background:rgba(255,255,255,.07);color:#dfe3ec;border:1px solid rgba(255,255,255,.1)}
      .mh-steps{background:#0e1015;border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:12px;margin:4px 0 12px}
      .mh-step{display:flex;gap:11px;align-items:flex-start;padding:7px 2px}
      .mh-step .n{flex:0 0 auto;width:22px;height:22px;border-radius:50%;background:#3a5bff;color:#fff;
        font-size:12px;font-weight:900;display:flex;align-items:center;justify-content:center;margin-top:1px}
      .mh-step .t{font-size:13.5px;color:#dfe3ec;line-height:1.55}
      .mh-step .t b{color:#fff}
      /* 주소창 자물쇠를 짚어주는 그림 — 말보다 이게 빠르다 */
      .mh-art{background:#0e1015;border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:14px;margin-bottom:12px}
      .mh-bar{display:flex;align-items:center;gap:8px;background:#22252e;border-radius:999px;padding:9px 12px}
      .mh-lock{flex:0 0 auto;width:26px;height:26px;border-radius:50%;background:#3a5bff;color:#fff;
        display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;
        animation:mhPulse 1.5s ease-in-out infinite}
      .mh-url{font-size:12.5px;color:#9aa1af;font-family:ui-monospace,monospace}
      .mh-point{text-align:center;font-size:11.5px;color:#7f8695;margin-top:8px}
      @keyframes mhPulse{0%,100%{transform:scale(1);box-shadow:0 0 0 0 rgba(58,91,255,.55)}
        50%{transform:scale(1.14);box-shadow:0 0 0 9px rgba(58,91,255,0)}}
      /* 앱 설치 유인 카드 */
      .mh-app{margin-top:6px;padding:14px;border-radius:16px;
        background:linear-gradient(135deg,rgba(106,123,255,.16),rgba(58,91,255,.06));
        border:1px solid rgba(106,123,255,.3)}
      .mh-app h5{margin:0 0 6px;font-size:14.5px;font-weight:900;color:#fff}
      .mh-app ul{margin:0 0 12px;padding-left:17px}
      .mh-app li{font-size:12.5px;color:#c3c9d6;line-height:1.75}
      .mh-app li b{color:#fff}
      /* 설치형(PWA)용 — 홈 화면 아이콘 길게 누르기 그림 */
      .mh-home{display:flex;align-items:center;gap:14px;justify-content:center;padding:6px 0 2px}
      .mh-appicon{position:relative;width:56px;height:56px;border-radius:15px;flex:0 0 auto;
        background:linear-gradient(135deg,#4a63ff,#2036c8);color:#fff;font-size:14px;font-weight:900;
        display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px rgba(58,91,255,.4)}
      .mh-press{position:absolute;inset:-6px;border-radius:20px;border:2.5px solid #7d8cff;
        animation:mhPress 1.7s ease-in-out infinite}
      .mh-bubble{background:#22252e;border:1px solid rgba(255,255,255,.12);border-radius:11px;
        padding:9px 13px;font-size:13px;color:#e7ebf3;font-weight:800}
      @keyframes mhPress{0%,100%{transform:scale(1);opacity:.25}50%{transform:scale(1.13);opacity:1}}
      /* 권한 감시 배너 */
      .mh-watch{display:flex;align-items:center;justify-content:center;gap:7px;
        background:rgba(58,91,255,.12);border:1px solid rgba(106,123,255,.32);border-radius:12px;
        padding:11px;margin-bottom:9px;font-size:12.5px;font-weight:800;color:#b9c3ff}
      .mh-watch.ok{background:rgba(47,208,122,.14);border-color:rgba(47,208,122,.4);color:#7ef0ae}
      @media (prefers-reduced-motion:reduce){.mh-lock,.mh-press{animation:none}#mic-help,.mh-body{transition:none}}
    `;
    document.head.appendChild(s);
  }

  function close() {
    const el = document.getElementById('mic-help');
    if (!el) return;
    el.classList.remove('on');
    setTimeout(() => el.remove(), 240);
  }

  /* 인앱 브라우저 → 크롬으로 실제 전환. 안드로이드는 intent://가 진짜로 동작한다.
     아이폰은 외부 브라우저 강제 전환 수단이 없어 주소 복사로 대신한다. */
  function openExternally() {
    const url = location.href;
    if (isAndroid) {
      const noScheme = url.replace(/^https?:\/\//, '');
      const t0 = Date.now();
      location.href = `intent://${noScheme}#Intent;scheme=https;package=com.android.chrome;end`;
      // 크롬이 없거나 인텐트가 막히면 아무 일도 안 일어난다 — 그때만 복사로 대체
      setTimeout(() => {
        if (document.hidden || Date.now() - t0 > 2500) return;   // 전환 성공
        try { navigator.clipboard?.writeText(url); } catch (_) {}
        alert('크롬이 열리지 않았어요.\n주소를 복사했으니 크롬 주소창에 붙여넣어 주세요.\n\n' + url);
      }, 1200);
      return true;
    }
    try {
      navigator.clipboard?.writeText(url);
      alert('주소를 복사했어요.\n사파리를 열고 주소창에 붙여넣어 주세요.');
    } catch (_) {
      alert('사파리에서 galla.im 을 열어주세요.');
    }
    return false;
  }

  function appCardHTML() {
    if (isStandalone) return '';
    const can = typeof window.GALLA_canInstall === 'function' && window.GALLA_canInstall();
    return `
      <div class="mh-app">
        <h5>📲 앱으로 설치하면 이 고생이 없어요</h5>
        <ul>
          <li><b>알림</b>을 놓치지 않아요 — 삐삐가 오면 바로</li>
          <li>주소창 없는 <b>전체 화면</b>으로 앱처럼 써요</li>
          <li>실행이 <b>훨씬 빨라요</b> (⚠ 단, 녹음은 크롬에서 해주세요)</li>
        </ul>
        <button class="mh-btn" data-mh="${can ? 'install' : 'installhow'}" type="button">
          ${can ? '홈 화면에 갈라 설치하기' : '설치 방법 보기'}
        </button>
      </div>`;
  }

  async function open(opts) {
    const reason = (opts && opts.reason) || '';
    css();
    close();
    const st = await permState();
    const el = document.createElement('div');
    el.id = 'mic-help';

    let head, sub, body;
    /* ⚠️ permissions.query는 거짓말을 한다 — 실기기에서 'denied'인데 getUserMedia가
       정상 동작하는 조합을 확인했다(채팅방 음성은 되는데 삐삐만 안 되던 사건).
       그래서 조회 결과로 '불가'를 단정하지 않는다. 언제나 '다시 시도'를 1번 버튼으로
       올리고, 설정 안내는 그 다음에 둔다 — 눌러서 되면 그게 정답이다. */
    if (isInApp) {
      head = '🎙 여기선 녹음을 못 해요';
      sub = '카톡·인스타 같은 앱 <b>안에 있는 브라우저</b>라서 마이크가 막혀 있어요. 크롬으로 열면 바로 됩니다.';
      body = `<button class="mh-btn" data-mh="chrome" type="button">${isAndroid ? '크롬으로 열기' : '주소 복사해서 사파리로 열기'}</button>
        <div class="mh-steps">
          <div class="mh-step"><span class="n">＋</span><span class="t">안 열리면 오른쪽 위 <b>⋮ (또는 ⋯)</b> → <b>다른 브라우저로 열기</b></span></div>
        </div>`;
    } else {
      head = '🎙 마이크를 켜주세요';
      sub = st === 'denied'
        ? '아래 <b>[마이크 켜고 다시 시도]</b>를 먼저 눌러보세요. 그래도 안 되면 설정에서 허용으로 바꾸면 됩니다.'
        : '아래 버튼을 누르면 권한 창이 떠요. <b>[허용]</b>을 눌러주세요 — <b>“이번만”</b>을 고르면 다음에 또 물어봅니다.';
      body = `<button class="mh-btn" data-mh="ask" type="button">마이크 켜고 다시 시도</button>
        ${st === 'denied' ? `
        <div class="mh-steps">
          <div class="mh-step"><span class="n">1</span><span class="t">${isStandalone
            ? '위 버튼이 안 되면 <b>크롬에서 열어</b> 녹음해주세요(설치한 앱은 마이크가 막힌 기기가 있어요)'
            : `주소창 왼쪽 <b>${isIOS ? 'ぁA' : '슬라이더 모양'}</b> 아이콘 탭`}</span></div>
          ${isStandalone ? '' : `
          <div class="mh-step"><span class="n">2</span><span class="t">${isIOS ? '<b>웹사이트 설정</b>' : '<b>권한</b> (또는 사이트 설정)'} → <b>마이크 → 허용</b></span></div>`}
          <div class="mh-step"><span class="n">✓</span><span class="t">허용하는 즉시 <b>여기가 자동으로 바뀝니다</b></span></div>
        </div>
        <div class="mh-watch" id="mh-watch">🔎 마이크 설정을 지켜보는 중…</div>
        ${isStandalone && isAndroid ? '<button class="mh-btn ghost" data-mh="chrome" type="button">크롬에서 열기</button>' : ''}
        <button class="mh-btn ghost" data-mh="reload" type="button">허용했어요 — 새로고침</button>` : ''}`;
    }

    el.innerHTML = `
      <div class="mh-body">
        <div class="mh-h"><b>${head}</b><button class="mh-x" data-mh="close" type="button">×</button></div>
        <div class="mh-sub">${sub}</div>
        ${reason ? `<div class="mh-sub" style="color:#ff9aa5">⚠ ${reason}</div>` : ''}
        ${body}
        ${appCardHTML()}
      </div>`;
    document.body.appendChild(el);
    void el.getBoundingClientRect();   // 강제 리플로우 — rAF는 백그라운드 탭에서 얼어붙는다
    el.classList.add('on');

    /* 사용자가 설정 화면에서 허용하는 순간을 스스로 알아챈다 —
       "돌아와서 새로고침"까지 시키면 절반은 길을 잃는다. */
    if (st === 'denied') watchPermission(el);

    el.onclick = async e => {
      const a = e.target.closest('[data-mh]')?.dataset.mh;
      if (!a) { if (e.target === el) close(); return; }
      if (a === 'close') return close();
      if (a === 'chrome') return void openExternally();
      if (a === 'reload') return location.reload();
      if (a === 'install') { close(); return void window.GALLA_promptInstall?.(); }
      if (a === 'installhow') {
        alert(isIOS
          ? '사파리 아래쪽 [공유] 버튼 → "홈 화면에 추가"를 누르면 앱처럼 설치됩니다.'
          : '브라우저 오른쪽 위 [⋮] → "앱 설치" 또는 "홈 화면에 추가"를 눌러주세요.');
        return;
      }
      if (a === 'ask') {
        const btn = e.target.closest('[data-mh="ask"]');
        if (btn) { btn.disabled = true; btn.textContent = '마이크 여는 중…'; }
        // 재생 중인 소리가 장치를 붙들고 있으면 실패한다 — 먼저 정리
        document.querySelectorAll('audio,video').forEach(m => { try { m.pause(); } catch (_) {} });
        for (const req of [
          () => navigator.mediaDevices.getUserMedia({ audio: true }),
          async () => { await new Promise(r => setTimeout(r, 400)); return navigator.mediaDevices.getUserMedia({ audio: true }); },
        ]) {
          try {
            const s = await req();
            s.getTracks().forEach(t => t.stop());
            close();
            window.dispatchEvent(new CustomEvent('galla:mic-granted'));
            return;
          } catch (err) { console.warn('[michelp] ask', err.name); }
        }
        if (btn) { btn.disabled = false; btn.textContent = '한 번 더 시도'; }
        const w = el.querySelector('#mh-watch');
        if (w) { w.textContent = '아직이에요 — 아래 안내대로 허용해주세요'; }
      }
    };
  }

  /* permissions의 change 이벤트 + 폴링 이중 감시(안드로이드는 change가 안 오기도 한다) */
  function watchPermission(el) {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      const w = el.querySelector('#mh-watch');
      if (w) { w.textContent = '✅ 마이크가 켜졌어요! 잠시 후 이어서 진행할게요'; w.classList.add('ok'); }
      clearInterval(iv);
      setTimeout(() => { close(); window.dispatchEvent(new CustomEvent('galla:mic-granted')); location.reload(); }, 1200);
    };
    const iv = setInterval(async () => {
      if (!document.getElementById('mic-help')) return clearInterval(iv);
      if (await permState() === 'granted') finish();
    }, 1500);
    navigator.permissions?.query({ name: 'microphone' })
      .then(p => { p.onchange = () => { if (p.state === 'granted') finish(); }; })
      .catch(() => {});
  }

  window.GALLA_micHelp = open;
  window.GALLA_micEnv = { isInApp, isAndroid, isIOS, isStandalone, permState };
})();
