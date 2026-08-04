/* ============================================================================
   ✍️ 쓰기 선택 페이지 안내 — 상단 접이식 배너 + 첫 진입 코치마크
   ----------------------------------------------------------------------------
   핵심 목적: "뭘 써야 할지 모르겠다"를 없앤다.
   유형별 '언제 쓰는가'를 한 줄로 못 박고, 각 카드로 바로 보낸다.
   - 배너: galla_create_guide_dismissed / _collapsed
   - 코치마크: galla_create_tour_v1 (최초 1회, 카드를 스포트라이트로 지목)
   ========================================================================== */
(function () {
  var IS_CREATE_MPA = document.body.getAttribute("data-page") === "create";
  var IS_SPA = document.body.getAttribute("data-page") === "spa";
  // MPA에선 create 페이지 전용. SPA(app.html)에선 create 뷰 어댑터가 명시 시작한다.
  if (!IS_CREATE_MPA && !IS_SPA) return;

  /* ── 공통 문구(배너·코치마크가 같은 표현을 쓴다) ───────────────────────── */
  var ITEMS = [
    { type: "galla", ic: "⚔️", t: "갈라 발제",
      bn: "<b>편이 갈릴 주제</b>를 던져 전투를 엽니다. 찬반이 팽팽할수록 판이 커져요.",
      kicker: "판을 여는 사람", title: "갈라 발제",
      body: "“이건 사람들 의견 갈리겠다” 싶을 때.<br><b>찬반 두 진영</b>을 세우면 사람들이 몰려와 붙어요." },
    { type: "predict", ic: "🎯", t: "예측 마켓",
      bn: "<b>결과가 나올 일</b>을 걸어요. 맞히면 GP, 소수파일수록 리턴이 큽니다.",
      kicker: "결과로 겨루기", title: "예측 마켓",
      body: "“이거 결국 어떻게 될까?” 싶을 때.<br>날짜가 지나면 <b>정답이 나오는 질문</b>이면 딱이에요." },
    { type: "plaza", ic: "🗣", t: "광장 글",
      bn: "그냥 <b>하고 싶은 말</b>. 글·짤·밈 다 되는 갈라 커뮤니티예요.",
      kicker: "제일 편한 곳", title: "광장 글",
      body: "찬반도 결과도 필요 없어요.<br><b>아무 얘기</b>나 던지고 댓글로 놀면 됩니다. 첫 글은 여기부터." },
    { type: "report", ic: "📸", t: "제보하기",
      bn: "직접 <b>보고 찍은 것</b>을 올려요. 채택되면 <b>GP 보상</b>까지.",
      kicker: "특종은 돈이 된다", title: "제보하기",
      body: "현장 사진·영상·링크가 있다면.<br>갈라가 <b>이슈로 키워주고</b> 채택되면 GP를 드려요." }
  ];

  /* ══ ① 상단 접이식 안내 배너 ═════════════════════════════════════════ */
  var DISMISS = "galla_create_guide_dismissed";
  var COLLAPSE = "galla_create_guide_collapsed";

  function mountBanner() {
    var anchor = document.querySelector(".cr-sub") || document.querySelector(".cr-h1");
    if (!anchor) return false;
    var ex = document.getElementById("cgBox");
    if (ex) { if (ex.__live) return true; var dead = ex.closest(".dmg-wrap"); (dead || ex).remove(); }
    try { if (localStorage.getItem(DISMISS)) return true; } catch (e) {}
    var collapsed = false; try { collapsed = localStorage.getItem(COLLAPSE) === "1"; } catch (e) {}

    var wrap = document.createElement("section");
    wrap.className = "dmg-wrap";
    wrap.innerHTML =
      '<div class="dmg ' + (collapsed ? "" : "open") + '" id="cgBox">' +
        '<button class="dmg-head" id="cgToggle" type="button">' +
          '<span class="dmg-head-ic">🧭</span>' +
          '<span class="dmg-head-t">뭘 쓸지 <b>고민되면 여기부터</b></span>' +
          '<span class="dmg-head-arrow">' + (collapsed ? "▾" : "▴") + "</span>" +
        "</button>" +
        '<div class="dmg-body">' +
          '<div class="dmg-steps">' +
            ITEMS.map(function (x, i) {
              return '<button type="button" class="dmg-step" data-i="' + i + '"><span class="dmg-ic">' + x.ic + "</span>" +
                '<span class="dmg-tx"><b class="dmg-t">' + x.t + '</b><span class="dmg-s">' + x.bn + "</span></span>" +
                '<span class="dmg-go">›</span></button>';
            }).join("") +
          "</div>" +
          '<div class="dmg-foot">' +
            '<button class="dmg-fold" id="cgFold" type="button">접어두기</button>' +
            '<span class="dmg-dot">·</span>' +
            '<button class="dmg-dismiss" id="cgDismiss" type="button">더 이상 안 보기</button>' +
          "</div>" +
        "</div>" +
      "</div>";
    anchor.insertAdjacentElement("afterend", wrap);

    var box = wrap.querySelector("#cgBox");
    box.__live = true;
    wrap.querySelector("#cgToggle").onclick = function () {
      var open = box.classList.toggle("open");
      wrap.querySelector(".dmg-head-arrow").textContent = open ? "▴" : "▾";
      try { localStorage.setItem(COLLAPSE, open ? "0" : "1"); } catch (e) {}
    };
    wrap.querySelector("#cgFold").onclick = function () {
      box.classList.remove("open");
      var a = wrap.querySelector(".dmg-head-arrow"); if (a) a.textContent = "▾";
      try { localStorage.setItem(COLLAPSE, "1"); } catch (e) {}
    };
    wrap.querySelector("#cgDismiss").onclick = function () {
      try { localStorage.setItem(DISMISS, "1"); } catch (e) {}
      wrap.classList.add("dmg-out");
      setTimeout(function () { wrap.remove(); }, 240);
    };
    // 항목 탭 = 해당 유형 카드 클릭(잠긴 카드면 원래 안내가 뜬다)
    wrap.querySelectorAll(".dmg-step").forEach(function (btn) {
      btn.onclick = function () {
        var it = ITEMS[+btn.dataset.i]; if (!it) return;
        var card = document.querySelector('.cr-card[data-type="' + it.type + '"]');
        if (card) card.click();
      };
    });
    return true;
  }

  /* ══ ② 첫 진입 코치마크(스포트라이트) ═══════════════════════════════ */
  var TKEY = "galla_create_tour_v1";
  var STEPS = [{ sel: ".cr-list", icon: "✍️", kicker: "여기서 시작", title: "무엇을 만들까요?",
    body: "갈라의 모든 판은 <b>이 화면에서</b> 시작돼요.<br>넷 중 하나만 고르면 됩니다 — 30초만 볼래요?" }]
    .concat(ITEMS.map(function (x) {
      return { sel: '.cr-card[data-type="' + x.type + '"]', icon: x.ic, kicker: x.kicker, title: x.title, body: x.body, big: true };
    }))
    .concat([{ center: true, icon: "🚀", kicker: "고민 끝", title: "제일 쉬운 건 광장 글",
      body: "처음이면 <b>광장 글</b>부터. 한 줄이어도 돼요.<br>재미 붙으면 발제로 판을 열면 됩니다 👋" }]);

  var idx = 0, OV = null;

  function boot() {
    try { localStorage.setItem(TKEY, "1"); } catch (e) {}   // ✅ 뜨는 즉시 '봤음' — 중간에 나가도 재발 안 함
    injectCSS();
    OV = document.createElement("div");
    OV.className = "dmt";
    OV.innerHTML =
      '<div class="dmt-scrim"></div><div class="dmt-ring" hidden></div>' +
      '<div class="dmt-card"><i class="dmt-tail" hidden></i>' +
        '<button class="dmt-skip" type="button">건너뛰기 ✕</button>' +
        '<div class="dmt-art"></div><div class="dmt-kicker"></div>' +
        '<div class="dmt-title"></div><div class="dmt-body"></div>' +
        '<div class="dmt-foot"><div class="dmt-dots"></div><button class="dmt-next" type="button">다음</button></div>' +
      "</div>";
    document.body.appendChild(OV);
    var dots = OV.querySelector(".dmt-dots");
    STEPS.forEach(function (_, i) { var d = document.createElement("i"); d.className = "dmt-dot" + (i ? "" : " on"); dots.appendChild(d); });
    OV.querySelector(".dmt-skip").onclick = finish;
    OV.querySelector(".dmt-next").onclick = function () { if (idx >= STEPS.length - 1) return finish(); go(idx + 1); };
    window.addEventListener("resize", reposition);
    requestAnimationFrame(function () { OV.classList.add("show"); go(0); });
  }
  function go(i) {
    idx = i;
    var s = STEPS[i], card = OV.querySelector(".dmt-card");
    OV.querySelector(".dmt-kicker").innerHTML = s.kicker || "";
    OV.querySelector(".dmt-title").innerHTML = s.title || "";
    OV.querySelector(".dmt-body").innerHTML = s.body || "";
    OV.querySelector(".dmt-art").innerHTML = '<div class="dmt-emoji' + (s.big ? " big" : "") + '">' + (s.icon || "✨") + "</div>";
    OV.querySelectorAll(".dmt-dot").forEach(function (d, k) { d.classList.toggle("on", k === i); });
    OV.querySelector(".dmt-next").textContent = (i >= STEPS.length - 1) ? "시작하기 🚀" : "다음";
    reposition();
    card.classList.remove("pop"); void card.offsetWidth; card.classList.add("pop");
    try { window.GALLA_haptic && window.GALLA_haptic(s.big ? "medium" : "light"); } catch (e) {}
  }
  function reposition() {
    if (!OV) return;
    var s = STEPS[idx], ring = OV.querySelector(".dmt-ring"), card = OV.querySelector(".dmt-card"), tail = OV.querySelector(".dmt-tail");
    var el = s && s.sel ? document.querySelector(s.sel) : null;
    var rect = el && el.getBoundingClientRect();
    var vw = window.innerWidth, vh = window.innerHeight;
    if (rect && rect.width && rect.height && rect.bottom > 0 && rect.top < vh) {
      var pad = 8;
      OV.classList.add("spot");
      ring.hidden = false;
      ring.style.left = (rect.left - pad) + "px"; ring.style.top = (rect.top - pad) + "px";
      ring.style.width = (rect.width + pad * 2) + "px"; ring.style.height = (rect.height + pad * 2) + "px";
      card.style.transform = "none";
      var cw = card.offsetWidth || Math.min(vw * 0.86, 340);
      var cx = rect.left + rect.width / 2;
      var left = Math.max(12, Math.min(cx - cw / 2, vw - 12 - cw));
      card.style.left = left + "px";
      var onTop = (vh - rect.bottom) <= 300;
      if (onTop) { card.style.top = "auto"; card.style.bottom = (vh - rect.top + 16) + "px"; }
      else { card.style.bottom = "auto"; card.style.top = (rect.bottom + 16) + "px"; }
      tail.hidden = false;
      tail.style.left = Math.max(18, Math.min(cx - left - 9, cw - 32)) + "px";
      tail.className = "dmt-tail " + (onTop ? "down" : "up");
    } else {
      OV.classList.remove("spot");
      ring.hidden = true; tail.hidden = true;
      card.style.left = "50%"; card.style.bottom = "auto"; card.style.top = "50%";
      card.style.transform = "translate(-50%,-50%)";
    }
  }
  function finish() {
    try { localStorage.setItem(TKEY, "1"); } catch (e) {}
    window.removeEventListener("resize", reposition);
    if (!OV) return;
    OV.classList.remove("show");
    setTimeout(function () { if (OV) OV.remove(); OV = null; }, 260);
  }

  function injectCSS() {
    if (document.getElementById("dmt-css")) return;
    var st = document.createElement("style"); st.id = "dmt-css";
    st.textContent = [
      ".dmt{position:fixed;inset:0;z-index:2147482500;opacity:0;transition:opacity .26s ease;font-family:'Pretendard',system-ui,-apple-system,sans-serif}",
      ".dmt.show{opacity:1}",
      ".dmt-scrim{position:absolute;inset:0;background:rgba(6,8,14,.62);backdrop-filter:blur(1.5px)}",
      ".dmt.spot .dmt-scrim{background:transparent;backdrop-filter:none}",
      ".dmt-ring{position:absolute;border-radius:14px;border:2.5px solid #6f86ff;",
        "box-shadow:0 0 0 4px rgba(111,134,255,.35),0 0 30px rgba(111,134,255,.65),0 0 0 100vmax rgba(4,6,12,.78);",
        "background:transparent;pointer-events:none;transition:all .3s cubic-bezier(.2,.9,.3,1);animation:dmtPulse 1.6s ease-in-out infinite}",
      "@keyframes dmtPulse{0%,100%{box-shadow:0 0 0 4px rgba(111,134,255,.35),0 0 24px rgba(111,134,255,.45),0 0 0 100vmax rgba(4,6,12,.78)}",
        "50%{box-shadow:0 0 0 9px rgba(111,134,255,.15),0 0 34px rgba(111,134,255,.8),0 0 0 100vmax rgba(4,6,12,.78)}}",
      ".dmt-card{position:absolute;width:min(86vw,340px);box-sizing:border-box;padding:18px 18px 14px;border-radius:20px;",
        "background:linear-gradient(160deg,rgba(24,27,38,.97),rgba(14,16,22,.97));border:1px solid rgba(255,255,255,.12);",
        "box-shadow:0 24px 60px rgba(0,0,0,.6);text-align:center;color:#fff}",
      ".dmt-card.pop{animation:dmtPop .34s cubic-bezier(.2,1.4,.35,1)}",
      "@keyframes dmtPop{0%{opacity:0;scale:.92}100%{opacity:1;scale:1}}",
      ".dmt-tail{position:absolute;width:18px;height:18px;background:linear-gradient(160deg,rgba(24,27,38,.97),rgba(14,16,22,.97));",
        "border:1px solid rgba(111,134,255,.5);transform:rotate(45deg)}",
      ".dmt-tail.up{top:-10px;border-right:0;border-bottom:0}",
      ".dmt-tail.down{bottom:-10px;border-left:0;border-top:0}",
      ".dmt-skip{position:absolute;top:10px;right:12px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);",
        "color:#c8cede;font-size:11.5px;font-weight:800;padding:5px 10px;border-radius:999px;cursor:pointer}",
      ".dmt-art{display:flex;align-items:center;justify-content:center;margin:2px 0 10px;min-height:52px}",
      ".dmt-emoji{font-size:40px;line-height:1;filter:drop-shadow(0 6px 14px rgba(0,0,0,.4));animation:dmtBob 1.8s ease-in-out infinite}",
      ".dmt-emoji.big{font-size:52px}",
      "@keyframes dmtBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}",
      ".dmt-kicker{font-size:11.5px;font-weight:900;color:#ffd166;margin-bottom:7px}",
      ".dmt-title{font-size:19px;font-weight:950;letter-spacing:-.4px;margin-bottom:8px}",
      ".dmt-body{font-size:13.5px;line-height:1.6;color:#c3c9d6}",
      ".dmt-body b{color:#fff;font-weight:900}",
      ".dmt-foot{display:flex;align-items:center;justify-content:space-between;margin-top:16px}",
      ".dmt-dots{display:flex;gap:6px}",
      ".dmt-dot{width:6px;height:6px;border-radius:999px;background:rgba(255,255,255,.24);transition:.3s}",
      ".dmt-dot.on{width:18px;background:#6f86ff}",
      ".dmt-next{background:#fff;color:#0b0d16;font-size:13.5px;font-weight:950;border:0;border-radius:999px;padding:10px 20px;cursor:pointer}",
      ".dmt-next:active{transform:scale(.95)}",
      "@media (prefers-reduced-motion:reduce){.dmt *{animation:none!important}}"
    ].join("");
    document.head.appendChild(st);
  }

  /* ── 부팅 ─────────────────────────────────────────────────────────────── */
  var pollT = null;
  function start() {
    stop();
    var tries = 0;
    pollT = setInterval(function () {
      if (document.querySelector('.cr-card[data-type="plaza"]')) {
        mountBanner();
        var done = true; try { done = !!localStorage.getItem(TKEY); } catch (e) {}
        if (!done && !OV) setTimeout(boot, 350);   // 코치마크는 최초 1회
        if (++tries > 60) { clearInterval(pollT); pollT = null; }
        return;
      }
      if (++tries > 60) { clearInterval(pollT); pollT = null; }
    }, 500);
  }
  function stop() {
    if (pollT) { clearInterval(pollT); pollT = null; }
    // 코치마크 오버레이는 body 소속 — 뷰가 사라질 때 같이 걷는다(SPA unmount)
    if (OV) {
      window.removeEventListener("resize", reposition);
      try { OV.remove(); } catch (e) {}
      OV = null;
    }
  }
  // SPA(app.html) 훅 — create 뷰 mount/unmount에서 호출(재-mount에도 배너·코치마크 복원)
  window.GALLA_CREATE_GUIDE_START = start;
  window.GALLA_CREATE_GUIDE_STOP = stop;

  if (IS_CREATE_MPA) start();   // MPA는 기존처럼 자동 시작
})();
