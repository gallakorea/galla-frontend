/* 🏛 광장 채널 — 세그먼트(광장 피드/탐색/내 채널) + 채널 발견·구독.
   plaza.js(module)는 건드리지 않는다. 채널 선택은 기존 카테고리 칩을 .click() 해서
   재활용한다(백엔드 무변경, plaza_posts.category 문자열 매칭 그대로).
   구독은 localStorage(galla_plaza_channels) — 1차. MPA/search.html + SPA/trend.js 양쪽 로드.
   SPA 재주입 대비: data-pcbound 가드로 중복 바인딩 방지, 요소 없으면 조용히 skip. */
(function () {
  var SUB_KEY = "galla_plaza_channels";
  // 채널 이모지·색은 js/galla-channels.js(GALLA_CHANNELS) 단일 소스에서 온다.
  function chEmoji(n) { return (window.GALLA_CHANNELS && GALLA_CHANNELS.emoji(n)) || "💬"; }
  function chColor(n) { return (window.GALLA_CHANNELS && GALLA_CHANNELS.color(n)) || "linear-gradient(135deg,#3a4fff,#6f86ff)"; }

  function panel() { return document.querySelector('.tab-panel[data-panel="plaza"]'); }
  function getSubs() { try { return JSON.parse(localStorage.getItem(SUB_KEY) || "[]"); } catch (_) { return []; } }
  function setSubs(a) { try { localStorage.setItem(SUB_KEY, JSON.stringify(a)); } catch (_) {} }
  function isSub(n) { return getSubs().indexOf(n) >= 0; }
  function toggleSub(n) {
    var s = getSubs(), i = s.indexOf(n);
    if (i >= 0) s.splice(i, 1); else s.push(n);
    setSubs(s); return i < 0;
  }
  // 구독은 로그인 필요 — 비로그인은 GALLA_needLogin(쓰기 액션 원칙, disabled 금지).
  //   [[galla-guest-actions]] 보기·공유만 허용, 구독은 쓰기 성격.
  function guardedToggleSub(name, btn) {
    waitForClient().then(function (sb) {
      if (!sb) return;
      sb.auth.getSession().then(function (res) {
        if (!res.data || !res.data.session) {
          if (window.GALLA_needLogin) GALLA_needLogin("채널 구독은 로그인이 필요해요.");
          return;
        }
        var on = toggleSub(name);
        if (btn) { btn.classList.toggle("on", on); btn.textContent = on ? "구독중" : "＋ 구독"; }
      });
    });
  }
  function channels(p) {
    // 카테고리 칩(전체 제외)이 곧 채널 목록 — 단일 소스
    return Array.prototype.map.call(p.querySelectorAll(".plaza-categories button"), function (b) {
      return b.textContent.trim();
    }).filter(function (n) { return n && n !== "전체"; });
  }
  var CHCACHE = null;
  function waitForClient() {
    return new Promise(function (res) {
      if (window.supabaseClient) return res(window.supabaseClient);
      var n = 0, t = setInterval(function () {
        if (window.supabaseClient || ++n > 50) { clearInterval(t); res(window.supabaseClient || null); }
      }, 100);
    });
  }
  function loadChannels() {
    return waitForClient().then(function (sb) {
      if (!sb) return [];
      return sb.from("channels")
        .select("name,emoji,color,description,post_count,follower_count,is_default,owner_id")
        .order("post_count", { ascending: false })
        .then(function (r) { CHCACHE = r.data || []; return CHCACHE; });
    });
  }
  function chMeta(name) {
    var c = CHCACHE && CHCACHE.filter(function (x) { return x.name === name; })[0];
    return {
      emoji: (c && c.emoji) || chEmoji(name),
      color: (c && c.color) || chColor(name),
      posts: (c && c.post_count) || 0,
      followers: (c && c.follower_count) || 0,
      isDefault: c ? c.is_default : true
    };
  }
  function chRowDB(ch, i) {
    var sub = isSub(ch.name), m = chMeta(ch.name);
    return '<div class="plaza-ch" data-ch="' + ch.name + '" style="--i:' + (i || 0) + '">' +
             '<span class="plaza-ch-av" style="background:' + m.color + '">' + m.emoji + '</span>' +
             '<span class="plaza-ch-n">' + ch.name + (ch.is_default ? '' : ' <span class="plaza-ch-u">유저</span>') +
               '<small>' + (ch.description ? ch.description + ' · ' : '') + '글 ' + (ch.post_count || 0) + '</small></span>' +
             '<button class="plaza-ch-sub' + (sub ? " on" : "") + '" data-sub="' + ch.name + '">' + (sub ? "구독중" : "＋ 구독") + '</button>' +
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
    if (!CHCACHE) { loadChannels().then(function () { renderRoom(p, name); }); return; }
    var m = chMeta(name), grad = m.color;
    var sub = isSub(name);
    var heads = ["전체", "같이가요", "정보", "자유"].map(function (t, i) {
      return '<span class="pr-head' + (i === 0 ? " on" : "") + '">' + t + "</span>";
    }).join("");
    var room = p.querySelector("#plaza-room");
    room.innerHTML =
      '<button class="pr-back" data-room-back aria-label="뒤로">‹</button>' +
      '<div class="pr-cover" style="background:' + grad + '"></div>' +
      '<div class="pr-top">' +
        '<span class="pr-av" style="background:' + grad + '">' + m.emoji + "</span>" +
        '<button class="plaza-ch-sub' + (sub ? " on" : "") + '" data-sub="' + name + '">' + (sub ? "구독중" : "＋ 구독") + "</button>" +
      "</div>" +
      '<div class="pr-name">' + name + "</div>" +
      '<div class="pr-meta">🌐 공개 · 팔로워 ' + m.followers.toLocaleString() + " · 글 " + m.posts + "</div>" +
      '<div class="pr-notice"><span>📢</span><span class="pr-nt">채널 공지 · 규칙 안내</span><span class="pr-na">›</span></div>' +
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
    box.innerHTML = '<div class="plaza-csect">채널 불러오는 중…</div>';
    loadChannels().then(function (list) {
      box.innerHTML =
        '<div class="plaza-mkch" data-mkch>＋ 새 채널 만들기</div>' +
        '<div class="plaza-csect">🔥 인기 채널</div>' +
        list.map(function (ch, i) { return chRowDB(ch, i); }).join("");
    });
  }
  function renderMine(p) {
    var box = p.querySelector("#plaza-mine");
    var subs = getSubs();
    if (!subs.length) {
      box.innerHTML = '<div class="plaza-cempty">아직 구독한 채널이 없어요.<br><b>탐색</b>에서 관심 채널을 구독해 보세요.</div>';
      return;
    }
    box.innerHTML = '<div class="plaza-csect">불러오는 중…</div>';
    loadChannels().then(function (list) {
      var mine = list.filter(function (ch) { return subs.indexOf(ch.name) >= 0; });
      box.innerHTML = '<div class="plaza-csect">내 채널</div>' + mine.map(function (ch, i) { return chRowDB(ch, i); }).join("");
    });
  }
  // ── 채널 개설 ──
  function openMkForm(p) {
    waitForClient().then(function (sb) {
      if (!sb) return;
      sb.auth.getSession().then(function (res) {
        if (!res.data || !res.data.session) {
          if (window.GALLA_needLogin) GALLA_needLogin("채널을 만들려면 로그인이 필요해요.");
          return;
        }
        showMkModal(p, res.data.session.user.id);
      });
    });
  }
  function showMkModal(p, uid) {
    var m = document.createElement("div");
    m.className = "plaza-mk-modal";
    m.innerHTML =
      '<div class="pmk-card">' +
        '<h3>새 채널 만들기</h3>' +
        '<input id="pmk-name" placeholder="채널 이름 (예: 자취 요리)" maxlength="20" autocomplete="off">' +
        '<input id="pmk-desc" placeholder="한 줄 소개 (선택)" maxlength="60" autocomplete="off">' +
        '<div class="pmk-emos" id="pmk-emos"></div>' +
        '<div class="pmk-err" id="pmk-err"></div>' +
        '<div class="pmk-btns"><button type="button" id="pmk-cancel">취소</button><button type="button" id="pmk-create">만들기</button></div>' +
      '</div>';
    document.body.appendChild(m);
    var EMOS = ["💬", "🍜", "✈️", "🎮", "⚽", "🎬", "📈", "🐶", "🎨", "📚", "💪", "🚗", "🎵", "📷"];
    var pick = "💬";
    m.querySelector("#pmk-emos").innerHTML = EMOS.map(function (e) {
      return '<span class="pmk-emo' + (e === pick ? " on" : "") + '" data-emo="' + e + '">' + e + "</span>";
    }).join("");
    m.querySelector("#pmk-emos").addEventListener("click", function (e) {
      var s = e.target.closest("[data-emo]"); if (!s) return;
      pick = s.dataset.emo;
      m.querySelectorAll(".pmk-emo").forEach(function (x) { x.classList.toggle("on", x.dataset.emo === pick); });
    });
    m.querySelector("#pmk-cancel").onclick = function () { m.remove(); };
    m.addEventListener("click", function (e) { if (e.target === m) m.remove(); });
    m.querySelector("#pmk-create").onclick = function () { createChannel(p, m, uid, function () { return pick; }); };
  }
  var GRADS_POOL = [
    "linear-gradient(135deg,#6f86ff,#4361ff)", "linear-gradient(135deg,#ff9a5a,#ff5a6e)",
    "linear-gradient(135deg,#2fd07a,#1f9d5e)", "linear-gradient(135deg,#8a5aff,#5a6bff)",
    "linear-gradient(135deg,#ff5a9a,#c15aff)", "linear-gradient(135deg,#4d8dff,#6f86ff)"
  ];
  function createChannel(p, m, uid, getEmo) {
    var name = m.querySelector("#pmk-name").value.trim();
    var desc = m.querySelector("#pmk-desc").value.trim();
    var err = m.querySelector("#pmk-err");
    if (name.length < 2) { err.textContent = "채널 이름을 2자 이상 입력해요."; return; }
    var btn = m.querySelector("#pmk-create"); btn.disabled = true; btn.textContent = "만드는 중…";
    var color = GRADS_POOL[Math.floor(Math.random() * GRADS_POOL.length)];
    waitForClient().then(function (sb) {
      sb.from("channels").insert({ name: name, description: desc, emoji: getEmo(), color: color, owner_id: uid })
        .select().single().then(function (r) {
          if (r.error) {
            btn.disabled = false; btn.textContent = "만들기";
            err.textContent = /duplicate|unique/i.test(r.error.message || "") ? "이미 있는 채널 이름이에요." : "만들기 실패 — " + (r.error.message || "");
            return;
          }
          m.remove();
          CHCACHE = null;
          renderRoom(p, name);
        });
    });
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

    // ⚠️ 옛 HTML(캐시)로 들어와 세그먼트 마크업이 없을 수 있다 — null 이면 여기서
    //    throw 돼 아래 탐색·내채널·채널방 위임까지 전부 죽는다. 가드로 부분 실패만 허용.
    var segEl = p.querySelector("#plaza-seg");
    if (segEl) segEl.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-pseg]");
      if (b) showSeg(p, b.dataset.pseg);
    });

    // 탐색·내채널 뷰 위임: 구독 토글 / 채널 진입
    ["#plaza-explore", "#plaza-mine"].forEach(function (sel) {
      var box = p.querySelector(sel);
      if (!box) return;
      box.addEventListener("click", function (e) {
        if (e.target.closest("[data-mkch]")) { openMkForm(p); return; }
        var sb = e.target.closest("[data-sub]");
        if (sb) {
          guardedToggleSub(sb.dataset.sub, sb);
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
      if (sb) { guardedToggleSub(sb.dataset.sub, sb); return; }
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
