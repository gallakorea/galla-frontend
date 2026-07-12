/* =========================================================
   GALLA — Issue Comment Battle System (실데이터 버전)
   - comments / comment_likes / comment_actions 테이블 연동
   - HP·전투 카운터는 battle_action RPC가 서버에서 갱신
========================================================= */

window.CURRENT_ISSUE_ID = null;

let BATTLE_MODE = null;
// BATTLE_MODE = { type: "attack"|"defend", targetId, targetUser } — 인라인 컴포저가 소유

const PAGE_SIZE = 8;

const state = {
  pro: { page: 1, data: [] },
  con: { page: 1, data: [] }
};

/* 로그인 사용자 상태 */
const ME = {
  userId: null,
  faction: null,      // 'pro' | 'con' — 이 이슈에 대한 내 투표(= 내 진영). 없으면 참전 불가
  likes: new Map(),   // comment_id -> 1 | -1
  actions: new Map()  // `${comment_id}:${action_type}` -> 마지막 액션 epoch ms (쿨다운)
};

/* 전투 쿨다운 (서버 battle_action의 c_cooldown과 동일하게 유지) */
const BATTLE_COOLDOWN_MS = 60 * 1000;
function cooldownLeft(commentId, action) {
  const t = ME.actions.get(`${commentId}:${action}`);
  if (!t) return 0;
  return Math.max(0, Math.ceil((t + BATTLE_COOLDOWN_MS - Date.now()) / 1000));
}
function markAction(commentId, action) {
  ME.actions.set(`${commentId}:${action}`, Date.now());
}

/* ⚡ 쿨다운 리셋권 — 쿨다운에 걸렸을 때 보유 시 사용 제안.
   승인되면 RESET_ARMED에 표시 → battle_action 호출에 p_use_reset 전달(서버가 소비) */
const RESET_ARMED = new Set();
async function offerCooldownReset(commentId, action, waitSec) {
  try {
    const inv = window.GALLA_myItems ? await window.GALLA_myItems() : {};
    const qty = inv.cooldown_reset || 0;
    if (qty <= 0) {
      alert(`재시도까지 ${waitSec}초 남았어요.\n(⚡ 쿨다운 리셋권이 있으면 바로 가능 — GP 상점)`);
      return false;
    }
    if (!confirm(`쿨다운 ${waitSec}초 남음.\n⚡ 쿨다운 리셋권을 사용해 바로 실행할까요? (보유 ${qty}개)`)) return false;
    RESET_ARMED.add(`${commentId}:${action}`);
    ME.actions.delete(`${commentId}:${action}`); // 로컬 쿨다운 해제
    return true;
  } catch (_) {
    alert(`재시도까지 ${waitSec}초 남았어요.`);
    return false;
  }
}

/* 진영 이름 — 글쓴이가 정한 이름(issues.faction_a/b, issue.js가 window.ISSUE_FACTIONS로 노출).
   👍/👎 아이콘으로 두 편을 가른다. 고정된 '찬성/반대'가 아니다. */
function fName(side) {
  return window.ISSUE_FACTIONS?.[side] || (side === "pro" ? "찬성" : "반대");
}
function fLabel(side) {
  return (side === "pro" ? "👍 " : "👎 ") + fName(side);
}

/* 답글 체인의 최상위(루트) 댓글 id — 스레드는 1depth라 답글의 답글도 루트에 귀속 */
function rootIdOf(id) {
  let cur = allRows.find(r => r.id === id);
  let hop = 0;
  while (cur && cur.parent_id && hop < 20) {
    const p = allRows.find(r => r.id === cur.parent_id);
    if (!p) break;
    cur = p; hop++;
  }
  return cur ? cur.id : id;
}

let allRows = [];     // 이 이슈의 모든 댓글 행
let replyMap = {};    // parent_id -> [reply rows]
let likeAgg = {};     // comment_id -> { up, down }
let profileMap = {};  // user_id -> { nickname, level }
let authorVoteMap = {}; // user_id -> 'pro'|'con' (이 이슈의 작성자 실제 투표 진영, 침투 노출용)

let eventsBound = false;

// ============================
// 🧩 Comment Text Renderer
// ============================
function renderCommentText(text) {
  if (!text) return "";
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped.replace(
    /\[gif:(.*?)\]/g,
    (_, url) => `<img src="${url.replace(/"/g, "")}" class="comment-gif">`
  );
}

export async function initCommentSystem(issueId) {
  window.CURRENT_ISSUE_ID = issueId;
  console.log("💬 initCommentSystem:", issueId);

  await new Promise(r => requestAnimationFrame(r));

  const zone = document.getElementById("battle-zone");
  if (!zone) {
    console.warn("[comments] battle-zone not found");
    return;
  }

  // 전선 라벨 = 글쓴이가 정한 진영 이름
  const alPro = document.getElementById("al-pro");
  const alCon = document.getElementById("al-con");
  if (alPro) alPro.textContent = fLabel("pro");
  if (alCon) alCon.textContent = fLabel("con");

  await loadComments(issueId);
  await initComposerUI();
  computeAce();
  renderSide("pro");
  renderSide("con");
  renderWarDashboard();
  renderMorale();
  bindEvents();
  initBattleFeed(issueId);
  renderHonors();
}

/* ======================
   컴포저 UI — 내 진영 상태 / 적진 침투 모드
====================== */
let INFILTRATE = false;      // 침투 모드 (상대 진영으로 글쓰기)
let INFIL_LEFT = null;       // 오늘 남은 침투 횟수
let REPLY_LEFT = null;       // 오늘 남은 대댓글 횟수 (기본 40/일)

/* 🗯️ 대댓글 연장권 — 하루 한도 소진 시 보유하면 사용 제안(+15). 침투권과 동일 패턴 */
async function ensureReplyQuota() {
  if (REPLY_LEFT === null) {
    try { const { data } = await window.supabaseClient.rpc("reply_status"); REPLY_LEFT = data?.left ?? 40; }
    catch (_) { REPLY_LEFT = 40; }
  }
  if (REPLY_LEFT > 0) return true;
  // 소진 → 연장권 제안
  const inv = window.GALLA_myItems ? await window.GALLA_myItems() : {};
  if ((inv.reply_pass || 0) <= 0) {
    alert("오늘의 대댓글 횟수(40회)를 모두 썼어요. 내일 다시 이어가거나\n🗯️ 대댓글 연장권(+15)으로 이어갈 수 있어요. (설정 › GP 상점)");
    return false;
  }
  if (!confirm(`오늘 대댓글 40회를 다 썼어요.\n🗯️ 대댓글 연장권을 써서 15회 더 이어갈까요? (보유 ${inv.reply_pass})`)) return false;
  const { data: ur } = await window.supabaseClient.rpc("use_reply_pass");
  if (!ur?.ok) { alert("연장권 사용에 실패했어요."); return false; }
  REPLY_LEFT += 15;
  window.BattleFX?.banner?.("🗯️ 대댓글 연장권 사용! +15", "cheer");
  return true;
}

async function initComposerUI() {
  const bottom = document.querySelector(".battle-input-bottom");
  const input = document.getElementById("battle-comment-input");
  if (!bottom) return;

  // 미투표: 잠금 안내 — 진영은 투표로만 정해진다
  if (!ME.faction) {
    bottom.innerHTML = `
      <div class="composer-side locked" id="composer-side">
        <span class="cs-flag">🔒 위에서 투표해 진영을 정하면 참전할 수 있어요</span>
      </div>`;
    if (input) input.placeholder = "투표하고 참전하세요…";
    return;
  }

  // 투표자: 내 진영 상태바 + 침투 버튼
  const my = ME.faction;
  const myLabel = fLabel(my);
  const enemyLabel = fLabel(my === "pro" ? "con" : "pro");

  const { data: st } = await window.supabaseClient.rpc("infiltration_status");
  INFIL_LEFT = st?.left ?? 3;
  try { const { data: rs } = await window.supabaseClient.rpc("reply_status"); REPLY_LEFT = rs?.left ?? 40; }
  catch (_) { REPLY_LEFT = 40; }

  bottom.innerHTML = `
    <div class="composer-side ${my}" id="composer-side">
      <span class="cs-flag">🎖 ${myLabel} 진영으로 참전 중</span>
      <button type="button" class="infiltrate-btn" id="infiltrate-btn">
        🕵️ 적진 침투 <b id="infil-left">${INFIL_LEFT}</b>/3
      </button>
    </div>`;
  if (input) input.placeholder = "아군 전선에 새 의견 쓰기…";

  document.getElementById("infiltrate-btn").addEventListener("click", async () => {
    if (!INFILTRATE && INFIL_LEFT <= 0) {
      // 🕵️ 침투권 보유 시 한도 +1 제안
      const inv = window.GALLA_myItems ? await window.GALLA_myItems() : {};
      const passes = inv.infiltrate_pass || 0;
      if (passes <= 0) {
        alert("오늘의 침투 횟수를 모두 썼어요. 내일 다시 침투할 수 있어요.\n(🕵️ 침투권이 있으면 한도 +1 — GP 상점)");
        return;
      }
      if (!confirm(`오늘 침투 한도를 모두 썼어요.\n🕵️ 침투권을 사용해 한도를 +1 할까요? (보유 ${passes}개)`)) return;
      const { data: ur } = await window.supabaseClient.rpc("use_infiltrate_pass");
      if (!ur?.ok) { alert("침투권 사용에 실패했어요."); return; }
      INFIL_LEFT += 1;
      const cntEl = document.getElementById("infil-left");
      if (cntEl) cntEl.textContent = INFIL_LEFT;
      window.BattleFX?.banner?.("🕵️ 침투권 사용! 한도 +1", "cheer");
    }
    INFILTRATE = !INFILTRATE;
    const box = document.getElementById("composer-side");
    box.classList.toggle("infiltrating", INFILTRATE);
    box.querySelector(".cs-flag").innerHTML = INFILTRATE
      ? `🕵️ <b>${enemyLabel} 진영 침투 모드</b> — 적진에 글이 올라갑니다`
      : `🎖 ${myLabel} 진영으로 참전 중`;
    if (input) input.placeholder = INFILTRATE
      ? `적진에 침투 글 쓰기… (오늘 ${INFIL_LEFT}회 남음)`
      : "아군 전선에 새 의견 쓰기…";
    window.BattleFX?.haptic("tap");
  });
}

