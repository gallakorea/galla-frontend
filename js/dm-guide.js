/* ============================================================================
   💬 DM 상단 오리엔테이션 배너 — 인덱스(index-guide)와 같은 접이식 안내 카드
   ----------------------------------------------------------------------------
   코치마크 투어(dm-tour)로 한 번 안내된 내용을 상시 배너로 최상단에 비치.
   - 헤더 탭 = 접기/펼치기(galla_dm_guide_collapsed)
   - [더 이상 안 보기] = 영구 제거(galla_dm_guide_dismissed)
   - 각 항목 탭 = 해당 DM 탭으로 이동(.dm-tab 클릭)
   ========================================================================== */
(function () {
  if (document.body.getAttribute("data-page") !== "dm") return;
  var DISMISS = "galla_dm_guide_dismissed_v2";
  var COLLAPSE = "galla_dm_guide_collapsed_v2";
  try { if (localStorage.getItem(DISMISS)) return; } catch (e) { return; }

  // tab: 클릭 시 이동할 DM 탭(data-tab)
  var STEPS = [
    { ic: "🎙", t: "육성 난장 (라이브)", s: "클럽하우스처럼 <b>목소리로 떠드는</b> 실시간 토크. 무대·리액션·💸 쏘기!", tab: "rooms" },
    { ic: "📻", t: "무전기", s: "대화방에서 <b>꾹 누르면 말하고 떼면 전송</b> — 무전기처럼 실시간.", tab: "chats" },
    { ic: "🎪", t: "난장 (오픈챗)", s: "주제 하나로 아무나 뛰어드는 <b>오픈 수다방</b>. 사진·음성·GIF 다 됨.", tab: "rooms" },
    { ic: "📟", t: "삐삐", s: "<b>8282</b> 쳐서 호출하는 90년대 감성. 암호책 해독은 덤 ㅋㅋ", tab: "pager" },
    { ic: "📞", t: "육성톡 · 면상톡", s: "음성·영상통화 <b>공짜</b>. 친구 프로필에서 바로 걸어요.", tab: "friends" }
  ];

  function mount() {
    var tabs = document.querySelector(".dm-tabs");
    if (!tabs || document.getElementById("dmgBox")) return false;
    css();
    // 코치마크 투어가 도는 '첫 회차'엔 접어둔다(투어와 겹쳐 산만해지지 않게 — 사장님 확정).
    // 투어를 마친 다음 방문부터 펼쳐진 상태로 등장. (⚠️ 키는 dm-tour.js의 KEY와 동일하게 유지)
    var tourDone = false; try { tourDone = !!localStorage.getItem("galla_dm_tour_v2"); } catch (e) {}
    var collapsed;
    if (!tourDone) collapsed = true;
    else { try { collapsed = localStorage.getItem(COLLAPSE) === "1"; } catch (e) { collapsed = false; } }

    var wrap = document.createElement("section");
    wrap.className = "dmg-wrap";
    wrap.innerHTML =
      '<div class="dmg ' + (collapsed ? "" : "open") + '" id="dmgBox">' +
        '<button class="dmg-head" id="dmgToggle" type="button">' +
          '<span class="dmg-head-ic">📻</span>' +
          '<span class="dmg-head-t">갈라톡 <b>이렇게 놀아요</b></span>' +
          '<span class="dmg-head-arrow">' + (collapsed ? "▾" : "▴") + "</span>" +
        "</button>" +
        '<div class="dmg-body">' +
          '<div class="dmg-steps">' +
            STEPS.map(function (x, i) {
              return '<button type="button" class="dmg-step" data-i="' + i + '"><span class="dmg-ic">' + x.ic + '</span>' +
                '<span class="dmg-tx"><b class="dmg-t">' + x.t + "</b><span class=\"dmg-s\">" + x.s + "</span></span>" +
                '<span class="dmg-go">›</span></button>';
            }).join("") +
          "</div>" +
          '<div class="dmg-foot">' +
            '<button class="dmg-fold" id="dmgFold" type="button">접어두기</button>' +
            '<span class="dmg-dot">·</span>' +
            '<button class="dmg-dismiss" id="dmgDismiss" type="button">더 이상 안 보기</button>' +
          "</div>" +
        "</div>" +
      "</div>";
    tabs.insertAdjacentElement("beforebegin", wrap);   // 탭 칩들보다 위 = DM 최상단

    var box = wrap.querySelector("#dmgBox");
    wrap.querySelector("#dmgToggle").onclick = function () {
      var open = box.classList.toggle("open");
      wrap.querySelector(".dmg-head-arrow").textContent = open ? "▴" : "▾";
      try { localStorage.setItem(COLLAPSE, open ? "0" : "1"); } catch (e) {}
    };
    wrap.querySelector("#dmgDismiss").onclick = function () {
      try { localStorage.setItem(DISMISS, "1"); } catch (e) {}
      wrap.classList.add("dmg-out");
      setTimeout(function () { wrap.remove(); }, 240);
    };
    wrap.querySelector("#dmgFold").onclick = function () {
      box.classList.remove("open");
      var a = wrap.querySelector(".dmg-head-arrow"); if (a) a.textContent = "▾";
      try { localStorage.setItem(COLLAPSE, "1"); } catch (e) {}
    };
    wrap.querySelectorAll(".dmg-step").forEach(function (btn) {
      btn.onclick = function () {
        var step = STEPS[+btn.dataset.i]; if (!step) return;
        var tb = document.querySelector('.dm-tab[data-tab="' + step.tab + '"]');
        if (tb) tb.click();
      };
    });
    return true;
  }

  function css() {
    if (document.getElementById("dmg-css")) return;
    var s = document.createElement("style"); s.id = "dmg-css";
    s.textContent = [
      ".dmg-wrap{padding:0 14px;margin:4px 0 8px;transition:opacity .22s ease,transform .22s ease}",
      ".dmg-wrap.dmg-out{opacity:0;transform:translateY(-8px)}",
      ".dmg{border-radius:16px;overflow:hidden;background:linear-gradient(160deg,#161826,#0e0f16);border:1px solid rgba(111,134,255,.28)}",
      ".dmg-head{display:flex;align-items:center;gap:10px;width:100%;padding:12px 15px;background:none;border:0;cursor:pointer;text-align:left}",
      ".dmg-head-ic{font-size:19px;line-height:1}",
      ".dmg-head-t{flex:1;font-size:13.5px;font-weight:800;color:#cfd6e6}",
      ".dmg-head-t b{color:#fff;font-weight:900}",
      ".dmg-head-arrow{color:#8a93ff;font-size:13px;font-weight:900}",
      ".dmg-body{max-height:0;overflow:hidden;transition:max-height .4s cubic-bezier(.2,.7,.2,1)}",
      ".dmg.open .dmg-body{max-height:700px}",
      ".dmg-steps{padding:2px 14px 4px}",
      ".dmg-step{display:flex;gap:11px;align-items:center;width:100%;padding:9px 0;border:0;border-top:1px solid rgba(255,255,255,.05);",
        "background:none;text-align:left;cursor:pointer;-webkit-tap-highlight-color:transparent}",
      ".dmg-step:first-child{border-top:0}",
      ".dmg-step:active{opacity:.6}",
      ".dmg-ic{font-size:20px;line-height:1.1;flex:0 0 auto;width:24px;text-align:center}",
      ".dmg-go{flex:0 0 auto;color:#6b7488;font-size:18px;font-weight:900;padding-left:4px}",
      ".dmg-tx{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}",
      ".dmg-t{font-size:13.5px;font-weight:900;color:#fff}",
      ".dmg-s{font-size:12px;line-height:1.45;color:#a7afc0}",
      ".dmg-s b{color:#dfe4f0;font-weight:800}",
      ".dmg-foot{display:flex;align-items:center;justify-content:center;gap:8px;padding:4px 14px 12px}",
      ".dmg-dot{color:#4a5163;font-size:12px;font-weight:900}",
      ".dmg-fold,.dmg-dismiss{padding:4px 6px;border:0;background:none;color:#8b93a6;font-size:12px;font-weight:800;",
        "cursor:pointer;-webkit-tap-highlight-color:transparent}",
      ".dmg-fold:active,.dmg-dismiss:active{opacity:.55}"
    ].join("");
    document.head.appendChild(s);
  }

  // DM UI는 JS 렌더 + 재렌더될 수 있음 — 탭이 보이는데 배너가 없으면 언제든 다시 꽂는다
  var t = setInterval(function () {
    try { if (localStorage.getItem(DISMISS)) { clearInterval(t); return; } } catch (e) {}
    if (document.querySelector(".dm-tabs") && !document.getElementById("dmgBox")) mount();
  }, 700);
})();
