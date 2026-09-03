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
    /* 🔴 네이티브 앱은 Leaflet — 다만 이건 '해결'이 아니라 미봉이다.
       NCP Maps 는 콘솔에 등록한 origin 에서만 인증을 내주는데 콘솔이 http/https 만 받고,
       앱 origin 은 capacitor:// 다. iosScheme 을 https 로 돌려 origin 을 바꿔보려 했지만
       **iOS 에서 불가능**하다 — WKWebView 는 http/https 에 커스텀 스킴 핸들러를 못 걸어서
       Capacitor 가 조용히 무시한다(2026-09-01 실측, 지도는 그대로 Leaflet 으로 떨어졌다).
       ⚠️ 지금 쓰는 tile.openstreetmap.org 는 **OSM 재단이 앱 배포에 쓰는 걸 금지**한다.
          출시 전에 반드시 갈아야 한다 — galla.im 에 올린 지도 페이지를 iframe 으로
          띄우거나(핫튜브 /yt 프록시와 같은 수법), 앱 사용이 허용되는 타일로 옮긴다. */
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
    /* 🔴 SDK 가 반쯤 살아 있는 상태로 백엔드를 만들면 '떴는데 아무것도 안 되는' 지도가 된다
       (실측: provider=naver 인데 타일 0, getBounds 가 nv.LatLng 에서 예외).
       그러면 tilesPainted 도 못 잡고 Leaflet 폴백도 안 걸린다. 여기서 먼저 끊는다. */
    if (!window.naver || !window.naver.maps) throw new Error("naver_sdk_missing");
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
        /* ⚠️ 예외를 그대로 던지면 fetchBbox 가 통째로 죽어 마커가 영영 안 그려진다.
           '아직 모르겠다'는 null 로 알리고 호출부의 재시도에 맡긴다. */
        var b;
        try { b = map.getBounds(); } catch (_) { return null; }
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

  /* ═══ 네이티브 백엔드 — 웹뷰 뒤에 깔린 네이버 지도(GallaNaverMap 플러그인) ═══
     NCP 웹 SDK 는 등록된 http/https origin 에서만 인증을 내주는데 앱 origin 은 capacitor:// 라
     등록이 아예 불가능하다. 네이티브 SDK 는 **번들 ID·패키지명**으로 등록받아 그 벽이 없다.

     ⚠️ 위쪽 로직(fetchBbox·drawMarkers)은 동기 호출을 기대한다(getBounds·getZoom).
        네이티브는 전부 비동기라, idle 이벤트로 받은 마지막 값을 들고 있다가 그걸 돌려준다.
     ⚠️ 마커는 하나씩 못 보낸다(왕복 400번). 모아서 한 번에 넘긴다. */
  function nativeBackend(el, lat, lon, zoom) {
    var P = window.Capacitor.Plugins.GallaNaverMap;
    var last = { swLat: 0, swLon: 0, neLat: 0, neLon: 0, zoom: zoom, ok: false };
    var idleFns = [], clickMap = {}, pending = [], flushT = 0, seq = 0;

    P.addListener("idle", function (e) {
      last = { swLat: +e.swLat, swLon: +e.swLon, neLat: +e.neLat, neLon: +e.neLon,
               zoom: +e.zoom, ok: (+e.neLat > +e.swLat) && (+e.neLon > +e.swLon) };
      idleFns.forEach(function (f) { try { f(); } catch (_) {} });
    });
    P.addListener("markerClick", function (e) {
      var f = clickMap[e && e.id]; if (f) try { f(); } catch (_) {}
    });

    /* ⚠️ 캔버스 DOM 을 재서 넘기면 안 된다 — 오버레이가 막 열린 시점엔 아직 0 이고,
       그러면 네이티브 지도가 0 크기로 만들어져 아무것도 안 그려진다
       (실측 로그: "(NMapsMap) Error: distanvePerminWidth is 0").
       .fd-map 은 position:fixed; inset:0 이라 어차피 화면 전체다. 화면을 그대로 쓴다. */
    function rect() {
      return { x: 0, y: 0,
               width: window.innerWidth || document.documentElement.clientWidth,
               height: window.innerHeight || document.documentElement.clientHeight };
    }
    function flush() {
      flushT = 0;
      var list = pending.filter(function (m) { return !m.__dead; });
      P.setMarkers({ markers: list.map(function (m) { return m.spec; }) }).catch(function () {});
    }
    function schedule() { if (!flushT) flushT = setTimeout(flush, 0); }

    var f0 = rect();
    P.create({ x: f0.x, y: f0.y, width: f0.width, height: f0.height,
               lat: lat, lng: lon, zoom: zoom }).catch(function (e) {
      console.warn("[food] 네이티브 지도 create 실패:", e);
    });
    /* 지도가 웹뷰 **뒤**에 있으므로 캔버스는 비어 있어야 보인다 */
    el.classList.add("fd-canvas-native");
    document.body.classList.add("fd-native-map");
    document.documentElement.classList.add("fd-native-map");

    return {
      kind: "native",
      onIdle: function (fn) { idleFns.push(fn); },
      getBounds: function () {
        if (!last.ok) return null;                     // 접혀 있으면 호출부가 재시도한다
        return { swLat: last.swLat, swLon: last.swLon, neLat: last.neLat, neLon: last.neLon };
      },
      getZoom: function () { return Math.round(last.zoom || zoom); },
      setView: function (la, lo, z) {
        P.setCamera({ lat: la, lng: lo, zoom: z || last.zoom || zoom }).catch(function () {});
      },
      refresh: function () {
        var f = rect();
        P.setFrame({ x: f.x, y: f.y, width: f.width, height: f.height }).catch(function () {});
        /* 첫 진입엔 idle 이 아직 안 와서 경계가 없다 — 한 번 물어서 채워둔다 */
        P.getBounds().then(function (b) {
          if (!b || !b.ok) return;
          last = { swLat: +b.swLat, swLon: +b.swLon, neLat: +b.neLat, neLon: +b.neLon,
                   zoom: +b.zoom, ok: true };
          idleFns.forEach(function (f2) { try { f2(); } catch (_) {} });
        }).catch(function () {});
      },
      marker: function (la, lo, html, size, onClick, spec) {
        var id = "m" + (++seq);
        var sp = spec || { kind: "pin", text: "🍜" };
        sp.id = id; sp.lat = la; sp.lng = lo; sp.size = size;
        var m = { spec: sp, __dead: false };
        if (onClick) clickMap[id] = onClick;
        pending.push(m); schedule();
        return m;
      },
      drop: function (m) {
        if (!m) return;
        m.__dead = true;
        delete clickMap[m.spec && m.spec.id];
        var i = pending.indexOf(m); if (i >= 0) pending.splice(i, 1);
        schedule();
      },
      teardown: function () {
        el.classList.remove("fd-canvas-native");
        document.body.classList.remove("fd-native-map");
        document.documentElement.classList.remove("fd-native-map");
        P.destroy().catch(function () {});
      }
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
  /* 🏷 착한가격업소만 보기. 정렬(최신·가까운·화제)과 다른 축이라 별도 토글이다 —
     정부가 가격·위생·서비스를 실사해 지정한 집이라 '가성비'를 고시로 보증한다. */
  var gpOnly = false;
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
  /* ⚠️ 이름을 won 으로 두면 안 된다 — 아래(메뉴 가격)에 이미 won() 이 있어서
     **나중 선언이 이걸 덮어쓴다**. 함수 선언 호이스팅이라 에러도 안 난다.
     화면엔 축약이 안 먹은 '1,668,000원'이 그대로 찍혀 표가 두 줄로 깨졌다(실측). */
  function wonShort(n) {
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
        '<div><b>' + wonShort(st.amount) + '</b><i>총액</i></div>' +
        '<div><b>' + wonShort(per) + '</b><i>건당</i></div>' +
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
              '<span class="fa-amt">' + wonShort(r.amount) + '</span>' +
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
    if (t.closest && t.closest("[data-gp]")) {
      gpOnly = !gpOnly;
      loadList();
      /* 지도가 열려 있으면 같이 맞춘다 — 두 화면이 다른 걸 보여주면 그게 버그로 읽힌다 */
      if (MAP && MAP.classList.contains("on")) fetchBbox();
      return;
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
    if (t.closest && t.closest("[data-chpick]")) { openChPick(); return; }
    var gt = t.closest && t.closest("[data-gotab]");
    if (gt) { tab = gt.dataset.gotab; seg = "all"; listLimit = 40; paintTabs(); loadList(); return; }
    var h2 = t.closest && t.closest("[data-ch2]");
    if (h2) { openChPage(h2.dataset.ch2); return; }
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
    }).join("") +
      /* 둘러보기에서만 — 랭킹·기록엔 의미가 없다 */
      (tab === "browse"
        ? '<button type="button" class="fd-seg fd-gp' + (gpOnly ? " on" : "") + '" data-gp="1">' +
            '🏷 착한가격</button>'
        : "");
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
    /* 카드에도 영업시간·평점을 한 줄 얹는다 — 목록에서 바로 판단이 되게 */
    var hrs = todayHours(p.hours);
    var sub2 = [hrs ? hrs.replace(/^[^:]*:\s*/, "") : "",
                p.rating ? "★" + p.rating : ""].filter(Boolean).join(" · ");
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
        (sub2 ? '<p class="fd-sub2">' + esc(sub2) + '</p>' : '') +
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
  /* ── 채널 인덱스 ────────────────────────────────────────
     "누가 갔나"에 섹션만 있으면 **누가 있는지 알려면 끝까지 스크롤해야 한다**(사장님 지적).
     참조 서비스는 채널 그리드를 맨 위에 두고 눌러서 들어가게 한다 — 그 어포던스만 가져온다.
     ⚠️ 탭을 새로 빼지 않는다. 저쪽 '모아보기'가 하는 일을 우리는 이미 이 탭이 하고 있고,
        탭을 늘리면 같은 걸 두 군데서 찾게 된다. 인덱스를 이 탭의 머리로 붙인다.
     ⚠️ 우리 채널은 59개다(저쪽 14개). 전부 깔면 그리드만 30줄이라 섹션이 안 보인다.
        → 많은 순 12개만 깔고 나머지는 이미 있는 '누구 고르기' 시트(검색·종류별)로 넘긴다. */
  function chIndexHtml(kind) {
    var list = CH.filter(function (c) {
      return c.total > 0 && (kind === "all" || !kind || chKind(c.slug) === kind);
    }).sort(function (a, b) { return b.total - a.total; });
    if (!list.length) return "";
    var top = list.slice(0, 12);
    return '<section class="fx-idx">' +
      '<div class="fx-h"><b>어떤 방송을 볼까요?</b>' +
        '<button type="button" class="fx-more" data-chpick>전체 ' + list.length + '개 ›</button></div>' +
      '<div class="fx-grid">' + top.map(function (c) {
        var th = c.thumb ? '<img src="' + esc(c.thumb) + '" alt="" loading="lazy">'
                         : '<span class="fx-ini">' + esc(initials(c.name)) + '</span>';
        return '<button type="button" class="fx-card" data-ch2="' + esc(c.slug) + '">' +
          '<span class="fx-av">' + th + '</span>' +
          '<span class="fx-tx"><b>' + esc(c.name) + '</b>' +
            '<i>' + c.total + '곳</i></span>' +
          /* 정복률은 저쪽에 없는 축이다 — 목록이 아니라 '내가 얼마나 깼나'로 보이게 한다 */
          (c.visited ? '<span class="fx-bar"><i style="width:' +
             Math.max(3, Math.round(c.visited * 100 / c.total)) + '%"></i></span>' : '') +
        '</button>';
      }).join("") + '</div></section>';
  }

  async function loadBrowse(kind) {
    /* 🔴 종류를 서버로 넘긴다. 예전엔 전체 상위 20채널을 받아 여기서 걸렀는데,
       그러면 유튜버 37개 중 **전체 상위 20에 든 것만** 섹션이 됐다
       (실측: 인덱스 12개인데 섹션 6개, 인증은 4개인데 2개). 위아래 모수를 맞춘다. */
    var d = await rpc("food_browse", {
      p_per: 10, p_channels: 20,
      p_kind: (kind === "yt" || kind === "tv" || kind === "guide" || kind === "gov") ? kind : null,
    });
    var secs = (d && d.sections) || [];
    var idx = chIndexHtml(kind);
    LIST.innerHTML = secs.length
      ? idx + '<div class="fb-wrap">' + secs.map(sectionHtml).join("") + '</div>'
      : (idx || '<div class="fd-empty">아직 방송별로 모을 만큼 쌓이지 않았어요.<br>수집이 하루 두 번 돕니다.</div>');
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
        /* ⚠️ 예전엔 '전체 보기'가 탭만 옮겼다. 그런데 출처가 58개인데 홈에는 12개만
           가로로 깔리고 종류(유튜버·방송·인증·공직자)가 뒤섞여 있어서
           "유튜버만 보고 싶다"가 안 됐고, 원하는 사람을 찾으려면 계속 밀어야 했다.
           → 종류별로 묶고 검색까지 되는 선택 시트를 연다. */
        '<button type="button" class="fh-near" data-chpick="1">누구 고르기</button></div>' +
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
                                  p_category: catFilter, p_min_shows: minShows,
                                  p_good_price: gpOnly });
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
  /* 지도 바닥이 실제로 칠해졌는지 본다. 네이버는 래스터 타일을 <img> 로 깐다 —
     하나라도 성공적으로 로드됐으면(naturalWidth>0) 살아 있는 것으로 본다.
     넉넉히 기다리되(2.4초) 일찍 칠해지면 바로 통과시킨다. */
  function tilesPainted(el, budget) {
    var deadline = Date.now() + (budget || 2400);
    return new Promise(function (res) {
      (function tick() {
        var ok = [].some.call(el.querySelectorAll("img"), function (im) {
          return im.naturalWidth > 0 && /pstatic\.net|naver/.test(im.src || "");
        });
        if (ok) return res(true);
        if (Date.now() >= deadline) return res(false);
        setTimeout(tick, 200);
      })();
    });
  }

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
    /* 🔴 상세를 닫으면 history.back() 이 도는데, 그 popstate 를 지도가 **자기 것으로 오해**해서
       같이 닫혔다(실측: 지도 위 상세에서 X 를 눌렀더니 지도까지 사라짐).
       지도와 상세는 각각 pushState 를 하므로, 상세에서 돌아오면 state 는 다시 {fdMap:1} 이다.
       그 자리로 돌아온 거면 지도는 그대로 둔다 — 리스너 등록 순서에 기대지 않는 판별이다. */
    window.addEventListener("popstate", function () {
      if (!MAP.classList.contains("open")) return;
      try { if (history.state && history.state.fdMap) return; } catch (_) {}
      closeMap(true);
    });
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
      /* 🥇 앱에서는 네이티브 지도가 1순위 — 웹 SDK 는 origin 때문에 인증이 안 된다.
         플러그인이 없는 예전 빌드(OTA 로 웹만 갱신된 앱)도 있으므로 존재를 확인하고 쓴다. */
      var NP = null;
      try { NP = isNativeOrigin() && window.Capacitor && window.Capacitor.Plugins
                  && window.Capacitor.Plugins.GallaNaverMap; } catch (_) {}
      if (NP && MAPCFG.clientId) {
        try {
          await NP.setup({ ncpKeyId: MAPCFG.clientId });
          MB = nativeBackend(cv, 37.5665, 126.978, 12);
        } catch (e) { console.warn("[food] 네이티브 지도 실패 → 다음 후보:", String(e)); MB = null; }
      }
      if (!MB && MAPCFG.provider === "naver" && !isNativeOrigin()) {
        try {
          await loadNaver(); MB = naverBackend(cv, 37.5665, 126.978, 12);
          /* 🔴 "떴는데 백지"를 잡는 마지막 관문.
             네이버가 실패하는 방식은 두 가지인데 폴백은 하나만 잡고 있었다.
               ① 키 인증 실패 → navermap_authFailure 가 불린다(loadNaver 가 처리)
               ② 스타일 JSONP 가 CSP·네트워크로 막힘 → **아무 콜백도 안 불린다**.
                  SDK 는 살아 있고 마커는 그려지는데 바닥이 하얗다.
             ②는 운영 galla.im 에서 실제로 났다(script-src 에 *.pstatic.net 누락).
             그래서 콜백을 믿지 않고 **타일이 실제로 그려졌는지**를 눈으로 확인한다. */
          if (!(await tilesPainted(cv))) throw new Error("naver_blank");
        } catch (e) {
          console.warn("[food] 네이버 지도 실패 → Leaflet 폴백:", String(e));
          if (MB) { try { cv.innerHTML = ""; } catch (_) {} MB = null; }
        }
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

  /* 🔴 이 판을 떠날 때 열려 있던 오버레이를 전부 닫는다.
     지도·상세·채널페이지는 document.body 에 붙어 있어서 **뷰를 바꿔도 살아남는다**.
     남아 있으면 body 의 overflow:hidden 과 fd-*-on 클래스까지 같이 남아,
     다음 판에서 헤더가 밀리고 탭이 통째로 안 눌린다(2026-08-31 시뮬 실측:
     오래 쓰다 보면 상단 탭이 전부 죽고, 앱을 다시 켜야 살아났다).
     search.js 의 GALLA_PAGE_TREND.deactivate() 가 이걸 부른다. */
  window.GALLA_FOOD_CLOSE_ALL = function () {
    try { if (MAP && MAP.classList.contains("open")) closeMap(true); } catch (_) {}
    try { if (DETAIL && DETAIL.classList.contains("open")) closeDetail(true); } catch (_) {}
    try { closeChPage(); } catch (_) {}
    try { closeChPick(); } catch (_) {}
    try { closeRegionPicker(); } catch (_) {}
    /* 위 닫기들이 하나라도 못 돌았을 때를 대비한 마지막 빗자루 */
    try {
      document.body.classList.remove("fd-map-on", "fd-detail-on");
      if (document.body.style.overflow === "hidden") document.body.style.overflow = "";
    } catch (_) {}
  };

  function closeMap(fromPop) {
    if (!MAP) return;
    /* 🔴 네이티브 지도는 웹뷰 **뒤**에 있는 별개의 뷰라 DOM 을 닫아도 안 사라진다.
       남겨두면 다음 판 뒤에 지도가 계속 떠 있고 웹뷰는 투명한 채로 남는다. */
    if (MB && MB.teardown) { try { MB.teardown(); } catch (_) {} MB = null; }
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
      p_category: catFilter, p_min_shows: minShows, p_good_price: gpOnly,
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
          function () { MB.setView(cla, clo, Math.min(z + 3, 17)); },
          { kind: "cluster", text: String(n), bg: "#4361ffe6", ring: "#ffffffd9", fg: "#ffffff",
            logo: "", badge: "", count: 0 });
        markers.push(m);
      });
    }
  }

  /* 공직자 출처는 기관 마크로 구분한다 — 국회는 국회 휘장, 정부는 정부상징(태극),
     지자체는 해당 시·도. 이미지 파일을 재호스팅하지 않고 SVG 로 그린다
     (방송 로고는 YouTube CDN 참조, 기관 마크는 자체 렌더 — 둘 다 복제 저장은 안 한다).
     시·도 데이터가 들어오면 GOVMARK 에 항목만 늘리면 된다. */
  /* 네이티브 지도용 — SVG 휘장을 Core Graphics 로 다시 그리면 웹과 반드시 어긋난다.
     앱에서는 같은 색 원 안에 기관 한 글자를 넣어 대신한다(모양은 다르고 의미는 같다). */
  var GOVMARK_CHAR = { assembly: "국", gov: "정", seoul: "서", gyeonggi: "경" };

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
    /* 네이티브 지도(앱)는 HTML 을 못 그린다 — 같은 판단을 구조체로도 함께 넘긴다.
       '무엇을 세울지'는 여기서만 정하고, 웹은 HTML 로 앱은 이 spec 으로 각자 그린다.
       두 곳에서 따로 판단하게 두면 웹과 앱의 지도가 반드시 어긋난다. */
    var spec = {
      kind: "pin",
      bg: gm ? gm.bg : (p.visited ? "#1db954" : "#4361ff"),
      ring: gm ? gm.ring : "#ffffff",
      fg: "#ffffff",
      logo: (!gm && thumb) ? thumb : "",
      text: gm ? (GOVMARK_CHAR[gov] || "관") : (thumb ? "" : (p.visited ? "✓" : "🍜")),
      badge: p.visited ? "✓" : "",
      count: more || 0
    };
    return MB.marker(+p.lat, +p.lon, html, 38, function () { openDetail(p.id); }, spec);
  }

  /* ── 채널 페이지 ──────────────────────────────────────
     "그 사람을 누르면 식당 리스트와 영상이 떠야 한다"(사장님).
     ⚠️ 장소에 붙은 영상은 3%뿐이다 — 채널들이 제목·설명에 상호를 안 쓴다
        (또간집 700편 → 매칭 9건). 그래서 여기선 **그 채널의 최근 영상**을 보여준다.
        "이 집이 나온 영상"이라고 속이지 않는다. 섹션 제목으로 구분한다. */
  var CHPAGE = null, CG = null;      // CG: 열려 있는 채널의 상태(탭·오프셋·총계)

  function cgVideoCard(v) {
    return '<button type="button" class="cg-v fd-vid" data-vid="' + esc(v.video_id) + '">' +
      '<img src="' + esc(ytThumb(v.video_id)) + '" alt="" loading="lazy">' +
      '<i class="fs-play">▶</i>' +
      '<span class="cg-vt">' + esc(v.title || "") + '</span>' +
      (v.at ? '<span class="cg-vd">' + esc(String(v.at).slice(0, 10)) + '</span>' : '') +
    '</button>';
  }
  function cgPlaceRow(p) {
    var th = p.cover || ytThumb(p.video_id) || "";
    return '<button type="button" class="cg-p" data-cgplace="' + esc(p.id) + '">' +
      '<span class="cg-pth">' + (th ? '<img src="' + esc(th) + '" alt="" loading="lazy">' : tileHtml(p)) + '</span>' +
      '<span class="cg-pb"><b>' + esc(p.name) + '</b>' +
        '<i>' + esc([p.category, shortAddr(p.address)].filter(Boolean).join(" · ")) + '</i></span>' +
      (p.visited ? '<span class="cg-ok">✓</span>' : '') +
    '</button>';
  }
  /* 헤더는 한 번만 그리고, 아래 본문만 탭에 따라 갈아끼운다.
     ⚠️ 참조한 서비스는 카드 한 장이 '영상 한 편'이다. 우리는 영상↔가게 매칭이 3%라
        그 형태를 가게 목록에 쓰면 대부분 채널 로고만 반복된다(로고 벽).
        그래서 **영상은 영상 탭, 가게는 가게 탭**으로 가른다 — 각자 진짜 정보를 담는다. */
  function cgShell(c) {
    var k = KINDCHIP[c.kind] || null;
    var pct = c.total ? Math.round((c.visited || 0) * 100 / c.total) : 0;
    return '<div class="fd-sheet-grip"></div>' +
      '<div class="cg-top">' +
        '<span class="cg-av' + (c.thumb ? "" : " none") + '">' +
          (c.thumb ? '<img src="' + esc(c.thumb) + '" alt="" loading="lazy">' : esc(initials(c.name || ""))) +
        '</span>' +
        '<div class="cg-id"><div class="cg-n">' + esc(c.name || "") +
          (k ? '<span class="fs-k" style="--kc:' + k[1] + '">' + k[0] + '</span>' : '') + '</div>' +
          '<div class="cg-c">' + (c.total || 0) + '곳 · 도장 ' + (c.visited || 0) + '</div></div>' +
        '<button type="button" class="cp-x" data-cgclose="1">✕</button>' +
      '</div>' +
      '<div class="cg-bar"><i style="width:' + pct + '%"></i></div>' +
      '<div class="cg-tabs">' +
        '<button type="button" class="cg-tb" data-cgtab="places">다녀간 집' +
          '<span class="fs-n">' + (c.total || 0) + '</span></button>' +
        '<button type="button" class="cg-tb" data-cgtab="videos">영상' +
          '<span class="fs-n" id="cg-vn"></span></button>' +
      '</div>' +
      '<div class="cg-body" id="cg-body"></div>';
  }
  function cgPaint() {
    var box = CHPAGE.querySelector("#cg-body"); if (!box || !CG) return;
    CHPAGE.querySelectorAll("[data-cgtab]").forEach(function (b) {
      b.classList.toggle("on", b.dataset.cgtab === CG.tab);
    });
    var vn = CHPAGE.querySelector("#cg-vn");
    if (vn) vn.textContent = CG.vTotal || "";
    if (CG.tab === "videos") {
      box.innerHTML = CG.videos.length
        ? '<div class="cg-grid">' + CG.videos.map(cgVideoCard).join("") + '</div>' +
          (CG.videos.length < CG.vTotal
            ? '<button type="button" class="fd-more-btn" data-cgmore="videos">영상 더 보기 ' +
                '(' + CG.videos.length + '/' + CG.vTotal + ')</button>' : '')
        : '<div class="cp-none">아직 영상이 없어요</div>';
    } else {
      box.innerHTML = CG.places.length
        ? '<div class="cg-list">' + CG.places.map(cgPlaceRow).join("") + '</div>' +
          (CG.places.length < CG.total
            ? '<button type="button" class="fd-more-btn" data-cgmore="places">더 보기 ' +
                '(' + CG.places.length + '/' + CG.total + ')</button>' : '')
        : '<div class="cp-none">아직 등록된 집이 없어요</div>';
    }
  }
  async function cgMore(kind) {
    if (!CG || CG.busy) return;
    CG.busy = true;
    try {
      if (kind === "videos") {
        var v = await rpc("food_channel_videos",
          { p_slug: CG.slug, p_limit: 24, p_offset: CG.videos.length });
        if (v && v.ok) { CG.videos = CG.videos.concat(v.videos || []); CG.vTotal = v.total || 0; }
      } else {
        var d = await rpc("food_channel_places",
          { p_slug: CG.slug, p_limit: 30, p_offset: CG.places.length });
        if (d && d.ok) CG.places = CG.places.concat(d.places || []);
      }
      cgPaint();
    } finally { CG.busy = false; }
  }
  async function openChPage(slug) {
    if (!CHPAGE) {
      CHPAGE = document.createElement("div");
      CHPAGE.className = "fd-cpick fd-cgpage";
      document.body.appendChild(CHPAGE);
      /* ⚠️ 전파를 끊는다 — 패널 클릭 처리기가 document 위임이라 안 끊으면 두 번 처리된다
         (누구 고르기에서 밟은 함정: chFilter 가 두 번 토글돼 null 이 됐다). */
      CHPAGE.addEventListener("click", function (e) {
        if (e.target === CHPAGE || e.target.closest("[data-cgclose]")) {
          e.stopPropagation(); closeChPage(); return;
        }
        e.stopPropagation();
        var tb = e.target.closest("[data-cgtab]");
        if (tb) {
          CG.tab = tb.dataset.cgtab;
          if (CG.tab === "videos" && !CG.videos.length && CG.vTotal !== 0) { cgMore("videos"); return; }
          cgPaint(); return;
        }
        var mb = e.target.closest("[data-cgmore]");
        if (mb) { cgMore(mb.dataset.cgmore); return; }
        var v = e.target.closest(".fd-vid");
        if (v && v.dataset.vid) {
          v.innerHTML = '<iframe src="/yt?v=' + encodeURIComponent(v.dataset.vid) +
            '" allow="autoplay; encrypted-media" allowfullscreen loading="lazy"></iframe>';
          v.classList.add("playing"); return;
        }
        var pb = e.target.closest("[data-cgplace]");
        if (pb) { closeChPage(); openDetail(pb.dataset.cgplace); }
      });
    }
    CHPAGE.innerHTML = '<div class="fd-cpick-box"><div class="cp-none">불러오는 중…</div></div>';
    CHPAGE.classList.add("open");
    document.body.classList.add("fd-detail-on");
    var d = await rpc("food_channel_page", { p_slug: slug, p_places: 30, p_videos: 24 });
    if (!d || !d.ok) { closeChPage(); return toast("불러오지 못했어요"); }
    var c = d.channel || {};
    CG = { slug: slug, tab: "places", places: d.places || [], videos: d.videos || [],
           total: c.total || 0, vTotal: (d.videos || []).length, busy: false };
    /* 영상 총계는 별도 RPC 로 받는다 — 첫 화면은 24편만 싣고 총계만 먼저 표시한다 */
    CHPAGE.innerHTML = '<div class="fd-cpick-box">' + cgShell(c) + '</div>';
    cgPaint();
    rpc("food_channel_videos", { p_slug: slug, p_limit: 1, p_offset: 0 }).then(function (v) {
      if (v && v.ok && CG && CG.slug === slug) { CG.vTotal = v.total || 0; cgPaint(); }
    });
  }
  function closeChPage() {
    if (!CHPAGE) return;
    CHPAGE.classList.remove("open");
    document.body.classList.remove("fd-detail-on");
  }

  /* ── 누구 고르기 ──────────────────────────────────────
     출처가 58개다. 가로 스크롤 한 줄로는 못 고른다.
     종류별로 묶고(공직자·인증·유튜버·방송) 이름 검색까지 붙인다. */
  var KINDNAME = { gov: "공직자", guide: "인증", yt: "유튜버", tv: "방송" };
  var KINDORDER = ["gov", "guide", "yt", "tv"];
  var CHPICK = null;
  function chPickHtml(q) {
    q = (q || "").replace(/\s/g, "").toLowerCase();
    var list = CH.filter(function (c) {
      if (!c.total) return false;
      return !q || c.name.replace(/\s/g, "").toLowerCase().indexOf(q) >= 0;
    }).sort(function (a, b) { return b.total - a.total; });
    var byKind = {};
    list.forEach(function (c) { (byKind[c.kind] = byKind[c.kind] || []).push(c); });
    var secs = KINDORDER.filter(function (k) { return byKind[k] && byKind[k].length; })
      .map(function (k) {
        return '<div class="cp-k">' + KINDNAME[k] +
            ' <b>' + byKind[k].length + '</b></div>' +
          '<div class="cp-grid">' + byKind[k].map(function (c) {
            return '<button type="button" class="cp-i' + (chFilter === c.slug ? " on" : "") +
              '" data-ch2="' + esc(c.slug) + '">' +
              '<span class="cp-av' + (c.thumb ? "" : " none") + '">' +
                (c.thumb ? '<img src="' + esc(c.thumb) + '" alt="" loading="lazy">'
                         : esc(initials(c.name))) + '</span>' +
              '<span class="cp-n">' + esc(c.name) + '</span>' +
              '<span class="cp-c">' + c.total + '</span></button>';
          }).join("") + '</div>';
      }).join("");
    return '<div class="fd-sheet-grip"></div>' +
      '<div class="cp-h">누가 다녀갔나' +
        '<button type="button" class="cp-x" data-chclose="1">✕</button></div>' +
      '<input class="cp-q" id="cp-q" type="search" placeholder="이름으로 찾기" value="' + esc(q ? q : "") + '">' +
      (chFilter ? '<button type="button" class="cp-clear" data-ch2="' + esc(chFilter) + '">' +
                    '선택 해제 — ' + esc(chName(chFilter)) + '</button>' : "") +
      (secs || '<div class="cp-none">찾는 이름이 없어요</div>');
  }
  function openChPick() {
    if (!CHPICK) {
      CHPICK = document.createElement("div");
      CHPICK.className = "fd-cpick";
      document.body.appendChild(CHPICK);
      /* 🔴 전파를 반드시 끊는다.
         패널 클릭 처리기가 **document 위임**(379행)이라, 시트가 body 직속이면
         같은 클릭을 시트 핸들러와 패널 핸들러가 **둘 다** 받는다.
         둘 다 `chFilter` 를 토글하므로 두 번 뒤집혀 결국 null 이 된다 —
         시트는 닫히는데 목록은 그대로인 채로(실측: 김사원세끼를 눌러도 국회 목록 유지). */
      CHPICK.addEventListener("click", function (e) {
        if (e.target === CHPICK || e.target.closest("[data-chclose]")) {
          e.stopPropagation(); closeChPick(); return;
        }
        var b = e.target.closest("[data-ch2]");
        if (b) {
          e.stopPropagation();
          closeChPick();
          openChPage(b.dataset.ch2);      // 목록만 거르는 게 아니라 그 사람 페이지를 연다
        }
      });
      /* 검색은 입력마다 다시 그린다 — 목록이 58개라 비용이 없다 */
      CHPICK.addEventListener("input", function (e) {
        if (!e.target.matches("#cp-q")) return;
        var v = e.target.value, box = CHPICK.querySelector(".fd-cpick-box");
        box.innerHTML = chPickHtml(v);
        var q = box.querySelector("#cp-q");
        if (q) { q.value = v; q.focus(); }
      });
    }
    CHPICK.innerHTML = '<div class="fd-cpick-box">' + chPickHtml("") + '</div>';
    CHPICK.classList.add("open");
    document.body.classList.add("fd-detail-on");
  }
  function closeChPick() {
    if (!CHPICK) return;
    CHPICK.classList.remove("open");
    document.body.classList.remove("fd-detail-on");
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
  /* 가게 정보 — 전화·영업시간·평점.
     참조 서비스 카드가 좋아 보이는 건 사진이 아니라 이것들이었다(저쪽도 사진 없는 집은
     채널 로고로 때운다). 구글에서 사진과 같은 호출로 받아온다.
     ⚖️ 구글 데이터라 출처를 밝힌다. 영업시간은 오늘 요일만 접어서 보여주고 펼치게 한다. */
  var DAYIDX = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
  function todayHours(h) {
    if (!h || !h.length) return "";
    var want = DAYIDX[new Date().getDay()];
    for (var i = 0; i < h.length; i++) if (String(h[i]).indexOf(want) === 0) return String(h[i]);
    return String(h[0]);
  }
  function infoHtml(p) {
    var h = p.hours || [], t = todayHours(h);
    var bits = [];
    if (p.phone) bits.push('<a class="fi-i fi-tel" href="tel:' + esc(p.phone) + '">' +
      '<b>전화</b>' + esc(p.phone) + '</a>');
    if (t) bits.push('<button type="button" class="fi-i fi-hr" data-hours="1">' +
      '<b>영업</b>' + esc(t.replace(/^[^:]*:\s*/, "")) +
      (h.length > 1 ? '<i class="fi-more">▾</i>' : '') + '</button>');
    if (p.rating) bits.push('<span class="fi-i fi-rt"><b>★</b>' + esc(String(p.rating)) +
      (p.rating_n ? '<i>(' + p.rating_n + ')</i>' : '') + '</span>');
    if (!bits.length) return "";
    return '<div class="fi-wrap">' + bits.join("") +
      '<div class="fi-days" id="fi-days" hidden>' +
        h.map(function (x) { return '<div>' + esc(x) + '</div>'; }).join("") +
        (p.info_src === "google" ? '<div class="fi-src">영업시간·전화 · Google</div>' : '') +
      '</div></div>';
  }

  var KINDCHIP = { yt: ["유튜버", "#d0796a"], tv: ["방송", "#6aa8d0"],
                   guide: ["인증", "#8ac97a"], gov: ["공직자", "#c9a227"] };
  function srcHtml(list) {
    list = list || [];
    if (!list.length) return "";
    /* 같은 채널이 여러 번 나오면 최신 것만 남긴다 — 한 집이 한 방송에 여러 회 나올 수 있다. */
    var seen = {}, rows = [];
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (seen[s.channel]) { if (!seen[s.channel].video_id && s.video_id) seen[s.channel] = s; continue; }
      seen[s.channel] = s; rows.push(s.channel);
    }
    return '<div class="fs-wrap"><div class="fs-h">누가 다녀갔나' +
        '<span class="fs-n">' + rows.length + '</span></div>' +
      rows.map(function (slug) {
        var s = seen[slug];
        var k = KINDCHIP[chKind(slug)] || null;
        var vid = s.video_id || "";
        var when = s.aired_at ? String(s.aired_at).slice(0, 10) : "";
        return '<div class="fs-i' + (vid ? " has-vid" : "") + '">' +
          '<div class="fs-top">' +
            '<span class="fs-av' + (s.thumb ? "" : " none") + '">' +
              (s.thumb ? '<img src="' + esc(s.thumb) + '" alt="" loading="lazy">' : esc(initials(s.name))) +
            '</span>' +
            '<span class="fs-name">' + esc(s.name) + '</span>' +
            (k ? '<span class="fs-k" style="--kc:' + k[1] + '">' + k[0] + '</span>' : '') +
            (when ? '<span class="fs-when">' + esc(when) + '</span>' : '') +
          '</div>' +
          (vid
            ? '<button type="button" class="fs-vid fd-vid" data-vid="' + esc(vid) + '">' +
                '<img src="' + esc(ytThumb(vid)) + '" alt="" loading="lazy">' +
                '<i class="fs-play">▶</i>' +
                (s.title ? '<span class="fs-t">' + esc(s.title) + '</span>' : '') +
              '</button>'
            : (s.title ? '<p class="fs-t only">' + esc(s.title) + '</p>' : '')) +
          /* 이 영상이 이 집을 어떻게 소개했나 — **크리에이터마다 따로** 붙는다.
             영상 제목은 "디저트 특집!" 같은 회차 제목이라 이 집 얘기가 아니다.
             같은 집을 여러 명이 다녀갔으면 각자 자기 영상의 한 줄이 자기 카드에 붙는다. */
          (s.blurb ? '<p class="fs-b">' + esc(s.blurb) + '</p>' : '') +
        '</div>';
      }).join("") + '</div>';
  }

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
      infoHtml(p) +
      /* 누가 다녀갔나 — 이 서비스의 정체성이라 상세에서도 1급으로 세운다.
         ⚠️ 예전엔 '📺 채널명 제목' 텍스트 한 줄이었다. RPC 는 로고·영상ID·제목·방영일을
            이미 다 주는데 화면이 안 썼다. 로고를 세우고, 영상이 있으면 썸네일을 붙여
            그 자리에서 재생되게 한다(/yt 프록시 — 오류 153 회피 경로). */
      srcHtml(d.sources) +
      /* 국회의원이 정치자금으로 밥 먹은 집이면 여기에 명단이 붙는다.
         비어 있으면 렌더 자체를 안 한다 — 4,700곳 대부분은 해당 없다. */
      '<div class="fd-asm" id="fd-asm"></div>' +
      '<div class="fd-judge" id="fd-judge"></div>' +
      '<div class="fd-why" id="fd-why"></div>' +
      /* 🔴 여기 있던 '출처 영상' 블록을 걷어낸다 — 같은 영상이 두 번 그려졌다.
         vid 는 출처 목록에서 첫 영상을 뽑은 값이고(위 var vid), srcHtml 이 이미
         그 영상을 채널 로고·제목과 함께 그린다. 영상이 있으면 **항상** 중복이었다.
         srcHtml 이 영상을 그리기 전의 옛 코드가 남아 있던 자리다.
         (재생은 srcHtml 쪽 .fd-vid 가 /yt 프록시로 처리한다 — 앱에서 직접 임베드가
          막히는 걸 우회하는 그 경로. 지우는 건 중복 렌더뿐이고 기능은 그대로다.) */
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
      '<div class="fd-menu" id="fd-menu">' + menuHtml(d.menus || [], p.good_price) + '</div>' +
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
  function menuHtml(ms, gp) {
    return '<div class="fm-h">메뉴' + (ms.length ? ' <b>' + ms.length + '</b>' : '') +
        /* 정부가 '착한가격업소'로 지정한 집이면 밝힌다 — 가격이 왜 이렇게 싼지 설명이 된다 */
        (gp ? '<span class="fm-gp">🏷 착한가격업소</span>' : '') +
        '<button type="button" class="fm-add" data-a="menu">+ 메뉴 제보</button></div>' +
      (ms.length
        ? '<div class="fm-list">' + ms.map(function (m) {
            return '<div class="fm-row"><span class="fm-n">' + esc(m.name) +
              (m.source === "yt" ? '<i class="fm-src" title="영상에서 자동 추출">📺</i>' : '') +
              /* 출처가 정부 고시면 그렇게 밝힌다 — 값은 분기마다 갱신되므로 유저 제보보다 믿을 만하다 */
              (m.source === "goodprice" ? '<i class="fm-src" title="행정안전부 착한가격업소 고시가">🏷</i>' : '') +
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
      if (el) el.innerHTML = menuHtml(d.menus || [], (d.place || {}).good_price); }
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
    /* 🔴 배경(스크림) 클릭이 안 먹었다 — '.fd-detail-bg' 를 찾는데 그런 요소를 만든 적이 없다.
       buildDetail 은 시트 둘(#fd-sheet, #fd-dsub)만 넣는다. 그래서 선택자가 영원히 안 맞고,
       지도 위에 상세를 띄웠을 때 보이는 지도를 눌러도 닫히지 않았다(실측).
       바깥을 누른 건 곧 DETAIL 자신이 타깃인 경우다 — 그걸로 판정한다. */
    if (t.closest(".fd-dclose") || t === DETAIL || t.closest(".fd-detail-bg")) { closeDetail(); return; }
    var vw = t.closest(".fd-vid");
    if (vw && vw.dataset.vid) {
      vw.innerHTML = '<iframe src="/yt?v=' + encodeURIComponent(vw.dataset.vid) +
        '" allow="autoplay; encrypted-media" allowfullscreen loading="lazy"></iframe>';
      vw.classList.add("playing"); return;
    }
    if (t.closest("[data-hours]")) {
      var dd = SHEET && SHEET.querySelector("#fi-days");
      if (dd) dd.hidden = !dd.hidden;
      return;
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