function consumeInfiltration() {
  INFIL_LEFT = Math.max(0, (INFIL_LEFT ?? 3) - 1);
  const el = document.getElementById("infil-left");
  if (el) el.textContent = INFIL_LEFT;
  // 모드 해제 (1회 소모 후 복귀)
  INFILTRATE = false;
  const box = document.getElementById("composer-side");
  if (box) {
    box.classList.remove("infiltrating");
    box.querySelector(".cs-flag").innerHTML = `🎖 ${fLabel(ME.faction)} 진영으로 참전 중`;
  }
  const input = document.getElementById("battle-comment-input");
  if (input) input.placeholder = "아군 전선에 새 의견 쓰기…";
}

/* ======================
   💬 진영 작전회의 — 실시간 진영 전용 채팅 (상대 진영 입장 불가, RLS 강제)
====================== */
let CHAT_CHANNEL = null;
let CHAT_OPEN = false;

function chatRoomLabel() {
  return `${fLabel(ME.faction)} 진영 채팅방`;
}

function ensureChatUI() {
  let sheet = document.getElementById("faction-chat");
  if (sheet) return sheet;
  sheet = document.createElement("div");
  sheet.id = "faction-chat";
  sheet.className = "faction-chat " + (ME.faction || "");
  sheet.innerHTML = `
    <div class="fc-dim"></div>
    <div class="fc-sheet">
      <div class="fc-head">
        <span class="fc-title">${chatRoomLabel()}</span>
        <span class="fc-live">LIVE</span>
        <button class="fc-close" aria-label="닫기">✕</button>
      </div>
      <div class="fc-notice">🔒 우리 진영만 볼 수 있는 방입니다. 작전을 논의하세요!</div>
      <div class="fc-list" id="fc-list"></div>
      <div class="fc-inputrow">
        <input id="fc-input" maxlength="500" placeholder="아군에게 메시지 보내기…">
        <button id="fc-send">전송</button>
      </div>
    </div>`;
  document.body.appendChild(sheet);

  sheet.querySelector(".fc-dim").onclick = closeFactionChat;
  sheet.querySelector(".fc-close").onclick = closeFactionChat;
  const input = sheet.querySelector("#fc-input");
  const send = () => sendFactionChat(input);
  sheet.querySelector("#fc-send").onclick = send;
  input.addEventListener("keydown", e => { if (e.key === "Enter") send(); });
  return sheet;
}

function chatMsgHTML(m, prepend = false) {
  const mine = m.user_id === ME.userId;
  const nick = mine ? "" : `<div class="fc-nick">${escT(actorName(m.user_id))}</div>`;
  const t = new Date(m.created_at || Date.now());
  const hh = String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0");
  return `<div class="fc-msg ${mine ? "mine" : ""}">
    ${nick}
    <div class="fc-row">
      ${mine ? `<span class="fc-time">${hh}</span>` : ""}
      <div class="fc-bubble">${escT(m.content)}</div>
      ${mine ? "" : `<span class="fc-time">${hh}</span>`}
    </div>
  </div>`;
}

async function openFactionChat() {
  const supabase = window.supabaseClient;
  if (!ME.faction) {
    alert("진영 작전회의는 투표한 사람만 입장할 수 있어요. 먼저 투표해 주세요!");
    return;
  }
  const sheet = ensureChatUI();
  sheet.classList.add("open");
  CHAT_OPEN = true;
  window.BattleFX?.haptic("tap");

  // 최근 50개 로드 (RLS가 내 진영만 반환)
  const list = document.getElementById("fc-list");
  list.innerHTML = `<div class="fc-loading">불러오는 중…</div>`;
  const { data: msgs, error } = await supabase
    .from("faction_chats")
    .select("id,user_id,content,created_at")
    .eq("issue_id", window.CURRENT_ISSUE_ID)
    .eq("faction", ME.faction)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) { list.innerHTML = `<div class="fc-loading">채팅을 불러오지 못했어요.</div>`; return; }

  const rows = (msgs || []).reverse();
  await fetchFeedNicks(rows.map(m => m.user_id));
  list.innerHTML = rows.length
    ? rows.map(m => chatMsgHTML(m)).join("")
    : `<div class="fc-loading">아직 메시지가 없어요. 첫 작전을 지시하세요!</div>`;
  list.scrollTop = list.scrollHeight;

  // 실시간 구독 (RLS 덕에 상대 진영 메시지는 아예 수신 안 됨)
  if (CHAT_CHANNEL) { supabase.removeChannel(CHAT_CHANNEL); CHAT_CHANNEL = null; }
  CHAT_CHANNEL = supabase
    .channel("fchat-" + window.CURRENT_ISSUE_ID + "-" + ME.faction)
    .on("postgres_changes", {
      event: "INSERT", schema: "public", table: "faction_chats",
      filter: "issue_id=eq." + window.CURRENT_ISSUE_ID
    }, async payload => {
      const m = payload.new;
      if (m.faction !== ME.faction) return;            // 안전망 (RLS가 1차 차단)
      if (m.user_id === ME.userId) return;             // 내 메시지는 전송 시 이미 그림
      await fetchFeedNicks([m.user_id]);
      const l = document.getElementById("fc-list");
      if (!l) return;
      l.querySelector(".fc-loading")?.remove();
      l.insertAdjacentHTML("beforeend", chatMsgHTML(m));
      l.scrollTop = l.scrollHeight;
      window.BattleFX?.haptic("tap");
    })
    .subscribe();
}

function closeFactionChat() {
  const sheet = document.getElementById("faction-chat");
  sheet?.classList.remove("open");
  CHAT_OPEN = false;
  if (CHAT_CHANNEL) { window.supabaseClient.removeChannel(CHAT_CHANNEL); CHAT_CHANNEL = null; }
}

async function sendFactionChat(input) {
  const content = (input.value || "").trim();
  if (!content) return;
  const supabase = window.supabaseClient;
  input.value = "";

  const { data, error } = await supabase.from("faction_chats").insert({
    issue_id: window.CURRENT_ISSUE_ID,
    user_id: ME.userId,
    faction: ME.faction,
    content
  }).select("id,user_id,content,created_at").single();

  if (error) {
    console.error("[fchat] send failed", error);
    alert("전송에 실패했어요. 진영 투표 상태를 확인해 주세요.");
    return;
  }
  const l = document.getElementById("fc-list");
  l.querySelector(".fc-loading")?.remove();
  l.insertAdjacentHTML("beforeend", chatMsgHTML(data));
  l.scrollTop = l.scrollHeight;
}

/* ======================
   게임 유틸 (HP 티어 / 전투력 / 에이스 / FX)
====================== */
let ACE = { pro: null, con: null };

function hpTier(hp) {
  if (hp <= 0) return "ko";
  if (hp <= 30) return "lo";
  if (hp <= 60) return "mid";
  return "hi";
}
function combatPower(c) {
  const agg = likeAgg[c.id] || { up: 0 };
  return (c.attack_count || 0) + (c.defense_count || 0) + (c.support_count || 0) + (agg.up || 0);
}
function computeAce() {
  ACE = { pro: null, con: null };
  ["pro", "con"].forEach(side => {
    let best = null;
    allRows.forEach(r => {
      if (r.faction !== side || r.hp <= 0) return;
      if (!best || r.hp > best.hp || (r.hp === best.hp && combatPower(r) > combatPower(best))) best = r;
    });
    if (best) ACE[side] = best.id;
  });
}

/* HP 바 마크업 (티어 색 + 격파 상태) */
function hpBarHTML(c) {
  const hp = Math.max(0, c.hp | 0);
  const tier = hpTier(c.hp);
  return `
    <div class="hp-wrap ${tier === "ko" ? "ko" : ""}">
      <div class="hp-bar hp-${tier}">
        <div class="hp-ghost" style="width:${hp}%"></div>
        <div class="hp-fill" style="width:${hp}%"></div>
      </div>
      <span class="hp-text">${hp <= 0 ? "💀 격파" : "HP " + hp}</span>
      ${hp <= 0 && ME.userId && c.user_id === ME.userId
        ? `<button class="revive-btn" data-id="${c.id}">✨ 부활</button>` : ""}
    </div>`;
}

