/* 🚦 GALLA 피처 플래그 — 순차 오픈 스위치 (2026-09-04)
 *
 * 쓰는 법:
 *   if (GALLA_feature('calls')) { …통화 버튼을 보여준다… }
 *   GALLA_onFeatures(function () { …값이 도착하면 다시 그린다… });
 *
 * 원칙 — **fail-closed**. 값을 못 읽었으면 전부 꺼진 것으로 본다.
 *   런칭 차단은 "모르면 막는다"가 맞다. 반대로 하면 서버가 잠깐 삐끗한 사이에
 *   반쯤 된 기능이 사용자에게 열린다. 한 번 본 사용자는 "이 앱 대충 만들었네"로 기억한다.
 *
 * 캐시 — sessionStorage 에 넣고 **첫 페인트는 캐시로, 뒤이어 서버로 정정**한다.
 *   MPA 라 페이지를 넘길 때마다 왕복이 생기는데, 그때마다 버튼이 늦게 뜨면 깜빡인다.
 *   ⚠️ 캐시에는 true 도 들어간다 = 서버에서 끈 직후 최대 한 세션 동안 남을 수 있다.
 *      끄는 쪽이 급하면 캐시 키(FKEY)의 v 를 올려 전 세션 캐시를 한 번에 버린다.
 *
 * ⚠️ app_settings 를 직접 읽지 않는다 — 그 테이블의 SELECT 는 {authenticated} 전용이라
 *    비로그인 방문자에게는 빈 결과가 온다. 게스트에게만 기능이 안 보이는 버그는
 *    에러도 안 나서 눈치채기 어렵다(food_map 에서 실제로 겪었다). 반드시 app_features() RPC.
 */
(function () {
  "use strict";
  if (window.GALLA_feature) return;

  var FKEY = "galla_features_v1";
  var CACHE = null;                 // 확정값(서버) 또는 캐시값
  var LOADED = false;               // 서버 응답을 받았는가
  var WAITERS = [];

  /* 캐시 선반영 — 서버 응답 전까지 이 값으로 그린다. 없으면 전부 false(fail-closed). */
  try {
    var raw = sessionStorage.getItem(FKEY);
    if (raw) CACHE = JSON.parse(raw);
  } catch (_) {}

  function get(name) {
    return !!(CACHE && CACHE[name] === true);
  }

  function fire() {
    var list = WAITERS.slice();
    WAITERS.length = 0;
    for (var i = 0; i < list.length; i++) {
      try { list[i](CACHE || {}); } catch (_) {}
    }
  }

  async function load() {
    try {
      var sb = window.supabaseClient ||
        (window.waitForSupabaseClient ? await window.waitForSupabaseClient() : null);
      if (!sb) return;                                   // 클라가 없으면 캐시/false 유지
      var res = await sb.rpc("app_features");
      if (res.error || !res.data || typeof res.data !== "object") return;
      var before = JSON.stringify(CACHE);
      CACHE = res.data;
      LOADED = true;
      try { sessionStorage.setItem(FKEY, JSON.stringify(CACHE)); } catch (_) {}
      /* 값이 캐시와 달라졌을 때만 다시 그리게 한다 — 같으면 굳이 리렌더할 이유가 없다.
         단 첫 로드는 무조건 알린다(캐시가 없어 false 로 그려둔 화면이 있을 수 있다). */
      if (before !== JSON.stringify(CACHE) || before == null) fire();
      else WAITERS.length = 0;
    } catch (_) { /* 조용히 실패 = 전부 꺼진 상태 유지 */ }
  }

  /* 공개 API */
  window.GALLA_feature = get;
  window.GALLA_featuresLoaded = function () { return LOADED; };
  window.GALLA_onFeatures = function (cb) {
    if (typeof cb !== "function") return;
    if (LOADED) { try { cb(CACHE || {}); } catch (_) {} return; }
    WAITERS.push(cb);
  };
  /* 관제센터에서 켠 직후 확인용 — 캐시를 버리고 다시 읽는다. */
  window.GALLA_featuresRefresh = function () {
    try { sessionStorage.removeItem(FKEY); } catch (_) {}
    LOADED = false;
    return load();
  };

  load();
})();
