/* 📲 갈라 앱 다운로드 트리거 — 웹(PC·모바일) 전역. 갈비스가 앱 전용 기능에 닿거나 '앱 받기'를 누르면
   여기로 유도한다. 아직 스토어 미출시 → 지금은 PWA 설치(홈 화면 추가)+QR. 출시되면 GALLA_APP만 채우면
   스토어 배지/링크로 자동 전환(코드 수정 0). 앱(네이티브) 안에서는 절대 안 뜬다. */
(function () {
  "use strict";
  if (window.__gallaAppDl) return; window.__gallaAppDl = true;

  // 🏷 출시되면 여기만 채우세요 (released:true + 스토어 URL). 그럼 QR/PWA → 스토어 배지로 자동 전환.
  window.GALLA_APP = window.GALLA_APP || {
    released: false,
    ios: "",       // 예: https://apps.apple.com/app/id0000000000
    android: "",   // 예: https://play.google.com/store/apps/details?id=im.galla.app
    site: "https://galla.im"
  };

  function isNativeApp() {
    try {
      if (/GallaApp/i.test(navigator.userAgent)) return true;
      if (window.GALLA_isApp && window.GALLA_isApp()) return true;
      if (window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()) return true;
      if (window.matchMedia && matchMedia("(display-mode: standalone)").matches) return true;
    } catch (e) {}
    return false;
  }
  var UA = navigator.userAgent || "";
  var IS_IOS = /iPhone|iPad|iPod/i.test(UA) || (/(Macintosh)/.test(UA) && "ontouchend" in document);
  var IS_ANDROID = /Android/i.test(UA);
  var IS_MOBILE = IS_IOS || IS_ANDROID || (window.matchMedia && matchMedia("(max-width: 820px)").matches);

  var REASONS = {
    call:  { emo: "📞", line: "음성·영상통화는 <b>갈라 앱</b>에서 돼요." },
    voice: { emo: "🎙", line: "실시간 음성 대화는 <b>갈라 앱</b>이 제일 매끄러워요." },
    push:  { emo: "🔔", line: "알림을 놓치지 않으려면 <b>갈라 앱</b>을 받아요." },
    getapp:{ emo: "🚀", line: "갈라를 <b>앱</b>으로 쓰면 훨씬 빠르고 알림·통화까지 다 돼요." },
    generic:{ emo: "📲", line: "이 기능은 <b>갈라 앱</b>에서 더 좋아요." }
  };

  function injectStyle() {
    if (document.getElementById("galla-dl-style")) return;
    var s = document.createElement("style");
    s.id = "galla-dl-style";
    s.textContent = [
      ".gdl-scrim{position:fixed;inset:0;background:rgba(0,0,0,.62);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);z-index:10080;opacity:0;transition:opacity .2s;display:flex;align-items:flex-end;justify-content:center}",
      ".gdl-scrim.on{opacity:1}",
      "@media(min-width:821px){.gdl-scrim{align-items:center}}",
      ".gdl{width:100%;max-width:420px;background:#111319;color:#fff;border:1px solid #232733;border-radius:22px 22px 0 0;padding:22px 20px calc(20px + env(safe-area-inset-bottom));transform:translateY(24px);transition:transform .26s cubic-bezier(.2,.8,.2,1);box-shadow:0 -10px 40px rgba(0,0,0,.5)}",
      ".gdl-scrim.on .gdl{transform:translateY(0)}",
      "@media(min-width:821px){.gdl{border-radius:22px;margin:20px}}",
      ".gdl-x{position:absolute;top:14px;right:16px;width:34px;height:34px;border:0;background:#1c2028;color:#aeb6c6;border-radius:50%;font-size:20px;cursor:pointer}",
      ".gdl-emo{font-size:40px;line-height:1;margin-bottom:8px}",
      ".gdl-h{font-size:21px;font-weight:800;margin:0 0 6px;letter-spacing:-.3px}",
      ".gdl-p{font-size:14.5px;color:#c3c9d4;line-height:1.55;margin:0 0 18px}",
      ".gdl-p b{color:#fff}",
      ".gdl-badges{display:flex;gap:10px;flex-wrap:wrap}",
      ".gdl-badge{flex:1 1 46%;min-width:150px;display:flex;align-items:center;gap:10px;padding:11px 14px;border-radius:14px;background:#0b0c11;border:1px solid #2a2f3a;color:#fff;text-decoration:none;font-weight:700;font-size:14px}",
      ".gdl-badge.dim{opacity:.5}",
      ".gdl-badge svg{width:24px;height:24px;flex:0 0 auto}",
      ".gdl-badge small{display:block;font-size:11px;color:#8a92a1;font-weight:600}",
      ".gdl-cta{display:flex;align-items:center;justify-content:center;gap:9px;width:100%;padding:15px;border:0;border-radius:14px;background:linear-gradient(135deg,#4361ff,#5b8cff);color:#fff;font-size:16px;font-weight:800;cursor:pointer}",
      ".gdl-qr{display:flex;gap:16px;align-items:center;background:#0b0c11;border:1px solid #2a2f3a;border-radius:16px;padding:16px;margin-top:4px}",
      ".gdl-qr img{width:120px;height:120px;border-radius:10px;background:#fff;flex:0 0 auto}",
      ".gdl-qr-t{font-size:14px;color:#c3c9d4;line-height:1.5}",
      ".gdl-qr-t b{color:#fff;display:block;font-size:15px;margin-bottom:4px}",
      ".gdl-soon{display:inline-block;font-size:11.5px;font-weight:800;color:#0a0a0b;background:#5fd8ff;padding:3px 10px;border-radius:999px;margin-bottom:10px}"
    ].join("");
    document.head.appendChild(s);
  }

  var AS_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.4 12.9c0-2 1.1-3.2 1.2-3.3-.7-1-1.7-1.1-2-1.1-.9-.1-1.7.5-2.2.5s-1.1-.5-1.9-.5c-1 0-1.9.6-2.4 1.5-1 1.8-.3 4.4.7 5.9.5.7 1.1 1.5 1.8 1.5s1-.5 1.9-.5 1.1.5 1.9.5 1.2-.7 1.7-1.4c.5-.8.8-1.6.8-1.6s-1.2-.5-1.2-1.9zM14.9 6.5c.4-.5.7-1.2.6-1.9-.6 0-1.3.4-1.7.9-.4.4-.7 1.1-.6 1.8.7.1 1.3-.3 1.7-.8z"/></svg>';
  var GP_ICON = '<svg viewBox="0 0 24 24" fill="none"><path d="M4 3l13 9-13 9V3z" fill="#5fd8ff"/></svg>';

  function badge(store) {
    var A = window.GALLA_APP;
    var url = store === "ios" ? A.ios : A.android;
    var wants = store === "ios" ? IS_IOS : IS_ANDROID;
    var dim = (IS_MOBILE && !wants) ? " dim" : "";
    var icon = store === "ios" ? AS_ICON : GP_ICON;
    var top = store === "ios" ? "App Store" : "Google Play";
    var target = url ? (' href="' + url + '" target="_blank" rel="noopener"') : ' data-nourl="1"';
    return '<a class="gdl-badge' + dim + '"' + target + '><span>' + icon + '</span><span><small>다운로드</small>' + top + '</span></a>';
  }

  function pwaInstall() {
    // 홈 화면에 추가(PWA) — nav.js/a2hs.js 공용 훅 재사용
    try {
      if (window.GALLA_installApp) { window.GALLA_installApp(); return; }
      if (window.GALLA_canInstall && window.GALLA_canInstall()) { window.GALLA_promptInstall && window.GALLA_promptInstall(); return; }
    } catch (e) {}
    alert(IS_IOS ? "공유 버튼 → '홈 화면에 추가'를 누르면 앱처럼 쓸 수 있어요!"
                 : "브라우저 메뉴 → '홈 화면에 추가'를 누르면 앱처럼 쓸 수 있어요!");
  }

  window.GALLA_appDownload = function (reason) {
    if (isNativeApp()) return;   // 앱 안에서는 안 뜸
    injectStyle();
    var A = window.GALLA_APP, R = REASONS[reason] || REASONS.generic;
    var body;
    if (A.released && (A.ios || A.android)) {
      // 출시됨 — 스토어 배지 (+ PC는 QR)
      var qr = !IS_MOBILE ? ('<div class="gdl-qr"><img src="https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=1&data=' +
        encodeURIComponent(A.site + "/?utm=galvis_qr") + '" alt="QR"><div class="gdl-qr-t"><b>폰으로 QR 스캔</b>스토어로 바로 연결돼요.</div></div>') : "";
      body = '<div class="gdl-badges">' + badge("ios") + badge("android") + '</div>' + qr;
    } else if (!IS_MOBILE) {
      // 미출시 + PC — QR로 모바일 유도(홈 화면 추가)
      body = '<div class="gdl-qr"><img src="https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=1&data=' +
        encodeURIComponent(A.site + "/?utm=galvis_qr") + '" alt="QR"><div class="gdl-qr-t"><b>폰으로 QR 스캔</b>모바일에서 galla.im 접속 → 홈 화면에 추가하면 앱처럼 써요.</div></div>';
    } else {
      // 미출시 + 모바일 — PWA 설치(홈 화면 추가)
      body = '<button class="gdl-cta" id="gdl-pwa">📲 홈 화면에 추가</button>';
    }
    var soon = A.released ? "" : '<span class="gdl-soon">정식 앱 출시 임박</span><br>';

    var scrim = document.createElement("div");
    scrim.className = "gdl-scrim";
    scrim.innerHTML =
      '<div class="gdl" role="dialog" aria-label="갈라 앱 받기">' +
        '<button class="gdl-x" aria-label="닫기">×</button>' +
        '<div class="gdl-emo">' + R.emo + '</div>' +
        soon +
        '<h3 class="gdl-h">갈라, 앱으로 만나요</h3>' +
        '<p class="gdl-p">' + R.line + '</p>' +
        body +
      '</div>';
    document.body.appendChild(scrim);
    requestAnimationFrame(function () { scrim.classList.add("on"); });

    function bye() { scrim.classList.remove("on"); setTimeout(function () { scrim.remove(); }, 240); }
    scrim.addEventListener("click", function (e) { if (e.target === scrim) bye(); });
    scrim.querySelector(".gdl-x").addEventListener("click", bye);
    var pwa = scrim.querySelector("#gdl-pwa");
    if (pwa) pwa.addEventListener("click", function () { pwaInstall(); bye(); });
    // 미출시 상태 배지(빈 URL) 탭 → PWA 설치로 폴백
    scrim.querySelectorAll('[data-nourl]').forEach(function (b) {
      b.addEventListener("click", function (e) { e.preventDefault(); pwaInstall(); bye(); });
    });
  };
})();