/* 플로팅 전투 텍스트 (-12 / +8 / +12 CRIT 등) */
function spawnCombatText(unit, text, kind) {
  if (!unit) return;
  const el = document.createElement("div");
  el.className = "combat-float " + kind;
  el.textContent = text;
  unit.appendChild(el);
  setTimeout(() => el.remove(), 1100);
}
/* 피격/힐 임팩트 */
function hitFx(unit, kind) {
  if (!unit) return;
  unit.classList.remove("fx-hit", "fx-heal");
  void unit.offsetWidth; // reflow로 애니메이션 리셋
  unit.classList.add(kind === "heal" ? "fx-heal" : "fx-hit");
  setTimeout(() => unit.classList.remove("fx-hit", "fx-heal"), 600);
}
/* HP 바 즉시 갱신(격파 반영) */
function applyHpToUnit(unit, hp) {
  if (!unit) return;
  const clamped = Math.max(0, hp | 0);
  unit.dataset.hp = clamped;
  const bar = unit.querySelector(".hp-bar");
  const fill = unit.querySelector(".hp-fill");
  const ghost = unit.querySelector(".hp-ghost");
  const text = unit.querySelector(".hp-text");
  if (fill) fill.style.width = clamped + "%";
  if (ghost) setTimeout(() => { ghost.style.width = clamped + "%"; }, 260);
  if (text) text.textContent = clamped <= 0 ? "💀 격파" : "HP " + clamped;
  if (bar) { bar.className = "hp-bar hp-" + hpTier(hp); }
  const wrap = unit.querySelector(".hp-wrap");
  if (wrap) wrap.classList.toggle("ko", clamped <= 0);
  if (clamped <= 0) unit.classList.add("ko");
}

/* 진영 사기 게이지 (전투력 tug-of-war) */
function renderMorale() {
  const host = document.querySelector(".comment-war-header");
  if (!host) return;
  let bar = document.getElementById("battle-morale");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "battle-morale";
    bar.className = "battle-morale";
    host.appendChild(bar);
  }
  let pro = 0, con = 0;
  allRows.forEach(r => {
    const p = Math.max(0, r.hp) + combatPower(r) * 4;
    if (r.faction === "pro") pro += p; else if (r.faction === "con") con += p;
  });
  const tot = pro + con || 1;
  const proPct = Math.round(pro / tot * 100);
  const lead = proPct > 50 ? "pro" : proPct < 50 ? "con" : "even";
  bar.innerHTML = `
    <div class="bm-top">
      <span class="bm-side pro ${lead === "pro" ? "lead" : ""}">${fLabel("pro")} 전투력 ${Math.round(pro)}</span>
      <span class="bm-vs">VS</span>
      <span class="bm-side con ${lead === "con" ? "lead" : ""}">${Math.round(con)} 전투력 ${fName("con")} 👎</span>
    </div>
    <div class="bm-track">
      <div class="bm-pro" style="width:${proPct}%"></div>
      <div class="bm-con" style="width:${100 - proPct}%"></div>
      <div class="bm-needle" style="left:${proPct}%"></div>
    </div>
    <div class="bm-status">${lead === "even" ? "⚖️ 팽팽한 접전" : `${fLabel(lead)} 진영 우세`} · ${proPct}%</div>
    <div class="bm-stats">⚡ 총 교전 <b id="stat-total">0</b> · 💥 <span id="stat-atk">0</span> · 🛡 <span id="stat-def">0</span> · 💣 <span id="stat-sup">0</span></div>
    ${ME.faction
      ? `<div class="bm-mine ${ME.faction}">🎖 내 진영: ${fLabel(ME.faction)} — <b>적군</b>을 공격하고 <b>아군</b>을 지켜라!</div>
         <button type="button" class="fc-enter ${ME.faction}" id="fc-open">
           <span class="fc-enter-ico">💬</span>
           <span class="fc-enter-tx">
             <b>실시간 진영 채팅방 <span class="fc-enter-live">LIVE</span></b>
             <small>우리 ${fLabel(ME.faction)} 진영끼리만 · 지금 입장해 대화하기</small>
           </span>
           <span class="fc-enter-arrow">›</span>
         </button>`
      : `<div class="bm-mine none">🔒 위에서 투표하면 진영이 정해지고 참전할 수 있어요</div>`}`;

  const openBtn = bar.querySelector("#fc-open");
  if (openBtn) openBtn.onclick = openFactionChat;

  // 슬림 전황 수치 채우기 (전황표 3박스를 이 한 줄로 통합)
  renderWarDashboard();
}

/* ======================
   실시간 전장 (킬 피드 / HP 동기화 / 격파 배너 / 전공 / 콤보)
====================== */
let FEED_CHANNEL = null;
let feedNickCache = {};          // user_id → nickname
let COMBO = { n: 0, t: 0 };      // 연속 참전 콤보 (10초 창)

function escT(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function actorName(uid) {
  if (!uid) return "익명";
  return feedNickCache[uid] || profileMap[uid]?.nickname || "익명 전사";
}
async function fetchFeedNicks(ids) {
  const need = [...new Set(ids.filter(u => u && !feedNickCache[u] && !profileMap[u]))];
  if (!need.length) return;
  const { data } = await window.supabaseClient
    .from("user_profiles").select("user_id,nickname").in("user_id", need);
  (data || []).forEach(p => { feedNickCache[p.user_id] = p.nickname; });
}

const ACTION_META = {
  attack:  { icon: "💥", verb: "공격", delta: "-12", cls: "atk" },
  defend:  { icon: "🛡", verb: "방어", delta: "+8",  cls: "def" },
  support: { icon: "💣", verb: "지원", delta: "+12", cls: "sup" }
};

function feedLineHTML(a, isNew) {
  const meta = ACTION_META[a.action_type] || ACTION_META.attack;
  const target = allRows.find(r => r.id === a.comment_id);
  const targetName = target ? (target.is_anonymous ? "익명" : (profileMap[target.user_id]?.nickname || "익명")) : "???";
  const targetSide = target?.faction === "pro" ? "👍" : "👎";
  const t = a.created_at ? new Date(a.created_at) : new Date();
  const hh = String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0");
  return `<div class="bf-line ${meta.cls} ${isNew ? "new" : ""}">
    <span class="bf-time">${hh}</span>
    <b class="bf-actor ${a.side === "pro" ? "pro" : "con"}">${escT(actorName(a.user_id))}</b>
    <span class="bf-verb">${meta.icon} ${meta.verb}</span>
    <span class="bf-arrow">→</span>
    <span class="bf-target">${targetSide} ${escT(targetName)}</span>
    <b class="bf-delta">${meta.delta}</b>
  </div>`;
}

function ensureFeedBox() {
  let box = document.getElementById("battle-feed");
  if (box) return box;
  const anchor = document.getElementById("battle-morale") || document.querySelector(".comment-war-header");
  if (!anchor) return null;
  box = document.createElement("div");
  box.id = "battle-feed";
  box.className = "battle-feed";
  box.innerHTML = `<div class="bf-title">📡 전장 속보 <span class="bf-live">LIVE</span></div><div class="bf-list" id="bf-list"><div class="bf-empty">아직 교전 기록이 없습니다.</div></div>`;
  anchor.after(box);
  return box;
}

async function initBattleFeed(issueId) {
  const supabase = window.supabaseClient;
  const box = ensureFeedBox();
  if (!box) return;

  // 초기 로그: 이 이슈 댓글들에 대한 최근 액션 8건
  const ids = allRows.map(r => r.id);
  if (ids.length) {
    const { data: logs } = await supabase
      .from("comment_actions")
      .select("comment_id,user_id,side,action_type,created_at")
      .in("comment_id", ids)
      .order("created_at", { ascending: false })
      .limit(8);
    if (logs?.length) {
      await fetchFeedNicks(logs.map(l => l.user_id));
      document.getElementById("bf-list").innerHTML = logs.map(l => feedLineHTML(l, false)).join("");
    }
  }

  // 실시간 구독: 새 전투 로그 + 댓글 HP 변동
  if (FEED_CHANNEL) { supabase.removeChannel(FEED_CHANNEL); FEED_CHANNEL = null; }
  FEED_CHANNEL = supabase
    .channel("battle-" + issueId)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "comment_actions" }, async payload => {
      const a = payload.new;
      if (!allRows.some(r => r.id === a.comment_id)) return; // 다른 이슈
      await fetchFeedNicks([a.user_id]);
      pushFeedLine(a);
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "comments" }, payload => {
      const c = payload.new;
      const row = allRows.find(r => r.id === c.id);
      if (!row) return; // 다른 이슈
      const oldHp = row.hp;
      if (typeof c.hp === "number" && c.hp !== oldHp) {
        row.hp = c.hp;
        row.attack_count = c.attack_count; row.defense_count = c.defense_count; row.support_count = c.support_count;
        syncUnitHp(c.id, oldHp, c.hp);
        renderMorale();
      }
    })
    // 새 댓글/답글 실시간 부분 삽입 — 남의 참전·전투 답글이 그 자리에 바로 나타난다
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "comments", filter: "issue_id=eq." + issueId }, async payload => {
      const c = payload.new;
      if (!c || c.user_id === ME.userId) return;          // 내 것은 로컬에서 이미 처리
      if (allRows.some(r => r.id === c.id)) return;
      if (c.status === "deleted") return;

      await fetchFeedNicks([c.user_id]);
      if (!profileMap[c.user_id] && feedNickCache[c.user_id]) {
        profileMap[c.user_id] = { nickname: feedNickCache[c.user_id], level: 1 };
      }
      // 침투 노출 판정용 작성자 투표 진영 (미보유 시 단건 조회)
      if (!authorVoteMap[c.user_id]) {
        const { data: v } = await window.supabaseClient
          .from("votes").select("type")
          .eq("issue_id", issueId).eq("user_id", c.user_id).limit(1);
        const t = v?.[0]?.type;
        if (t === "pro" || t === "con") authorVoteMap[c.user_id] = t;
      }

      allRows.unshift(c);

      if (c.parent_id) {
        const rootId = rootIdOf(c.id);
        (replyMap[rootId] ||= []).push(c);
        const rootUnit = document.querySelector(`.comment[data-id="${rootId}"]`);
        const repliesBox = rootUnit?.querySelector(":scope > .replies");
        if (repliesBox) {
          repliesBox.insertAdjacentHTML("beforeend", makeReply(c));
          applySideColoring();
          updateReplyMeta(rootUnit, rootId);
        }
      } else if (c.faction === "pro" || c.faction === "con") {
        state[c.faction].data.unshift(c);
        const list = document.getElementById(c.faction + "-list");
        if (list && state[c.faction].page === 1) {
          list.querySelector(".empty-zone")?.remove();
          list.insertAdjacentHTML("afterbegin", makeComment(c));
          applySideColoring();
        }
      }
      renderWarDashboard();
      renderMorale();
    })
    .subscribe();
}

