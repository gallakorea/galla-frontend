/* 🛰 갈라 관제 앱 셸 — 로그인·아래 탭·알림 켜기·미확인 표시.
   화면(모듈)은 /js/admin.js 가 그린다(관제 앱 모드: 주소창 #/모듈 로 이동, 뒤로 가기 동작).
   ⚠️ 이 앱은 갈라 앱(네이티브·메인 웹)에서 열리지 않는다 — 위기·신고 알림도 여기로만 온다(26.9.22 사장님). */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const VAPID = "BDbFS8TJV78UIPq6qqv7VprrtRAMRxSA5kB8KNJe8oUlK8r1DBiUlMB-wf4vhJTw3K7TRSVW_YLSLTuppXlYVFs";
  let sb = null, me = null, swReg = null;

  // 갈라 네이티브 앱 안에서 열렸으면 거절한다(관리자 화면은 앱에서 안 연다)
  try {
    if (window.Capacitor && (window.Capacitor.isNativePlatform ? window.Capacitor.isNativePlatform() : true)) {
      document.documentElement.innerHTML = "<body style='background:#0a0a0b;color:#ccc;font:15px system-ui;padding:40px;text-align:center'>관제는 갈라 앱에서 열 수 없어요.</body>";
      throw new Error("ops blocked in native app");
    }
  } catch (e) { if (String(e.message).includes("blocked")) throw e; }

  // 관제 앱 전용 서비스워커(scope /ops/) — 알림만 받는다(캐시 없음)
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/ops/sw.js", { scope: "/ops/" }).then((r) => { swReg = r; paintPushBtn(); }).catch(() => {});
  }

  /* 로그인 — admin.js 가 세션·권한이 없을 때 부른다 */
  window.OPS_showLogin = function () {
    const g = $("#admin-gate"); if (g) g.hidden = true;
    $("#ops-login").hidden = false;
    setTimeout(() => { try { $("#ops-email").focus(); } catch (_) {} }, 50);
  };
  $("#ops-login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#ops-go"), err = $("#ops-err");
    err.textContent = ""; btn.disabled = true; btn.textContent = "확인 중…";
    try {
      const c = await waitForSupabaseClient();
      const { data, error } = await c.auth.signInWithPassword({ email: $("#ops-email").value.trim(), password: $("#ops-pw").value });
      if (error) throw new Error("login");
      const { data: p } = await c.from("user_profiles").select("admin_flag").eq("user_id", data.user.id).maybeSingle();
      if (!p || !p.admin_flag) { await c.auth.signOut(); err.textContent = "관리자 권한이 없는 계정이에요."; btn.disabled = false; btn.textContent = "입장"; return; }
      try { sessionStorage.removeItem("__adminBounce"); } catch (_) {}
      location.reload();
    } catch (_) {
      err.textContent = "이메일 또는 비밀번호가 맞지 않아요."; btn.disabled = false; btn.textContent = "입장";
    }
  });

  /* admin.js 가 입장 완료 후 부른다 */
  window.OPS_ready = function (client, uid) {
    sb = client; me = uid;
    document.querySelectorAll(".ops-tab").forEach((b) => b.addEventListener("click", () => {
      if (b.dataset.mod === "__menu") { $("#ad-sidebar").classList.add("open"); $("#ad-scrim").classList.add("show"); return; }
      window.OPS_nav && window.OPS_nav(b.dataset.mod);
    }));
    $("#ops-logout").onclick = async () => { try { await sb.auth.signOut(); } catch (_) {} location.reload(); };
    paintPushBtn(); badge(); setInterval(badge, 30000);
    // 새 관제 알림 실시간 — 앱이 열려 있으면 바로 표시
    try {
      sb.channel("ops-alerts").on("postgres_changes", { event: "INSERT", schema: "public", table: "ops_alerts" }, (p) => {
        badge();
        const a = p && p.new; if (!a) return;
        const t = document.createElement("div"); t.className = "ops-live k-" + a.kind; t.textContent = a.message;
        t.onclick = () => { window.OPS_nav && window.OPS_nav(a.kind === "crisis" ? "crisis" : "alerts"); t.remove(); };
        document.body.appendChild(t); setTimeout(() => t.remove(), 9000);
      }).subscribe();
    } catch (_) {}
  };

  /* 미확인 표시(아래 탭 점) */
  async function badge() {
    if (!sb) return;
    try {
      const { data } = await sb.from("ops_alerts").select("kind").is("read_at", null).limit(200);
      const n = (data || []).length, nc = (data || []).filter((a) => a.kind === "crisis").length;
      $("#ops-dot-alerts").hidden = !n; $("#ops-dot-crisis").hidden = !nc;
      try { if (navigator.setAppBadge) n ? navigator.setAppBadge(n) : navigator.clearAppBadge(); } catch (_) {}
    } catch (_) {}
  }
  window.OPS_badge = badge;

  /* 🔔 알림 켜기 — 관제 앱 구독만 ops_push_subs 에 저장(갈라 앱 알림과 완전히 분리) */
  const b64 = (s) => { const p = "=".repeat((4 - (s.length % 4)) % 4); const r = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from([...r].map((c) => c.charCodeAt(0))); };
  async function paintPushBtn() {
    const btn = $("#ops-push"); if (!btn || !swReg || !sb || !("PushManager" in window)) return;
    const sub = await swReg.pushManager.getSubscription().catch(() => null);
    const on = sub && Notification.permission === "granted";
    btn.hidden = false;
    btn.textContent = on ? "🔔 알림 켜짐" : "🔕 알림 켜기";
    btn.classList.toggle("on", !!on);
    btn.onclick = async () => {
      try {
        if (Notification.permission !== "granted") { const r = await Notification.requestPermission(); if (r !== "granted") { btn.textContent = "🔕 알림 차단됨"; return; } }
        const s = (await swReg.pushManager.getSubscription()) || (await swReg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(VAPID) }));
        const j = s.toJSON();
        const { error } = await sb.from("ops_push_subs").upsert({ endpoint: j.endpoint, user_id: me, p256dh: j.keys.p256dh, auth: j.keys.auth });
        if (error) throw error;
        btn.textContent = "🔔 알림 켜짐"; btn.classList.add("on");
      } catch (e) { btn.textContent = "알림 설정 실패 — 다시 눌러주세요"; }
    };
  }
})();
