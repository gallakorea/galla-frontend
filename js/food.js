/* =========================================================
   food.js — 우리 동네 맛집
   방송·유튜브에 나온 집을 지도에 모으고, 다녀온 곳을 도장으로 채운다.

   · 데이터는 남의 사이트를 긁어오지 않는다. collect-food-places 가 원본(유튜브 API)에서
     직접 뽑고, 유저 제보와 공공 인허가로 보탠다. 상세는 food_places 마이그레이션 주석 참고.
   · 지역 축은 날씨와 공유한다(weather_regions) — 그래서 같은 탭에 산다.
   · 🚨 지도는 전체화면 오버레이다. 탭 패널 안에 인라인으로 넣으면 지도 드래그가
     셸 탭 스와이프로 새어나가 탭이 멋대로 넘어간다. nav.js 의 overlayOpen() 셀렉터에
     '.fd-map.open' 이 등록되어 있어야 이 방어가 성립한다 — 지우지 말 것.
   · Leaflet 은 로컬 vendoring. CSP 가 script-src 'self' 라 CDN·카카오/네이버 SDK 는 못 쓴다.
     (카카오 SDK는 CSP를 열어도 capacitor://localhost origin 에서 또 막힌다 — 핫튜브 153 참고)
   ========================================================= */
(function () {
  if (window.__gallaFood) return;
  window.__gallaFood = true;

  var VER = "0831106";
  var TILE = { url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
               attr: "&copy; OpenStreetMap", max: 19 };

  /* ── 지도 백엔드 ────────────────────────────────────────
     사장님 지시로 네이버 지도를 1순위로 쓴다(맛집여지도와 같은 지도).
     ⚠️ 다만 Leaflet 폴백을 지우지 않는다. 네이버 SDK 는 발급 도메인을 검증하는데
        네이티브 앱의 origin 은 capacitor://localhost 라 등록 도메인과 안 맞을 수 있다
        (핫튜브 오류 153 과 같은 벽). 네이버가 안 뜨면 조용히 Leaflet 으로 내려간다 —
        앱에서 지도가 통째로 백지가 되는 것보다 낫다.
     클라이언트 ID 는 app_settings('food_map') 에서 읽는다 → 배포 없이 교체 가능. */
  var MAPCFG = { provider: "leaflet", clientId: "", param: "ncpKeyId", styleId: "" };
  var MB = null;              // 활성 백엔드 어댑터
  var naverLoading = null;

  async function loadMapCfg() {
    try {
      /* ⚠️ app_settings 를 직접 읽으면 안 된다 — SELECT 정책이 {authenticated} 전용이라
         비로그인 방문자는 빈 결과를 받고(에러도 아니다) 네이버가 영영 안 켜진다.
         공개 필드만 내리는 전용 RPC 로 받는다. */
      var v = await rpc("food_map_config");
      if (v) {
        if (v.naver_client_id) { MAPCFG.clientId = String(v.naver_client_id); MAPCFG.provider = "naver"; }
        if (v.provider) MAPCFG.provider = String(v.provider);
        if (v.param) MAPCFG.param = String(v.param);
        if (v.naver_style_id) MAPCFG.styleId = String(v.naver_style_id);
        if (v.tile_url) TILE.url = String(v.tile_url);
        if (v.tile_attr) TILE.attr = String(v.tile_attr);
      }
    } catch (_) {}
    if (MAPCFG.provider === "naver" && !MAPCFG.clientId) MAPCFG.provider = "leaflet";
  }

  function loadNaver() {
    if (window.naver && window.naver.maps) return Promise.resolve();
    if (naverLoading) return naverLoading;
    naverLoading = new Promise(function (res, rej) {
      var sc = document.createElement("script");
      sc.src = "https://oapi.map.naver.com/openapi/v3/maps.js?" +
               encodeURIComponent(MAPCFG.param) + "=" + encodeURIComponent(MAPCFG.clientId);
      sc.onload = function () { (window.naver && window.naver.maps) ? res() : rej(new Error("naver_no_maps")); };
      sc.onerror = function () { rej(new Error("naver_load_fail")); };
      document.head.appendChild(sc);
      // SDK 가 인증 실패하면 onerror 없이 조용히 죽는다 — 타임아웃으로 잡는다
      setTimeout(function () { (window.naver && window.naver.maps) ? res() : rej(new Error("naver_timeout")); }, 6000);
    });
    return naverLoading;
  }

  /* 두 백엔드가 같은 얼굴을 갖도록 감싼다. 위쪽 로직(fetchBbox·drawMarkers)은
     어느 지도인지 몰라도 되게 — 나중에 카카오·VWorld 를 붙일 때도 여기만 는다. */
  function naverBackend(el, lat, lon, zoom) {
    var nv = window.naver.maps;
    /* ⚠️ 지도를 CSS 필터로 강제 반전하지 않는다 — 네이버 지도 DOM 은 클래스 없는 div 뭉치라
       타일만 고를 선택자가 없고, 통째로 걸면 좌하단 NAVER 로고까지 반전된다.
       공식 로고 색 변경은 브랜드 규정 위반이다(유튜브 로고로 이미 두 번 지적받은 그 함정).
       다크 지도가 필요하면 NCP 콘솔 Style Editor 로 스타일을 만들어 그 ID 를
       app_settings.food_map.naver_style_id 에 넣는다 — 네이버가 공식 지원하는 방법이다. */
    var opt = { center: new nv.LatLng(lat, lon), zoom: zoom,
                mapDataControl: false, scaleControl: false,
                logoControlOptions: { position: nv.Position.BOTTOM_LEFT } };
    if (MAPCFG.styleId) opt.customStyleId = MAPCFG.styleId;
    var map = new nv.Map(el, opt);
    return {
      kind: "naver",
      onIdle: function (fn) { nv.Event.addListener(map, "idle", fn); },
      getBounds: function () {
        var b = map.getBounds();
        // 네이버 LatLngBounds 는 getMin()/getMax() 로 남서·북동을 준다
        var mn = b.getMin ? b.getMin() : b.getSW(), mx = b.getMax ? b.getMax() : b.getNE();
        return { swLat: mn.y != null ? mn.y : mn.lat(), swLon: mn.x != null ? mn.x : mn.lng(),
                 neLat: mx.y != null ? mx.y : mx.lat(), neLon: mx.x != null ? mx.x : mx.lng() };
      },
      getZoom: function () { return map.getZoom(); },
      setView: function (la, lo, z) { map.setCenter(new nv.LatLng(la, lo)); if (z) map.setZoom(z); },
      refresh: function () { try { map.refresh(true); } catch (_) {} },
      marker: function (la, lo, html, size, onClick) {
        var m = new nv.Marker({ position: new nv.LatLng(la, lo), map: map,
          icon: { content: html, anchor: new nv.Point(size / 2, size / 2) } });
        if (onClick) nv.Event.addListener(m, "click", onClick);
        return m;
      },
      drop: function (m) { try { m.setMap(null); } catch (_) {} }
    };
  }

  function leafletBackend(el, lat, lon, zoom) {
    var map = L.map(el, { zoomControl: false, attributionControl: true, tap: false })
               .setView([lat, lon], zoom);
    L.tileLayer(TILE.url, { maxZoom: TILE.max, attribution: TILE.attr }).addTo(map);
    return {
      kind: "leaflet",
      onIdle: function (fn) { map.on("moveend zoomend", fn); },
      getBounds: function () {
        var b = map.getBounds();
        return { swLat: b.getSouth(), swLon: b.getWest(), neLat: b.getNorth(), neLon: b.getEast() };
      },
      getZoom: function () { return map.getZoom(); },
      setView: function (la, lo, z) { map.setView([la, lo], z || map.getZoom()); },
      refresh: function () { map.invalidateSize(); },
      marker: function (la, lo, html, size, onClick) {
        var m = L.marker([la, lo], { icon: L.divIcon({ className: "", iconSize: [size, size],
                 iconAnchor: [size / 2, size / 2], html: html }) }).addTo(map);
        if (onClick) m.on("click", onClick);
        return m;
      },
      drop: function (m) { try { map.removeLayer(m); } catch (_) {} }
    };
  }

  var sb = null, CH = [], chFilter = null, onlyUnvisited = false;
  var catFilter = null, minShows = null, CATS = [];   // 필터 시트 상태
  var myRegion = null, myRegionName = "";
  var SEC, CHIPS, LIST, PROG, MODES;
  var mode = "near";   // near | controversial | loved | overrated
  var MAP, mapEl, L = null, leafletLoading = null, markers = [], moveTimer = 0, lastPlaces = [];
  var SHEET, curPlace = null;

  /* ── 공용 ─────────────────────────────────────────── */
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
  var chName = function (slug) {
    for (var i = 0; i < CH.length; i++) if (CH[i].slug === slug) return CH[i].name;
    return slug;
  };
  /* 채널 로고 — YouTube CDN URL 을 그대로 참조한다(재호스팅 금지: 방송사·유튜버 로고를
     우리 서버에 복제 저장하면 상표·저작권 문제가 된다). CSP img-src 에 https: 가 열려 있다. */
  var chThumb = function (slug) {
    for (var i = 0; i < CH.length; i++) if (CH[i].slug === slug) return CH[i].thumb || "";
    return "";
  };

  /* ── 탭 안 섹션 ───────────────────────────────────── */
  function mount() {
    var panel = document.querySelector('.tab-panel[data-panel="food"]');
    if (!panel || panel.querySelector(".fd-sec")) return false;

    SEC = document.createElement("div");
    SEC.className = "fd-sec";
    SEC.innerHTML =
      '<div class="fd-sec-head">' +
        '<div><div class="fd-sec-t">방송에 나온 집</div>' +
        '<div class="fd-sec-sub" id="fd-sub">내 동네부터</div></div>' +
        '<button type="button" class="fd-open-map" id="fd-open">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M9 3 3 5.5v15L9 18l6 3 6-2.5v-15L15 6 9 3z"/><path d="M9 3v15M15 6v15"/></svg>지도로 보기</button>' +
      '</div>' +
      '<div class="fd-prog" id="fd-prog" hidden>' +
        '<div class="fd-prog-bar"><i style="width:0%"></i></div><div class="fd-prog-n"></div></div>' +
      /* 랭킹 표면 — 맛집여지도가 못 하는 화면이다. 저쪽은 '방송에 나온 집' 목록에서 끝나고,
         갈라는 "그래서 진짜 맛있냐"로 싸운 결과를 보여준다. */
      '<div class="fd-modes chip-scroll" id="fd-modes">' +
        '<button type="button" class="fd-mode on" data-m="near">내 동네</button>' +
        '<button type="button" class="fd-mode" data-m="controversial">🔥 논란의 집</button>' +
        '<button type="button" class="fd-mode" data-m="loved">👑 인정받은 집</button>' +
        '<button type="button" class="fd-mode" data-m="overrated">💀 과대평가</button>' +
        '<button type="button" class="fd-mode" data-m="browse">📺 방송별</button>' +
        '<button type="button" class="fd-mode" data-m="leaders">🏆 랭킹</button>' +
        '<button type="button" class="fd-mode" data-m="badges">🏅 업적</button>' +
      '</div>' +
      '<div class="fd-chips chip-scroll" id="fd-chips"></div>' +
      '<div class="fd-list" id="fd-list"><div class="fd-empty">불러오는 중…</div></div>';
    panel.appendChild(SEC);

    CHIPS = SEC.querySelector("#fd-chips");
    LIST  = SEC.querySelector("#fd-list");
    PROG  = SEC.querySelector("#fd-prog");
    MODES = SEC.querySelector("#fd-modes");
    return true;
  }

  /* 🚨 요소에 직접 addEventListener 를 걸지 않는다 — document 위임으로만 받는다.
     SPA 셸이 페이지 DOM을 스냅샷으로 저장했다가 재방문 때 복원하는데,
     **HTML 은 돌아오지만 리스너는 안 돌아온다**. 실제로 버튼은 멀쩡히 보이는데
     눌러도 아무 일도 안 일어나는 상태가 됐다(실측). 위임이면 복원돼도 계속 산다. */
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (t.closest && t.closest("#fd-open")) { openMap(); return; }
    var m = t.closest && t.closest("#fd-modes .fd-mode");
    if (m) {
      mode = m.dataset.m;
      SEC.querySelectorAll(".fd-mode").forEach(function (b) { b.classList.toggle("on", b === m); });
      loadList(); return;
    }
    var chip = t.closest && t.closest("#fd-chips .fd-chip");
    if (chip) {
      chFilter = (chFilter === chip.dataset.slug) ? null : chip.dataset.slug;
      paintChips(); loadList(); return;
    }
    var card = t.closest && t.closest("#fd-list .fd-card");
    if (card) { openMap(null, card.dataset.id); return; }
    var fb = t.closest && t.closest("#fd-list .fb-card");
    if (fb) { openMap(null, fb.dataset.id); return; }
    var bg = t.closest && t.closest("#fd-list [data-badge]");
    if (bg) { claimBadge(bg.dataset.badge); return; }
    var all = t.closest && t.closest("#fd-list .fb-all");
    if (all) {
      chFilter = all.dataset.all; mode = "near";
      SEC.querySelectorAll(".fd-mode").forEach(function (b) { b.classList.toggle("on", b.dataset.m === "near"); });
      paintChips(); loadList();
      SEC.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
  });

  function paintChips() {
    if (!CHIPS) return;
    CHIPS.innerHTML = CH.map(function (c) {
      // 아직 한 곳도 없는 채널은 숫자를 숨기고 흐리게 — '또간집 0' 이 줄줄이 뜨면 노이즈다
      return '<button type="button" class="fd-chip' + (chFilter === c.slug ? " on" : "") +
        (c.total ? "" : " empty") + '" data-slug="' + esc(c.slug) + '">' +
        esc(c.name) + (c.total ? '<span class="n">' + c.total + '</span>' : '') + '</button>';
    }).join("");
    // 정복률 — 채널을 고르면 그 방송 정복률, 아니면 전체
    var tot = 0, vis = 0;
    CH.forEach(function (c) {
      if (chFilter && c.slug !== chFilter) return;
      tot += c.total; vis += c.visited;
    });
    if (PROG && tot > 0) {
      PROG.hidden = false;
      PROG.querySelector("i").style.width = Math.round(vis * 100 / tot) + "%";
      PROG.querySelector(".fd-prog-n").textContent =
        (chFilter ? chName(chFilter) + " " : "도장 ") + vis + " / " + tot;
    } else if (PROG) PROG.hidden = true;
  }

  function card(p) {
    return '<div class="fd-card' + (p.visited ? " visited" : "") + '" data-id="' + esc(p.id) + '">' +
      '<div class="fd-card-b">' +
        '<div class="fd-name">' + esc(p.name) + (p.visited ? '<span class="stamp">✓ 갔다옴</span>' : '') + '</div>' +
        '<div class="fd-addr">' + esc(p.address) + '</div>' +
        ((p.channels && p.channels.length)
          ? '<div class="fd-tags">' + p.channels.slice(0, 3).map(function (s) {
              return '<span class="fd-tag">' + esc(chName(s)) + '</span>'; }).join("") + '</div>'
          : '') +
        (p.total ? '<div class="fd-score">' +
            '<span class="good">맛있다 ' + p.good + '</span>' +
            '<span class="sep">vs</span>' +
            '<span class="bad">맛없다 ' + p.bad + '</span>' +
            (mode === "controversial" ? '<span class="fd-heat">🔥 ' + p.heat + '</span>' : '') +
          '</div>' : '') +
      '</div></div>';
  }

  var EMPTY = {
    controversial: "아직 싸움이 붙은 집이 없어요.<br>맛있다·맛없다를 눌러 첫 표를 던져보세요.",
    loved: "아직 인정받은 집이 없어요.<br>표가 5개는 모여야 순위에 올라요.",
    overrated: "아직 과대평가로 찍힌 집이 없어요.<br>방송에 나왔는데 별로였다면 눌러주세요."
  };
  /* 방송별 모아보기 — 저쪽은 방송별 나열로 끝나는 읽기 전용 목록이다.
     우리는 같은 화면에 정복률(도장깨기)과 맛있다/맛없다 전적을 얹는다. */
  function ytThumb(vid) {
    return vid ? "https://i.ytimg.com/vi/" + encodeURIComponent(vid) + "/mqdefault.jpg" : "";
  }
  function browseCard(p) {
    var th = ytThumb(p.video_id);
    var tot = (p.good || 0) + (p.bad || 0);
    return '<div class="fb-card' + (p.visited ? " visited" : "") + '" data-id="' + esc(p.id) + '">' +
      '<div class="fb-thumb">' +
        (th ? '<img src="' + esc(th) + '" alt="" loading="lazy">' : '<span class="fb-noimg">🍜</span>') +
        (p.visited ? '<i class="fb-stamp">✓ 갔다옴</i>' : '') +
      '</div>' +
      '<div class="fb-name">' + esc(p.name) + '</div>' +
      '<div class="fb-addr">' + esc(p.address) + '</div>' +
      (tot ? '<div class="fb-score"><span class="good">' + p.good + '</span>' +
             '<span class="sep">:</span><span class="bad">' + p.bad + '</span></div>'
           : '<div class="fb-score empty">아직 판정 전</div>') +
    '</div>';
  }
  function sectionHtml(sec) {
    return '<section class="fb-sec">' +
      '<div class="fb-head">' +
        (sec.thumb ? '<img class="fb-logo" src="' + esc(sec.thumb) + '" alt="" loading="lazy">' : '') +
        '<div class="fb-h-t">' + esc(sec.name) + ' <b>' + sec.total + '곳</b></div>' +
        '<button type="button" class="fb-all" data-all="' + esc(sec.slug) + '">전체 보기 ›</button>' +
      '</div>' +
      '<div class="fb-prog"><div class="fb-prog-bar"><i style="width:' + sec.pct + '%"></i></div>' +
        '<span class="fb-prog-n">정복 ' + sec.visited + '/' + sec.total + '</span></div>' +
      '<div class="fb-row chip-scroll">' + (sec.places || []).map(browseCard).join("") + '</div>' +
    '</section>';
  }
  async function loadBrowse() {
    var d = await rpc("food_browse", { p_per: 10, p_channels: 12 });
    var secs = (d && d.sections) || [];
    LIST.innerHTML = secs.length
      ? '<div class="fb-wrap">' + secs.map(sectionHtml).join("") + '</div>'
      : '<div class="fd-empty">아직 방송별로 모을 만큼 쌓이지 않았어요.<br>수집이 하루 두 번 돕니다.</div>';
  }

  /* 랭킹 — 저쪽은 '많이 다녀온 / 많이 등록한' 두 줄이다.
     우리는 세 번째 축을 넣는다: 판정왕(맛있다·맛없다를 가장 많이 던진 사람).
     갈라는 구경이 아니라 싸움이 본체니까. */
  var MEDAL = ["🥇", "🥈", "🥉"];
  function leaderCol(title, rows, unit) {
    return '<div class="fl-col"><div class="fl-t">' + title + '</div>' +
      (rows && rows.length
        ? rows.map(function (r, i) {
            return '<div class="fl-row"><span class="fl-rk">' + (MEDAL[i] || (i + 1)) + '</span>' +
              '<span class="fl-nick">' + esc(r.nick) + '</span>' +
              '<b class="fl-n">' + r.n + '</b></div>'; }).join("")
        : '<div class="fl-empty">아직 없어요</div>') +
      '<div class="fl-unit">' + unit + '</div></div>';
  }
  async function loadLeaders() {
    var d = await rpc("food_leaders", { p_limit: 10 });
    if (!d || !d.ok) { LIST.innerHTML = '<div class="fd-empty">랭킹을 불러오지 못했어요</div>'; return; }
    LIST.innerHTML = '<div class="fl-wrap">' +
      leaderCol("👟 많이 다녀온", d.visited, "도장 수") +
      leaderCol("⚔️ 판정왕", d.judged, "맛있다·맛없다 던진 수") +
      leaderCol("✍️ 많이 등록한", d.added, "제보 수") +
    '</div>';
  }

  /* 업적 — 저쪽 것을 참고하되 갈라 축(판정·논객·방송 정복)을 얹었다.
     ⚠️ 배지에 GP 를 기본으로 걸지 않았다(reward_gp 기본 0). 도장·판정·찜은 자기신고라
        화폐를 붙이면 그대로 파밍이 된다. 서버가 reward_gp>0 을 주면 그때만 GP 를 준다. */
  function badgeCard(b) {
    var pct = Math.min(100, Math.round((b.have / b.target) * 100));
    return '<div class="fg-card' + (b.done ? " done" : "") + '">' +
      '<div class="fg-ic">' + b.icon + '</div>' +
      '<div class="fg-n">' + esc(b.name) + '</div>' +
      '<div class="fg-h">' + esc(b.hint) + '</div>' +
      '<div class="fg-bar"><i style="width:' + pct + '%"></i></div>' +
      '<div class="fg-p">' + b.have + ' / ' + b.target + '</div>' +
      (b.done && !b.claimed
        ? '<button type="button" class="fg-claim" data-badge="' + esc(b.code) + '">받기' +
            (b.reward_gp > 0 ? ' +' + b.reward_gp + 'GP' : '') + '</button>'
        : b.claimed ? '<div class="fg-got">✓ 획득</div>' : '') +
    '</div>';
  }
  async function loadBadges() {
    var d = await rpc("food_badges");
    if (!d || !d.ok) { LIST.innerHTML = '<div class="fd-empty">업적을 불러오지 못했어요</div>'; return; }
    LIST.innerHTML =
      '<div class="fg-head">업적 <b>' + d.got + ' / ' + d.total + '</b></div>' +
      '<div class="fg-grid">' + (d.badges || []).map(badgeCard).join("") + '</div>';
  }

  async function loadList() {
    if (!LIST) return;
    if (mode === "badges") { await loadBadges(); return; }
    if (mode === "leaders") { await loadLeaders(); return; }
    if (mode === "browse") { await loadBrowse(); return; }
    var ps, d;
    if (mode === "near") {
      d = await rpc("food_map", { p_region: myRegion, p_channel: chFilter, p_limit: 40,
                                  p_category: catFilter, p_min_shows: minShows });
      ps = (d && d.places) || [];
    } else {
      // 랭킹은 전국 기준. 최소 표수를 넘긴 집만 올라온다(표본이 적으면 우연이니까).
      d = await rpc("food_rank", { p_kind: mode, p_min_votes: 3, p_limit: 40 });
      ps = (d && d.places) || [];
    }
    if (!ps.length) {
      LIST.innerHTML = '<div class="fd-empty">' + (EMPTY[mode] ||
        ((myRegionName ? esc(myRegionName) + "엔 " : "") + "아직 등록된 방송 맛집이 없어요.<br>지도에서 다른 동네를 둘러보세요.")) +
        '</div>';
      return;
    }
    LIST.innerHTML = ps.map(card).join("");
  }

  /* ── 지도 (지연 로딩) ─────────────────────────────── */
  function loadLeaflet() {
    if (window.L) { L = window.L; return Promise.resolve(); }
    if (leafletLoading) return leafletLoading;
    leafletLoading = new Promise(function (res, rej) {
      var css = document.createElement("link");
      css.rel = "stylesheet"; css.href = "vendor/leaflet.css?v=" + VER;
      document.head.appendChild(css);
      var s = document.createElement("script");
      s.src = "vendor/leaflet.js?v=" + VER;
      s.onload = function () { L = window.L; res(); };
      s.onerror = function () { rej(new Error("leaflet")); };
      document.head.appendChild(s);
    });
    return leafletLoading;
  }

  function buildMap() {
    if (MAP) return;
    MAP = document.createElement("div");
    MAP.className = "fd-map";
    MAP.innerHTML =
      '<div class="fd-map-canvas" id="fd-canvas"></div>' +
      '<div class="fd-map-top">' +
        '<div class="fd-map-row">' +
          '<button type="button" class="fd-map-close" id="fd-close" aria-label="닫기">✕</button>' +
          '<div class="fd-map-title">맛집 지도</div>' +
          '<div class="fd-map-count" id="fd-count"></div>' +
        '</div>' +
        '<div class="fd-map-row">' +
          '<div class="fd-chips chip-scroll" id="fd-mchips" style="flex:1;padding-bottom:0"></div>' +
          '<button type="button" class="fd-unvisited" id="fd-unv">안 가본 곳</button>' +
          '<button type="button" class="fd-filt" id="fd-filt" aria-label="필터">⚙</button>' +
        '</div>' +
      '</div>' +
      '<div class="fd-sheet" id="fd-sheet"></div>' +
      '<div class="fd-fsheet" id="fd-fsheet"></div>';
    document.body.appendChild(MAP);
    SHEET = MAP.querySelector("#fd-sheet");

    // 오버레이는 body 직속이라 스냅샷 대상은 아니지만, 규칙을 하나로 두는 편이 안전하다.
    MAP.addEventListener("click", function (e) {
      var t = e.target;
      if (t.closest("#fd-close")) { closeMap(); return; }
      var u = t.closest("#fd-unv");
      if (u) { onlyUnvisited = !onlyUnvisited; u.classList.toggle("on", onlyUnvisited); fetchBbox(); return; }
      var c = t.closest("#fd-mchips .fd-chip");
      if (c) {
        chFilter = (chFilter === c.dataset.slug) ? null : c.dataset.slug;
        paintMapChips(); paintChips(); fetchBbox(); return;
      }
      var vw = t.closest(".fd-vid");
      if (vw && vw.dataset.vid) {
        vw.innerHTML = '<iframe src="/yt?v=' + encodeURIComponent(vw.dataset.vid) +
          '" allow="autoplay; encrypted-media" allowfullscreen loading="lazy"></iframe>';
        vw.classList.add("playing"); return;
      }
      if (t.closest(".fd-act")) { onSheetClick(e); return; }
      var jb = t.closest("[data-j]");
      if (jb) { onJudge(jb.dataset.j); return; }
      var lk = t.closest("[data-like]");
      if (lk) { onLike(lk.dataset.like, lk); return; }
      if (t.closest("#fd-filt")) { openFilter(); return; }
      var fch = t.closest("#fd-fsheet [data-ch]");
      if (fch) { chFilter = fch.dataset.ch || null; openFilter(); paintChips(); paintMapChips(); return; }
      var fcat = t.closest("#fd-fsheet [data-cat]");
      if (fcat) { catFilter = fcat.dataset.cat || null; openFilter(); return; }
      var ff = t.closest("#fd-fsheet [data-f]");
      if (ff) {
        if (ff.dataset.f === "multi") { minShows = minShows ? null : 2; openFilter(); return; }
        if (ff.dataset.f === "reset") { catFilter = null; minShows = null; chFilter = null; openFilter(); paintChips(); paintMapChips(); return; }
        if (ff.dataset.f === "apply") { closeFilter(); fetchBbox(); loadList(); return; }
      }
      if (t.closest("#fd-sheet")) return;
      // 시트 밖을 누르면 닫는다
      if (MAP.querySelector("#fd-fsheet.open") && !t.closest("#fd-fsheet")) closeFilter();
    });
    // 한마디 등록 — 시트가 매번 새로 그려지므로 위임으로 받는다
    MAP.addEventListener("submit", function (e) {
      if (e.target && e.target.id === "fd-say") { e.preventDefault(); onSay(); }
    });

    // 뒤로가기로 닫힌다 — 앱에서 지도가 갇히면 안 된다.
    window.addEventListener("popstate", function () { if (MAP.classList.contains("open")) closeMap(true); });
  }

  function paintMapChips() {
    var el = MAP && MAP.querySelector("#fd-mchips"); if (!el) return;
    el.innerHTML = CH.map(function (c) {
      return '<button type="button" class="fd-chip' + (chFilter === c.slug ? " on" : "") + '" data-slug="' + esc(c.slug) + '">' +
        esc(c.name) + '</button>';
    }).join("");
  }

  async function openMap(_e, focusId) {
    buildMap();
    MAP.classList.add("open");
    document.body.classList.add("fd-map-on");
    document.body.style.overflow = "hidden";
    try { history.pushState({ fdMap: 1 }, ""); } catch (_) {}
    paintMapChips();
    MAP.querySelector("#fd-unv").classList.toggle("on", onlyUnvisited);

    if (!MB) {
      await loadMapCfg();
      var cv = MAP.querySelector("#fd-canvas");
      /* 1순위 네이버. 인증·도메인 문제로 못 뜨면 조용히 Leaflet 으로 내려간다 —
         앱에서 지도가 백지가 되는 것보다 낫다. 어느 쪽으로 떴는지는 콘솔에 남긴다. */
      if (MAPCFG.provider === "naver") {
        try { await loadNaver(); MB = naverBackend(cv, 37.5665, 126.978, 12); }
        catch (e) { console.warn("[food] 네이버 지도 실패 → Leaflet 폴백:", String(e)); }
      }
      if (!MB) {
        try { await loadLeaflet(); MB = leafletBackend(cv, 37.5665, 126.978, 12); }
        catch (_) { toast("지도를 불러오지 못했어요"); closeMap(); return; }
      }
      MAP.dataset.provider = MB.kind;
      MB.onIdle(function () { clearTimeout(moveTimer); moveTimer = setTimeout(fetchBbox, 260); });
      // 지도 위 제스처는 셸로 절대 넘기지 않는다 (오버레이 + 이중 방어)
      ["touchstart", "touchmove"].forEach(function (t) {
        cv.addEventListener(t, function (ev) { ev.stopPropagation(); }, { passive: true });
      });
    }
    /* ⚠️ 순서 주의 — invalidateSize() 로 컨테이너 크기를 확정한 **뒤에** bbox 를 질의한다.
       먼저 부르면 아직 0 크기라 bounds 가 한 점으로 쪼그라들어 서울 한복판인데 2곳만 잡혔다(실측). */
    await new Promise(function (r) { setTimeout(r, 80); });
    MB.refresh();

    if (focusId) {
      var d = await rpc("food_place_detail", { p_id: focusId });
      if (d && d.ok && d.place && d.place.lat != null) {
        MB.setView(+d.place.lat, +d.place.lon, 16);
        showSheet(d);
        return;
      }
    }
    /* 내 동네가 있으면 거기로.
       ⚠️ weather_search 는 좌표를 안 준다(code/name/sido/temp 뿐) — food_region_center 를 쓴다. */
    if (myRegion) {
      var r = await rpc("food_region_center", { p_region: myRegion });
      if (r && r.ok && r.lat != null) MB.setView(+r.lat, +r.lon, r.zoom || 13);
    }
    fetchBbox();   // setView 가 moveend 를 안 쏘는 경우가 있어 명시 호출
  }

  function closeMap(fromPop) {
    if (!MAP) return;
    MAP.classList.remove("open");
    document.body.classList.remove("fd-map-on");
    document.body.style.overflow = "";
    hideSheet();
    if (!fromPop) { try { if (history.state && history.state.fdMap) history.back(); } catch (_) {} }
    loadList();          // 지도에서 찍은 도장을 목록에도 반영
    loadChannels();
  }

  async function fetchBbox() {
    if (!MB || !MAP.classList.contains("open")) return;
    var b = MB.getBounds();
    var d = await rpc("food_map", {
      p_sw_lat: b.swLat, p_sw_lon: b.swLon,
      p_ne_lat: b.neLat, p_ne_lon: b.neLon,
      p_channel: chFilter, p_only_unvisited: onlyUnvisited, p_limit: 400,
      p_category: catFilter, p_min_shows: minShows
    });
    lastPlaces = (d && d.places) || [];
    var c = MAP.querySelector("#fd-count");
    if (c) c.textContent = lastPlaces.length ? lastPlaces.length + "곳" : "이 구역엔 없어요";
    drawMarkers();
  }

  /* 그리드 클러스터링 — 마커 수백 개를 그대로 뿌리면 모바일에서 버벅인다.
     줌이 낮을수록 격자를 크게 잡아 묶고, 15줌부터는 낱개로 보여준다. */
  function drawMarkers() {
    markers.forEach(function (m) { MB.drop(m); });
    markers = [];
    var z = MB.getZoom();
    var pts = lastPlaces.filter(function (p) { return p.lat != null && p.lon != null; });

    if (z >= 15) {
      pts.forEach(function (p) { markers.push(pin(p)); });
    } else {
      var cell = Math.pow(2, 14 - z) * 0.004;   // 줌이 낮을수록 격자가 커진다
      var bag = {};
      pts.forEach(function (p) {
        var k = Math.floor(p.lat / cell) + ":" + Math.floor(p.lon / cell);
        (bag[k] = bag[k] || []).push(p);
      });
      Object.keys(bag).forEach(function (k) {
        var g = bag[k];
        if (g.length === 1) { markers.push(pin(g[0])); return; }
        var la = 0, lo = 0;
        g.forEach(function (p) { la += +p.lat; lo += +p.lon; });
        var n = g.length, size = n < 10 ? 34 : n < 50 ? 42 : 50;
        var cla = la / n, clo = lo / n;
        var m = MB.marker(cla, clo,
          '<div class="fd-cluster" style="width:' + size + 'px;height:' + size + 'px;font-size:' +
          (n < 100 ? 13 : 11) + 'px">' + n + '</div>', size,
          function () { MB.setView(cla, clo, Math.min(z + 3, 17)); });
        markers.push(m);
      });
    }
  }

  /* 마커에 '어느 방송에 나왔는지'를 띄운다 — 지도만 봐도 또간집인지 쯔양인지 안다.
     로고가 아직 없는 채널(썸네일 수집 전)이나 유저 제보 건은 기본 아이콘으로 떨어진다. */
  function pin(p) {
    var slug = (p.channels && p.channels.length) ? p.channels[0] : "";
    var thumb = slug ? chThumb(slug) : "";
    var more = (p.channels && p.channels.length > 1) ? p.channels.length : 0;
    var inner = thumb
      ? '<img src="' + esc(thumb) + '" alt="' + esc(chName(slug)) + '" loading="lazy">'
      : '<span class="fd-pin-e">' + (p.visited ? "✓" : "🍜") + '</span>';
    var html = '<div class="fd-pin' + (p.visited ? " visited" : "") + (thumb ? " has-logo" : "") + '">' +
      inner +
      (p.visited ? '<i class="fd-pin-chk">✓</i>' : '') +
      (more ? '<i class="fd-pin-n">' + more + '</i>' : '') +
      '</div>';
    return MB.marker(+p.lat, +p.lon, html, 38, async function () {
      var d = await rpc("food_place_detail", { p_id: p.id });
      if (d && d.ok) showSheet(d);
    });
  }

  /* ── 필터 시트 ────────────────────────────────────────
     카테고리는 실제 데이터에서 뽑는다(food_categories) — 없는 걸 버튼으로 두면
     눌러도 0건이라 고장난 것처럼 보인다. */
  async function openFilter() {
    var FS = MAP.querySelector("#fd-fsheet");
    if (!CATS.length) CATS = (await rpc("food_categories")) || [];
    FS.innerHTML =
      '<div class="fd-sheet-grip"></div>' +
      '<div class="ff-head">필터<button type="button" class="ff-reset" data-f="reset">초기화</button></div>' +
      '<div class="ff-sec"><div class="ff-t">여러 곳에 소개</div>' +
        '<button type="button" class="ff-chip' + (minShows ? " on" : "") + '" data-f="multi">👑 2곳 이상 소개</button>' +
      '</div>' +
      '<div class="ff-sec"><div class="ff-t">방송·유튜브</div><div class="ff-row chip-scroll">' +
        '<button type="button" class="ff-chip' + (chFilter ? "" : " on") + '" data-ch="">전체</button>' +
        CH.filter(function (c) { return c.total; }).map(function (c) {
          return '<button type="button" class="ff-chip' + (chFilter === c.slug ? " on" : "") + '" data-ch="' + esc(c.slug) + '">' +
            (c.thumb ? '<img src="' + esc(c.thumb) + '" alt="" loading="lazy">' : '') + esc(c.name) + '</button>';
        }).join("") +
      '</div></div>' +
      '<div class="ff-sec"><div class="ff-t">음식 종류</div><div class="ff-grid">' +
        '<button type="button" class="ff-chip' + (catFilter ? "" : " on") + '" data-cat="">전체</button>' +
        CATS.map(function (c) {
          return '<button type="button" class="ff-chip' + (catFilter === c.name ? " on" : "") + '" data-cat="' + esc(c.name) + '">' +
            esc(c.name) + '<span class="n">' + c.n + '</span></button>';
        }).join("") +
      '</div></div>' +
      '<button type="button" class="ff-go" data-f="apply">결과 보기</button>';
    FS.classList.add("open");
  }
  function closeFilter() { var FS = MAP && MAP.querySelector("#fd-fsheet"); if (FS) FS.classList.remove("open"); }

  /* ── 상세 시트 — 여기가 싸움터다 ──────────────────────
     맛집여지도는 "방송에 나온 집"을 보여주고 끝난다. 갈라는 거기서 시작한다:
     맛있다 / 맛없다를 고르고, **고른 사람만** 말할 수 있다. */
  function showSheet(d) {
    curPlace = d;
    var p = d.place, st = d.stats || { good: 0, bad: 0 };
    var vid = (d.sources || []).reduce(function (a, x) { return a || x.video_id; }, "");
    SHEET.innerHTML =
      '<div class="fd-sheet-grip"></div>' +
      '<h3>' + esc(p.name) + '</h3>' +
      '<div class="fd-meta">' +
        (p.category ? '<span class="fd-cat">' + esc(p.category) + '</span>' : '') +
        '<span class="addr">' + esc(p.address) + '</span>' +
      '</div>' +
      (p.phone ? '<a class="fd-tel" href="tel:' + esc(p.phone) + '">📞 ' + esc(p.phone) + '</a>' : '') +
      (d.sources && d.sources.length
        ? '<div class="fd-src">' + d.sources.map(function (s) {
            return '<div class="fd-src-i">📺 <b>' + esc(s.name) + '</b>' +
              (s.title ? '<span style="opacity:.7;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(s.title) + '</span>' : '') +
            '</div>'; }).join("") + '</div>'
        : '') +
      '<div class="fd-judge" id="fd-judge"></div>' +
      /* 출처 영상 — 썸네일로 먼저 띄우고 누를 때만 iframe 을 붙인다.
         시트 열 때마다 iframe 을 심으면 무겁고, 자동재생도 원치 않는다.
         재생은 /yt 프록시를 쓴다 — 앱(capacitor origin)에서 직접 임베드가 막히는 걸
         우회하려고 만들어둔 그 페이지다(핫튜브 오류 153). */
      (vid ? '<div class="fd-vid" data-vid="' + esc(vid) + '">' +
               '<img src="https://i.ytimg.com/vi/' + esc(vid) + '/mqdefault.jpg" alt="" loading="lazy">' +
               '<i class="fd-vid-play">▶</i></div>' : '') +
      '<div class="fd-acts">' +
        '<button type="button" class="fd-act' + (d.visited ? " on" : "") + '" data-a="visit">' +
          (d.visited ? "✓ 갔다옴" : "갔다옴") + '</button>' +
        '<button type="button" class="fd-act save' + (d.saved ? " on" : "") + '" data-a="save">' +
          (d.saved ? "★ 찜함" : "☆ 찜") + '</button>' +
        '<button type="button" class="fd-act" data-a="share">↗ 공유</button>' +
      '</div>' +
      '<a class="fd-ext" target="_blank" rel="noopener" href="https://map.naver.com/p/search/' +
        encodeURIComponent(p.name + " " + (p.address || "")) + '">🗺 네이버지도에서 열기</a>' +
      '<div class="fd-talk">' +
        '<div class="fd-talk-h">한마디 <span id="fd-talk-n"></span></div>' +
        '<div class="fd-talk-list" id="fd-talk-list"></div>' +
        '<form class="fd-say" id="fd-say" autocomplete="off">' +
          '<input id="fd-say-i" maxlength="600" placeholder="' +
            (d.mine ? '여기 어땠어요?' : '먼저 맛있다 / 맛없다를 골라주세요') + '"' +
            (d.mine ? '' : ' disabled') + '>' +
          '<button type="submit" id="fd-say-b"' + (d.mine ? '' : ' disabled') + '>등록</button>' +
        '</form>' +
      '</div>';

    paintJudge(st, d.mine);
    loadTalk(p.id);
    SHEET.classList.add("open");
  }

  /* 판정바 — index/이슈/릴스와 같은 GALLA_VoteBar 를 그대로 쓴다(톤 통일). */
  function paintJudge(st, mine) {
    var el = SHEET && SHEET.querySelector("#fd-judge");
    if (!el) return;
    if (!window.GALLA_VoteBar) {          // 컴포넌트가 없으면 최소 폴백
      el.innerHTML = '<div class="fd-judge-fb">' +
        '<button type="button" class="fd-j good' + (mine === "good" ? " on" : "") + '" data-j="good">😋 맛있다 ' + (st.good || 0) + '</button>' +
        '<button type="button" class="fd-j bad'  + (mine === "bad"  ? " on" : "") + '" data-j="bad">🤮 맛없다 ' + (st.bad || 0) + '</button></div>';
      return;
    }
    GALLA_VoteBar.mount(el, {
      factionA: "맛있다", factionB: "맛없다",
      pro: st.good || 0, con: st.bad || 0,
      proAttr: 'data-j="good"', conAttr: 'data-j="bad"',
      myStance: mine === "good" ? "pro" : mine === "bad" ? "con" : null
    });
  }

  function talkRow(c) {
    return '<div class="fd-c ' + (c.faction === "good" ? "good" : "bad") + '">' +
      '<div class="fd-c-h"><b>' + esc(c.nick) + '</b>' +
        '<span class="fd-c-fac">' + (c.faction === "good" ? "맛있다" : "맛없다") + '</span></div>' +
      '<div class="fd-c-b">' + esc(c.body) + '</div>' +
      '<button type="button" class="fd-c-like' + (c.liked ? " on" : "") + '" data-like="' + c.id + '">' +
        '👍 ' + (c.likes || 0) + '</button></div>';
  }

  async function loadTalk(id) {
    var d = await rpc("food_talk", { p_id: id, p_limit: 60 });
    var list = SHEET && SHEET.querySelector("#fd-talk-list");
    var n = SHEET && SHEET.querySelector("#fd-talk-n");
    if (!list) return;
    var cs = (d && d.comments) || [];
    if (n) n.textContent = cs.length ? cs.length : "";
    list.innerHTML = cs.length ? cs.map(talkRow).join("")
      : '<div class="fd-c-empty">아직 아무도 말이 없어요. 첫 마디를 던져보세요.</div>';
  }
  function hideSheet() { if (SHEET) { SHEET.classList.remove("open"); curPlace = null; } }

  /* 판정 — 같은 걸 또 누르면 취소된다(서버 규칙). 취소되면 댓글 입력이 다시 잠긴다. */
  async function onJudge(v) {
    if (!curPlace) return;
    if (!(await loggedIn())) return needLogin();
    var r = await rpc("food_judge", { p_id: curPlace.place.id, p_verdict: v });
    if (!r || !r.ok) return toast("잠시 후 다시 시도해주세요");
    curPlace.mine = r.mine;
    curPlace.stats = { good: r.good, bad: r.bad, heat: r.heat };
    paintJudge(curPlace.stats, r.mine);
    var i = SHEET.querySelector("#fd-say-i"), b = SHEET.querySelector("#fd-say-b");
    if (i) {
      i.disabled = !r.mine; if (b) b.disabled = !r.mine;
      i.placeholder = r.mine ? "여기 어땠어요?" : "먼저 맛있다 / 맛없다를 골라주세요";
    }
    if (r.mine) toast(r.mine === "good" ? "맛있다 쪽에 섰어요" : "맛없다 쪽에 섰어요");
    if (mode !== "near") loadList();   // 랭킹 화면이면 순위가 바뀐다
  }

  async function onSay() {
    if (!curPlace) return;
    var i = SHEET.querySelector("#fd-say-i"); if (!i) return;
    var v = (i.value || "").trim(); if (!v) return;
    var r = await rpc("food_say", { p_id: curPlace.place.id, p_body: v });
    if (!r || !r.ok) {
      if (r && r.reason === "pick_side") return toast("먼저 맛있다 / 맛없다를 골라주세요");
      if (r && r.reason === "slow_down") return toast("조금만 천천히요 ㅎㅎ");
      return toast("등록하지 못했어요");
    }
    i.value = "";
    loadTalk(curPlace.place.id);
  }

  async function onLike(id, btn) {
    if (!(await loggedIn())) return needLogin();
    var r = await rpc("food_like", { p_comment: Number(id) });
    if (!r || !r.ok) return;
    btn.classList.toggle("on", r.liked);
    btn.textContent = "👍 " + r.likes;
  }

  async function onSheetClick(e) {
    var b = e.target.closest(".fd-act"); if (!b || !curPlace) return;
    if (b.dataset.a === "share") {
      var pl = curPlace.place;
      if (window.GALLA_share) GALLA_share({
        url: location.origin + "/search.html?tab=food",
        title: pl.name, text: pl.name + " — " + (pl.address || "") + " · 갈라 맛집" });
      return;
    }
    if (!(await loggedIn())) return needLogin();
    var id = curPlace.place.id;
    if (b.dataset.a === "visit") {
      var r = await rpc("food_toggle_visit", { p_id: id });
      if (!r || !r.ok) return toast("잠시 후 다시 시도해주세요");
      curPlace.visited = r.visited;
      b.classList.toggle("on", r.visited);
      b.textContent = r.visited ? "✓ 갔다옴" : "갔다옴";
      if (r.visited) toast("도장 찍었어요 — 내 지도 " + r.total + "곳");
      // 마커 색을 즉시 반영
      lastPlaces.forEach(function (p) { if (p.id === id) p.visited = r.visited; });
      drawMarkers(); loadChannels();
    } else {
      var s = await rpc("food_toggle_save", { p_id: id });
      if (!s || !s.ok) return toast("잠시 후 다시 시도해주세요");
      curPlace.saved = s.saved;
      b.classList.toggle("on", s.saved);
      b.textContent = s.saved ? "★ 찜함" : "☆ 찜";
    }
  }

  /* ── 부팅 ─────────────────────────────────────────── */
  async function claimBadge(code) {
    if (!(await loggedIn())) return needLogin();
    var r = await rpc("food_badge_claim", { p_code: code });
    if (!r || !r.ok) {
      if (r && r.reason === "not_yet") return toast("아직 " + r.have + "/" + r.target + "예요");
      return toast("잠시 후 다시 시도해주세요");
    }
    if (!r.already) toast("🏅 " + (r.name || "업적") + " 획득!" + (r.amount ? " +" + r.amount + "GP" : ""));
    loadBadges();
  }

  async function loadChannels() {
    var d = await rpc("food_channel_stats");
    CH = (d && d.channels) || [];
    paintChips();
    if (MAP) paintMapChips();
  }

  async function boot() {
    if (!mount()) return;   // 패널이 없거나 이미 붙어 있음
    // 내 동네 = 날씨 즐겨찾기 첫 번째. 없으면 전국.
    var my = await rpc("weather_my");
    if (my && my.length) { myRegion = my[0].code; myRegionName = my[0].name; }
    var sub = SEC.querySelector("#fd-sub");
    if (sub && myRegionName) sub.textContent = myRegionName + " 기준";
    await loadChannels();
    await loadList();
  }

  /* 부팅 — 한 번 하고 끝내면 안 된다.
     SPA 재방문 때 날씨 패널이 통째로 갈리거나, 스냅샷이 복원되면서 데이터가 빈 껍데기로
     돌아오는 경우가 있다. 그래서 옵저버를 끊지 않고 '패널은 있는데 .fd-sec 이 없다' 를
     계속 지켜보다가 다시 붙인다(어댑터 없는 페이지가 2차 방문에 먹통이던 그 문제). */
  var booting = false;
  async function tryBoot() {
    var panel = document.querySelector('.tab-panel[data-panel="food"]');
    if (!panel || booting) return;
    if (panel.querySelector(".fd-sec")) {
      // 스냅샷으로 껍데기만 돌아온 경우 — 참조를 다시 잡고 데이터만 새로 채운다.
      if (!SEC || !document.contains(SEC)) {
        SEC = panel.querySelector(".fd-sec");
        CHIPS = SEC.querySelector("#fd-chips");
        LIST = SEC.querySelector("#fd-list");
        PROG = SEC.querySelector("#fd-prog");
        booting = true;
        try { await loadChannels(); await loadList(); } finally { booting = false; }
      }
      return;
    }
    booting = true;
    try { await boot(); } finally { booting = false; }
  }
  var start = function () {
    tryBoot();
    try {
      new MutationObserver(function () { tryBoot(); })
        .observe(document.body, { childList: true, subtree: true });
    } catch (_) {}
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();

  window.GALLA_openFoodMap = openMap;
})();
