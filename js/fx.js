/* =========================================================
   fx.js — 갈라 액션 이펙트 엔진 (타임스퀘어 감성)
   좋아요=하트 폭발, 저장=별 반짝임, 그 외 수동 API 제공.
   진영 투표는 별도(vote-fx.js)라 여기선 건드리지 않는다.
   전역 위임 리스너 — 각 핸들러를 고치지 않고 시각 효과만 얹는다.
========================================================= */
(function () {
  if (window.GALLA_FX) return;

  /* ---- 스타일 주입 (자체 완결) ---- */
  const css = `
  .fx-layer{position:fixed;inset:0;pointer-events:none;z-index:100000;overflow:visible;contain:layout style;}
  .fx-p{position:fixed;will-change:transform,opacity;pointer-events:none;
    transition:transform .78s cubic-bezier(.12,.72,.28,1), opacity .78s ease;}
  .fx-emo{font-size:20px;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,.35));}
  .fx-dot{border-radius:2px;}
  .fx-ring{position:fixed;border-radius:50%;pointer-events:none;transform:translate(-50%,-50%) scale(0);
    border:2px solid rgba(255,60,90,.7);will-change:transform,opacity;
    transition:transform .5s cubic-bezier(.1,.7,.3,1), opacity .5s ease;}
  @keyframes fxPop{0%{transform:scale(1)}40%{transform:scale(1.5)}70%{transform:scale(.88)}100%{transform:scale(1)}}
  .fx-pop{animation:fxPop .5s cubic-bezier(.2,.9,.3,1.4);}
  /* 화면 상단 네온 플래시(큰 액션용) */
  .fx-flash{position:fixed;inset:0;pointer-events:none;z-index:99999;opacity:0;
    background:radial-gradient(120% 60% at 50% 0%, rgba(255,60,90,.16), transparent 60%);
    transition:opacity .5s ease;}
  .fx-flash.on{opacity:1;}
  /* GALLA 로고 네온 숨쉬기 */
  @keyframes gallaNeon{0%,100%{filter:drop-shadow(0 0 0 rgba(120,150,255,0))}
    50%{filter:drop-shadow(0 0 6px rgba(120,150,255,.55)) drop-shadow(0 0 14px rgba(255,60,120,.25))}}
  .header .logo, .np-title{animation:gallaNeon 4.5s ease-in-out infinite;}`;
  const st = document.createElement("style"); st.id = "galla-fx-style"; st.textContent = css;
  document.head.appendChild(st);

  let layer;
  const getLayer = () => {
    if (!layer || !layer.isConnected) { layer = document.createElement("div"); layer.className = "fx-layer"; document.body.appendChild(layer); }
    return layer;
  };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- 코어: 한 점에서 파티클 폭발 ---- */
  function burst(x, y, opt = {}) {
    if (reduce) return;
    const { emojis, colors, count = 14, spread = 70, up = 26 } = opt;
    const L = getLayer();
    // 링 파동
    const ring = document.createElement("span");
    ring.className = "fx-ring";
    ring.style.left = x + "px"; ring.style.top = y + "px";
    ring.style.width = ring.style.height = "26px";
    if (colors) ring.style.borderColor = colors[0];
    L.appendChild(ring);
    requestAnimationFrame(() => { ring.style.transform = "translate(-50%,-50%) scale(2.6)"; ring.style.opacity = "0"; });
    setTimeout(() => ring.remove(), 520);

    for (let i = 0; i < count; i++) {
      const p = document.createElement("span");
      const ang = (Math.PI * 2 * i) / count + rnd(-0.4, 0.4);
      const dist = spread + rnd(0, spread);
      const dx = Math.cos(ang) * dist;
      const dy = Math.sin(ang) * dist - up;   // 살짝 위로
      if (emojis) { p.className = "fx-p fx-emo"; p.textContent = emojis[i % emojis.length]; p.style.fontSize = rnd(13, 24) + "px"; }
      else { p.className = "fx-p fx-dot"; const s = rnd(6, 12); p.style.width = p.style.height = s + "px"; p.style.background = colors[i % colors.length]; if (Math.random() > .5) p.style.borderRadius = "50%"; }
      p.style.left = x + "px"; p.style.top = y + "px";
      L.appendChild(p);
      requestAnimationFrame(() => { p.style.transform = `translate(${dx}px,${dy}px) rotate(${rnd(-180, 180)}deg)`; p.style.opacity = "0"; });
      setTimeout(() => p.remove(), 820);
    }
  }

  /* ---- 화면 컨페티(큰 축하) ---- */
  function confetti(opt = {}) {
    if (reduce) return;
    const L = getLayer();
    const colors = opt.colors || ["#ff3c5a", "#ffb03c", "#4a7bff", "#33d17a", "#b388ff", "#ff8ac4"];
    const n = opt.count || 90;
    const W = innerWidth;
    for (let i = 0; i < n; i++) {
      const p = document.createElement("span");
      p.className = "fx-p fx-dot";
      const s = rnd(6, 11); p.style.width = s + "px"; p.style.height = s * rnd(.5, 1.4) + "px";
      p.style.background = colors[i % colors.length];
      if (Math.random() > .6) p.style.borderRadius = "50%";
      const x0 = rnd(0, W), y0 = rnd(-40, -10);
      p.style.left = x0 + "px"; p.style.top = y0 + "px";
      p.style.transition = `transform ${rnd(1.4, 2.4)}s cubic-bezier(.2,.6,.4,1), opacity .4s ease ${rnd(1, 1.8)}s`;
      L.appendChild(p);
      requestAnimationFrame(() => { p.style.transform = `translate(${rnd(-60, 60)}px, ${innerHeight + 80}px) rotate(${rnd(180, 900)}deg)`; p.style.opacity = "0"; });
      setTimeout(() => p.remove(), 2600);
    }
  }

  function flash() {
    if (reduce) return;
    const f = document.createElement("div"); f.className = "fx-flash";
    document.body.appendChild(f);
    requestAnimationFrame(() => f.classList.add("on"));
    setTimeout(() => { f.classList.remove("on"); setTimeout(() => f.remove(), 500); }, 200);
  }

  const heart = (x, y) => burst(x, y, { emojis: ["❤️", "💗", "💥", "❤️", "🧡"], count: 12, spread: 62, up: 34 });
  const star = (x, y) => burst(x, y, { emojis: ["⭐", "✨", "💫"], colors: ["#f5c518"], count: 9, spread: 52, up: 22 });

  window.GALLA_FX = { burst, confetti, flash, heart, star };

  /* ---- 자동 연결: 좋아요=하트, 저장=별 (버튼이 '켜질 때'만) ---- */
  const LIKE = ".like-btn,.gn-like-btn,#hvLike,.gnc-like,.hv-cl,#issue-like-btn";
  const SAVE = ".bookmark-btn,.gn-save-btn,.plaza-save-btn,#plazaBookmarkBtn,#issue-save-btn";
  const isOn = (el) => el.classList.contains("on") || el.classList.contains("active") || el.classList.contains("liked") || el.getAttribute("aria-pressed") === "true";

  function at(e, el) {
    const t = (e.touches && e.touches[0]) || e;
    if (t && typeof t.clientX === "number" && t.clientX) return { x: t.clientX, y: t.clientY };
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  document.addEventListener("click", (e) => {
    const like = e.target.closest(LIKE);
    if (like) {
      const { x, y } = at(e, like);
      // 토글 방향 확인 후(켜질 때만) 이펙트. 핸들러가 동기/낙관적으로 on을 붙인다.
      setTimeout(() => { if (isOn(like)) { heart(x, y); const ic = like.querySelector("svg,.lk-ic,.ic-like"); if (ic) { ic.classList.remove("fx-pop"); void ic.offsetWidth; ic.classList.add("fx-pop"); } } }, 40);
      return;
    }
    const save = e.target.closest(SAVE);
    if (save) {
      const { x, y } = at(e, save);
      setTimeout(() => { if (isOn(save)) star(x, y); }, 40);
    }
  }, true);
})();
