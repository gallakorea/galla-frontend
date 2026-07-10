/* =========================================================
   GALLA — Issue Comment Battle System (실데이터 버전)
   - comments / comment_likes / comment_actions 테이블 연동
   - HP·전투 카운터는 battle_action RPC가 서버에서 갱신
========================================================= */

window.CURRENT_ISSUE_ID = null;

let BATTLE_MODE = null;
// BATTLE_MODE = { type: "attack"|"defend", targetId, targetUser, targetSide }

const PAGE_SIZE_BB = 5, PAGE_SIZE_TH = 4;

const state = {
  pro: { bb: 1, th: 1, data: [] },
  con: { bb: 1, th: 1, data: [] }
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

let allRows = [];     // 이 이슈의 모든 댓글 행
let replyMap = {};    // parent_id -> [reply rows]
let likeAgg = {};     // comment_id -> { up, down }
let profileMap = {};  // user_id -> { nickname, level }

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

  await loadComments(issueId);

  // 글쓰기 진영 = 내 투표 진영으로 고정 (혼란 방지). 미투표면 자유 선택.
  if (ME.faction) {
    const sel = document.getElementById("battle-side-select");
    if (sel) sel.value = ME.faction;
    document.querySelectorAll(".side-btn").forEach(b => {
      const mine = b.dataset.side === ME.faction;
      b.classList.toggle("active", mine);
      b.classList.toggle("side-locked", !mine);
      if (mine) b.innerHTML = (ME.faction === "pro" ? "👍 선택" : "👎 선택") + ' <span class="side-mine">내 진영</span>';
    });
  }
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
      <span class="bm-side pro ${lead === "pro" ? "lead" : ""}">👍 찬성 전투력 ${Math.round(pro)}</span>
      <span class="bm-vs">VS</span>
      <span class="bm-side con ${lead === "con" ? "lead" : ""}">${Math.round(con)} 반대 전투력 👎</span>
    </div>
    <div class="bm-track">
      <div class="bm-pro" style="width:${proPct}%"></div>
      <div class="bm-con" style="width:${100 - proPct}%"></div>
      <div class="bm-needle" style="left:${proPct}%"></div>
    </div>
    <div class="bm-status">${lead === "even" ? "⚖️ 팽팽한 접전" : lead === "pro" ? "👍 찬성 진영 우세" : "👎 반대 진영 우세"} · ${proPct}%</div>
    ${ME.faction
      ? `<div class="bm-mine ${ME.faction}">🎖 내 진영: ${ME.faction === "pro" ? "👍 찬성" : "👎 반대"} — <b>적군</b>을 공격하고 <b>아군</b>을 지켜라!</div>`
      : `<div class="bm-mine none">🔒 위에서 투표하면 진영이 정해지고 참전할 수 있어요</div>`}`;
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
  attack:  { icon: "⚔", verb: "공격", delta: "-12", cls: "atk" },
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
  const dash = document.querySelector(".war-dashboard");
  if (!dash) return null;
  box = document.createElement("div");
  box.id = "battle-feed";
  box.className = "battle-feed";
  box.innerHTML = `<div class="bf-title">📡 전장 속보 <span class="bf-live">LIVE</span></div><div class="bf-list" id="bf-list"><div class="bf-empty">아직 교전 기록이 없습니다.</div></div>`;
  dash.after(box);
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
    { k: "attack", icon: "⚔", label: "최다 공격" },
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
    (document.getElementById("battle-feed") || document.querySelector(".war-dashboard"))?.after(box);
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

  // 댓글/대댓글 분류
  replyMap = {};
  const top = { pro: [], con: [] };
  allRows.forEach(r => {
    if (r.parent_id) {
      (replyMap[r.parent_id] ||= []).push(r);
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
   - 반대 진영 댓글 → ⚔공격만 (60초 쿨다운 후 재공격 가능)
   - 같은 진영 댓글  → 🛡방어 · 💣지원만 (동일 쿨다운) */
const ACTION_LABEL = { attack: "⚔공격", defend: "🛡방어", support: "💣지원" };

/* 내 기준 아군/적군 태그 (진영색과 별개로 '나와의 관계'를 명시) */
function relTag(faction) {
  if (!ME.faction) return "";
  return ME.faction === faction
    ? `<span class="rel-tag ally">아군</span>`
    : `<span class="rel-tag enemy">적군</span>`;
}
function battleBtn(c, action) {
  const left = cooldownLeft(c.id, action);
  const cd = left > 0 ? ` cooldown" data-cd="${action}" data-until="${ME.actions.get(c.id + ":" + action) + BATTLE_COOLDOWN_MS}` : "";
  const label = left > 0 ? `${ACTION_LABEL[action]} ${left}s` : ACTION_LABEL[action];
  return `<span class="action-${action}${cd}" data-id="${c.id}">${label}</span>`;
}
function battleButtonsFor(c) {
  const my = ME.faction;
  if (!my) {
    return `<span class="action-locked" data-id="${c.id}">🔒 진영 선택 후 참전</span>`;
  }
  if (my !== c.faction) {
    return battleBtn(c, "attack");
  }
  return battleBtn(c, "defend") + battleBtn(c, "support");
}

/* 쿨다운 카운트다운 티커 (1초마다 버튼 라벨 갱신, 끝나면 활성화) */
setInterval(() => {
  document.querySelectorAll("[data-cd]").forEach(el => {
    const until = Number(el.dataset.until);
    const left = Math.ceil((until - Date.now()) / 1000);
    const action = el.dataset.cd;
    if (left > 0) {
      el.textContent = `${ACTION_LABEL[action]} ${left}s`;
    } else {
      el.textContent = ACTION_LABEL[action];
      el.classList.remove("cooldown");
      delete el.dataset.cd;
      delete el.dataset.until;
    }
  });
}, 1000);

function makeReply(r) {
  const prefix = r.battle_action
    ? `<b>${r.battle_action === "attack" ? "⚔ 공격" : "🛡 방어"}</b> `
    : "";
  const ko = r.hp <= 0 ? " ko" : "";
  return `
  <div class="reply${ko}" data-hp="${r.hp}" data-id="${r.id}" data-side="${r.faction}">
    <div class="head">
      <div class="user">
        <span class="user-name">${displayName(r)}</span>
        <span class="level-badge">Lv.${displayLevel(r)}</span>
        ${relTag(r.faction)}
      </div>
      ${hpBarHTML(r)}
    </div>
    <div class="body">└ ${prefix}${renderCommentText(r.content)}</div>
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
  const power = combatPower(c);
  return `
    <div class="comment${ko}${isAce ? " ace" : ""}" data-hp="${c.hp}" data-side="${c.faction}" data-id="${c.id}">
    <div class="head">
      <div class="user">
        <span class="side-icon"></span>
        <span class="user-name">${displayName(c)}</span>
        <span class="level-badge">Lv.${displayLevel(c)}</span>
        ${relTag(c.faction)}
        ${isAce ? `<span class="ace-badge">👑 에이스</span>` : ``}
        ${c.is_anonymous ? `<span class="anon">익명</span>` : ``}
      </div>
      ${hpBarHTML(c)}
    </div>

    <div class="body">${renderCommentText(c.content)}</div>

    <div class="actions">
      ${likeUI(c)}
      ${battleButtons}
      <span class="cp-chip" title="전투력">⚡${power}</span>
      <span class="action-more">⋯</span>
    </div>

    <div class="reply-meta">💬 ${replies.length} · ⚔ ${c.attack_count || 0} · 🛡 ${c.defense_count || 0} · 💣 ${c.support_count || 0}</div>

    <button class="reply-toggle" ${replies.length === 0 ? "hidden" : ""}>답글 보기</button>

    <div class="replies" hidden>
      ${replies.map(makeReply).join("")}
    </div>
  </div>`;
}

