/* 🔙 안드로이드 하드웨어 뒤로가기 — 없으면 한 번에 앱이 꺼진다.
 *
 * 실측 2026-08-28(에뮬레이터): 릴스 화면에서 뒤로가기 한 번 → 런처로 튕김.
 * Capacitor 는 backButton 리스너가 없으면 기본 동작이 '앱 종료'다. 웹뷰 이력을 보지 않는다.
 * 안드로이드 유저가 제일 먼저, 제일 자주 누르는 키라 이게 없으면 체류시간이 통째로 깎인다.
 *
 * 우선순위 — 위에서 걸리면 거기서 끝낸다:
 *   ① 열려 있는 시트·오버레이가 있으면 그것부터 닫는다(유저가 기대하는 첫 동작)
 *   ② 글을 쓰는 중이면 실수로 나가지 않게 확인을 받는다
 *   ③ 앱 안에서 이동해 온 이력이 있으면 뒤로
 *   ④ 더 갈 데가 없으면 두 번 눌러야 종료 — 한 번에 꺼지면 사고다
 */
(function () {
  /* Capacitor 브릿지는 top 문서에만 주입된다. SPA 뷰는 iframe 안에서 돌아서
     그 프레임의 window.Capacitor 는 registerPlugin 이 없다 — 햅틱이 안 오던 것과 같은 원인.
     same-origin 이라 top·parent 로 올라가서 잡는다. */
  /* Capacitor 브릿지는 top 문서에만 주입된다. SPA 뷰는 iframe 안에서 돌아서
     그 프레임의 window.Capacitor 가 비어 있다 — 햅틱이 안 오던 것과 같은 원인. */
  function capacitor() {
    var C = window.Capacitor;
    try { if ((!C || !C.addListener) && window.top && window.top !== window && window.top.Capacitor) C = window.top.Capacitor; } catch (_) {}
    try { if ((!C || !C.addListener) && window.parent && window.parent !== window && window.parent.Capacitor) C = window.parent.Capacitor; } catch (_) {}
    return C || null;
  }

  /* ⚠️ 이 앱은 번들러 없이 <script> 로만 돌아서 @capacitor/core 의 JS 런타임이 없다.
     그래서 Capacitor.registerPlugin 도, Plugins.App 도 존재하지 않는다(실측: Plugins 에
     SystemBars·CapacitorCookies·WebView·CapacitorHttp 만 있음). 네이티브 플러그인은 살아 있으니
     브릿지가 직접 주는 저수준 API 로 붙는다 — 이게 유일하게 되는 길이다. */
  const C = capacitor();
  const native = !!(C && C.isNativePlatform && C.isNativePlatform());
  if (!C || !native || typeof C.addListener !== "function") return;   // iOS·웹은 빠진다

  function onNative(plugin, event, cb) { try { return C.addListener(plugin, event, cb); } catch (_) { return null; } }
  function callNative(plugin, method, opts) { try { return C.nativePromise(plugin, method, opts || {}); } catch (_) {} }

  /* 떠 있는 오버레이 하나 닫기. 앱 전반이 '스크림 + 시트' 패턴이라 그 규칙으로 찾는다.
     닫기 버튼을 누르는 게 각 화면의 정리 로직(스크롤 복구·상태 저장)까지 태우는 길이다. */
  const CLOSERS = [
    ".dmt-skip", ".gt-skip",                        // 온보딩·트렌드 투어 건너뛰기
    ".gpl-scrim .gpl-x", ".gdl-scrim .gdl-x", ".chg-sheet .chg-x",
    ".ns-scrim .ns-x", ".sh-scrim .sh-x", ".cmt-sheet .cmt-x",
    "[data-sheet-close]", ".sheet-close", ".modal-close",
    ".fr-x", ".ag-x", ".wb-x",                      // 갈비스·에이전트·작업대
  ];
  const SCRIMS = ".gpl-scrim,.gdl-scrim,.av-scrim,.fr-scrim,.dmt-scrim,.sh-scrim,.ns-scrim";

  function visible(el) {
    if (!el) return false;
    const s = getComputedStyle(el);
    return s.display !== "none" && s.visibility !== "hidden" && el.offsetParent !== null;
  }

  function closeTop() {
    for (const sel of CLOSERS) {
      const b = [...document.querySelectorAll(sel)].filter(visible).pop();
      if (b) { b.click(); return true; }
    }
    // 닫기 버튼을 못 찾으면 스크림 자체를 눌러 본다(대부분 바깥 탭으로 닫힌다)
    const scrim = [...document.querySelectorAll(SCRIMS)].filter(visible).pop();
    if (scrim) { scrim.click(); return true; }
    // 갈비스 대화창
    if (window.GALLA_closeFriend && visible(document.getElementById("frSheet"))) {
      window.GALLA_closeFriend(); return true;
    }
    return false;
  }

  let armed = 0;
  onNative("App", "backButton", function () {
    try {
      if (closeTop()) return;                                   // ①

      if (window.GALLA_isWriting && window.GALLA_isWriting()) {  // ②
        if (!confirm("쓰던 글이 사라져요. 나갈까요?")) return;
      }

      // ③ 앱 안에서 온 이력이 있으면 뒤로. SPA 라우터가 있으면 그쪽이 우선.
      if (window.GALLA_SPA && window.GALLA_SPA.canBack && window.GALLA_SPA.canBack()) {
        history.back(); return;
      }
      if (history.length > 1 && document.referrer && (function () {
        try { return new URL(document.referrer).origin === location.origin; } catch (_) { return false; }
      })()) { history.back(); return; }

      // ④ 홈이다 — 두 번 눌러야 나간다
      const now = Date.now();
      if (now - armed < 2000) { callNative("App", "exitApp"); return; }
      armed = now;
      if (window.GALLA_toast) window.GALLA_toast("한 번 더 누르면 앱이 닫혀요");
    } catch (_) {
      /* 어떤 이유로든 판정이 실패해도 앱을 그냥 꺼뜨리진 않는다 */
    }
  });
})();
