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
  var DISMISS = "galla_index_guide_dismissed";
  var COLLAPSE = "galla_index_guide_collapsed";
  var PROJ = "bidqauputnhkqepvdzrr";

  function loggedIn() { try { return !!localStorage.getItem("sb-" + PROJ + "-auth-token"); } catch (e) { return false; } }
  // 🎁 +500 GP는 로그인 시 supabase.js가 서버(claim_welcome_bonus)로 자동 지급 — 여긴 안내만.

  try { if (localStorage.getItem(DISMISS)) return; } catch (e) { return; }

  var STEPS = [
    { ic: "👊", t: "편 갈라 싸우기", s: "이슈마다 👍/👎 <b>진영</b>을 골라 참전. 회색분자는 문 앞에서 컷!" },
    { ic: "🎯", t: "갈라예측", s: "결과를 맞히면 GP <b>왕창</b>. 소수파일수록 리턴이 커져요." },
    { ic: "📟", t: "갈라톡 (메신저)", s: "<b>무전기</b>(꾹 눌러 말하기)·삐삐·음성/영상통화까지. 카톡 은퇴각." },
    { ic: "🗣️", t: "광장", s: "짤·밈·드립 다 받아주는 <b>아무말 대잔치</b>. 댓글로 전투도." },
    { ic: "🧠", t: "갈라뉴스", s: "여러 기사를 <b>AI가 3줄</b>로 씹어서 떠먹여줘요." },
    { ic: "🤩", t: "크리에이터", s: "유튜브처럼 <b>크리에이터</b>로 활동. (자세한 안내는 곧!)" }
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
            STEPS.map(function (x) {
              return '<div class="iog-step"><span class="iog-ic">' + x.ic + '</span>' +
                '<span class="iog-tx"><b class="iog-t">' + x.t + "</b><span class=\"iog-s\">" + x.s + "</span></span></div>";
            }).join("") +
          "</div>" +
          '<div class="iog-foot">' +
            '<button class="iog-cta" id="iogStart" type="button">' + (loggedIn() ? "시작하기 →" : "🎁 가입하고 +500 GP 받기") + "</button>" +
            '<button class="iog-dismiss" id="iogDismiss" type="button">더 이상 안 보기</button>' +
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
    wrap.querySelector("#iogStart").onclick = function () { start(wrap); };
  }

  function remove(wrap) {
    try { localStorage.setItem(DISMISS, "1"); } catch (e) {}
    wrap.classList.add("iog-out");
    setTimeout(function () { wrap.remove(); }, 260);
  }

  function start(wrap) {
    if (loggedIn()) {
      remove(wrap);   // 이미 회원 — 웰컴 GP는 로그인 때 자동 지급됨. 안내만 치운다.
    } else {
      // 미로그인 → 가입 유도. +500 GP는 가입 후 첫 로그인에서 supabase.js가 서버 지급.
      try { localStorage.setItem(DISMISS, "1"); } catch (e) {}
      location.href = "signup.html";
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
      ".iog-step{display:flex;gap:12px;align-items:flex-start;padding:9px 0;border-top:1px solid rgba(255,255,255,.05)}",
      ".iog-step:first-child{border-top:0}",
      ".iog-ic{font-size:22px;line-height:1.1;flex:0 0 auto;width:26px;text-align:center}",
      ".iog-tx{min-width:0;display:flex;flex-direction:column;gap:2px}",
      ".iog-t{font-size:14px;font-weight:900;color:#fff}",
      ".iog-s{font-size:12.5px;line-height:1.5;color:#a7afc0}",
      ".iog-s b{color:#dfe4f0;font-weight:800}",
      ".iog-foot{display:flex;gap:8px;padding:6px 14px 14px}",
      ".iog-cta{flex:1;padding:12px;border:0;border-radius:12px;font-size:14px;font-weight:950;cursor:pointer;color:#fff;",
        "background:linear-gradient(135deg,#ff4d67,#ff2d55);box-shadow:0 8px 20px rgba(255,45,85,.3)}",
      ".iog-cta:active{transform:scale(.98)}",
      ".iog-dismiss{flex:0 0 auto;padding:12px 14px;border:1px solid rgba(255,255,255,.14);border-radius:12px;",
        "background:rgba(255,255,255,.05);color:#9aa1b2;font-size:12.5px;font-weight:800;cursor:pointer}",
      ".iog-dismiss:active{transform:scale(.98)}"
    ].join("");
    document.head.appendChild(s);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();
