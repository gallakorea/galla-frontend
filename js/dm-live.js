/* ============================================================================
   🎙 육성 난장 (클럽하우스식 라이브 음성) — 무대 UI + 역할 + 실시간 동기화
   ----------------------------------------------------------------------------
   · 난장 탭 상단에 "🔴 지금 라이브" 섹션 + [육성 열기] 주입
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
  // 셸(네이티브) 하단 nav 숨김 — 라이브 무대는 풀스크린이라 nav가 위로 겹쳐 보이면 안 됨
  function navHide(on) { try { if (window.parent && window.parent !== window) window.parent.postMessage({ galla: "shell", t: "navhide", on: on }, location.origin); } catch (e) {} }
  // ⚠️ users.avatar_url은 완성 URL이 아니라 스토리지 경로("<uid>/avatar.jpg") — 반드시 리졸버 경유
  function avatar(u) {
    const src = window.GALLA_avatarSrc ? window.GALLA_avatarSrc(u, 128) : u;
    return src ? `<img src="${esc(src)}" alt="" onerror="this.style.display='none'">` : `<span class="lv-ava-none">🙂</span>`;
  }

  /* ── 난장 탭 상단 LIVE 섹션 주입 ─────────────────────────────────────────── */
  let LOBBY_ROWS = [];   // 마지막으로 받은 라이브 목록(검색 필터용)
  let LOBBY_Q = "";      // 로비 검색어(폴링에도 유지)

  function lobbyCards() {
    let rows = LOBBY_ROWS.slice();
    // 🔥 핫 정렬 — 청중 많은 순, 동률이면 최근 개설 순
    rows.sort((a, b) => (b.listeners || 0) - (a.listeners || 0) ||
      (new Date(b.started_at || 0) - new Date(a.started_at || 0)));
    const hotMax = rows.length ? (rows[0].listeners || 0) : 0;
    const q = LOBBY_Q.trim().toLowerCase();
    if (q) rows = rows.filter(r =>
      ((r.title || "") + " " + (r.topic || "") + " " + (r.host_nick || "")).toLowerCase().includes(q));
    if (!rows.length) {
      return `<div class="lv-empty">${q ? "‘" + esc(LOBBY_Q) + "’ 육성 난장을 못 찾았어요." : "지금 열린 육성 난장이 없어요. 직접 무대를 열어보세요 🎤"}</div>`;
    }
    return `<div class="lv-cards">` + rows.map(r => {
      const hot = (r.listeners || 0) >= 3 && (r.listeners || 0) === hotMax;
      return `
      <button class="lv-card" data-room="${r.id}" type="button">
        <span class="lv-live-badge">🔴 LIVE</span>
        <span class="lv-card-mid">
          <b class="lv-card-title">${hot ? '<span class="lv-hot">🔥 HOT</span> ' : ""}${esc(r.title)}</b>
          ${r.topic ? `<span class="lv-card-topic">${esc(r.topic)}</span>` : ""}
          <span class="lv-card-meta">🎙 ${r.speakers || 0} · 👥 ${r.listeners || 0}명 · ${esc(r.host_nick || "호스트")}</span>
        </span>
        <span class="lv-card-go">▶</span>
      </button>`;
    }).join("") + `</div>`;
  }
  function paintLobbyCards() {
    const box = document.getElementById("lv-lobby-cards"); if (!box) return;
    box.innerHTML = lobbyCards();
    box.querySelectorAll(".lv-card").forEach(b => b.onclick = () => joinLive(b.dataset.room));
  }
  async function refreshSection() {
    const rooms = document.getElementById("dm-rooms");
    if (!rooms) return;
    ensureCSS();
    let sec = document.getElementById("dm-live-sec");
    // 헤더(제목·검색·열기)는 1회만 — 폴링이 검색창을 지우지 않도록 카드만 갱신
    if (!sec) {
      sec = document.createElement("div");
      sec.id = "dm-live-sec";
      const list = document.getElementById("dm-room-list");
      rooms.insertBefore(sec, list || null);
      sec.innerHTML = `
        <div class="lv-sec-head">
          <span class="lv-sec-t">🎙 육성 난장</span>
          <button class="lv-open-btn" id="lv-open" type="button">＋ 육성난장 열기</button>
        </div>
        <div class="lv-lobby-search">
          <input id="lv-lobby-q" placeholder="🔎 난장 주제·방장 검색" autocomplete="off">
        </div>
        <div id="lv-lobby-cards"></div>`;
      sec.querySelector("#lv-open").onclick = createLive;
      const qi = sec.querySelector("#lv-lobby-q");
      qi.oninput = () => { LOBBY_Q = qi.value; paintLobbyCards(); };
    }
    let rows = [];
    try { const { data } = await sb().rpc("list_live_rooms"); rows = data || []; } catch (e) {}
    LOBBY_ROWS = rows;
    paintLobbyCards();
  }

  function createLive() {
    ensureCSS();
    if (document.getElementById("lv-new-sheet")) return;
    const sheet = document.createElement("div");
    sheet.id = "lv-new-sheet"; sheet.className = "lv-sheet lv-modal";
    sheet.innerHTML = `
      <div class="lv-sheet-dim"></div>
      <div class="lv-sheet-card lv-new-card">
        <div class="lv-new-h"><span class="lv-live-badge">🔴 LIVE</span> 육성 난장 열기</div>
        <label class="lv-new-l">제목</label>
        <input id="lv-new-title" class="lv-new-in" maxlength="40" placeholder="예: 오늘 이슈 실시간 토크" autocomplete="off">
        <label class="lv-new-l">주제 <small>선택</small></label>
        <input id="lv-new-topic" class="lv-new-in" maxlength="40" placeholder="한 줄로 남겨보세요" autocomplete="off">
        <div class="lv-sheet-btns">
          <button id="lv-new-cancel" type="button">취소</button>
          <button id="lv-new-go" type="button" disabled>🎙 열기</button>
        </div>
      </div>`;
    document.body.appendChild(sheet);
    navHide(true);   // 셸 하단 nav가 시트(취소·열기 버튼)를 가리지 않게
    requestAnimationFrame(() => sheet.classList.add("on"));
    const titleIn = sheet.querySelector("#lv-new-title");
    const topicIn = sheet.querySelector("#lv-new-topic");
    const go = sheet.querySelector("#lv-new-go");
    const close = () => { navHide(false); sheet.classList.remove("on"); setTimeout(() => sheet.remove(), 200); };
    titleIn.oninput = () => { go.disabled = !titleIn.value.trim(); };
    titleIn.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); topicIn.focus(); } };
    topicIn.onkeydown = e => { if (e.key === "Enter" && titleIn.value.trim()) { e.preventDefault(); go.click(); } };
    sheet.querySelector("#lv-new-cancel").onclick = close;
    sheet.querySelector(".lv-sheet-dim").onclick = close;
    go.onclick = async () => {
      const title = titleIn.value.trim(); if (!title) return;
      const topic = topicIn.value.trim();
      go.disabled = true; go.textContent = "여는 중…";
      try {
        const { data: id, error } = await sb().rpc("live_room_create", { p_title: title, p_topic: topic });
        if (error || !id) { toast("육성 난장 개설에 실패했어요."); go.disabled = false; go.textContent = "🎙 열기"; return; }
        close();
        openStage(id, title, topic, "open");
      } catch (e) { toast("육성 난장 개설에 실패했어요."); go.disabled = false; go.textContent = "🎙 열기"; }
    };
    setTimeout(() => titleIn.focus(), 60);
  }

  async function joinLive(roomId) {
    try {
      const { data } = await sb().rpc("live_join", { p_room: roomId });
      if (!data || !data.ok) return toast(data && data.reason === "ended" ? "이미 끝난 육성 난장이에요." : "입장에 실패했어요.");
      // 제목은 목록에서 못 가져왔을 수 있으니 상태에서 채운다
      openStage(roomId, "", "", "join");
    } catch (e) { toast("입장에 실패했어요."); }
  }

  /* ── 무대 오버레이 ───────────────────────────────────────────────────────── */
  function openStage(roomId, title, topic, entry) {
    ensureCSS();
    closeStage(true);
    const ov = document.createElement("div");
    ov.id = "lv-stage";
    ov.innerHTML = `
      <div class="lv-top">
        <div class="lv-top-info"><span class="lv-live-badge">🔴 LIVE</span><b id="lv-title">${esc(title || "육성 난장")}</b>
          <div id="lv-topic" class="lv-topic">${esc(topic || "")}</div></div>
        <button class="lv-x" id="lv-x" aria-label="나가기">✕</button>
      </div>
      <div class="lv-audio-note" id="lv-audio-note" hidden></div>
      <div class="lv-present" id="lv-present" hidden></div>
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
        <button class="lv-present-btn" id="lv-present-open" type="button" hidden>📌 자료</button>
        <button class="lv-super" id="lv-super" type="button">💸 쏘기</button>
        <button class="lv-share" id="lv-share" type="button">🔗</button>
      </div>
      <div class="lv-chatbar">
        <input id="lv-chat-in" maxlength="500" placeholder="실시간 채팅…" autocomplete="off">
        <button id="lv-chat-send" type="button">보내기</button>
      </div>
      <div class="lv-fx" id="lv-fx"></div>
      <div class="lv-bar" id="lv-bar"></div>`;
    document.body.appendChild(ov);
    navHide(true);
    requestAnimationFrame(() => ov.classList.add("on"));
    ov.querySelector("#lv-x").onclick = () => leave();
    // 실시간 채팅(open_messages 재사용)
    const cin = ov.querySelector("#lv-chat-in");
    ov.querySelector("#lv-chat-send").onclick = sendChat;
    cin.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); sendChat(); } });
    loadChat();

    CUR = { roomId, role: "listener", muted: true, hand: false, state: [], channel: null, audio: null, memberIds: null };
    // 실시간 동기화 채널
    try {
      CUR.channel = sb().channel("live:" + roomId, { config: { broadcast: { self: false } } });
      CUR.channel.on("broadcast", { event: "sync" }, () => refreshState());
      CUR.channel.on("broadcast", { event: "react" }, ({ payload }) => spawnFloat(payload && payload.emo));
      CUR.channel.on("broadcast", { event: "super" }, ({ payload }) => showSuper(payload));
      CUR.channel.on("broadcast", { event: "sys" }, ({ payload }) => sysMsg(payload && payload.text));
      CUR.channel.on("broadcast", { event: "present" }, ({ payload }) => renderPresent(payload));
      CUR.channel.subscribe();
    } catch (e) {}
    // 입장 시 현재 띄운 자료 동기화(late-join)
    (async () => {
      try { const { data } = await sb().rpc("live_get_present", { p_room: roomId }); const p = data && data[0];
        if (p && p.present_type) renderPresent({ type: p.present_type, id: p.present_id, title: p.present_title }); } catch (e) {}
    })();
    // 내가 열었다/입장했다 — 시스템 안내 + 토스트
    if (entry === "open") { sysMsg("🎙 육성 난장을 열었어요"); toast("🎙 육성 난장을 열었어요"); }
    else if (entry === "join") { sysMsg("👋 입장했어요"); toast("👋 육성 난장에 입장했어요"); }
    // 리액션·후원·공유
    ov.querySelectorAll("#lv-react [data-emo]").forEach(b => b.onclick = () => sendReaction(b.dataset.emo));
    ov.querySelector("#lv-super").onclick = openSuper;
    ov.querySelector("#lv-share").onclick = shareRoom;
    ov.querySelector("#lv-present-open").onclick = openPresentSearch;
    refreshState();
    refreshTimer = setInterval(refreshState, 4000);   // 안전망 폴링
    connectAudio();   // 음성(있으면), 없으면 '준비중' 표시
  }

  function broadcastSync() { try { CUR && CUR.channel && CUR.channel.send({ type: "broadcast", event: "sync", payload: {} }); } catch (e) {} }

  // 페이지 실제 언로드 시 최선노력 퇴장. iOS 스와이프 강제종료는 이게 안 불릴 수 있어
  // 서버 reaper(하트비트 멈춤 → 45s 뒤 방 정리)가 최종 안전망이다.
  // ⚠️ visibilitychange(잠금·앱전환)로는 내보내지 않는다 — 라이브 청취 중 화면만 꺼도
  //    쫓겨나면 안 되므로(백그라운드 45s까지는 유지, 그 뒤 reaper가 정리).
  window.addEventListener("pagehide", function () {
    if (!CUR) return;
    try { sb().rpc("live_leave", { p_room: CUR.roomId }); } catch (e) {}
  });

  async function refreshState() {
    if (!CUR) return;
    // 하트비트 — 앱을 강제 종료하면 이게 멈춰 45s 뒤 서버가 방을 자동 정리(유령 라이브 방지)
    try { sb().rpc("live_heartbeat", { p_room: CUR.roomId }); } catch (e) {}
    let rows = [];
    try { const { data } = await sb().rpc("live_room_state", { p_room: CUR.roomId }); rows = data || []; } catch (e) {}
    if (!CUR) return;
    // 방이 사라졌거나(종료) 내가 빠졌으면 닫기
    const me = rows.find(r => r.user_id === ME);
    if (!rows.length) { toast("육성 난장이 종료됐어요."); return closeStage(); }
    CUR.state = rows;
    CUR.nicks = CUR.nicks || {};
    rows.forEach(r => { CUR.nicks[r.user_id] = r.nickname || "익명"; });
    // 입장/퇴장 안내 — 이전 멤버 집합과 비교(나 자신·최초 로드 제외)
    const ids = new Set(rows.map(r => r.user_id));
    if (CUR.memberIds) {
      ids.forEach(id => { if (id !== ME && !CUR.memberIds.has(id)) sysMsg("👋 " + (CUR.nicks[id] || "익명") + " 님 입장"); });
      CUR.memberIds.forEach(id => { if (id !== ME && !ids.has(id)) sysMsg("🚪 " + (CUR.nicks[id] || "익명") + " 님 퇴장"); });
    }
    CUR.memberIds = ids;
    const wasRole = CUR.role;
    if (me) { CUR.role = me.role; CUR.muted = me.muted; CUR.hand = me.hand_raised; }
    // 내가 청중→스피커로 승격됐을 때 안내
    if (wasRole === "listener" && CUR.role === "speaker") { sysMsg("🎤 무대에 올랐어요 — 마이크가 켜졌어요"); toast("🎤 무대에 올랐어요!"); }
    // 청중→스피커 승격되면 자동으로 마이크 발행
    if (CUR.cf && (CUR.role === "host" || CUR.role === "speaker") && !CUR.cf.pubTrack) maybePublish();
    render();
  }

  /* ── 📌 자료 프리젠테이션 (이슈/예측/뉴스/광장 검색해 무대에 띄우기) ─────────
     방장은 방송 중 나갈 수 없으니, 콘텐츠를 방 안으로 끌어와 제시한다. 검색→선택→
     전원 상단 배너 고정(broadcast + 방 상태 저장으로 late-join 동기화). */
  const PT = {
    issue:  { ic: "🗳", label: "이슈",   url: id => `issue.html?id=${id}` },
    market: { ic: "🔮", label: "예측",   url: id => `predict-market.html?id=${id}` },
    news:   { ic: "📰", label: "뉴스",   url: id => `news.html?gn=${id}` },
    plaza:  { ic: "🗣", label: "광장",   url: id => `plaza_detail.html?id=${id}` },
  };
  async function searchContent(q) {
    q = (q || "").trim(); if (q.length < 1) return [];
    const like = `%${q}%`;
    const runs = [
      sb().from("issues").select("id,title").or(`title.ilike.${like},category.ilike.${like}`).limit(6)
        .then(r => (r.data || []).map(x => ({ type: "issue", id: x.id, title: x.title }))),
      sb().from("markets").select("id,question").ilike("question", like).limit(6)
        .then(r => (r.data || []).map(x => ({ type: "market", id: x.id, title: x.question }))),
      sb().from("galla_news").select("id,title").ilike("title", like).limit(6)
        .then(r => (r.data || []).map(x => ({ type: "news", id: x.id, title: x.title }))),
      sb().from("plaza_posts").select("id,title").or(`title.ilike.${like},body.ilike.${like}`).limit(6)
        .then(r => (r.data || []).map(x => ({ type: "plaza", id: x.id, title: x.title }))),
    ];
    try { const groups = await Promise.all(runs); return [].concat.apply([], groups); }
    catch (e) { return []; }
  }
  function openPresentSearch() {
    if (!CUR || CUR.role !== "host") return;
    const ov = document.getElementById("lv-stage"); if (!ov || ov.querySelector("#lv-pres-sheet")) return;
    const sheet = document.createElement("div");
    sheet.id = "lv-pres-sheet"; sheet.className = "lv-sheet";
    sheet.innerHTML = `
      <div class="lv-sheet-dim"></div>
      <div class="lv-sheet-card lv-pres-card">
        <div class="lv-sheet-h">📌 무대에 자료 띄우기 <small>이슈·예측·뉴스·광장</small></div>
        <input id="lv-pres-q" class="lv-new-in" placeholder="주제 검색 (예: 대선, 금리, 손흥민…)" autocomplete="off">
        <div id="lv-pres-res" class="lv-pres-res"><div class="lv-pres-hint">키워드를 입력하면 콘텐츠를 찾아드려요.</div></div>
        <div class="lv-sheet-btns"><button id="lv-pres-cancel" type="button">닫기</button></div>
      </div>`;
    ov.appendChild(sheet);
    const q = sheet.querySelector("#lv-pres-q");
    const res = sheet.querySelector("#lv-pres-res");
    const close = () => sheet.remove();
    sheet.querySelector("#lv-pres-cancel").onclick = close;
    sheet.querySelector(".lv-sheet-dim").onclick = close;
    let t = null;
    q.oninput = () => {
      clearTimeout(t);
      const kw = q.value.trim();
      if (!kw) { res.innerHTML = `<div class="lv-pres-hint">키워드를 입력하면 콘텐츠를 찾아드려요.</div>`; return; }
      res.innerHTML = `<div class="lv-pres-hint">검색 중…</div>`;
      t = setTimeout(async () => {
        const rows = await searchContent(kw);
        if (q.value.trim() !== kw) return;   // 오래된 결과 버림
        if (!rows.length) { res.innerHTML = `<div class="lv-pres-hint">‘${esc(kw)}’ 결과가 없어요.</div>`; return; }
        res.innerHTML = rows.map(r => `
          <button class="lv-pres-item" data-type="${esc(r.type)}" data-id="${esc(String(r.id))}" data-title="${esc(r.title || "")}" type="button">
            <span class="lv-pres-ic">${PT[r.type].ic}</span>
            <span class="lv-pres-tx"><b>${esc(r.title || "제목 없음")}</b><span>${PT[r.type].label}</span></span>
            <span class="lv-pres-go">무대로 ›</span>
          </button>`).join("");
        res.querySelectorAll(".lv-pres-item").forEach(b => b.onclick = () => {
          setPresent(b.dataset.type, b.dataset.id, b.dataset.title); close();
        });
      }, 280);
    };
    setTimeout(() => q.focus(), 60);
  }
  async function setPresent(type, id, title) {
    if (!CUR) return;
    const payload = { type, id, title };
    renderPresent(payload);
    try { CUR.channel.send({ type: "broadcast", event: "present", payload }); } catch (e) {}
    sysMsg("📌 " + (PT[type] ? PT[type].label : "자료") + " 자료를 무대에 띄웠어요");
    try { await sb().rpc("live_set_present", { p_room: CUR.roomId, p_type: type, p_id: String(id), p_title: title || "" }); } catch (e) {}
  }
  async function clearPresent() {
    if (!CUR) return;
    renderPresent(null);
    try { CUR.channel.send({ type: "broadcast", event: "present", payload: { type: null } }); } catch (e) {}
    try { await sb().rpc("live_set_present", { p_room: CUR.roomId, p_type: null, p_id: null, p_title: null }); } catch (e) {}
  }
  function renderPresent(p) {
    const el = document.getElementById("lv-present"); if (!el) return;
    if (!p || !p.type || !PT[p.type]) { el.hidden = true; el.innerHTML = ""; return; }
    const isHost = CUR && CUR.role === "host";
    const meta = PT[p.type];
    el.hidden = false;
    el.innerHTML = `
      <span class="lv-present-ic">${meta.ic}</span>
      <span class="lv-present-tx"><span class="lv-present-lab">지금 보는 자료 · ${meta.label}</span><b>${esc(p.title || "자료")}</b></span>
      ${isHost ? `<button class="lv-present-x" id="lv-present-clear" type="button" aria-label="내리기">✕</button>`
               : `<button class="lv-present-open2" data-url="${esc(meta.url(p.id))}" type="button">열기</button>`}`;
    const clr = el.querySelector("#lv-present-clear"); if (clr) clr.onclick = clearPresent;
    // 청중은 탭하면 콘텐츠로 이동(라이브를 떠나 볼 수 있음). 호스트는 이동 금지(나가면 방 파괴).
    const ob = el.querySelector(".lv-present-open2");
    if (ob) ob.onclick = () => { location.href = ob.dataset.url; };
  }

  /* ── 실시간 채팅 (open_messages 재사용) ─────────────────────────────────── */
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
  // 시스템 안내(입장/퇴장/개설/종료) — 채팅 중앙 회색 라인
  function sysMsg(text) {
    const box = chatBox(); if (!box || !text) return;
    const row = document.createElement("div");
    row.className = "lv-sys";
    row.textContent = text;
    box.appendChild(row);
    box.scrollTop = box.scrollHeight;
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
    const title = (document.getElementById("lv-title")?.textContent || "GALLA 육성 난장").trim();
    const url = (location.origin && /^https?:/.test(location.origin) ? location.origin : "https://galla.im") + "/dm.html";
    const text = title + " — 지금 육성 난장 중! 들으러 와요 🎧";
    if (window.GALLA_share) { window.GALLA_share({ url, title: "🎙 " + title, text }); return; }
    if (navigator.share) { navigator.share({ title: "🎙 " + title, text, url }).catch(() => {}); return; }
    // 최후 폴백 — 링크 클립보드 복사
    try { navigator.clipboard.writeText(url); toast("링크를 복사했어요 📋"); }
    catch (e) { toast("공유를 지원하지 않는 브라우저예요."); }
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

    // 사람 클릭 — 프로필 시트(팔로우/언팔 · 호스트면 모더레이션 포함)
    ov.querySelectorAll(".lv-person").forEach(b => b.onclick = () => openProfile(b.dataset.uid));

    // 자료(프리젠테이션) 버튼 — 호스트만
    const presBtn = ov.querySelector("#lv-present-open"); if (presBtn) presBtn.hidden = !isHost;

    // 하단 바
    const bar = ov.querySelector("#lv-bar");
    const canSpeak = CUR.role === "host" || CUR.role === "speaker";
    let html = "";
    if (canSpeak) {
      html += `<button class="lv-bbtn ${CUR.muted ? "" : "act"}" id="lv-mute">${CUR.muted ? "🔇 뮤트됨" : "🎙 말하는 중"}</button>`;
    } else {
      html += `<button class="lv-bbtn ${CUR.hand ? "act" : ""}" id="lv-hand">${CUR.hand ? "✋ 손 든 상태" : "✋ 손들기"}</button>`;
    }
    // 스피커(호스트 제외)는 스스로 청중으로 내려갈 수 있다
    if (CUR.role === "speaker") html += `<button class="lv-bbtn" id="lv-stepdown">🙇 내려가기</button>`;
    // 호스트 전용 출구 = '방 뽀개기'(확인 필수). 호스트에겐 일반 '나가기'를 숨긴다(나가면 곧 방 파괴라 동일).
    if (isHost) html += `<button class="lv-bbtn danger" id="lv-end">🧨 방 뽀개기</button>`;
    else html += `<button class="lv-bbtn" id="lv-leave">나가기</button>`;
    bar.innerHTML = html;
    const mb = bar.querySelector("#lv-mute"); if (mb) mb.onclick = toggleMute;
    const hb = bar.querySelector("#lv-hand"); if (hb) hb.onclick = toggleHand;
    const sd = bar.querySelector("#lv-stepdown"); if (sd) sd.onclick = stepDown;
    const eb = bar.querySelector("#lv-end"); if (eb) eb.onclick = endRoom;
    const lb = bar.querySelector("#lv-leave"); if (lb) lb.onclick = leave;
  }

  // 무대/청중 인물 탭 → 프로필 시트(팔로우·언팔 + 호스트면 모더레이션)
  function openProfile(uid) {
    if (!CUR || !uid) return;
    const s = (CUR.state || []).find(r => r.user_id === uid); if (!s) return;
    const ov = document.getElementById("lv-stage"); if (!ov || ov.querySelector("#lv-prof-sheet")) return;
    const mine = uid === ME;
    const isHost = CUR.role === "host";
    const roleLabel = s.role === "host" ? "👑 호스트" : s.role === "speaker" ? "🎙 스피커" : "👥 청중";
    let mod = "";
    if (isHost && !mine && s.role !== "host") {
      const isSpk = s.role === "speaker";
      mod = `<div class="lv-prof-mod">
          <button class="lv-prof-mbtn" data-mod="role" type="button">${isSpk ? "🔽 청중으로 내리기" : "🔼 스피커로 올리기"}</button>
          ${!s.muted ? `<button class="lv-prof-mbtn" data-mod="mute" type="button">🔇 뮤트</button>` : ""}
        </div>`;
    }
    const sheet = document.createElement("div");
    sheet.id = "lv-prof-sheet"; sheet.className = "lv-sheet";
    sheet.innerHTML = `
      <div class="lv-sheet-dim"></div>
      <div class="lv-sheet-card lv-prof-card">
        <div class="lv-prof-top">
          <span class="lv-prof-ava">${avatar(s.avatar_url)}</span>
          <div class="lv-prof-meta"><b>${esc(s.nickname || "익명")}</b><span class="lv-prof-role">${roleLabel}</span></div>
        </div>
        ${mine ? `<div class="lv-prof-self">나예요 🙂</div>`
          : `<button class="js-follow lv-prof-follow" data-uid="${esc(uid)}" type="button">+ 팔로우</button>`}
        ${mod}
      </div>`;
    ov.appendChild(sheet);
    const close = () => sheet.remove();
    sheet.querySelector(".lv-sheet-dim").onclick = close;
    if (window.GALLA_bindFollow) window.GALLA_bindFollow(sheet);   // 팔로우 상태·토글 바인딩
    sheet.querySelectorAll("[data-mod]").forEach(b => b.onclick = async () => {
      const kind = b.dataset.mod;
      if (kind === "role") {
        const isSpk = s.role === "speaker";
        const { data } = await sb().rpc("live_set_role", { p_room: CUR.roomId, p_target: uid, p_role: isSpk ? "listener" : "speaker" });
        if (data && !data.ok && data.reason === "full") toast("무대가 꽉 찼어요.");
      } else if (kind === "mute") {
        await sb().rpc("live_set_mute", { p_room: CUR.roomId, p_target: uid, p_muted: true });
      }
      close(); broadcastSync(); refreshState();
    });
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
  async function stepDown() {
    if (!CUR || CUR.role !== "speaker") return;
    // 마이크 발행 중단 + 청중으로 강등
    try { const cf = CUR.cf; if (cf && cf.pubTrack) { cf.pubTrack.stop(); cf.pubTrack = null; cf.myTrackName = null; } } catch (e) {}
    CUR.role = "listener"; CUR.muted = true; render();
    try { await sb().rpc("live_step_down", { p_room: CUR.roomId }); } catch (e) {}
    sysMsg("🙇 무대에서 내려왔어요"); toast("🙇 청중으로 내려왔어요");
    broadcastSync(); refreshState();
  }
  async function endRoom() {
    if (!CUR || !confirm("🧨 방을 뽀갤까요?\n육성 난장이 끝나고 청중 모두 퇴장돼요.")) return;
    // 청중에게도 종료 안내가 뜨도록 먼저 broadcast
    try { CUR.channel.send({ type: "broadcast", event: "sys", payload: { text: "🔴 호스트가 육성 난장을 종료했어요" } }); } catch (e) {}
    try { await sb().rpc("live_end", { p_room: CUR.roomId }); } catch (e) {}
    broadcastSync(); closeStage();
    toast("🔴 육성 난장을 종료했어요");
  }
  async function leave() {
    // 호스트가 나가면 방이 사라진다 → 반드시 '방 뽀개기' 확인을 거친다(✕·나가기 모두)
    if (CUR && CUR.role === "host") return endRoom();
    const room = CUR && CUR.roomId;
    // 남은 사람들에게 내 퇴장 안내(내 상태가 사라지기 전에)
    try { CUR && CUR.channel.send({ type: "broadcast", event: "sys", payload: { text: "🚪 " + ((CUR.nicks && CUR.nicks[ME]) || "누군가") + " 님 퇴장" } }); } catch (e) {}
    closeStage();
    try { if (room) await sb().rpc("live_leave", { p_room: room }); } catch (e) {}
    broadcastSync();
    refreshSection();
    toast("육성 난장에서 나왔어요");
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
    navHide(false);
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
    // 발행자가 아직 패킷을 안 보내면 not_found_track_error — 재시도(스피커가 막 켠 경우 대비)
    for (let i = 0; i < 6; i++) {
      if (!CUR || CUR.cf !== cf) return;
      try {
        const res = await sfu(`/sessions/${cf.sessionId}/tracks/new`, "POST",
          { tracks: [{ location: "remote", sessionId: p.sessionId, trackName: p.trackName }] });
        const sd = res && res.data && res.data.sessionDescription;
        if (res && res.ok && sd && sd.type === "offer") {
          await cf.pc.setRemoteDescription(sd);
          const answer = await cf.pc.createAnswer();
          await cf.pc.setLocalDescription(answer);
          await sfu(`/sessions/${cf.sessionId}/renegotiate`, "PUT", { sessionDescription: { type: "answer", sdp: answer.sdp } });
          return;   // 성공
        }
        const err = res && res.data && res.data.tracks && res.data.tracks[0] && res.data.tracks[0].errorCode;
        if (err !== "not_found_track_error") break;   // 다른 오류면 재시도 무의미
      } catch (e) { break; }
      await new Promise(r => setTimeout(r, 1300));   // 잠시 후 재시도
    }
    cf.subs.delete(p.uid);   // 실패 → 나중에 재-announce 시 다시 구독 가능
  }
  function stopAudio(cf) {
    if (!cf) return;
    try { cf.pubTrack && cf.pubTrack.stop(); } catch (e) {}
    try { cf.pc && cf.pc.close(); } catch (e) {}
    (cf.els || []).forEach(el => { try { el.srcObject = null; el.remove(); } catch (e) {} });
  }

  /* ── 콘텐츠 → 라이브 파이프라인 (이슈/예측/광장에서 육성 열기·입장) ──────── */
  async function ensureMe() {
    if (ME) return ME;
    try { const { data } = await sb().auth.getSession(); ME = data?.session?.user?.id || null; } catch (e) {}
    return ME;
  }
  // 열거나(없으면) 입장한다(있으면). 콘텐츠 연계 라이브.
  window.GALLA_liveLaunch = async function (linkType, linkId, title, topic) {
    if (!sb()) return;
    if (!(await ensureMe())) { if (window.GALLA_needLogin) window.GALLA_needLogin("육성 난장은 로그인 후 이용할 수 있어요."); return; }
    ensureCSS();
    try {
      const { data } = await sb().rpc("live_room_for_link", { p_link_type: linkType, p_link_id: String(linkId) });
      const ex = data && data[0];
      if (ex) { await sb().rpc("live_join", { p_room: ex.id }); return openStage(ex.id, ex.title, "", "join"); }
    } catch (e) {}
    if (!confirm("이 주제로 육성 난장을 열까요?")) return;
    try {
      const { data: id, error } = await sb().rpc("live_room_create",
        { p_title: title || "육성 난장", p_topic: topic || "", p_link_type: linkType, p_link_id: String(linkId) });
      if (error || !id) return toast("육성 난장 개설에 실패했어요.");
      openStage(id, title || "육성 난장", topic || "", "open");
    } catch (e) { toast("육성 난장 개설에 실패했어요."); }
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
    pill.innerHTML = `🎙 <span>육성 난장</span>`;
    document.body.appendChild(pill);
    pill.onclick = () => window.GALLA_liveLaunch(link.type, link.id, link.title, "");
    async function poll() {
      if (!sb() || !document.getElementById("lv-pill")) return;
      try {
        const { data } = await sb().rpc("live_room_for_link", { p_link_type: link.type, p_link_id: String(link.id) });
        const ex = data && data[0];
        if (ex) { pill.classList.add("on"); pill.innerHTML = `🔴 <span>육성 난장 ${ex.listeners || 1}명</span>`; }
        else { pill.classList.remove("on"); pill.innerHTML = `🎙 <span>육성 난장 열기</span>`; }
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
    .lv-lobby-search{margin:0 0 10px}
    .lv-lobby-search input{width:100%;box-sizing:border-box;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:11px 14px;color:#fff;font-size:13.5px}
    .lv-lobby-search input:focus{outline:0;border-color:#6f86ff}
    .lv-lobby-search input::placeholder{color:#6b7280}
    .lv-hot{font-size:10.5px;font-weight:900;color:#ff9f43}
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
    /* 📌 무대 자료 배너 */
    .lv-present{display:flex;align-items:center;gap:11px;margin:0 16px 8px;padding:11px 13px;border-radius:14px;
      background:linear-gradient(135deg,rgba(111,134,255,.18),rgba(111,134,255,.05));border:1px solid rgba(111,134,255,.4)}
    .lv-present-ic{font-size:22px;flex:0 0 auto}
    .lv-present-tx{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
    .lv-present-lab{font-size:10.5px;font-weight:800;color:#8aa0ff;letter-spacing:.2px}
    .lv-present-tx b{font-size:14px;font-weight:900;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .lv-present-x{flex:0 0 auto;width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,.1);border:0;color:#fff;font-size:13px;cursor:pointer}
    .lv-present-open2{flex:0 0 auto;padding:8px 14px;border-radius:999px;border:0;background:#6f86ff;color:#fff;font-size:12.5px;font-weight:900;cursor:pointer}
    .lv-present-btn{flex:0 0 auto;font-size:12.5px;font-weight:900;color:#fff;background:rgba(111,134,255,.9);border:0;padding:8px 12px}
    /* 자료 검색 시트 */
    .lv-pres-res{max-height:46vh;overflow-y:auto;margin:4px 0 12px;display:flex;flex-direction:column;gap:6px}
    .lv-pres-hint{padding:22px 8px;text-align:center;font-size:12.5px;color:#8a90a0}
    .lv-pres-item{display:flex;align-items:center;gap:11px;width:100%;padding:11px 12px;border-radius:12px;cursor:pointer;text-align:left;
      background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08)}
    .lv-pres-item:active{background:rgba(255,255,255,.09)}
    .lv-pres-ic{font-size:20px;flex:0 0 auto}
    .lv-pres-tx{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
    .lv-pres-tx b{font-size:13.5px;font-weight:800;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}
    .lv-pres-tx span{font-size:11px;color:#8a90a0;font-weight:700}
    .lv-pres-go{flex:0 0 auto;font-size:11.5px;font-weight:900;color:#8aa0ff}
    .lv-stage-body{flex:0 1 auto;max-height:46vh;overflow-y:auto;padding:6px 16px 12px}
    .lv-chat{flex:1 1 auto;overflow-y:auto;padding:6px 16px;display:flex;flex-direction:column;gap:6px;min-height:60px;border-top:1px solid rgba(255,255,255,.06)}
    .lv-msg{font-size:13px;line-height:1.4;color:#dfe4f0;word-break:break-word}
    .lv-msg b{color:#8aa0ff;font-weight:800;margin-right:5px}
    .lv-msg.mine b{color:#7ef0ae}
    .lv-sys{align-self:center;font-size:11.5px;color:#8a90a0;background:rgba(255,255,255,.05);border-radius:999px;padding:3px 11px;margin:2px 0}
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
    /* 무대 밖(난장 로비)에서 여는 모달 = 화면 최상위 고정 */
    .lv-modal{position:fixed;z-index:2147483200;opacity:0;transition:opacity .2s ease}
    .lv-modal.on{opacity:1}
    .lv-modal .lv-sheet-card{transform:translateY(14px);transition:transform .24s cubic-bezier(.2,.9,.3,1)}
    .lv-modal.on .lv-sheet-card{transform:none}
    .lv-new-card{padding-top:20px}
    .lv-new-h{display:flex;align-items:center;gap:8px;font-size:17px;font-weight:950;color:#fff;margin-bottom:16px}
    .lv-new-l{display:block;font-size:12px;font-weight:800;color:#8a90a0;margin:0 2px 7px}
    .lv-new-l small{font-weight:700;color:#5f6675;margin-left:3px}
    .lv-new-in{width:100%;box-sizing:border-box;background:#0e1015;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:13px 14px;color:#fff;font-size:14.5px;margin-bottom:14px;transition:border-color .15s ease}
    .lv-new-in:focus{outline:0;border-color:#6f86ff}
    .lv-new-in::placeholder{color:#5f6675}
    .lv-sheet-btns #lv-new-cancel{flex:0 0 auto;padding:13px 18px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:none;color:#c8cede;font-weight:800;cursor:pointer}
    .lv-sheet-btns #lv-new-go{flex:1;padding:13px;border-radius:12px;border:0;background:linear-gradient(135deg,#ff4d67,#ff2d55);color:#fff;font-size:15px;font-weight:950;cursor:pointer}
    .lv-sheet-btns #lv-new-go:disabled{opacity:.4}
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
    .lv-prof-card{max-width:480px}
    .lv-prof-top{display:flex;align-items:center;gap:14px;margin-bottom:16px}
    .lv-prof-ava{position:relative;width:60px;height:60px;border-radius:50%;overflow:hidden;flex:0 0 auto;background:#222634;display:flex;align-items:center;justify-content:center}
    .lv-prof-ava img{width:100%;height:100%;object-fit:cover}
    .lv-prof-meta{min-width:0}.lv-prof-meta b{display:block;font-size:18px;font-weight:950;color:#fff}
    .lv-prof-role{font-size:12.5px;color:#8a90a0;font-weight:800}
    .lv-prof-follow{width:100%;padding:13px;border-radius:12px;border:0;background:linear-gradient(135deg,#6f86ff,#4d63ff);color:#fff;font-size:14.5px;font-weight:900;cursor:pointer}
    .lv-prof-follow.following{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16)}
    .lv-prof-follow:active{transform:scale(.98)}
    .lv-prof-self{text-align:center;color:#8a90a0;font-size:13.5px;font-weight:800;padding:8px 0}
    .lv-prof-mod{display:flex;gap:8px;margin-top:10px}
    .lv-prof-mbtn{flex:1;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);color:#fff;font-size:13px;font-weight:900;cursor:pointer}
    .lv-prof-mbtn:active{transform:scale(.98)}
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
