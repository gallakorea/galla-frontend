/* =========================================================
   ⚔️ 일기토 도전장 알림 — 스트리트 파이터식 "새로운 도전자!!" 연출
   문제: notifications.js는 index/mypage에만 로드 + 뱃지만 올려서, 이슈에서 공방 중
        도전장이 와도 온 줄 모름. 일기토는 상대가 기다리는 실시간 대결이라 치명적.

   두 갈래:
   ① duel_challenge = 전면 아케이드 연출(초상화 슬램 → VS 충돌 → 화면 진동). 상대가 기다리므로 크게.
   ② 그 외 duel_* = 상단 토스트(안내형, 자동 사라짐)

   접속 중이 아니었다면: 다음 진입 때 대기 중인 도전장을 스플래시·온보딩이 전부 끝난 뒤에 띄운다
   (그 위에 겹쳐 띄우면 둘 다 망가진다). notifications가 아니라 duels를 직접 본다 —
   알림은 과거의 흔적이고, 지금도 수락 가능한지는 duels.status가 원본이다.

   ※ 연출은 자체 완결이다. BattleFX(js/battle-fx.js)는 index·issue 2개 페이지에만 실려 있어서
     거기 기대면 나머지 8개 페이지에서 연출이 죽는다. 햅틱만 있으면 쓰고 없으면 넘어간다.
   ========================================================= */
