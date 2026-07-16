/* =========================================================
   ⚔️ 일기토 — 실시간 채팅 대결(온라인 옥타곤)
   - 로비 / 신청 / 아레나(파이터 링 + 관중석 + 기세 게이지 + 실시간)
   - 댓글배틀 귀속: ?challenge=uid&issue=ID , 관전: ?id=N
   ========================================================= */
(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const root = () => document.getElementById("duel-root");
  const esc = (s) => (s == null ? "" : String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])));
  const P = new URLSearchParams(location.search);
  let sb, ME = null, nickCache = {};
  let chans = [], timers = [], D = null;

  function avatar(url) { return window.GALLA_avatarImg ? window.GALLA_avatarImg(url, "d-av") : ""; }
  const nk = (uid) => nickCache[uid]?.nick || "익명";
  const av = (uid) => nickCache[uid]?.avatar || null;
  function nameTag(uid) { return `<span class="user-name" data-user-id="${uid}" data-profile-uid="${uid}">${esc(nk(uid))}</span>`; }

  function mmss(ms) {
    if (ms < 0) ms = 0;
    const s = Math.floor(ms / 1000), m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, "0")}`;
  }
  function relTime(ts) {
    const s = (Date.now() - new Date(ts).getTime()) / 1000;
    if (s < 60) return "방금"; if (s < 3600) return Math.floor(s / 60) + "분 전";
    if (s < 86400) return Math.floor(s / 3600) + "시간 전"; return Math.floor(s / 86400) + "일 전";
  }

  async function loadNicks(uids) {
    const need = [...new Set(uids)].filter(u => u && !(u in nickCache));
    if (!need.length) return;
    const { data } = await sb.from("users").select("id,nickname,avatar_url").in("id", need);
    (data || []).forEach(u => { nickCache[u.id] = { nick: u.nickname || "익명", avatar: u.avatar_url }; });
    need.forEach(u => { if (!nickCache[u]) nickCache[u] = { nick: "익명", avatar: null }; });
  }

  function teardown() {
    chans.forEach(c => { try { sb.removeChannel(c); } catch (e) {} });
    timers.forEach(t => clearInterval(t));
    chans = []; timers = [];
  }

  const REASON = {
    no_ticket: "일기토 신청서가 없어요. 상점에서 구매하세요.",
    already: "이 상대와 진행 중인 일기토가 이미 있어요.",
    insufficient: "GP(판돈)가 부족해요.",
    bad_opponent: "잘못된 상대예요.", no_topic: "주제를 입력하세요.",
    not_fighter: "파이터만 발언할 수 있어요.", is_party: "당사자는 참여할 수 없어요.",
    time_over: "시간이 종료됐어요.", not_live: "지금은 대결 중이 아니에요.",
    unauthorized: "로그인이 필요합니다.",
    // ↓ 누락돼 있어서 그냥 "실패"로만 뜨던 사유들 (특히 not_pending: 이미 끝난 결투에 수락)
    not_pending: "이미 종료되었거나 상대가 취소한 일기토예요.",
    not_found: "없는 일기토예요. 이미 삭제됐을 수 있어요.",
    not_opponent: "이 일기토의 상대가 아니에요.",
    not_scheduled: "예약 상태가 아니에요.", too_early: "아직 입장 시간이 아니에요.",
    already_voted: "이미 투표했어요.",
  };
  // 서버 상태와 화면이 어긋난 경우 — 알림만 띄우고 멈추면 사용자가 갇힌다. 최신 상태로 다시 그린다.
  const STALE = new Set(["not_pending", "not_found", "not_scheduled", "not_live", "time_over"]);
  const reason = (r) => REASON[r];

  // ─────────── 라우팅 ───────────
  async function boot() {
    sb = await waitForSupabaseClient();
    const { data: s } = await sb.auth.getSession();
    ME = s?.session?.user?.id || null;
    if (P.get("challenge")) return renderChallenge(P.get("challenge"), P.get("issue"));
    if (P.get("id")) return renderArena(P.get("id"));
    return renderLobby();
  }

  // ═══════════ 신청 ═══════════
  async function renderChallenge(oppId, issueId) {
    teardown();
    if (!ME) { alert("로그인이 필요합니다."); location.href = "login.html"; return; }
    if (oppId === ME) { alert("자기 자신에게는 신청할 수 없어요."); location.href = "duel.html"; return; }
    await loadNicks([oppId]);
    root().innerHTML = `
      <div class="duel-card challenge-card">
        <div class="ch-title">⚔️ 일기토 신청</div>
        <div class="ch-opp">${avatar(av(oppId))}<div><div class="ch-oppname">${nameTag(oppId)}</div><div class="ch-sub">에게 1:1 실시간 설전을 신청</div></div></div>

        <label class="ch-label">논쟁 주제</label>
        <input id="ch-topic" maxlength="140" placeholder="예: 부먹 vs 찍먹, 진리는 하나다" />

        <label class="ch-label">판돈 (승자 독식)</label>
        <div class="seg" id="seg-stake">
          <button data-v="300">300</button><button data-v="500" class="on">500</button><button data-v="1000">1000 GP</button>
        </div>

        <label class="ch-label">제한 시간</label>
        <div class="seg" id="seg-limit">
          <button data-v="180">3분</button><button data-v="300" class="on">5분</button><button data-v="600">10분</button>
        </div>

        <label class="ch-label">시작 방식</label>
        <div class="seg" id="seg-when">
          <button data-v="instant" class="on">⚡ 지금 바로</button><button data-v="scheduled">⏰ 시간 예약</button>
        </div>
        <input id="ch-time" type="datetime-local" style="display:none" />

        <div class="ch-cost">신청서 1장 + 판돈이 잠깁니다 · 상대가 도망가면 위약금 획득</div>
        <button id="ch-send" class="duel-btn primary">⚔️ 결투 신청</button>
        <button id="ch-cancel" class="duel-btn ghost">취소</button>
      </div>`;

    const seg = (id, cb) => root().querySelectorAll(`#${id} button`).forEach(b => b.onclick = () => {
      root().querySelectorAll(`#${id} button`).forEach(x => x.classList.remove("on")); b.classList.add("on"); cb && cb(b.dataset.v);
    });
    let stake = 500, limit = 300, when = "instant";
    seg("seg-stake", v => stake = +v); seg("seg-limit", v => limit = +v);
    seg("seg-when", v => { when = v; $("#ch-time").style.display = v === "scheduled" ? "" : "none"; });

    $("#ch-cancel").onclick = () => history.length > 1 ? history.back() : (location.href = "duel.html");
    $("#ch-send").onclick = async () => {
      const topic = $("#ch-topic").value.trim();
      if (!topic) { $("#ch-topic").focus(); return; }
      let sched = null;
      if (when === "scheduled") {
        const t = $("#ch-time").value; if (!t) { $("#ch-time").focus(); return; }
        sched = new Date(t).toISOString();
      }
      const btn = $("#ch-send"); btn.disabled = true; btn.textContent = "신청 중…";
      const { data, error } = await sb.rpc("duel_challenge", {
        p_opponent: oppId, p_topic: topic, p_issue_id: issueId ? +issueId : null,
        p_stake: stake, p_limit: limit, p_scheduled_at: sched,
      });
      if (error || !data?.ok) { btn.disabled = false; btn.textContent = "⚔️ 결투 신청"; alert(reason(data?.reason) || "신청 실패"); return; }
      location.href = "duel.html?id=" + data.id;
    };
  }

  // ═══════════ 로비 ═══════════
  async function renderLobby() {
    teardown();
    root().innerHTML = `<div class="duel-loading">불러오는 중…</div>`;
    let mine = [], live = [], voting = [];
    if (ME) {
      const { data } = await sb.from("duels").select("*").or(`challenger.eq.${ME},opponent.eq.${ME}`)
        .order("created_at", { ascending: false }).limit(40);
      mine = data || [];
    }
    const { data: ld } = await sb.from("duels").select("*").in("status", ["live", "voting"])
      .order("live_started_at", { ascending: false }).limit(30);
    (ld || []).forEach(d => { (d.status === "live" ? live : voting).push(d); });
    live = live.filter(d => d.challenger !== ME && d.opponent !== ME);
    voting = voting.filter(d => d.challenger !== ME && d.opponent !== ME);

    const uids = []; mine.concat(live, voting).forEach(d => uids.push(d.challenger, d.opponent));
    await loadNicks(uids);

    let rec = { wins: 0, losses: 0, draws: 0, flees: 0 };
    if (ME) { const { data } = await sb.rpc("duel_record", { p_user: ME }); rec = data || rec; }

    const need = mine.filter(needsMe), others = mine.filter(d => !needsMe(d));
    root().innerHTML = `
      ${ME ? `<div class="duel-card rec-card"><div class="rec-title">🏟️ 내 전적</div>
        <div class="rec-row"><span class="rec-w">${rec.wins}승</span><span class="rec-l">${rec.losses}패</span><span class="rec-d">${rec.draws}무</span>${rec.flees ? `<span class="rec-f">🏳️${rec.flees}</span>` : ""}</div></div>` : ""}
      ${live.length ? `<div class="duel-sec-title">🔴 LIVE 생중계 <span class="sec-cnt live">${live.length}</span></div>${live.map(lobbyRow).join("")}` : ""}
      ${need.length ? `<div class="duel-sec-title">🔔 내 차례</div>${need.map(lobbyRow).join("")}` : ""}
      <div class="duel-sec-title">🗳️ 투표 중 ${voting.length ? `<span class="sec-cnt">${voting.length}</span>` : ""}</div>
      ${voting.length ? voting.map(lobbyRow).join("") : `<div class="duel-empty">지금 투표 중인 일기토가 없어요.</div>`}
      ${others.length ? `<div class="duel-sec-title">내 일기토</div>${others.map(lobbyRow).join("")}` : ""}
      ${!ME ? `<div class="duel-empty">로그인하면 일기토에 참전할 수 있어요.</div>` : ""}
      <div class="duel-hint">💡 이슈 댓글의 ⋯ 또는 상대 프로필에서 <b>⚔️ 일기토</b> 로 신청. 신청서는 🛒 상점에서.</div>`;
    root().querySelectorAll("[data-goto]").forEach(el => el.onclick = () => location.href = "duel.html?id=" + el.dataset.goto);
  }
  function needsMe(d) {
    if (!ME) return false;
    if (d.status === "pending" && d.opponent === ME) return true;
    if (d.status === "scheduled" && (d.challenger === ME || d.opponent === ME)) return true;
    if (d.status === "live" && (d.challenger === ME || d.opponent === ME)) return true;
    return false;
  }
  function pill(d) {
    const m = {
      pending: ["수락 대기", "wait"], scheduled: ["예약됨", "wait"], live: ["🔴 LIVE", "live"],
      voting: ["🗳️ 투표", "vote"], declined: ["도망", "dead"], expired: ["무효", "dead"], noshow: ["몰수", "dead"],
    };
    if (d.status === "finished") {
      if (d.result === "draw") return `<span class="d-pill draw">무승부</span>`;
      const party = ME && (d.challenger === ME || d.opponent === ME);
      return `<span class="d-pill ${d.winner === ME ? "win" : "lose"}">${party ? (d.winner === ME ? "승리 🏆" : "패배") : "종료"}</span>`;
    }
    const x = m[d.status] || ["", ""]; return `<span class="d-pill ${x[1]}">${x[0]}</span>`;
  }
  function lobbyRow(d) {
    return `<div class="duel-card lobby-row${d.status === "live" ? " is-live" : ""}" data-goto="${d.id}">
      ${needsMe(d) ? `<span class="row-flag">●</span>` : ""}
      <div class="lr-main"><div class="lr-topic">${esc(d.topic)}</div>
        <div class="lr-vs">${esc(nk(d.challenger))} <span class="vs">vs</span> ${esc(nk(d.opponent))} · 💰${d.stake}</div></div>
      <div class="lr-right">${pill(d)}</div></div>`;
  }

  // ═══════════ 아레나(옥타곤) ═══════════
  async function loadDuel(id) {
    const { data } = await sb.from("duels").select("*").eq("id", id).maybeSingle();
    return data;
  }
  async function renderArena(id) {
    teardown();
    root().innerHTML = `<div class="duel-loading">링 준비 중…</div>`;
    D = await loadDuel(id);
    if (!D) { root().innerHTML = `<div class="duel-empty">일기토를 찾을 수 없어요.</div>`; return; }

    // 자동 상태 전이(멱등): 시간 경과분 정리
    if (D.status === "live" && D.live_ends_at && Date.now() >= new Date(D.live_ends_at).getTime()) {
      await sb.rpc("duel_resolve", { p_duel: id }); D = await loadDuel(id);
    } else if (D.status === "voting" && D.voting_ends_at && Date.now() >= new Date(D.voting_ends_at).getTime()) {
      await sb.rpc("duel_resolve", { p_duel: id }); D = await loadDuel(id);
    } else if (D.status === "scheduled" && D.grace_until && Date.now() >= new Date(D.grace_until).getTime()) {
      await sb.rpc("duel_noshow_check", { p_duel: id }); D = await loadDuel(id);
    }

    await loadNicks([D.challenger, D.opponent]);
    const isChal = ME === D.challenger, isOpp = ME === D.opponent, isParty = isChal || isOpp;
    D._isChal = isChal; D._isOpp = isOpp; D._isParty = isParty;

    // 비-라이브 상태들은 단순 카드, live/voting은 옥타곤
    if (D.status === "pending") return renderPending();
    if (D.status === "scheduled") return renderScheduled();
    if (D.status === "judging") return renderJudging();
    if (D.status === "declined" || D.status === "expired" || D.status === "noshow" || D.status === "finished")
      return renderClosed();
    return renderOctagon(); // live | voting
  }

  function ringHeader() {
    const c = D.vote_challenger || 0, o = D.vote_opponent || 0, tot = Math.max(1, c + o);
    const cp = Math.round(c / tot * 100);
    const chalWin = D.result === "challenger", oppWin = D.result === "opponent";
    return `
      <div class="ring-head">
        <div class="ring-fighters">
          <div class="rf chal ${chalWin ? "won" : ""}">
            <div class="rf-av" data-profile-uid="${D.challenger}"><span class="rf-dot" id="dot-chal"></span>${avatar(av(D.challenger))}${chalWin ? '<span class="rf-crown">👑</span>' : ""}</div>
            <div class="rf-name">${nameTag(D.challenger)}</div>
          </div>
          <div class="rf-vs"><div id="ring-timer" class="ring-timer">${D.status === "live" ? "" : "VS"}</div></div>
          <div class="rf opp ${oppWin ? "won" : ""}">
            <div class="rf-av" data-profile-uid="${D.opponent}"><span class="rf-dot" id="dot-opp"></span>${avatar(av(D.opponent))}${oppWin ? '<span class="rf-crown">👑</span>' : ""}</div>
            <div class="rf-name">${nameTag(D.opponent)}</div>
          </div>
        </div>
        <div class="momentum"><div class="mo-fill" id="mo-fill" style="width:${cp}%"></div>
          <span class="mo-c" id="mo-c">${c}</span><span class="mo-o" id="mo-o">${o}</span></div>
        <div class="ring-topic">“${esc(D.topic)}” · 💰${D.stake} 판돈</div>
      </div>`;
  }
  function updateMomentum() {
    const c = D.vote_challenger || 0, o = D.vote_opponent || 0, tot = Math.max(1, c + o);
    const f = document.getElementById("mo-fill"); if (f) f.style.width = Math.round(c / tot * 100) + "%";
    const mc = document.getElementById("mo-c"), mo = document.getElementById("mo-o");
    if (mc) mc.textContent = c; if (mo) mo.textContent = o;
  }

  async function renderOctagon() {
    const isParty = D._isParty;
    root().innerHTML = `
      ${ringHeader()}
      <div class="octa">
        <div class="ring-label">⚔️ 파이터 링</div>
        <div class="ring-stream" id="ring-stream"></div>
        <div id="fighter-input"></div>
        <div class="stands-label">👥 관중석 <span id="cheer-cnt"></span></div>
        <div class="stands-stream" id="stands-stream"></div>
        <div id="stand-tools"></div>
      </div>`;

    // 초기 메시지/응원 로드
    const [{ data: msgs }, { data: cheers }, myVoteRow] = await Promise.all([
      sb.from("duel_messages").select("*").eq("duel_id", D.id).order("created_at").limit(200),
      sb.from("duel_cheers").select("*").eq("duel_id", D.id).order("created_at").limit(100),
      ME && !isParty ? sb.from("duel_votes").select("choice").eq("duel_id", D.id).eq("voter", ME).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    await loadNicks((cheers || []).map(c => c.user_id));
    (msgs || []).forEach(appendMsg);
    (cheers || []).forEach(appendCheer);
    D._myVote = myVoteRow?.data?.choice || null;

    mountFighterInput();
    mountStandTools();
    subscribeArena();
    startTimers();
  }

  function appendMsg(m) {
    const box = document.getElementById("ring-stream"); if (!box) return;
    const mine = m.user_id === ME;
    const el = document.createElement("div");
    el.className = `rmsg ${m.side}${mine ? " mine" : ""} pop`;
    el.innerHTML = `<span class="rmsg-body">${esc(m.body)}</span>`;
    box.appendChild(el);
    box.scrollTop = box.scrollHeight;
    window.BattleFX?.haptic?.("tap");
  }
  function appendCheer(c) {
    const box = document.getElementById("stands-stream"); if (!box) return;
    const el = document.createElement("div");
    el.className = `cheer t-${c.team} pop`;
    el.innerHTML = `<b class="cheer-nick" data-user-id="${c.user_id}" data-profile-uid="${c.user_id}">${esc(nk(c.user_id))}</b> ${esc(c.body)}`;
    box.appendChild(el);
    while (box.children.length > 60) box.removeChild(box.firstChild);
    box.scrollTop = box.scrollHeight;
  }

  function mountFighterInput() {
    const box = document.getElementById("fighter-input"); if (!box) return;
    if (D.status !== "live") { box.innerHTML = ""; return; }
    if (!D._isParty) {
      box.innerHTML = `<div class="watch-note">👀 관전 중 — 아래 관중석에서 응원·투표하세요</div>`;
      return;
    }
    box.innerHTML = `<div class="fi-row">
      <input id="fi-input" maxlength="500" placeholder="상대에게 한 방 날리기…" autocomplete="off">
      <button id="fi-send" class="fi-send">▶</button></div>`;
    const send = async () => {
      const inp = $("#fi-input"); const t = inp.value.trim(); if (!t) return;
      inp.value = "";
      const { data } = await sb.rpc("duel_say", { p_duel: D.id, p_body: t });
      if (!data?.ok) { if (data?.reason === "time_over") return renderArena(D.id); alert(reason(data?.reason) || "전송 실패"); inp.value = t; }
    };
    $("#fi-send").onclick = send;
    $("#fi-input").addEventListener("keydown", e => { if (e.key === "Enter") send(); });
    // 타이핑 프레즌스
    $("#fi-input").addEventListener("input", () => trackTyping());
  }

  function mountStandTools() {
    const box = document.getElementById("stand-tools"); if (!box) return;
    if (D._isParty) { box.innerHTML = ""; return; }
    if (!ME) { box.innerHTML = `<div class="watch-note">로그인하면 응원·투표할 수 있어요</div>`; return; }
    const voteRow = (D.status === "live" || D.status === "voting")
      ? `<div class="vote-row"><span class="vr-label">🗳️ 승자 예측</span>
           <button class="vpick chal${D._myVote === "challenger" ? " on" : ""}" data-c="challenger">${esc(nk(D.challenger))}</button>
           <button class="vpick opp${D._myVote === "opponent" ? " on" : ""}" data-c="opponent">${esc(nk(D.opponent))}</button></div>` : "";
    box.innerHTML = `${voteRow}
      <div class="cheer-row">
        <input id="cheer-input" maxlength="200" placeholder="응원·야유 남기기…" autocomplete="off">
        <button id="cheer-send" class="cheer-send">📣</button>
      </div>`;
    box.querySelectorAll(".vpick").forEach(b => b.onclick = () => castVote(b.dataset.c));
    const cheer = async () => {
      const inp = $("#cheer-input"); const t = inp.value.trim(); if (!t) return; inp.value = "";
      const team = D._myVote || "neutral";
      const { data } = await sb.rpc("duel_cheer", { p_duel: D.id, p_team: team, p_body: t });
      if (!data?.ok) { alert(reason(data?.reason) || "전송 실패"); inp.value = t; }
    };
    $("#cheer-send").onclick = cheer;
    $("#cheer-input").addEventListener("keydown", e => { if (e.key === "Enter") cheer(); });
  }

  async function castVote(choice) {
    const { data } = await sb.rpc("duel_vote", { p_duel: D.id, p_choice: choice });
    if (!data?.ok) { alert(reason(data?.reason) || "투표 실패"); return; }
    D._myVote = choice;
    document.querySelectorAll(".vpick").forEach(b => b.classList.toggle("on", b.dataset.c === choice));
    window.BattleFX?.haptic?.("tap");
  }

  // ─── 실시간 구독 ───
  function subscribeArena() {
    const ch = sb.channel("duel-live-" + D.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "duel_messages", filter: "duel_id=eq." + D.id },
        p => appendMsg(p.new))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "duel_cheers", filter: "duel_id=eq." + D.id },
        async p => { await loadNicks([p.new.user_id]); appendCheer(p.new); })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "duels", filter: "id=eq." + D.id },
        p => onDuelUpdate(p.new));
    ch.subscribe(); chans.push(ch);

    // 프레즌스(파이터 온라인/타이핑)
    const pc = sb.channel("duel-presence-" + D.id, { config: { presence: { key: ME || "anon-" + Math.random() } } });
    pc.on("presence", { event: "sync" }, () => renderPresence(pc.presenceState()));
    pc.subscribe(async (st) => { if (st === "SUBSCRIBED" && ME) await pc.track({ uid: ME, typing: false }); });
    chans.push(pc); D._pc = pc;
  }
  let typingT = null;
  function trackTyping() {
    if (!D._pc || !ME) return;
    D._pc.track({ uid: ME, typing: true });
    clearTimeout(typingT);
    typingT = setTimeout(() => D._pc.track({ uid: ME, typing: false }), 1500);
  }
  function renderPresence(state) {
    const online = new Set(); const typing = new Set();
    Object.values(state || {}).forEach(arr => arr.forEach(p => { if (p.uid) { online.add(p.uid); if (p.typing) typing.add(p.uid); } }));
    const setDot = (id, uid) => {
      const el = document.getElementById(id); if (!el) return;
      el.classList.toggle("on", online.has(uid));
      el.classList.toggle("typing", typing.has(uid));
    };
    setDot("dot-chal", D.challenger); setDot("dot-opp", D.opponent);
  }

  function onDuelUpdate(nd) {
    const prevStatus = D.status;
    Object.assign(D, nd);
    updateMomentum();
    if (nd.status !== prevStatus) { renderArena(D.id); return; } // 상태 전환 → 재구성
  }

  // ─── 타이머(카운트다운 + 자동 판정) ───
  function startTimers() {
    const tick = () => {
      const t = document.getElementById("ring-timer");
      if (D.status === "live" && D.live_ends_at) {
        const left = new Date(D.live_ends_at).getTime() - Date.now();
        if (t) { t.textContent = mmss(left); t.classList.toggle("urgent", left < 30000); }
        if (left <= 0) resolveTick();
      } else if (D.status === "voting" && D.voting_ends_at) {
        const left = new Date(D.voting_ends_at).getTime() - Date.now();
        if (t) { t.textContent = "🗳️ " + mmss(left); }
        if (left <= 0) resolveTick();
      }
    };
    tick();
    timers.push(setInterval(tick, 1000));
  }
  let resolving = false;
  async function resolveTick() {
    if (resolving) return; resolving = true;
    await sb.rpc("duel_resolve", { p_duel: D.id });
    const nd = await loadDuel(D.id);
    resolving = false;
    if (nd && nd.status !== D.status) { D = nd; renderArena(D.id); }
  }

  // ═══════════ 상태별 단순 화면 ═══════════
  /* 수락/도망 공통 — 중복 클릭 차단 + 상태 어긋나면 알림 후 최신 화면으로 복구 */
  async function respond(accept, btn) {
    if (btn) { btn.disabled = true; btn.dataset.o = btn.textContent; btn.textContent = "처리 중…"; }
    const { data, error } = await sb.rpc("duel_respond", { p_duel: D.id, p_accept: accept });
    if (error || !data?.ok) {
      const r = data?.reason;
      alert(reason(r) || "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.");
      if (btn) { btn.disabled = false; btn.textContent = btn.dataset.o || "다시 시도"; }
      if (STALE.has(r)) renderArena(D.id);   // 이미 끝난 결투 등 → 갇히지 않게 최신 상태로
      return;
    }
    renderArena(D.id);
  }

  function renderPending() {
    const box = root();
    box.innerHTML = ringHeader() + `<div id="pa"></div>`;
    const pa = $("#pa");
    if (D._isOpp) {
      pa.innerHTML = `<div class="duel-card act-card">
        <div class="act-msg">💰 판돈 <b>${D.stake} GP</b> · ${D.mode === "instant" ? "수락 즉시 실시간 대결 시작" : "예약 대결"}</div>
        <div class="act-msg sub">수락하면 같은 판돈이 잠깁니다. 거절(도망) 시 위약금 200GP를 뺏겨요.</div>
        <div class="act-btns"><button class="duel-btn primary" id="acc">⚔️ 수락하고 참전</button>
        <button class="duel-btn ghost" id="dec">도망가기</button></div></div>`;
      $("#acc").onclick = () => respond(true, $("#acc"));
      $("#dec").onclick = () => { if (confirm("도망가면 위약금 200GP를 잃어요. 정말?")) respond(false, $("#dec")); };
    } else {
      pa.innerHTML = `<div class="duel-card act-card"><div class="act-msg">⏳ 상대의 수락을 기다리는 중… (판돈 ${D.stake} 잠김)</div></div>`;
      pollStatus();
    }
  }
  function renderScheduled() {
    const box = root();
    const when = D.scheduled_at ? new Date(D.scheduled_at) : null;
    box.innerHTML = ringHeader() + `<div class="duel-card act-card">
      <div class="act-msg">⏰ 예약 대결 · ${when ? when.toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}</div>
      <div class="act-msg sub" id="sched-cd"></div>
      ${D._isParty ? `<button class="duel-btn primary" id="enter">🥊 링에 입장</button>
        <div class="act-msg sub">양측 모두 입장하면 대결이 시작돼요. 유예 시간 초과 시 노쇼 몰수패.</div>` :
        `<div class="act-msg sub">시작되면 알림이 가요.</div>`}</div>`;
    if (D._isParty) $("#enter").onclick = async () => { const { data } = await sb.rpc("duel_enter", { p_duel: D.id }); if (!data?.ok) return alert(reason(data?.reason) || "실패"); renderArena(D.id); };
    const cd = $("#sched-cd");
    const tick = () => {
      if (!when) return;
      const left = when.getTime() - Date.now();
      cd.textContent = left > 0 ? `시작까지 ${mmss(left)}` : `대기 중 — ${D.chal_entered ? "도전자 입장✓ " : ""}${D.opp_entered ? "응전자 입장✓" : ""}`;
      if (left < -5 * 60000) resolveScheduled();
    };
    tick(); timers.push(setInterval(tick, 1000));
    pollStatus();
  }
  async function resolveScheduled() {
    const { data } = await sb.rpc("duel_noshow_check", { p_duel: D.id });
    if (data?.ok) { const nd = await loadDuel(D.id); if (nd.status !== D.status) { D = nd; renderArena(D.id); } }
  }
  // 대기 화면에서 상태 변화 감지(실시간)
  function pollStatus() {
    const ch = sb.channel("duel-wait-" + D.id)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "duels", filter: "id=eq." + D.id },
        p => { if (p.new.status !== D.status) { Object.assign(D, p.new); renderArena(D.id); } });
    ch.subscribe(); chans.push(ch);
  }

  // ═══════════ AI 심판 판정 중 ═══════════
  let judgeTriggered = {};
  async function renderJudging() {
    root().innerHTML = ringHeader() + `
      <div class="duel-card judging-card">
        <div class="judge-orb">⚖️</div>
        <div class="judge-msg">🤖 AI 심판이 대화록을 읽고 판정 중…</div>
        <div class="judge-sub">관중 표심이 갈리지 않아 AI가 승부를 가립니다</div>
      </div>`;
    triggerAiJudge(D.id);
    const ch = sb.channel("duel-judge-" + D.id)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "duels", filter: "id=eq." + D.id },
        p => { if (p.new.status !== D.status) { Object.assign(D, p.new); renderArena(D.id); } });
    ch.subscribe(); chans.push(ch);
  }
  async function triggerAiJudge(id) {
    if (judgeTriggered[id]) return; judgeTriggered[id] = true;
    try { await sb.functions.invoke("duel-ai-judge", { body: { duel_id: Number(id) } }); } catch (e) {}
    // 폴백: 응답/실시간 누락 대비 재조회
    setTimeout(async () => { const nd = await loadDuel(id); if (nd && nd.status !== D.status) { D = nd; renderArena(id); } }, 4500);
  }

  async function renderClosed() {
    const box = root();
    // 종료된 대결의 변론 로그도 볼 수 있게
    const { data: msgs } = await sb.from("duel_messages").select("*").eq("duel_id", D.id).order("created_at").limit(200);
    const c = D.vote_challenger || 0, o = D.vote_opponent || 0, tot = Math.max(1, c + o);
    const cp = Math.round(c / tot * 100);
    let banner = "";
    if (D.status === "finished") banner = D.result === "draw" ? "🤝 무승부 — 판돈 환불" : `🏆 ${esc(nk(D.winner))} 승리 · 판돈 ${D.stake * 2} 획득`;
    else if (D.status === "noshow") banner = `🏳️ ${esc(nk(D.fled_by))} 노쇼 — ${esc(nk(D.winner))} 부전승`;
    else if (D.status === "declined") banner = `🏳️ ${esc(nk(D.fled_by))} 도망 — 위약금 몰수`;
    else banner = "무효 처리됨";
    const hasLog = (msgs || []).length > 0;
    const log = (msgs || []).map(m => `<div class="rmsg ${m.side}"><span class="rmsg-body">${esc(m.body)}</span></div>`).join("");
    const verdictCard = (D.judge === "ai" && D.verdict)
      ? `<div class="duel-card verdict-card">🤖 <b>AI 심판</b> · ${esc(D.verdict)}</div>` : "";
    box.innerHTML = ringHeader() + `
      <div class="duel-card result-banner">${banner}</div>
      ${verdictCard}
      ${(D.status === "finished" || D.status === "noshow") ? `<div class="duel-card result-card">
        <div class="rc-bar"><div class="rc-fill chal" style="width:${cp}%">${c}</div><div class="rc-fill opp" style="width:${100 - cp}%">${o}</div></div>
        <div class="rc-legend"><span>🔵 ${esc(nk(D.challenger))} ${cp}%</span><span>🔴 ${esc(nk(D.opponent))} ${100 - cp}%</span></div></div>` : ""}
      ${hasLog ? `<div class="ring-label">📜 변론 기록</div><div class="ring-stream closed">${log}</div>`
               : `<div class="duel-card closed-note">이 일기토는 변론 없이 종료됐어요.</div>`}
      <div class="closed-acts">
        ${D._isParty && D.status === "declined" ? `<button class="duel-btn primary" id="again">⚔️ 다시 신청</button>` : ""}
        <a class="duel-btn ghost" href="duel.html">로비로</a>
      </div>`;
    // 도망으로 끝난 판은 재도전이 자연스러운 다음 행동 — 로비로 되돌아가 헤매지 않게
    $("#again") && ($("#again").onclick = () => {
      const foe = D.challenger === ME ? D.opponent : D.challenger;
      location.href = `duel.html?challenge=${foe}&issue=${D.issue_id || ""}`;
    });
  }

  boot();
})();
