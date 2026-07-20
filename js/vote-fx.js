/* ============================================================
   GALLA 진영 선택 축하 이펙트 — window.GALLA_VoteFX.celebrate(opts)
   opts: { type:'pro'|'con', faction, origin:{x,y} }
   색종이 폭발 + 큰 글자 터짐 + 화면 플래시 + 충격파 + 코인 샤워(아케이드).
   ============================================================ */
(function () {
  const reduce = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];

  const PALETTE = {
    pro: ["#5b8cff", "#8aa8ff", "#c9d8ff", "#ffffff", "#ffd54a", "#6fe3ff"],
    con: ["#ff5a7a", "#ff8aa0", "#ffd0da", "#ffffff", "#ffd54a", "#ff9b4d"]
  };
  const BURST = ["🎉", "✨", "💥", "⭐", "🔥", "🎊"];
  const COINS = ["🪙", "💰", "💎", "🎰", "🏆", "⭐"];

  function ensureLayer() {
    let l = document.getElementById("gv-fx");
    if (!l) { l = document.createElement("div"); l.id = "gv-fx"; document.body.appendChild(l); }
    return l;
  }

  let busy = false;
  function celebrate(opts) {
    opts = opts || {};
    const type = opts.type === "con" ? "con" : "pro";
    const faction = (opts.faction || (type === "pro" ? "찬성" : "반대")).trim();
    const emoji = type === "pro" ? "👍" : "👎";
    const colors = PALETTE[type];
    const c1 = colors[0];

    // 화면 좌표(터진 진영 버튼 위치 우선, 없으면 중앙 하단)
    const ox = opts.origin && opts.origin.x != null ? opts.origin.x : window.innerWidth * 0.5;
    const oy = opts.origin && opts.origin.y != null ? opts.origin.y : window.innerHeight * 0.62;
    const oxp = (ox / window.innerWidth * 100).toFixed(1) + "%";
    const oyp = (oy / window.innerHeight * 100).toFixed(1) + "%";

    const L = ensureLayer();
    L.style.setProperty("--c1", c1);
    L.style.setProperty("--ox", oxp);
    L.style.setProperty("--oy", oyp);

    const frag = document.createDocumentFragment();
    const life = [];

    // 큰 글자 항상(축소버전이라도) — "찬성이오! ⚔️ 참전!"
    const word = document.createElement("div");
    word.className = "gvfx-word";
    word.innerHTML = `<span class="gvfx-pick">${emoji} ${escapeHtml(faction)}!</span><span class="gvfx-sub">⚔️ 참전 완료</span>`;
    frag.appendChild(word); life.push([word, 1550]);

    if (!reduce()) {
      // 플래시
      const flash = document.createElement("div"); flash.className = "gvfx-flash"; frag.appendChild(flash); life.push([flash, 650]);
      // 충격파 2겹
      const ring1 = document.createElement("div"); ring1.className = "gvfx-ring"; frag.appendChild(ring1); life.push([ring1, 900]);
      const ring2 = document.createElement("div"); ring2.className = "gvfx-ring r2"; frag.appendChild(ring2); life.push([ring2, 1000]);

      // 색종이 폭발(방사형)
      const N = 46;
      for (let i = 0; i < N; i++) {
        const p = document.createElement("i");
        p.className = "gvfx-confetti";
        const ang = (Math.PI * 2 * i) / N + rand(-0.2, 0.2);
        const dist = rand(120, Math.min(window.innerWidth, 520) * 0.85);
        const tx = Math.cos(ang) * dist;
        const ty = Math.sin(ang) * dist - rand(20, 120); // 살짝 위로 솟구침
        p.style.setProperty("--tx", tx.toFixed(0) + "px");
        p.style.setProperty("--ty", ty.toFixed(0) + "px");
        p.style.setProperty("--rot", rand(-720, 720).toFixed(0) + "deg");
        p.style.setProperty("--dur", rand(0.85, 1.35).toFixed(2) + "s");
        p.style.setProperty("--delay", rand(0, 0.12).toFixed(2) + "s");
        p.style.background = pick(colors);
        p.style.width = rand(7, 13).toFixed(0) + "px";
        p.style.height = rand(10, 18).toFixed(0) + "px";
        if (Math.random() < 0.3) p.style.borderRadius = "50%";
        frag.appendChild(p); life.push([p, 1500]);
      }

      // 이모지 폭발
      for (let i = 0; i < 14; i++) {
        const e = document.createElement("span");
        e.className = "gvfx-emoji"; e.textContent = pick(BURST);
        const ang = rand(0, Math.PI * 2), dist = rand(90, 340);
        e.style.setProperty("--tx", (Math.cos(ang) * dist).toFixed(0) + "px");
        e.style.setProperty("--ty", (Math.sin(ang) * dist - rand(30, 90)).toFixed(0) + "px");
        e.style.setProperty("--rot", rand(-240, 240).toFixed(0) + "deg");
        e.style.setProperty("--sz", rand(20, 40).toFixed(0) + "px");
        e.style.setProperty("--dur", rand(0.9, 1.4).toFixed(2) + "s");
        e.style.setProperty("--delay", rand(0, 0.15).toFixed(2) + "s");
        frag.appendChild(e); life.push([e, 1600]);
      }

      // 코인 샤워(아케이드 대박) — 상단에서 쏟아짐
      for (let i = 0; i < 22; i++) {
        const c = document.createElement("span");
        c.className = "gvfx-coin"; c.textContent = pick(COINS);
        c.style.setProperty("--x", rand(4, 96).toFixed(1) + "%");
        c.style.setProperty("--sz", rand(16, 30).toFixed(0) + "px");
        c.style.setProperty("--rot", rand(360, 900).toFixed(0) + "deg");
        c.style.setProperty("--dur", rand(1.0, 1.7).toFixed(2) + "s");
        c.style.setProperty("--delay", rand(0, 0.5).toFixed(2) + "s");
        frag.appendChild(c); life.push([c, 2300]);
      }

      // 살짝 진동(지원 기기)
      try { if (navigator.vibrate) navigator.vibrate([12, 30, 12]); } catch (e) {}
    }

    L.appendChild(frag);
    life.forEach(([el, ms]) => setTimeout(() => el.remove(), ms));
  }

  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  window.GALLA_VoteFX = { celebrate };
})();