function pushFeedLine(a) {
  const list = document.getElementById("bf-list");
  if (!list) return;
  list.querySelector(".bf-empty")?.remove();
  list.insertAdjacentHTML("afterbegin", feedLineHTML(a, true));
  while (list.children.length > 8) list.lastElementChild.remove();
}

/* 남이 때린/살린 HP 변동을 내 화면에도 반영 (본인 조작분은 로컬 연출과 중복돼도 무해) */
function syncUnitHp(commentId, oldHp, newHp) {
  const unit = document.querySelector(`.comment[data-id="${commentId}"], .reply[data-id="${commentId}"]`);
  if (!unit) return;
  const shown = Number(unit.dataset.hp);
  if (shown === newHp) return; // 이미 로컬 연출로 반영됨
  applyHpToUnit(unit, newHp);

  const FX = window.BattleFX;
  const row = allRows.find(r => r.id === commentId);
  const isMine = !!(ME.userId && row && row.user_id === ME.userId);
  const isMySide = !!(ME.faction && row && row.faction === ME.faction);

  if (newHp < oldHp) {
    hitFx(unit, "hit");
    spawnCombatText(unit, String(newHp - oldHp), newHp <= 0 ? "crit" : "dmg");
    if (FX) FX.burstAt(unit, newHp <= 0 ? "ko" : "attack");
    // ⚠ 내 댓글 피격 경고 (실시간)
    if (isMine && FX) {
      FX.vignette("danger");
      FX.banner(newHp <= 0 ? "💀 내 댓글이 격파당했다!" : "⚠ 내 댓글이 공격받고 있다!", "warn");
      FX.haptic(newHp <= 0 ? "ko" : "warn");
    } else if (isMySide && newHp <= 0 && FX) {
      FX.vignette("danger");
      FX.haptic("warn");
    }
    if (newHp <= 0) showKoBanner(commentId);
  } else {
    hitFx(unit, "heal");
    spawnCombatText(unit, "+" + (newHp - oldHp), "heal");
    if (FX) FX.burstAt(unit, "support");
    const revived = oldHp <= 0 && newHp > 0;
    if (revived) spawnCombatText(unit, "✨ 부활!", "heal");
    // 🎉 내 댓글을 아군이 지켜줌 (실시간 환호)
    if (isMine && FX) {
      FX.vignette("heal");
      FX.banner(revived ? "✨ 아군이 내 댓글을 부활시켰다!" : "🛡 아군이 내 댓글을 지켜줬다!", "cheer");
      FX.confetti(40);
      FX.haptic("cheer");
    }
  }
}

/* 💀 격파 배너 (전장 전체 연출) */
function showKoBanner(commentId) {
  const row = allRows.find(r => r.id === commentId);
  const name = row ? (row.is_anonymous ? "익명" : (profileMap[row.user_id]?.nickname || "익명")) : "???";
  const side = row?.faction === "pro" ? "👍" : "👎";
  const el = document.createElement("div");
  el.className = "ko-banner";
  el.innerHTML = `<div class="ko-inner"><span class="ko-skull">💀</span><b>${side} ${escT(name)}</b>의 댓글 <span class="ko-word">격파!</span></div>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

/* 🔥 콤보 (10초 내 연속 참전) */
function bumpCombo() {
  const now = Date.now();
  COMBO.n = (now - COMBO.t < 10000) ? COMBO.n + 1 : 1;
  COMBO.t = now;
  if (COMBO.n >= 2) {
    const el = document.createElement("div");
    el.className = "combo-pop";
    el.textContent = `🔥 ${COMBO.n} COMBO!`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1300);
  }
}

/* 🎖 전공 훈장 — 이 전장 최다 공격/방어/지원 */
async function renderHonors() {
  const ids = allRows.map(r => r.id);
  if (!ids.length) return;
  const { data: logs } = await window.supabaseClient
    .from("comment_actions")
    .select("user_id,action_type")
    .in("comment_id", ids)
    .limit(2000);
  if (!logs?.length) return;

  const agg = {}; // uid → {attack,defend,support}
  logs.forEach(l => {
    const a = agg[l.user_id] ||= { attack: 0, defend: 0, support: 0 };
    if (a[l.action_type] !== undefined) a[l.action_type]++;
  });
  const top = (k) => Object.entries(agg).sort((x, y) => y[1][k] - x[1][k])[0];
  const picks = [
    { k: "attack", icon: "💥", label: "최다 공격" },
    { k: "defend", icon: "🛡", label: "최다 방어" },
    { k: "support", icon: "💣", label: "최다 지원" }
  ].map(p => ({ ...p, e: top(p.k) })).filter(p => p.e && p.e[1][p.k] > 0);
  if (!picks.length) return;

  await fetchFeedNicks(picks.map(p => p.e[0]));

  let box = document.getElementById("battle-honors");
  if (!box) {
    box = document.createElement("div");
    box.id = "battle-honors";
    box.className = "battle-honors";
    (document.getElementById("battle-feed") || document.getElementById("battle-morale") || document.querySelector(".comment-war-header"))?.after(box);
  }
  box.innerHTML = `<div class="bh-title">🎖 전공 훈장</div><div class="bh-row">` +
    picks.map(p => `
      <div class="bh-card ${p.k}">
        <span class="bh-ic">${p.icon}</span>
        <b class="bh-name">${escT(actorName(p.e[0]))}</b>
        <span class="bh-label">${p.label} ${p.e[1][p.k]}회</span>
      </div>`).join("") + `</div>`;
}

/* ======================
   Data Loading
====================== */

async function loadComments(issueId) {
  const supabase = window.supabaseClient;

  const { data: sess } = await supabase.auth.getSession();
  ME.userId = sess?.session?.user?.id || null;

  // 내 진영 = 이 이슈에 대한 내 투표 (서버 RPC도 동일 기준으로 강제)
  ME.faction = null;
  if (ME.userId) {
    const { data: myVote } = await supabase
      .from("votes")
      .select("type")
      .eq("issue_id", issueId)
      .eq("user_id", ME.userId)
      .limit(1);
    const t = myVote?.[0]?.type;
    if (t === "pro" || t === "con") ME.faction = t;
  }
  window.MY_VOTE_TYPE = ME.faction;

  const { data: rows, error } = await supabase
    .from("comments")
    .select("id,user_id,content,created_at,faction,hp,attack_count,defense_count,support_count,parent_id,is_anonymous,battle_action")
    .eq("issue_id", issueId)
    .neq("status", "deleted")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[comments] load failed", error);
    return;
  }
  allRows = rows || [];

  // 작성자 프로필
  profileMap = {};
  const userIds = [...new Set(allRows.map(r => r.user_id).filter(Boolean))];
  if (userIds.length) {
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("user_id,nickname,level")
      .in("user_id", userIds);
    profiles?.forEach(p => profileMap[p.user_id] = p);
  }

  // 작성자별 이 이슈 투표 진영 (침투 노출용 — votes SELECT 공개 정책)
  // 침투 = 작성자 실제 투표 진영 ≠ 글이 놓인 진영. 정체를 숨기지 않고 모두에게 노출한다.
  authorVoteMap = {};
  if (userIds.length) {
    const { data: avotes } = await supabase
      .from("votes")
      .select("user_id,type")
      .eq("issue_id", issueId)
      .in("user_id", userIds);
    avotes?.forEach(v => { if (v.type === "pro" || v.type === "con") authorVoteMap[v.user_id] = v.type; });
  }

  // 좋아요 집계 + 내 좋아요
  likeAgg = {};
  ME.likes = new Map();
  const ids = allRows.map(r => r.id);
  if (ids.length) {
    const { data: likes } = await supabase
      .from("comment_likes")
      .select("comment_id,user_id,value")
      .in("comment_id", ids);
    likes?.forEach(l => {
      const a = likeAgg[l.comment_id] ||= { up: 0, down: 0 };
      if (l.value === 1) a.up++; else a.down++;
      if (ME.userId && l.user_id === ME.userId) ME.likes.set(l.comment_id, l.value);
    });
  }

  // 내 전투 액션 최근 시각 (쿨다운 계산용) — key `${comment_id}:${action_type}` → epoch ms
  ME.actions = new Map();
  if (ME.userId && ids.length) {
    const { data: acts } = await supabase
      .from("comment_actions")
      .select("comment_id,action_type,created_at")
      .eq("user_id", ME.userId)
      .in("comment_id", ids)
      .order("created_at", { ascending: false });
    acts?.forEach(a => {
      const k = `${a.comment_id}:${a.action_type}`;
      if (!ME.actions.has(k)) ME.actions.set(k, new Date(a.created_at).getTime());
    });
  }

  // 댓글/대댓글 분류 — 답글의 답글(parent가 답글)은 최상위 댓글 스레드로 승격(1depth 유지).
  // 승격 없이는 replyMap[답글id]가 렌더되지 않아 화면에서 영영 안 보이는 버그가 있었다.
  replyMap = {};
  const top = { pro: [], con: [] };
  allRows.forEach(r => {
    if (r.parent_id) {
      (replyMap[rootIdOf(r.id)] ||= []).push(r);
    } else if (r.faction === "pro" || r.faction === "con") {
      top[r.faction].push(r);
    }
  });
  // 대댓글은 오래된 순으로 표시
  Object.values(replyMap).forEach(list => list.reverse());

  // 교전 점수순 정렬 → 빌보드 상위 노출
  const score = c =>
    (c.attack_count || 0) + (c.defense_count || 0) + (c.support_count || 0) +
    ((likeAgg[c.id]?.up) || 0) + ((replyMap[c.id]?.length) || 0);
  top.pro.sort((a, b) => score(b) - score(a));
  top.con.sort((a, b) => score(b) - score(a));

  state.pro.data = top.pro;
  state.con.data = top.con;
}

/* ======================
   Rendering
====================== */

function displayName(c) {
  if (c.is_anonymous) return "익명";
  return profileMap[c.user_id]?.nickname || "익명";
}
// 닉네임 클릭 → 유저 시트 (익명·본인 제외는 시트가 처리)
function nameSpan(c) {
  const nm = displayName(c);
  if (c.is_anonymous || !c.user_id) return `<span class="user-name">${nm}</span>`;
  return `<span class="user-name userlink" data-user-id="${c.user_id}" data-user-nick="${nm.replace(/"/g, "&quot;")}">${nm}</span>`;
}

