/* =========================================================
   ⚔️ 실시간 일기토 알림 — 도전장이 오면 '지금 이 화면'에 바로 띄운다.
   문제: notifications.js는 index/mypage에만 로드 + 뱃지만 올려서, 이슈에서 공방 중
        도전장이 와도 온 줄 모름. 일기토는 상대가 기다리는 실시간 대결이라 치명적.
   - 어느 페이지든 로드만 하면 동작(헤더 유무 무관). 로그인 시에만 구독.
   - duel_challenge = 액션형(수락하러 가기), 그 외 duel_* = 안내형(자동 사라짐)
   - 일기토 페이지(duel.html) 안에서는 안 띄움(이미 그 화면에 있음)
   ========================================================= */
(function () {
  var TYPES = { duel_challenge: 1, duel_live: 1, duel_accept: 1, duel_decline: 1, duel_watch: 1 };
  var ACTION = { duel_challenge: "⚔️ 수락하러 가기", duel_live: "🥊 링 입장", duel_watch: "👀 관전하기" };

  function css() {
    if (document.getElementById("dal-css")) return;
    var s = document.createElement("style"); s.id = "dal-css";
    s.textContent =
      ".dal-wrap{position:fixed;left:10px;right:10px;top:calc(10px + env(safe-area-inset-top,0px));" +
        "z-index:2147483200;display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none}" +
      ".dal{width:100%;max-width:460px;pointer-events:auto;border-radius:14px;padding:12px 14px;" +
        "background:linear-gradient(135deg,#1c1526,#12131a);border:1px solid rgba(255,77,103,.5);" +
        "box-shadow:0 18px 50px rgba(0,0,0,.6),0 0 22px rgba(255,77,103,.15);" +
        "transform:translateY(-130%);opacity:0;transition:transform .4s cubic-bezier(.2,.9,.3,1),opacity .3s}" +
      ".dal.show{transform:none;opacity:1}" +
      ".dal-top{display:flex;align-items:center;gap:9px}" +
      ".dal-ico{font-size:20px;flex:0 0 auto;filter:drop-shadow(0 2px 6px rgba(255,77,103,.6))}" +
      ".dal-msg{flex:1;min-width:0;font-size:13px;font-weight:700;color:#f3f4f6;line-height:1.45}" +
      ".dal-x{flex:0 0 auto;width:24px;height:24px;border:none;border-radius:50%;cursor:pointer;" +
        "background:rgba(255,255,255,.08);color:#aaa;font-size:11px}" +
      ".dal-acts{display:flex;gap:8px;margin-top:10px}" +
      ".dal-go{flex:1;padding:9px 12px;border:none;border-radius:9px;cursor:pointer;font-size:12.5px;font-weight:900;" +
        "color:#fff;background:linear-gradient(135deg,#d0324c,#ff4d67);box-shadow:0 6px 16px -6px rgba(255,77,103,.7)}" +
      ".dal-later{flex:0 0 auto;padding:9px 12px;border:1px solid rgba(255,255,255,.14);border-radius:9px;" +
        "cursor:pointer;font-size:12.5px;background:transparent;color:#9aa3b5}" +
      "@media (prefers-reduced-motion:reduce){.dal{transition:none}}";
    document.head.appendChild(s);
  }
  function wrap() {
    var w = document.querySelector(".dal-wrap");
    if (!w) { w = document.createElement("div"); w.className = "dal-wrap"; document.body.appendChild(w); }
    return w;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function show(n) {
    css();
    var actionable = n.type === "duel_challenge" || n.type === "duel_live" || n.type === "duel_watch";
    var el = document.createElement("div");
    el.className = "dal";
    el.innerHTML =
      '<div class="dal-top">' +
        '<span class="dal-ico">⚔️</span>' +
        '<span class="dal-msg">' + esc(n.message || "일기토 알림") + "</span>" +
        '<button class="dal-x" aria-label="닫기">✕</button>' +
      "</div>" +
      (actionable && n.link
        ? '<div class="dal-acts"><button class="dal-go">' + (ACTION[n.type] || "보러 가기") + "</button>" +
          '<button class="dal-later">나중에</button></div>'
        : "");
    wrap().appendChild(el);
    requestAnimationFrame(function () { el.classList.add("show"); });
    try { window.BattleFX?.haptic?.("warn"); } catch (e) {}

    var t = null;
    function close() { clearTimeout(t); el.classList.remove("show"); setTimeout(function () { el.remove(); }, 400); }
    el.querySelector(".dal-x").onclick = close;
    el.querySelector(".dal-later") && (el.querySelector(".dal-later").onclick = close);
    el.querySelector(".dal-go") && (el.querySelector(".dal-go").onclick = function () { location.href = n.link; });
    // 도전장은 상대가 기다리므로 오래 띄운다(45s). 안내형은 짧게.
    t = setTimeout(close, n.type === "duel_challenge" ? 45000 : 12000);
  }

  (async function boot() {
    try {
      if (/\/duel\.html/.test(location.pathname)) return;   // 일기토 화면에선 불필요
      var sb = window.waitForSupabaseClient ? await waitForSupabaseClient() : window.supabaseClient;
      if (!sb) return;
      var s = await sb.auth.getSession();
      var me = s.data?.session?.user?.id;
      if (!me) return;
      sb.channel("dal-" + me)
        .on("postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: "user_id=eq." + me },
          function (p) { if (p.new && TYPES[p.new.type]) show(p.new); })
        .subscribe();
    } catch (e) { /* 알림 실패가 페이지를 막지 않게 */ }
  })();
})();
