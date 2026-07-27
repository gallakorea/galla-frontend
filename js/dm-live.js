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
  // SPA 단일문서(app.html, data-page="spa")에선 dm 뷰 어댑터가 이 파일을 로드한다 — DM 취급
  const IS_DM = document.body.getAttribute("data-page") === "dm" || document.body.getAttribute("data-page") === "spa";
  // 육성 난장 자료 뷰어(iframe)로 열린 콘텐츠면 '육성 난장 열기' 필을 띄우지 않는다
  // (뷰어 안에서 또 방을 여는 중첩 방지 — 사장님 제보)
  let LV_EMBED = false; try { LV_EMBED = new URLSearchParams(location.search).get("lvembed") === "1"; } catch (e) {}
  const sb = () => window.supabaseClient;
  let ME = null;
  let CUR = null;          // { room, channel, state, role, muted, hand, audio }
  let refreshTimer = null;
  let hbTimer = null;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  function toast(m) { try { if (window.GALLA_toast) window.GALLA_toast(m); } catch (e) {} }
  // 셸(네이티브) 하단 nav 숨김 — 라이브 무대는 풀스크린이라 nav가 위로 겹쳐 보이면 안 됨
  // SPA 단일문서면 라우터 API 직접 호출, 구 iframe 셸이면 기존 postMessage 중계(둘 다 유지)
  function navHide(on) {
    try { if (window.GALLA_SPA && window.GALLA_SPA.navHide) window.GALLA_SPA.navHide(on); } catch (e) {}
    try { if (window.parent && window.parent !== window) window.parent.postMessage({ galla: "shell", t: "navhide", on: on }, location.origin); } catch (e) {}
  }
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
    // 🔎 통합 검색창 = 난장 탭 '맨 위'(난장 열기 바보다 위) — 1회만 주입, 폴링에도 유지
    if (!document.getElementById("lv-lobby-search")) {
      const sw = document.createElement("div");
      sw.id = "lv-lobby-search"; sw.className = "lv-lobby-search";
      sw.innerHTML = `<input id="lv-lobby-q" placeholder="🔎 난장 검색 (육성·일반 통합)" autocomplete="off">`;
      rooms.insertBefore(sw, rooms.firstChild);
      const qi = sw.querySelector("#lv-lobby-q");
      // 통합 검색 — 같은 검색어로 육성(아래 섹션)과 일반 난장(dm.js 목록)을 동시에 거른다
      qi.oninput = () => {
        LOBBY_Q = qi.value; paintLobbyCards();
        try { window.GALLA_roomFilter && window.GALLA_roomFilter(qi.value); } catch (e) {}
      };
    }
    let sec = document.getElementById("dm-live-sec");
    // 헤더(제목·열기)는 1회만 — 카드만 갱신
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
        <div id="lv-lobby-cards"></div>`;
      sec.querySelector("#lv-open").onclick = createLive;
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
      if (!data || !data.ok) return toast(
        data && data.reason === "banned" ? "🚫 이 방에서 내보내져 다시 들어갈 수 없어요." :
        data && data.reason === "ended" ? "이미 끝난 육성 난장이에요." : "입장에 실패했어요.");
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
        <button class="lv-x" id="lv-x" type="button" aria-label="나가기">나가기</button>
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
        <div class="lv-react-emos">
          ${["❤️","😂","👏","🔥","💀","😡","😱","🎉","👍","💩"].map(e => `<button data-emo="${e}" type="button">${e}</button>`).join("")}
        </div>
        <div class="lv-react-acts">
          <button class="lv-present-btn" id="lv-present-open" type="button" aria-label="자료" hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
          </button>
          <button class="lv-super" id="lv-super" type="button">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg><span>쏘기</span>
          </button>
          <button class="lv-share" id="lv-share" type="button" aria-label="공유">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5 15.4 17.5M15.4 6.5 8.6 10.5"/></svg>
          </button>
        </div>
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
      CUR.channel.on("broadcast", { event: "ended" }, () => onRoomBoom());
      CUR.channel.on("broadcast", { event: "kick" }, ({ payload }) => { if (payload && payload.uid === ME) onKicked(); });
      CUR.channel.on("broadcast", { event: "chat" }, ({ payload }) => { if (payload && payload.sender_id !== ME) appendMsg(payload); });
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
    heartbeat();                                   // 입장 즉시 1회
    refreshState();
    refreshTimer = setInterval(refreshState, 4000);   // 안전망 폴링(하트비트 동승)
    hbTimer = setInterval(heartbeat, 12000);          // 별도 하트비트(refreshState 실패에도 생존신호 유지)
    connectAudio();   // 음성(있으면), 없으면 '준비중' 표시
  }

  // 생존 신호 — 멈추면 서버 reaper가 120s 뒤 방 정리. 포그라운드 복귀 시 즉시 재송신.
  function heartbeat() { if (!CUR) return; try { sb().rpc("live_heartbeat", { p_room: CUR.roomId }); } catch (e) {} }
  document.addEventListener("visibilitychange", function () { if (!document.hidden && CUR) { heartbeat(); refreshState(); } });

  function broadcastSync() { try { CUR && CUR.channel && CUR.channel.send({ type: "broadcast", event: "sync", payload: {} }); } catch (e) {} }

  // 페이지 실제 언로드 시 최선노력 퇴장. iOS 스와이프 강제종료는 이게 안 불릴 수 있어
  // 서버 reaper(하트비트 멈춤 → 120s 뒤 방 정리)가 최종 안전망이다.
  // ⚠️ visibilitychange(잠금·앱전환)로는 내보내지 않는다 — 육성 청취 중 화면만 꺼도
  //    쫓겨나면 안 되므로(백그라운드 120s까지는 유지, 그 뒤 reaper가 정리).
  window.addEventListener("pagehide", function (e) {
    if (!CUR) return;
    // ⚠️ 호스트는 pagehide로 나가지 않는다 — bfcache/잠깐 백그라운드로 pagehide가 튀면
    //    방이 통째로 파괴돼 억울하게 튕긴다. 호스트 퇴장은 오직 '방 뽀개기'로만.
    //    (bfcache로 잠시 숨는 경우 e.persisted=true — 이땐 청중도 나가지 않음)
    if (CUR.role === "host" || (e && e.persisted)) return;
    try { sb().rpc("live_leave", { p_room: CUR.roomId }); } catch (e2) {}
  });

  async function refreshState() {
    if (!CUR) return;
    heartbeat();   // 폴링마다 생존 신호(별도 hbTimer와 이중화 — 멈추면 120s 뒤 서버 정리)
    let rows = null;   // null = 조회 실패(순단) → 이번 폴링 스킵, 절대 닫지 않음
    try { const { data, error } = await sb().rpc("live_room_state", { p_room: CUR.roomId }); if (!error) rows = data || []; } catch (e) {}
    if (!CUR) return;
    if (rows === null) return;   // 네트워크 순단 등 조회 실패 — 무대 유지(튕김 방지)
    // 방이 진짜 비었을 때만 닫는다. 단발 오탐 방지 위해 2회 연속 빈 결과여야 종료.
    if (!rows.length) {
      CUR.emptyHits = (CUR.emptyHits || 0) + 1;
      if (CUR.emptyHits >= 2) { toast("육성 난장이 종료됐어요."); return closeStage(); }
      return;   // 한 번의 빈 결과로는 닫지 않음
    }
    CUR.emptyHits = 0;
    const me = rows.find(r => r.user_id === ME);
    // 멤버는 있는데 내가 빠졌으면 = 강퇴/제거됨(broadcast 놓쳤어도 안전망). 단, 한 번이라도 나를 본 뒤에만.
    if (me) CUR.sawMe = true;
    else if (CUR.sawMe) { toast("🚫 방장이 내보냈어요"); return closeStage(); }
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
    if (wasRole !== "host" && CUR.role === "host") { sysMsg("👑 방장이 됐어요"); toast("👑 방장을 넘겨받았어요!"); }
    // 🎙 마이크 상태를 역할·뮤트에 '강제 일치'시킨다(단일 진실원):
    //    무대(host/speaker)면 발행, 청중이면 발행 중단, 발행 중이면 뮤트 반영.
    //    (예전엔 승격만 처리해 강등돼도 소리가 계속 나갔다 — 사장님 재현)
    if (CUR.cf) {
      const canSpeak = CUR.role === "host" || CUR.role === "speaker";
      if (canSpeak && !CUR.cf.pubTrack) maybePublish();
      else if (!canSpeak && CUR.cf.pubTrack) stopPublish(CUR.cf);
      if (CUR.cf.pubTrack) CUR.cf.pubTrack.enabled = !CUR.muted;   // 원격(호스트) 뮤트도 실제 반영
    }
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
      <button class="lv-present-open2" data-url="${esc(meta.url(p.id))}" type="button">보기</button>
      ${isHost ? `<button class="lv-present-x" id="lv-present-clear" type="button" aria-label="내리기">✕</button>` : ""}`;
    const clr = el.querySelector("#lv-present-clear"); if (clr) clr.onclick = clearPresent;
    // '보기'는 방을 나가지 않고 무대 위에 자료를 오버레이(조작 불가)로 본다. 방장도 동일(오버레이라 안전).
    const ob = el.querySelector(".lv-present-open2");
    if (ob) ob.onclick = () => openContentViewer(ob.dataset.url, p.title);
  }
  // 무대 위 자료 뷰어 — 방(육성)을 유지한 채 콘텐츠를 iframe으로 겹쳐 본다.
  function openContentViewer(url, title) {
    const stage = document.getElementById("lv-stage"); if (!stage || !url) return;
    if (stage.querySelector("#lv-view")) return;
    const v = document.createElement("div");
    v.id = "lv-view"; v.className = "lv-view";
    v.innerHTML = `
      <div class="lv-view-top">
        <button class="lv-view-x" id="lv-view-x" type="button" aria-label="닫기">✕</button>
        <b class="lv-view-title">${esc(title || "자료")}</b>
        <span class="lv-view-live">👀 미리보기 · 조작 불가</span>
      </div>
      <iframe class="lv-view-if" src="${esc(url + (url.indexOf("?") >= 0 ? "&" : "?") + "lvembed=1")}" allow="autoplay"></iframe>`;
    stage.appendChild(v);
    requestAnimationFrame(() => v.classList.add("on"));
    v.querySelector("#lv-view-x").onclick = () => { v.classList.remove("on"); setTimeout(() => v.remove(), 200); };
    // 읽기 전용 — 스크롤(읽기)은 되지만 진영선택·투표·버튼 등 모든 조작 차단.
    // 동일 출처 iframe이라 로드 후 캡처 단계에서 클릭/입력을 삼킨다(스크롤=touchmove는 건드리지 않음).
    const iframe = v.querySelector(".lv-view-if");
    iframe.addEventListener("load", () => {
      try {
        const d = iframe.contentDocument; if (!d) return;
        const st = d.createElement("style");
        st.textContent = "input,textarea,select{pointer-events:none!important}";
        (d.head || d.documentElement).appendChild(st);
        const swallow = e => { e.stopPropagation(); e.preventDefault(); };
        ["click", "dblclick", "submit", "keydown", "change", "contextmenu"].forEach(t =>
          d.addEventListener(t, swallow, true));   // 캡처 단계 → 대상 핸들러 도달 전 차단
      } catch (e) {}
    });
  }

  /* ── 실시간 채팅 (open_messages 재사용) ─────────────────────────────────── */
  function chatBox() { return document.getElementById("lv-chat"); }
  // 오래된 줄 정리 — 채팅·안내가 수백 줄 쌓여도 DOM이 안 무거워지게(최근 120줄 유지)
  function trimChat(box) { while (box.children.length > 120) box.removeChild(box.firstChild); }
  function appendMsg(m, atTop) {
    const box = chatBox(); if (!box || !CUR) return;
    const nick = m.nick || (CUR.nicks && CUR.nicks[m.sender_id]) || "익명";
    const mine = m.sender_id === ME;
    const row = document.createElement("div");
    row.className = "lv-msg" + (mine ? " mine" : "");
    row.innerHTML = `<b>${esc(nick)}</b> <span>${esc(m.body)}</span>`;
    if (atTop) box.insertBefore(row, box.firstChild); else box.appendChild(row);
    trimChat(box);
    if (!atTop) box.scrollTop = box.scrollHeight;
  }
  // 시스템 안내(입장/퇴장/개설/종료) — 채팅 중앙 회색 라인
  function sysMsg(text) {
    const box = chatBox(); if (!box || !text) return;
    const row = document.createElement("div");
    row.className = "lv-sys";
    row.textContent = text;
    box.appendChild(row);
    trimChat(box);
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
    // 신규 메시지 = broadcast로 즉시 전달(리액션·쏘기와 동일). postgres_changes 실시간
    // RLS/구독 이슈로 남의 채팅이 안 뜨던 문제 → 방 채널 broadcast('chat')로 확실히 전달.
  }
  async function sendChat() {
    const cin = document.getElementById("lv-chat-in"); if (!cin || !CUR) return;
    const body = (cin.value || "").trim(); if (!body) return;
    cin.value = "";
    const nick = (CUR.nicks && CUR.nicks[ME]) || "나";
    appendMsg({ sender_id: ME, body, nick });   // 낙관적(내 화면)
    try { CUR.channel.send({ type: "broadcast", event: "chat", payload: { sender_id: ME, body, nick } }); } catch (e) {}
    try { await sb().from("open_messages").insert({ room_id: CUR.roomId, sender_id: ME, body }); } catch (e) {}
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

    // 우상단 나가기 버튼 — 청중/스피커 '나가기', 호스트 '방 뽀개기'
    const xb = ov.querySelector("#lv-x");
    if (xb) { xb.textContent = isHost ? "🧨 방 뽀개기" : "나가기"; xb.classList.toggle("danger", isHost); }

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
    // 출구(나가기/방 뽀개기)는 우상단 버튼으로 통일 — 하단바 중복 제거
    bar.innerHTML = html;
    const mb = bar.querySelector("#lv-mute"); if (mb) mb.onclick = toggleMute;
    const hb = bar.querySelector("#lv-hand"); if (hb) hb.onclick = toggleHand;
    const sd = bar.querySelector("#lv-stepdown"); if (sd) sd.onclick = stepDown;
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
          <button class="lv-prof-mbtn" data-mod="host" type="button">👑 방장 넘기기</button>
          <button class="lv-prof-mbtn danger" data-mod="kick" type="button">🚫 쫓아내기</button>
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
    const nm = s.nickname || "이 사람";
    sheet.querySelectorAll("[data-mod]").forEach(b => b.onclick = async () => {
      const kind = b.dataset.mod;
      if (kind === "role") {
        const isSpk = s.role === "speaker";
        const { data } = await sb().rpc("live_set_role", { p_room: CUR.roomId, p_target: uid, p_role: isSpk ? "listener" : "speaker" });
        if (data && !data.ok && data.reason === "full") toast("무대가 꽉 찼어요.");
      } else if (kind === "mute") {
        await sb().rpc("live_set_mute", { p_room: CUR.roomId, p_target: uid, p_muted: true });
      } else if (kind === "host") {
        if (!confirm("👑 " + nm + "님에게 방장을 넘길까요?\n넘기면 나는 스피커가 됩니다.")) return;
        const { data } = await sb().rpc("live_transfer_host", { p_room: CUR.roomId, p_target: uid });
        if (data && data.ok) { try { CUR.channel.send({ type: "broadcast", event: "sys", payload: { text: "👑 방장이 " + nm + "님에게 넘어갔어요" } }); } catch (e) {} sysMsg("👑 " + nm + "님에게 방장을 넘겼어요"); }
        else toast("방장 넘기기에 실패했어요.");
      } else if (kind === "kick") {
        if (!confirm("🚫 " + nm + "님을 내보낼까요?\n다시 들어올 수 없어요.")) return;
        const { data } = await sb().rpc("live_kick", { p_room: CUR.roomId, p_target: uid });
        if (data && data.ok) { try { CUR.channel.send({ type: "broadcast", event: "kick", payload: { uid } }); } catch (e) {} sysMsg("🚫 " + nm + "님을 내보냈어요"); }
        else toast("내보내기에 실패했어요.");
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
    try { stopPublish(CUR.cf); } catch (e) {}
    CUR.role = "listener"; CUR.muted = true; render();
    try { await sb().rpc("live_step_down", { p_room: CUR.roomId }); } catch (e) {}
    sysMsg("🙇 무대에서 내려왔어요"); toast("🙇 청중으로 내려왔어요");
    broadcastSync(); refreshState();
  }
  // 청중측: 방장이 방을 뽀갬 → 안내 후 로비로 튕겨나온다
  function onRoomBoom() {
    if (!CUR) return;
    toast("🧨 방장이 방을 뽀갰어요");
    closeStage();   // 무대 닫고 refreshSection으로 로비 갱신
  }
  // 내가 강퇴됨 → 안내 후 로비로
  function onKicked() {
    if (!CUR) return;
    toast("🚫 방장이 내보냈어요");
    closeStage();
  }
  async function endRoom() {
    if (!CUR || !confirm("🧨 방을 뽀갤까요?\n육성 난장이 끝나고 청중 모두 퇴장돼요.")) return;
    // 청중을 로비로 내보내는 신호 — closeStage로 채널이 닫히기 전에 먼저 쏜다
    try { CUR.channel.send({ type: "broadcast", event: "ended", payload: {} }); } catch (e) {}
    try { await sb().rpc("live_end", { p_room: CUR.roomId }); } catch (e) {}
    // broadcast가 소켓으로 빠져나갈 시간을 살짝 준 뒤 무대 닫기(안 그러면 removeChannel이 먼저 끊음)
    setTimeout(() => { closeStage(); }, 150);
    toast("🧨 방을 뽀갰어요");
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
    if (hbTimer) { clearInterval(hbTimer); hbTimer = null; }
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
    // 🔧 진단(임시) — 무대 올라와도 소리 안 나는 지점 추적: 마이크/송신/수신/ICE
    cf.diag = { sess: true, mic: "-", tx: false, rx: 0, ice: pc.iceConnectionState || "new", err: "" };
    pc.oniceconnectionstatechange = () => { if (CUR && CUR.cf === cf) { cf.diag.ice = pc.iceConnectionState; renderDiag(cf); } };
    renderDiag(cf);
    CUR.audio = {
      setMuted(m) { try { if (cf.pubTrack) cf.pubTrack.enabled = !m; if (!m) maybePublish(); } catch (e) {} },
      stop() { stopAudio(cf); },
    };
    pc.ontrack = (e) => {
      try {
        const el = document.createElement("audio");
        el.autoplay = true; el.playsInline = true; el.srcObject = new MediaStream([e.track]);
        document.body.appendChild(el); cf.els.push(el);
        cf.diag.rx++; renderDiag(cf);
        el.play && el.play().catch(() => {});
      } catch (_) {}
    };
    // 다른 스피커 publish 정보 수신 → 구독. 입장 시 현재 pub 요청.
    try {
      CUR.channel.on("broadcast", { event: "pub" }, ({ payload }) => onPub(payload));
      CUR.channel.on("broadcast", { event: "pubask" }, () => announcePub());
      CUR.channel.send({ type: "broadcast", event: "pubask", payload: {} });
    } catch (e) {}
    renderDiag(cf);
    await maybePublish();
  }

  // 오디오 상태 배너 — 평소엔 숨기고, 실제 문제(마이크 거부·발행 실패·ICE 끊김)일 때만 안내.
  function renderDiag(cf) {
    const note = document.getElementById("lv-audio-note"); if (!note || !cf || !cf.diag) return;
    const d = cf.diag;
    let msg = "";
    if (d.err === "mic_denied") msg = "🎙 마이크 권한이 꺼져 있어요 — 설정에서 허용해 주세요.";
    else if (d.err && d.err.indexOf("pub") === 0) msg = "🔊 음성 송출에 실패했어요 — 무대를 내렸다 다시 올라와 주세요.";
    else if (d.ice === "failed" || d.ice === "disconnected") msg = "🔊 음성 연결이 불안정해요 — 네트워크를 확인해 주세요.";
    if (msg) { note.hidden = false; note.textContent = msg; }
    else { note.hidden = true; note.textContent = ""; }
  }

  // 발행 중단 — 강등/자진하차 시 마이크를 실제로 끈다(트랙 stop = SFU 송출 즉시 중단)
  function stopPublish(cf) {
    if (!cf || !cf.pubTrack) return;
    try { cf.pubTrack.stop(); } catch (e) {}
    cf.pubTrack = null; cf.myTrackName = null;
    cf.diag && (cf.diag.tx = false, cf.diag.mic = "-", renderDiag(cf));
  }

  async function maybePublish() {
    const cf = CUR && CUR.cf; if (!cf || cf.pubTrack || cf.pubBusy) return;   // pubBusy = 동시 호출(폴링+승격) 이중 발행 방지
    if (!(CUR.role === "host" || CUR.role === "speaker")) return;
    cf.pubBusy = true;
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
    catch (e) { cf.pubBusy = false; cf.diag.mic = "거부(" + (e && e.name || "err") + ")"; cf.diag.err = "mic_denied"; renderDiag(cf); toast("마이크를 켤 수 없어요 — 권한을 확인해 주세요."); return; }
    // 승격을 기다리는 사이 강등됐거나 무대가 닫혔으면 즉시 회수
    if (!CUR || CUR.cf !== cf || cf.pubTrack || !(CUR.role === "host" || CUR.role === "speaker")) {
      try { stream.getTracks().forEach(t => t.stop()); } catch (e) {}
      cf.pubBusy = false; return;
    }
    cf.diag.mic = "ON"; renderDiag(cf);
    const track = stream.getAudioTracks()[0];
    track.enabled = !CUR.muted;
    try {
      const tr = cf.pc.addTransceiver(track, { direction: "sendonly" });
      const offer = await cf.pc.createOffer();
      await cf.pc.setLocalDescription(offer);
      // 재발행(내려갔다 다시 올라옴) 시 이전 이름과 충돌하지 않게 매번 유니크 접미사
      const trackName = "mic-" + String(ME).slice(0, 8) + "-" + Date.now().toString(36);
      const res = await sfu(`/sessions/${cf.sessionId}/tracks/new`, "POST",
        { sessionDescription: { type: "offer", sdp: offer.sdp }, tracks: [{ location: "local", mid: tr.mid, trackName }] });
      if (res && res.ok && res.data && res.data.sessionDescription) {
        await cf.pc.setRemoteDescription(res.data.sessionDescription);
        cf.pubTrack = track; cf.myTrackName = trackName;
        cf.diag.tx = true; cf.diag.err = ""; renderDiag(cf);
        announcePub();
      } else {
        cf.diag.err = "pub_fail(" + (res && res.data && res.data.errorDescription || res && res.reason || "?") + ")"; renderDiag(cf);
        track.stop();
      }
    } catch (e) { cf.diag.err = "pub_ex(" + (e && e.name || "?") + ")"; renderDiag(cf); try { track.stop(); } catch (_) {} }
    cf.pubBusy = false;
  }
  function announcePub() {
    const cf = CUR && CUR.cf; if (!cf || !cf.myTrackName) return;
    try { CUR.channel.send({ type: "broadcast", event: "pub", payload: { uid: ME, sessionId: cf.sessionId, trackName: cf.myTrackName } }); } catch (e) {}
  }
  function onPub(p) {
    const cf = CUR && CUR.cf; if (!cf || !p || p.uid === ME) return;
    // 같은 사람이 '재발행'(내려갔다 다시 올라옴 → 새 trackName)하면 다시 구독해야 한다
    // — uid로만 중복 제거하면 새 트랙을 영영 못 받는다(승계 방장 소리 안 남).
    const key = p.uid + "|" + p.trackName;
    if (cf.subs.has(key)) return;
    cf.subs.add(key);
    // 재협상은 한 번에 하나 — 큐로 직렬화
    cf.q = cf.q.then(() => subscribe(p, key)).catch(() => {});
  }
  async function subscribe(p, key) {
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
        if (err && cf.diag) { cf.diag.err = "sub(" + err + ")"; renderDiag(cf); }
        if (err !== "not_found_track_error") break;   // 다른 오류면 재시도 무의미
      } catch (e) { break; }
      await new Promise(r => setTimeout(r, 1300));   // 잠시 후 재시도
    }
    cf.subs.delete(key);   // 실패 → 나중에 재-announce 시 다시 구독 가능
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
    if (!confirm("이 주제로 목소리 토크(육성 난장)를 열까요?\n사람들이 들으러 올 수 있어요.")) return;
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
    // 진입 파이프라인은 광장 전용(사장님 확정 2026-07-25) — 이슈·예측은 스크립트 미로드 + 여기서도 차단.
    // (방 안 '📌 자료' 검색은 이슈/예측/뉴스/광장 4종 유지 — 별개 기능)
    if (/plaza_detail/.test(path)) return { type: "plaza", id, title: titleOf(".post-title", "광장 토크") };
    return null;
  }
  // 콘텐츠 상단(제목 아래)에 '라이브 토크' 초대 배너 주입.
  // ⚠️ 톤 = 대화·수다(전투 아님). 댓글 전투("붙자")와 구분되는 한 발 물러선 '목소리로 얘기하자' 초대.
  // ⚠️ 실제 DOM 기준(짐작 금지): issue=<h1 id=issue-title>, market=.pb-q(JS렌더), plaza=<h1 class=post-title>
  const TB_ANCHOR = { issue: "#issue-title", market: ".pb-q", plaza: ".post-title" };
  function tbHTML(ex) {
    if (ex) {   // 진행 중 — 사회적 증거로 강하게 끌어당김
      return `<span class="lv-tb-ic live">🔴</span>
        <span class="lv-tb-tx"><b>지금 ${ex.listeners || 1}명이 라이브 토크 중</b><span>듣거나 살짝 끼어들기 · 육성 난장</span></span>
        <span class="lv-tb-cta on">들어가기</span>`;
    }
    return `<span class="lv-tb-ic">🎙</span>
      <span class="lv-tb-tx"><b>이 주제, 목소리로 떠들어볼까?</b><span>글 말고 실시간 토크로 · 육성 난장</span></span>
      <span class="lv-tb-cta">열기</span>`;
  }
  function injectTopBanner() {
    if (LV_EMBED) return true;   // 자료 뷰어 임베드면 배너 없음
    const link = pageLink(); if (!link) return false;
    if (document.getElementById("lv-topbar")) return true;
    const anchor = document.querySelector(TB_ANCHOR[link.type]);
    if (!anchor) return false;   // 제목이 아직 안 그려졌으면 다음 시도까지 대기
    ensureCSS();
    const bar = document.createElement("button");
    bar.id = "lv-topbar"; bar.type = "button"; bar.className = "lv-topbar";
    bar.innerHTML = tbHTML(null);
    anchor.insertAdjacentElement("afterend", bar);
    // 제목은 클릭 시점에 다시 읽는다 — 배너 주입 때는 아직 JS 렌더 전이라 비어있을 수 있음
    bar.onclick = () => { const l = pageLink(); window.GALLA_liveLaunch(link.type, link.id, (l && l.title) || link.title, ""); };
    async function poll() {
      if (!sb() || !document.getElementById("lv-topbar")) return;
      try {
        const { data } = await sb().rpc("live_room_for_link", { p_link_type: link.type, p_link_id: String(link.id) });
        const ex = data && data[0];
        bar.classList.toggle("live", !!ex);
        bar.innerHTML = tbHTML(ex);
      } catch (e) {}
    }
    poll(); setInterval(poll, 15000);
    return true;
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
    } else if (!LV_EMBED) {
      // 이슈/예측/광장 → 상단 '라이브 토크' 초대 배너 (제목 렌더될 때까지 재시도)
      let tries = 0;
      const inj = setInterval(() => { if (injectTopBanner() || ++tries > 40) clearInterval(inj); }, 500);
    }
  })();

  function ensureCSS() {
    if (document.getElementById("lv-css")) return;
    const s = document.createElement("style"); s.id = "lv-css";
    s.textContent = `
    /* 콘텐츠 상단 '라이브 토크' 초대 배너(전투와 구분되는 대화 톤 — 기본 인디고, 진행 중이면 레드) */
    .lv-topbar{display:flex;align-items:center;gap:12px;width:calc(100% - 28px);margin:10px 14px 6px;padding:12px 14px;border-radius:16px;cursor:pointer;text-align:left;
      background:linear-gradient(135deg,rgba(111,134,255,.16),rgba(111,134,255,.04));border:1px solid rgba(111,134,255,.34);color:#fff;box-sizing:border-box}
    .lv-topbar.live{background:linear-gradient(135deg,rgba(255,77,103,.18),rgba(255,45,85,.05));border-color:rgba(255,77,103,.42)}
    .lv-topbar:active{transform:scale(.99)}
    .lv-tb-ic{flex:0 0 auto;font-size:22px;line-height:1}
    .lv-tb-ic.live{animation:lvPulse 1.4s ease-in-out infinite;border-radius:50%}
    .lv-tb-tx{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
    .lv-tb-tx b{font-size:14px;font-weight:900;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .lv-tb-tx span{font-size:12px;color:#aeb6c8}
    .lv-tb-cta{flex:0 0 auto;padding:8px 15px;border-radius:999px;font-size:12.5px;font-weight:900;background:rgba(111,134,255,.9);color:#fff}
    .lv-tb-cta.on{background:linear-gradient(135deg,#ff4d67,#ff2d55)}
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
    .lv-x{flex:0 0 auto;padding:8px 14px;border-radius:999px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.16);color:#fff;font-size:13px;font-weight:900;cursor:pointer;white-space:nowrap}
    .lv-x.danger{background:rgba(255,77,103,.16);border-color:rgba(255,77,103,.45);color:#ff9aa5}
    .lv-x:active{transform:scale(.96)}
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
    /* 무대 위 자료 뷰어(iframe) — 방 유지한 채 콘텐츠 보기 */
    .lv-view{position:absolute;inset:0;z-index:12;display:flex;flex-direction:column;background:#0a0709;opacity:0;transition:opacity .2s ease}
    .lv-view.on{opacity:1}
    .lv-view-top{display:flex;align-items:center;gap:10px;padding:calc(10px + env(safe-area-inset-top,0)) 14px 10px;border-bottom:1px solid rgba(255,255,255,.08)}
    .lv-view-x{flex:0 0 auto;width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,.1);border:0;color:#fff;font-size:15px;cursor:pointer}
    .lv-view-title{flex:1;min-width:0;font-size:14px;font-weight:900;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .lv-view-live{flex:0 0 auto;font-size:10.5px;font-weight:900;color:#ff6a8a}
    .lv-view-if{flex:1;width:100%;border:0;background:#0a0709}
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
    /* 무대는 컴팩트 고정(스피커 최대 2줄 + 청중 1줄 가로스크롤), 채팅이 남는 공간 전부 —
       인원·채팅이 늘어도 정렬이 안 무너진다(사장님 재현: 커지면 서로 밀림) */
    .lv-stage-body{flex:0 0 auto;max-height:34vh;overflow-y:auto;padding:2px 16px 8px}
    .lv-chat{flex:1 1 0;overflow-y:auto;padding:8px 16px 6px;display:flex;flex-direction:column;gap:5px;min-height:0;border-top:1px solid rgba(255,255,255,.06);
      -webkit-mask-image:linear-gradient(to bottom,transparent 0,#000 14px);mask-image:linear-gradient(to bottom,transparent 0,#000 14px)}
    .lv-msg{font-size:13px;line-height:1.4;color:#dfe4f0;word-break:break-word}
    .lv-msg b{color:#8aa0ff;font-weight:800;margin-right:5px}
    .lv-msg.mine b{color:#7ef0ae}
    .lv-sys{align-self:center;font-size:10.5px;color:#7d8496;background:rgba(255,255,255,.045);border-radius:999px;padding:2px 9px;margin:0;line-height:1.6}
    .lv-react{display:flex;align-items:center;gap:8px;padding:4px 12px 2px}
    .lv-react-emos{display:flex;gap:6px;flex:1;min-width:0;overflow-x:auto;scrollbar-width:none;-ms-overflow-style:none;padding:2px 0}
    .lv-react-emos::-webkit-scrollbar{display:none}
    .lv-react-acts{display:flex;gap:6px;flex:0 0 auto}
    .lv-react button{flex:0 0 auto;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:999px;font-size:17px;padding:6px 9px;cursor:pointer;line-height:1}
    .lv-react button:active{transform:scale(1.15)}
    .lv-react-acts button{display:flex;align-items:center;justify-content:center;gap:5px}
    .lv-react-acts svg{width:18px;height:18px;display:block}
    .lv-react .lv-present-btn{padding:8px 10px;background:rgba(111,134,255,.92);border:0;color:#fff}
    .lv-react .lv-super{font-size:13px;font-weight:900;color:#fff;background:linear-gradient(135deg,#ff8a3d,#ff3d67);border:0;padding:7px 13px 7px 11px}
    .lv-react .lv-share{padding:8px 10px;color:#cfd6e6}
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
    .lv-stage-label,.lv-aud-label{font-size:11.5px;font-weight:900;color:#8a90a0;margin:8px 2px 8px}
    .lv-speakers{display:grid;grid-template-columns:repeat(4,1fr);gap:10px 6px}
    /* 청중 = 한 줄 가로 스크롤 — 몇십 명이어도 세로 공간을 안 먹는다 */
    .lv-audience{display:flex;gap:10px;overflow-x:auto;padding:2px 0 4px;scrollbar-width:none;-ms-overflow-style:none}
    .lv-audience::-webkit-scrollbar{display:none}
    .lv-audience .lv-person{flex:0 0 auto;width:56px}
    .lv-person{background:none;border:0;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px;color:#fff}
    .lv-ava{position:relative;width:56px;height:56px;border-radius:50%;overflow:visible;display:flex;align-items:center;justify-content:center;
      background:#222634;border:2px solid transparent}
    .lv-ava.sm{width:42px;height:42px}
    .lv-ava img{width:100%;height:100%;border-radius:50%;object-fit:cover}
    .lv-ava-none{font-size:24px}
    .lv-ava.talk{border-color:#33d17a;box-shadow:0 0 0 4px rgba(51,209,122,.25);animation:lvTalk 1s ease-in-out infinite}
    @keyframes lvTalk{0%,100%{box-shadow:0 0 0 3px rgba(51,209,122,.2)}50%{box-shadow:0 0 0 6px rgba(51,209,122,.05)}}
    .lv-crown{position:absolute;top:-10px;right:-4px;font-size:16px}
    .lv-mic{position:absolute;bottom:-4px;right:-4px;font-size:14px;background:#0a0709;border-radius:50%;padding:1px}
    .lv-hand{position:absolute;top:-8px;right:-6px;font-size:15px}
    .lv-name{font-size:11.5px;max-width:70px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#dfe4f0}
    .lv-audience .lv-name{max-width:56px;font-size:10.5px}
    .lv-bar{display:flex;gap:8px;padding:12px 16px calc(16px + env(safe-area-inset-bottom,0))}
    .lv-bbtn{flex:1;padding:14px;border:1px solid rgba(255,255,255,.14);border-radius:14px;background:rgba(255,255,255,.06);color:#fff;font-size:14px;font-weight:900;cursor:pointer}
    .lv-bbtn.act{background:linear-gradient(135deg,#33d17a,#1fae63);border-color:transparent}
    .lv-bbtn.danger{background:rgba(255,77,103,.16);border-color:rgba(255,77,103,.4);color:#ff9aa5}
    .lv-bbtn:active{transform:scale(.98)}
    @media (prefers-reduced-motion:reduce){.lv-live-badge,.lv-ava.talk{animation:none}}`;
    document.head.appendChild(s);
  }
})();
