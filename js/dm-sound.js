/* 🔊 GALLA 수신음 엔진 — WebAudio 합성(에셋 0개·무료·오프라인).
   갈라 톤: 프리미엄 다크 + 인디고 + 배틀 에너지. 싸구려 비프 금지 —
   로우패스로 따뜻하게, 살짝 디튠 레이어로 두툼하게, 상승 모티프로 '붙는다'는 긴장.
   window.GALLA_SFX.{ding, pop, ringInStart/Stop, ringOutStart/Stop, unlock} */
(function () {
  if (window.GALLA_SFX) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) { window.GALLA_SFX = { ding(){}, pop(){}, ringInStart(){}, ringInStop(){}, ringOutStart(){}, ringOutStop(){}, unlock(){} }; return; }
  let ctx = null, master = null;
  function ac() {
    if (!ctx) {
      try { ctx = new AC(); } catch (_) { return null; }
      master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (_) {} }
    return ctx;
  }
  const unlock = () => { try { ac(); } catch (_) {} };
  ['pointerdown', 'touchstart', 'keydown'].forEach(e =>
    window.addEventListener(e, unlock, { once: true, passive: true, capture: true }));

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
  let ringInT = null;
  function ringInMotif() {
    sub(0, 150, 0.11);
    voice(N.E5, 0.0, 0.16, { gain: 0.16, cutoff: 2200 });
    voice(N.G5, 0.15, 0.16, { gain: 0.16, cutoff: 2500 });
    voice(N.B5, 0.30, 0.34, { gain: 0.17, cutoff: 3200 });
    voice(N.E6, 0.30, 0.34, { gain: 0.06, cutoff: 4000, detune: -6 });  // 옥타브 배음 반짝
  }
  function ringInStart() { ringInStop(); try { ringInMotif(); } catch (_) {} ringInT = setInterval(() => { try { ringInMotif(); } catch (_) {} }, 2200); }
  function ringInStop() { if (ringInT) { clearInterval(ringInT); ringInT = null; } }

  /* 발신 링백 — 차분한 인디고 2음 펄스(연결 대기), 3초 주기 */
  let ringOutT = null;
  function ringOutMotif() { voice(N.E5, 0, 0.5, { gain: 0.08, cutoff: 1600 }); voice(N.B5, 0, 0.5, { gain: 0.05, cutoff: 2000 }); }
  function ringOutStart() { ringOutStop(); try { ringOutMotif(); } catch (_) {} ringOutT = setInterval(() => { try { ringOutMotif(); } catch (_) {} }, 3000); }
  function ringOutStop() { if (ringOutT) { clearInterval(ringOutT); ringOutT = null; } }

  window.GALLA_SFX = { ding, pop, ringInStart, ringInStop, ringOutStart, ringOutStop, unlock };
})();
