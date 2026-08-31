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
  var naverLoading = null, naverAuthFailed = false;

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
    /* 🔴 네이티브 앱은 무조건 Leaflet.
       NCP Maps 는 '웹 서비스 URL' 을 콘솔에 등록한 origin 에서만 인증을 내준다.
       그런데 앱의 origin 은 capacitor://localhost 라 **등록 자체가 불가능**하다
       (콘솔이 http/https 만 받는다). 그래서 앱에서는 SDK 가 로드는 되고 인증만
       실패해서 지도가 **백지**로 그려졌다 — 스크립트 onload 는 성공이라 폴백도
       안 걸렸다(2026-08-31 시뮬 실측). 미리 갈라놓는다. */
    if (isNativeOrigin()) MAPCFG.provider = "leaflet";
  }

  function isNativeOrigin() {
    try {
      if (location.protocol === "capacitor:" || location.protocol === "ionic:") return true;
      if (typeof window.GALLA_isApp === "function" && window.GALLA_isApp()) return true;
    } catch (_) {}
    return false;
  }

  function loadNaver() {
    if (window.naver && window.naver.maps) {
      return naverAuthFailed ? Promise.reject(new Error("naver_auth")) : Promise.resolve();
    }
    if (naverLoading) return naverLoading;
    naverLoading = new Promise(function (res, rej) {
      /* SDK 는 인증 실패를 onerror 로 알리지 않는다 — 전역 콜백 하나만 부르고
         지도는 흰 화면이 된다. 그래서 이 콜백이 유일한 신호다. */
      window.navermap_authFailure = function () {
        naverAuthFailed = true;
        console.warn("[food] 네이버 지도 인증 실패(등록 안 된 origin) → Leaflet");
        rej(new Error("naver_auth"));
      };
      var sc = document.createElement("script");
      sc.src = "https://oapi.map.naver.com/openapi/v3/maps.js?" +
               encodeURIComponent(MAPCFG.param) + "=" + encodeURIComponent(MAPCFG.clientId);
      sc.onload = function () {
        if (!window.naver || !window.naver.maps) return rej(new Error("naver_no_maps"));
        /* 인증 결과는 로드 직후 비동기로 온다 — 한 박자 기다렸다가 판정한다.
           바로 성공 처리하면 authFailure 가 뜨기 전에 백지 지도를 만들어버린다. */
        setTimeout(function () { naverAuthFailed ? rej(new Error("naver_auth")) : res(); }, 500);
      };
      sc.onerror = function () { rej(new Error("naver_load_fail")); };
      document.head.appendChild(sc);
      setTimeout(function () {
        if (naverAuthFailed) return rej(new Error("naver_auth"));
        (window.naver && window.naver.maps) ? res() : rej(new Error("naver_timeout"));
      }, 6000);
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
    /* ⚠️ 컨테이너 레이아웃이 확정되기 전에 getBounds() 를 부르면 네이버는 경계를
       **중심점 하나로 접어서** 돌려준다(실측: sw==ne==center). 넓이 0 이라 질의가
       0건이 되고 "이 구역엔 없어요"가 뜬다. 레이아웃이 잡히면 다시 그린다. */
    setTimeout(function () { try { map.refresh(true); } catch (_) {} }, 60);
    nv.Event.once(map, "init", function () { try { map.refresh(true); } catch (_) {} });
    return {
      kind: "naver",
      onIdle: function (fn) { nv.Event.addListener(map, "idle", fn); },
      getBounds: function () {
        var b = map.getBounds();
        var mn = b.getMin ? b.getMin() : b.getSW(), mx = b.getMax ? b.getMax() : b.getNE();
        var r = { swLat: mn.y != null ? mn.y : mn.lat(), swLon: mn.x != null ? mn.x : mn.lng(),
                  neLat: mx.y != null ? mx.y : mx.lat(), neLon: mx.x != null ? mx.x : mx.lng() };
        // 퇴화(한 점으로 접힘) 감지 — 호출부가 재시도하도록 null 을 준다
        if (!(r.neLat > r.swLat) || !(r.neLon > r.swLon)) return null;
        return r;
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
      drop: function (m) { try { m.setMap(null); } catch (_) {} },
      _raw: map
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
  var myPos = null;                 // 내 위치(있으면 거리·가까운순이 열린다)
  var sortBy = "new";               // new | near | heat
  var myRegion = null, myRegionName = "";
  var SEC, CHIPS, LIST, PROG, MODES;
  /* 표면이 7개인데 전부 같은 높이의 칩으로 나열돼 본문 전에 200px 을 먹었다(사장님: 다 엎어).
     → 2층으로 접는다. 상위 탭 3개 × 하위 세그먼트. 이모지는 쓰지 않는다 — 타이포와 여백으로 가른다. */
  /* ⚠️ 인플루언서를 랭킹 하위 세그먼트에 묻어놨던 게 실수였다(사장님 지적).
     "누가 다녀갔나"는 이 서비스의 정체성이지 랭킹의 한 종류가 아니다 — 1급 탭이다. */
  var TABS = [
    { t: "browse", name: "둘러보기",   segs: [["new","최신"],["near","가까운"],["heat","화제"]] },
    /* '인증'은 유튜버도 방송도 아니다 — 백년가게(정부 지정)·미쉐린·블루리본처럼
       기관이 인정한 집이다. 백년가게만 800곳대라 전체에 묻어두면 안 보인다.
       '공직자'는 국회의원이 정치자금으로 밥 먹은 집 — 갈라만 가진 축이다. */
    { t: "who",    name: "누가 갔나",
      segs: [["all","전체"],["yt","유튜버"],["tv","방송"],["guide","인증"],["gov","공직자"]] },
    { t: "rank",   name: "랭킹",       segs: [["controversial","논란"],["loved","인정"],["overrated","과대평가"]] },
    { t: "me",     name: "기록",       segs: [["badges","업적"],["leaders","순위"]] }
  ];
  var tab = "browse", seg = "new";
  var GAPS = null;
  var listLimit = 40;   // '더 보기'로 늘린다 — 예전엔 40에서 끊기고 더 볼 방법이 없었다
  var mode = "near";   // 하위 로직 호환(내부에서만 씀)
  var MAP, mapEl, L = null, leafletLoading = null, markers = [], moveTimer = 0, lastPlaces = [], bboxRetry = 0;
  var SHEET, curPlace = null;
  var DETAIL = null;   // 상세 오버레이(지도와 분리)

  /* 🚨 상세를 지도에서 떼어낸다.
     예전엔 #fd-sheet 가 지도 오버레이 안에 있어서 **지도를 거쳐야만** 열렸다.
     목록 카드를 눌러도 지도가 뜨고 SDK 를 로드한 뒤에야 시트가 올라왔다 —
     메뉴·사진·제보·댓글·판정이 다 거기 들어 있는데 사장님 눈엔 "기능이 사라진" 걸로 보였다.
     이제 카드는 지도 없이 바로 상세를 연다. 지도의 핀도 같은 상세를 쓴다. */
  function buildDetail() {
    if (DETAIL) return;
    DETAIL = document.createElement("div");
    DETAIL.className = "fd-detail";
    DETAIL.innerHTML = '<div class="fd-detail-bg"></div>' +
      '<div class="fd-sheet" id="fd-sheet"></div>' +
      '<div class="fd-fsheet" id="fd-dsub"></div>';
    document.body.appendChild(DETAIL);
    SHEET = DETAIL.querySelector("#fd-sheet");
    DETAIL.addEventListener("click", onDetailClick);
    DETAIL.addEventListener("submit", onDetailSubmit);
    window.addEventListener("popstate", function () {
      if (DETAIL.classList.contains("open")) closeDetail(true);
    });
  }
  async function openDetail(id) {
    buildDetail();
    var d = await rpc("food_place_detail", { p_id: id });
    if (!d || !d.ok) return toast("정보를 불러오지 못했어요");
    DETAIL.classList.add("open");
    /* 지도에서 왔으면 스크림을 옅게 — 핀을 누른 자리가 뒤에 보여야 공간 맥락이 산다.
       목록에서 왔으면 뒤에 지도가 없으니 진하게 덮는다(사장님 지적). */
    DETAIL.classList.toggle("over-map", !!(MAP && MAP.classList.contains("open")));
    document.body.classList.add("fd-detail-on");
    try { history.pushState({ fdDetail: 1 }, ""); } catch (_) {}
    showSheet(d);
    loadAssembly(id);            // 해당되는 집만 명단이 붙는다(없으면 조용히 끝)
  }

  /* ── 국회의원 방문 명단 ──────────────────────────────
     ⚖️ 기록에 적힌 것만 보여준다. 추정·점수화를 붙이지 않는다 —
        판단은 이용자의 판정(맛있다/맛없다)이 한다.
     출처: 오마이뉴스·경향신문·뉴스타파(중앙선관위 정보공개, MIT). */
  var PARTY_C = {
    "더불어민주당": "#1f4fd8", "국민의힘": "#d81f2a", "조국혁신당": "#1f9ed8",
    "정의당": "#d8c31f", "개혁신당": "#e86a1f", "진보당": "#c81f5a"
  };
  /* ⚠️ 금액은 반드시 축약한다. 원본 그대로 찍으면 '15,207,000원'이 되어
     요약 칸에서 줄바꿈이 나고 표가 무너진다(실측). 단위는 여기서만 붙인다 —
     호출부에서 '원'을 또 붙이면 '238,000원원'이 된다. */
  function won(n) {
    n = Number(n) || 0;
    if (n >= 100000000) return (n / 100000000).toFixed(1).replace(/\.0$/, "") + "억";
    if (n >= 10000) return Math.round(n / 10000).toLocaleString() + "만";
    return n.toLocaleString() + "원";
  }
  async function loadAssembly(id) {
    var box = SHEET && SHEET.querySelector("#fd-asm");
    if (!box) return;
    var d = await rpc("food_assembly_detail", { p_id: id, p_limit: 30 });
    if (!d || !d.ok || !d.stat) return;                 // 해당 없는 집
    var st = d.stat, rows = d.rows || [];
    var parties = Object.keys(st.parties || {})
      .map(function (k) { return [k, st.parties[k]]; })
      .sort(function (a, b) { return b[1] - a[1]; }).slice(0, 4);
    var per = st.visits > 0 ? Math.round(st.amount / st.visits) : 0;
    box.innerHTML =
      '<div class="fa-h">🏛 국회의원이 다녀간 집' +
        '<span class="fa-src">오마이뉴스·경향신문·뉴스타파</span></div>' +
      '<div class="fa-stat">' +
        '<div><b>' + st.mps + '</b><i>의원</i></div>' +
        '<div><b>' + st.visits + '</b><i>결제</i></div>' +
        '<div><b>' + won(st.amount) + '</b><i>총액</i></div>' +
        '<div><b>' + won(per) + '</b><i>건당</i></div>' +
      '</div>' +
      (parties.length
        ? '<div class="fa-party">' + parties.map(function (x) {
            return '<span class="fa-pt" style="--pc:' + (PARTY_C[x[0]] || "#6b7280") + '">' +
              esc(x[0]) + ' <b>' + x[1] + '</b></span>'; }).join("") + '</div>'
        : "") +
      (rows.length
        ? '<div class="fa-rows">' + rows.map(function (r) {
            return '<div class="fa-row">' +
              '<span class="fa-dot" style="background:' + (PARTY_C[r.party] || "#6b7280") + '"></span>' +
              '<b class="fa-mp">' + esc(r.mp) + '</b>' +
              '<span class="fa-pty">' + esc(r.party || "") + '</span>' +
              '<span class="fa-dt">' + esc(String(r.date || "").slice(0, 10)) + '</span>' +
              '<span class="fa-amt">' + won(r.amount) + '</span>' +
            '</div>'; }).join("") +
          (d.total > rows.length
            ? '<div class="fa-more">전체 ' + d.total + '건 중 최근 ' + rows.length + '건</div>' : "") +
          '</div>'
        : "") +
      '<p class="fa-note">' + (st.y0 || "") + '~' + (st.y1 || "") +
        ' 정치자금 지출내역. 중앙선관위 정보공개 자료를 언론 3사가 정리한 것으로,' +
        ' 기재된 내용만 그대로 표시합니다.</p>';
    box.classList.add("on");
  }

  function closeDetail(fromPop) {
    if (!DETAIL) return;
    hideSheet(); closeSub();
    DETAIL.classList.remove("open");
    document.body.classList.remove("fd-detail-on");
    if (!fromPop) { try { if (history.state && history.state.fdDetail) history.back(); } catch (_) {} }
    loadList();
  }
  function subSheet() { buildDetail(); return DETAIL.querySelector("#fd-dsub"); }
  function closeSub() {
    var el = DETAIL && DETAIL.querySelector("#fd-dsub");
    if (el) { el.classList.remove("open"); el.innerHTML = ""; }
  }

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
  var chKind = function (slug) {
    for (var i = 0; i < CH.length; i++) if (CH[i].slug === slug) return CH[i].kind || "";
    return "";
  };

  /* ── 탭 안 섹션 ───────────────────────────────────── */
  function mount() {
    var panel = document.querySelector('.tab-panel[data-panel="food"]');
    if (!panel || panel.querySelector(".fd-sec")) return false;

    SEC = document.createElement("div");
    SEC.className = "fd-sec";
    SEC.innerHTML =
      '<div class="fd-bar">' +
        '<button type="button" class="fd-loc" id="fd-sub">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>' +
          '<span id="fd-locn">전국</span>' +
          '<svg class="fd-cv" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>' +
        '</button>' +
        '<div class="fd-bar-r">' +
          '<button type="button" class="fd-ib" id="fd-filt2" aria-label="필터">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M7 12h10M11 18h2"/></svg></button>' +
          '<button type="button" class="fd-ib primary" id="fd-open" aria-label="지도">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3 3 5.5v15L9 18l6 3 6-2.5v-15L15 6 9 3z"/><path d="M9 3v15M15 6v15"/></svg>' +
            '<span>지도</span></button>' +
        '</div>' +
      '</div>' +
      '<nav class="fd-tabs" id="fd-tabs"></nav>' +
      '<div class="fd-seg" id="fd-seg"></div>' +
      '<div class="fd-prog" id="fd-prog" hidden>' +
        '<div class="fd-prog-bar"><i style="width:0%"></i></div><div class="fd-prog-n"></div></div>' +
      '<div class="fd-chips chip-scroll" id="fd-chips" hidden></div>' +
      '<div class="fd-list" id="fd-list"><div class="fd-empty">불러오는 중…</div></div>';
    panel.appendChild(SEC);

    CHIPS = SEC.querySelector("#fd-chips");
    LIST  = SEC.querySelector("#fd-list");
    PROG  = SEC.querySelector("#fd-prog");
    paintTabs();
    return true;
  }

  /* 🚨 요소에 직접 addEventListener 를 걸지 않는다 — document 위임으로만 받는다.
     SPA 셸이 페이지 DOM을 스냅샷으로 저장했다가 재방문 때 복원하는데,
     **HTML 은 돌아오지만 리스너는 안 돌아온다**. 실제로 버튼은 멀쩡히 보이는데
     눌러도 아무 일도 안 일어나는 상태가 됐다(실측). 위임이면 복원돼도 계속 산다. */
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (t.closest && t.closest("#fd-open")) { openMap(); return; }
    if (t.closest && t.closest("#fd-sub")) { openRegionPicker(); return; }
    var tb = t.closest && t.closest("#fd-tabs .fd-tb");
    if (tb) {
      tab = tb.dataset.t;
      seg = (TABS.filter(function (x) { return x.t === tab; })[0].segs[0] || [])[0];
      listLimit = 40; paintTabs(); loadList(); return;
    }
    var sg = t.closest && t.closest("#fd-seg .fd-sg");
    if (sg) {
      seg = sg.dataset.g;
      listLimit = 40;
      if (seg === "near" && !myPos) { paintSeg(); askPos(); return; }
      paintSeg(); loadList(); return;
    }
    if (t.closest && t.closest("#fd-filt2")) { openFilter(); return; }
    var chip = t.closest && t.closest("#fd-chips .fd-chip");
    if (chip) {
      chFilter = (chFilter === chip.dataset.slug) ? null : chip.dataset.slug;
      paintChips(); loadList(); return;
    }
    var sb2 = t.closest && t.closest("#fd-list [data-sort]");
    if (sb2) {
      sortBy = sb2.dataset.sort;
      if (sortBy === "near" && !myPos) { askPos(); return; }
      loadList(); return;
    }
    if (t.closest && t.closest("[data-untouched]")) {
      rpc("food_untouched", { p_region: myRegion, p_limit: 40 }).then(function (d) {
        var ps = (d && d.places) || [];
        usedThumb = new Set();
        LIST.innerHTML = '<div class="fg-lead">아직 아무도 판정하지 않은 집이에요.<br>' +
          '첫 판정이 그 집의 기준이 됩니다.</div>' + ps.map(card).join("");
      });
      return;
    }
    var gt = t.closest && t.closest("[data-gotab]");
    if (gt) { tab = gt.dataset.gotab; seg = "all"; listLimit = 40; paintTabs(); loadList(); return; }
    var h2 = t.closest && t.closest("[data-ch2]");
    if (h2) {
      chFilter = (chFilter === h2.dataset.ch2) ? null : h2.dataset.ch2;
      listLimit = 40; loadList(); paintMapChips(); return;
    }
    var hc = t.closest && t.closest("[data-cat2]");
    if (hc) { catFilter = hc.dataset.cat2 || null; listLimit = 40; loadList(); return; }
    if (t.closest && t.closest("#fd-list [data-near]")) { askPos(); return; }
    var hr = t.closest && t.closest("#fd-list [data-region]");
    if (hr) { pickRegion(hr.dataset.region, hr.dataset.rname); return; }
    var mo = t.closest && t.closest("[data-more]");
    if (mo) { listLimit += 60; mo.textContent = "불러오는 중…"; loadList(); return; }
    var rc = t.closest && t.closest("#fd-list .fd-rc");
    if (rc) { openDetail(rc.dataset.id); return; }
    var card = t.closest && t.closest("#fd-list .fd-card");
    if (card) { openDetail(card.dataset.id); return; }
    var fb = t.closest && t.closest("#fd-list .fb-card");
    if (fb) { openDetail(fb.dataset.id); return; }
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

  function paintTabs() {
    var tn = SEC && SEC.querySelector("#fd-tabs"); if (!tn) return;
    tn.innerHTML = TABS.map(function (x) {
      return '<button type="button" class="fd-tb' + (tab === x.t ? " on" : "") + '" data-t="' + x.t + '">' +
        x.name + '</button>';
    }).join("");
    paintSeg();
  }
  function paintSeg() {
    var el = SEC && SEC.querySelector("#fd-seg"); if (!el) return;
    var cur = TABS.filter(function (x) { return x.t === tab; })[0];
    el.innerHTML = (cur.segs || []).map(function (g) {
      return '<button type="button" class="fd-sg' + (seg === g[0] ? " on" : "") + '" data-g="' + g[0] + '">' +
        g[1] + '</button>';
    }).join("");
  }

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

  /* 거리 — 캐치테이블의 "내 위치에서 719m"를 차용. 좌표가 이미 있으니 서버를 안 부른다. */
  function km(a, b, c, d) {
    var R = 6371, r = Math.PI / 180;
    var x = Math.sin((c - a) * r / 2), y = Math.sin((d - b) * r / 2);
    return 2 * R * Math.asin(Math.sqrt(x * x + Math.cos(a * r) * Math.cos(c * r) * y * y));
  }
  function distText(p) {
    if (!myPos || p.lat == null) return "";
    var d = km(myPos.lat, myPos.lon, +p.lat, +p.lon);
    return d < 1 ? Math.round(d * 1000) + "m" : d.toFixed(1) + "km";
  }
  /* 최근 본 곳 — 캐치테이블의 '최근 본 매장'. 서버에 남길 필요가 없는 개인 흔적이라
     localStorage 에 둔다(비로그인도 되고, 서버 부담도 없다). */
  function pushRecent(p) {
    try {
      var a = JSON.parse(localStorage.getItem("galla_food_recent") || "[]");
      a = a.filter(function (x) { return x.id !== p.id; });
      a.unshift({ id: p.id, name: p.name, address: p.address, cat: p.category });
      localStorage.setItem("galla_food_recent", JSON.stringify(a.slice(0, 12)));
    } catch (_) {}
  }
  function recentHtml() {
    var a = [];
    try { a = JSON.parse(localStorage.getItem("galla_food_recent") || "[]"); } catch (_) {}
    if (!a.length) return "";
    return '<div class="fd-recent"><div class="fd-recent-t">최근 본 곳</div>' +
      '<div class="fd-recent-row chip-scroll">' + a.map(function (x) {
        return '<button type="button" class="fd-rc" data-id="' + esc(x.id) + '">' +
          '<span class="fd-rc-n">' + esc(x.name) + '</span>' +
          '<span class="fd-rc-a">' + esc((x.address || "").split(" ").slice(0, 2).join(" ")) + '</span></button>';
      }).join("") + '</div></div>';
  }
  function sortPlaces(ps) {
    if (sortBy === "near" && myPos) {
      return ps.slice().sort(function (a, b) {
        if (a.lat == null) return 1; if (b.lat == null) return -1;
        return km(myPos.lat, myPos.lon, +a.lat, +a.lon) - km(myPos.lat, myPos.lon, +b.lat, +b.lon);
      });
    }
    if (sortBy === "heat") {
      return ps.slice().sort(function (a, b) {
        return ((b.good || 0) + (b.bad || 0)) - ((a.good || 0) + (a.bad || 0));
      });
    }
    return ps;
  }

  /* 카드 — 사진을 주인공으로. 예전엔 이름·주소·태그·점수가 전부 비슷한 무게로 쌓여
     눈이 갈 곳이 없었다(사장님: 촌스럽다). 위계를 셋으로 줄인다:
       ① 썸네일  ② 상호(크게)  ③ 나머지는 한 줄로 눌러서 회색.
     사진은 출처 영상 썸네일을 쓴다 — 매장 사진이 없는 우리가 가진 유일한 이미지다. */
  function shortAddr(ad) {
    var t = String(ad || "").split(/\s+/);
    return t.length > 2 ? t.slice(1, 3).join(" ") : t.join(" ");
  }
  /* 카테고리 타일 — 영상 썸네일이 없거나 이미 쓴 경우의 대체 그림.
     ⚠️ 영상 하나에 식당이 여러 곳 나오면 그 집들이 같은 video_id 를 공유한다.
        그대로 두면 같은 사진이 5번 반복되고(사장님 지적), 게다가 그건 '가게 사진'이
        아니라 '영상 썸네일'이라 오해까지 준다 → 목록 안에서 한 번만 쓴다. */
  /* 사진 없는 집의 자리표.
     ⚠️ 예전엔 업종 8종에 이모지 하나씩이라, 사진이 0곳이던 시절 목록이 통째로
        똑같은 🍜 벽이었다(실측 2026-08-31: 4,076곳 중 사진 0곳). 이모지는 정보가 0이다.
        → 업종 색 + **상호 첫 글자**로 집마다 다르게 만든다. 최소한 어느 집인지는 보인다. */
  var CATTILE = [
    [/한식|백반|국밥|해장|곰탕|설렁|찌개|정식|한정식/, "#3a2a1e", "#c9a06a"],
    [/고기|갈비|삼겹|곱창|막창|족발|보쌈|치킨|닭/,     "#3a221e", "#d08a6a"],
    [/중식|중국|짜장|짬뽕|만두/,                        "#33201f", "#d0796a"],
    [/일식|초밥|스시|돈까스|우동|라멘|카레/,            "#1e2c33", "#6aa8d0"],
    [/양식|파스타|피자|스테이크|햄버거|버거/,           "#2b2438", "#a68ad0"],
    [/분식|김밥|떡볶|만두|국수|칼국수|냉면/,            "#33261a", "#d0b46a"],
    [/카페|디저트|베이커리|제과|빵|커피/,               "#26301f", "#8ac97a"],
    [/술집|주점|호프|포차|이자카야|바|맥주/,            "#301f2a", "#d06a9a"],
    [/회|해물|생선|장어|아구|조개|물회/,                "#1f2f30", "#6ac9c0"]
  ];
  function catTile(cat) {
    var c = String(cat || "");
    for (var i = 0; i < CATTILE.length; i++) if (CATTILE[i][0].test(c)) return CATTILE[i];
    return [null, "#242730", "#8b93a7"];
  }
  /* 상호에서 글자를 뽑는다 — 지점명·괄호는 떼고 앞 두 글자.
     '명동교자 본점' → '명동', '77돌곱창' → '77'. */
  function initials(name) {
    var raw = String(name || "").replace(/\([^)]*\)/g, "").trim();
    /* ⚠️ '○○점' 을 무조건 떼면 상호 자체가 사라진다 — '듀팡과자점' → '' → '?' 였다(실측).
       지점명은 보통 **띄어쓰기 뒤**에 온다('명동교자 본점'). 붙어 있는 건 상호의 일부로 본다.
       그래도 남는 게 두 글자가 안 되면 원래 이름을 쓴다. */
    var n = raw.replace(/\s+(본점|직영점|[가-힣A-Za-z0-9]{1,6}점)$/, "").trim();
    if (n.length < 2) n = raw;
    return n.slice(0, 2) || "?";
  }
  var usedThumb = null;
  function tileHtml(p) {
    var t = catTile(p.category);
    return '<span class="fd-tile" style="background:' + t[1] + ';color:' + t[2] + '">' +
             esc(initials(p.name)) +
           '</span>';
  }
  function card(p) {
    /* 둘러보기는 **가게 사진**만 쓴다(사장님 지시).
       예전엔 사진이 없으면 영상 썸네일로 떨어졌는데, 유튜브 썸네일은 자막이 박힌
       방송 표지라 '식당 리스트'에 섞이면 무엇을 보는 화면인지 흐려진다.
       영상 썸네일은 '누가 갔나'의 몫이다 — 거기선 그게 정보다. */
    var th = p.cover || "";
    var tot = (p.good || 0) + (p.bad || 0);
    var meta = [p.category, shortAddr(p.address), distText(p)].filter(Boolean).join(" · ");
    var ch = (p.channels && p.channels.length) ? p.channels[0] : "";
    return '<article class="fd-card' + (p.visited ? " visited" : "") + '" data-id="' + esc(p.id) + '">' +
      '<div class="fd-th">' +
        (th ? '<img src="' + esc(th) + '" alt="" loading="lazy">' : tileHtml(p)) +
        (p.visited ? '<i class="fd-th-chk">✓</i>' : '') +
        (p.photos_n > 1 ? '<i class="fd-th-n">' + p.photos_n + '</i>' : '') +
      '</div>' +
      '<div class="fd-b">' +
        '<h4 class="fd-name">' + esc(p.name) + '</h4>' +
        '<p class="fd-sub">' + esc(meta) + '</p>' +
        '<div class="fd-foot">' +
          (ch ? '<span class="fd-ch big">' +
                  (chThumb(ch) ? '<img src="' + esc(chThumb(ch)) + '" alt="" loading="lazy">' : '') +
                  esc(chName(ch)) + '</span>' : '') +
          (p.channels && p.channels.length > 1 ? '<span class="fd-more">+' + (p.channels.length - 1) + '</span>' : '') +
          (tot ? '<span class="fd-vs"><b>' + p.good + '</b>:<i>' + p.bad + '</i></span>' : '') +
        '</div>' +
      '</div>' +
    '</article>';
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
    /* '누가 갔나'는 **그 채널의 영상 썸네일**이 원칙이다(어느 방송에 나왔는지가 정보다).
       food_browse 가 채널을 맞춰(f2.channel = ch.slug) 영상을 골라준다.
       다만 영상이 연결된 곳이 264곳뿐이라, 없으면 가게 사진 → 상호 타일 순으로 내려간다. */
    var th = ytThumb(p.video_id) || p.cover || "";
    var tot = (p.good || 0) + (p.bad || 0);
    return '<div class="fb-card' + (p.visited ? " visited" : "") + '" data-id="' + esc(p.id) + '">' +
      '<div class="fb-thumb">' +
        (th ? '<img src="' + esc(th) + '" alt="" loading="lazy">' : tileHtml(p)) +
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
  async function loadBrowse(kind) {
    var d = await rpc("food_browse", { p_per: 10, p_channels: 20 });
    var secs = (d && d.sections) || [];
    if (kind === "yt" || kind === "tv" || kind === "guide" || kind === "gov") {
      secs = secs.filter(function (x) { return x.kind === kind; });
    }
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

  /* 탐색 허브 — 캐치테이블 홈은 '목록'이 아니라 지역·카테고리 진입점의 조합이다.
     우리 둘러보기도 그냥 카드 리스트였다. 데이터는 이미 있다(food_regions/food_categories)
     — 서버를 더 부르지 않고 이미 받은 걸 눌러 쓴다. */
  function gapsHtml() {
    if (!GAPS || !GAPS.total) return "";
    var n = GAPS.no_vote;
    if (!n) return "";
    /* "채워주세요"가 아니라 "아직 아무도 안 했다" 로 말한다.
       빈 칸은 부탁이지만, 아무도 안 한 건 기회다. 첫 사람은 그 집의 기준이 된다. */
    return '<button type="button" class="fg-banner" data-untouched="1">' +
      '<b>' + n + '곳</b>이 아직 아무 판정도 없어요' +
      '<span>첫 판정이 그 집의 기준이 됩니다 ›</span></button>';
  }
  function hubHtml() {
    if (tab !== "browse") return "";
    var out = gapsHtml();
    var cities = [];
    ((REGIONS && REGIONS.sido) || []).forEach(function (sd) {
      (sd.cities || []).forEach(function (c) {
        if (c.n) cities.push({ code: c.code, name: c.name, n: c.n, sido: sd.name });
      });
    });
    cities.sort(function (a, b) { return b.n - a.n; });
    if (cities.length) {
      out += '<section class="fh-sec"><div class="fh-h">어디로 가시나요?' +
        '<button type="button" class="fh-near" data-near="1">내 주변</button></div>' +
        '<div class="fh-row chip-scroll">' + cities.slice(0, 10).map(function (c) {
          return '<button type="button" class="fh-loc' + (myRegion === c.code ? " on" : "") +
            '" data-region="' + esc(c.code) + '" data-rname="' + esc(c.name) + '">' +
            '<span class="fh-loc-n">' + esc(c.name) + '</span>' +
            '<span class="fh-loc-c">' + c.n + '곳</span></button>';
        }).join("") + '</div></section>';
    }
    /* 누가 다녀갔나 — 맛집여지도의 정체성이 이것이다. 지역·카테고리와 나란히 1급으로 둔다. */
    var chs = CH.filter(function (c) { return c.total; }).sort(function (a, b) { return b.total - a.total; });
    if (chs.length) {
      out += '<section class="fh-sec"><div class="fh-h">누가 다녀갔나' +
        '<button type="button" class="fh-near" data-gotab="who">전체 보기</button></div>' +
        '<div class="fh-row chip-scroll">' + chs.slice(0, 12).map(function (c) {
          return '<button type="button" class="fh-ch' + (chFilter === c.slug ? " on" : "") +
            '" data-ch2="' + esc(c.slug) + '">' +
            /* 로고가 없는 출처(백년가게·생방송 투데이처럼 유튜브 채널이 없는 곳)는
               빈 원으로 나왔다. 이름 첫 글자로 채운다 — 빈 동그라미보다 낫다. */
            '<span class="fh-ch-i' + (c.thumb ? '' : ' none') + '">' +
              (c.thumb ? '<img src="' + esc(c.thumb) + '" alt="" loading="lazy">' : esc(initials(c.name))) +
            '</span>' +
            '<span class="fh-ch-n">' + esc(c.name) + '</span>' +
            '<span class="fh-ch-c">' + c.total + '곳</span></button>';
        }).join("") + '</div></section>';
    }
    if (CATS && CATS.length) {
      out += '<section class="fh-sec"><div class="fh-h">무엇을 먹을까요?</div>' +
        '<div class="fh-row chip-scroll">' +
          '<button type="button" class="fh-cat' + (catFilter ? "" : " on") + '" data-cat2="">전체</button>' +
          CATS.map(function (c) {
            return '<button type="button" class="fh-cat' + (catFilter === c.name ? " on" : "") +
              '" data-cat2="' + esc(c.name) + '">' + esc(c.name) +
              '<span class="n">' + c.n + '</span></button>';
          }).join("") + '</div></section>';
    }
    return out;
  }

  async function loadList() {
    if (!LIST) return;
    // 허브에 쓸 데이터는 한 번만 받아 캐시한다
    if (tab === "browse" && !REGIONS) REGIONS = await rpc("food_regions");
    if (tab === "browse" && !CATS.length) CATS = (await rpc("food_categories")) || [];
    if (tab === "browse") GAPS = await rpc("food_gaps", { p_region: myRegion });
    if (tab === "me")   { return seg === "leaders" ? loadLeaders() : loadBadges(); }
    if (tab === "who") { return loadBrowse(seg); }
    /* 둘러보기는 정렬(seg)만 바뀌고, 랭킹은 서버 랭킹 종류(seg)가 바뀐다 */
    mode = (tab === "rank") ? seg : "near";
    sortBy = (tab === "browse") ? seg : "new";
    var ps, d;
    if (mode === "near") {
      d = await rpc("food_map", { p_region: myRegion, p_channel: chFilter, p_limit: listLimit,
                                  p_category: catFilter, p_min_shows: minShows });
      ps = (d && d.places) || [];
    } else {
      // 랭킹은 전국 기준. 최소 표수를 넘긴 집만 올라온다(표본이 적으면 우연이니까).
      d = await rpc("food_rank", { p_kind: mode, p_min_votes: 3, p_limit: listLimit });
      ps = (d && d.places) || [];
    }
    ps = sortPlaces(ps);
    if (!ps.length) {
      LIST.innerHTML = '<div class="fd-empty">' + (EMPTY[mode] ||
        ((myRegionName ? esc(myRegionName) + "엔 " : "") + "아직 등록된 방송 맛집이 없어요.<br>지도에서 다른 동네를 둘러보세요.")) +
        '</div>';
      return;
    }
    usedThumb = new Set();
    LIST.innerHTML = hubHtml() + recentHtml() + ps.map(card).join("") +
      (ps.length >= listLimit
        ? '<button type="button" class="fd-more-btn" data-more="1">더 보기</button>'
        : (ps.length > 12 ? '<div class="fd-end">' + ps.length + '곳을 다 봤어요</div>' : ''));
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
      '<div class="fd-fsheet" id="fd-fsheet"></div>';
    document.body.appendChild(MAP);

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
      if (MAP.querySelector("#fd-fsheet.open") && !t.closest("#fd-fsheet")) closeFilter();
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
      try { window.__fdMB = MB; } catch (_) {}   // 진단용 — 지도 경계 계산이 틀렸을 때 들여다본다
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
        openDetail(focusId);
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
    if (!b) {
      /* 지도가 아직 자기 크기를 모른다 — 경계가 한 점으로 접혀 있다.
         0건을 그리면 "이 구역엔 없어요"가 잘못 뜨므로, 조용히 다시 시도한다. */
      MB.refresh();
      bboxRetry = (bboxRetry || 0) + 1;
      if (bboxRetry < 8) { clearTimeout(moveTimer); moveTimer = setTimeout(fetchBbox, 250); }
      return;
    }
    bboxRetry = 0;
    var d = await rpc("food_map", {
      p_sw_lat: b.swLat, p_sw_lon: b.swLon,
      p_ne_lat: b.neLat, p_ne_lon: b.neLon,
      p_channel: chFilter, p_only_unvisited: onlyUnvisited, p_limit: 400,
      p_category: catFilter, p_min_shows: minShows,
      /* 지도는 '최신 400개'가 아니라 '고르게 400개'여야 한다.
         수집이 늘자 전국 화면이 마지막에 훑은 채널 쪽으로 쏠렸다 — 나머지 지역은 텅 빈다.
         목록(둘러보기)은 최신순이 맞으므로 거기엔 안 켠다. */
      p_spread: true
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

  /* 공직자 출처는 기관 마크로 구분한다 — 국회는 국회 휘장, 정부는 정부상징(태극),
     지자체는 해당 시·도. 이미지 파일을 재호스팅하지 않고 SVG 로 그린다
     (방송 로고는 YouTube CDN 참조, 기관 마크는 자체 렌더 — 둘 다 복제 저장은 안 한다).
     시·도 데이터가 들어오면 GOVMARK 에 항목만 늘리면 된다. */
  var GOVMARK = {
    /* 국회 — 무궁화 휘장 안에 '국' */
    assembly: {
      bg: "#0d2a52", ring: "#c9a227",
      svg: '<svg viewBox="0 0 40 40" aria-hidden="true">' +
        '<g fill="#c9a227">' +
        '<circle cx="20" cy="7.6" r="5.1"/><circle cx="31.8" cy="16.2" r="5.1"/>' +
        '<circle cx="27.3" cy="30.1" r="5.1"/><circle cx="12.7" cy="30.1" r="5.1"/>' +
        '<circle cx="8.2" cy="16.2" r="5.1"/>' +
        '</g><circle cx="20" cy="20" r="9.4" fill="#0d2a52"/>' +
        '<text x="20" y="24.6" text-anchor="middle" font-size="12.5" font-weight="800" fill="#c9a227">국</text>' +
        '</svg>'
    },
    /* 중앙정부 — 정부상징 문양.
       행안부 '정부기에 관한 공고'(2016.3.29. 대통령공고 제264호) 사용방법 '다' 항:
       "정부를 상징하는 문양이 필요한 경우 깃면의 바탕 또는 글자를 제외하여 사용할 수 있다."
       표준 색도: 좌측 진한 파랑 2.5PB 2/6 · 우측 선명한 빨강 2.5R 4/14 · 가운데 흰색. */
    gov: {
      bg: "#ffffff", ring: "#8f9199",
      svg: '<svg viewBox="0 0 40 40" aria-hidden="true">' +
        '<circle cx="20" cy="20" r="16" fill="#fff"/>' +
        '<path d="M4 20a16 16 0 0 1 32 0 8 8 0 0 0-16 0 8 8 0 0 1-16 0Z" fill="#003876"/>' +
        '<path d="M36 20a16 16 0 0 1-32 0 8 8 0 0 0 16 0 8 8 0 0 1 16 0Z" fill="#c8102e"/>' +
        '</svg>'
    },
    /* 지자체 기본 — 시청 */
    city: {
      bg: "#1f3d2b", ring: "#5fbf7f",
      svg: '<svg viewBox="0 0 40 40" aria-hidden="true"><g fill="#5fbf7f">' +
        '<path d="M20 5 6 14h28L20 5Z"/><rect x="7" y="16" width="26" height="17" rx="1.6"/>' +
        '</g><rect x="17.6" y="23" width="4.8" height="10" fill="#0b0b0e"/></svg>'
    },
    /* 서울시 — 한글 로고타입 */
    seoul: {
      bg: "#ffffff", ring: "#c0392b",
      svg: '<svg viewBox="0 0 40 40" aria-hidden="true">' +
        '<text x="20" y="26" text-anchor="middle" font-size="15" font-weight="800" fill="#c0392b">서울</text>' +
        '</svg>'
    }
  };
  var CITY_RE = /^(busan|daegu|incheon|gwangju|daejeon|ulsan|gyeonggi|sejong|jeju)/;
  function govMark(slug) {
    var m = GOVMARK[slug] ||
            (/^seoul/.test(slug || "") ? GOVMARK.seoul
             : CITY_RE.test(slug || "") ? GOVMARK.city : GOVMARK.gov);
    return { html: m.svg, bg: m.bg, ring: m.ring };
  }

  /* 마커에 '어느 방송에 나왔는지'를 띄운다 — 지도만 봐도 또간집인지 쯔양인지 안다.
     로고가 아직 없는 채널(썸네일 수집 전)이나 유저 제보 건은 기본 아이콘으로 떨어진다. */
  function pin(p) {
    /* 출처가 여럿일 때 무엇을 세울지.
       ⚠️ 처음엔 공직자를 항상 먼저 세웠다. 그런데 의원 밥집이 여의도·광화문·을지로에
          몰려 있어서 **도심 지도가 국회 마크로 뒤덮였다**(실측: 화면 289곳 중 절반 이상).
          갈라만 가진 축이라 눈에 띄게 한 건데 도심에선 역효과였다.
       → 평소엔 방송·유튜버 로고를 세우고, **국회 칩으로 필터했을 때만** 국회 마크를 쓴다.
         국회가 유일한 출처인 집은 당연히 그대로 국회 마크다. 두 축이 서로 안 가린다. */
    var chs = (p.channels || []);
    var gov = "";
    for (var gi = 0; gi < chs.length; gi++) if (chKind(chs[gi]) === "gov") { gov = chs[gi]; break; }
    var other = "";
    for (var oi = 0; oi < chs.length; oi++) if (chKind(chs[oi]) !== "gov") { other = chs[oi]; break; }
    if (gov && other && chKind(chFilter) !== "gov") gov = "";   // 필터 안 걸었으면 방송을 세운다
    var slug = gov || other || (chs.length ? chs[0] : "");
    var thumb = (!gov && slug) ? chThumb(slug) : "";
    var more = chs.length > 1 ? chs.length : 0;
    var gm = gov ? govMark(gov) : null;
    var inner = gm
      ? gm.html
      : (thumb
          ? '<img src="' + esc(thumb) + '" alt="' + esc(chName(slug)) + '" loading="lazy">'
          : '<span class="fd-pin-e">' + (p.visited ? "✓" : "🍜") + '</span>');
    var html = '<div class="fd-pin' + (p.visited ? " visited" : "") +
      (thumb ? " has-logo" : "") + (gm ? " is-gov" : "") + '"' +
      (gm ? ' style="background:' + gm.bg + ';border-color:' + gm.ring + '"' : "") + '>' +
      inner +
      (p.visited ? '<i class="fd-pin-chk">✓</i>' : '') +
      (more ? '<i class="fd-pin-n">' + more + '</i>' : '') +
      '</div>';
    /* ⚠️ 예전엔 여기서 직접 rpc + showSheet() 를 불렀다. 상세를 지도 밖 독립
       오버레이(#fd-detail)로 뽑아낸 뒤에도 이 경로만 옛 코드로 남아서, showSheet 이
       SHEET(=DETAIL 안의 요소)를 못 찾고 조용히 죽었다 — **핀을 눌러도 아무 일이
       안 일어났다**(2026-08-31 시뮬 실측). 목록 카드와 같은 입구를 쓴다. */
    return MB.marker(+p.lat, +p.lon, html, 38, function () { openDetail(p.id); });
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
    pushRecent(d.place);
    var p = d.place, st = d.stats || { good: 0, bad: 0 };
    var vid = (d.sources || []).reduce(function (a, x) { return a || x.video_id; }, "");
    SHEET.innerHTML =
      '<div class="fd-sheet-grip"></div>' +
      '<button type="button" class="fd-dclose" aria-label="닫기">✕</button>' +
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
      /* 국회의원이 정치자금으로 밥 먹은 집이면 여기에 명단이 붙는다.
         비어 있으면 렌더 자체를 안 한다 — 4,700곳 대부분은 해당 없다. */
      '<div class="fd-asm" id="fd-asm"></div>' +
      '<div class="fd-judge" id="fd-judge"></div>' +
      '<div class="fd-why" id="fd-why"></div>' +
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
      /* 메뉴판 — 유저 제보와 AI 추출을 구분해 보여준다. 출처가 안 보이면 신뢰가 안 선다. */
      '<div class="fd-photos" id="fd-photos">' + photoHtml(d.photos || []) + '</div>' +
      '<div class="fd-menu" id="fd-menu">' + menuHtml(d.menus || []) + '</div>' +
      '<button type="button" class="fd-flag" data-a="report">🏳 정보가 잘못됐나요?</button>' +
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

  /* 사진 — 우리에겐 매장 사진이 없다. 유저가 채워야 한다.
     캐치테이블 수준의 비주얼은 이 데이터 없이는 구조적으로 안 나온다. */
  function photoHtml(ps) {
    return '<div class="fp-h">사진' + (ps.length ? ' <b>' + ps.length + '</b>' : '') +
        '<button type="button" class="fp-add" data-a="photo">+ 사진 올리기</button></div>' +
      (ps.length
        ? '<div class="fp-row chip-scroll">' + ps.map(function (x) {
            /* 공공 데이터 사진(관광공사)은 공공누리라 **출처 표시가 의무**다.
               유저 제보는 닉네임이 곧 출처이므로 credit 이 비어 있다. */
            var by = x.credit ? x.credit : (x.nick || "익명");
            return '<div class="fp-i"><img src="' + esc(x.url) + '" alt="" loading="lazy">' +
              '<span class="fp-by' + (x.credit ? ' src' : '') + '">' + esc(by) + '</span>' +
              (x.mine ? '<button type="button" class="fp-x" data-photo="' + x.id + '">✕</button>' : '') +
            '</div>'; }).join("") + '</div>'
        : '<div class="fp-empty">아직 사진이 없어요. 다녀오셨다면 한 장 올려주세요.</div>');
  }
  async function addPhoto() {
    if (!curPlace) return;
    if (!(await loggedIn())) return needLogin();
    if (!window.GALLA_UPLOAD_MEDIA) return toast("업로드 모듈을 불러오지 못했어요");
    var inp = document.createElement("input");
    inp.type = "file"; inp.accept = "image/*"; inp.style.display = "none";
    document.body.appendChild(inp);
    inp.addEventListener("change", async function () {
      var f = inp.files && inp.files[0];
      inp.remove();
      if (!f) return;
      if (f.size > 12 * 1024 * 1024) return toast("사진이 너무 커요 (12MB 이하)");
      toast("올리는 중…");
      try {
        var url = await window.GALLA_UPLOAD_MEDIA(f, "image");
        var r = await rpc("food_photo_add", { p_id: curPlace.place.id, p_url: url });
        if (!r || !r.ok) {
          if (r && r.reason === "mine_full") return toast("한 집에 5장까지 올릴 수 있어요");
          if (r && r.reason === "full") return toast("이 집은 사진이 가득 찼어요");
          return toast("등록하지 못했어요");
        }
        toast("사진 고맙습니다");
        await refreshSheet();
      } catch (e) { toast("업로드 실패 — 잠시 후 다시"); }
    });
    inp.click();
  }
  async function removePhoto(id) {
    var r = await rpc("food_photo_remove", { p_photo: Number(id) });
    if (r && r.ok) { toast("내렸어요"); refreshSheet(); }
  }
  async function refreshSheet() {
    if (!curPlace) return;
    var d = await rpc("food_place_detail", { p_id: curPlace.place.id });
    if (!d || !d.ok) return;
    curPlace = d;
    var ph = SHEET.querySelector("#fd-photos");
    if (ph) ph.innerHTML = photoHtml(d.photos || []);
    loadList();
  }

  function won(n) { return n == null ? "" : Number(n).toLocaleString("ko-KR") + "원"; }
  function menuHtml(ms) {
    return '<div class="fm-h">메뉴' + (ms.length ? ' <b>' + ms.length + '</b>' : '') +
        '<button type="button" class="fm-add" data-a="menu">+ 메뉴 제보</button></div>' +
      (ms.length
        ? '<div class="fm-list">' + ms.map(function (m) {
            return '<div class="fm-row"><span class="fm-n">' + esc(m.name) +
              (m.source === "yt" ? '<i class="fm-src" title="영상에서 자동 추출">📺</i>' : '') +
              (m.source === "user" && m.nick ? '<i class="fm-by">' + esc(m.nick) + '</i>' : '') +
              '</span><b class="fm-p">' + (m.price ? esc(won(m.price)) : "–") + '</b></div>';
          }).join("") + '</div>'
        : '<div class="fm-empty">아직 메뉴가 없어요. 다녀오셨다면 알려주세요.</div>');
  }

  function talkRow(c) {
    return '<div class="fd-c ' + (c.faction === "good" ? "good" : "bad") + '">' +
      '<div class="fd-c-h"><b>' + esc(c.nick) + '</b>' +
        '<span class="fd-c-fac">' + (c.faction === "good" ? "맛있다" : "맛없다") + '</span></div>' +
      '<div class="fd-c-b">' + esc(c.body) + '</div>' +
      '<button type="button" class="fd-c-like' + (c.liked ? " on" : "") + '" data-like="' + c.id + '">' +
        '👍 ' + (c.likes || 0) + '</button></div>';
  }

  /* 정보 제보 — 데이터가 자동수집이라 폐업한 집이 계속 쌓인다.
     서로 다른 유저 3명이 '폐업'을 찍으면 서버가 **자동으로 지도에서 내린다**(status='hidden').
     완전 삭제가 아니라 오판이어도 되돌릴 수 있다. */
  var REPORT_KINDS = [
    ["closed",    "🚫 폐업했어요"],
    ["address",   "📍 주소가 달라요"],
    ["duplicate", "👯 중복된 집이에요"],
    ["info",      "✏️ 정보를 고쳐주세요"],
    ["other",     "❓ 그 밖의 문제"]
  ];
  function openReport() {
    var FS = subSheet();
    FS.innerHTML = '<div class="fd-sheet-grip"></div>' +
      '<div class="ff-head">정보가 잘못됐나요?</div>' +
      '<p class="fr-lead">' + esc(curPlace.place.name) + ' — 무엇이 문제인가요?</p>' +
      '<div class="fr-list">' + REPORT_KINDS.map(function (k) {
        return '<button type="button" class="fr-item" data-rep="' + k[0] + '">' + k[1] + '</button>';
      }).join("") + '</div>' +
      '<input class="fr-body" id="fr-body" maxlength="500" placeholder="자세히 알려주시면 더 좋아요 (선택)">';
    FS.classList.add("open");
  }
  async function sendReport(kind) {
    if (!curPlace) return;
    if (!(await loggedIn())) return needLogin();
    var bd = DETAIL.querySelector("#fr-body");
    var r = await rpc("food_report", { p_id: curPlace.place.id, p_kind: kind,
                                       p_body: bd ? bd.value : null });
    closeSub();
    if (!r || !r.ok) return toast("접수하지 못했어요");
    if (r.already) return toast("이미 접수된 제보예요");
    if (r.hidden) { toast("폐업 제보가 모여 지도에서 내렸어요"); closeDetail(); return; }
    toast(kind === "closed"
      ? "폐업 제보 " + r.closed_votes + "/" + r.threshold + " — 고맙습니다"
      : "제보 고맙습니다");
  }

  function openMenuForm() {
    var FS = subSheet();
    FS.innerHTML = '<div class="fd-sheet-grip"></div>' +
      '<div class="ff-head">메뉴 제보</div>' +
      '<p class="fr-lead">한 줄에 하나씩. "메뉴명 가격" 형식이면 가격까지 잡힙니다.</p>' +
      '<textarea class="fm-ta" id="fm-ta" rows="6" placeholder="김치찌개 9000&#10;계란말이 7000&#10;공기밥 1000"></textarea>' +
      '<button type="button" class="ff-go" data-a="menu-save">등록</button>';
    FS.classList.add("open");
  }
  async function saveMenu() {
    if (!curPlace) return;
    if (!(await loggedIn())) return needLogin();
    var ta = DETAIL.querySelector("#fm-ta"); if (!ta) return;
    /* "김치찌개 9000" / "김치찌개 9,000원" 둘 다 받는다. 마지막 숫자 덩어리를 가격으로 본다. */
    var items = (ta.value || "").split(/\n+/).map(function (line) {
      var t = line.trim(); if (!t) return null;
      var m = t.match(/^(.*?)[\s:]+([0-9][0-9,]*)\s*원?$/);
      return m ? { name: m[1].trim(), price: m[2] } : { name: t };
    }).filter(function (x) { return x && x.name; });
    if (!items.length) return toast("메뉴를 입력해주세요");
    var r = await rpc("food_menu_add", { p_id: curPlace.place.id, p_items: items });
    if (!r || !r.ok) {
      if (r && r.reason === "full") return toast("이 집은 메뉴가 가득 찼어요");
      return toast("등록하지 못했어요");
    }
    closeSub();
    toast(r.added ? r.added + "개 등록했어요" : "이미 등록된 메뉴예요");
    var d = await rpc("food_place_detail", { p_id: curPlace.place.id });
    if (d && d.ok) { curPlace = d; var el = SHEET.querySelector("#fd-menu");
      if (el) el.innerHTML = menuHtml(d.menus || []); }
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
  /* 상세 오버레이 위임 — 예전엔 이 처리들이 지도(MAP)에 붙어 있었다.
     상세를 지도에서 떼어냈으니 함께 옮긴다. 안 옮기면 버튼이 전부 죽는다. */
  function onDetailClick(e) {
    var t = e.target;
    if (t.closest(".fd-dclose") || t.closest(".fd-detail-bg")) { closeDetail(); return; }
    var vw = t.closest(".fd-vid");
    if (vw && vw.dataset.vid) {
      vw.innerHTML = '<iframe src="/yt?v=' + encodeURIComponent(vw.dataset.vid) +
        '" allow="autoplay; encrypted-media" allowfullscreen loading="lazy"></iframe>';
      vw.classList.add("playing"); return;
    }
    var wy = t.closest("[data-why]");
    if (wy) { sendWhy(wy.dataset.why); return; }
    if (t.closest("[data-why-skip]")) { closeWhy(); return; }
    if (t.closest('[data-a="photo"]')) { addPhoto(); return; }
    var px = t.closest("[data-photo]");
    if (px) { removePhoto(px.dataset.photo); return; }
    if (t.closest('[data-a="menu"]')) { openMenuForm(); return; }
    if (t.closest('[data-a="menu-save"]')) { saveMenu(); return; }
    if (t.closest('[data-a="report"]')) { openReport(); return; }
    var rep = t.closest("[data-rep]");
    if (rep) { sendReport(rep.dataset.rep); return; }
    if (t.closest(".fd-act")) { onSheetClick(e); return; }
    var jb = t.closest("[data-j]");
    if (jb) { onJudge(jb.dataset.j); return; }
    var lk = t.closest("[data-like]");
    if (lk) { onLike(lk.dataset.like, lk); return; }
    if (DETAIL.querySelector("#fd-dsub.open") && !t.closest("#fd-dsub")) closeSub();
  }
  function onDetailSubmit(e) {
    if (e.target && e.target.id === "fd-say") { e.preventDefault(); onSay(); return; }
    if (e.target && e.target.id === "fw-f") {
      e.preventDefault();
      var i = DETAIL.querySelector("#fw-i"); sendWhy(i && i.value.trim()); return;
    }
  }

  /* 판정 직후 '왜?'를 묻는다 — 여기가 참여 엔진이다.
     예전엔 판정과 댓글이 끊겨 있어서 누르고 그냥 끝났다. 근거가 안 쌓이니
     다음 사람이 볼 게 없고 반박할 대상도 없었다(사진 0·메뉴 0의 진짜 원인).
     한 줄이라도 남으면 그게 다음 사람의 판정 근거가 되고, 반대편이 반박한다. */
  var WHY = {
    good: ["재료가 좋다", "가격이 착하다", "웨이팅 값 한다", "또 갈 거다", "사장님이 좋다"],
    bad:  ["과대평가", "비싸다", "웨이팅 아깝다", "그냥 그렇다", "다신 안 간다"]
  };
  function askWhy(v) {
    var el = SHEET && SHEET.querySelector("#fd-why"); if (!el) return;
    el.innerHTML =
      '<div class="fw-t">' + (v === "good" ? "어디가 좋았어요?" : "왜 별로였어요?") +
        '<button type="button" class="fw-skip" data-why-skip="1">건너뛰기</button></div>' +
      '<div class="fw-row chip-scroll">' + WHY[v].map(function (w) {
        return '<button type="button" class="fw-c" data-why="' + esc(w) + '">' + esc(w) + '</button>';
      }).join("") + '</div>' +
      '<form class="fw-f" id="fw-f"><input id="fw-i" maxlength="300" placeholder="직접 쓰기 (선택)">' +
        '<button type="submit">남기기</button></form>';
    el.classList.add("on");
  }
  function closeWhy() { var el = SHEET && SHEET.querySelector("#fd-why"); if (el) { el.classList.remove("on"); el.innerHTML = ""; } }

  async function sendWhy(body) {
    if (!curPlace || !curPlace.mine) return closeWhy();
    var r = await rpc("food_judge_say", {
      p_id: curPlace.place.id, p_verdict: curPlace.mine, p_body: body || null });
    closeWhy();
    if (r && r.comment_id) { toast("한마디 남겼어요"); loadTalk(curPlace.place.id); }
  }

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
    if (r.mine) askWhy(r.mine); else closeWhy();
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

  function paintRegion() {
    var n = SEC && SEC.querySelector("#fd-locn");
    // 동네가 없으면 '전국'이라고 정직하게 말한다. '내 동네부터'라고 거짓말하지 않는다.
    if (n) n.textContent = myRegionName || "전국";
    var loc = SEC && SEC.querySelector("#fd-sub");
    if (loc) loc.classList.toggle("unset", !myRegionName);
  }

  /* 동네 고르기 — 날씨의 지역 검색(weather_search)을 그대로 쓴다. 지역 축이 같으니까.
     ⚠️ 지도 오버레이 안에 띄우지 않는다. 처음엔 #fd-fsheet 를 재사용했는데 지도를 강제로
        열게 되어 **시트 뒤가 시커먼 빈 지도**가 됐다(실측). 동네 고르기는 지도가 필요 없다. */
  var RPICK = null;
  function openRegionPicker() {
    if (!RPICK) {
      RPICK = document.createElement("div");
      RPICK.className = "fd-rpick";
      RPICK.innerHTML = '<div class="fd-rpick-bg"></div><div class="fd-fsheet" id="fd-rsheet"></div>';
      document.body.appendChild(RPICK);
      RPICK.addEventListener("click", function (e) {
        var t = e.target;
        if (t.closest && t.closest("[data-near]")) { pickNearby(); return; }
        var sd = t.closest && t.closest("[data-sido]");
        if (sd) { sidoPick = sd.dataset.sido; paintSido(); return; }
        var rg = t.closest && t.closest("[data-region]");
        if (rg) { pickRegion(rg.dataset.region, rg.dataset.rname); return; }
        if (!t.closest || !t.closest("#fd-rsheet")) closeRegionPicker();
      });
    }
    var FS = RPICK.querySelector("#fd-rsheet");
    FS.innerHTML = '<div class="fd-sheet-grip"></div>' +
      '<div class="ff-head">동네 고르기' +
        '<button type="button" class="fd-near" data-near="1">◎ 내 주변</button></div>' +
      '<input class="fr-body" id="fd-rq" placeholder="동네 검색 — 전주, 여수, 안동…" autocomplete="off">' +
      '<div class="fd-sido chip-scroll" id="fd-sido"></div>' +
      '<div class="fd-rlist" id="fd-rlist"><div class="fm-empty">불러오는 중…</div></div>';
    RPICK.classList.add("open");
    requestAnimationFrame(function () { FS.classList.add("open"); });
    paintSido();

    var i = FS.querySelector("#fd-rq");
    i.addEventListener("input", function () {
      clearTimeout(i.__t);
      i.__t = setTimeout(async function () {
        var q = i.value.trim();
        var box = FS.querySelector("#fd-rlist");
        if (q.length < 1) { sidoPick = sidoPick || null; paintCities(); return; }
        var r = await rpc("weather_search", { p_q: q, p_limit: 14 });
        box.className = "fd-rlist";
        box.innerHTML = (r && r.length)
          ? r.map(function (x) {
              return '<button type="button" class="fr-item" data-region="' + esc(x.code) + '" data-rname="' +
                esc(x.name) + '">📍 ' + esc(x.name) + '<span class="fd-rsido">' + esc(x.sido || "") + '</span></button>';
            }).join("")
          : '<div class="fm-empty">그런 동네가 없어요</div>';
      }, 200);
    });
  }

  /* 시도 → 시군구 2단. 검색만 있으면 이름을 아는 사람만 쓸 수 있다(사장님: 캐치테이블 방식).
     맛집이 있는 동네를 앞세운다 — 0곳만 잔뜩 보이면 고를 맛이 안 난다. */
  var REGIONS = null, sidoPick = null;
  async function paintSido() {
    if (!REGIONS) REGIONS = await rpc("food_regions");
    var row = RPICK.querySelector("#fd-sido"); if (!row) return;
    var sd = (REGIONS && REGIONS.sido) || [];
    if (!sidoPick) { var best = sd.slice().sort(function (a, b) { return b.n - a.n; })[0]; sidoPick = best && best.code; }
    row.innerHTML = '<button type="button" class="ff-chip' + (myRegion ? "" : " on") + '" data-region="">전국</button>' +
      sd.map(function (x) {
        return '<button type="button" class="ff-chip' + (sidoPick === x.code ? " on" : "") + '" data-sido="' + esc(x.code) + '">' +
          esc(x.name) + (x.n ? '<span class="n">' + x.n + '</span>' : '') + '</button>';
      }).join("");
    paintCities();
  }
  function paintCities() {
    var box = RPICK.querySelector("#fd-rlist"); if (!box) return;
    var sd = ((REGIONS && REGIONS.sido) || []).filter(function (x) { return x.code === sidoPick; })[0];
    if (!sd) { box.innerHTML = ""; return; }
    box.className = "fd-rlist grid";
    var head = '<button type="button" class="fd-city" data-region="' + esc(sd.code) + '" data-rname="' +
      esc(sd.name) + '">' + esc(sd.name) + ' 전체</button>';
    box.innerHTML = head + (sd.cities || []).map(function (c) {
      return '<button type="button" class="fd-city' + (c.n ? "" : " zero") + '" data-region="' + esc(c.code) +
        '" data-rname="' + esc(c.name) + '">' + esc(c.name) +
        (c.n ? '<b>' + c.n + '</b>' : '') + '</button>';
    }).join("");
  }

  /* 내 주변 — 가진 좌표(weather_regions)로 가장 가까운 동네를 고른다.
     역지오코딩을 부르지 않아도 된다. 동네 단위면 이 정도로 충분하다. */
  /* 가까운순을 처음 누르면 위치를 묻는다 — 미리 묻지 않는다(권한 피로) */
  function askPos() {
    if (!navigator.geolocation) { sortBy = "new"; return toast("이 기기는 위치를 못 받아요"); }
    toast("위치 확인 중…");
    navigator.geolocation.getCurrentPosition(function (pos) {
      myPos = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      loadList();
    }, function () { sortBy = "new"; toast("위치 권한이 필요해요"); loadList(); },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 });
  }

  async function pickNearby() {
    if (!navigator.geolocation) return toast("이 기기는 위치를 못 받아요");
    toast("위치 확인 중…");
    navigator.geolocation.getCurrentPosition(async function (pos) {
      var la = pos.coords.latitude, lo = pos.coords.longitude;
      var r = await rpc("food_nearest_region", { p_lat: la, p_lon: lo });
      if (r && r.ok) pickRegion(r.code, r.name);
      else toast("가까운 동네를 못 찾았어요");
    }, function () {
      toast("위치 권한이 필요해요");
    }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 });
  }

  function closeRegionPicker() {
    if (!RPICK) return;
    var FS = RPICK.querySelector("#fd-rsheet");
    if (FS) FS.classList.remove("open");
    setTimeout(function () { RPICK.classList.remove("open"); }, 240);
  }
  function pickRegion(code, name) {
    myRegion = code || null; myRegionName = name || "";
    try {
      if (myRegion) localStorage.setItem("galla_food_region", JSON.stringify({ code: code, name: name }));
      else localStorage.removeItem("galla_food_region");
    } catch (_) {}
    closeRegionPicker();
    paintRegion(); loadList();
    if (MAP && MAP.classList.contains("open")) fetchBbox();
    toast(myRegionName ? myRegionName + "로 바꿨어요" : "전국으로 바꿨어요");
  }

  async function loadChannels() {
    var d = await rpc("food_channel_stats");
    CH = (d && d.channels) || [];
    paintChips();
    if (MAP) paintMapChips();
  }

  async function boot() {
    if (!mount()) return;   // 패널이 없거나 이미 붙어 있음
    /* 내 동네 — 예전엔 날씨 즐겨찾기(weather_my)만 봤다. 그런데 즐겨찾기를 안 해둔
       유저는 myRegion 이 null 이라 **전국이 통째로** 나오면서 제목만 '우리 동네'였다.
       맛집 보려고 날씨 탭에 먼저 다녀오라는 것도 이상하다(사장님 지적).
       → 맛집 탭이 자체로 동네를 갖는다. 날씨 즐겨찾기는 '첫 값 제안'으로만 쓰고
         선택은 localStorage 에 둔다 — 날씨 설정을 건드리지 않는다. */
    try {
      var saved = JSON.parse(localStorage.getItem("galla_food_region") || "null");
      if (saved && saved.code) { myRegion = saved.code; myRegionName = saved.name; }
    } catch (_) {}
    if (!myRegion) {
      var my = await rpc("weather_my");
      if (my && my.length) { myRegion = my[0].code; myRegionName = my[0].name; }
    }
    paintRegion();
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
