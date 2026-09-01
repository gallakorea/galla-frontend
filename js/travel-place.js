/* =========================================================
   travel-place.js — 여행지 상세 (진짜 페이지)

   사장님: "이 화면이 팝업 같은데 그냥 페이지로 해라."
   그래서 오버레이를 걷어내고 독립 페이지로 옮겼다. 얻는 것:
     · 뒤로가기가 당연히 동작한다(브라우저가 하는 일이라 우리가 흉내 낼 게 없다)
     · 주소가 곧 그 장소다 — 링크를 보내면 그 화면이 열린다
     · 새로고침해도 살아 있고, 나중에 /travel/<id> 로 검색 노출까지 갈 수 있다
   잃는 것: 지도에서 핀을 눌러 들어오면 돌아올 때 지도를 다시 그린다(뒤로가기로 복귀).

   ⚠️ 렌더링을 travel.js 와 나눠 갖지 않는다. 두 곳에 같은 화면이 있으면 반드시 갈라진다 —
      travel.js 는 이제 이 페이지로 **보내기만** 한다.
   ⚠️ 재생 경로는 origin 마다 다르다. 앱(capacitor)에서는 직접 iframe 이 오류 153 으로 죽어
      GALLA_playInline(프록시)을 써야 하고, 웹에서는 그 프록시가 안 열려 검은 화면이 된다.
      한쪽만 두면 반드시 다른 쪽이 깨진다 — playHere() 가 갈라 쓴다.
   ========================================================= */
