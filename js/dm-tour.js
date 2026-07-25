/* ============================================================================
   💬 DM 첫 진입 코치마크 투어 — 실제 화면 위 반투명 병맛 팝업 안내
   ----------------------------------------------------------------------------
   전체화면 슬라이드가 아니라, 진짜 DM 화면을 반투명하게 덮고 그 위에서
   병맛 말풍선으로 기능을 하나씩 짚어준다(스포트라이트 코치마크).
   특히 🎙 워키토키(꾹 눌러 실시간 음성)·📟 삐삐를 강조.
   - 로그인 상태 + DM 페이지 최초 1회(localStorage galla_dm_tour_v1)
   - 실제 요소(난장·삐삐 탭)는 하이라이트 링으로, 방 안 기능(워키토키·통화)은 중앙 카드
   ========================================================================== */
(function () {
  if (document.body.getAttribute("data-page") !== "dm") return;
  var KEY = "galla_dm_tour_v1";
  var PROJ = "bidqauputnhkqepvdzrr";
  try { if (localStorage.getItem(KEY)) return; } catch (e) { return; }
  function loggedIn() { try { return !!localStorage.getItem("sb-" + PROJ + "-auth-token"); } catch (e) { return false; } }
  if (!loggedIn()) return;   // DM은 로그인 필수 — 미로그인이면 애초에 투어 없음

  function haptic(k) { try { if (window.GALLA_haptic) window.GALLA_haptic(k || "light"); else if (navigator.vibrate) navigator.vibrate(12); } catch (e) {} }

  var STEPS = [
    { center: true, icon: "🗨️", kicker: "환영합니다", title: "여기가 갈라톡",
      body: "카톡 갈아치우러 온 <b>갈라톡</b>이에요.<br>뭐가 되는지 <b>30초</b>만 구경할래요?" },
    { sel: '.dm-tab[data-tab="rooms"]', icon: "🎙", kicker: "★ 라이브 ★", title: "육성 난장", big: true,
      body: "클럽하우스처럼 <b>목소리로 떠드는 라이브 토크</b>!<br>무대 올라가 말하고, 리액션 날리고, 💸 쏘기로 응원까지." },
    { sel: '.dm-tab[data-tab="rooms"]', icon: "🎪", kicker: "오픈 수다방", title: "난장",
      body: "아무나 들어와 떠드는 <b>오픈챗</b>.<br>주제 하나 걸고 판 벌이면 사람들이 몰려와요." },
    { sel: '.dm-tab[data-tab="pager"]', icon: "📟", kicker: "★ 이건 꼭 ★", title: "삐삐 부활!", big: true,
      body: "90년대 그 삐삐 맞아요. <b>8282</b>(빨리빨리) 쳐서 호출하고,<br>암호책 보고 해독하는 재미 ㅋㅋ" },
    { center: true, icon: "🎙", kicker: "★ 진짜 무기 ★", title: "무전기, 꾹 눌러 말해요", big: true, art: artWalkie,
      body: "대화방에서 버튼을 <b>꾹 누르면 말하고, 떼면 바로 전송</b> —<br>무전기처럼 실시간! 위로 밀면 취소돼요." },
    { center: true, icon: "📞", kicker: "통화도 됨", title: "육성톡 · 면상톡",
      body: "음성통화(육성톡)·영상통화(면상톡)로 <b>바로 콜</b>.<br>갈라 앱에서 빵빵하게 연결돼요." },
    { center: true, icon: "🚀", kicker: "준비 끝", title: "자, 이제 떠들어봐요!",
      body: "친구 초대하고 · 난장 열고 · 삐삐 치고 —<br>여기서 다 놀 수 있어요. 카톡, 잘 가 👋" }
  ];

  var idx = 0, OV = null;

  function boot() {
    injectCSS();
    OV = document.createElement("div");
    OV.className = "dmt";
    OV.innerHTML =
      '<div class="dmt-scrim"></div>' +
      '<div class="dmt-ring" hidden></div>' +
      '<div class="dmt-card">' +
        '<button class="dmt-skip" type="button">건너뛰기 ✕</button>' +
        '<div class="dmt-art"></div>' +
        '<div class="dmt-kicker"></div>' +
        '<div class="dmt-title"></div>' +
        '<div class="dmt-body"></div>' +
        '<div class="dmt-foot"><div class="dmt-dots"></div><button class="dmt-next" type="button">다음</button></div>' +
      "</div>";
    document.body.appendChild(OV);
    var dots = OV.querySelector(".dmt-dots");
    STEPS.forEach(function (_, i) { var d = document.createElement("i"); d.className = "dmt-dot" + (i ? "" : " on"); dots.appendChild(d); });

    OV.querySelector(".dmt-skip").onclick = finish;
    OV.querySelector(".dmt-next").onclick = function () { if (idx >= STEPS.length - 1) return finish(); go(idx + 1); };
    OV.querySelector(".dmt-scrim").onclick = function () {}; // 뒤 클릭 차단(안내 중)
    window.addEventListener("resize", reposition);

    requestAnimationFrame(function () { OV.classList.add("show"); go(0); });
  }

  function go(i) {
    idx = i;
    var s = STEPS[i];
    var card = OV.querySelector(".dmt-card");
    OV.querySelector(".dmt-kicker").innerHTML = s.kicker || "";
    OV.querySelector(".dmt-title").innerHTML = s.title || "";
    OV.querySelector(".dmt-body").innerHTML = s.body || "";
    var artBox = OV.querySelector(".dmt-art");
    artBox.innerHTML = s.art ? s.art() : ('<div class="dmt-emoji' + (s.big ? " big" : "") + '">' + (s.icon || "✨") + "</div>");
    card.classList.toggle("big", !!s.big);
    OV.querySelectorAll(".dmt-dot").forEach(function (d, k) { d.classList.toggle("on", k === i); });
    OV.querySelector(".dmt-next").textContent = (i >= STEPS.length - 1) ? "시작하기 🚀" : "다음";
    reposition();
    // 살짝 튀는 등장
    card.classList.remove("pop"); void card.offsetWidth; card.classList.add("pop");
    haptic(s.big ? "medium" : "light");
  }

  function reposition() {
    if (!OV) return;
    var s = STEPS[idx], ring = OV.querySelector(".dmt-ring"), card = OV.querySelector(".dmt-card");
    var el = s && s.sel ? document.querySelector(s.sel) : null;
    var rect = el && el.getBoundingClientRect();
    if (rect && rect.width && rect.height && rect.bottom > 0 && rect.top < window.innerHeight) {
      var pad = 8;
      ring.hidden = false;
      ring.style.left = (rect.left - pad) + "px";
      ring.style.top = (rect.top - pad) + "px";
      ring.style.width = (rect.width + pad * 2) + "px";
      ring.style.height = (rect.height + pad * 2) + "px";
      // 카드: 타깃 아래 공간 있으면 아래, 없으면 위. (하단 nav ~80px 회피)
      card.style.left = "50%";
      card.style.transform = "translateX(-50%)";
      var below = window.innerHeight - rect.bottom;
      if (below > 260) { card.style.top = (rect.bottom + 18) + "px"; card.style.bottom = "auto"; }
      else { card.style.top = "auto"; card.style.bottom = (window.innerHeight - rect.top + 18) + "px"; }
    } else {
      ring.hidden = true;
      card.style.left = "50%"; card.style.transform = "translateX(-50%)";
      card.style.top = "50%"; card.style.bottom = "auto";
      card.style.transform = "translate(-50%,-50%)";
    }
  }

  function finish() {
    try { localStorage.setItem(KEY, "1"); } catch (e) {}
    window.removeEventListener("resize", reposition);
    if (!OV) return;
    OV.classList.remove("show");
    setTimeout(function () { if (OV) OV.remove(); OV = null; }, 260);
  }

  /* 🎙 워키토키 미니 아트 — 꾹 눌러 말하는 무전기 */
  function artWalkie() {
    return '<svg class="dmt-svg dmt-walkie" viewBox="0 0 120 96" aria-hidden="true">' +
      '<rect x="40" y="20" width="40" height="66" rx="9" fill="#1b2a44" stroke="#3d6bff" stroke-width="2.5"/>' +
      '<rect x="52" y="8" width="6" height="16" rx="3" fill="#8aa0ff"/>' +   // 안테나
      '<rect x="48" y="28" width="24" height="14" rx="3" fill="#0a1220"/>' +  // 화면
      '<circle class="dmt-ptt" cx="60" cy="60" r="11" fill="#ff4d67"/>' +      // PTT 버튼
      '<text x="60" y="64" font-size="9" text-anchor="middle" fill="#fff" font-weight="900">말</text>' +
      '<g class="dmt-wave"><path d="M86 44 q10 16 0 32" fill="none" stroke="#33d17a" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M94 38 q16 22 0 44" fill="none" stroke="#33d17a" stroke-width="3" stroke-linecap="round" opacity=".6"/></g>' +
      "</svg>";
  }

  function injectCSS() {
    if (document.getElementById("dmt-css")) return;
    var st = document.createElement("style"); st.id = "dmt-css";
    st.textContent = [
      ".dmt{position:fixed;inset:0;z-index:2147482500;opacity:0;transition:opacity .26s ease;",
        "font-family:'Pretendard',system-ui,-apple-system,sans-serif}",
      ".dmt.show{opacity:1}",
      ".dmt-scrim{position:absolute;inset:0;background:rgba(6,8,14,.62);backdrop-filter:blur(1.5px)}",
      ".dmt-ring{position:absolute;border-radius:14px;border:2.5px solid #6f86ff;",
        "box-shadow:0 0 0 4px rgba(111,134,255,.28),0 0 24px rgba(111,134,255,.5);",
        "background:rgba(111,134,255,.08);pointer-events:none;transition:all .3s cubic-bezier(.2,.9,.3,1);",
        "animation:dmtPulse 1.6s ease-in-out infinite}",
      "@keyframes dmtPulse{0%,100%{box-shadow:0 0 0 4px rgba(111,134,255,.28),0 0 24px rgba(111,134,255,.4)}",
        "50%{box-shadow:0 0 0 8px rgba(111,134,255,.12),0 0 30px rgba(111,134,255,.7)}}",
      ".dmt-card{position:absolute;width:min(86vw,340px);box-sizing:border-box;padding:18px 18px 14px;",
        "border-radius:20px;background:linear-gradient(160deg,rgba(24,27,38,.97),rgba(14,16,22,.97));",
        "border:1px solid rgba(255,255,255,.12);box-shadow:0 24px 60px rgba(0,0,0,.6);text-align:center;color:#fff}",
      ".dmt-card.pop{animation:dmtPop .34s cubic-bezier(.2,1.4,.35,1)}",
      "@keyframes dmtPop{0%{transform:translate(-50%,-50%) scale(.9)}100%{transform:translate(-50%,-50%) scale(1)}}",
      ".dmt-skip{position:absolute;top:10px;right:12px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);",
        "color:#c8cede;font-size:11.5px;font-weight:800;padding:5px 10px;border-radius:999px;cursor:pointer}",
      ".dmt-art{display:flex;align-items:center;justify-content:center;margin:2px 0 10px;min-height:52px}",
      ".dmt-emoji{font-size:40px;line-height:1;filter:drop-shadow(0 6px 14px rgba(0,0,0,.4));animation:dmtBob 1.8s ease-in-out infinite}",
      ".dmt-emoji.big{font-size:52px}",
      "@keyframes dmtBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}",
      ".dmt-svg{width:120px;height:auto;overflow:visible}",
      ".dmt-walkie{animation:dmtBob 2s ease-in-out infinite}",
      ".dmt-ptt{animation:dmtPtt 1s ease-in-out infinite;transform-origin:60px 60px;transform-box:fill-box}",
      "@keyframes dmtPtt{0%,100%{transform:scale(1)}50%{transform:scale(.82)}}",
      ".dmt-wave{transform-origin:86px 60px;animation:dmtWave 1.2s ease-in-out infinite}",
      "@keyframes dmtWave{0%,100%{opacity:.4;transform:scale(.9)}50%{opacity:1;transform:scale(1.08)}}",
      ".dmt-kicker{font-size:11.5px;font-weight:900;color:#ffd166;margin-bottom:7px}",
      ".dmt-title{font-size:19px;font-weight:950;letter-spacing:-.4px;margin-bottom:8px}",
      ".dmt-body{font-size:13.5px;line-height:1.6;color:#c3c9d6}",
      ".dmt-body b{color:#fff;font-weight:900}",
      ".dmt-foot{display:flex;align-items:center;justify-content:space-between;margin-top:16px}",
      ".dmt-dots{display:flex;gap:6px}",
      ".dmt-dot{width:6px;height:6px;border-radius:999px;background:rgba(255,255,255,.24);transition:.3s}",
      ".dmt-dot.on{width:18px;background:#6f86ff}",
      ".dmt-next{background:#fff;color:#0b0d16;font-size:13.5px;font-weight:950;border:0;border-radius:999px;",
        "padding:10px 20px;cursor:pointer}",
      ".dmt-next:active{transform:scale(.95)}",
      "@media (prefers-reduced-motion:reduce){.dmt *{animation:none!important}}"
    ].join("");
    document.head.appendChild(st);
  }

  /* DM 리스트(탭)가 그려질 때까지 대기 후 시작 — 스포트라이트 타깃이 있어야 하니까 */
  var tries = 0;
  var t = setInterval(function () {
    if (document.querySelector('#dm-root .dm-tabs [data-tab="pager"]')) { clearInterval(t); setTimeout(boot, 400); }
    else if (++tries > 60) clearInterval(t);   // 30초 안에 안 뜨면 포기(조용히)
  }, 500);
})();
