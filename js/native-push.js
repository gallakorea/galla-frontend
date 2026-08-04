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
    // 알림 탭 → 딥링크로 이동
    pn.addListener("pushNotificationActionPerformed", (a) => {
      try {
        const url = a && a.notification && a.notification.data && a.notification.data.url;
        if (url) (window.GALLA_nav || function (u) { location.href = u; })(url);
      } catch (_) {}
    });
  }

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