// ⋯ 액션 시트: 일기토 신청 / 신고 / 차단 (자체 스타일)
function openCommentMoreMenu({ uid, nick, cid }) {
  const meId = ME?.userId || null;
  const isOther = uid && uid !== meId;
  document.getElementById("cmm-sheet")?.remove();
  const sheet = document.createElement("div");
  sheet.id = "cmm-sheet";
  sheet.style.cssText = "position:fixed;inset:0;z-index:99998;display:flex;align-items:flex-end;justify-content:center";
  const opt = (icon, label, cls) => `<button class="cmm-opt ${cls}" style="display:flex;gap:10px;align-items:center;width:100%;padding:15px 18px;border:none;background:transparent;color:#eef0f4;font-size:15px;font-weight:700;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.06)"><span style="font-size:18px">${icon}</span>${label}</button>`;
  sheet.innerHTML = `
    <div style="position:absolute;inset:0;background:rgba(0,0,0,.5)"></div>
    <div style="position:relative;width:100%;max-width:480px;background:#16171c;border-radius:18px 18px 0 0;padding:8px 0 max(8px,env(safe-area-inset-bottom));animation:cmmUp .22s ease">
      ${isOther ? opt("⚔️", `<b style="color:#f5cf6b">일기토 신청</b> · ${escT(nick)}`, "duel") : ""}
      ${isOther ? opt("🚨", "신고", "report") : ""}
      ${isOther ? opt("🚫", "이 사용자 차단", "block") : opt("🙈", "내 댓글", "self")}
      <button class="cmm-opt cancel" style="width:100%;padding:15px;border:none;background:transparent;color:#8a8f9a;font-weight:800;cursor:pointer">닫기</button>
    </div>`;
  if (!document.getElementById("cmm-css")) {
    const s = document.createElement("style"); s.id = "cmm-css";
    s.textContent = "@keyframes cmmUp{from{transform:translateY(100%)}}.cmm-opt:active{background:rgba(255,255,255,.06)!important}";
    document.head.appendChild(s);
  }
  document.body.appendChild(sheet);
  const close = () => sheet.remove();
  sheet.firstElementChild.addEventListener("click", close);
  sheet.querySelector(".cancel").addEventListener("click", close);
  sheet.querySelector(".duel")?.addEventListener("click", () => {
    close();
    location.href = `duel.html?challenge=${uid}&issue=${window.CURRENT_ISSUE_ID || ""}`;
  });
  const goReport = () => {
    close();
    if (window.GALLA_openReportMenu) window.GALLA_openReportMenu({ contentType: "comment", contentId: cid, authorId: uid, authorName: nick });
    else alert("신고 기능을 불러오지 못했어요.");
  };
  sheet.querySelector(".report")?.addEventListener("click", goReport);
  sheet.querySelector(".block")?.addEventListener("click", goReport);
}
function displayLevel(c) {
  return profileMap[c.user_id]?.level || 1;
}
function likeUI(c) {
  const agg = likeAgg[c.id] || { up: 0, down: 0 };
  const mine = ME.likes.get(c.id);
  return `
    <span class="like ${mine === 1 ? "active-like" : ""}" data-id="${c.id}">👍${agg.up}</span>
    <span class="dislike ${mine === -1 ? "active-dislike" : ""}" data-id="${c.id}">👎${agg.down}</span>`;
}

/* 진영 규칙 (서버 battle_action RPC와 동일)
   - 내 진영 없음(미투표) → 참전 불가
   - 반대 진영 댓글 → 💥공격만 (60초 쿨다운 후 재공격 가능)
   - 같은 진영 댓글  → 🛡방어 · 💣지원만 (동일 쿨다운) */
const ACTION_LABEL = { attack: "💥공격", defend: "🛡방어", support: "💣지원" };

/* 침투자 판별 — 작성자의 실제 투표 진영 ≠ 글이 놓인 진영.
   위장 없음: 침투자의 실제 입장(진영)을 모두에게 노출한다(싸움 유도). */
function isInfiltrator(c) {
  const v = authorVoteMap[c.user_id];
  return !!(v && (c.faction === "pro" || c.faction === "con") && v !== c.faction);
}
/* 화면 표시용 진영 — 침투자는 '실제 진영'을 노출, 그 외는 글이 놓인 진영 */
function shownFaction(c) {
  return isInfiltrator(c) ? authorVoteMap[c.user_id] : c.faction;
}

/* 관계 태그 — 침투자는 모두에게 노출('적진 침투'), 그 외는 내 기준 아군/적군.
   아군/적군 판정도 표시 진영(shownFaction) 기준. */
function relTag(c) {
  if (isInfiltrator(c)) {
    const mine = ME.userId && c.user_id === ME.userId;
    return `<span class="rel-tag infil">🕵️ ${mine ? "내 침투" : "침투자"} · 원래 ${fLabel(authorVoteMap[c.user_id])}</span>`;
  }
  if (!ME.faction) return "";
  return ME.faction === shownFaction(c)
    ? `<span class="rel-tag ally">아군</span>`
    : `<span class="rel-tag enemy">적군</span>`;
}
function battleBtn(c, action, customLabel) {
  const base = customLabel || ACTION_LABEL[action];
  const left = cooldownLeft(c.id, action);
  const cd = left > 0 ? ` cooldown" data-cd="${action}" data-until="${ME.actions.get(c.id + ":" + action) + BATTLE_COOLDOWN_MS}` : "";
  const label = left > 0 ? `${base} ${left}s` : base;
  const lbl = customLabel ? ` data-lbl="${customLabel}"` : "";
  return `<span class="action-${action}${cd}" data-id="${c.id}"${lbl}>${label}</span>`;
}
function battleButtonsFor(c) {
  const my = ME.faction;
  if (!my) {
    return `<span class="action-locked" data-id="${c.id}">🔒 투표 후 참전</span>`;
  }
  if (my !== c.faction) {
    // 적진의 침투자는 '격퇴' — 침입자를 몰아낸다는 게임 서사 (동작은 attack 그대로)
    return battleBtn(c, "attack", isInfiltrator(c) ? "💥격퇴" : null);
  }
  return battleBtn(c, "defend") + battleBtn(c, "support");
}

/* 쿨다운 카운트다운 티커 (1초마다 버튼 라벨 갱신, 끝나면 활성화) */
setInterval(() => {
  document.querySelectorAll("[data-cd]").forEach(el => {
    const until = Number(el.dataset.until);
    const left = Math.ceil((until - Date.now()) / 1000);
    const action = el.dataset.cd;
    const base = el.dataset.lbl || ACTION_LABEL[action];
    if (left > 0) {
      el.textContent = `${base} ${left}s`;
    } else {
      el.textContent = base;
      el.classList.remove("cooldown");
      delete el.dataset.cd;
      delete el.dataset.until;
    }
  });
}, 1000);

