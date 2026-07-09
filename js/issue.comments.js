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
  likes: new Map(),   // comment_id -> 1 | -1
  actions: new Set()  // `${comment_id}:${action_type}`
};

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

  // 진영 기본값: 내가 투표한 진영
  if (window.MY_VOTE_TYPE === "pro" || window.MY_VOTE_TYPE === "con") {
    const sel = document.getElementById("battle-side-select");
    if (sel) sel.value = window.MY_VOTE_TYPE;
    document.querySelectorAll(".side-btn").forEach(b =>
      b.classList.toggle("active", b.dataset.side === window.MY_VOTE_TYPE));
  }

  await loadComments(issueId);
  renderSide("pro");
  renderSide("con");
  renderWarDashboard();
  bindEvents();
}

/* ======================
   Data Loading
====================== */

async function loadComments(issueId) {
  const supabase = window.supabaseClient;

  const { data: sess } = await supabase.auth.getSession();
  ME.userId = sess?.session?.user?.id || null;

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

  // 내가 이미 수행한 전투 액션 (중복 방지 표시)
  ME.actions = new Set();
  if (ME.userId && ids.length) {
    const { data: acts } = await supabase
      .from("comment_actions")
      .select("comment_id,action_type")
      .eq("user_id", ME.userId)
      .in("comment_id", ids);
    acts?.forEach(a => ME.actions.add(`${a.comment_id}:${a.action_type}`));
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

function makeReply(r) {
  const prefix = r.battle_action
    ? `<b>${r.battle_action === "attack" ? "⚔ 공격" : "🛡 방어"}</b> `
    : "";
  return `
  <div class="reply" data-hp="${r.hp}" data-id="${r.id}" data-side="${r.faction}">
    <div class="head">
      <div class="user">
        <span class="user-name">${displayName(r)}</span>
        <span class="level-badge">Lv.${displayLevel(r)}</span>
      </div>
      <div class="hp-wrap">
        <div class="hp-bar"><div class="hp-fill" style="width:${r.hp}%"></div></div>
        <span class="hp-text">HP ${r.hp}</span>
      </div>
    </div>
    <div class="body">└ ${prefix}${renderCommentText(r.content)}</div>
    <div class="reply-actions" data-side="${r.faction}">
      ${likeUI(r)}
      <span class="action-attack" data-id="${r.id}">⚔공격</span>
      <span class="action-defend" data-id="${r.id}">🛡방어</span>
      <span class="action-support ${ME.actions.has(r.id + ":support") ? "done" : ""}" data-id="${r.id}">💣지원</span>
    </div>
  </div>`;
}

function makeComment(c) {
  const replies = replyMap[c.id] || [];
  const selectedSide = document.getElementById("battle-side-select")?.value;
  const isMySide = c.faction === selectedSide;

  const battleButtons = isMySide
    ? `<span class="action-defend ${ME.actions.has(c.id + ":defend") ? "done" : ""}" data-id="${c.id}">🛡방어</span>`
    : `<span class="action-attack ${ME.actions.has(c.id + ":attack") ? "done" : ""}" data-id="${c.id}">⚔공격</span>`;

  return `
    <div class="comment" data-hp="${c.hp}" data-side="${c.faction}" data-id="${c.id}">
    <div class="head">
      <div class="user">
        <span class="side-icon"></span>
        <span class="user-name">${displayName(c)}</span>
        <span class="level-badge">Lv.${displayLevel(c)}</span>
        ${c.is_anonymous ? `<span class="anon">익명</span>` : ``}
      </div>
      <div class="hp-wrap">
        <div class="hp-bar"><div class="hp-fill" style="width:${c.hp}%"></div></div>
        <span class="hp-text">HP ${c.hp}</span>
      </div>
    </div>

    <div class="body">${renderCommentText(c.content)}</div>

    <div class="actions">
      ${likeUI(c)}
      ${battleButtons}
      <span class="action-support ${ME.actions.has(c.id + ":support") ? "done" : ""}" data-id="${c.id}">💣지원</span>
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
  renderSide("pro");
  renderSide("con");
  renderWarDashboard();
}

function requireLogin() {
  if (ME.userId) return true;
  alert("로그인이 필요합니다.");
  return false;
}

/* ======================
   Interaction
====================== */

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;

  document.addEventListener("click", async e => {

    // ⚔🛡 전투 버튼 클릭 → 하단 입력창으로 통일
    if (e.target.classList.contains("action-attack") || e.target.classList.contains("action-defend")) {
      if (!requireLogin()) return;
      const type = e.target.classList.contains("action-attack") ? "attack" : "defend";

      if (ME.actions.has(e.target.dataset.id + ":" + type)) {
        alert(type === "attack" ? "이미 공격한 댓글입니다." : "이미 방어한 댓글입니다.");
        return;
      }

      const targetEl = e.target.closest(".comment") || e.target.closest(".reply");
      if (!targetEl) return;

      const targetId = Number(e.target.dataset.id || targetEl.dataset.id);
      const nameEl = targetEl.querySelector(".head .user-name");
      const targetUser = nameEl ? nameEl.textContent.trim() : "익명";
      const targetSide = targetEl.dataset.side || "pro";

      BATTLE_MODE = { type, targetId, targetUser, targetSide };

      const input = document.getElementById("battle-comment-input");
      if (!input) return;

      input.value = `@${targetUser} ${type === "attack" ? "⚔ 공격" : "🛡 방어"} → `;
      input.focus();

      // 전투 중엔 진영 선택 비활성(숨김)
      document.querySelectorAll(".side-btn").forEach(b => (b.style.display = "none"));
      return;
    }

    // 💣 지원 → RPC로 HP/카운터 갱신
    if (e.target.classList.contains("action-support")) {
      if (!requireLogin()) return;
      const id = Number(e.target.dataset.id);
      if (!id) return;

      if (ME.actions.has(id + ":support")) {
        alert("이미 지원한 댓글입니다.");
        return;
      }

      const { data, error } = await window.supabaseClient.rpc("battle_action", {
        p_comment_id: id, p_action: "support"
      });
      if (error || !data?.ok) {
        if (data?.reason === "already") alert("이미 지원한 댓글입니다.");
        else console.error("[support] failed", error || data);
        return;
      }

      ME.actions.add(id + ":support");
      e.target.classList.add("done");

      // 해당 유닛 HP 즉시 반영 + 글로우
      const unit = e.target.closest(".reply") || e.target.closest(".comment");
      if (unit) {
        unit.dataset.hp = data.hp;
        const fill = unit.querySelector(".hp-fill");
        const text = unit.querySelector(".hp-text");
        if (fill) fill.style.width = data.hp + "%";
        if (text) text.textContent = "HP " + data.hp;

        const bar = unit.querySelector(".hp-bar");
        if (bar) {
          const glow = document.createElement("div");
          glow.className = "hp-support-glow";
          bar.appendChild(glow);
          setTimeout(() => glow.remove(), 900);
        }
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

  // 🔵🔴 진영 선택 버튼
  document.querySelectorAll(".side-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".side-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("battle-side-select").value = btn.dataset.side;
      // 진영이 바뀌면 공격/방어 버튼 구성이 달라지므로 다시 렌더
      renderSide("pro");
      renderSide("con");
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
          faction: side,
          content: text,
          battle_action: type
        });
        if (insertErr) {
          console.error("[battle reply] insert failed", insertErr);
          alert("답글 등록에 실패했습니다.");
          return;
        }

        // 전투 액션 기록 + 대상 HP 갱신 (이미 했으면 답글만 등록)
        await supabase.rpc("battle_action", { p_comment_id: targetId, p_action: type });

        BATTLE_MODE = null;
        input.value = "";
        document.querySelectorAll(".side-btn").forEach(b => (b.style.display = ""));

        await reloadAndRender();
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

      input.value = "";
      await reloadAndRender();
    });
}

function applySideColoring() {
  const mySide = document.getElementById("battle-side-select")?.value;
  if (!mySide) return;

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

    if (side === mySide) {
      name.classList.add("ally-user");
      level?.classList.add("ally-level");
      realIcon.classList.add("ally-icon");
      realIcon.textContent = "🛡";
    } else {
      name.classList.add("enemy-user");
      level?.classList.add("enemy-level");
      realIcon.classList.add("enemy-icon");
      realIcon.textContent = "⚔";
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
