/* =========================================================
   ❓ GALLA_ask — 기본 confirm() 대체 확인 모달 (Promise<boolean>)
   ---------------------------------------------------------
   사용: const ok = await GALLA_ask({ emoji, title, body, ok, cancel, danger })
   · 딤 탭·Esc = 취소 / 버튼 스타일은 갈라 톤(순흑+인디고)
   · confirm처럼 어디서든 await 한 줄 — 스타일은 여기서만 관리
   ========================================================= */
(function () {
  function css() {
    if (document.getElementById("gask-css")) return;
    const s = document.createElement("style");
    s.id = "gask-css";
    s.textContent = `
      #gask{position:fixed;inset:0;z-index:12000;display:flex;align-items:center;justify-content:center;padding:24px}
      #gask .ga-dim{position:absolute;inset:0;background:rgba(0,0,0,.6);opacity:0;transition:opacity .16s}
      #gask.on .ga-dim{opacity:1}
      #gask .ga-card{position:relative;width:min(340px,90vw);border-radius:20px;padding:24px 20px 16px;
        background:linear-gradient(180deg,#181a20,#0d0e12);border:1px solid rgba(255,255,255,.09);
        box-shadow:0 24px 60px rgba(0,0,0,.6);text-align:center;
        opacity:0;transform:scale(.92) translateY(8px);transition:opacity .18s,transform .18s cubic-bezier(.2,.9,.3,1.2)}
      #gask.on .ga-card{opacity:1;transform:scale(1) translateY(0)}
      #gask .ga-emoji{font-size:34px;line-height:1;margin-bottom:10px}
      #gask .ga-title{font-size:16px;font-weight:900;color:#fff;line-height:1.4;letter-spacing:-.01em}
      #gask .ga-body{margin-top:8px;font-size:13px;color:#9aa2b5;line-height:1.65;white-space:pre-line}
      #gask .ga-btns{display:flex;gap:8px;margin-top:18px}
      #gask .ga-btn{flex:1;padding:13px 0;border:none;border-radius:13px;cursor:pointer;
        font-size:14px;font-weight:900;font-family:inherit;transition:transform .1s}
      #gask .ga-btn:active{transform:scale(.96)}
      #gask .ga-cancel{background:rgba(255,255,255,.06);color:#9aa0ad}
      #gask .ga-ok{background:linear-gradient(135deg,#6a7bff,#3a5bff);color:#fff}
      #gask .ga-ok.danger{background:linear-gradient(135deg,#ff5d75,#e03050)}
      @media (prefers-reduced-motion:reduce){#gask .ga-card{transition:opacity .12s}}
    `;
    document.head.appendChild(s);
  }

  window.GALLA_ask = function ({ emoji = "❓", title = "", body = "", ok = "확인", cancel = "취소", danger = false } = {}) {
    css();
    return new Promise((resolve) => {
      document.getElementById("gask")?.remove();
      const m = document.createElement("div");
      m.id = "gask";
      const esc = (t) => String(t ?? "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
      m.innerHTML = `
        <div class="ga-dim"></div>
        <div class="ga-card" role="dialog" aria-modal="true">
          <div class="ga-emoji">${esc(emoji)}</div>
          <div class="ga-title">${esc(title)}</div>
          ${body ? `<div class="ga-body">${esc(body)}</div>` : ""}
          <div class="ga-btns">
            ${cancel !== null ? `<button type="button" class="ga-btn ga-cancel">${esc(cancel)}</button>` : ""}
            <button type="button" class="ga-btn ga-ok${danger ? " danger" : ""}">${esc(ok)}</button>
          </div>
        </div>`;
      document.body.appendChild(m);
      const done = (v) => {
        m.classList.remove("on");
        document.removeEventListener("keydown", onKey);
        setTimeout(() => m.remove(), 180);
        resolve(v);
      };
      const onKey = (e) => { if (e.key === "Escape") done(false); if (e.key === "Enter") done(true); };
      m.querySelector(".ga-dim").addEventListener("click", () => done(false));
      m.querySelector(".ga-cancel")?.addEventListener("click", () => done(false));
      m.querySelector(".ga-ok").addEventListener("click", () => done(true));
      document.addEventListener("keydown", onKey);
      requestAnimationFrame(() => m.classList.add("on"));
      window.BattleFX?.haptic?.("tap");
    });
  };
})();