/* ======================
   Engine
====================== */

function renderSide(side) {
  const s = state[side];
  const bb = document.getElementById(side + "-bb");
  const th = document.getElementById(side + "-thread");

  if (!bb || !th) {
    console.warn("renderSide target missing:", side);
    return;
  }

  if (s.data.length === 0) {
    bb.innerHTML = `<div class="empty-zone">아직 이 진영의 댓글이 없습니다. 첫 포문을 여세요!</div>`;
    th.innerHTML = "";
    buildPager(side, "bb", PAGE_SIZE_BB, 0);
    buildPager(side, "th", PAGE_SIZE_TH, 0);
    return;
  }

  bb.innerHTML = s.data
    .slice((s.bb - 1) * PAGE_SIZE_BB, s.bb * PAGE_SIZE_BB)
    .map(makeComment)
    .join("");

  th.innerHTML = s.data
    .slice(PAGE_SIZE_BB + (s.th - 1) * PAGE_SIZE_TH, PAGE_SIZE_BB + s.th * PAGE_SIZE_TH)
    .map(makeComment)
    .join("");

  buildPager(side, "bb", PAGE_SIZE_BB, Math.ceil(s.data.length / PAGE_SIZE_BB));
  buildPager(side, "th", PAGE_SIZE_TH, Math.ceil(Math.max(0, s.data.length - PAGE_SIZE_BB) / PAGE_SIZE_TH));

  applySideColoring();
}

