/* ============================================================================
   🎪 인덱스 상단 오리엔테이션 배너 — 예측 설명(.pg) 방식의 인라인 안내
   ----------------------------------------------------------------------------
   풀스크린 투어 대신, 인덱스 피드 최상단에 접히는 병맛 안내 카드를 얹는다.
   - 헤더 탭 = 접기/펼치기(galla_index_guide_collapsed)
   - [더 이상 안 보기] = 영구 제거(galla_index_guide_dismissed)
   - [🎁 +500 GP 받고 시작] = claim_tour_bonus(1회) · 미로그인은 가입 유도
   ========================================================================== */
(function () {
  if (document.body.getAttribute("data-page") !== "index") return;
  var DISMISS = "galla_index_guide_dismissed_v2";
  var COLLAPSE = "galla_index_guide_collapsed";
  var PROJ = "bidqauputnhkqepvdzrr";

  // 로그아웃 후 찌꺼기 토큰이 남아 '로그인 중'으로 오판하지 않게 실제 access_token까지 확인
  function loggedIn() {
    try {
      var raw = localStorage.getItem("sb-" + PROJ + "-auth-token");
      if (!raw) return false;
      var t = JSON.parse(raw);
      return !!(t && (t.access_token || (t.currentSession && t.currentSession.access_token)));
    } catch (e) { return false; }
  }
  // 🎁 +500 GP는 로그인 시 supabase.js가 서버(claim_welcome_bonus)로 자동 지급 — 여긴 안내만.

  try { if (localStorage.getItem(DISMISS)) return; } catch (e) { return; }

  var SHELL = false; try { SHELL = window.self !== window.top; } catch (e) { SHELL = true; }
  function toastMsg(m) { try { if (window.GALLA_toast) window.GALLA_toast(m); } catch (e) {} }

  // go: "collapse"=여기(인덱스 피드)로 접기, "soon"=준비중 토스트, {tab,url}=탭 이동
  var STEPS = [
    { ic: "👊", t: "편 갈라 싸우기", s: "이슈마다 👍/👎 <b>진영</b>을 골라 참전. 회색분자는 문 앞에서 컷!", go: "collapse" },
    { ic: "🧡", t: "갈비스 — 내 친구", s: "심심하면 말 걸어요. 나를 <b>기억</b>하고 무조건 <b>내 편</b>부터 들어줌.", go: "galvis" },
    { ic: "🛠", t: "갈비스 — 내 일꾼", s: "“이거 이슈로 만들어줘” → <b>초안 뚝딱</b>. 친구한테 일 시켜도 안 삐짐.", go: "galvis" },
    { ic: "🎬", t: "숏판 · 롱판", s: "세로 <b>숏판</b>은 릴스처럼, 가로 <b>롱판</b>은 유튜브처럼. 영상도 올려요.", tab: "gallari", url: "gallari.html" },
    { ic: "🎯", t: "갈라예측", s: "결과를 맞히면 GP <b>왕창</b>. 소수파일수록 리턴이 커져요.", tab: "predict", url: "galla-predict.html" },
    { ic: "📟", t: "갈라톡 (메신저)", s: "<b>무전기</b>(꾹 눌러 말하기)·삐삐·음성/영상통화까지. 카톡 은퇴각.", tab: "dm", url: "dm.html" },
    { ic: "🔥", t: "트렌드", s: "실시간 검색어·<b>갈라뉴스</b>(AI 3줄)·핫튜브·<b>광장</b>이 한 탭에.", tab: "trend", url: "search.html" },
    { ic: "🏅", t: "마이페이지", s: "<b>갈라리안 등급</b>·지갑·전적, 그리고 내 <b>정치 DNA</b> 4축 분석.", tab: "mypage", url: "mypage.html" },
    { ic: "🤩", t: "크리에이터", s: "받은 후원의 <b>75%</b>가 창작자 몫. 배분·출금 안내.", top: "creator.html" }
  ];

  function mount() {
    var anchor = document.querySelector(".category-section") || document.querySelector(".hero");
    if (!anchor) return;
    css();
    var collapsed = false; try { collapsed = localStorage.getItem(COLLAPSE) === "1"; } catch (e) {}

    var wrap = document.createElement("section");
    wrap.className = "iog-wrap";
    wrap.innerHTML =
      '<div class="iog ' + (collapsed ? "" : "open") + '" id="iogBox">' +
        '<button class="iog-head" id="iogToggle" type="button">' +
          '<span class="iog-head-ic">🎪</span>' +
          '<span class="iog-head-t">처음이세요? <b>갈라는 이렇게 놀아요</b></span>' +
          '<span class="iog-head-arrow">' + (collapsed ? "▾" : "▴") + "</span>" +
        "</button>" +
        '<div class="iog-body">' +
          '<div class="iog-steps">' +
            STEPS.map(function (x, i) {
              return '<button type="button" class="iog-step" data-i="' + i + '"><span class="iog-ic">' + x.ic + '</span>' +
                '<span class="iog-tx"><b class="iog-t">' + x.t + "</b><span class=\"iog-s\">" + x.s + "</span></span>" +
                '<span class="iog-go">›</span></button>';
            }).join("") +
          "</div>" +
          '<div class="iog-foot">' +
            '<div class="iog-foot-sec">' +
              '<button class="iog-fold" id="iogFold" type="button">접어두기</button>' +
              '<span class="iog-foot-dot">·</span>' +
              '<button class="iog-dismiss" id="iogDismiss" type="button">더 이상 안 보기</button>' +
            "</div>" +
            (loggedIn() ? "" : '<button class="iog-cta" id="iogStart" type="button">🎁 가입하고 +500 GP 받기</button>') +
          "</div>" +
        "</div>" +
      "</div>";
    anchor.insertAdjacentElement("afterend", wrap);

    var box = wrap.querySelector("#iogBox");
    wrap.querySelector("#iogToggle").onclick = function () {
      var open = box.classList.toggle("open");
      wrap.querySelector(".iog-head-arrow").textContent = open ? "▴" : "▾";
      try { localStorage.setItem(COLLAPSE, open ? "0" : "1"); } catch (e) {}
    };
    wrap.querySelector("#iogDismiss").onclick = function () { remove(wrap); };
    wrap.querySelector("#iogFold").onclick = function () { collapse(wrap); };
    var startBtn = wrap.querySelector("#iogStart");
    if (startBtn) startBtn.onclick = function () { start(wrap); };
    // 각 설명 클릭 → 해당 페이지로 이동(셸이면 탭 전환, 아니면 URL)
    wrap.querySelectorAll(".iog-step").forEach(function (btn) {
      btn.onclick = function () { navTo(STEPS[+btn.dataset.i], wrap); };
    });
  }

  function collapse(wrap) {
    var box = wrap.querySelector("#iogBox");
    if (box) box.classList.remove("open");
    var arw = wrap.querySelector(".iog-head-arrow"); if (arw) arw.textContent = "▾";
    try { localStorage.setItem(COLLAPSE, "1"); } catch (e) {}
  }

  function navTo(step, wrap) {
    if (!step) return;
    if (step.go === "collapse") return collapse(wrap);   // 편 갈라 싸우기 = 여기 피드 → 접어서 보여줌
    if (step.go === "soon") return toastMsg("곧 공개돼요! 🚀");
    // 🧡 갈비스 = 페이지 이동이 아니라 대화창을 그 자리에서 연다(설명보다 한 번 말 걸어보는 게 빠름)
    if (step.go === "galvis") {
      if (window.GALLA_openFriend) { window.GALLA_openFriend(); return; }
      var orb = document.getElementById("frOrb");
      if (orb) { orb.click(); return; }
      if (SHELL) { try { window.parent.postMessage({ galla: "shell", t: "galvis" }, location.origin); return; } catch (e) {} }
      return toastMsg("우측 하단 갈비스 버튼을 눌러보세요 🧡");
    }
    // 판(5탭) 밖 페이지(크리에이터 센터 등) → 최상위 이동
    if (step.top) {
      if (SHELL) { try { window.parent.postMessage({ galla: "shell", t: "goto", url: step.top }, location.origin); return; } catch (e) {} }
      location.href = step.top; return;
    }
    // 탭 이동(+뉴스·광장 서브탭)
    if (SHELL && step.tab) { try { window.parent.postMessage({ galla: "shell", t: "nav", tab: step.tab, subTab: step.subtab }, location.origin); return; } catch (e) {} }
    if (step.url) location.href = step.url;
  }

  function remove(wrap) {
    try { localStorage.setItem(DISMISS, "1"); } catch (e) {}
    wrap.classList.add("iog-out");
    setTimeout(function () { wrap.remove(); }, 260);
  }

  function start(wrap) {
    if (loggedIn()) {
      collapse(wrap);   // 이미 회원 — 제거 아님 '접기'. 영구 제거는 [더 이상 안 보기]만.
    } else {
      // 미로그인 → 가입 유도만. 영구 제거는 [더 이상 안 보기]에서만.
      // (여기서 DISMISS를 세팅하면 가입 안 하고 돌아왔을 때 배너가 영영 안 나온다)
      (window.GALLA_nav||function(u){location.href=u})("signup.html");
    }
  }

  function css() {
    if (document.getElementById("iog-css")) return;
    var s = document.createElement("style"); s.id = "iog-css";
    s.textContent = [
      ".iog-wrap{padding:0 14px;margin:2px 0 10px;transition:opacity .24s ease,transform .24s ease}",
      ".iog-wrap.iog-out{opacity:0;transform:translateY(-8px)}",
      ".iog{border-radius:16px;overflow:hidden;background:linear-gradient(160deg,#161826,#0e0f16);",
        "border:1px solid rgba(111,134,255,.28)}",
      ".iog-head{display:flex;align-items:center;gap:10px;width:100%;padding:13px 15px;background:none;border:0;cursor:pointer;text-align:left}",
      ".iog-head-ic{font-size:20px;line-height:1}",
      ".iog-head-t{flex:1;font-size:14px;font-weight:800;color:#cfd6e6}",
      ".iog-head-t b{color:#fff;font-weight:900}",
      ".iog-head-arrow{color:#8a93ff;font-size:13px;font-weight:900}",
      ".iog-body{max-height:0;overflow:hidden;transition:max-height .45s cubic-bezier(.2,.7,.2,1)}",
      ".iog.open .iog-body{max-height:900px}",
      ".iog-steps{padding:2px 14px 4px}",
      ".iog-step{display:flex;gap:12px;align-items:center;width:100%;padding:10px 0;border:0;border-top:1px solid rgba(255,255,255,.05);",
        "background:none;text-align:left;cursor:pointer;-webkit-tap-highlight-color:transparent}",
      ".iog-step:first-child{border-top:0}",
      ".iog-step:active{opacity:.6}",
      ".iog-ic{font-size:22px;line-height:1.1;flex:0 0 auto;width:26px;text-align:center}",
      ".iog-go{flex:0 0 auto;color:#6b7488;font-size:20px;font-weight:900;padding-left:4px}",
      ".iog-tx{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}",
      ".iog-t{font-size:14px;font-weight:900;color:#fff}",
      ".iog-s{font-size:12.5px;line-height:1.5;color:#a7afc0}",
      ".iog-s b{color:#dfe4f0;font-weight:800}",
      ".iog-foot{display:flex;flex-direction:column;gap:10px;padding:8px 14px 14px}",
      ".iog-foot-sec{display:flex;align-items:center;justify-content:center;gap:8px}",
      ".iog-foot-dot{color:#4a5163;font-size:12px;font-weight:900}",
      ".iog-fold,.iog-dismiss{padding:4px 6px;border:0;background:none;color:#8b93a6;font-size:12.5px;font-weight:800;",
        "cursor:pointer;-webkit-tap-highlight-color:transparent}",
      ".iog-fold:active,.iog-dismiss:active{opacity:.55}",
      ".iog-cta{width:100%;padding:13px;border:0;border-radius:12px;font-size:14.5px;font-weight:950;cursor:pointer;color:#fff;",
        "background:linear-gradient(135deg,#ff4d67,#ff2d55);box-shadow:0 8px 20px rgba(255,45,85,.3)}",
      ".iog-cta:active{transform:scale(.98)}"
    ].join("");
    document.head.appendChild(s);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();
