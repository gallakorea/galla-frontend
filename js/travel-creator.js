/* =========================================================
   travel-creator.js — 크리에이터 여정 (진짜 페이지)

   사장님: "크리에이터 페이지도 왜 닫기야? 페이지로 만들라니까 뒤로가기 하게."
   장소 상세(travel-place.html)와 같은 결론이다. 오버레이를 걷어내고 독립 페이지로 옮긴다:
     · 뒤로가기가 당연히 동작한다(브라우저가 하는 일이라 우리가 흉내 낼 게 없다)
     · 주소가 곧 그 사람이다 — 링크를 보내면 그 화면이 열린다
     · 새로고침해도 살아 있다

   ⚠️ 렌더링을 travel.js 와 나눠 갖지 않는다. travel.js 는 이제 이 페이지로 **보내기만** 한다.
   ⚠️ '지도에서 경로 보기'는 지도가 여행 탭에 있으므로 탭으로 되돌려 보낸다
      (search.html?tab=travel&route=<slug>). 지도를 두 곳에 두면 반드시 갈라진다.
   ========================================================= */
(function () {
  var sb = null, ROOT = null, DATA = null, CC = null, SLUG = "";

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
  function flag(cc) {
    if (!cc || cc.length !== 2) return "🌍";
    try {
      return String.fromCodePoint.apply(null, cc.toUpperCase().split("").map(function (c) {
        return 0x1f1e6 + c.charCodeAt(0) - 65;
      }));
    } catch (_) { return "🌍"; }
  }
  function go(u) { (window.GALLA_nav || function (x) { location.href = x; })(u); }

  function playVideo(id, title, ch) {
    if (!id) return;
    if (window.GALLA_openVideoPage) return window.GALLA_openVideoPage(id, title || "", ch || "");
    go("watch.html?v=" + encodeURIComponent(id) +
       (title ? "&t=" + encodeURIComponent(title) : "") +
       (ch ? "&c=" + encodeURIComponent(ch) : ""));
  }

  function render() {
    var c = (DATA && DATA.channel) || {};
    var places = (DATA.places || []).filter(function (p) { return !CC || p.country_code === CC; });

    /* 지역별로 묶는다. 지역을 모르는 건 '기타'로 몰지 않고 나라 이름을 쓴다 —
       '기타'는 유저에게 아무 정보도 주지 않는다. */
    var groups = [], idx = {};
    places.forEach(function (p) {
      var key = p.area || p.country || "그 외";
      if (!(key in idx)) { idx[key] = groups.length; groups.push({ key: key, items: [] }); }
      groups[idx[key]].items.push(p);
    });

    ROOT.innerHTML =
      '<div class="tv-cre-h">' +
        (c.thumb ? '<img src="' + esc(c.thumb) + '" alt="" referrerpolicy="no-referrer">' : "") +
        '<div><div class="tv-cre-n">' + esc(c.name || "") + "</div>" +
          '<div class="tv-cre-s">' + (DATA.total || 0) + "곳 · 영상 " + (c.videos || 0) + "편</div></div>" +
        '<button type="button" class="tv-cre-map" id="tv-cre-map">지도에서 경로 보기</button>' +
      "</div>" +
      '<div class="tv-chips chip-scroll tv-cre-cc">' +
        '<button type="button" class="tv-chip' + (CC ? "" : " on") + '" data-cc2="">전체</button>' +
        (DATA.countries || []).map(function (x) {
          return '<button type="button" class="tv-chip' + (CC === x.code ? " on" : "") +
            '" data-cc2="' + esc(x.code) + '">' + flag(x.code) + " " + esc(x.name || x.code) +
            ' <i>' + x.n + "</i></button>";
        }).join("") +
      "</div>" +
      '<div class="tv-cre-b">' +
        (groups.length ? groups.map(function (g) {
          return '<div class="tv-cre-g"><div class="tv-cre-gt">' + esc(g.key) +
            ' <i>' + g.items.length + "곳</i></div>" +
            /* 썸네일을 누르면 영상이 재생되고, 이름을 누르면 장소 상세로 간다.
               한 줄에 두 가지가 붙어 있으니 눌리는 자리를 갈라 놓는다. */
            g.items.map(function (p) {
              return '<div class="tv-cre-i">' +
                (p.video_id
                  ? '<button type="button" class="tv-cre-th" data-vid="' + esc(p.video_id) +
                    '" data-vt="' + esc(p.video_title || "") + '" aria-label="영상 재생">' +
                    (p.cover ? '<img src="' + esc(p.cover) + '" alt="" loading="lazy" referrerpolicy="no-referrer">'
                             : '<span class="tv-ph">🌍</span>') +
                    '<i class="tv-play"></i></button>'
                  : '<span class="tv-cre-th">' +
                    (p.cover ? '<img src="' + esc(p.cover) + '" alt="" loading="lazy" referrerpolicy="no-referrer">'
                             : '<span class="tv-ph">🌍</span>') + "</span>") +
                '<button type="button" class="tv-cre-t" data-place="' + esc(p.id) + '">' +
                  '<b>' + esc(p.name) + (p.visited ? " ✓" : "") + "</b>" +
                  '<i>' + esc(p.video_title || "") + "</i>" +
                "</button></div>";
            }).join("") + "</div>";
        }).join("") : '<div class="tv-empty">아직 정리된 곳이 없어요.</div>') +
      "</div>";

    try { document.title = (c.name || "크리에이터") + " · 여행 | GALLA"; } catch (_) {}
  }

  function wire() {
    if (ROOT.__wired) return;
    ROOT.__wired = true;
    ROOT.addEventListener("click", function (e) {
      var cc = e.target.closest("[data-cc2]");
      if (cc) { CC = cc.dataset.cc2 || null; render(); return; }
      if (e.target.closest("#tv-cre-map")) {
        return go("search.html?tab=travel&route=" + encodeURIComponent(SLUG));
      }
      var vb = e.target.closest("[data-vid]");
      if (vb) return playVideo(vb.dataset.vid, vb.dataset.vt, (DATA && DATA.channel || {}).name);
      var pl = e.target.closest("[data-place]");
      if (pl) return go("travel-place.html?id=" + encodeURIComponent(pl.dataset.place));
    });
  }

  async function boot(root, params) {
    ROOT = root || document.getElementById("tv-cre-page");
    if (!ROOT) return;
    wire();
    SLUG = (params && params.c) || new URLSearchParams(location.search).get("c") || "";
    if (!SLUG) { ROOT.innerHTML = '<div class="tv-empty">잘못된 주소예요.</div>'; return; }
    ROOT.innerHTML = '<div class="tv-empty">불러오는 중…</div>';
    DATA = await rpc("travel_creator", { p_slug: SLUG, p_limit: 200 });
    CC = null;
    if (!DATA || !DATA.ok) { ROOT.innerHTML = '<div class="tv-empty">불러오지 못했어요.</div>'; return; }
    render();
  }

  window.GALLA_PAGE_TRAVEL_CREATOR = {
    mount: function (root, params) { return boot(root && root.querySelector("#tv-cre-page"), params); },
    unmount: function () { if (window.GALLA_stopInlineVideos) GALLA_stopInlineVideos(); ROOT = null; DATA = null; },
  };
  if (!window.__gallaSPA) {
    document.addEventListener("DOMContentLoaded", function () { boot(null, {}); });
    if (document.readyState !== "loading") boot(null, {});
  }
})();
