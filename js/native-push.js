/* 📱 native-push.js — 네이티브 iOS 표준 알림 토큰(APNs) 등록 → native_push_tokens 저장.
   웹은 web-push(VAPID)를 쓰지만 네이티브 WKWebView는 웹푸시를 못 받으므로 여기서 APNs 토큰을 받는다.
   window.GALLA_registerNativePush() 로 권한요청+등록. 이미 허용돼 있으면 조용히 토큰만 갱신. */
(function () {
  const Cap = window.Capacitor;
  const isNative = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
  const PN = () => Cap && Cap.Plugins && Cap.Plugins.PushNotifications;

  let _bound = false;
  function bindListeners() {
    const pn = PN(); if (!pn || _bound) return; _bound = true;
    // 토큰 발급 → DB 저장
    pn.addListener("registration", async (t) => {
      try {
        const token = t && t.value; if (!token) return;
        const sb = window.supabaseClient; if (!sb) return;
        const { data: { user } } = await sb.auth.getUser();
        if (!user) return;
        await sb.from("native_push_tokens").upsert(
          { user_id: user.id, platform: "ios", token, updated_at: new Date().toISOString() },
          { onConflict: "user_id,platform" },
        );
      } catch (_) { /* 저장 실패 무시 */ }
    });
    pn.addListener("registrationError", () => { /* 등록 실패 — 조용히 */ });
  }

  /* 🔔 알림 탭 — ⚠️ 이건 로그인·DB 준비를 기다리면 안 된다.
     콜드 스타트(앱이 꺼진 상태에서 푸시 탭)에서는 iOS가 실행 직후 이 이벤트를 던진다.
     예전엔 bindListeners()가 supabaseClient+로그인 대기 뒤에 붙어서 그때쯤엔
     이벤트가 이미 지나가 있었다 — 그래서 "푸시 눌러도 안 감"(사장님 재현).
     그래서 탭 리스너만 스크립트 로드 시점에 따로 붙인다. */
  let _tapBound = false;
  function bindTap() {
    const pn = PN(); if (!pn || _tapBound) return; _tapBound = true;
    pn.addListener("pushNotificationActionPerformed", (a) => {
      try { handleTap((a && a.notification && a.notification.data && a.notification.data.url) || ""); }
      catch (_) {}
    });
  }

  function handleTap(url) {
    if (!url) return;
    /* 📮 갈비스 선톡 — 페이지 이동을 하지 않는다.
       네이티브는 앱 안에 www를 번들로 들고 있어 '/app.html?...' 로 재이동하면
       콜드 스타트 중 흰 화면에서 멈춘다(사장님 재현). 패널만 직접 연다. */
    if (/frping=1/.test(url)) { openFriendWhenReady(); return; }
    (window.GALLA_nav || function (u) { location.href = u; })(url);
  }

  // friend.js 가 아직 안 떴을 수 있다 — 플래그로 남기고 뜰 때까지 짧게 재시도한다.
  function openFriendWhenReady() {
    try { sessionStorage.setItem("galla:frping", "1"); } catch (_) {}
    let n = 0;
    (function tick() {
      if (typeof window.GALLA_openFriend === "function") {
        try { sessionStorage.removeItem("galla:frping"); } catch (_) {}
        window.GALLA_openFriend();
        return;
      }
      if (++n < 40) setTimeout(tick, 250);   // 최대 10초 대기 후 포기(플래그는 남는다)
    })();
  }
  window.GALLA_handlePushUrl = handleTap;   // 테스트·다른 진입로에서도 쓸 수 있게

  // 권한 요청 + 등록. 이미 로그인돼 있어야 토큰이 유저에 붙는다.
  window.GALLA_registerNativePush = async function () {
    if (!isNative) return { ok: false, reason: "not_native" };
    const pn = PN(); if (!pn) return { ok: false, reason: "no_plugin" };
    try {
      bindListeners();
      let perm = await pn.checkPermissions();
      if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") perm = await pn.requestPermissions();
      if (perm.receive !== "granted") return { ok: false, reason: "denied" };
      await pn.register();   // 'registration' 리스너가 토큰 저장
      return { ok: true };
    } catch (e) { return { ok: false, reason: String(e).slice(0, 80) }; }
  };

  if (isNative) bindTap();   // ⬅️ 로그인 여부와 무관하게 즉시(콜드 스타트 대비)

  /* 현재 알림 권한 상태 — push.js 가 네이티브/웹을 갈라 쓰려면 필요하다. */
  window.GALLA_nativePushStatus = async function () {
    if (!isNative) return "unsupported";
    const pn = PN(); if (!pn) return "unsupported";
    try {
      const perm = await pn.checkPermissions();
      if (perm.receive === "granted") return "on";
      if (perm.receive === "denied") return "denied";
      return "off";
    } catch (_) { return "off"; }
  };

  // 이미 권한 허용된 유저는 앱 켤 때(로그인 상태) 조용히 토큰 갱신 — 토큰은 주기적으로 바뀔 수 있다.
  async function silentRefresh() {
    if (!isNative) return;
    const pn = PN(); if (!pn) return;
    try {
      const perm = await pn.checkPermissions();
      if (perm.receive === "granted") { bindListeners(); await pn.register(); }
    } catch (_) {}
  }
  // 로그인 후에 실행되도록 약간 지연 + supabaseClient 준비 대기
  if (isNative) {
    let tries = 0;
    const iv = setInterval(() => {
      tries++;
      if (window.supabaseClient || tries > 20) { clearInterval(iv); silentRefresh(); }
    }, 500);
  }
})();