(function () {
  var TOAST_TYPES = { duel_live: 1, duel_accept: 1, duel_decline: 1, duel_watch: 1 };
  var ACTION = { duel_live: "🥊 링 입장", duel_watch: "👀 관전하기" };
  var CHALLENGE_SECS = 45;   // 도전장 자동 닫힘 — 상대가 기다리므로 넉넉히

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function haptic(n) { try { window.BattleFX && window.BattleFX.haptic && window.BattleFX.haptic(n); } catch (e) {} }

  /* ───────── 스타일 ───────── */
  function css() {
    if (document.getElementById("dal-css")) return;
    var s = document.createElement("style"); s.id = "dal-css";
    s.textContent =
      /* ── 안내형 토스트 ── */
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

      /* ── 전면 도전장(아케이드) ── */
      ".dch{position:fixed;inset:0;z-index:2147483300;display:flex;flex-direction:column;" +
        "align-items:center;justify-content:center;padding:20px;overflow:hidden;" +
        "background:radial-gradient(70% 55% at 50% 45%,rgba(120,20,35,.55) 0%,rgba(0,0,0,.93) 70%);" +
        "opacity:0;transition:opacity .2s ease}" +
      ".dch.on{opacity:1}" +
      ".dch.bye{opacity:0;transition:opacity .3s ease}" +
      /* 화면 전체 임팩트 진동 */
      ".dch.on .dch-stage{animation:dchQuake .5s cubic-bezier(.36,.07,.19,.97) .34s both}" +
      /* 스캔라인 — 아케이드 CRT 질감 */
      ".dch-scan{position:absolute;inset:0;pointer-events:none;opacity:.5;" +
        "background:repeating-linear-gradient(0deg,rgba(0,0,0,.5) 0 1px,transparent 1px 3px)}" +
      /* 속도선 — 초상화가 뚫고 들어오는 느낌 */
      ".dch-speed{position:absolute;inset:0;pointer-events:none;opacity:0;" +
        "background:repeating-linear-gradient(90deg,transparent 0 26px,rgba(255,255,255,.14) 26px 28px);" +
        "animation:dchSpeed .5s ease-out .1s both}" +
      ".dch-stage{position:relative;width:100%;max-width:460px;text-align:center}" +

      ".dch-kicker{font-size:10px;font-weight:900;letter-spacing:2.5px;color:#ffcf4d;" +
        "text-shadow:0 0 12px rgba(255,180,40,.7);margin-bottom:6px;opacity:0;" +
        "animation:dchFade .3s ease .62s both}" +
      /* 아케이드 대문자 — 기울인 초굵은 글씨 + 검정 외곽선 */
      ".dch-title{font-size:clamp(26px,7.6vw,40px);font-weight:900;font-style:italic;letter-spacing:-.5px;" +
        "line-height:1.05;color:#ffd23f;-webkit-text-stroke:2px #1a0a0d;paint-order:stroke fill;" +
        "text-shadow:0 4px 0 #b3202f,0 0 26px rgba(255,190,60,.55);transform:skewX(-8deg) scale(.4);opacity:0;" +
        "animation:dchSlam .42s cubic-bezier(.2,1.6,.4,1) .5s both}" +
      ".dch-title b{color:#fff;-webkit-text-stroke:2px #1a0a0d}" +

      ".dch-vs{display:flex;align-items:center;justify-content:center;gap:8px;margin:16px 0 12px}" +
      ".dch-p{flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;gap:7px}" +
      /* 좌우에서 슬램 인 */
      ".dch-p.l{transform:translateX(-130%) skewX(12deg);opacity:0;animation:dchInL .38s cubic-bezier(.2,.9,.3,1) .1s both}" +
      ".dch-p.r{transform:translateX(130%) skewX(-12deg);opacity:0;animation:dchInR .38s cubic-bezier(.2,.9,.3,1) .1s both}" +
      ".dch-av{width:74px;height:74px;border-radius:50%;object-fit:cover;background:#23262f;" +
        "border:3px solid #ff4d67;box-shadow:0 0 0 3px rgba(0,0,0,.7),0 0 26px rgba(255,77,103,.6);" +
        "display:flex;align-items:center;justify-content:center;font-size:30px}" +
      ".dch-p.r .dch-av{border-color:#3d6bff;box-shadow:0 0 0 3px rgba(0,0,0,.7),0 0 26px rgba(61,107,255,.6)}" +
      ".dch-nick{font-size:12.5px;font-weight:900;color:#fff;max-width:100%;overflow:hidden;" +
        "text-overflow:ellipsis;white-space:nowrap;text-shadow:0 2px 6px rgba(0,0,0,.9)}" +
      ".dch-role{font-size:9.5px;font-weight:800;letter-spacing:1px;color:#ff8595}" +
      ".dch-p.r .dch-role{color:#7aa2ff}" +
      /* VS — 가운데서 충돌하듯 내리꽂힘 */
      ".dch-vs-mark{flex:0 0 auto;font-size:30px;font-weight:900;font-style:italic;color:#fff;" +
        "-webkit-text-stroke:2px #1a0a0d;paint-order:stroke fill;text-shadow:0 0 22px rgba(255,80,80,.9);" +
        "transform:scale(3);opacity:0;animation:dchSlam .34s cubic-bezier(.2,1.7,.4,1) .34s both}" +

      ".dch-topic{font-size:14px;font-weight:800;color:#fff;line-height:1.45;opacity:0;" +
        "animation:dchUp .32s ease .7s both;word-break:break-word}" +
      ".dch-meta{font-size:11.5px;font-weight:800;color:#ffcf4d;margin-top:7px;opacity:0;" +
        "animation:dchUp .32s ease .78s both}" +
      ".dch-acts2{display:flex;gap:9px;margin-top:18px;opacity:0;animation:dchUp .32s ease .86s both}" +
      ".dch-yes{flex:1;padding:14px;border:none;border-radius:11px;cursor:pointer;" +
        "font-size:14.5px;font-weight:900;color:#fff;letter-spacing:-.2px;" +
        "background:linear-gradient(135deg,#ff4d67,#d0324c);box-shadow:0 10px 26px -8px rgba(255,77,103,.9);" +
        "animation:dchPulse 1.5s ease-in-out 1.2s infinite}" +
      ".dch-yes:active{transform:scale(.96)}" +
      ".dch-no{flex:0 0 auto;padding:14px 16px;border:1px solid rgba(255,255,255,.16);border-radius:11px;" +
        "cursor:pointer;font-size:13px;font-weight:700;background:transparent;color:#9aa3b5}" +
      /* 남은 시간 — 도전장은 상대가 기다린다는 압박을 보여준다 */
      ".dch-bar{margin-top:14px;height:3px;border-radius:99px;background:rgba(255,255,255,.12);overflow:hidden}" +
      ".dch-bar i{display:block;height:100%;width:100%;background:linear-gradient(90deg,#ffd23f,#ff4d67);" +
        "transform-origin:left;animation:dchTime linear 1s both}" +
      ".dch-hint{margin-top:8px;font-size:10px;color:#6b7488}" +

      "@keyframes dchInL{to{transform:none;opacity:1}}" +
      "@keyframes dchInR{to{transform:none;opacity:1}}" +
      "@keyframes dchSlam{to{transform:skewX(-8deg) scale(1);opacity:1}}" +
      "@keyframes dchFade{to{opacity:1}}" +
      "@keyframes dchUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}" +
      "@keyframes dchQuake{10%,90%{transform:translate(-2px,1px)}20%,80%{transform:translate(4px,-2px)}" +
        "30%,50%,70%{transform:translate(-6px,2px)}40%,60%{transform:translate(6px,-1px)}to{transform:none}}" +
      "@keyframes dchSpeed{0%{opacity:.9;transform:scaleX(1)}to{opacity:0;transform:scaleX(1.6)}}" +
      "@keyframes dchPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.035)}}" +
      "@keyframes dchTime{to{transform:scaleX(0)}}" +
      /* 접근성: 움직임을 줄이면 연출 없이 내용만 — 정보는 하나도 잃지 않는다 */
      "@media (prefers-reduced-motion:reduce){.dal{transition:none}" +
        ".dch-title,.dch-vs-mark,.dch-p.l,.dch-p.r,.dch-kicker,.dch-topic,.dch-meta,.dch-acts2," +
        ".dch.on .dch-stage,.dch-speed{animation:none!important;opacity:1!important;transform:none!important}" +
        ".dch-yes{animation:none}.dch-scan{display:none}}";
    document.head.appendChild(s);
  }

  /* ───────── ① 전면 도전장 (스트리트 파이터식) ───────── */
  var CH_OPEN = false;
  function showChallenge(d) {
    if (CH_OPEN) return;              // 두 장이 겹치면 둘 다 못 읽는다
    CH_OPEN = true;
    css();
    var ov = document.createElement("div");
    ov.className = "dch";
    ov.setAttribute("role", "alertdialog");
    ov.setAttribute("aria-label", "일기토 도전장");
    var avatar = function (url, fallback) {
      return url
        ? '<img class="dch-av" src="' + esc(url) + '" alt="">'
        : '<div class="dch-av">' + fallback + "</div>";
    };
    var secs = d.mode === "scheduled" ? "예약" : (d.time_limit_secs || 90) + "초";
    ov.innerHTML =
      '<div class="dch-scan"></div><div class="dch-speed"></div>' +
      '<div class="dch-stage">' +
        '<div class="dch-kicker">HERE COMES A NEW CHALLENGER</div>' +
        '<div class="dch-title">새로운 <b>도전자</b>다!!</div>' +
        '<div class="dch-vs">' +
          '<div class="dch-p l">' + avatar(d._avatar, "🥊") +
            '<div class="dch-nick">' + esc(d._nick || "도전자") + "</div>" +
            '<div class="dch-role">도전자</div></div>' +
          '<div class="dch-vs-mark">VS</div>' +
          '<div class="dch-p r">' + avatar(d._myAvatar, "🛡") +
            '<div class="dch-nick">나</div>' +
            '<div class="dch-role">수비자</div></div>' +
        "</div>" +
        '<div class="dch-topic">“' + esc(d.topic || "일기토") + '”</div>' +
        '<div class="dch-meta">💰 ' + (d.stake || 0).toLocaleString() + " GP 판돈 · ⏱ " + secs + "</div>" +
        '<div class="dch-acts2">' +
          '<button class="dch-yes">⚔️ 받아친다</button>' +
          '<button class="dch-no">나중에</button>' +
        "</div>" +
        '<div class="dch-bar"><i></i></div>' +
        '<div class="dch-hint">받아치지 않으면 도전장은 사라집니다</div>' +
      "</div>";
    document.body.appendChild(ov);
    // 카운트다운 막대는 남은 시간에 맞춰 길이를 준다
    var bar = ov.querySelector(".dch-bar i");
    if (bar) bar.style.animationDuration = CHALLENGE_SECS + "s";

    requestAnimationFrame(function () { ov.classList.add("on"); });
    haptic("warn");
    setTimeout(function () { haptic("hit"); }, 340);   // VS가 꽂히는 순간

    var t = setTimeout(close, CHALLENGE_SECS * 1000);
    function close() {
      clearTimeout(t);
      CH_OPEN = false;
      ov.classList.add("bye");
      setTimeout(function () { ov.remove(); }, 320);
      document.removeEventListener("keydown", onKey);
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", onKey);
    ov.querySelector(".dch-no").onclick = close;
    ov.querySelector(".dch-yes").onclick = function () { location.href = "duel.html?id=" + d.id; };
  }

  /* ───────── ② 안내형 토스트 ───────── */
  function wrap() {
    var w = document.querySelector(".dal-wrap");
    if (!w) { w = document.createElement("div"); w.className = "dal-wrap"; document.body.appendChild(w); }
    return w;
  }
  function showToast(n) {
    css();
    var actionable = !!ACTION[n.type] && !!n.link;
    var el = document.createElement("div");
    el.className = "dal";
    el.innerHTML =
      '<div class="dal-top">' +
        '<span class="dal-ico">⚔️</span>' +
        '<span class="dal-msg">' + esc(n.message || "일기토 알림") + "</span>" +
        '<button class="dal-x" aria-label="닫기">✕</button>' +
      "</div>" +
      (actionable
        ? '<div class="dal-acts"><button class="dal-go">' + ACTION[n.type] + "</button>" +
          '<button class="dal-later">나중에</button></div>'
        : "");
    wrap().appendChild(el);
    requestAnimationFrame(function () { el.classList.add("show"); });
    haptic("warn");
    var t = setTimeout(close, 12000);
    function close() { clearTimeout(t); el.classList.remove("show"); setTimeout(function () { el.remove(); }, 400); }
    el.querySelector(".dal-x").onclick = close;
    var later = el.querySelector(".dal-later"); if (later) later.onclick = close;
    var go = el.querySelector(".dal-go"); if (go) go.onclick = function () { location.href = n.link; };
  }

  /* ───────── 도전장 상세 + 양쪽 얼굴 ───────── */
  async function hydrate(sb, duelId, me) {
    var r = await sb.from("duels")
      .select("id,challenger,opponent,topic,stake,status,mode,time_limit_secs")
      .eq("id", duelId).maybeSingle();
    var d = r.data;
    if (!d || d.status !== "pending" || d.opponent !== me) return null;   // 이미 끝났거나 내 것이 아님
    var u = await sb.from("users").select("id,nickname,avatar_url").in("id", [d.challenger, me]);
    (u.data || []).forEach(function (row) {
      if (row.id === d.challenger) { d._nick = row.nickname; d._avatar = row.avatar_url; }
      if (row.id === me) { d._myAvatar = row.avatar_url; }
    });
    return d;
  }

  /* ───────── 다른 연출이 끝날 때까지 대기 ─────────
     스플래시(#galla-splash)나 온보딩(.obd)이 떠 있는데 그 위에 도전장을 겹치면 둘 다 망가진다.
     사라질 때까지 기다렸다가 띄운다. 영영 안 사라져도 상한(20초)이 구제한다. */
  function whenUiFree(cb) {
    var waited = 0;
    (function tick() {
      var busy = document.getElementById("galla-splash") || document.querySelector(".obd");
      if (!busy || waited >= 20000) return setTimeout(cb, busy ? 0 : 260);   // 살짝 텀을 두고 등장
      waited += 200;
      setTimeout(tick, 200);
    })();
  }

  /* ───────── 부팅 ───────── */
  (async function boot() {
    try {
      if (/\/duel\.html/.test(location.pathname)) return;   // 일기토 화면에선 불필요
      var sb = window.waitForSupabaseClient ? await waitForSupabaseClient() : window.supabaseClient;
      if (!sb) return;
      var s = await sb.auth.getSession();
      var me = s.data && s.data.session && s.data.session.user && s.data.session.user.id;
      if (!me) return;

      // 접속 중: 도전장은 전면 연출, 나머지는 토스트
      sb.channel("dal-" + me)
        .on("postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: "user_id=eq." + me },
          function (p) {
            var n = p.new; if (!n) return;
            if (n.type === "duel_challenge") {
              var id = Number(String(n.link || "").split("id=")[1]);
              if (id) hydrate(sb, id, me).then(function (d) { if (d) showChallenge(d); });
            } else if (TOAST_TYPES[n.type]) showToast(n);
          })
        .subscribe();

      // 접속 중이 아니었다면: 대기 중인 도전장을 스플래시·온보딩이 끝난 뒤에.
      // 알림이 아니라 duels를 본다 — 지금도 수락 가능한지는 status가 원본이다.
      var p = await sb.from("duels")
        .select("id,challenger,opponent,topic,stake,status,mode,time_limit_secs")
        .eq("opponent", me).eq("status", "pending")
        .order("created_at", { ascending: false }).limit(1);
      var d = p.data && p.data[0];
      if (!d) return;
      // 페이지를 옮길 때마다 다시 튀어나오면 성가시다 → 세션당 도전장 1회
      var key = "galla_duel_seen_" + d.id;
      try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, "1"); } catch (e) {}
      var full = await hydrate(sb, d.id, me);
      if (full) whenUiFree(function () { showChallenge(full); });
    } catch (e) { /* 알림 실패가 페이지를 막지 않게 */ }
  })();
})();
