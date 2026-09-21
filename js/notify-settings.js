/* 🔔 알림 설정 — 기능별 푸시 on/off + 방해금지(DND).
   window.GALLA_openNotifySettings() 로 오버레이 오픈. notify_prefs 테이블(본인 행 RLS)에 저장.
   카테고리는 send-push / push_allowed(uid,cat)와 1:1로 맞물린다. */
(function () {
  const sb = () => window.supabaseClient;
  const DEFAULTS = { dm: true, call: true, room: true, activity: true, pager: true, duel: true, friend: true, news: false, dnd_on: false, dnd_from: "23:00", dnd_to: "07:00", tz_off: 540, alert_sound: "galla", ring_sound: "galla" };
  /* 🔊 소리 고르기(26.9.20 사장님) — 이름은 파일 이름과 같다(assets/sound/alert-<이름>.wav,
     앱 번들의 alert-<이름>.caf / res/raw 의 alert_<이름>.ogg). 셋이 어긋나면 무음이 된다. */
  const ALERT_SOUNDS = [
    { k: "galla",  ic: "🔔", label: "갈라",   desc: "기본 — 짧은 3음" },
    { k: "space",  ic: "🛸", label: "우주 신호", desc: "솟아올라 반짝" },
    { k: "warp",   ic: "🌀", label: "워프",   desc: "훅 빨려 들어갔다 쿵" },
    { k: "laser",  ic: "🔫", label: "광선",   desc: "짧게 쏘고 튕김" },
    { k: "arcade", ic: "🕹", label: "오락실", desc: "동전 먹는 8비트" },
    { k: "pager",  ic: "📟", label: "삐삐",   desc: "90년대 삐삐삐" },
    { k: "bell",   ic: "🛎", label: "맑은 종", desc: "조용한 자리용" },
    { k: "boing",  ic: "🤪", label: "뿅",     desc: "스프링 튕기는 병맛" },
    { k: "quack",  ic: "🦆", label: "꽥",     desc: "오리 같은 병맛" },
  ];
  const RING_SOUNDS = [
    { k: "galla", ic: "🔔", label: "갈라",   desc: "3음 반복" },
    { k: "space", ic: "🛸", label: "우주선", desc: "호출 신호" },
    { k: "retro", ic: "☎️", label: "따르릉", desc: "옛날 전화" },
  ];
  /* 미리듣기 — 웹에선 wav 를 그대로 튼다(앱도 같은 파일이 번들에 있다) */
  let _preview = null;
  function preview(kind, name) {
    try {
      if (_preview) { _preview.pause(); _preview = null; }
      const v = window.GALLA_V ? "?v=" + window.GALLA_V : "";
      _preview = new Audio(`/assets/sound/${kind}-${name}.wav` + v);
      _preview.volume = 0.9;
      _preview.play().catch(() => {});
    } catch (_) {}
  }
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
      .nts-snd{margin-top:16px;border-top:1px solid rgba(255,255,255,.06);padding-top:12px}
      .nts-snd-h{font-size:13.5px;font-weight:900;color:#fff;margin-bottom:8px;display:flex;align-items:baseline;gap:6px}
      .nts-snd-h i{font-style:normal;font-size:11px;font-weight:700;color:#8a8f9a}
      .nts-snd-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}
      .nts-snd-b{display:flex;flex-direction:column;align-items:center;gap:2px;padding:10px 6px;border-radius:12px;cursor:pointer;
        background:#1c1d23;border:1px solid rgba(255,255,255,.08);color:#cfd6e6;transition:border-color .15s,background .15s,transform .1s}
      .nts-snd-b:active{transform:scale(.96)}
      .nts-snd-b.on{border-color:#3d6bff;background:linear-gradient(180deg,rgba(61,107,255,.22),rgba(61,107,255,.06));color:#fff}
      .nts-snd-b.on::after{content:"✓";position:absolute}
      .nts-snd-ic{font-size:19px;line-height:1}
      .nts-snd-b b{font-size:12.5px;font-weight:800}
      .nts-snd-d{font-size:10px;color:#8a8f9a;text-align:center;line-height:1.25}
      .nts-snd-b.on .nts-snd-d{color:#aebaff}
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
      <div class="nts-snd">
        <div class="nts-snd-h">🔊 알림음 <i>탭하면 들어볼 수 있어요</i></div>
        <div class="nts-snd-grid">
          ${ALERT_SOUNDS.map((x) => `
            <button type="button" class="nts-snd-b${prefs.alert_sound === x.k ? " on" : ""}" data-snd="alert" data-v="${x.k}">
              <span class="nts-snd-ic">${x.ic}</span><b>${x.label}</b><span class="nts-snd-d">${x.desc}</span>
            </button>`).join("")}
        </div>
        <div class="nts-snd-h" style="margin-top:14px">📞 전화 벨소리</div>
        <div class="nts-snd-grid">
          ${RING_SOUNDS.map((x) => `
            <button type="button" class="nts-snd-b${prefs.ring_sound === x.k ? " on" : ""}" data-snd="ring" data-v="${x.k}">
              <span class="nts-snd-ic">${x.ic}</span><b>${x.label}</b><span class="nts-snd-d">${x.desc}</span>
            </button>`).join("")}
        </div>
      </div>
      <button class="nts-close">닫기</button>`;
    /* 소리 고르기 — 누르면 바로 들려주고 저장한다(따로 확인 버튼을 두면 안 누른다) */
    sheet.querySelectorAll("[data-snd]").forEach((b) => {
      b.onclick = () => {
        const kind = b.dataset.snd, v = b.dataset.v;
        preview(kind, v);
        save(kind === "alert" ? { alert_sound: v } : { ring_sound: v });
        /* 전화 벨은 네이티브(CallKit)가 울린다 — 고른 값을 앱에 알려 둬야 다음 통화부터 반영된다 */
        if (kind === "ring") {
          try { window.webkit?.messageHandlers?.gallaCall?.postMessage({ action: "ringPick", v }); } catch (_) {}
        }
        sheet.querySelectorAll(`[data-snd="${kind}"]`).forEach((x) => x.classList.toggle("on", x === b));
      };
    });
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
      /* ⚠️ 이미 거부한 사람에게 requestPermissions() 를 또 부르면 OS 는 아무것도 안 띄운다.
         예전엔 그래서 버튼을 눌러도 화면만 다시 그려졌고, 사용자는 버튼이 고장난 줄 알았다.
         거부 상태면 요청 대신 '설정으로 가는 길'을 보여준다(26.9.21). */
      let st = "off";
      try { st = window.GALLA_pushStatus ? await window.GALLA_pushStatus() : "off"; } catch (_) {}
      if (st === "denied") { if (window.GALLA_permHelp) window.GALLA_permHelp("notify"); return; }

      let ok = false;
      if (isNative && window.GALLA_registerNativePush) {
        const r = await window.GALLA_registerNativePush();
        ok = !!(r && r.ok);
        if (!ok && r && r.reason === "denied" && window.GALLA_permHelp) { window.GALLA_permHelp("notify"); return; }
      } else {
        try { ok = (await Notification.requestPermission()) === "granted"; } catch (_) {}
        if (!ok && window.GALLA_permHelp) { window.GALLA_permHelp("notify"); return; }
      }
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
  function open() { dim.classList.add("open"); (void sheet.offsetWidth, sheet.classList.add("open")); }
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