function makeReply(r) {
  const chip = r.battle_action === "attack"
    ? `<span class="reply-chip atk">💥 공격 −12</span>`
    : r.battle_action === "defend"
      ? `<span class="reply-chip def">🛡 방어 +8</span>`
      : "";
  const ko = r.hp <= 0 ? " ko" : "";
  const infil = isInfiltrator(r) ? " infil-unit" : "";
  return `
  <div class="reply${ko}${infil}" data-hp="${r.hp}" data-id="${r.id}" data-side="${r.faction}">
    <div class="head">
      <div class="user">
        ${nameSpan(r)}
        <span class="level-badge">Lv.${displayLevel(r)}</span>
        ${relTag(r)}
      </div>
      ${hpBarHTML(r)}
    </div>
    <div class="body">${chip}${renderCommentText(r.content)}</div>
    <div class="reply-actions" data-side="${r.faction}">
      ${likeUI(r)}
      ${battleButtonsFor(r)}
    </div>
  </div>`;
}

function makeComment(c) {
  const replies = replyMap[c.id] || [];
  const battleButtons = battleButtonsFor(c);

  const ko = c.hp <= 0 ? " ko" : "";
  const isAce = ACE[c.faction] === c.id;
  const infil = isInfiltrator(c) ? " infil-unit" : "";
  const power = combatPower(c);

  // 답글 상시 노출 — 4개 초과면 최근 3개만 펼치고 위에 로컬 '이전 답글 보기' 버튼
  const shown = replies.length > 4 ? replies.slice(-3) : replies;
  const hiddenCount = replies.length - shown.length;

  return `
    <div class="comment${ko}${isAce ? " ace" : ""}${infil}" data-hp="${c.hp}" data-side="${c.faction}" data-id="${c.id}">
    <div class="head">
      <div class="user">
        <span class="side-icon"></span>
        ${nameSpan(c)}
        <span class="level-badge">Lv.${displayLevel(c)}</span>
        ${relTag(c)}
        ${isAce ? `<span class="ace-badge">👑 에이스</span>` : ``}
        ${c.is_anonymous ? `<span class="anon">익명</span>` : ``}
      </div>
      ${hpBarHTML(c)}
    </div>

    <div class="body">${renderCommentText(c.content)}</div>

    <div class="actions">
      ${likeUI(c)}
      ${battleButtons}
      <span class="cp-chip" title="이 댓글이 받은 공격+방어+지원+추천을 합친 전투력">⚡ 전투력 ${power}</span>
      <span class="action-more">⋯</span>
    </div>

    <div class="reply-meta">💬 ${replies.length} · 💥 ${c.attack_count || 0} · 🛡 ${c.defense_count || 0} · 💣 ${c.support_count || 0}</div>

    <div class="replies" data-id="${c.id}">
      ${hiddenCount > 0 ? `<button type="button" class="reply-older" data-id="${c.id}">이전 답글 ${hiddenCount}개 보기</button>` : ``}
      ${shown.map(makeReply).join("")}
    </div>
  </div>`;
}

/* ======================
   Engine
====================== */

function renderSide(side) {
  const s = state[side];
  const list = document.getElementById(side + "-list");
  if (!list) {
    console.warn("renderSide target missing:", side);
    return;
  }

  if (s.data.length === 0) {
    list.innerHTML = `<div class="empty-zone">아직 이 진영의 댓글이 없습니다. 첫 포문을 여세요!</div>`;
    buildPager(side, 0);
    return;
  }

  // 교전 점수순 정렬(로드 시) 유지 — 상위가 곧 전선의 최전방
  list.innerHTML = s.data
    .slice((s.page - 1) * PAGE_SIZE, s.page * PAGE_SIZE)
    .map(makeComment)
    .join("");

  buildPager(side, Math.ceil(s.data.length / PAGE_SIZE));
  applySideColoring();
}

function buildPager(side, total) {
  const pager = document.getElementById(`${side}-pager`);
  if (!pager) return;
  const s = state[side];
  pager.innerHTML = "";
  if (total <= 1) return;

  for (let i = 1; i <= total; i++) {
    const b = document.createElement("button");
    b.textContent = i;
    if (s.page === i) b.classList.add("active");
    b.onclick = () => { s.page = i; renderSide(side); };
    pager.appendChild(b);
  }
}

function renderWarDashboard() {
  // index.js의 loadWarData와 동일한 집계 방식 (피드 전황표와 수치 일치)
  const w = {
    pro: { total: 0, same: 0, oppo: 0 },
    con: { total: 0, same: 0, oppo: 0 },
    atk: 0, def: 0, sup: 0
  };

  allRows.forEach(row => {
    const f = row.faction;
    if (!w[f]) return;
    w[f].total++;
    w.atk += row.attack_count || 0;
    w.def += row.defense_count || 0;
    w.sup += row.support_count || 0;
    w[f].same += (row.defense_count || 0) + (row.support_count || 0);
    const enemy = f === "pro" ? "con" : "pro";
    w[enemy].oppo += row.attack_count || 0;
  });

  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
  };
  set("stat-pro-total", w.pro.total);
  set("stat-pro-same", w.pro.same);
  set("stat-pro-oppo", w.pro.oppo);
  set("stat-con-total", w.con.total);
  set("stat-con-same", w.con.same);
  set("stat-con-oppo", w.con.oppo);
  set("stat-total", w.atk + w.def + w.sup);
  set("stat-atk", w.atk);
  set("stat-sup", w.sup);
  set("stat-def", w.def);
}

function requireLogin() {
  if (ME.userId) return true;
  alert("로그인이 필요합니다.");
  return false;
}

/* 서버 battle_action 거부 사유 → 사용자 메시지 */
function battleReasonMsg(reason, data) {
  switch (reason) {
    case "no_faction": return "먼저 이 이슈에 투표해 진영을 정해야 참전할 수 있어요.";
    case "same_faction": return "같은 진영은 공격할 수 없어요.";
    case "cross_faction": return "같은 진영 댓글만 방어·지원할 수 있어요.";
    case "cooldown": return `쿨다운 중이에요. ${data?.wait ?? 60}초 후 다시 시도하세요.`;
    case "already": return "이미 이 댓글에 같은 행동을 했어요.";
    case "unauthorized": return "로그인이 필요합니다.";
    default: return null;
  }
}

