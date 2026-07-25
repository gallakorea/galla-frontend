/* ============================================================================
   🎙 라이브 난장 (클럽하우스식 라이브 음성) — 무대 UI + 역할 + 실시간 동기화
   ----------------------------------------------------------------------------
   · 난장 탭 상단에 "🔴 지금 라이브" 섹션 + [라이브 열기] 주입
   · 방 개설/입장 → 전체화면 무대 오버레이(호스트/스피커 무대 + 청중 + 손들기/승격)
   · 역할·프레즌스는 live_* RPC + Supabase Realtime broadcast 동기화
   · 실제 음성은 Cloudflare Calls SFU(rtc-sfu 엣지) — 미설정이면 '음성 준비중'으로 후퇴
   · 후원은 GC(현금성) — 게임 GP와 분리(추후 슈퍼챗)
   ========================================================================== */
(function () {
  if (document.body.getAttribute("data-page") !== "dm") return;
  const sb = () => window.supabaseClient;
  let ME = null;
  let CUR = null;          // { room, channel, state, role, muted, hand, audio }
  let refreshTimer = null;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  function toast(m) { try { if (window.GALLA_toast) window.GALLA_toast(m); } catch (e) {} }
  function avatar(u) { return u ? `<img src="${esc(u)}" alt="">` : `<span class="lv-ava-none">🙂</span>`; }

  /* ── 난장 탭 상단 LIVE 섹션 주입 ─────────────────────────────────────────── */
  async function refreshSection() {
    const rooms = document.getElementById("dm-rooms");
    if (!rooms) return;
    let sec = document.getElementById("dm-live-sec");
    if (!sec) {
      sec = document.createElement("div");
      sec.id = "dm-live-sec";
      const list = document.getElementById("dm-room-list");
      rooms.insertBefore(sec, list || null);
    }
    let rows = [];
    try { const { data } = await sb().rpc("list_live_rooms"); rows = data || []; } catch (e) {}
    const cards = rows.map(r => `
      <button class="lv-card" data-room="${r.id}" type="button">
        <span class="lv-live-badge">🔴 LIVE</span>
        <span class="lv-card-mid">
          <b class="lv-card-title">${esc(r.title)}</b>
          ${r.topic ? `<span class="lv-card-topic">${esc(r.topic)}</span>` : ""}
          <span class="lv-card-meta">🎙 ${r.speakers || 0} · 👥 ${r.listeners || 0}명 · ${esc(r.host_nick || "호스트")}</span>
        </span>
        <span class="lv-card-go">▶</span>
      </button>`).join("");
    sec.innerHTML = `
      <div class="lv-sec-head">
        <span class="lv-sec-t">🎙 라이브 난장</span>
        <button class="lv-open-btn" id="lv-open" type="button">＋ 라이브 열기</button>
      </div>
      ${rows.length ? `<div class="lv-cards">${cards}</div>` : `<div class="lv-empty">지금 열린 라이브가 없어요. 직접 무대를 열어보세요 🎤</div>`}`;
    sec.querySelector("#lv-open").onclick = createLive;
    sec.querySelectorAll(".lv-card").forEach(b => b.onclick = () => joinLive(b.dataset.room));
    ensureCSS();
  }

  async function createLive() {
    const title = (prompt("라이브 난장 제목 (예: 오늘 이슈 토크)") || "").trim();
    if (!title) return;
    const topic = (prompt("주제 한 줄 (선택)") || "").trim();
    try {
      const { data: id, error } = await sb().rpc("live_room_create", { p_title: title, p_topic: topic });
      if (error || !id) return toast("라이브 개설에 실패했어요.");
      openStage(id, title, topic);
    } catch (e) { toast("라이브 개설에 실패했어요."); }
  }

  async function joinLive(roomId) {
    try {
      const { data } = await sb().rpc("live_join", { p_room: roomId });
      if (!data || !data.ok) return toast(data && data.reason === "ended" ? "이미 끝난 라이브예요." : "입장에 실패했어요.");
      // 제목은 목록에서 못 가져왔을 수 있으니 상태에서 채운다
      openStage(roomId, "", "");
    } catch (e) { toast("입장에 실패했어요."); }
  }

  /* ── 무대 오버레이 ───────────────────────────────────────────────────────── */
  function openStage(roomId, title, topic) {
    ensureCSS();
    closeStage(true);
    const ov = document.createElement("div");
    ov.id = "lv-stage";
    ov.innerHTML = `
      <div class="lv-top">
        <div class="lv-top-info"><span class="lv-live-badge">🔴 LIVE</span><b id="lv-title">${esc(title || "라이브 난장")}</b>
          <div id="lv-topic" class="lv-topic">${esc(topic || "")}</div></div>
        <button class="lv-x" id="lv-x" aria-label="나가기">✕</button>
      </div>
      <div class="lv-audio-note" id="lv-audio-note" hidden></div>
      <div class="lv-stage-body">
        <div class="lv-stage-label">무대</div>
        <div class="lv-speakers" id="lv-speakers"></div>
        <div class="lv-aud-label">청중 <span id="lv-aud-n">0</span></div>
        <div class="lv-audience" id="lv-audience"></div>
      </div>
      <div class="lv-bar" id="lv-bar"></div>`;
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add("on"));
    ov.querySelector("#lv-x").onclick = () => leave();

    CUR = { roomId, role: "listener", muted: true, hand: false, state: [], channel: null, audio: null };
    // 실시간 동기화 채널
    try {
      CUR.channel = sb().channel("live:" + roomId, { config: { broadcast: { self: false } } });
      CUR.channel.on("broadcast", { event: "sync" }, () => refreshState());
      CUR.channel.subscribe();
    } catch (e) {}
    refreshState();
    refreshTimer = setInterval(refreshState, 4000);   // 안전망 폴링
    connectAudio();   // 음성(있으면), 없으면 '준비중' 표시
  }

  function broadcastSync() { try { CUR && CUR.channel && CUR.channel.send({ type: "broadcast", event: "sync", payload: {} }); } catch (e) {} }

  async function refreshState() {
    if (!CUR) return;
    let rows = [];
    try { const { data } = await sb().rpc("live_room_state", { p_room: CUR.roomId }); rows = data || []; } catch (e) {}
    if (!CUR) return;
    // 방이 사라졌거나(종료) 내가 빠졌으면 닫기
    const me = rows.find(r => r.user_id === ME);
    if (!rows.length) { toast("라이브가 종료됐어요."); return closeStage(); }
    CUR.state = rows;
    if (me) { CUR.role = me.role; CUR.muted = me.muted; CUR.hand = me.hand_raised; }
    render();
  }

  function render() {
    const ov = document.getElementById("lv-stage"); if (!ov || !CUR) return;
    const st = CUR.state;
    const isHost = CUR.role === "host";
    const t = st.find(r => r.role === "host");
    const titleEl = ov.querySelector("#lv-title");
    const speakers = st.filter(r => r.role === "host" || r.role === "speaker");
    const listeners = st.filter(r => r.role === "listener");

    ov.querySelector("#lv-speakers").innerHTML = speakers.map(s => `
      <button class="lv-person lv-spk ${s.muted ? "muted" : "on"}" data-uid="${s.user_id}" type="button">
        <span class="lv-ava ${!s.muted ? "talk" : ""}">${avatar(s.avatar_url)}${s.role === "host" ? '<i class="lv-crown">👑</i>' : ""}
          <i class="lv-mic">${s.muted ? "🔇" : "🎙"}</i></span>
        <span class="lv-name">${esc(s.nickname || "익명")}</span>
      </button>`).join("");
    ov.querySelector("#lv-aud-n").textContent = listeners.length;
    ov.querySelector("#lv-audience").innerHTML = listeners.map(s => `
      <button class="lv-person lv-lis" data-uid="${s.user_id}" type="button">
        <span class="lv-ava sm">${avatar(s.avatar_url)}${s.hand_raised ? '<i class="lv-hand">✋</i>' : ""}</span>
        <span class="lv-name">${esc(s.nickname || "익명")}</span>
      </button>`).join("");

    // 사람 클릭 — 호스트만 모더(승격/강등/뮤트/강퇴)
    ov.querySelectorAll(".lv-person").forEach(b => b.onclick = () => { if (isHost) hostMenu(b.dataset.uid); });

    // 하단 바
    const bar = ov.querySelector("#lv-bar");
    const canSpeak = CUR.role === "host" || CUR.role === "speaker";
    let html = "";
    if (canSpeak) {
      html += `<button class="lv-bbtn ${CUR.muted ? "" : "act"}" id="lv-mute">${CUR.muted ? "🔇 뮤트됨" : "🎙 말하는 중"}</button>`;
    } else {
      html += `<button class="lv-bbtn ${CUR.hand ? "act" : ""}" id="lv-hand">${CUR.hand ? "✋ 손 든 상태" : "✋ 손들기"}</button>`;
    }
    if (isHost) html += `<button class="lv-bbtn danger" id="lv-end">🔴 라이브 종료</button>`;
    html += `<button class="lv-bbtn" id="lv-leave">나가기</button>`;
    bar.innerHTML = html;
    const mb = bar.querySelector("#lv-mute"); if (mb) mb.onclick = toggleMute;
    const hb = bar.querySelector("#lv-hand"); if (hb) hb.onclick = toggleHand;
    const eb = bar.querySelector("#lv-end"); if (eb) eb.onclick = endRoom;
    bar.querySelector("#lv-leave").onclick = leave;
  }

  async function hostMenu(uid) {
    if (!CUR || uid === ME) return;
    const s = CUR.state.find(r => r.user_id === uid); if (!s || s.role === "host") return;
    const isSpk = s.role === "speaker";
    const act = prompt(`${s.nickname || "이 사람"} — 1: ${isSpk ? "청중으로 내리기" : "스피커로 올리기"}  2: ${s.muted ? "" : "뮤트"}  3: 강퇴\n번호 입력:`);
    if (act === "1") {
      const { data } = await sb().rpc("live_set_role", { p_room: CUR.roomId, p_target: uid, p_role: isSpk ? "listener" : "speaker" });
      if (data && !data.ok && data.reason === "full") toast("무대가 꽉 찼어요.");
      broadcastSync(); refreshState();
    } else if (act === "2" && !s.muted) {
      await sb().rpc("live_set_mute", { p_room: CUR.roomId, p_target: uid, p_muted: true });
      broadcastSync(); refreshState();
    } else if (act === "3") {
      // 강퇴 = 멤버 삭제(호스트 권한). RLS상 본인만 지우므로 서버 함수로 처리 대신 역할 강등+안내(MVP)
      toast("강퇴는 곧 지원돼요 — 지금은 청중 강등만 가능해요.");
    }
  }

  async function toggleMute() {
    if (!CUR) return;
    const next = !CUR.muted;
    CUR.muted = next; render();
    try { await sb().rpc("live_set_mute", { p_room: CUR.roomId, p_target: ME, p_muted: next }); } catch (e) {}
    if (CUR.audio && CUR.audio.setMuted) CUR.audio.setMuted(next);
    broadcastSync();
  }
  async function toggleHand() {
    if (!CUR) return;
    const next = !CUR.hand; CUR.hand = next; render();
    try { await sb().rpc("live_raise_hand", { p_room: CUR.roomId, p_on: next }); } catch (e) {}
    broadcastSync();
    if (next) toast("✋ 손을 들었어요 — 호스트가 무대로 올려줄 수 있어요.");
  }
  async function endRoom() {
    if (!CUR || !confirm("라이브를 종료할까요? 모두 퇴장됩니다.")) return;
    try { await sb().rpc("live_end", { p_room: CUR.roomId }); } catch (e) {}
    broadcastSync(); closeStage();
  }
  async function leave() {
    const room = CUR && CUR.roomId;
    closeStage();
    try { if (room) await sb().rpc("live_leave", { p_room: room }); } catch (e) {}
    broadcastSync();
    refreshSection();
  }

  function closeStage(silent) {
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    if (CUR) {
      try { CUR.audio && CUR.audio.stop && CUR.audio.stop(); } catch (e) {}
      try { CUR.channel && sb().removeChannel(CUR.channel); } catch (e) {}
    }
    CUR = null;
    const ov = document.getElementById("lv-stage");
    if (ov) { ov.classList.remove("on"); setTimeout(() => ov.remove(), 220); }
    if (!silent) refreshSection();
  }

  /* ── 음성(Cloudflare Calls SFU via rtc-sfu 엣지) ─────────────────────────────
     미설정(관리자가 CF Calls 앱 안 만듦)이면 '음성 준비중' 배너로 후퇴.
     실제 SFU WebRTC 배선은 CF 앱 설정 후 2기기 테스트와 함께 활성화. */
  async function connectAudio() {
    const note = document.getElementById("lv-audio-note");
    let cfg = null;
    try {
      const { data } = await sb().functions.invoke("rtc-sfu", { body: { path: "/sessions/new", method: "POST", body: {} } });
      cfg = data;
    } catch (e) {}
    if (!cfg || cfg.reason === "unconfigured" || cfg.ok === false) {
      if (note) { note.hidden = false; note.textContent = "🔊 음성 서버 준비 중 — 지금은 무대·손들기·역할만 동작해요. (관리자 설정 후 음성 활성화)"; }
      CUR && (CUR.audio = { setMuted() {}, stop() {} });
      return;
    }
    // TODO(음성 배선): cfg.data.sessionId 로 로컬 트랙 publish(스피커) / 원격 트랙 subscribe(전원).
    // CF Calls SFU 왕복은 실기기 2대 테스트와 함께 다음 단계에서 활성화.
    if (note) { note.hidden = false; note.textContent = "🔊 음성 연결 준비됨 — 배선 활성화 예정."; }
    CUR && (CUR.audio = { setMuted() {}, stop() {} });
  }

  /* ── init ────────────────────────────────────────────────────────────────── */
  (async function init() {
    const t = setInterval(async () => {
      if (!sb()) return;
      clearInterval(t);
      try { const { data } = await sb().auth.getSession(); ME = data?.session?.user?.id || null; } catch (e) {}
    }, 200);
    // 난장 탭이 뜰 때 dm.js가 부르도록 공개 + 안전망(주기적 주입 시도)
    window.GALLA_liveRefresh = refreshSection;
    let tries = 0;
    const inj = setInterval(() => {
      if (document.getElementById("dm-rooms") && !document.getElementById("dm-rooms").hidden) { refreshSection(); }
      if (++tries > 120) clearInterval(inj);
    }, 1000);
  })();

  function ensureCSS() {
    if (document.getElementById("lv-css")) return;
    const s = document.createElement("style"); s.id = "lv-css";
    s.textContent = `
    #dm-live-sec{margin:2px 0 10px}
    .lv-sec-head{display:flex;align-items:center;justify-content:space-between;padding:4px 2px 8px}
    .lv-sec-t{font-size:14px;font-weight:900;color:#fff}
    .lv-open-btn{background:linear-gradient(135deg,#ff4d67,#ff2d55);color:#fff;border:0;border-radius:999px;font-size:12.5px;font-weight:900;padding:7px 13px;cursor:pointer}
    .lv-cards{display:flex;flex-direction:column;gap:8px}
    .lv-card{display:flex;align-items:center;gap:11px;width:100%;padding:11px 12px;border-radius:14px;cursor:pointer;text-align:left;
      background:linear-gradient(135deg,rgba(255,77,103,.14),rgba(255,45,85,.05));border:1px solid rgba(255,77,103,.34)}
    .lv-live-badge{flex:0 0 auto;font-size:10.5px;font-weight:900;color:#fff;background:#ff2d55;border-radius:6px;padding:3px 6px;letter-spacing:.3px;animation:lvPulse 1.6s ease-in-out infinite}
    @keyframes lvPulse{0%,100%{box-shadow:0 0 0 0 rgba(255,45,85,.5)}50%{box-shadow:0 0 0 6px rgba(255,45,85,0)}}
    .lv-card-mid{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
    .lv-card-title{font-size:14px;font-weight:900;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .lv-card-topic{font-size:12px;color:#c3c9d6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .lv-card-meta{font-size:11.5px;color:#8a90a0}
    .lv-card-go{color:#ff6a8a;font-size:15px;font-weight:900}
    .lv-empty{padding:14px;text-align:center;font-size:12.5px;color:#8a90a0;background:rgba(255,255,255,.03);border-radius:12px}
    #lv-stage{position:fixed;inset:0;z-index:2147482800;display:flex;flex-direction:column;background:radial-gradient(120% 80% at 50% 0%,#1a0f18,#0a0709 70%);
      opacity:0;transition:opacity .22s ease;color:#fff;padding-top:env(safe-area-inset-top,0)}
    #lv-stage.on{opacity:1}
    .lv-top{display:flex;align-items:flex-start;gap:10px;padding:16px 16px 8px}
    .lv-top-info{flex:1;min-width:0}.lv-top-info b{display:block;font-size:18px;font-weight:950;margin-top:6px}
    .lv-topic{font-size:12.5px;color:#b7bdc9;margin-top:2px}
    .lv-x{width:34px;height:34px;border-radius:999px;background:rgba(255,255,255,.1);border:0;color:#fff;font-size:16px;cursor:pointer}
    .lv-audio-note{margin:0 16px 6px;padding:9px 12px;border-radius:12px;background:rgba(255,209,102,.12);border:1px solid rgba(255,209,102,.3);color:#ffd479;font-size:12px;font-weight:700}
    .lv-stage-body{flex:1;overflow-y:auto;padding:6px 16px 12px}
    .lv-stage-label,.lv-aud-label{font-size:12px;font-weight:900;color:#8a90a0;margin:10px 2px 10px}
    .lv-speakers{display:grid;grid-template-columns:repeat(4,1fr);gap:14px 6px}
    .lv-audience{display:grid;grid-template-columns:repeat(5,1fr);gap:14px 4px}
    .lv-person{background:none;border:0;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px;color:#fff}
    .lv-ava{position:relative;width:60px;height:60px;border-radius:50%;overflow:visible;display:flex;align-items:center;justify-content:center;
      background:#222634;border:2px solid transparent}
    .lv-ava.sm{width:46px;height:46px}
    .lv-ava img{width:100%;height:100%;border-radius:50%;object-fit:cover}
    .lv-ava-none{font-size:24px}
    .lv-ava.talk{border-color:#33d17a;box-shadow:0 0 0 4px rgba(51,209,122,.25);animation:lvTalk 1s ease-in-out infinite}
    @keyframes lvTalk{0%,100%{box-shadow:0 0 0 3px rgba(51,209,122,.2)}50%{box-shadow:0 0 0 6px rgba(51,209,122,.05)}}
    .lv-crown{position:absolute;top:-10px;right:-4px;font-size:16px}
    .lv-mic{position:absolute;bottom:-4px;right:-4px;font-size:14px;background:#0a0709;border-radius:50%;padding:1px}
    .lv-hand{position:absolute;top:-8px;right:-6px;font-size:15px}
    .lv-name{font-size:11.5px;max-width:70px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#dfe4f0}
    .lv-bar{display:flex;gap:8px;padding:12px 16px calc(16px + env(safe-area-inset-bottom,0))}
    .lv-bbtn{flex:1;padding:14px;border:1px solid rgba(255,255,255,.14);border-radius:14px;background:rgba(255,255,255,.06);color:#fff;font-size:14px;font-weight:900;cursor:pointer}
    .lv-bbtn.act{background:linear-gradient(135deg,#33d17a,#1fae63);border-color:transparent}
    .lv-bbtn.danger{background:rgba(255,77,103,.16);border-color:rgba(255,77,103,.4);color:#ff9aa5}
    .lv-bbtn:active{transform:scale(.98)}
    @media (prefers-reduced-motion:reduce){.lv-live-badge,.lv-ava.talk{animation:none}}`;
    document.head.appendChild(s);
  }
})();
