/* =========================================================
   perm-help.js — 권한이 막혔을 때 여는 복구 시트 (26.9.21)
   ─────────────────────────────────────────────────────────
   ⚠️ 왜 만들었나
     권한을 한 번 거부하면 OS 는 같은 요청창을 다시 띄워주지 않는다. 그런데 갈라는
     「설정에서 켜주세요」 라는 **글자만** 보여주고 끝이었다. 게다가 그 안내가
     크롬 기준(⋮ → 설정 → 사이트 설정)이라, 앱 사용자에게는 존재하지도 않는 메뉴를
     3단계로 안내하고 있었다. 사용자 입장에선 되돌릴 방법이 없는 막다른 길이다.

     그래서 ①앱이면 OS 설정 화면을 직접 열어주고 ②웹이면 브라우저별 경로를 안내하고
     ③설정에서 켜고 돌아오면 자동으로 이어가게 한다.

   window.GALLA_permHelp(kind)  kind: 'mic' | 'camera' | 'location' | 'notify'
   ========================================================= */
(function () {
  if (window.GALLA_permHelp) return;

  var KINDS = {
    mic:      { icon: "🎙", name: "마이크",      why: "육성톡·음성 메시지·삐삐를 쓰려면 필요해요." },
    camera:   { icon: "📷", name: "카메라",      why: "면상톡(영상통화)과 촬영에 필요해요." },
    location: { icon: "📍", name: "위치",        why: "대화에서 위치를 보내거나 내 주변 맛집을 찾을 때만 써요." },
    notify:   { icon: "🔔", name: "알림",        why: "답글·귓속말·통화를 놓치지 않으려면 필요해요." }
  };

  function isNative() {
    try { return !!(window.Capacitor && (window.Capacitor.isNativePlatform ? window.Capacitor.isNativePlatform() : window.Capacitor.isNative)); }
    catch (_) { return false; }
  }
  function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent); }

  /* 📱 OS 설정 화면 열기 — 앱에서만 가능하다.
     iOS 는 앱 설정 페이지로 바로, 안드로이드는 앱 정보 화면으로 간다. */
  window.GALLA_openAppSettings = async function () {
    if (!isNative()) return false;
    try {
      var P = window.Capacitor.Plugins;
      if (P && P.NativeSettings) {
        await P.NativeSettings.open({ optionAndroid: "application_details", optionIOS: "app" });
        return true;
      }
      // 폴백 — app-launcher 로 iOS 설정 스킴
      if (P && P.AppLauncher && isIOS()) { await P.AppLauncher.openUrl({ url: "app-settings:" }); return true; }
    } catch (_) {}
    return false;
  };

  function css() {
    if (document.getElementById("gph-css")) return;
    var st = document.createElement("style");
    st.id = "gph-css";
    st.textContent =
      "#gph-back{position:fixed;inset:0;z-index:2147482000;background:rgba(0,0,0,.62);backdrop-filter:blur(3px);" +
        "opacity:0;transition:opacity .22s ease}" +
      "#gph-back.on{opacity:1}" +
      "#gph{position:fixed;left:0;right:0;bottom:0;z-index:2147482001;background:#111319;color:#e9edf6;" +
        "border-radius:18px 18px 0 0;padding:22px 20px calc(24px + env(safe-area-inset-bottom));" +
        "box-shadow:0 -14px 40px rgba(0,0,0,.6);transform:translateY(100%);transition:transform .26s cubic-bezier(.2,.8,.2,1);" +
        "font-family:-apple-system,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;max-width:560px;margin:0 auto}" +
      "#gph.on{transform:translateY(0)}" +
      "#gph .gph-grip{width:38px;height:4px;border-radius:99px;background:#39405230;margin:-8px auto 16px}" +
      "#gph h3{font-size:18px;font-weight:800;margin:0 0 6px;display:flex;align-items:center;gap:8px}" +
      "#gph p.why{font-size:13px;color:#98a2b8;line-height:1.55;margin:0 0 18px}" +
      "#gph ol{margin:0 0 18px;padding-left:20px}" +
      "#gph li{font-size:13.5px;color:#c4cbdb;line-height:1.9}" +
      "#gph li b{color:#fff}" +
      "#gph .gph-btns{display:flex;gap:9px}" +
      "#gph button{flex:1;border:0;border-radius:12px;padding:14px 10px;font-size:14.5px;font-weight:700;cursor:pointer;" +
        "font-family:inherit}" +
      "#gph .go{background:#2f6bff;color:#fff}" +
      "#gph .later{background:#1b1f29;color:#8e97ab}";
    document.head.appendChild(st);
  }

  function close() {
    var b = document.getElementById("gph-back"), s = document.getElementById("gph");
    if (b) { b.classList.remove("on"); setTimeout(function () { b.remove(); }, 240); }
    if (s) { s.classList.remove("on"); setTimeout(function () { s.remove(); }, 260); }
    stopWatch();
  }

  /* 설정에서 켜고 돌아오는 순간을 잡아 자동으로 이어간다 —
     「돌아와서 새로고침하세요」라고 시키지 않으려고. */
  var _watch = null;
  function stopWatch() { if (_watch) { clearInterval(_watch); _watch = null; } document.removeEventListener("visibilitychange", onBack); }
  function onBack() { if (document.visibilityState === "visible") setTimeout(check, 400); }
  var _kind = null;
  async function check() {
    try {
      var ok = false;
      if (_kind === "notify" && window.GALLA_pushStatus) ok = (await window.GALLA_pushStatus()) === "on";
      else if (_kind === "location" && navigator.permissions) {
        var st = await navigator.permissions.query({ name: "geolocation" });
        ok = st.state === "granted";
      } else if (navigator.permissions) {
        var n = _kind === "camera" ? "camera" : "microphone";
        var s2 = await navigator.permissions.query({ name: n });
        ok = s2.state === "granted";
      }
      if (ok) {
        close();
        try { document.dispatchEvent(new CustomEvent("galla:perm-granted", { detail: { kind: _kind } })); } catch (_) {}
      }
    } catch (_) {}
  }


  /* ─────────────────────────────────────────────────────────
     🙋 사전 설명(프라이밍) — OS 권한창을 띄우기 "전에" 왜 필요한지 먼저 보여준다.

     OS 팝업은 한 번 거부당하면 다시 띄울 수 없다. 그래서 인스타·텔레그램은
     자체 화면을 먼저 보여주고, 거기서 '나중에'를 고른 사람에게는 다음에 다시 묻는다.
     갈라도 온보딩 투어에 같은 장치가 있지만, 투어를 놓친 사람은 그 화면을 본 적이 없다.
     그런 사람이 통화 버튼을 누르면 맥락 없이 OS 팝업을 맞고 거절률이 치솟는다.

     window.GALLA_permPrime(kind) → Promise<boolean>
       true  = 계속 진행해도 된다(사용자가 '허용할게요'를 눌렀거나, 이미 안내를 본 사람)
       false = 사용자가 미뤘다 — 호출부는 조용히 멈춘다
     ───────────────────────────────────────────────────────── */
  var PRIMED_KEY = "galla_perm_primed";      // 투어 권한 슬라이드까지 본 사람은 1
  var SEEN_KEY = "galla_perm_prime_seen";    // 이 시트를 본 종류들

  function seen(kind) {
    try { return (localStorage.getItem(SEEN_KEY) || "").split(",").indexOf(kind) >= 0; } catch (_) { return false; }
  }
  function markSeen(kind) {
    try {
      var v = (localStorage.getItem(SEEN_KEY) || "").split(",").filter(Boolean);
      if (v.indexOf(kind) < 0) v.push(kind);
      localStorage.setItem(SEEN_KEY, v.join(","));
    } catch (_) {}
  }

  window.GALLA_permPrime = function (kind) {
    /* ✂️ 26.9.21 사장님: 「중간에 이거 승인 저거 승인하면 안 된다」 — 기능 쓰는 도중에 우리 확인 시트를 한 번 더
       띄우지 않는다. 권한 설명은 첫 실행 권한 안내 화면에서 이미 했다. 바로 OS 권한 창으로 간다.
       (이미 거부된 권한을 설정에서 켜는 복구 시트 GALLA_permHelp 는 다른 길이 없어 그대로 둔다) */
    if (window.GALLA_PERM_PRIME_SHEET !== true) return Promise.resolve(true);
    kind = KINDS[kind] ? kind : "mic";
    var K = KINDS[kind];
    // 이미 투어에서 안내받았거나, 이 시트를 본 적 있으면 그냥 진행한다(두 번 설명하지 않는다)
    var already = false;
    try { already = localStorage.getItem(PRIMED_KEY) === "1"; } catch (_) {}
    if (already || seen(kind)) return Promise.resolve(true);

    css();
    markSeen(kind);
    return new Promise(function (resolve) {
      var back = document.createElement("div"); back.id = "gph-back";
      var sheet = document.createElement("div"); sheet.id = "gph";
      sheet.innerHTML =
        '<div class="gph-grip"></div>' +
        "<h3>" + K.icon + " " + K.name + " 권한을 켤게요</h3>" +
        '<p class="why">' + K.why + " 다음 화면에서 <b>허용</b>을 눌러주세요.<br>" +
          "허용하지 않으면 이 기능만 안 되고, 나머지는 그대로 쓸 수 있어요.</p>" +
        '<div class="gph-btns">' +
          '<button class="later" type="button">나중에</button>' +
          '<button class="go" type="button">허용할게요</button>' +
        "</div>";
      document.body.appendChild(back);
      document.body.appendChild(sheet);
      requestAnimationFrame(function () { back.classList.add("on"); sheet.classList.add("on"); });

      var done = function (v) { close(); resolve(v); };
      back.addEventListener("click", function () { done(false); });
      sheet.querySelector(".later").addEventListener("click", function () { done(false); });
      sheet.querySelector(".go").addEventListener("click", function () { done(true); });
    });
  };

  window.GALLA_permHelp = function (kind) {
    kind = KINDS[kind] ? kind : "mic";
    _kind = kind;
    var K = KINDS[kind];
    css();
    close();

    var native = isNative(), ios = isIOS();
    var steps;
    if (native) {
      steps = ios
        ? ["<b>설정 열기</b>를 누르면 갈라 설정 화면으로 갑니다", "<b>" + K.name + "</b>를 켜주세요", "돌아오면 자동으로 이어집니다"]
        : ["<b>설정 열기</b>를 누르면 갈라 앱 정보로 갑니다", "<b>권한</b> → <b>" + K.name + "</b>을(를) 허용으로", "돌아오면 자동으로 이어집니다"];
    } else if (ios) {
      steps = ["사파리 주소창 왼쪽 <b>ᴀA</b> 를 누르세요", "<b>웹 사이트 설정</b> → <b>" + K.name + "</b> → 허용", "이 페이지를 새로고침해 주세요"];
    } else {
      steps = ["주소창 왼쪽 <b>자물쇠</b> 아이콘을 누르세요", "<b>" + K.name + "</b> 를 허용으로 바꿔주세요", "이 페이지를 새로고침해 주세요"];
    }

    var back = document.createElement("div"); back.id = "gph-back";
    var sheet = document.createElement("div"); sheet.id = "gph";
    sheet.innerHTML =
      '<div class="gph-grip"></div>' +
      "<h3>" + K.icon + " " + K.name + " 권한이 꺼져 있어요</h3>" +
      '<p class="why">' + K.why + " 한 번 켜두면 다시 묻지 않아요.</p>" +
      "<ol>" + steps.map(function (t) { return "<li>" + t + "</li>"; }).join("") + "</ol>" +
      '<div class="gph-btns">' +
        '<button class="later" type="button">나중에</button>' +
        (native ? '<button class="go" type="button">설정 열기</button>' : '<button class="go" type="button">새로고침</button>') +
      "</div>";

    document.body.appendChild(back);
    document.body.appendChild(sheet);
    requestAnimationFrame(function () { back.classList.add("on"); sheet.classList.add("on"); });

    back.addEventListener("click", close);
    sheet.querySelector(".later").addEventListener("click", close);
    sheet.querySelector(".go").addEventListener("click", async function () {
      if (native) {
        var opened = await window.GALLA_openAppSettings();
        if (!opened) return;            // 못 열면 시트를 닫지 않는다(안내라도 남게)
        // 설정에 다녀오는 동안 감시 시작
        document.addEventListener("visibilitychange", onBack);
        _watch = setInterval(check, 1500);
      } else {
        location.reload();
      }
    });
  };
})();