/* ======================
   Interaction
====================== */

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;

  document.addEventListener("click", async e => {
    // ✨ 부활권: 격파당한 내 댓글 부활
    if (e.target.classList.contains("revive-btn")) {
      e.stopPropagation();
      const rid = Number(e.target.dataset.id);
      const inv = window.GALLA_myItems ? await window.GALLA_myItems() : {};
      const owned = inv.revive || 0;
      if (owned <= 0) { alert("✨ 부활권이 없어요. GP 상점에서 구매할 수 있어요. (800 GP)"); return; }
      if (!confirm(`✨ 부활권을 사용해 이 댓글을 HP 50으로 부활시킬까요? (보유 ${owned}개)`)) return;
      const { data: rv } = await window.supabaseClient.rpc("use_revive", { p_comment_id: rid });
      if (!rv?.ok) { alert("부활에 실패했어요: " + (rv?.reason || "오류")); return; }
      const unit = e.target.closest(".reply, .comment");
      if (unit) {
        applyHpToUnit(unit, rv.hp);
        e.target.remove();
        const FX = window.BattleFX;
        if (FX) { FX.burstAt(unit, "support"); FX.banner("✨ 댓글 부활!", "cheer"); FX.haptic("heal"); }
      }
      const row = allRows.find(r => r.id === rid);
      if (row) row.hp = rv.hp;
      return;
    }


    // 🔒 진영 미선택(미투표) → 참전 안내
    if (e.target.classList.contains("action-locked")) {
      alert("먼저 이 이슈에 투표해 진영을 정해야 참전할 수 있어요.");
      return;
    }

    // 💥🛡 전투 버튼 클릭 → 해당 유닛 아래 인라인 컴포저 (누구를 왜 치는지 그 자리에서 보이게)
    if (e.target.classList.contains("action-attack") || e.target.classList.contains("action-defend")) {
      if (!requireLogin()) return;
      const type = e.target.classList.contains("action-attack") ? "attack" : "defend";

      // 가장 가까운 유닛(답글이면 답글, 아니면 댓글) — .comment를 먼저 찾으면 답글의 진영을 잘못 판정한다
      const targetEl = e.target.closest(".reply, .comment");
      if (!targetEl) return;
      const targetSide = targetEl.dataset.side || "pro";

      // 진영 규칙 프론트 사전 검사 (서버 RPC가 최종 강제)
      if (!ME.faction) { alert("먼저 이 이슈에 투표해 진영을 정해야 참전할 수 있어요."); return; }
      if (type === "attack" && ME.faction === targetSide) { alert("같은 진영은 공격할 수 없어요. 상대 진영을 공격하세요."); return; }
      if (type === "defend" && ME.faction !== targetSide) { alert("같은 진영 댓글만 방어할 수 있어요."); return; }

      const cdLeft = cooldownLeft(Number(e.target.dataset.id), type);
      if (cdLeft > 0) {
        // ⚡ 쿨다운 리셋권 보유 시 즉시 사용 제안
        if (!(await offerCooldownReset(Number(e.target.dataset.id), type, cdLeft))) return;
      }

      const targetId = Number(e.target.dataset.id || targetEl.dataset.id);
      const nameEl = targetEl.querySelector(".head .user-name");
      const targetUser = nameEl ? nameEl.textContent.trim() : "익명";

      openInlineComposer(type, targetId, targetUser, targetEl);
      return;
    }

    // 💣 지원 → RPC로 HP/카운터 갱신 (같은 진영만)
    if (e.target.classList.contains("action-support")) {
      if (!requireLogin()) return;
      const id = Number(e.target.dataset.id);
      if (!id) return;

      const supUnit = e.target.closest(".reply") || e.target.closest(".comment");
      const supSide = supUnit?.dataset.side;
      if (!ME.faction) { alert("먼저 이 이슈에 투표해 진영을 정해야 참전할 수 있어요."); return; }
      if (ME.faction !== supSide) { alert("같은 진영 댓글만 지원할 수 있어요."); return; }

      const supLeft = cooldownLeft(id, "support");
      if (supLeft > 0) {
        if (!(await offerCooldownReset(id, "support", supLeft))) return;
      }

      const { data, error } = await window.supabaseClient.rpc("battle_action", {
        p_comment_id: id, p_action: "support",
        p_use_reset: RESET_ARMED.has(id + ":support")
      });
      RESET_ARMED.delete(id + ":support");
      if (error || !data?.ok) {
        alert(battleReasonMsg(data?.reason, data) || "지원에 실패했습니다.");
        if (!data?.reason) console.error("[support] failed", error || data);
        return;
      }

      markAction(id, "support");
      e.target.classList.add("cooldown");
      e.target.dataset.cd = "support";
      e.target.dataset.until = String(Date.now() + BATTLE_COOLDOWN_MS);
      e.target.textContent = `${ACTION_LABEL.support} 60s`;

      // 해당 유닛 HP 즉시 반영 + 힐 FX + 플로팅 텍스트
      const unit = e.target.closest(".reply") || e.target.closest(".comment");
      if (unit) {
        applyHpToUnit(unit, data.hp);
        hitFx(unit, "heal");
        spawnCombatText(unit, "+12 지원!", "heal");
        const FX = window.BattleFX;
        if (FX) {
          FX.burstAt(unit, "support");
          FX.shockwave(unit, "rgba(53,224,160,.9)");
          FX.haptic("heal");
          if (Number(unit.dataset.hp) >= 100) { FX.banner("💪 풀피 지원!", "cheer"); }
        }
        bumpCombo();
        renderMorale();
        renderHonors();
      }
      return;
    }

    // 👍👎 좋아요/싫어요 → comment_likes 테이블
    if (e.target.classList.contains("like") || e.target.classList.contains("dislike")) {
      if (!requireLogin()) return;
      const id = Number(e.target.dataset.id);
      if (!id) return;

      const supabase = window.supabaseClient;
      const desired = e.target.classList.contains("like") ? 1 : -1;
      const current = ME.likes.get(id);
      const agg = likeAgg[id] ||= { up: 0, down: 0 };

      if (current === desired) {
        // 취소
        const { error } = await supabase.from("comment_likes")
          .delete().eq("comment_id", id).eq("user_id", ME.userId);
        if (error) return console.error("[like] delete failed", error);
        ME.likes.delete(id);
        desired === 1 ? agg.up-- : agg.down--;
      } else {
        const { error } = await supabase.from("comment_likes")
          .upsert({ comment_id: id, user_id: ME.userId, value: desired });
        if (error) return console.error("[like] upsert failed", error);
        if (current === 1) agg.up--;
        if (current === -1) agg.down--;
        desired === 1 ? agg.up++ : agg.down++;
        ME.likes.set(id, desired);
      }

      // 같은 댓글의 표시들 갱신 (빌보드/스레드에 중복 표시될 수 있음)
      document.querySelectorAll(`.like[data-id="${id}"]`).forEach(el => {
        el.textContent = "👍" + agg.up;
        el.classList.toggle("active-like", ME.likes.get(id) === 1);
      });
      document.querySelectorAll(`.dislike[data-id="${id}"]`).forEach(el => {
        el.textContent = "👎" + agg.down;
        el.classList.toggle("active-dislike", ME.likes.get(id) === -1);
      });
      return;
    }

    // ⋯ 메뉴 — 일기토 신청 / 신고 / 차단
    if (e.target.classList.contains("action-more")) {
      const unit = e.target.closest(".comment");
      const nameEl = unit?.querySelector(".user-name[data-user-id]");
      const uid = nameEl?.getAttribute("data-user-id");
      const nick = nameEl?.getAttribute("data-user-nick") || "상대";
      const cid = unit?.getAttribute("data-id");
      openCommentMoreMenu({ uid, nick, cid });
      return;
    }

    // 이전 답글 로컬 펼침 (리로드 없음 — 답글은 항상 노출, 4개 초과분만 접혀 있음)
    const older = e.target.closest(".reply-older");
    if (older) {
      const id = Number(older.dataset.id);
      const wrap = older.closest(".replies");
      if (wrap) {
        wrap.innerHTML = (replyMap[id] || []).map(makeReply).join("");
        applySideColoring();
      }
      return;
    }
  });

  // 전송 — 하단 바는 '새 최상위 의견(참전/침투)' 전용. 전투 답글은 인라인 컴포저가 처리.
  document.getElementById("battle-comment-submit")
    ?.addEventListener("click", async () => {
      if (!requireLogin()) return;

      const input = document.getElementById("battle-comment-input");
      if (!input) return;

      const supabase = window.supabaseClient;

      // 진영은 투표로 고정 — 미투표자는 참전 불가
      if (!ME.faction) {
        alert("먼저 위에서 투표해 진영을 정하면 참전할 수 있어요.");
        return;
      }
      const side = INFILTRATE ? (ME.faction === "pro" ? "con" : "pro") : ME.faction;

      const text = input.value.trim();
      if (!text) {
        alert("의견을 입력하세요.");
        return;
      }

      const wasInfiltration = INFILTRATE;
      const { data: newRow, error } = await supabase.from("comments").insert({
        issue_id: window.CURRENT_ISSUE_ID,
        user_id: ME.userId,
        faction: side,
        content: text
      }).select("id,user_id,content,created_at,faction,hp,attack_count,defense_count,support_count,parent_id,is_anonymous,battle_action").single();
      if (error) {
        if (String(error.message || "").includes("infiltration_limit")) {
          alert("오늘의 침투 횟수(3회)를 모두 썼어요. 내일 다시 침투할 수 있어요.");
          consumeInfiltration(); // 카운터 0 동기화 + 모드 해제
          return;
        }
        console.error("[comment] insert failed", error);
        alert("댓글 등록에 실패했습니다.");
        return;
      }

      // ✨ 참전/침투 연출
      const FX = window.BattleFX;
      if (FX) {
        if (wasInfiltration) {
          FX.burstAt(input, "ko");
          FX.shockwave(input, "rgba(245,207,107,.9)");
          FX.flash("rgba(245,207,107,.14)", 220);
          FX.banner("🕵️ 적진 침투 성공!", "warn");
          FX.haptic("attack");
        } else {
          FX.burstAt(input, side === "pro" ? "pro" : "con");
          FX.shockwave(input, side === "pro" ? "rgba(77,163,255,.85)" : "rgba(255,92,92,.85)");
          FX.flash(side === "pro" ? "rgba(77,163,255,.12)" : "rgba(255,92,92,.12)");
          FX.banner(`${fLabel(side)} 진영 참전!`, "info");
          FX.haptic("tap");
        }
      }
      if (wasInfiltration) consumeInfiltration();

      input.value = "";
      finishComposing(input);

      // 부분 삽입 — 전체 리로드 없이 내가 쓴 존 맨 위에 바로 표시 (스크롤·상태 유지)
      authorVoteMap[ME.userId] = ME.faction; // 침투 노출 판정에 내 실제 진영 반영
      allRows.unshift(newRow);
      state[side]?.data.unshift(newRow);
      const list = document.getElementById(side + "-list");
      if (list) {
        list.querySelector(".empty-zone")?.remove();
        list.insertAdjacentHTML("afterbegin", makeComment(newRow));
        applySideColoring();
        const el = list.firstElementChild;
        if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
      renderWarDashboard();
      renderMorale();
    });
}

/* ======================
   인라인 전투 컴포저 — 공격/방어를 '그 자리에서' 쓰고 결과도 그 자리에 남긴다
====================== */
function ensureInlineComposer() {
  let box = document.getElementById("inline-composer");
  if (box) return box;
  box = document.createElement("div");
  box.id = "inline-composer";
  box.className = "inline-composer";
  box.innerHTML = `
    <div class="ic-head">
      <span class="ic-title" id="ic-title"></span>
      <button type="button" class="ic-close" aria-label="닫기">✕</button>
    </div>
    <div class="ic-row">
      <input id="ic-input" maxlength="500" autocomplete="off">
      <button type="button" id="ic-send" class="ic-send"></button>
    </div>`;
  box.querySelector(".ic-close").addEventListener("click", closeInlineComposer);
  box.querySelector("#ic-send").addEventListener("click", submitInline);
  box.querySelector("#ic-input").addEventListener("keydown", e => {
    if (e.key === "Enter") submitInline();
    if (e.key === "Escape") closeInlineComposer();
  });
  return box;
}

