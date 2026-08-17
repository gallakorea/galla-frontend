/* ============================================================================
   📈 트렌드 상단 안내 배너 — dm-guide와 동일 패턴(접기/더 이상 안 보기)
   항목 탭 = 해당 트렌드 탭(.tab-item[data-tab]) 클릭. 스타일 = css/guide-banner.css
   ========================================================================== */
(function () {
  /* 공식 YouTube 아이콘 — 이 항목은 유튜브 섹션으로 가는 입구다(저작자 표시).
     ⚠️ 무변형·풀컬러·20dp 이상. 다른 항목은 이모지지만 여기만 공식 자산을 쓴다. */
  var YT_ICON = '<svg class="yt-official" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-label="YouTube"><path fill="#FF0000" d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z"/><path fill="#fff" d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>';
  // MPA: body[data-page=trend] / SPA: 트렌드 뷰 호스트가 마운트된 뒤 로드됨
  if (document.body.getAttribute("data-page") !== "trend"
      && !document.querySelector('.view-host[data-page="trend"]')) return;
  var DISMISS = "galla_trend_guide_dismissed";
  var COLLAPSE = "galla_trend_guide_collapsed";
  try { if (localStorage.getItem(DISMISS)) return; } catch (e) { return; }

  var STEPS = [
    { ic: "🔎", t: "통합검색", s: "이슈·예측·뉴스·유튜브·광장까지 <b>한 방에 검색</b>.", tab: "search" },
    { ic: "🔥", t: "핫트렌드", s: "지금 뜨는 <b>실시간 키워드</b>. 트민남·트민녀 필수 코스.", tab: "trending" },
    { ic: "🧠", t: "갈라뉴스", s: "여러 기사를 <b>AI가 3줄</b>로 씹어서 떠먹여줘요.", tab: "news" },
    { ic: YT_ICON, t: "핫튜브", s: "지금 터지는 <b>유튜브 인기 영상</b> 몰아보기.", tab: "hot" },
    { ic: "🗣", t: "광장", s: "글·짤·밈으로 노는 <b>갈라 커뮤니티</b>. 글도 바로 써요.", tab: "plaza" }
  ];

  function mount() {
    var anchor = document.querySelector(".tabs-header");
    if (!anchor) return false;
    // ⚠️ 스냅샷 잔상이 복원한 '죽은 복제'(핸들러 없는 정적 HTML) 감지 — 살아있는 마운트는
    //    __live 프로퍼티가 있다(innerHTML 복제엔 프로퍼티가 없음). 죽은 놈이면 걷어내고 새로 꽂는다.
    //    (사장님 재현: 접어두기 눌러도 무반응 — 잔상 배너를 누르고 있었다)
    var ex = document.getElementById("tgBox");
    if (ex) {
      if (ex.__live) return false;
      var dead = ex.closest(".dmg-wrap"); (dead || ex).remove();
    }
    var collapsed = false; try { collapsed = localStorage.getItem(COLLAPSE) === "1"; } catch (e) {}

    var wrap = document.createElement("section");
    wrap.className = "dmg-wrap";
    wrap.innerHTML =
      '<div class="dmg ' + (collapsed ? "" : "open") + '" id="tgBox">' +
        '<button class="dmg-head" id="tgToggle" type="button">' +
          '<span class="dmg-head-ic">📈</span>' +
          '<span class="dmg-head-t">트렌드 <b>이렇게 놀아요</b></span>' +
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
            '<button class="dmg-fold" id="tgFold" type="button">접어두기</button>' +
            '<span class="dmg-dot">·</span>' +
            '<button class="dmg-dismiss" id="tgDismiss" type="button">더 이상 안 보기</button>' +
          "</div>" +
        "</div>" +
      "</div>";
    anchor.insertAdjacentElement("afterend", wrap);   // 탭 바로 아래 = 콘텐츠 최상단

    var box = wrap.querySelector("#tgBox");
    box.__live = true;   // 살아있는 마운트 표식(스냅샷 복제와 구분)
    wrap.querySelector("#tgToggle").onclick = function () {
      var open = box.classList.toggle("open");
      wrap.querySelector(".dmg-head-arrow").textContent = open ? "▴" : "▾";
      try { localStorage.setItem(COLLAPSE, open ? "0" : "1"); } catch (e) {}
    };
    wrap.querySelector("#tgDismiss").onclick = function () {
      try { localStorage.setItem(DISMISS, "1"); } catch (e) {}
      wrap.classList.add("dmg-out");
      setTimeout(function () { wrap.remove(); }, 240);
    };
    wrap.querySelector("#tgFold").onclick = function () {
      box.classList.remove("open");
      var a = wrap.querySelector(".dmg-head-arrow"); if (a) a.textContent = "▾";
      try { localStorage.setItem(COLLAPSE, "1"); } catch (e) {}
    };
    wrap.querySelectorAll(".dmg-step").forEach(function (btn) {
      btn.onclick = function () {
        var step = STEPS[+btn.dataset.i]; if (!step) return;
        var tb = document.querySelector('.tab-item[data-tab="' + step.tab + '"]');
        if (tb) tb.click();
      };
    });
    return true;
  }

  var t = setInterval(function () {
    try { if (localStorage.getItem(DISMISS)) { clearInterval(t); return; } }
    catch (e) {}
    var ex = document.getElementById("tgBox");
    if (document.querySelector(".tabs-header") && (!ex || !ex.__live)) mount();
  }, 700);
})();
