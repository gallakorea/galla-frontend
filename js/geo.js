/* =========================================================
   geo.js — 위치 가져오기 공용 모듈 (26.9.21)
   ─────────────────────────────────────────────────────────
   ⚠️ 왜 만들었나
     iOS 앱에서 위치가 **조용히 죽어 있었다**. navigator.geolocation 을 그대로 불렀는데,
     Capacitor 의 capacitor:// origin 에서는 WKWebView 가 위치 요청을 넘겨주지 않는다.
     OS 권한창도 뜨고 사용자가 허용까지 했는데 콜백이 영영 안 왔다
     (26.9.11 QA 실측: 허용 후 60초 무응답). 사용자는 앱이 고장난 줄 안다.

   그래서 네이티브에서는 @capacitor/geolocation 플러그인을 쓰고, 웹에서는 기존 API 를 쓴다.
   호출부는 이 차이를 몰라도 되게 한 곳으로 모았다.

   window.GALLA_getPosition(opt) → Promise<{lat, lng, accuracy}>
     실패하면 Error 를 던지며 err.kind 로 원인을 구분한다:
       'denied'    권한 거부 — 안내와 복구 경로를 보여줄 것
       'timeout'   시간 초과 — 실내·지하 등. 권한 탓으로 안내하면 안 된다
       'unavailable' 위치를 못 구함
     ⚠️ 이 구분이 중요하다. 예전엔 timeout 도 「위치 권한이 필요해요」로 안내해서,
        거부한 적 없는 사용자에게 권한 탓을 했다(js/food.js 두 곳).
   ========================================================= */
(function () {
  if (window.GALLA_getPosition) return;

  function isNative() {
    try { return !!(window.Capacitor && (window.Capacitor.isNativePlatform ? window.Capacitor.isNativePlatform() : window.Capacitor.isNative)); }
    catch (_) { return false; }
  }
  function plugin() {
    try { return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Geolocation; } catch (_) { return null; }
  }
  function fail(kind, msg) { const e = new Error(msg || kind); e.kind = kind; return e; }

  // 브라우저 GeolocationPositionError → 우리 kind 로
  function webKind(err) {
    const c = err && err.code;
    if (c === 1) return "denied";
    if (c === 3) return "timeout";
    return "unavailable";
  }

  window.GALLA_getPosition = async function (opt) {
    opt = opt || {};
    const highAccuracy = !!opt.highAccuracy;          // 기본은 대략 위치(배터리·속도)
    const timeout = opt.timeout || 10000;

    /* ── 네이티브: 플러그인 경로 ── */
    const G = isNative() ? plugin() : null;
    if (G) {
      try {
        // 권한부터 확인 — 거부 상태면 위치를 부르지 않고 바로 알린다(복구 시트를 띄우라고)
        let perm = await G.checkPermissions();
        if (perm.location === "prompt" || perm.location === "prompt-with-rationale") {
          perm = await G.requestPermissions({ permissions: ["location"] });
        }
        if (perm.location !== "granted" && perm.coarseLocation !== "granted") throw fail("denied");
        const p = await G.getCurrentPosition({ enableHighAccuracy: highAccuracy, timeout, maximumAge: 300000 });
        return { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
      } catch (e) {
        if (e && e.kind) throw e;
        const m = String((e && e.message) || e).toLowerCase();
        if (/denied|permission/.test(m)) throw fail("denied");
        if (/time|timeout/.test(m)) throw fail("timeout");
        throw fail("unavailable", m.slice(0, 60));
      }
    }

    /* ── 웹: 표준 API ── */
    if (!navigator.geolocation) throw fail("unavailable", "no-api");
    return await new Promise((res, rej) => {
      navigator.geolocation.getCurrentPosition(
        (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
        (err) => rej(fail(webKind(err))),
        { enableHighAccuracy: highAccuracy, timeout, maximumAge: 300000 }
      );
    });
  };

  /* 실패 원인에 맞는 안내 문구 — 호출부마다 제각각 쓰던 걸 한곳으로 */
  window.GALLA_geoMessage = function (err) {
    const k = (err && err.kind) || "unavailable";
    if (k === "denied") return "위치 권한이 꺼져 있어요";
    if (k === "timeout") return "위치를 찾는 데 시간이 걸려요 — 실내라면 창가에서 다시 해보세요";
    return "지금은 위치를 확인할 수 없어요";
  };
})();
