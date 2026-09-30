/* 🏛 광장 채널 — 세그먼트(광장 피드/탐색/내 채널) + 채널 발견·구독.
   plaza.js(module)는 건드리지 않는다. 채널 선택은 기존 카테고리 칩을 .click() 해서
   재활용한다(백엔드 무변경, plaza_posts.category 문자열 매칭 그대로).
   구독은 localStorage(galla_plaza_channels) — 1차. MPA/search.html + SPA/trend.js 양쪽 로드.
   SPA 재주입 대비: data-pcbound 가드로 중복 바인딩 방지, 요소 없으면 조용히 skip. */
(function () {
  var SUB_KEY = "galla_plaza_channels";
  var EMO = {
    "정치": "🗳️", "사회": "🏛️", "경제": "📈", "투자": "💰", "직장": "🏢",
    "커리어·이직": "🧭", "연애": "💘", "결혼·육아": "👶", "인간관계": "🤝",
    "일상": "☕", "패션·뷰티": "💄", "엔터": "🎬", "스포츠": "⚽",
    "여행": "✈️", "맛집": "🍜", "가치·논쟁": "⚖️", "불만·푸념": "😤",
    "19금": "🔞", "기타": "📌"
  };

  function panel() { return document.querySelector('.tab-panel[data-panel="plaza"]'); }
  function getSubs() { try { return JSON.parse(localStorage.getItem(SUB_KEY) || "[]"); } catch (_) { return []; } }
  function setSubs(a) { try { localStorage.setItem(SUB_KEY, JSON.stringify(a)); } catch (_) {} }
  function isSub(n) { return getSubs().indexOf(n) >= 0; }
  function toggleSub(n) {
    var s = getSubs(), i = s.indexOf(n);
    if (i >= 0) s.splice(i, 1); else s.push(n);
    setSubs(s); return i < 0;
  }
  function channels(p) {
    // 카테고리 칩(전체 제외)이 곧 채널 목록 — 단일 소스
    return Array.prototype.map.call(p.querySelectorAll(".plaza-categories button"), function (b) {
      return b.textContent.trim();
    }).filter(function (n) { return n && n !== "전체"; });
  }
  var GRAD = {
    "정치": "linear-gradient(135deg,#8a5aff,#5a6bff)", "사회": "linear-gradient(135deg,#6f86ff,#4361ff)",
    "경제": "linear-gradient(135deg,#2fd07a,#1f9d5e)", "투자": "linear-gradient(135deg,#ffcf5a,#ff9a5a)",
    "직장": "linear-gradient(135deg,#5ab0ff,#4361ff)", "커리어·이직": "linear-gradient(135deg,#4d8dff,#6f86ff)",
    "연애": "linear-gradient(135deg,#ff5a9a,#ff5a6e)", "결혼·육아": "linear-gradient(135deg,#ff8a5a,#ff5a9a)",
    "인간관계": "linear-gradient(135deg,#36c2a0,#2fd07a)", "일상": "linear-gradient(135deg,#a4abb8,#6b7280)",
    "패션·뷰티": "linear-gradient(135deg,#ff5a9a,#c15aff)", "엔터": "linear-gradient(135deg,#ffcf5a,#ff9a5a)",
    "스포츠": "linear-gradient(135deg,#2fd07a,#36c2a0)", "여행": "linear-gradient(135deg,#4d8dff,#6f86ff)",
    "맛집": "linear-gradient(135deg,#ff9a5a,#ff5a6e)", "가치·논쟁": "linear-gradient(135deg,#8a5aff,#5a6bff)",
    "불만·푸념": "linear-gradient(135deg,#ff5a6e,#c14a4a)", "19금": "linear-gradient(135deg,#c15aff,#8a5aff)",
    "기타": "linear-gradient(135deg,#6b7280,#4b5563)"
  };
  function chRow(n, i) {
    var sub = isSub(n);
    return '<div class="plaza-ch" data-ch="' + n + '" style="--i:' + (i || 0) + '">' +
             '<span class="plaza-ch-av" style="background:' + (GRAD[n] || "linear-gradient(135deg,#3a4fff,#6f86ff)") + '">' + (EMO[n] || "💬") + '</span>' +
             '<span class="plaza-ch-n">' + n + '</span>' +
             '<button class="plaza-ch-sub' + (sub ? " on" : "") + '" data-sub="' + n + '">' + (sub ? "구독중" : "＋ 구독") + '</button>' +
           '</div>';
  }

  function goChannel(p, name) {
    showSeg(p, "feed");
    var btns = p.querySelectorAll(".plaza-categories button"), i;
    for (i = 0; i < btns.length; i++) {
      if (btns[i].textContent.trim() === name) { btns[i].click(); break; }
    }
    var sc = p.querySelector(".plaza-cview, #plaza-list");
    if (sc && sc.scrollIntoView) { /* 목록 상단 유지 */ }
  }

  function renderExplore(p) {
    var box = p.querySelector("#plaza-explore");
    var list = channels(p);
    box.innerHTML =
      '<div class="plaza-csect">🔥 채널 둘러보기</div>' +
      list.map(function (n, i) { return chRow(n, i); }).join("");
  }
  function renderMine(p) {
    var box = p.querySelector("#plaza-mine");
    var subs = getSubs();
    if (!subs.length) {
      box.innerHTML = '<div class="plaza-cempty">아직 구독한 채널이 없어요.<br><b>탐색</b>에서 관심 채널을 구독해 보세요.</div>';
      return;
    }
    box.innerHTML = '<div class="plaza-csect">내 채널</div>' + subs.map(function (n, i) { return chRow(n, i); }).join("");
  }

  function showSeg(p, s) {
    p.querySelectorAll("#plaza-seg button").forEach(function (b) {
      b.classList.toggle("active", b.dataset.pseg === s);
    });
    var feed = s === "feed";
    var cats = p.querySelector(".plaza-categories"),
        tool = p.querySelector(".plaza-toolbar"),
        list = p.querySelector("#plaza-list"),
        exp = p.querySelector("#plaza-explore"),
        mine = p.querySelector("#plaza-mine");
    if (cats) cats.hidden = !feed;
    if (tool) tool.hidden = !feed;
    if (list) list.hidden = !feed;
    if (exp) exp.hidden = s !== "explore";
    if (mine) mine.hidden = s !== "mine";
    if (s === "explore") renderExplore(p);
    if (s === "mine") renderMine(p);
  }

  function bind() {
    var p = panel();
    if (!p || p.dataset.pcbound) return;
    p.dataset.pcbound = "1";

    p.querySelector("#plaza-seg").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-pseg]");
      if (b) showSeg(p, b.dataset.pseg);
    });

    // 탐색·내채널 뷰 위임: 구독 토글 / 채널 진입
    ["#plaza-explore", "#plaza-mine"].forEach(function (sel) {
      var box = p.querySelector(sel);
      if (!box) return;
      box.addEventListener("click", function (e) {
        var sb = e.target.closest("[data-sub]");
        if (sb) {
          var on = toggleSub(sb.dataset.sub);
          sb.classList.toggle("on", on);
          sb.textContent = on ? "구독중" : "＋ 구독";
          e.stopPropagation();
          return;
        }
        var ch = e.target.closest("[data-ch]");
        if (ch) goChannel(p, ch.dataset.ch);
      });
    });

    showSeg(p, "feed");
  }

  // 즉시 시도 + DOM 준비/SPA 재주입 대비
  bind();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  window.GALLA_bindPlazaChannels = bind;
})();
