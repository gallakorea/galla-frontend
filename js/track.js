/* =========================================================
   track.js — 갈라 자체 측정(26.10.12, 오픈 전 장치)
   - 무작위 기기 ID(galla_did)로 비로그인 방문도 같은 사람으로 묶는다. 개인정보 없음.
   - 첫 유입 경로(galla_src)를 처음 한 번만 기록: utm_source / 초대코드(ref) / 공유 링크 / 외부 referrer / 앱 / 직접
   - 보내는 건 두 가지뿐: 세션 시작(session_start), 로그인 시 기기↔계정 연결(identify).
     투표·댓글·가입·베팅·DM 은 DB 트리거가 서버에서 기록한다(경로가 많아 클라 훅은 샌다).
   - splash-boot.js 가 모든 진입 문서에서 이 파일을 비동기로 싣는다. 실패해도 화면엔 영향 없음.
   ========================================================= */
(function () {
  if (window.__gallaTrack) return; window.__gallaTrack = true;
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && location.protocol !== "capacitor:") return;   // 로컬 개발 제외

  var SB = "https://bidqauputnhkqepvdzrr.supabase.co";
  var ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpZHFhdXB1dG5oa3FlcHZkenJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNzg1NDIsImV4cCI6MjA4MDg1NDU0Mn0.D-UGDPuBaNO8v-ror5-SWgUNLRvkOO-yrf2wDVZtyEM";
  var LS = { get: function (k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
             set: function (k, v) { try { localStorage.setItem(k, v); } catch (_) {} } };

  function did() {
    var d = LS.get("galla_did");
    if (!d || !/^[A-Za-z0-9_-]{8,64}$/.test(d)) {
      d = (window.crypto && crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2))).replace(/[^A-Za-z0-9_-]/g, "");
      LS.set("galla_did", d);
    }
    return d;
  }
  function platform() {
    var C = window.Capacitor;
    try { if (C && C.getPlatform) { var p = C.getPlatform(); if (p === "ios" || p === "android") return p; } } catch (_) {}
    if (/GallaApp/i.test(navigator.userAgent || "")) return "app";
    return /Mobi|Android|iPhone/i.test(navigator.userAgent || "") ? "web-m" : "web";
  }
  // 첫 유입 경로 — 처음 한 번만 고정(재방문 때 덮지 않는다)
  function firstSrc() {
    var s = LS.get("galla_src");
    if (s) return s;
    var q = new URLSearchParams(location.search);
    var host = ""; try { host = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, "") : ""; } catch (_) {}
    if (q.get("utm_source")) s = "utm:" + q.get("utm_source").slice(0, 40);
    else if (q.get("ref")) s = "ref";
    else if (/^\/share\//.test(location.pathname) || q.get("from") === "share") s = "share";
    else if (host && !/galla\.im$/.test(host)) s = /youtube|youtu\.be/.test(host) ? "youtube" : /instagram/.test(host) ? "instagram" : /naver/.test(host) ? "naver" : /google/.test(host) ? "google" : "ref:" + host.slice(0, 40);
    else if (platform() === "ios" || platform() === "android") s = "app";
    else s = "direct";
    LS.set("galla_src", s);
    return s;
  }
  function token() {
    try { var t = JSON.parse(LS.get("sb-bidqauputnhkqepvdzrr-auth-token") || "null"); return (t && t.access_token) || null; } catch (_) { return null; }
  }
  function send(event, props) {
    var body = JSON.stringify({ p_device: did(), p_event: event, p_props: props || {}, p_platform: platform(), p_src: firstSrc() });
    var tk = token() || ANON;
    try {
      fetch(SB + "/rest/v1/rpc/track_event", {
        method: "POST", keepalive: true, body: body,
        headers: { "Content-Type": "application/json", apikey: ANON, Authorization: "Bearer " + tk },
      }).catch(function () {});
    } catch (_) {}
  }
  window.GALLA_track = send;

  // 세션 시작 — 탭/앱 실행당 1회
  var first = !LS.get("galla_did");
  var started = false; try { started = !!sessionStorage.getItem("galla_sess"); sessionStorage.setItem("galla_sess", "1"); } catch (_) {}
  if (!started) send("session_start", { page: location.pathname.slice(0, 60), new_device: first });

  // 로그인 순간(또는 이미 로그인 상태로 들어온 첫 세션) 기기↔계정 연결 — 하루 1회면 충분
  function identifyOnce() {
    if (!token()) return;
    var k = "galla_ident_" + new Date().toISOString().slice(0, 10);
    if (LS.get(k)) return; LS.set(k, "1");
    send("identify", {});
  }
  identifyOnce();
  (function hook(n) {
    var c = window.supabaseClient;
    if (!c || !c.auth || !c.auth.onAuthStateChange) { if (n < 40) setTimeout(function () { hook(n + 1); }, 500); return; }
    c.auth.onAuthStateChange(function (ev) { if (ev === "SIGNED_IN") { try { localStorage.removeItem("galla_ident_" + new Date().toISOString().slice(0, 10)); } catch (_) {} setTimeout(identifyOnce, 300); } });
  })(0);
})();