function buildPager(side, type, size, total) {
  const pager = document.getElementById(`${side}-${type}-pager`);
  if (!pager) return;
  const s = state[side];
  pager.innerHTML = "";
  if (total <= 1) return;

  for (let i = 1; i <= total; i++) {
    const b = document.createElement("button");
    b.textContent = i;
    if (s[type] === i) b.classList.add("active");
    b.onclick = () => { s[type] = i; renderSide(side); };
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

async function reloadAndRender() {
  await loadComments(window.CURRENT_ISSUE_ID);
  computeAce();
  renderSide("pro");
  renderSide("con");
  renderWarDashboard();
  renderMorale();
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

    // 🔒 진영 미선택(미투표) → 참전 안내
    if (e.target.classList.contains("action-locked")) {
      alert("먼저 이 이슈에 투표해 진영을 정해야 참전할 수 있어요.");
      return;
    }

    // ⚔🛡 전투 버튼 클릭 → 하단 입력창으로 통일
    if (e.target.classList.contains("action-attack") || e.target.classList.contains("action-defend")) {
      if (!requireLogin()) return;
      const type = e.target.classList.contains("action-attack") ? "attack" : "defend";

      const targetEl = e.target.closest(".comment") || e.target.closest(".reply");
      if (!targetEl) return;
      const targetSide = targetEl.dataset.side || "pro";

      // 진영 규칙 프론트 사전 검사 (서버 RPC가 최종 강제)
      if (!ME.faction) { alert("먼저 이 이슈에 투표해 진영을 정해야 참전할 수 있어요."); return; }
      if (type === "attack" && ME.faction === targetSide) { alert("같은 진영은 공격할 수 없어요. 상대 진영을 공격하세요."); return; }
      if (type === "defend" && ME.faction !== targetSide) { alert("같은 진영 댓글만 방어할 수 있어요."); return; }

      const cdLeft = cooldownLeft(Number(e.target.dataset.id), type);
      if (cdLeft > 0) {
        alert((type === "attack" ? "재공격" : "재방어") + `까지 ${cdLeft}초 남았어요.`);
        return;
      }

      const targetId = Number(e.target.dataset.id || targetEl.dataset.id);
      const nameEl = targetEl.querySelector(".head .user-name");
      const targetUser = nameEl ? nameEl.textContent.trim() : "익명";

      BATTLE_MODE = { type, targetId, targetUser, targetSide };

      const input = document.getElementById("battle-comment-input");
      if (!input) return;

      input.value = `@${targetUser} ${type === "attack" ? "⚔ 공격" : "🛡 방어"} → `;
      input.focus();

      // 전투 중엔 진영 선택 비활성(숨김)
      document.querySelectorAll(".side-btn").forEach(b => (b.style.display = "none"));
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
        alert(`재지원까지 ${supLeft}초 남았어요.`);
        return;
      }

      const { data, error } = await window.supabaseClient.rpc("battle_action", {
        p_comment_id: id, p_action: "support"
      });
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

    // ⋯ 메뉴
    if (e.target.classList.contains("action-more")) {
      alert("신고 / 차단 기능은 다음 단계에서 연결됩니다.");
      return;
    }

    // 답글 보기 토글
    const btn = e.target.closest(".reply-toggle");
    if (!btn) return;

    const currentComment = btn.closest(".comment");
    const currentReplies = currentComment.querySelector(".replies");

    document.querySelectorAll(".comment .replies").forEach(r => {
      if (r !== currentReplies) {
        r.hidden = true;
        const b = r.closest(".comment").querySelector(".reply-toggle");
        if (b) b.innerText = "답글 보기";
      }
    });

    const isOpen = !currentReplies.hidden;
    currentReplies.hidden = isOpen;
    btn.innerText = isOpen ? "답글 보기" : "답글 숨기기";
  });

  // 🔵🔴 진영 선택 버튼 — 투표했다면 내 진영으로 잠금
  document.querySelectorAll(".side-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (ME.faction && btn.dataset.side !== ME.faction) {
        alert(`이 이슈에서 당신은 ${ME.faction === "pro" ? "👍 찬성" : "👎 반대"} 진영입니다. 진영은 투표로 정해져요.`);
        return;
      }
      document.querySelectorAll(".side-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("battle-side-select").value = btn.dataset.side;
    });
  });

  // 전송
  document.getElementById("battle-comment-submit")
    ?.addEventListener("click", async () => {
      if (!requireLogin()) return;

      const input = document.getElementById("battle-comment-input");
      if (!input) return;

      const supabase = window.supabaseClient;
      const side = document.getElementById("battle-side-select").value;

      // ✅ 전투 모드: 대상 댓글에 대한 답글 + 전투 액션
      if (BATTLE_MODE) {
        const { type, targetId } = BATTLE_MODE;

        const raw = input.value.trim();
        const text = raw.replace(/^@.*?→\s*/, "").trim();

        if (!text) {
          alert("의견을 입력하세요.");
          return;
        }

        const { error: insertErr } = await supabase.from("comments").insert({
          issue_id: window.CURRENT_ISSUE_ID,
          user_id: ME.userId,
          parent_id: targetId,
          faction: ME.faction || side,   // 답글은 항상 내 진영으로 기록
          content: text,
          battle_action: type
        });
        if (insertErr) {
          console.error("[battle reply] insert failed", insertErr);
          alert("답글 등록에 실패했습니다.");
          return;
        }

        // 전투 액션 기록 + 대상 HP 갱신 (이미 했으면 답글만 등록)
        const { data: bd } = await supabase.rpc("battle_action", { p_comment_id: targetId, p_action: type });

        BATTLE_MODE = null;
        input.value = "";
        document.querySelectorAll(".side-btn").forEach(b => (b.style.display = ""));

        // 게임 FX: 대상 유닛에 데미지/힐 연출 후 리로드
        const targetUnit = document.querySelector(`.comment[data-id="${targetId}"], .reply[data-id="${targetId}"]`);
        if (bd?.ok && targetUnit) {
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
          renderHonors();
          setTimeout(() => reloadAndRender(), 900);
        } else {
          if (bd && !bd.ok && bd.reason !== "already") {
            const m = battleReasonMsg(bd.reason, bd);
            if (m) alert(m);
          }
          await reloadAndRender();
        }
        return;
      }

      // ✅ 일반 댓글
      const text = input.value.trim();
      if (!text) {
        alert("의견을 입력하세요.");
        return;
      }

      const { error } = await supabase.from("comments").insert({
        issue_id: window.CURRENT_ISSUE_ID,
        user_id: ME.userId,
        faction: side,
        content: text
      });
      if (error) {
        console.error("[comment] insert failed", error);
        alert("댓글 등록에 실패했습니다.");
        return;
      }

      // ✨ 참전 연출: 입력창에서 진영색 빛 폭발
      const FX = window.BattleFX;
      if (FX) {
        FX.burstAt(input, side === "pro" ? "pro" : "con");
        FX.shockwave(input, side === "pro" ? "rgba(77,163,255,.85)" : "rgba(255,92,92,.85)");
        FX.flash(side === "pro" ? "rgba(77,163,255,.12)" : "rgba(255,92,92,.12)");
        FX.banner(side === "pro" ? "👍 찬성 진영 참전!" : "👎 반대 진영 참전!", "info");
        FX.haptic("tap");
      }

      input.value = "";
      await reloadAndRender();
    });
}

/* 중립 플랫폼: 내 진영 기준(아군/적군)이 아니라 진영 자체로 색을 칠한다.
   찬성(pro) = 파랑 👍 / 반대(con) = 빨강 👎 */
function applySideColoring() {
  document.querySelectorAll(".comment, .reply").forEach(unit => {
    const side =
      unit.dataset.side ||
      unit.querySelector(".reply-actions")?.dataset.side;

    if (!side) return;

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
  const isInput = (el) => el && el.id === "battle-comment-input";
  const open = () => document.body.classList.add("kb-open");
  const close = () => document.body.classList.remove("kb-open");

  document.addEventListener("focusin", (e) => { if (isInput(e.target)) open(); });
  document.addEventListener("focusout", (e) => { if (isInput(e.target)) setTimeout(close, 100); });
})();
