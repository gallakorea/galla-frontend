/* =========================================================
   perm-notice.js — 접근권한 고지 (26.9.21)
   ─────────────────────────────────────────────────────────
   ⚖️ 왜 필요한가 — 이건 디자인 선택이 아니라 법이다.
     정보통신망법 제22조의2 는 앱이 단말기 접근권한을 쓸 때
     ①필수 / ②선택 을 구분해 ③그 이유와 함께 ④미리 알리도록 강제한다.
     선택 권한은 동의하지 않아도 서비스를 쓸 수 있다는 것까지 알려야 한다.
     카카오톡이 설치 직후 띄우는 「접근권한 안내」 화면이 이 조항 때문이다.

   ✅ 26.9.21 사장님 결정: 고지만 하고 넘기면, 갈라톡을 쓰는 도중에 권한 창·「설정에서 켜 주세요」가
      기능마다 번갈아 떠서 UX 가 최악이었다. 그래서 「계속」으로 알림→마이크·카메라→위치를
      OS 권한 창으로 한 번에 묻는다. 선택 권한이라는 요건은 OS 창에서 거부해도 앱을 그대로 쓸 수
      있다는 것으로 충족한다(22조의2).

   🍎 26.9.25 애플 5.1.1(iv) 리젝 대응: 권한 요청 전 안내 화면은 ①버튼에 '허용/Allow' 같은 유도어를
      쓰면 안 되고(→「계속」), ②안내 뒤에는 반드시 OS 권한 요청으로 진행해야 한다(연기·건너뛰기 버튼
      「나중에 할게요」 제거). 선택권은 OS 권한 창의 '허용 안 함'으로 보장된다.

   네이티브 앱에서 최초 1회만. 웹은 대상이 아니다(단말 권한 고지 의무는 앱 대상).
   ========================================================= */
