/* 🔔 알림 설정 — 기능별 푸시 on/off + 방해금지(DND).
   window.GALLA_openNotifySettings() 로 오버레이 오픈. notify_prefs 테이블(본인 행 RLS)에 저장.
   카테고리는 send-push / push_allowed(uid,cat)와 1:1로 맞물린다. */
(function () {
  const sb = () => window.supabaseClient;
  const DEFAULTS = { dm: true, call: true, room: true, activity: true, pager: true, duel: true, friend: true, news: false, dnd_on: false, dnd_from: "23:00", dnd_to: "07:00", tz_off: 540 };
  const CATS = [
    { k: "dm", ic: "💬", label: "채팅", desc: "DM 메시지 오면" },
    { k: "call", ic: "📞", label: "통화", desc: "육성톡·면상톡 걸려오면" },
    { k: "room", ic: "🎙", label: "난장·단체", desc: "라이브·단체방 소식" },
    { k: "pager", ic: "📟", label: "삐삐", desc: "음성사서함 호출 오면" },
    { k: "duel", ic: "⚔️", label: "대결", desc: "일기토 도전·판정" },
    { k: "activity", ic: "🔔", label: "활동", desc: "팔로우·댓글·후원·예측결과" },
    { k: "friend", ic: "🧡", label: "친구 선톡", desc: "갈비스가 먼저 말 걸면" },
    { k: "news", ic: "📰", label: "갈라뉴스 속보", desc: "기본 꺼짐 — 켜면 속보가 옴" },
  ];
  let dim, sheet, prefs = { ...DEFAULTS }, uid = null;

  function css() {
    if (document.getElementById("nts-css")) return;
    const s = document.createElement("style"); s.id = "nts-css";
    s.textContent = `
      .nts-dim{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:12000;opacity:0;pointer-events:none;transition:opacity .2s}
      .nts-dim.open{opacity:1;pointer-events:auto}
      .nts-sheet{position:fixed;left:0;right:0;bottom:0;z-index:12001;background:#15161b;border-radius:20px 20px 0 0;
        border-top:1px solid rgba(255,255,255,.1);padding:16px 16px calc(18px + env(safe-area-inset-bottom));max-width:520px;margin:0 auto;
        transform:translateY(100%);transition:transform .26s cubic-bezier(.2,.8,.2,1);max-height:90vh;overflow:auto}
      .nts-sheet.open{transform:translateY(0)}
      .nts-grip{width:38px;height:4px;border-radius:2px;background:rgba(255,255,255,.25);margin:2px auto 12px}
      .nts-title{font-weight:900;font-size:18px;color:#fff;text-align:center}
      .nts-sub{font-size:12.5px;color:#8a8f9a;text-align:center;margin:5px 0 14px}
      .nts-row{display:flex;align-items:center;gap:12px;padding:12px 4px;border-top:1px solid rgba(255,255,255,.06)}
      .nts-ic{font-size:22px;width:30px;text-align:center}
      .nts-txt{flex:1;min-width:0} .nts-txt b{font-size:14.5px;color:#fff;font-weight:800;display:block}
      .nts-txt span{font-size:12px;color:#8a8f9a}
      .nts-sw{width:46px;height:28px;border-radius:15px;background:#3a3c44;position:relative;flex:none;cursor:pointer;transition:background .18s}
      .nts-sw.on{background:#3d6bff}
      .nts-sw::after{content:"";position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#fff;transition:transform .18s}
      .nts-sw.on::after{transform:translateX(18px)}
      .nts-dnd{margin-top:14px;background:#1c1d23;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:12px 14px}
      .nts-dnd-times{display:flex;align-items:center;gap:8px;margin-top:10px;color:#c9d1e0;font-size:13px}
      .nts-dnd-times input{background:#0e0f13;border:1px solid rgba(255,255,255,.12);border-radius:8px;color:#fff;padding:6px 8px;font-size:14px}
      .nts-close{width:100%;padding:14px;margin-top:14px;border:none;border-radius:12px;font-weight:900;font-size:15px;cursor:pointer;background:#2a2b31;color:#fff}
      .nts-perm{background:linear-gradient(135deg,#ff6a88,#ff4d6d);color:#fff;border-radius:12px;padding:10px 12px;font-size:12.5px;font-weight:800;text-align:center;margin-bottom:12px;cursor:pointer}
    `;
    document.head.appendChild(s);
  }
  const swHTML = (on) => `<div class="nts-sw${on ? " on" : ""}"></div>`;

  function render() {
    const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    // 네이티브: 항상 '알림 켜기'(권한/토큰 등록) 노출 · 웹: 권한 미결정일 때만
    const needPerm = isNative || (("Notification" in window) && Notification.permission === "default");
    sheet.innerHTML = `
      <div class="nts-grip"></div>
      <div class="nts-title">🔔 알림 설정</div>
      <div class="nts-sub">받고 싶은 것만 골라 — 시끄러운 건 꺼도 됨</div>
      ${needPerm ? `<div class="nts-perm" data-perm>📱 잠금화면 알림 켜기 — 탭해서 허용</div>` : ""}
      ${CATS.map((c) => `
        <div class="nts-row" data-k="${c.k}">
          <span class="nts-ic">${c.ic}</span>
          <span class="nts-txt"><b>${c.label}</b><span>${c.desc}</span></span>
          ${swHTML(prefs[c.k] !== false)}
        </div>`).join("")}
      <div class="nts-dnd">
        <div class="nts-row" data-k="dnd_on" style="border:0;padding:2px 0">
          <span class="nts-ic">🌙</span>
          <span class="nts-txt"><b>방해금지 시간</b><span>이 시간엔 알림 안 옴</span></span>
          ${swHTML(!!prefs.dnd_on)}
        </div>
        <div class="nts-dnd-times">
          <input type="time" data-t="from" value="${prefs.dnd_from || "23:00"}"> ~
          <input type="time" data-t="to" value="${prefs.dnd_to || "07:00"}">
        </div>
      </div>
      <button class="nts-close">닫기</button>`;
    // 토글
    sheet.querySelectorAll(".nts-row").forEach((row) => {
      const k = row.dataset.k; const sw = row.querySelector(".nts-sw");
      if (!sw) return;
      sw.onclick = () => { const on = !sw.classList.contains("on"); sw.classList.toggle("on", on); save({ [k]: on }); };
    });
    sheet.querySelectorAll(".nts-dnd-times input").forEach((inp) => {
      inp.onchange = () => save(inp.dataset.t === "from" ? { dnd_from: inp.value } : { dnd_to: inp.value });
    });
    const perm = sheet.querySelector("[data-perm]");
    if (perm) perm.onclick = async () => {
      if (isNative && window.GALLA_registerNativePush) { await window.GALLA_registerNativePush(); }
      else { try { await Notification.requestPermission(); } catch (_) {} }
      render();
    };
    sheet.querySelector(".nts-close").onclick = close;
  }

  async function save(patch) {
    Object.assign(prefs, patch);
    if (!uid) return;
    try {
      await sb().from("notify_prefs").upsert(
        { user_id: uid, ...prefs, tz_off: -new Date().getTimezoneOffset(), updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    } catch (e) { /* 저장 실패해도 UI는 유지 */ }
  }
  function open() { dim.classList.add("open"); requestAnimationFrame(() => sheet.classList.add("open")); }
  function close() { sheet.classList.remove("open"); dim.classList.remove("open"); }

  window.GALLA_openNotifySettings = async function () {
    css();
    if (!sheet) {
      dim = document.createElement("div"); dim.className = "nts-dim";
      sheet = document.createElement("div"); sheet.className = "nts-sheet";
      document.body.appendChild(dim); document.body.appendChild(sheet);
      dim.addEventListener("click", close);
    }
    try {
      const { data: { user } } = await sb().auth.getUser();
      uid = user?.id || null;
      if (uid) {
        const { data } = await sb().from("notify_prefs").select("*").eq("user_id", uid).maybeSingle();
        prefs = { ...DEFAULTS, ...(data || {}) };
      }
    } catch (_) { prefs = { ...DEFAULTS }; }
    render(); open();
  };

  // 🔗 설정의 '알림' 타일 위임 바인딩 — settings.js 초기화 타이밍·SPA 재렌더와 무관하게 항상 작동.
  document.addEventListener("click", (e) => {
    const t = e.target && e.target.closest && e.target.closest("#notifyTile");
    if (t) { e.preventDefault(); e.stopPropagation(); window.GALLA_openNotifySettings(); }
  }, true);
})();
