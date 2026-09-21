/* =========================================================
   loc-map.js — 갈라톡 위치를 네이버 지도로 띄우기 (26.9.21)
   ─────────────────────────────────────────────────────────
   왜: 위치를 보내면 구글 지도 주소가 글자로만 찍혀 눌리지도 않았다(사장님 실측).
       카카오톡처럼 앱 안에서 바로 지도를 띄운다. 한국 사용자에겐 네이버 지도가 익숙하고,
       갈라는 이미 네이버 지도 SDK 를 맛집·날씨 탭에서 쓰고 있어 새로 들일 게 없다.

   구조는 날씨 탭(js/weather.js)과 같다:
     앱  → 네이티브 네이버 지도가 웹뷰 **뒤**에 깔리고, 웹뷰를 투명하게 비워 보이게 한다
     웹  → 네이버 지도 JS SDK 를 그린다

   window.GALLA_showLocation(lat, lng, title)
   ========================================================= */
(function () {
  if (window.GALLA_showLocation) return;

  var OV = null, NATIVE_MAP = null, HANDLES = [];

  function isApp() {
    try { return location.protocol === "capacitor:" || location.protocol === "ionic:" ||
                 (typeof window.GALLA_isApp === "function" && window.GALLA_isApp()); } catch (_) { return false; }
  }
  function plugin() {
    try { return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.GallaNaverMap; } catch (_) { return null; }
  }

  var sdkP = null;
  function loadSdk(cid, param) {
    if (window.naver && window.naver.maps) return Promise.resolve();
    if (sdkP) return sdkP;
    sdkP = new Promise(function (res, rej) {
      var sc = document.createElement("script");
      sc.src = "https://oapi.map.naver.com/openapi/v3/maps.js?" + encodeURIComponent(param || "ncpKeyId") + "=" + encodeURIComponent(cid);
      sc.onload = function () { (window.naver && window.naver.maps) ? res() : rej(new Error("no_maps")); };
      sc.onerror = function () { rej(new Error("load_fail")); };
      document.head.appendChild(sc);
      setTimeout(function () { (window.naver && window.naver.maps) ? res() : rej(new Error("timeout")); }, 8000);
    });
    return sdkP;
  }

  function css() {
    if (document.getElementById("glm-css")) return;
    var st = document.createElement("style");
    st.id = "glm-css";
    st.textContent =
      "#glm{position:fixed;inset:0;z-index:2147480000;background:#0a0a0b;display:flex;flex-direction:column;" +
        "font-family:-apple-system,'Apple SD Gothic Neo','Noto Sans KR',sans-serif}" +
      "#glm .glm-top{position:relative;z-index:2;display:flex;align-items:center;gap:10px;" +
        "padding:calc(10px + env(safe-area-inset-top)) 12px 12px;background:linear-gradient(#0a0a0bf2,#0a0a0bcc 70%,transparent)}" +
      "#glm .glm-x{width:40px;height:40px;border:0;border-radius:12px;background:#1a1d25;color:#fff;font-size:20px;flex:none}" +
      "#glm .glm-t{flex:1;min-width:0}" +
      "#glm .glm-t b{display:block;color:#fff;font-size:16px;font-weight:800}" +
      "#glm .glm-t span{color:#8e97ab;font-size:12px}" +
      "#glm .glm-go{border:0;border-radius:12px;background:#03c75a;color:#fff;font-size:13.5px;font-weight:800;" +
        "padding:11px 13px;flex:none}" +
      "#glm .glm-c{position:absolute;inset:0;z-index:1}" +
      /* ── 앱: 지도가 웹뷰 뒤에 있다 — 덮는 배경을 전부 벗겨야 지도가 보인다(css/food.css 와 같은 이유) ── */
      "html.glm-native,html.glm-native body{background:transparent!important}" +
      "html.glm-native body::before{display:none}" +
      "html.glm-native #glm,html.glm-native #glm .glm-c{background:transparent}" +
      "body.glm-native #tab-track,body.glm-native #stack-root,body.glm-native .nav,body.glm-native header," +
      "body.glm-native .dm-root,body.glm-native #dm{visibility:hidden}" +
      "#glm .glm-err{position:absolute;inset:0;z-index:1;display:flex;align-items:center;justify-content:center;" +
        "color:#8e97ab;font-size:14px;text-align:center;padding:30px;line-height:1.7}";
    document.head.appendChild(st);
  }

  /* 네이버 지도 앱으로 — 길찾기는 지도 앱이 제일 낫다. 앱이 없으면 네이버 지도 웹으로. */
  function openNaverApp(lat, lng, title) {
    var name = encodeURIComponent(title || "공유된 위치");
    var app = "nmap://place?lat=" + lat + "&lng=" + lng + "&name=" + name + "&appname=im.galla";
    var web = "https://map.naver.com/p/search/" + lat + "," + lng;
    var L = null;
    try { L = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AppLauncher; } catch (_) {}
    if (L && isApp()) {
      L.canOpenUrl({ url: "nmap://" }).then(function (r) {
        L.openUrl({ url: (r && r.value) ? app : web }).catch(function () {});
      }).catch(function () { L.openUrl({ url: web }).catch(function () {}); });
      return;
    }
    try { window.open(web, "_blank", "noopener"); } catch (_) { location.href = web; }
  }

  function close() {
    if (!OV) return;
    try { HANDLES.forEach(function (h) { try { h.remove(); } catch (_) {} }); } catch (_) {}
    HANDLES = [];
    var P = plugin();
    if (NATIVE_MAP && P) { try { P.destroy().catch(function () {}); } catch (_) {} }
    NATIVE_MAP = null;
    document.documentElement.classList.remove("glm-native");
    document.body.classList.remove("glm-native");
    OV.remove(); OV = null;
  }

  window.GALLA_showLocation = async function (lat, lng, title) {
    lat = +lat; lng = +lng;
    if (!isFinite(lat) || !isFinite(lng)) return;
    css();
    close();

    OV = document.createElement("div");
    OV.id = "glm";
    OV.innerHTML =
      '<div class="glm-top">' +
        '<button class="glm-x" type="button" aria-label="닫기">✕</button>' +
        '<div class="glm-t"><b>' + (title || "위치") + '</b><span>탭해서 움직여 보세요</span></div>' +
        '<button class="glm-go" type="button">네이버 지도로 길찾기</button>' +
      "</div>" +
      '<div class="glm-c" id="glm-c"></div>';
    document.body.appendChild(OV);
    OV.querySelector(".glm-x").addEventListener("click", function () { history.state && history.state.glm ? history.back() : close(); });
    OV.querySelector(".glm-go").addEventListener("click", function () { openNaverApp(lat, lng, title); });

    // 뒤로가기(안드로이드 하드웨어 키·스와이프)로 닫히게
    try { history.pushState({ glm: 1 }, ""); } catch (_) {}
    var onPop = function () { window.removeEventListener("popstate", onPop); close(); };
    window.addEventListener("popstate", onPop);

    // 지도 키 — 맛집·날씨와 같은 설정을 쓴다
    var cfg = null;
    try { var r = await window.supabaseClient.rpc("food_map_config"); cfg = r && r.data; } catch (_) {}
    var cid = cfg && cfg.naver_client_id;
    var P = plugin();

    try {
      if (!cid) throw new Error("no_client_id");
      if (isApp() && P) {
        /* ── 앱: 네이티브 지도 ── */
        await P.setup({ ncpKeyId: String(cid) });
        document.documentElement.classList.add("glm-native");
        document.body.classList.add("glm-native");
        await P.create({ x: 0, y: 0, width: window.innerWidth, height: window.innerHeight, lat: lat, lng: lng, zoom: 16 });
        NATIVE_MAP = true;
        await P.setMarkers({ markers: [{ id: "loc", kind: "pin", lat: lat, lng: lng, size: 34, text: "", bg: "#ff4a52", ring: "#ffffff", fg: "#ffffff" }] });
        // 상단 바 아래만 지도가 터치를 받는다(바의 버튼은 웹이 받아야 한다)
        var top = OV.querySelector(".glm-top");
        if (P.setTouchTop && top) P.setTouchTop({ y: Math.round(top.getBoundingClientRect().bottom) }).catch(function () {});
      } else if (!isApp()) {
        /* ── 웹: JS SDK ── */
        await loadSdk(String(cid), cfg.param);
        var nv = window.naver.maps;
        var map = new nv.Map(document.getElementById("glm-c"), {
          center: new nv.LatLng(lat, lng), zoom: 16, mapDataControl: false, scaleControl: false,
          logoControlOptions: { position: nv.Position.BOTTOM_LEFT }
        });
        new nv.Marker({ position: new nv.LatLng(lat, lng), map: map });
        setTimeout(function () { try { map.refresh(true); } catch (_) {} }, 60);
      } else {
        throw new Error("app_without_plugin");
      }
    } catch (e) {
      /* 지도를 못 띄워도 막다른 길로 두지 않는다 — 네이버 지도 앱으로 넘길 길은 남긴다 */
      try { window.GALLA_logError && window.GALLA_logError(String(e && e.message || e), "loc_map app=" + isApp() + " plugin=" + !!P); } catch (_) {}
      var c = document.getElementById("glm-c");
      if (c) c.innerHTML = '<div class="glm-err">지도를 불러오지 못했어요.<br>위 버튼으로 네이버 지도에서 열 수 있어요.</div>';
    }
  };
})();
