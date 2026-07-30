/* =========================================================
   ota.js — Capgo 자체호스팅 무선 업데이트(OTA) 클라이언트 (수동 모드)
   · 네이티브 앱(Capacitor)에서만 동작. 웹/원격로딩은 no-op.
   · 부팅 시 ①notifyAppReady()로 '이 번들 정상' 신고(안 하면 Capgo가 이전 번들로 자동 롤백=안전장치)
     ②백그라운드로 manifest 확인 → 서버가 더 최신이면 zip 내려받아 '다음 실행 때' 적용(현재 세션 방해 0).
   · manifest: { version:"072911", url:"https://.../bundle-072911.zip" }  (version=galla version.txt 숫자)
   · 실패는 전부 조용히 삼킨다 — OTA가 통화/앱 부팅을 절대 막지 않게.
   · 진단 비콘(kind='ota') — 헤드리스라 client_errors 로 단계 추적.
   ========================================================= */
(function () {
  var Cap = window.Capacitor;
  if (!Cap || !Cap.isNativePlatform || !Cap.isNativePlatform()) return;   // 네이티브 앱에서만
  var U = Cap.Plugins && Cap.Plugins.CapacitorUpdater;

  function beacon(m) { try { var c = window.supabaseClient; c && c.rpc('log_client_error', { p_kind: 'ota', p_message: m, p_ver: 'diag' }).then(function () {}, function () {}); } catch (_) {} }

  if (!U) { setTimeout(function () { beacon('NO-PLUGIN'); }, 5000); return; }

  var MANIFEST = "https://galla.im/ota/manifest.json";
  var num = function (v) { var n = parseInt(String(v).replace(/[^0-9]/g, ""), 10); return isFinite(n) ? n : 0; };

  // ① 부팅 성공 신고 — 다운로드된 번들을 '확정'해 롤백 방지. builtin이어도 무해.
  try { U.notifyAppReady(); } catch (_) {}

  // ② 업데이트 확인(부팅 4초 뒤 = 첫 화면 렌더 방해 안 함)
  setTimeout(function () {
    (async function () {
      try {
        var cur = null; try { cur = await U.current(); } catch (e) { beacon('current-err ' + String(e && e.message).slice(0, 40)); }
        var curV = (cur && cur.bundle && cur.bundle.version) || "builtin";
        var isBuiltin = (curV === "builtin");
        beacon('start cur=' + curV + ' native=' + (cur && cur.native));

        var r = await fetch(MANIFEST + "?_=" + Date.now(), { cache: "no-store" });
        if (!r || !r.ok) { beacon('manifest-http ' + (r && r.status)); return; }
        var m = await r.json();
        if (!m || !m.version || !m.url) { beacon('manifest-bad'); return; }
        beacon('manifest v=' + m.version);

        if (!isBuiltin && num(m.version) <= num(curV)) { beacon('skip up-to-date ' + curV); return; }
        if (String(m.version) === String(curV)) { beacon('skip same ' + curV); return; }

        beacon('download start ' + m.version);
        var bundle = await U.download({ url: m.url, version: String(m.version) });
        if (!bundle || !bundle.id) { beacon('download-noid'); return; }
        beacon('download ok id=' + bundle.id + ' st=' + bundle.status);
        await U.next({ id: bundle.id });
        beacon('next set -> ' + m.version + ' (다음 실행 적용)');
      } catch (e) { beacon('ERR ' + String((e && e.message) || e).slice(0, 60)); }
    })();
  }, 4000);
})();