function openInlineComposer(type, targetId, targetUser, unit) {
  const box = ensureInlineComposer();
  BATTLE_MODE = { type, targetId, targetUser };

  // 일반 대상 = 공격/방어(심플), 침투자 대상 = 격퇴 (게임 서사)
  const isInfil = unit.classList.contains("infil-unit");
  const atkVerb = isInfil ? "격퇴" : "공격";

  box.classList.remove("atk", "def");
  box.classList.add(type === "attack" ? "atk" : "def");
  box.querySelector("#ic-title").innerHTML = type === "attack"
    ? `💥 <b>${escT(targetUser)}</b> ${atkVerb} — 이유를 남겨야 데미지가 들어갑니다`
    : `🛡 <b>${escT(targetUser)}</b> 방어 — 지원 근거가 방어막이 됩니다`;
  const input = box.querySelector("#ic-input");
  input.placeholder = type === "attack" ? "반박 근거를 입력…" : "지지 근거를 입력…";
  box.querySelector("#ic-send").textContent = type === "attack" ? `💥 −12` : `🛡 +8`;

  // 대상 유닛 바로 아래에 부착 (최상위 댓글이면 스레드 끝, 답글이면 그 답글 뒤)
  if (unit.classList.contains("reply")) {
    unit.insertAdjacentElement("afterend", box);
  } else {
    const replies = unit.querySelector(":scope > .replies") || unit;
    replies.insertAdjacentElement("afterend", box);
  }
  input.value = "";
  input.focus();
  window.BattleFX?.haptic("tap");
}

function closeInlineComposer() {
  document.getElementById("inline-composer")?.remove();
  BATTLE_MODE = null;
  document.body.classList.remove("kb-open");
}

async function submitInline() {
  if (!BATTLE_MODE) return;
  const input = document.getElementById("ic-input");
  const text = (input?.value || "").trim();
  if (!text) { alert("의견을 입력하세요."); return; }
  const { type, targetId, targetUser } = BATTLE_MODE;
  await submitBattleReply(type, targetId, targetUser, text);
}

/* 전투 답글 제출 — insert + battle_action RPC + 부분 삽입(리로드 없음) */
async function submitBattleReply(type, targetId, targetUser, text) {
  const supabase = window.supabaseClient;

  // 대댓글 하루 한도 검사 (소진 시 연장권 제안)
  if (!(await ensureReplyQuota())) return;

  // 답글의 답글도 최상위 스레드에 붙인다(1depth) — 대상은 @멘션으로 보존
  const rootId = rootIdOf(targetId);
  const content = rootId !== targetId ? `@${targetUser} ${text}` : text;

  const { data: newRow, error: insertErr } = await supabase.from("comments").insert({
    issue_id: window.CURRENT_ISSUE_ID,
    user_id: ME.userId,
    parent_id: rootId,
    faction: ME.faction,
    content,
    battle_action: type
  }).select("id,user_id,content,created_at,faction,hp,attack_count,defense_count,support_count,parent_id,is_anonymous,battle_action").single();
  if (insertErr) {
    if (String(insertErr.message || "").includes("reply_limit")) {
      REPLY_LEFT = 0;
      alert("오늘의 대댓글 횟수를 모두 썼어요. 🗯️ 대댓글 연장권으로 이어갈 수 있어요. (설정 › GP 상점)");
      return;
    }
    console.error("[battle reply] insert failed", insertErr);
    alert("답글 등록에 실패했습니다.");
    return;
  }
  if (REPLY_LEFT !== null) REPLY_LEFT = Math.max(0, REPLY_LEFT - 1);

  // 전투 액션 기록 + 대상 HP 갱신 (이미 했으면 답글만 등록)
  const { data: bd } = await supabase.rpc("battle_action", {
    p_comment_id: targetId, p_action: type,
    p_use_reset: RESET_ARMED.has(`${targetId}:${type}`)
  });
  RESET_ARMED.delete(`${targetId}:${type}`);

  closeInlineComposer();

  // 로컬 상태 + DOM 부분 삽입 — 방금 단 답글이 그 자리에 바로 보인다
  authorVoteMap[ME.userId] = ME.faction;
  allRows.unshift(newRow);
  (replyMap[rootId] ||= []).push(newRow);

  const rootUnit = document.querySelector(`.comment[data-id="${rootId}"]`);
  const repliesBox = rootUnit?.querySelector(":scope > .replies");
  if (repliesBox) {
    repliesBox.insertAdjacentHTML("beforeend", makeReply(newRow));
    applySideColoring();
    updateReplyMeta(rootUnit, rootId);
  }

  // FX + 대상 HP 반영
  const targetUnit = document.querySelector(`.comment[data-id="${targetId}"], .reply[data-id="${targetId}"]`);
  if (bd?.ok && targetUnit) {
    // 쿨다운 로컬 시작 (서버 comment_actions와 동기)
    markAction(targetId, type);
    document.querySelectorAll(`.action-${type}[data-id="${targetId}"]`).forEach(el => {
      el.classList.add("cooldown");
      el.dataset.cd = type;
      el.dataset.until = String(Date.now() + BATTLE_COOLDOWN_MS);
    });

    applyHpToUnit(targetUnit, bd.hp);
    const FX = window.BattleFX;
    if (type === "attack") {
      hitFx(targetUnit, "hit");
      const crit = bd.hp <= 0;
      spawnCombatText(targetUnit, crit ? "-12 격파!" : "-12", crit ? "crit" : "dmg");
      if (FX) {
        FX.shockwave(targetUnit, "rgba(255,80,50,.9)");
        FX.burstAt(targetUnit, crit ? "ko" : "attack");
        FX.haptic(crit ? "ko" : "attack");
        if (crit) FX.flash("rgba(255,40,40,.18)", 240);
      }
      if (crit) showKoBanner(targetId);
    } else {
      hitFx(targetUnit, "heal");
      spawnCombatText(targetUnit, "+8 방어", "heal");
      if (FX) {
        FX.burstAt(targetUnit, "defend");
        FX.shockwave(targetUnit, "rgba(120,190,255,.9)");
        FX.banner("🛡 방어 성공!", "cheer");
        FX.confetti(46);
        FX.haptic("cheer");
      }
    }
    bumpCombo();
    renderMorale();
    renderWarDashboard();
    renderHonors();
  } else if (bd && !bd.ok && bd.reason !== "already") {
    const m = battleReasonMsg(bd.reason, bd);
    if (m) alert(m);
  }
}

/* 루트 댓글의 답글/교전 카운터 표시 갱신 */
function updateReplyMeta(rootUnit, rootId) {
  const meta = rootUnit.querySelector(":scope > .reply-meta");
  const row = allRows.find(r => r.id === rootId);
  if (!meta || !row) return;
  const n = (replyMap[rootId] || []).length;
  meta.textContent = `💬 ${n} · 💥 ${row.attack_count || 0} · 🛡 ${row.defense_count || 0} · 💣 ${row.support_count || 0}`;
}

/* 전송 완료 후 컴포저 정리 — 모바일 키보드 모드(kb-open)를 확실히 해제.
   전송 버튼 탭 시 input이 blur되지 않아 focusout이 안 나면
   kb-open이 남아 하단 네비가 사라진 채 화면이 먹통처럼 고정된다. */
function finishComposing(input) {
  try { input?.blur(); } catch (_) {}
  document.body.classList.remove("kb-open");
}

/* 중립 플랫폼: 내 진영 기준(아군/적군)이 아니라 진영 자체로 색을 칠한다.
   찬성(pro) = 파랑 👍 / 반대(con) = 빨강 👎 */
function applySideColoring() {
  document.querySelectorAll(".comment, .reply").forEach(unit => {
    let side =
      unit.dataset.side ||
      unit.querySelector(".reply-actions")?.dataset.side;

    if (!side) return;

    // 🕵️ 침투자는 실제 진영으로 색을 칠한다(위장 없음, 모두에게 노출).
    // 반대 진영 영역에 실제 진영 색으로 껴 있어 '적진 침투'가 한눈에 드러난다.
    const row = allRows.find(r => r.id === Number(unit.dataset.id));
    if (row) side = shownFaction(row);

    const user = unit.querySelector(".user");
    const name = unit.querySelector(".user-name") || user;
    const level = unit.querySelector(".level-badge");
    const icon = unit.querySelector(".side-icon");

    if (!user) return;

    let realIcon = icon;
    if (!realIcon) {
      realIcon = document.createElement("span");
      realIcon.className = "side-icon";
      user.prepend(realIcon);
    }

    name.classList.remove("ally-user", "enemy-user");
    level?.classList.remove("ally-level", "enemy-level");
    realIcon.classList.remove("ally-icon", "enemy-icon");

    if (side === "pro") {
      name.classList.add("ally-user");     // 파랑 = 찬성
      level?.classList.add("ally-level");
      realIcon.classList.add("ally-icon");
      realIcon.textContent = "👍";
    } else {
      name.classList.add("enemy-user");    // 빨강 = 반대
      level?.classList.add("enemy-level");
      realIcon.classList.add("enemy-icon");
      realIcon.textContent = "👎";
    }
  });
}

/* =========================================================
   모바일 키보드 대응
   - 입력창 포커스 시: 하단 네비를 숨기고 컴포저를 bottom:0으로 내림
   - iOS/안드로이드가 fixed 요소를 키보드 위로 배치하므로,
     bottom:0 하나만 남기면 키보드 바로 위에 깔끔히 붙는다.
     (gap 수동 계산은 iOS 자동추적과 겹쳐 이중으로 밀리므로 사용하지 않음)
========================================================= */
(function () {
  const isInput = (el) => el && (el.id === "battle-comment-input" || el.id === "ic-input");
  const open = () => document.body.classList.add("kb-open");
  const close = () => document.body.classList.remove("kb-open");

  document.addEventListener("focusin", (e) => { if (isInput(e.target)) open(); });
  document.addEventListener("focusout", (e) => { if (isInput(e.target)) setTimeout(close, 100); });
})();
