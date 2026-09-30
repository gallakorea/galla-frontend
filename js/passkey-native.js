/* 🔑 네이티브 패스키 폴리필 (앱 전용, 2026-10-01)
   ──────────────────────────────────────────────────────────────
   앱 웹뷰 origin(capacitor://localhost)은 웹 WebAuthn 으로 RP=galla.im 를 못 쓴다
   (iosScheme=https 는 iOS 불가). 그래서 navigator.credentials.create/get 를
   네이티브 ASAuthorization(GallaBridgeVC gallaPasskey) 로 가로챈다.
   → supabase.auth.registerPasskey()/signInWithPasskey() 가 코드 변경 없이 동작한다
   (supabase-js 의 옵션 변환 pi()/결과 변환 hi()/verify 를 그대로 재사용).
   Associated Domains(webcredentials:galla.im) 이미 설정됨.
   ────────────────────────────────────────────────────────────── */
(function () {
  function isNativeApp() {
    try {
      if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) return true;
    } catch (_) {}
    return /GallaApp/i.test(navigator.userAgent || "");
  }
  // iOS 만 — 안드로이드는 Credential Manager 별도(추후). 지금은 iOS ASAuthorization.
  function isIOS() {
    try { if (window.Capacitor && window.Capacitor.getPlatform) return window.Capacitor.getPlatform() === "ios"; } catch (_) {}
    return /iPhone|iPad|iPod/i.test(navigator.userAgent || "");
  }
  var bridge = (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.gallaPasskey) || null;
  if (!isNativeApp() || !isIOS() || !bridge) return;   // 앱(iOS)+브리지 있을 때만 폴리필

  /* ── base64url ↔ ArrayBuffer ── */
  function abToB64u(buf) {
    var bytes = new Uint8Array(buf), s = "";
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function b64uToAb(str) {
    var s = String(str).replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    var bin = atob(s), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  /* ── 네이티브 호출(요청별 reqId 로 콜백 매칭) ── */
  var pending = {};
  window.__gallaPasskeyResult = function (reqId, ok, payload) {
    var p = pending[reqId]; if (!p) return;
    delete pending[reqId];
    if (ok) { try { p.resolve(JSON.parse(payload)); } catch (e) { p.reject(new Error("parse_fail")); } }
    else { p.reject(makeErr(payload)); }
  };
  function makeErr(code) {
    // 사용자가 취소한 경우 웹 WebAuthn 과 같은 NotAllowedError 로 맞춰 supabase-js·우리 UI 가 동일 처리
    var e = new Error(code || "passkey_error");
    e.name = (code === "canceled") ? "NotAllowedError" : "NotAllowedError";
    return e;
  }
  function callNative(op, params) {
    return new Promise(function (resolve, reject) {
      var reqId = "pk_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
      pending[reqId] = { resolve: resolve, reject: reject };
      var msg = Object.assign({ op: op, reqId: reqId }, params);
      try { bridge.postMessage(msg); }
      catch (e) { delete pending[reqId]; reject(new Error("bridge_fail")); }
      // 안전장치 — 90초 내 무응답이면 실패
      setTimeout(function () { if (pending[reqId]) { delete pending[reqId]; reject(makeErr("timeout")); } }, 90000);
    });
  }

  /* ── PublicKeyCredential 유사 객체(supabase-js hi() 가 읽는 형태) ── */
  function makeCreateCredential(n) {
    var rawId = b64uToAb(n.rawId || n.id);
    var resp = {
      clientDataJSON: b64uToAb(n.response.clientDataJSON),
      attestationObject: b64uToAb(n.response.attestationObject),
      getTransports: function () { return ["internal"]; },
      getAuthenticatorData: function () { return null; },
      getPublicKey: function () { return null; },
      getPublicKeyAlgorithm: function () { return -7; }
    };
    return {
      id: n.id, rawId: rawId, type: "public-key",
      authenticatorAttachment: n.authenticatorAttachment || "platform",
      response: resp,
      getClientExtensionResults: function () { return {}; }
    };
  }
  function makeGetCredential(n) {
    var rawId = b64uToAb(n.rawId || n.id);
    var resp = {
      clientDataJSON: b64uToAb(n.response.clientDataJSON),
      authenticatorData: b64uToAb(n.response.authenticatorData),
      signature: b64uToAb(n.response.signature),
      userHandle: n.response.userHandle ? b64uToAb(n.response.userHandle) : null
    };
    return {
      id: n.id, rawId: rawId, type: "public-key",
      authenticatorAttachment: n.authenticatorAttachment || "platform",
      response: resp,
      getClientExtensionResults: function () { return {}; }
    };
  }

  /* ── navigator.credentials.create/get 가로채기 ── */
  if (!navigator.credentials) { try { Object.defineProperty(navigator, "credentials", { value: {}, configurable: true }); } catch (_) {} }
  var origCreate = navigator.credentials && navigator.credentials.create ? navigator.credentials.create.bind(navigator.credentials) : null;
  var origGet = navigator.credentials && navigator.credentials.get ? navigator.credentials.get.bind(navigator.credentials) : null;

  navigator.credentials.create = function (options) {
    var pk = options && options.publicKey;
    if (!pk || !pk.challenge) { return origCreate ? origCreate(options) : Promise.reject(new Error("no_publickey")); }
    var challenge = abToB64u(pk.challenge);
    var userId = pk.user && pk.user.id ? abToB64u(pk.user.id) : "";
    var userName = (pk.user && (pk.user.name || pk.user.displayName)) || "galla";
    return callNative("register", { challenge: challenge, userId: userId, userName: userName })
      .then(makeCreateCredential);
  };

  navigator.credentials.get = function (options) {
    var pk = options && options.publicKey;
    if (!pk || !pk.challenge) { return origGet ? origGet(options) : Promise.reject(new Error("no_publickey")); }
    var challenge = abToB64u(pk.challenge);
    return callNative("authenticate", { challenge: challenge })
      .then(makeGetCredential);
  };

  // 진단용 — 폴리필이 붙었는지 웹에서 확인
  window.__gallaPasskeyNative = true;
  try { console.log("[passkey] native polyfill active (RP=galla.im via ASAuthorization)"); } catch (_) {}
})();
