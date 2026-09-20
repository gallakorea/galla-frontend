/* 🔊 GALLA 수신음 엔진 — WebAudio 합성(에셋 0개·무료·오프라인).
   갈라 톤: 프리미엄 다크 + 인디고 + 배틀 에너지. 싸구려 비프 금지 —
   로우패스로 따뜻하게, 살짝 디튠 레이어로 두툼하게, 상승 모티프로 '붙는다'는 긴장.
   window.GALLA_SFX.{ding, pop, ringInStart/Stop, ringOutStart/Stop, unlock} */
(function () {
  if (window.GALLA_SFX) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) { window.GALLA_SFX = { ding(){}, pop(){}, ringInStart(){}, ringInStop(){}, ringOutStart(){}, ringOutStop(){}, unlock(){}, suspendForCall(){}, resumeAfterCall(){} }; return; }
  let ctx = null, master = null, _callHold = false;
  function ac() {
    if (!ctx) {
      try { ctx = new AC(); } catch (_) { return null; }
      master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    }
    // 통화 중(_callHold)엔 자동 resume 금지 — WebAudio가 iOS 오디오 세션을 도로 뺏어
    //   네이티브 WebRTC 통화 소리를 눌러버리는(무음+링백 잔류) 것을 막는다.
    if (ctx.state === 'suspended' && !_callHold) { try { ctx.resume(); } catch (_) {} }
    return ctx;
  }
  // ⚠️ WebAudio suspend 폐기 — iOS는 suspend된 AudioContext를 사용자 제스처 없이 resume 못 해
  //    링백/벨이 영영 무음이 됐다(사장님 "링백 안울려"). 실제 통화 소리는 네이티브(audioSessionDidActivate)가
  //    처리하므로 WebAudio를 재울 필요가 없다. suspend는 no-op, resume은 항상 살려둔다(안전장치).
  function suspendForCall() { _callHold = false; }
  function resumeAfterCall() { _callHold = false; try { ctx && ctx.state === 'suspended' && ctx.resume(); } catch (_) {} }
  // ⚠️ once:false — 매 제스처마다 resume 시도. iOS는 백그라운드/이전 suspend로 잠든 컨텍스트를
  //    사용자 제스처 안에서만 깨울 수 있어(once:true면 앱 최초 1회만 → 이후 잠들면 링백/벨 영영 무음).
  const unlock = () => { try { ac(); } catch (_) {} };
  ['pointerdown', 'touchstart', 'keydown'].forEach(e =>
    window.addEventListener(e, unlock, { passive: true, capture: true }));

  /* 한 목소리: (디튠 2겹) 오실 → 로우패스 → 게인. 따뜻하고 두툼한 프리미엄 톤 */
  function voice(freq, t0, dur, opt) {
    const c = ac(); if (!c) return;
    opt = opt || {};
    const t = c.currentTime + (t0 || 0);
    const gain = opt.gain == null ? 0.16 : opt.gain;
    const type = opt.type || 'triangle';
    const cutoff = opt.cutoff || 2600;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(cutoff * 1.6, 9000), t);
    lp.frequency.exponentialRampToValueAtTime(cutoff, t + Math.min(0.18, dur));  // 밝게 시작→따뜻하게
    const g = c.createGain(); g.connect(lp); lp.connect(master);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + (opt.attack || 0.012));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    // 두 겹(원음 + 살짝 디튠)으로 두툼하게
    [0, opt.detune || 7].forEach((d, i) => {
      const o = c.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = d;
      const og = c.createGain(); og.gain.value = i ? 0.5 : 1; o.connect(og); og.connect(g);
      try { o.start(t); o.stop(t + dur + 0.06); } catch (_) {}
    });
  }
  /* 아주 짧은 서브 thump — 무게감(프리미엄) */
  function sub(t0, freq, gain) {
    const c = ac(); if (!c) return;
    const t = c.currentTime + (t0 || 0);
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(freq || 160, t); o.frequency.exponentialRampToValueAtTime((freq || 160) * 0.6, t + 0.12);
    o.connect(g); g.connect(master);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain || 0.12, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    try { o.start(t); o.stop(t + 0.22); } catch (_) {}
  }

  // 음정(인디고 감성: E마이너/장6도 상승) — 밝지만 차분
  const N = { E5: 659.25, G5: 783.99, B5: 987.77, E6: 1318.5, A5: 880, D6: 1174.7, Gs5: 830.6 };

  /* 메시지·알림 딩 — 짧고 세련된 상승 2음(E5→B5), 로우패스로 따뜻하게 */
  function ding() { voice(N.E5, 0, 0.12, { gain: 0.12, cutoff: 2400 }); voice(N.B5, 0.075, 0.2, { gain: 0.11, cutoff: 3000 }); }
  /* 보냄 팝 — 아주 짧은 상행 */
  function pop() { voice(N.A5, 0, 0.06, { gain: 0.08, cutoff: 2600 }); }

  /* 수신 벨소리(루프) — 갈라 시그니처: 서브thump + E5→G5→B5 상승 모티프('링에 등장').
     2.2초 주기 반복. 배틀 에너지지만 과하지 않게. */
  /* 🔕 즉시 침묵 — 타이머만 끄면 '이미 예약된' 오실레이터가 끝까지 울린다.
     받기를 눌렀는데도 벨이 계속 나던 진짜 이유 중 하나(26.9.21 사장님 「폰의 소리도 옛날거였음」).
     그래서 벨을 끌 땐 ①타이머 정리 ②마스터를 즉시 0으로 떨어뜨려 예약분까지 죽이고
     ③_silent 로 늦게 들어온 콜백까지 막은 뒤, 잠시 후 음량을 되살린다(다음 소리는 정상). */
  let _silent = false, _unmuteT = null;
  function unmuteNow() {
    clearTimeout(_unmuteT); _silent = false;
    try { const c = ac(); if (c && master) { master.gain.cancelScheduledValues(c.currentTime); master.gain.setValueAtTime(0.9, c.currentTime); } } catch (_) {}
  }
  function hardMute() {
    _silent = true;
    try {
      const c = ctx; if (!c || !master) return;
      const t = c.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(0.0001, t);
    } catch (_) {}
    clearTimeout(_unmuteT);
    _unmuteT = setTimeout(() => {
      _silent = false;
      try { if (master && ctx) master.gain.setValueAtTime(0.9, ctx.currentTime); } catch (_) {}
    }, 900);
  }
  let ringInT = null;
  function ringInMotif() {
    sub(0, 150, 0.11);
    voice(N.E5, 0.0, 0.16, { gain: 0.16, cutoff: 2200 });
    voice(N.G5, 0.15, 0.16, { gain: 0.16, cutoff: 2500 });
    voice(N.B5, 0.30, 0.34, { gain: 0.17, cutoff: 3200 });
    voice(N.E6, 0.30, 0.34, { gain: 0.06, cutoff: 4000, detune: -6 });  // 옥타브 배음 반짝
  }
  function ringInStart() { ringInStop(); unmuteNow(); try { ringInMotif(); } catch (_) {} ringInT = setInterval(() => { if (_silent) return; try { ringInMotif(); } catch (_) {} }, 2200); }
  function ringInStop() { if (ringInT) { clearInterval(ringInT); ringInT = null; } hardMute(); }

  /* 발신 링백 — 차분한 인디고 2음 펄스(연결 대기), 3초 주기 */
  let ringOutT = null;
  function ringOutMotif() { voice(N.E5, 0, 0.5, { gain: 0.08, cutoff: 1600 }); voice(N.B5, 0, 0.5, { gain: 0.05, cutoff: 2000 }); }
  function ringOutStart() { ringOutStop(); unmuteNow(); try { ringOutMotif(); } catch (_) {} ringOutT = setInterval(() => { if (_silent) return; try { ringOutMotif(); } catch (_) {} }, 3000); }
  function ringOutStop() { if (ringOutT) { clearInterval(ringOutT); ringOutT = null; } hardMute(); }

  // 🔬 진단 — 링백/벨 무음 원인 추적용. ctx 상태(running/suspended/interrupted/closed/none)를 노출.
  function debugState() { try { return (ctx ? ctx.state : 'none') + (_callHold ? '/hold' : ''); } catch (_) { return 'err'; } }
  window.GALLA_SFX = { ding, pop, ringInStart, ringInStop, ringOutStart, ringOutStop, unlock, suspendForCall, resumeAfterCall, debugState, hardMute };
})();
