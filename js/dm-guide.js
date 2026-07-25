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

  // tab: 클릭 시 이동할 DM 탭(data-tab). 순서 = 채팅(메인)→통화→무전기→삐삐→난장→육성(사장님 확정)
  var STEPS = [
    { ic: "💬", t: "채팅", s: "여기가 <b>메인</b> — 1:1·단체 채팅. 사진·음성·GIF·<b>비밀대화</b>까지.", tab: "chats" },
    { ic: "📞", t: "육성톡 · 면상톡", s: "음성·영상통화 <b>공짜</b>. 친구를 꾹 누르면 바로 걸어요.", tab: "friends" },
    { ic: "📻", t: "무전기", s: "대화방에서 <b>꾹 누르면 말하고 떼면 전송</b> — 무전기처럼 실시간.", tab: "chats" },
    { ic: "📟", t: "삐삐", s: "<b>8282</b> 쳐서 호출하는 90년대 감성. 암호책 해독은 덤 ㅋㅋ", tab: "pager" },
    { ic: "🎪", t: "난장 (오픈챗)", s: "주제 하나로 아무나 뛰어드는 <b>오픈 수다방</b>. 사진·음성·GIF 다 됨.", tab: "rooms" },
    { ic: "🎙", t: "육성 난장 (라이브)", s: "클럽하우스처럼 <b>목소리로 떠드는</b> 실시간 토크. 무대·리액션·💸 쏘기!", tab: "rooms" }
  ];

  function mount() {
    var tabs = document.querySelector(".dm-tabs");
    if (!tabs) return false;
    // 스냅샷 잔상의 '죽은 복제'(핸들러 없음) 감지 — 살아있는 마운트만 __live 보유. 죽었으면 교체.
    var ex = document.getElementById("dmgBox");
    if (ex) {
      if (ex.__live) return false;
      var dead = ex.closest(".dmg-wrap"); (dead || ex).remove();
    }
    /* 스타일은 css/dm-quiet.css 상주(스냅샷 잔상 무스타일 번쩍임 방지) */
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
    box.__live = true;   // 살아있는 마운트 표식(스냅샷 복제와 구분)
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


  // DM UI는 JS 렌더 + 재렌더될 수 있음 — 탭이 보이는데 배너가 없으면 언제든 다시 꽂는다
  var t = setInterval(function () {
    try { if (localStorage.getItem(DISMISS)) { clearInterval(t); return; } } catch (e) {}
    var ex = document.getElementById("dmgBox");
    if (document.querySelector(".dm-tabs") && (!ex || !ex.__live)) mount();
  }, 700);
})();
