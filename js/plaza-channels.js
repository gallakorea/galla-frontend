/* 🏛 광장 채널 — 세그먼트(광장 피드/탐색/내 채널) + 채널 발견·구독.
   plaza.js(module)는 건드리지 않는다. 채널 선택은 기존 카테고리 칩을 .click() 해서
   재활용한다(백엔드 무변경, plaza_posts.category 문자열 매칭 그대로).
   구독은 localStorage(galla_plaza_channels) — 1차. MPA/search.html + SPA/trend.js 양쪽 로드.
   SPA 재주입 대비: data-pcbound 가드로 중복 바인딩 방지, 요소 없으면 조용히 skip. */
(function () {
  var SUB_KEY = "galla_plaza_channels";
  var EMO = {
    "자유·수다": "💬", "정치·사회": "🗳️", "경제·투자": "📈", "직장·경력": "🏢",
    "연애·결혼": "💘", "엔터·스포츠": "🎬", "음식·맛집": "🍜", "세계·여행": "✈️",
    "패션·뷰티": "💄", "19금": "🔞"
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
    "자유·수다": "linear-gradient(135deg,#6f86ff,#4361ff)", "정치·사회": "linear-gradient(135deg,#8a5aff,#5a6bff)",
    "경제·투자": "linear-gradient(135deg,#2fd07a,#1f9d5e)", "직장·경력": "linear-gradient(135deg,#5ab0ff,#4361ff)",
    "연애·결혼": "linear-gradient(135deg,#ff5a9a,#ff5a6e)", "엔터·스포츠": "linear-gradient(135deg,#ffcf5a,#ff9a5a)",
    "음식·맛집": "linear-gradient(135deg,#ff9a5a,#ff5a6e)", "세계·여행": "linear-gradient(135deg,#4d8dff,#6f86ff)",
    "패션·뷰티": "linear-gradient(135deg,#ff5a9a,#c15aff)", "19금": "linear-gradient(135deg,#c15aff,#8a5aff)"
  };
  function chRow(n, i) {
    var sub = isSub(n);
    return '<div class="plaza-ch" data-ch="' + n + '" style="--i:' + (i || 0) + '">' +
             '<span class="plaza-ch-av" style="background:' + (GRAD[n] || "linear-gradient(135deg,#3a4fff,#6f86ff)") + '">' + (EMO[n] || "💬") + '</span>' +
             '<span class="plaza-ch-n">' + n + '</span>' +
             '<button class="plaza-ch-sub' + (sub ? " on" : "") + '" data-sub="' + n + '">' + (sub ? "구독중" : "＋ 구독") + '</button>' +
           '</div>';
  }

  var CAMEFROM = "explore";
  function clickCat(p, name) {
    var btns = p.querySelectorAll(".plaza-categories button"), i;
    for (i = 0; i < btns.length; i++) {
      if (btns[i].textContent.trim() === name) { btns[i].click(); break; }
    }
  }
  function goChannel(p, name) {
    var a = p.querySelector("#plaza-seg button.active");
    CAMEFROM = (a && a.dataset.pseg) || "explore";
    renderRoom(p, name);
  }
  function renderRoom(p, name) {
    var grad = GRAD[name] || "linear-gradient(135deg,#3a4fff,#6f86ff)";
    var sub = isSub(name);
    var heads = ["전체", "같이가요", "정보", "자유"].map(function (t, i) {
      return '<span class="pr-head' + (i === 0 ? " on" : "") + '">' + t + "</span>";
    }).join("");
    var room = p.querySelector("#plaza-room");
    room.innerHTML =
      '<button class="pr-back" data-room-back aria-label="뒤로">‹</button>' +
      '<div class="pr-cover" style="background:' + grad + '"></div>' +
      '<div class="pr-top">' +
        '<span class="pr-av" style="background:' + grad + '">' + (EMO[name] || "💬") + "</span>" +
        '<button class="plaza-ch-sub' + (sub ? " on" : "") + '" data-sub="' + name + '">' + (sub ? "구독중" : "＋ 구독") + "</button>" +
      "</div>" +
      '<div class="pr-name">' + name + "</div>" +
      '<div class="pr-meta">🌐 공개 · 팔로워 ' + (1200 + name.length * 137).toLocaleString() + " · 오늘 글 " + (12 + name.length) + "</div>" +
      '<div class="pr-notice"><span>📢</span><span class="pr-nt">채널 공지 · 규칙 안내 (2)</span><span class="pr-na">›</span></div>' +
      '<div class="pr-heads">' + heads + "</div>";
    room.hidden = false;
    p.querySelector(".plaza-guide").hidden = true;
    p.querySelector("#plaza-seg").hidden = true;
    p.querySelector(".plaza-categories").hidden = true;
    p.querySelector(".plaza-toolbar").hidden = true;
    p.querySelector("#plaza-explore").hidden = true;
    p.querySelector("#plaza-mine").hidden = true;
    p.querySelector("#plaza-list").hidden = false;
    clickCat(p, name);
    // ?ch= 딥링크는 광장 부팅 fetch(전체)와 경합할 수 있다 — 잠시 뒤 채널 필터를 다시 건다
    setTimeout(function () { var r = p.querySelector("#plaza-room"); if (r && !r.hidden) clickCat(p, name); }, 700);
  }
  function exitRoom(p) {
    p.querySelector("#plaza-room").hidden = true;
    p.querySelector(".plaza-guide").hidden = false;
    p.querySelector("#plaza-seg").hidden = false;
    showSeg(p, CAMEFROM);
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
    var room = p.querySelector("#plaza-room"); if (room) room.hidden = true;
    var guide = p.querySelector(".plaza-guide"); if (guide) guide.hidden = false;
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

    var room = p.querySelector("#plaza-room");
    if (room) room.addEventListener("click", function (e) {
      if (e.target.closest("[data-room-back]")) { exitRoom(p); return; }
      var sb = e.target.closest("[data-sub]");
      if (sb) { var on = toggleSub(sb.dataset.sub); sb.classList.toggle("on", on); sb.textContent = on ? "구독중" : "＋ 구독"; return; }
      var h = e.target.closest(".pr-head");
      if (h) { room.querySelectorAll(".pr-head").forEach(function (x) { x.classList.remove("on"); }); h.classList.add("on"); }
    });

    showSeg(p, "feed");
    // 홈 서랍 등에서 ?ch=<채널> 로 들어오면 그 채널방을 바로 연다
    try {
      var ch = new URLSearchParams(location.search).get("ch");
      if (ch) { CAMEFROM = "explore"; renderRoom(p, ch); }
    } catch (_) {}
  }

  // 즉시 시도 + DOM 준비/SPA 재주입 대비
  bind();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  window.GALLA_bindPlazaChannels = bind;
})();