(function () {
  var sb = null;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c];
    });
  }
  async function client() {
    sb = sb || (window.waitForSupabaseClient ? await window.waitForSupabaseClient() : window.supabaseClient);
    return sb;
  }
  async function rpc(fn, args) {
    try { var r = await (await client()).rpc(fn, args || {}); return r && r.data; } catch (_) { return null; }
  }
  function toast(m) { window.GALLA_toast ? GALLA_toast(m) : 0; }
  function needLogin() {
    if (confirm("로그인이 필요해요. 로그인할까요?")) (window.GALLA_nav || function (u) { location.href = u; })("login.html");
  }
  async function loggedIn() {
    try { var u = await (await client()).auth.getUser(); return !!(u && u.data && u.data.user); } catch (_) { return false; }
  }
  function flag(cc) {
    if (!cc || cc.length !== 2) return "🌍";
    try {
      return String.fromCodePoint.apply(null, cc.toUpperCase().split("").map(function (c) {
        return 0x1f1e6 + c.charCodeAt(0) - 65;
      }));
    } catch (_) { return "🌍"; }
  }

  /* 판정 라벨 — travel.js 와 같은 값을 쓴다(DB 는 again/once 그대로). */
  var V = {
    again: { label: "강추", tone: "hot" },
    once:  { label: "굳이", tone: "cold" },
    want:  { label: "가고 싶다", tone: "want" },
    pass:  { label: "관심 없다", tone: "pass" },
  };

  var ROOT = null, CUR = null, PID = null;

  function voteBtn(k, mine, n) {
    return '<button type="button" class="tv-vote ' + V[k].tone + (mine === k ? " on" : "") +
      '" data-v="' + k + '">' + V[k].label + "<i>" + (n || 0) + "</i></button>";
  }

  function render() {
    var p = CUR.place, s = CUR.stats, mine = CUR.mine;
    var vids = CUR.videos || [];
    var sub = [p.city, p.country].filter(Boolean).join(" · ");
    var visited = (s.again || 0) + (s.once || 0);
    var pct = visited ? Math.round(s.again * 100 / visited) : 0;

    ROOT.innerHTML =
      (vids.length
        ? '<div class="tv-hero play" id="tv-hero" data-vid="' + esc(vids[0].video_id) + '">' +
            '<img src="https://i.ytimg.com/vi/' + esc(vids[0].video_id) + '/hqdefault.jpg" alt="" referrerpolicy="no-referrer">' +
            '<i class="tv-hero-play"></i></div>'
        : p.cover
          ? '<div class="tv-hero"><img src="' + esc(p.cover) + '" alt="" referrerpolicy="no-referrer">' +
            (p.photo_credit ? '<span class="tv-credit">' + esc(p.photo_credit) + "</span>" : "") + "</div>"
          : '<div class="tv-hero empty">' + flag(p.country_code) + "</div>") +

      '<div class="tv-d-body">' +
        '<h1 class="tv-d-name">' + esc(p.name) + "</h1>" +
        '<div class="tv-d-sub">' + flag(p.country_code) + " " + esc(sub) +
          (p.category ? " · " + esc(p.category) : "") + "</div>" +
        (p.name_local || p.name_en
          ? '<div class="tv-d-alt">' + esc(p.name_local || p.name_en) + "</div>" : "") +
        ((p.certs || []).length
          ? '<div class="tv-certs">' + p.certs.map(function (c) {
              return '<span class="tv-certp">' + esc(c.emoji || "🏅") + " " + esc(c.name) +
                (c.blurb ? "<i>" + esc(c.blurb) + "</i>" : "") + "</span>";
            }).join("") + "</div>"
          : "") +
        (p.status === "pending"
          ? '<div class="tv-warn">좌표를 아직 못 찾은 곳이에요. 지도에는 안 올라갑니다.</div>' : "") +
        (p.summary
          ? '<p class="tv-desc">' + esc(p.summary) +
            (p.summary_url
              ? ' <a href="' + esc(p.summary_url) + '" target="_blank" rel="noopener">' +
                (p.summary_src === "tour" ? "한국관광공사" : "위키백과") + " ↗</a>"
              : ' <span class="tv-desc-s">' + (p.summary_src === "tour" ? "한국관광공사" : "위키백과") + "</span>") +
            "</p>"
          : "") +

        '<div class="tv-judge">' +
          voteBtn("again", mine, s.again) + voteBtn("once", mine, s.once) +
          '<button type="button" class="tv-heart' + (CUR.saved ? " on" : "") + '" id="tv-save" aria-label="가고 싶다">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>' +
            (s.want ? "<i>" + s.want + "</i>" : "") + "</button>" +
          '<button type="button" class="tv-shr" id="tv-share" aria-label="공유">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M12 15V3"/><path d="m8 7 4-4 4 4"/></svg>' +
          "</button>" +
        "</div>" +
        '<div class="tv-jhint">가볼 만한가? 판정하고, 담아두려면 하트</div>' +

        (visited ? '<div class="tv-gauge"><div class="tv-gbar"><i style="width:' + pct + '%"></i></div>' +
                   '<div class="tv-gtx">' + visited + "명 중 " + pct + "%가 강추" +
                   (s.want ? " · " + s.want + "명이 담아둠" : "") + "</div></div>" : "") +

        (vids.length
          ? '<div class="tv-vids"><div class="tv-h">누가 갔나' +
              (vids.length > 1 ? " <i>" + vids.length + "개 영상 · 눌러서 재생</i>" : "") + "</div>" +
            vids.slice(0, 8).map(function (v) {
              return '<button type="button" class="tv-vid" data-vid="' + esc(v.video_id) + '">' +
                '<span class="tv-vid-i">' +
                  '<img src="https://i.ytimg.com/vi/' + esc(v.video_id) + '/mqdefault.jpg" alt="" loading="lazy" referrerpolicy="no-referrer">' +
                  '<i class="tv-play"></i></span>' +
                "<span><b>" + esc(v.channel) + "</b>" + esc(v.title || "") + "</span></button>";
            }).join("") + "</div>"
          : "") +

        '<div class="tv-talk"><div class="tv-h">한마디 <i>' + (s.comments || 0) + "</i></div>" +
          '<div id="tv-cmts" class="tv-cmts"></div>' +
          '<form class="tv-write" id="tv-write">' +
            '<input type="text" id="tv-input" maxlength="600" placeholder="판정하고 한마디 남기기">' +
            "<button type=\"submit\">등록</button></form></div>" +
        (p.lat != null
          ? '<button type="button" class="tv-all" id="tv-openmap-here">지도에서 보기 →</button>' : "") +
        (p.geo_source === "osm" ? '<div class="tv-src">위치 © OpenStreetMap contributors</div>' : "") +
        (p.geo_source === "wikidata" ? '<div class="tv-src">위치·사진 출처 Wikidata / Wikimedia Commons</div>' : "") +
        (p.geo_source === "tour" ? '<div class="tv-src">위치·사진 출처 한국관광공사</div>' : "") +
        (p.geo_source === "heritage" ? '<div class="tv-src">위치·사진 출처 국가유산청</div>' : "") +
      "</div>";

    wire();
    loadTalk();
    try { document.title = p.name + " · 여행 | GALLA"; } catch (_) {}
  }

  function wire() {
    var judge = ROOT.querySelector(".tv-judge");
    if (judge) judge.addEventListener("click", function (e) {
      var b = e.target.closest(".tv-vote"); if (b) return doJudge(b.dataset.v);
      if (e.target.closest("#tv-save")) return toggleSave();
      if (e.target.closest("#tv-share")) return share();
    });
    var hero = ROOT.querySelector("#tv-hero");
    if (hero) hero.addEventListener("click", function () { playHere(hero.dataset.vid); });
    var vbox = ROOT.querySelector(".tv-vids");
    if (vbox) vbox.addEventListener("click", function (e) {
      var b = e.target.closest("[data-vid]"); if (b) playHere(b.dataset.vid);
    });
    var form = ROOT.querySelector("#tv-write");
    if (form) form.addEventListener("submit", function (e) { e.preventDefault(); say(); });
    var mapBtn = ROOT.querySelector("#tv-openmap-here");
    if (mapBtn) mapBtn.addEventListener("click", function () {
      /* 지도는 트렌드 탭에 산다 — 그쪽으로 보내고 지도를 연다. */
      (window.GALLA_nav || function (u) { location.href = u; })("search.html?tab=travel&map=1");
    });
  }

  /* 공유는 /share/travel/<sid> 로 보낸다 — 그 주소가 OG 카드를 만들고 예쁜 주소로 넘긴다.
     ⚠️ 앱에서는 location.origin 이 capacitor://localhost 라 그걸 쓰면 죽은 링크가 된다.
        GALLA_SITE 를 쓴다(js/supabase.js 가 심는다). */
  function share() {
    var p = CUR && CUR.place; if (!p) return;
    var base = window.GALLA_SITE || "https://galla.im";
    var key = p.sid || p.id;
    var where = [p.city, p.country].filter(Boolean).join(" · ");
    var url = base + "/share/travel/" + encodeURIComponent(key);
    if (window.GALLA_share) {
      GALLA_share({ url: url, title: p.name, text: p.name + (where ? " · " + where : "") + " — 가볼 만한가?" });
    } else if (navigator.share) {
      navigator.share({ title: p.name, url: url }).catch(function () {});
    }
  }

  function playHere(vid) {
    if (!vid) return;
    var hero = ROOT.querySelector("#tv-hero");
    if (!hero) return;
    if (hero.dataset.vid !== vid) {
      hero.classList.remove("vplaying");
      hero.dataset.vid = vid;
      hero.innerHTML = '<img src="https://i.ytimg.com/vi/' + esc(vid) +
                       '/hqdefault.jpg" alt="" referrerpolicy="no-referrer"><i class="tv-hero-play"></i>';
    }
    /* ⚠️ 앱(capacitor origin)에서는 유튜브 임베드가 오류 153 으로 죽어서 프록시 페이지가 필요하다.
       웹에서는 반대로 프록시가 걸림돌이다 — 로컬·개발 도메인에서 프록시 페이지가 안 열려
       검은 화면만 남는다(사장님 제보). 그래서 origin 을 보고 갈라 쓴다. */
    var native = false;
    try {
      native = location.protocol === "capacitor:" || location.protocol === "ionic:" ||
               (typeof window.GALLA_isApp === "function" && window.GALLA_isApp());
    } catch (_) {}
    if (native && window.GALLA_playInline) {
      window.GALLA_playInline(hero, vid, "");
    } else {
      if (window.GALLA_stopInlineVideos) GALLA_stopInlineVideos();
      hero.classList.add("vplaying");
      hero.innerHTML = '<iframe src="https://www.youtube.com/embed/' + encodeURIComponent(vid) +
        '?autoplay=1&playsinline=1&rel=0" title="" frameborder="0" allowfullscreen ' +
        'allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"></iframe>';
    }
    ROOT.querySelectorAll(".tv-vid").forEach(function (el) {
      el.classList.toggle("on", el.dataset.vid === vid);
    });
    try { hero.scrollIntoView({ block: "nearest" }); } catch (_) {}
  }

  async function doJudge(v) {
    if (!(await loggedIn())) return needLogin();
    var r = await rpc("travel_judge", { p_id: PID, p_verdict: v });
    if (!r || !r.ok) return toast("판정에 실패했어요.");
    CUR.mine = r.mine;
    CUR.stats.again = r.again; CUR.stats.once = r.once;
    CUR.stats.want = r.want; CUR.stats.hype = r.hype;
    render();
  }

  async function toggleSave() {
    if (!(await loggedIn())) return needLogin();
    var r = await rpc("travel_save", { p_id: PID });
    if (!r || !r.ok) return toast("실패했어요.");
    CUR.saved = r.saved;
    if (r.want != null) CUR.stats.want = r.want;
    render();
    toast(r.saved ? "가고 싶은 곳에 담았어요" : "담기를 해제했어요");
  }

  async function loadTalk() {
    var r = await rpc("travel_talk", { p_id: PID, p_limit: 60 });
    var box = ROOT.querySelector("#tv-cmts"); if (!box) return;
    var cs = (r && r.comments) || [];
    box.innerHTML = cs.length ? cs.map(function (c) {
      return '<div class="tv-cmt ' + (V[c.faction] ? V[c.faction].tone : "") + '">' +
        '<span class="tv-cf">' + (V[c.faction] ? V[c.faction].label : "") + "</span>" +
        "<b>" + esc(c.nick) + "</b> " + esc(c.body) + "</div>";
    }).join("") : '<div class="tv-none">첫 한마디를 남겨보세요.</div>';
  }

  async function say() {
    if (!(await loggedIn())) return needLogin();
    var inp = ROOT.querySelector("#tv-input"); if (!inp) return;
    var body = inp.value.trim(); if (!body) return;
    var r = await rpc("travel_say", { p_id: PID, p_body: body });
    if (!r || !r.ok) {
      return toast(r && r.reason === "pick_side" ? "먼저 판정을 골라주세요."
                 : r && r.reason === "slow_down" ? "조금 천천히요." : "등록에 실패했어요.");
    }
    inp.value = "";
    CUR.stats.comments = (CUR.stats.comments || 0) + 1;
    loadTalk();
  }

  async function boot(root, params) {
    ROOT = root || document.getElementById("tv-page");
    if (!ROOT) return;
    /* 주소는 두 모양이다.
         · /travel-place?id=<uuid>            — 앱·SPA 가 쓰는 내부 주소
         · /travel/기자의-피라미드-b29e54ae     — 검색에 노출되는 주소(엣지가 재작성)
       예쁜 주소에는 ?id= 가 없어서, 엣지가 <meta name="galla-place-id"> 로 심어 준다. */
    var id = (params && params.id) ||
             new URLSearchParams(location.search).get("id") ||
             (document.querySelector('meta[name="galla-place-id"]') || {}).content || "";
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      ROOT.innerHTML = '<div class="tv-empty">잘못된 주소예요.</div>';
      return;
    }
    PID = id;
    ROOT.innerHTML = '<div class="tv-empty">불러오는 중…</div>';
    var info = await rpc("travel_place_info", { p_id: id });
    if (!info || !info.ok) { ROOT.innerHTML = '<div class="tv-empty">없는 장소예요.</div>'; return; }
    CUR = info;
    render();
  }

  /* SPA(스택 뷰)와 일반 페이지 양쪽에서 쓴다 — 광장 상세와 같은 계약. */
  window.GALLA_PAGE_TRAVEL_PLACE = {
    mount: function (root, params) { return boot(root && root.querySelector("#tv-page"), params); },
    unmount: function () { if (window.GALLA_stopInlineVideos) GALLA_stopInlineVideos(); ROOT = null; CUR = null; },
  };

  if (!window.__gallaSPA) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { boot(); });
    else boot();
  }
})();
