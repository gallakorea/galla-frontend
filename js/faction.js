/* =========================================================
   ⚔️ 진영 지원 — 댓글 전쟁 바로 위 진입점.
   지원 아이템(하이라이트·부활·연장 등)을 사서 내 진영 댓글에 쓰는 흐름의 CTA.
   실제 사용은 배틀(공격/방어/지원)·댓글 메뉴(하이라이트)에서. 여긴 상점으로 연결.
   window.GALLA_initFaction(issue)
   ========================================================= */
(function () {
  function css() {
    if (document.getElementById("fac-css")) return;
    const s = document.createElement("style"); s.id = "fac-css";
    s.textContent = `
      .faction-section{padding:6px 16px 2px}
      .fac-support{display:flex;align-items:center;gap:12px;
        background:linear-gradient(135deg,#1b1e2b,#171820);
        border:1px solid rgba(201,209,224,.22);border-radius:16px;padding:13px 14px}
      .fac-s-l{flex:1;min-width:0}
      .fac-s-title{font-weight:900;font-size:14px;color:#fff;line-height:1.3}
      .fac-s-desc{font-size:12px;color:#9aa0ad;margin-top:4px;line-height:1.45}
      .fac-s-btn{flex:0 0 auto;border:none;border-radius:12px;padding:11px 14px;font-weight:900;font-size:13px;cursor:pointer;
        background:linear-gradient(135deg,#c9d1e0,#8b93a3);color:#0a0a0b;white-space:nowrap}
      .fac-s-btn:active{transform:scale(.97)}
      @media(max-width:380px){.fac-support{flex-direction:column;align-items:stretch}.fac-s-btn{width:100%}}
    `;
    document.head.appendChild(s);
  }

  window.GALLA_initFaction = function (issue) {
    const sec = document.getElementById("faction-section");
    if (!sec) return;
    css();
    sec.innerHTML = `
      <div class="fac-support">
        <div class="fac-s-l">
          <div class="fac-s-title">⚔️ 이 댓글 전쟁, 내 진영을 지원하세요</div>
          <div class="fac-s-desc">지원 아이템으로 내 편 댓글을 밀어주고 전황을 뒤집으세요 · 하이라이트 · 부활 · 대댓글 연장</div>
        </div>
        <button class="fac-s-btn" id="fac-shop">🎒 지원 아이템</button>
      </div>`;
    sec.querySelector("#fac-shop").addEventListener("click", async () => {
      if (window.GALLA_requireLogin && !(await window.GALLA_requireLogin("로그인 후 이용할 수 있어요."))) return;
      if (window.openShop) window.openShop();
      else alert("상점을 열 수 없어요.");
    });
  };
})();
