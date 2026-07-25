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
  const IS_DM = document.body.getAttribute("data-page") === "dm";
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
      <div class="lv-chat" id="lv-chat"></div>
      <div class="lv-react" id="lv-react">
        <button data-emo="❤️" type="button">❤️</button>
        <button data-emo="💩" type="button">💩</button>
        <button data-emo="👏" type="button">👏</button>
        <button data-emo="🔥" type="button">🔥</button>
        <button data-emo="😂" type="button">😂</button>
        <span class="lv-react-sp"></span>
        <button class="lv-super" id="lv-super" type="button">💸 쏘기</button>
        <button class="lv-share" id="lv-share" type="button">🔗</button>
      </div>
      <div class="lv-chatbar">
        <input id="lv-chat-in" maxlength="500" placeholder="라이브 채팅…" autocomplete="off">
        <button id="lv-chat-send" type="button">보내기</button>
      </div>
      <div class="lv-fx" id="lv-fx"></div>
      <div class="lv-bar" id="lv-bar"></div>`;
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add("on"));
    ov.querySelector("#lv-x").onclick = () => leave();
    // 라이브 채팅(open_messages 재사용)
    const cin = ov.querySelector("#lv-chat-in");
    ov.querySelector("#lv-chat-send").onclick = sendChat;
    cin.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); sendChat(); } });
    loadChat();

    CUR = { roomId, role: "listener", muted: true, hand: false, state: [], channel: null, audio: null };
    // 실시간 동기화 채널
    try {
      CUR.channel = sb().channel("live:" + roomId, { config: { broadcast: { self: false } } });
      CUR.channel.on("broadcast", { event: "sync" }, () => refreshState());
      CUR.channel.on("broadcast", { event: "react" }, ({ payload }) => spawnFloat(payload && payload.emo));
      CUR.channel.on("broadcast", { event: "super" }, ({ payload }) => showSuper(payload));
      CUR.channel.subscribe();
    } catch (e) {}
    // 리액션·후원·공유
    ov.querySelectorAll("#lv-react [data-emo]").forEach(b => b.onclick = () => sendReaction(b.dataset.emo));
    ov.querySelector("#lv-super").onclick = openSuper;
    ov.querySelector("#lv-share").onclick = shareRoom;
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
    CUR.nicks = CUR.nicks || {};
    rows.forEach(r => { CUR.nicks[r.user_id] = r.nickname || "익명"; });
    if (me) { CUR.role = me.role; CUR.muted = me.muted; CUR.hand = me.hand_raised; }
    render();
  }

  /* ── 라이브 채팅 (open_messages 재사용) ─────────────────────────────────── */
  function chatBox() { return document.getElementById("lv-chat"); }
  function appendMsg(m, atTop) {
    const box = chatBox(); if (!box || !CUR) return;
    const nick = (CUR.nicks && CUR.nicks[m.sender_id]) || "익명";
    const mine = m.sender_id === ME;
    const row = document.createElement("div");
    row.className = "lv-msg" + (mine ? " mine" : "");
    row.innerHTML = `<b>${esc(nick)}</b> <span>${esc(m.body)}</span>`;
    if (atTop) box.insertBefore(row, box.firstChild); else box.appendChild(row);
    if (!atTop) box.scrollTop = box.scrollHeight;
  }
  async function loadChat() {
    if (!CUR) return;
    try {
      const { data } = await sb().from("open_messages")
        .select("sender_id,body,created_at").eq("room_id", CUR.roomId)
        .order("created_at", { ascending: false }).limit(40);
      const box = chatBox(); if (box) box.innerHTML = "";
      (data || []).reverse().forEach(m => appendMsg(m));
    } catch (e) {}
    // 실시간 신규 메시지
    try {
      CUR.chatCh = sb().channel("liveroom:" + CUR.roomId)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "open_messages", filter: "room_id=eq." + CUR.roomId },
          p => { const m = p.new; if (m && m.sender_id !== ME) appendMsg(m); })
        .subscribe();
    } catch (e) {}
  }
  async function sendChat() {
    const cin = document.getElementById("lv-chat-in"); if (!cin || !CUR) return;
    const body = (cin.value || "").trim(); if (!body) return;
    cin.value = "";
    appendMsg({ sender_id: ME, body });   // 낙관적
    try { await sb().from("open_messages").insert({ room_id: CUR.roomId, sender_id: ME, body }); } catch (e) { toast("전송 실패"); }
  }

  /* ── 실시간 리액션 (❤️/💩 날아다니기) ─────────────────────────────────── */
  function spawnFloat(emo) {
    const fx = document.getElementById("lv-fx"); if (!fx || !emo) return;
    for (let i = 0; i < 5; i++) {
      const s = document.createElement("span");
      s.className = "lv-float"; s.textContent = emo;
      s.style.left = (8 + Math.random() * 84) + "%";
      s.style.setProperty("--dx", (((Math.random() * 90) | 0) - 45) + "px");
      s.style.animationDelay = (Math.random() * 0.28).toFixed(2) + "s";
      s.style.fontSize = (20 + (Math.random() * 18 | 0)) + "px";
      fx.appendChild(s);
      setTimeout(() => s.remove(), 2000);
    }
  }
  function sendReaction(emo) {
    spawnFloat(emo);
    try { CUR && CUR.channel.send({ type: "broadcast", event: "react", payload: { emo } }); } catch (e) {}
    try { window.GALLA_haptic && window.GALLA_haptic("light"); } catch (e) {}
  }
  function shareRoom() {
    const title = (document.getElementById("lv-title")?.textContent || "GALLA 라이브 난장").trim();
    const url = location.origin || "https://galla.im";
    if (window.GALLA_share) window.GALLA_share({ url, title: "🎙 " + title, text: title + " — 지금 라이브 난장 중! 들으러 와요 🎧" });
    else if (navigator.share) navigator.share({ title, url }).catch(() => {});
    else toast("공유를 지원하지 않는 브라우저예요.");
  }

  /* ── 💸 GC 쏘기 (빵빵 터지는 후원 · 게임 GP와 분리된 현금성 GC) ──────── */
  // 소액 원탭 티어 시트(100원부터 — 사람들은 큰돈 안 쓴다)
  function openSuper() {
    if (!CUR) return;
    const host = (CUR.state || []).find(r => r.role === "host");
    if (host && host.user_id === ME) return toast("내 방엔 쏘기 안 돼요.");
    const ov = document.getElementById("lv-stage"); if (!ov || ov.querySelector("#lv-super-sheet")) return;
    const tiers = [100, 500, 1000, 5000, 10000];
    const sheet = document.createElement("div");
    sheet.id = "lv-super-sheet"; sheet.className = "lv-sheet";
    sheet.innerHTML = `
      <div class="lv-sheet-dim"></div>
      <div class="lv-sheet-card">
        <div class="lv-sheet-h">💸 쏘기 <small>갈라코인(GC) · 100 GC부터</small></div>
        <div class="lv-tiers">${tiers.map(t => `<button class="lv-tier" data-amt="${t}" type="button">${t.toLocaleString()} GC</button>`).join("")}
          <button class="lv-tier lv-tier-etc" data-amt="0" type="button">직접</button></div>
        <input id="lv-super-amt" type="number" min="100" inputmode="numeric" placeholder="직접 입력 (100 GC부터)" hidden>
        <input id="lv-super-msg" maxlength="80" placeholder="응원 메시지 (선택)">
        <div class="lv-sheet-btns"><button id="lv-super-cancel" type="button">취소</button><button id="lv-super-go" type="button" disabled>쏘기</button></div>
      </div>`;
    ov.appendChild(sheet);
    let amt = 0;
    const go = sheet.querySelector("#lv-super-go");
    const amtIn = sheet.querySelector("#lv-super-amt");
    const setAmt = (v) => { amt = v; go.disabled = !(amt >= 100); go.textContent = amt >= 100 ? amt.toLocaleString() + " GC 쏘기" : "쏘기"; };
    sheet.querySelectorAll(".lv-tier").forEach(b => b.onclick = () => {
      sheet.querySelectorAll(".lv-tier").forEach(x => x.classList.remove("on")); b.classList.add("on");
      if (b.dataset.amt === "0") { amtIn.hidden = false; amtIn.focus(); setAmt(parseInt(amtIn.value || "0", 10)); }
      else { amtIn.hidden = true; setAmt(+b.dataset.amt); }
    });
    amtIn.oninput = () => setAmt(parseInt(amtIn.value || "0", 10));
    const close = () => sheet.remove();
    sheet.querySelector("#lv-super-cancel").onclick = close;
    sheet.querySelector(".lv-sheet-dim").onclick = close;
    go.onclick = async () => {
      if (amt < 100) return;
      const msg = (sheet.querySelector("#lv-super-msg").value || "").trim();
      go.disabled = true; go.textContent = "쏘는 중…";
      try {
        const { data } = await sb().rpc("gc_donate_live", { p_room: CUR.roomId, p_amount: amt, p_message: msg });
        if (!data || !data.ok) {
          if (data && data.reason === "insufficient") { toast("갈라코인(GC)이 부족해요."); if (window.openCharge) window.openCharge(); }
          else toast(data && data.reason === "self" ? "내 방엔 쏘기 불가" : "쏘기에 실패했어요.");
          go.disabled = false; setAmt(amt); return;
        }
        close();
        const payload = { nick: (CUR.nicks && CUR.nicks[ME]) || "나", amount: amt, msg };
        showSuper(payload);
        try { CUR.channel.send({ type: "broadcast", event: "super", payload }); } catch (e) {}
      } catch (e) { toast("쏘기에 실패했어요."); go.disabled = false; setAmt(amt); }
    };
  }
  function showSuper(p) {
    const fx = document.getElementById("lv-fx"); if (!fx || !p) return;
    const won = (p.amount || 0).toLocaleString();
    const card = document.createElement("div");
    card.className = "lv-super-card";
    card.innerHTML = `<div class="lv-sc-top">💸 <b>${esc(p.nick || "익명")}</b> 님 <b class="lv-sc-amt">${won} GC</b> 쐈다! 🎉</div>` +
      (p.msg ? `<div class="lv-sc-msg">${esc(p.msg)}</div>` : "");
    fx.appendChild(card);
    try { window.GALLA_haptic && window.GALLA_haptic("strong"); } catch (e) {}
    // 코인 파티클도 빵!
    for (let i = 0; i < 8; i++) spawnFloat("🪙");
    setTimeout(() => { card.classList.add("out"); setTimeout(() => card.remove(), 400); }, 4200);
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
      try { CUR.chatCh && sb().removeChannel(CUR.chatCh); } catch (e) {}
    }
    CUR = null;
    const ov = document.getElementById("lv-stage");
    if (ov) { ov.classList.remove("on"); setTimeout(() => ov.remove(), 220); }
    if (!silent) refreshSection();
  }

  /* ── 음성(Cloudflare Calls SFU via rtc-sfu 엣지) ─────────────────────────────
     스피커는 마이크 트랙 publish, 전원은 스피커 트랙 subscribe. 세션ID/트랙명은
     Realtime broadcast('pub')로 교환. 미설정이면 '준비중' 배너로 후퇴.
     ⚠️ 실기기 2대 테스트 필요(첫 배선) — CF 시크릿 등록 후 검증. */
  function sfu(path, method, body) {
    return sb().functions.invoke("rtc-sfu", { body: { path, method, body: body || {} } })
      .then(r => r && r.data).catch(() => null);
  }
  async function iceServers() {
    try { const { data } = await sb().functions.invoke("turn-cred", { body: {} }); if (data && data.iceServers) return data.iceServers; } catch (e) {}
    return [{ urls: "stun:stun.cloudflare.com:3478" }];
  }
  async function connectAudio() {
    const note = document.getElementById("lv-audio-note");
    const fallback = (msg) => { if (note) { note.hidden = false; note.textContent = msg || "🔊 음성 서버 준비 중 — 무대·손들기·역할·채팅은 동작해요."; } CUR && (CUR.audio = { setMuted() {}, stop() {} }); };
    let pc;
    try { pc = new RTCPeerConnection({ iceServers: await iceServers(), bundlePolicy: "max-bundle" }); }
    catch (e) { return fallback(); }
    // 세션 부트스트랩 — CF Realtime SFU는 /sessions/new에 offer 동봉 필수(recvonly로 시작).
    pc.addTransceiver("audio", { direction: "recvonly" });
    let offer;
    try { offer = await pc.createOffer(); await pc.setLocalDescription(offer); } catch (e) { try { pc.close(); } catch (_) {} return fallback(); }
    const sess = await sfu("/sessions/new", "POST", { sessionDescription: { type: "offer", sdp: offer.sdp } });
    if (!sess || sess.reason === "unconfigured") { try { pc.close(); } catch (e) {} return fallback(); }
    if (!sess.data || !sess.data.sessionId || !sess.data.sessionDescription) { try { pc.close(); } catch (e) {} return fallback("🔊 음성 연결 실패 — 재입장 시 재시도돼요."); }
    try { await pc.setRemoteDescription(sess.data.sessionDescription); } catch (e) { try { pc.close(); } catch (_) {} return fallback(); }
    const cf = { sessionId: sess.data.sessionId, pc, pubTrack: null, myTrackName: null, subs: new Set(), q: Promise.resolve(), els: [] };
    if (!CUR) { try { pc.close(); } catch (e) {} return; }
    CUR.cf = cf;
    CUR.audio = {
      setMuted(m) { try { if (cf.pubTrack) cf.pubTrack.enabled = !m; if (!m) maybePublish(); } catch (e) {} },
      stop() { stopAudio(cf); },
    };
    pc.ontrack = (e) => {
      try {
        const el = document.createElement("audio");
        el.autoplay = true; el.playsInline = true; el.srcObject = new MediaStream([e.track]);
        document.body.appendChild(el); cf.els.push(el);
        el.play && el.play().catch(() => {});
      } catch (_) {}
    };
    // 다른 스피커 publish 정보 수신 → 구독. 입장 시 현재 pub 요청.
    try {
      CUR.channel.on("broadcast", { event: "pub" }, ({ payload }) => onPub(payload));
      CUR.channel.on("broadcast", { event: "pubask" }, () => announcePub());
      CUR.channel.send({ type: "broadcast", event: "pubask", payload: {} });
    } catch (e) {}
    if (note) note.hidden = true;
    await maybePublish();
  }

  async function maybePublish() {
    const cf = CUR && CUR.cf; if (!cf || cf.pubTrack) return;
    if (!(CUR.role === "host" || CUR.role === "speaker")) return;
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
    catch (e) { toast("마이크를 켤 수 없어요 — 권한을 확인해 주세요."); return; }
    const track = stream.getAudioTracks()[0];
    track.enabled = !CUR.muted;
    try {
      const tr = cf.pc.addTransceiver(track, { direction: "sendonly" });
      const offer = await cf.pc.createOffer();
      await cf.pc.setLocalDescription(offer);
      const trackName = "mic-" + String(ME).slice(0, 8);
      const res = await sfu(`/sessions/${cf.sessionId}/tracks/new`, "POST",
        { sessionDescription: { type: "offer", sdp: offer.sdp }, tracks: [{ location: "local", mid: tr.mid, trackName }] });
      if (res && res.ok && res.data && res.data.sessionDescription) {
        await cf.pc.setRemoteDescription(res.data.sessionDescription);
        cf.pubTrack = track; cf.myTrackName = trackName;
        announcePub();
      } else { track.stop(); }
    } catch (e) { try { track.stop(); } catch (_) {} }
  }
  function announcePub() {
    const cf = CUR && CUR.cf; if (!cf || !cf.myTrackName) return;
    try { CUR.channel.send({ type: "broadcast", event: "pub", payload: { uid: ME, sessionId: cf.sessionId, trackName: cf.myTrackName } }); } catch (e) {}
  }
  function onPub(p) {
    const cf = CUR && CUR.cf; if (!cf || !p || p.uid === ME || cf.subs.has(p.uid)) return;
    cf.subs.add(p.uid);
    // 재협상은 한 번에 하나 — 큐로 직렬화
    cf.q = cf.q.then(() => subscribe(p)).catch(() => {});
  }
  async function subscribe(p) {
    const cf = CUR && CUR.cf; if (!cf) return;
    try {
      const res = await sfu(`/sessions/${cf.sessionId}/tracks/new`, "POST",
        { tracks: [{ location: "remote", sessionId: p.sessionId, trackName: p.trackName }] });
      if (res && res.ok && res.data && res.data.sessionDescription && res.data.sessionDescription.type === "offer") {
        await cf.pc.setRemoteDescription(res.data.sessionDescription);
        const answer = await cf.pc.createAnswer();
        await cf.pc.setLocalDescription(answer);
        await sfu(`/sessions/${cf.sessionId}/renegotiate`, "PUT", { sessionDescription: { type: "answer", sdp: answer.sdp } });
      }
    } catch (e) { cf.subs.delete(p.uid); }
  }
  function stopAudio(cf) {
    if (!cf) return;
    try { cf.pubTrack && cf.pubTrack.stop(); } catch (e) {}
    try { cf.pc && cf.pc.close(); } catch (e) {}
    (cf.els || []).forEach(el => { try { el.srcObject = null; el.remove(); } catch (e) {} });
  }

  /* ── 콘텐츠 → 라이브 파이프라인 (이슈/예측/광장에서 라이브 열기·입장) ──────── */
  async function ensureMe() {
    if (ME) return ME;
    try { const { data } = await sb().auth.getSession(); ME = data?.session?.user?.id || null; } catch (e) {}
    return ME;
  }
  // 열거나(없으면) 입장한다(있으면). 콘텐츠 연계 라이브.
  window.GALLA_liveLaunch = async function (linkType, linkId, title, topic) {
    if (!sb()) return;
    if (!(await ensureMe())) { if (window.GALLA_needLogin) window.GALLA_needLogin("라이브는 로그인 후 이용할 수 있어요."); return; }
    ensureCSS();
    try {
      const { data } = await sb().rpc("live_room_for_link", { p_link_type: linkType, p_link_id: String(linkId) });
      const ex = data && data[0];
      if (ex) { await sb().rpc("live_join", { p_room: ex.id }); return openStage(ex.id, ex.title, ""); }
    } catch (e) {}
    if (!confirm("이 주제로 라이브 음성 난장을 열까요?")) return;
    try {
      const { data: id, error } = await sb().rpc("live_room_create",
        { p_title: title || "라이브 난장", p_topic: topic || "", p_link_type: linkType, p_link_id: String(linkId) });
      if (error || !id) return toast("라이브 개설에 실패했어요.");
      openStage(id, title || "라이브 난장", topic || "");
    } catch (e) { toast("라이브 개설에 실패했어요."); }
  };

  // 이 페이지의 콘텐츠 링크 판별
  function pageLink() {
    const id = new URLSearchParams(location.search).get("id");
    if (!id) return null;
    const path = location.pathname;
    const titleOf = (sel, fb) => (document.querySelector(sel)?.textContent || "").trim().slice(0, 30) || fb;
    if (/issue/.test(path)) return { type: "issue", id, title: titleOf(".issue-title, h1, .st-title", "이슈 토크") };
    if (/predict-market/.test(path)) return { type: "market", id, title: titleOf(".pmd-q, .market-q, h1", "예측 토크") };
    if (/plaza_detail/.test(path)) return { type: "plaza", id, title: titleOf(".pz-title, h1", "광장 토크") };
    return null;
  }
  // 콘텐츠 페이지에 라이브 진입 플로팅 필 주입(+ 진행중이면 인원 표시)
  async function injectPill() {
    const link = pageLink(); if (!link || document.getElementById("lv-pill")) return;
    ensureCSS();
    const pill = document.createElement("button");
    pill.id = "lv-pill"; pill.type = "button"; pill.className = "lv-pill";
    pill.innerHTML = `🎙 <span>라이브</span>`;
    document.body.appendChild(pill);
    pill.onclick = () => window.GALLA_liveLaunch(link.type, link.id, link.title, "");
    async function poll() {
      if (!sb() || !document.getElementById("lv-pill")) return;
      try {
        const { data } = await sb().rpc("live_room_for_link", { p_link_type: link.type, p_link_id: String(link.id) });
        const ex = data && data[0];
        if (ex) { pill.classList.add("on"); pill.innerHTML = `🔴 <span>라이브 ${ex.listeners || 1}명</span>`; }
        else { pill.classList.remove("on"); pill.innerHTML = `🎙 <span>라이브 열기</span>`; }
      } catch (e) {}
    }
    poll(); setInterval(poll, 15000);
  }

  /* ── init ────────────────────────────────────────────────────────────────── */
  (async function init() {
    const t = setInterval(async () => { if (!sb()) return; clearInterval(t); ensureMe(); }, 200);
    if (IS_DM) {
      // 난장 탭 상단 LIVE 섹션 — dm.js가 loadRooms에서 부름 + 안전망 폴링
      window.GALLA_liveRefresh = refreshSection;
      let tries = 0;
      const inj = setInterval(() => {
        const r = document.getElementById("dm-rooms");
        if (r && !r.hidden) refreshSection();
        if (++tries > 120) clearInterval(inj);
      }, 1000);
    } else {
      // 이슈/예측/광장 → 라이브 진입 필
      let tries = 0;
      const inj = setInterval(() => { if (pageLink()) { clearInterval(inj); injectPill(); } if (++tries > 30) clearInterval(inj); }, 500);
    }
  })();

  function ensureCSS() {
    if (document.getElementById("lv-css")) return;
    const s = document.createElement("style"); s.id = "lv-css";
    s.textContent = `
    .lv-pill{position:fixed;right:14px;bottom:calc(84px + env(safe-area-inset-bottom,0));z-index:2000000;display:flex;align-items:center;gap:6px;
      background:rgba(20,22,30,.92);color:#fff;border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:11px 15px;font-size:13.5px;font-weight:900;
      cursor:pointer;box-shadow:0 10px 26px rgba(0,0,0,.45);backdrop-filter:blur(6px)}
    .lv-pill.on{background:linear-gradient(135deg,#ff4d67,#ff2d55);border-color:transparent;animation:lvPulse 1.6s ease-in-out infinite}
    .lv-pill:active{transform:scale(.96)}
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
    .lv-stage-body{flex:0 1 auto;max-height:46vh;overflow-y:auto;padding:6px 16px 12px}
    .lv-chat{flex:1 1 auto;overflow-y:auto;padding:6px 16px;display:flex;flex-direction:column;gap:6px;min-height:60px;border-top:1px solid rgba(255,255,255,.06)}
    .lv-msg{font-size:13px;line-height:1.4;color:#dfe4f0;word-break:break-word}
    .lv-msg b{color:#8aa0ff;font-weight:800;margin-right:5px}
    .lv-msg.mine b{color:#7ef0ae}
    .lv-react{display:flex;align-items:center;gap:6px;padding:4px 16px 2px}
    .lv-react button{flex:0 0 auto;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:999px;font-size:17px;padding:6px 9px;cursor:pointer;line-height:1}
    .lv-react button:active{transform:scale(1.25)}
    .lv-react .lv-react-sp{flex:1}
    .lv-react .lv-super{font-size:12.5px;font-weight:900;color:#fff;background:linear-gradient(135deg,#ff8a3d,#ff3d67);border:0;padding:8px 12px}
    .lv-react .lv-share{font-size:15px}
    .lv-fx{position:absolute;inset:0;pointer-events:none;z-index:5;overflow:hidden}
    .lv-float{position:absolute;bottom:120px;pointer-events:none;animation:lvFloat 1.9s ease-out forwards;will-change:transform,opacity}
    @keyframes lvFloat{0%{opacity:0;transform:translateY(0) scale(.6)}12%{opacity:1}100%{opacity:0;transform:translateY(-62vh) translateX(var(--dx)) scale(1.25) rotate(12deg)}}
    .lv-super-card{position:absolute;left:12px;right:12px;top:88px;padding:14px 16px;border-radius:16px;
      background:linear-gradient(135deg,#ff8a3d,#ff2d55);box-shadow:0 16px 40px rgba(255,45,85,.5);color:#fff;
      animation:lvSuperIn .5s cubic-bezier(.2,1.5,.35,1) both}
    .lv-super-card.out{animation:lvSuperOut .4s ease forwards}
    @keyframes lvSuperIn{0%{opacity:0;transform:translateY(-30px) scale(.8)}100%{opacity:1;transform:none}}
    @keyframes lvSuperOut{to{opacity:0;transform:translateY(-16px) scale(.96)}}
    .lv-sc-top{font-size:15px;font-weight:950}.lv-sc-amt{font-size:17px}
    .lv-sheet{position:absolute;inset:0;z-index:9;display:flex;align-items:flex-end;justify-content:center}
    .lv-sheet-dim{position:absolute;inset:0;background:rgba(0,0,0,.55)}
    .lv-sheet-card{position:relative;width:100%;max-width:480px;background:#15171f;border-radius:20px 20px 0 0;padding:18px 16px calc(18px + env(safe-area-inset-bottom,0));border-top:1px solid rgba(255,255,255,.1)}
    .lv-sheet-h{font-size:16px;font-weight:950;color:#fff;margin-bottom:12px}.lv-sheet-h small{font-size:11.5px;font-weight:700;color:#8a90a0;margin-left:6px}
    .lv-tiers{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}
    .lv-tier{flex:1 1 28%;min-width:80px;padding:12px 6px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);color:#fff;font-size:14px;font-weight:900;cursor:pointer}
    .lv-tier.on{background:linear-gradient(135deg,#ff8a3d,#ff3d67);border-color:transparent}
    .lv-tier-etc{flex:1 1 28%}
    #lv-super-amt,#lv-super-msg{width:100%;box-sizing:border-box;background:#0e1015;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:12px 14px;color:#fff;font-size:14px;margin-bottom:10px}
    .lv-sheet-btns{display:flex;gap:8px}
    .lv-sheet-btns #lv-super-cancel{flex:0 0 auto;padding:13px 18px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:none;color:#c8cede;font-weight:800;cursor:pointer}
    .lv-sheet-btns #lv-super-go{flex:1;padding:13px;border-radius:12px;border:0;background:linear-gradient(135deg,#ff8a3d,#ff2d55);color:#fff;font-size:15px;font-weight:950;cursor:pointer}
    .lv-sheet-btns #lv-super-go:disabled{opacity:.45}
    .lv-sc-msg{font-size:13.5px;margin-top:5px;color:rgba(255,255,255,.95)}
    .lv-chatbar{display:flex;gap:8px;padding:8px 16px}
    .lv-chatbar input{flex:1;min-width:0;background:#161a24;border:1px solid rgba(255,255,255,.12);border-radius:999px;padding:11px 15px;color:#fff;font-size:14px}
    .lv-chatbar button{flex:0 0 auto;background:#2b6bff;border:0;border-radius:999px;color:#fff;font-weight:900;font-size:13.5px;padding:0 16px;cursor:pointer}
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