(function () {
  var KEY = "galla_perm_notice_v1";

  function isNative() {
    try { return !!(window.Capacitor && (window.Capacitor.isNativePlatform ? window.Capacitor.isNativePlatform() : window.Capacitor.isNative)); }
    catch (_) { return false; }
  }
  if (!isNative()) return;
  try { if (localStorage.getItem(KEY)) return; } catch (_) { return; }
  // 가입 직후 흐름을 끊지 않는다 — 온보딩과 겹치면 둘 다 방해가 된다
  try { if (localStorage.getItem("galla_fresh_signup")) return; } catch (_) {}

  var REQUIRED = [];   // 갈라는 필수 접근권한이 없다 — 권한 없이도 보고 읽을 수 있다
  /* k = 토글 키(없으면 OS 권한이 필요 없는 항목 — 사진은 올릴 때 고른 것만 넘어간다) */
  var OPTIONAL = [
    { k: "notify",   icon: "🔔", name: "알림",   why: "답글·귓속말·통화 알림 받기" },
    { k: "mic",      icon: "🎙", name: "마이크", why: "육성톡·음성 메시지·삐삐 녹음" },
    { k: "camera",   icon: "📷", name: "카메라", why: "면상톡(영상통화)·사진/영상 촬영" },
    { k: "location", icon: "📍", name: "위치",   why: "대화에서 위치 보내기·내 주변 맛집" },
    {                icon: "🖼", name: "사진",   why: "올릴 때 고른 사진만 넘어가요 · 따로 허용할 필요 없음" }
  ];

  function show() {
    var st = document.createElement("style");
    st.textContent =
      "#gpn{position:fixed;inset:0;z-index:2147481500;background:#0a0a0b;color:#e9edf6;overflow:auto;" +
        "font-family:-apple-system,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;" +
        "padding:calc(34px + env(safe-area-inset-top)) 22px calc(28px + env(safe-area-inset-bottom));" +
        "opacity:0;transition:opacity .28s ease}" +
      "#gpn.on{opacity:1}" +
      "#gpn h2{font-size:21px;font-weight:800;margin:0 0 10px;line-height:1.35}" +
      "#gpn .lead{font-size:13.5px;color:#98a2b8;line-height:1.65;margin:0 0 26px}" +
      "#gpn h3{font-size:12px;font-weight:700;color:#7f8aa3;letter-spacing:.6px;margin:0 0 12px}" +
      "#gpn ul{list-style:none;margin:0 0 24px;padding:0}" +
      "#gpn li{display:flex;gap:13px;align-items:flex-start;padding:13px 0;border-bottom:1px solid #191d26}" +
      "#gpn li:last-child{border-bottom:0}" +
      "#gpn .ic{font-size:21px;line-height:1.2;width:28px;text-align:center;flex:none}" +
      "#gpn .nm{font-size:14.5px;font-weight:700;margin-bottom:3px}" +
      "#gpn .wy{font-size:12.5px;color:#8e97ab;line-height:1.5}" +
      "#gpn .note{font-size:12px;color:#6f7a93;line-height:1.7;background:#10131a;border-radius:12px;padding:14px 15px;margin-bottom:24px}" +
      "#gpn button{width:100%;border:0;border-radius:13px;padding:16px;font-size:15.5px;font-weight:800;" +
        "background:#2f6bff;color:#fff;font-family:inherit;cursor:pointer}" +
      "#gpn button:disabled{opacity:.7}";
    document.head.appendChild(st);

    var el = document.createElement("div");
    el.id = "gpn";
    el.setAttribute("role", "dialog");
    el.innerHTML =
      "<h2>갈라가 쓰는 권한을 알려드려요</h2>" +
      '<p class="lead">지금 한 번에 켜 두면 <b>갈라톡·통화 도중에 다시 묻지 않아요.</b><br>' +
        "켜지 않아도 갈라를 보고 읽는 데는 아무 지장이 없어요.</p>" +
      (REQUIRED.length
        ? "<h3>필수 접근권한</h3><ul>" + REQUIRED.map(row).join("") + "</ul>"
        : "") +
      "<h3>선택 접근권한</h3><ul>" + OPTIONAL.map(row).join("") + "</ul>" +
      '<div class="note">선택 권한은 동의하지 않아도 갈라를 이용할 수 있어요. ' +
        "다만 그 기능(통화·촬영·위치 보내기 등)은 쓸 수 없어요.<br>" +
        "허용한 뒤에도 <b>휴대폰 설정 → 갈라</b>에서 언제든 끌 수 있어요.</div>" +
      '<p class="lead" style="margin:-8px 0 14px;font-size:12px">계속을 누르면 항목마다 휴대폰 확인 창이 이어서 떠요. 각 창에서 허용하거나 허용하지 않을 수 있어요.</p>' +
      '<button type="button" class="gpn-go">계속</button>';

    function row(p) {
      return '<li><span class="ic">' + p.icon + '</span><div><div class="nm">' + p.name +
             '</div><div class="wy">' + p.why + "</div></div>" +
             "</li>";
    }

    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add("on"); });
    function close() {
      try { localStorage.setItem(KEY, "1"); } catch (_) {}
      el.classList.remove("on");
      setTimeout(function () { el.remove(); }, 300);
    }
    var go = el.querySelector(".gpn-go");

    go.addEventListener("click", async function () {
      go.disabled = true;
      // 토글 없이 전부 요청한다(사장님: 다 켜져 있어야 쓰기 편하다)
      var want = { notify: true, mic: true, camera: true, location: true };
      var res = await requestAll(want, function (t) { go.textContent = t; });
      try { localStorage.setItem("galla_perm_asked_all", JSON.stringify(res)); } catch (_) {}
      // 📊 결과 기록 — 어느 권한이 거절·실패되는지 기기별로 본다(첫 실행이라 비로그인일 수 있다)
      try { var c = window.supabaseClient; if (c) c.rpc("log_client_error", { p_kind: "perm-ask", p_message: JSON.stringify(res) + " ua=" + (/iphone/i.test(navigator.userAgent) ? "ios" : "android"), p_ver: "perm" }).then(function () {}, function () {}); } catch (_) {}
      close();
    });
  }

  /* 🔐 OS 권한 창을 차례로 — 하나가 실패·거부돼도 다음으로 넘어간다. 결과는 기록만 한다. */
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function withTimeout(p, ms) { return Promise.race([p, wait(ms).then(function () { return "timeout"; })]); }
  async function requestAll(want, label) {
    var res = {};
    var P = (window.Capacitor && window.Capacitor.Plugins) || {};
    // ① 알림 — OS 권한 창 먼저(로그인 전이어도 뜨게) → 로그인돼 있으면 토큰 등록까지
    if (want.notify) {
      label("알림 허용을 물어보는 중…");
      try {
        var PN = P.PushNotifications;
        if (PN && PN.requestPermissions) { var pr = await withTimeout(PN.requestPermissions(), 30000); res.notify = pr && pr.receive; }
        if (window.GALLA_pushEnable) { await withTimeout(window.GALLA_pushEnable().catch(function () {}), 15000); }
      } catch (_) { res.notify = "err"; }
      await wait(200);
    }
    // ② 마이크·카메라 — 권한만 받고 곧바로 끈다(한 번의 요청으로 OS 창이 이어서 뜬다)
    if (want.mic || want.camera) {
      label((want.mic && want.camera) ? "마이크·카메라 허용을 물어보는 중…" : want.mic ? "마이크 허용을 물어보는 중…" : "카메라 허용을 물어보는 중…");
      try {
        var md = navigator.mediaDevices;
        var gum = md && (md.__origGetUserMedia || md.getUserMedia);
        var stop = function (st) { try { st.getTracks().forEach(function (t) { t.stop(); }); } catch (_) {} };
        if (gum) {
          try { var s1 = await withTimeout(gum.call(md, { audio: !!want.mic, video: !!want.camera }), 40000); if (s1 && s1.getTracks) { stop(s1); res.media = "granted"; } else res.media = s1; }
          catch (e1) {
            res.mediaErr = (e1 && e1.name) || String(e1).slice(0, 30);
            // 카메라를 거부했으면 마이크만이라도
            if (want.mic && want.camera) { try { var s2 = await withTimeout(gum.call(md, { audio: true }), 30000); if (s2 && s2.getTracks) { stop(s2); res.media = "mic-only"; } } catch (e2) { res.media = "denied"; } }
            else res.media = "denied";
          }
        }
      } catch (_) { res.media = "err"; }
      await wait(200);
    }
    // ③ 위치 — 권한만 묻는다(좌표를 기다리지 않는다: 실내·에뮬에선 20초씩 걸렸다)
    if (want.location) {
      label("위치 허용을 물어보는 중…");
      try {
        var G = P.Geolocation;
        if (G && G.requestPermissions) { var gr = await withTimeout(G.requestPermissions({ permissions: ["location"] }), 30000); res.location = gr && (gr.location || gr.coarseLocation); }
        else if (window.GALLA_getPosition) { await withTimeout(window.GALLA_getPosition({ timeout: 8000 }), 10000); res.location = "granted"; }
      } catch (e3) { res.location = (e3 && e3.kind) || "denied"; }
    }
    return res;
  }

  /* 언제 띄우나
       ① 스플래시가 내려간 뒤 — 첫 화면부터 덮으면 앱이 뭘 하는 곳인지 못 보고 판단하게 된다
       ② 온보딩 투어가 떠 있으면 그게 끝나기를 기다린다.
          투어(z-index 2147483000)가 이 화면보다 위라, 동시에 띄우면 고지가 뒤에 깔려
          사용자는 본 적도 없는데 '봤음' 처리된다(26.9.21 에뮬 실측으로 잡음).
       ③ 권한을 실제로 요청하기 전이기만 하면 되므로, 투어 뒤라도 고지 의무는 지켜진다. */
  function tourUp() { return !!document.querySelector(".gtour"); }
  /* 투어가 '올 예정'인지 — 투어는 뜨는 순간 galla_tour_v2 를 찍는다. 이 값이 비어 있으면
     투어가 아직 안 왔다는 뜻이다. ⚠️ 이걸 안 보면 투어가 늦게 로드될 때(홈 탭 지연 로드)
     고지가 먼저 뜨고 그 위로 투어가 또 덮여 팝업이 두 번 연달아 뜬다(26.9.21 에뮬 재현 —
     첫 시도엔 투어→고지, 두 번째 시도엔 고지→투어로 순서가 로딩 속도에 따라 뒤바뀌었다). */
  function tourPending() {
    try { return !localStorage.getItem("galla_tour_v2") && !localStorage.getItem("galla_fresh_signup"); }
    catch (_) { return false; }
  }
  function boot() {
    var tries = 0, waitedForTour = 0;
    (function wait() {
      if (++tries > 600) return;                 // 10분이면 포기(무한 폴링 방지)
      if (tourUp()) return setTimeout(wait, 1000);
      // 투어가 아직 안 왔으면 조금 기다린다 — 단, 15초가 지나도 안 오면 투어 대상이 아닌 것으로 본다
      if (tourPending() && waitedForTour < 15) { waitedForTour++; return setTimeout(wait, 1000); }
      setTimeout(function () { if (!tourUp()) show(); }, 900);
    })();
  }
  if (document.readyState === "complete") boot();
  else window.addEventListener("load", boot, { once: true });
})();
