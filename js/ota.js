/* =========================================================
   ota.js — Capgo 자체호스팅 무선 업데이트(OTA) 클라이언트 (수동 모드)
   · 네이티브 앱(Capacitor)에서만 동작. 웹/원격로딩은 no-op.
   · 부팅 시 ①notifyAppReady()로 '이 번들 정상' 신고(안 하면 Capgo가 이전 번들로 자동 롤백=안전장치)
     ②백그라운드로 manifest 확인 → 서버가 더 최신이면 zip 내려받아 '다음 실행 때' 적용(현재 세션 방해 0).
   · manifest: { version:"072914", url:"https://galla.im/ota/galla-072914.zip" }  (version=galla version.txt 숫자)
   · ⚠️ 버전 비교는 window.GALLA_V(현재 '실행 중'인 웹 버전) 기준 — Capgo 내부 bundle 버전("1.0" 빌트인)이
     아니라. 안 그러면 앱스토어 새 빌드(GALLA_V 최신)가 옛 OTA로 다운그레이드된다(실측).
   · 실패는 전부 조용히 삼킨다 — OTA가 통화/앱 부팅을 절대 막지 않게.
   · 비콘(kind='ota')은 '실제 업데이트/에러'만 — 평상시(최신) 스킵은 무로그(DB 노이즈 방지).
   ========================================================= */
(function () {
  var Cap = window.Capacitor;
  if (!Cap || !Cap.isNativePlatform || !Cap.isNativePlatform()) return;   // 네이티브 앱에서만
  var U = Cap.Plugins && Cap.Plugins.CapacitorUpdater;
  if (!U) return;

  var MANIFEST = "https://galla.im/ota/manifest.json";
  var num = function (v) { var n = parseInt(String(v == null ? "" : v).replace(/[^0-9]/g, ""), 10); return isFinite(n) ? n : 0; };
  var beacon = function (m) { try { var c = window.supabaseClient; c && c.rpc('log_client_error', { p_kind: 'ota', p_message: m, p_ver: 'diag' }).then(function () {}, function () {}); } catch (_) {} };

  // ① 부팅 성공 신고 — 다운로드된 번들을 '확정'해 롤백 방지. builtin이어도 무해.
  try { U.notifyAppReady(); } catch (_) {}

  // ② 업데이트 확인(부팅 4초 뒤 = 첫 화면 렌더 방해 안 함)
  setTimeout(function () {
    (async function () {
      try {
        // 현재 '실행 중' 웹 버전 = window.GALLA_V (빌트인이든 OTA 적용본이든 그 번들의 app.html 값)
        var runningV = num(window.GALLA_V);
        if (!runningV) { try { var cur = await U.current(); runningV = num(cur && cur.bundle && cur.bundle.version); } catch (_) {} }

        var r = await fetch(MANIFEST + "?_=" + Date.now(), { cache: "no-store" });
        if (!r || !r.ok) return;
        var m = await r.json();
        if (!m || !m.version || !m.url) return;

        if (num(m.version) <= runningV) return;    // 최신이면 조용히 종료(무로그)

        beacon('update ' + runningV + '->' + m.version);
        var bundle = await U.download({ url: m.url, version: String(m.version) });
        if (!bundle || !bundle.id) { beacon('download-fail ' + m.version); return; }
        await U.next({ id: bundle.id });
        beacon('ready ' + m.version + ' (다음 실행 적용)');
      } catch (e) { beacon('ERR ' + String((e && e.message) || e).slice(0, 60)); }
    })();
  }, 4000);
})();
