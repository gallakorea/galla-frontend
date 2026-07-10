/* ===========================================================
   battle-fx.js — 갈라 전장 FX 엔진 (캔버스 파티클 + 스크린 이펙트 + 햅틱)
   - window.BattleFX 로 노출 (일반 스크립트)
   - 모든 연출은 pointer-events 없음 / prefers-reduced-motion 존중
   API:
     BattleFX.burstAt(el|{x,y}, kind)   kind: 'pro'|'con'|'attack'|'defend'|'support'|'ko'|'spawn'
     BattleFX.shockwave(el|{x,y}, color)
     BattleFX.confetti(count?)
     BattleFX.vignette(kind)            'danger' | 'heal'
     BattleFX.flash(color, ms?)
     BattleFX.banner(text, kind)        kind: 'warn'|'cheer'|'info'
     BattleFX.haptic(name)              'tap'|'attack'|'ko'|'heal'|'warn'|'cheer'
=========================================================== */
(function () {
  const REDUCED = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  /* ---------- 캔버스 ---------- */
  let canvas = null, ctx = null, particles = [], rafId = null;
  function ensureCanvas() {
    if (canvas) return;
    canvas = document.createElement("canvas");
    canvas.id = "battle-fx-canvas";
    Object.assign(canvas.style, {
      position: "fixed", inset: "0", zIndex: "4500",
      pointerEvents: "none"
    });
    document.body.appendChild(canvas);
    ctx = canvas.getContext("2d");
    resize();
    window.addEventListener("resize", resize);
  }
  function resize() {
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const PALETTE = {
    pro:     ["#4da3ff", "#6db4ff", "#a8d2ff", "#ffffff"],
    con:     ["#ff5c5c", "#ff8a8a", "#ffc2c2", "#ffffff"],
    attack:  ["#ff5c3b", "#ffd23b", "#ff8a5c", "#fff3c2"],
    defend:  ["#4da3ff", "#8fd0ff", "#ffffff", "#bfe4ff"],
    support: ["#35e0a0", "#7cf5c8", "#ffffff", "#b9ffe4"],
    ko:      ["#ff3b3b", "#ffd23b", "#ffffff", "#ff8a5c", "#333333"],
    spawn:   ["#ffd23b", "#fff3c2", "#ffffff", "#ffb84d"]
  };

  function centerOf(target) {
    if (!target) return { x: innerWidth / 2, y: innerHeight / 2 };
    if (typeof target.x === "number") return target;
    const r = target.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 60) };
  }

  function spawnParticles(x, y, colors, opts = {}) {
    const n = opts.count || 26;
    for (let i = 0; i < n; i++) {
      const ang = (opts.upward ? -Math.PI / 2 + (Math.random() - 0.5) * 1.4
                               : Math.random() * Math.PI * 2);
      const speed = (opts.speed || 5) * (0.4 + Math.random() * 0.9);
      particles.push({
        x, y,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed - (opts.lift || 0),
        g: opts.gravity ?? 0.18,
        drag: 0.985,
        life: 1,
        decay: 0.016 + Math.random() * 0.02,
        size: (opts.size || 4) * (0.5 + Math.random()),
        color: colors[(Math.random() * colors.length) | 0],
        star: Math.random() < (opts.starRatio ?? 0.25),
        spin: (Math.random() - 0.5) * 0.4,
        rot: Math.random() * Math.PI
      });
    }
    startLoop();
  }

  function drawStar(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      ctx.lineTo(Math.cos(a) * p.size, Math.sin(a) * p.size);
      ctx.lineTo(Math.cos(a + Math.PI / 4) * p.size * 0.4, Math.sin(a + Math.PI / 4) * p.size * 0.4);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function loop() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    particles = particles.filter(p => p.life > 0);
    if (!particles.length) { rafId = null; return; }
    for (const p of particles) {
      p.vx *= p.drag; p.vy = p.vy * p.drag + p.g;
      p.x += p.vx; p.y += p.vy;
      p.life -= p.decay; p.rot += p.spin;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      if (p.star) drawStar(p);
      else { ctx.beginPath(); ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    rafId = requestAnimationFrame(loop);
  }
  function startLoop() { ensureCanvas(); if (!rafId) rafId = requestAnimationFrame(loop); }

  /* ---------- 공개 API ---------- */
  function burstAt(target, kind = "spawn") {
    if (REDUCED) return;
    const { x, y } = centerOf(target);
    const colors = PALETTE[kind] || PALETTE.spawn;
    const big = kind === "ko";
    spawnParticles(x, y, colors, {
      count: big ? 60 : 30,
      speed: big ? 9 : 6,
      size: big ? 5 : 4,
      starRatio: big ? 0.4 : 0.25
    });
    if (kind === "support" || kind === "defend") {
      spawnParticles(x, y, colors, { count: 14, speed: 3, upward: true, lift: 2, gravity: 0.05, size: 3 });
    }
  }

  function shockwave(target, color = "rgba(255,255,255,.8)") {
    if (REDUCED) return;
    const { x, y } = centerOf(target);
    const ring = document.createElement("div");
    ring.className = "fx-shockwave";
    ring.style.left = x + "px";
    ring.style.top = y + "px";
    ring.style.borderColor = color;
    document.body.appendChild(ring);
    setTimeout(() => ring.remove(), 650);
  }

  function confetti(count = 70) {
    if (REDUCED) return;
    ensureCanvas();
    const colors = ["#ffd23b", "#4da3ff", "#ff5c8a", "#35e0a0", "#ffffff", "#b98bff"];
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * innerWidth,
        y: -12 - Math.random() * 60,
        vx: (Math.random() - 0.5) * 2.4,
        vy: 1.6 + Math.random() * 2.6,
        g: 0.045, drag: 0.995,
        life: 1, decay: 0.005 + Math.random() * 0.004,
        size: 3.4 + Math.random() * 3.2,
        color: colors[(Math.random() * colors.length) | 0],
        star: Math.random() < 0.5,
        spin: (Math.random() - 0.5) * 0.5,
        rot: Math.random() * Math.PI
      });
    }
    startLoop();
  }

  function vignette(kind = "danger") {
    if (REDUCED) return;
    const el = document.createElement("div");
    el.className = "fx-vignette " + kind;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  function flash(color = "rgba(255,255,255,.22)", ms = 180) {
    if (REDUCED) return;
    const el = document.createElement("div");
    el.className = "fx-flash";
    el.style.background = color;
    el.style.animationDuration = ms + "ms";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), ms + 60);
  }

  function banner(text, kind = "info") {
    const el = document.createElement("div");
    el.className = "fx-banner " + kind;
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2100);
  }

  /* ---------- 햅틱 (Android Chrome 동작 / iOS는 조용히 무시) ---------- */
  const HAPTICS = {
    tap:    18,
    attack: [12, 40, 70],
    ko:     [0, 60, 40, 60, 40, 140],
    heal:   [10, 30, 24],
    warn:   [90, 60, 90],
    cheer:  [16, 40, 16, 40, 60]
  };
  function haptic(name) {
    try { navigator.vibrate?.(HAPTICS[name] || HAPTICS.tap); } catch (_) {}
  }

  window.BattleFX = { burstAt, shockwave, confetti, vignette, flash, banner, haptic };
})();
