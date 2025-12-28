window.CURRENT_ISSUE_ID = null;

let BATTLE_MODE = null;
// BATTLE_MODE = { type: "attack"|"defend", targetEl: HTMLElement, targetUser: string, targetSide: "pro"|"con" }

// ============================
// 🧩 Comment Text Renderer
// ============================
function renderCommentText(text) {
  if (!text) return "";
  return text.replace(
    /\[gif:(.*?)\]/g,
    (_, url) => `<img src="${url}" class="comment-gif">`
  );
}

// ============================
// 🧭 Side / Relation Engine
// ============================

function getMySide() {
  return document.getElementById("battle-side-select")?.value || null;
}

function getUnitSide(el) {
  // 1️⃣ reply 자신의 진영을 최우선으로 판정
  const replyActions = el.closest(".reply")?.querySelector(".reply-actions");
  const replySide = replyActions?.dataset.side;
  if (replySide) return replySide;

  // 2️⃣ 그 다음 부모 comment 진영
  const commentEl = el.closest(".comment");
  const commentSide = commentEl?.dataset.side;
  if (commentSide) return commentSide;

  return null;
}

function getRelation(targetEl) {
  console.log("🧭 Relation Check", {
    mySide: getMySide(),
    targetSide: getUnitSide(targetEl),
    el: targetEl
  });

  const mySide = getMySide();
  const targetSide = getUnitSide(targetEl);

  if (!mySide || !targetSide) return "neutral";
  if (mySide === targetSide) return "ally";
  return "enemy";
}

export async function initCommentSystem(issueId) {
  window.CURRENT_ISSUE_ID = issueId;
  console.log("💬 initCommentSystem:", issueId);

  await new Promise(r => requestAnimationFrame(r));

  const zone = document.getElementById("battle-zone");
  if (!zone) {
    console.warn("❌ battle-zone not found");
    return;
  }

  await loadComments(window.CURRENT_ISSUE_ID);
  await loadWarStats();
  renderSide("pro");
  renderSide("con");
  renderWarDashboard();
  bindEvents();
}

/* =========================================================
   GALLA — Issue Comment Battle System
   UI + Logic FULL VERSION
========================================================= */
let warStats = {
  pro: { total: 0, own: 0, enemy: 0 },
  con: { total: 0, own: 0, enemy: 0 },
  global: { attack: 0, support: 0, defend: 0 }
};

const PAGE_SIZE_BB = 5, PAGE_SIZE_TH = 4;

const state = {
  pro: { bb: 1, th: 1, data: [] },
  con: { bb: 1, th: 1, data: [] }
};

/* ======================
   Mock Data Generator
====================== */

function createUser() {
  const anon = Math.random() > .6;
  const level = Math.floor(Math.random() * 30) + 1;
  return {
    name: anon ? "익명" : "User" + Math.floor(Math.random() * 1000),
    anon,
    level
  };
}

function createComment(side) {
  return {
    side,
    user: createUser(),
    hp: Math.floor(Math.random() * 40) + 50,
    text: "이 정책은 장기적으로 반드시 필요한 선택입니다.",
    replies: Math.floor(Math.random() * 8) + 1,
    atk: Math.floor(Math.random() * 5),
    sup: Math.floor(Math.random() * 5),
    def: Math.floor(Math.random() * 5)
  };
}

/* ======================
   Rendering
====================== */

function makeReply(hp, text, side) {
  const selectedSide = document.getElementById("battle-side-select")?.value;
  const isMySide = side === selectedSide;

  const battleButtons = isMySide
    ? `<span class="action-defend">🛡방어</span>`
    : `<span class="action-attack">⚔공격</span>`;

  return `
  <div class="reply" data-hp="${hp}">
    <div class="head">
      <div class="user">익명</div>
      <div class="hp-wrap">
        <div class="hp-bar"><div class="hp-fill" style="width:${hp}%"></div></div>
        <span class="hp-text">HP ${hp}</span>
      </div>
    </div>

    <div class="body">└ ${renderCommentText(text)}</div>

    <div class="reply-actions" data-side="${side}">
      <span class="like">👍4</span>
      <span class="dislike">👎1</span>
      ${battleButtons}
      <span class="action-support">💣지원</span>
    </div>
  </div>`;
}

function makeComment(c) {
  const r1 = Math.floor(Math.random() * 40) + 50;
  const r2 = Math.floor(Math.random() * 40) + 50;

  const myVote = window.MY_VOTE_TYPE;

  const selectedSide = document.getElementById("battle-side-select")?.value;
  const isMySide = c.side === selectedSide;

let battleButtons = isMySide
  ? `<span class="action-defend">🛡방어</span>`
  : `<span class="action-attack">⚔공격</span>`;

  const actionUI = `
    <div class="actions">
      <span class="like">👍12</span>
      <span class="dislike">👎3</span>
      ${battleButtons}
      <span class="action-support">💣지원</span>
      <span class="action-more">⋯</span>
    </div>
  `;

  return `
    <div class="comment" data-hp="${c.hp}" data-side="${c.side}">
    <div class="head">
      <div class="user">${c.user.name} <span class="level-badge">Lv.${c.user.level}</span>
        ${c.user.anon ? `<span class="anon">익명 · HP -20%</span>` : ``}
      </div>
      <div class="hp-wrap">
        <div class="hp-bar"><div class="hp-fill" style="width:${c.hp}%"></div></div>
        <span class="hp-text">HP ${c.hp}</span>
      </div>
    </div>

    <div class="body">${renderCommentText(c.text)}</div>

    ${actionUI}

    <div class="reply-meta">💬 ${c.replies} · ⚔ ${c.atk} · 🛡 ${c.def} · 💣 ${c.sup}</div>

    <button class="reply-toggle">답글 보기</button>

    <div class="replies" hidden>
      ${makeReply(r1, "상대 진영 반박: 전혀 동의할 수 없습니다.", c.side)}
      ${makeReply(r2, "같은 진영 지원: 좋은 의견입니다.", c.side)}
      ${c.replies > 2 ? `<div class="more">+ ${c.replies - 2}개 더보기</div>` : ""}
    </div>
  </div>`;
}

async function loadComments(issueId) {
  state.pro.data = Array.from({ length: 30 }, () => createComment("pro"));
  state.con.data = Array.from({ length: 30 }, () => createComment("con"));
}


async function loadWarStats(issueId) {
  const supabase = window.supabaseClient;

  const { data, error } = await supabase
    .from("comment_actions")
    .select("side, action_type");

  if (error) {
    console.error("war stats load failed", error);
    return;
  }

  warStats = {
    pro: { total: 0, own: 0, enemy: 0 },
    con: { total: 0, own: 0, enemy: 0 },
    global: { attack: 0, support: 0, defend: 0 }
  };

  data.forEach(row => {
    if (row.side === "pro") warStats.pro.total++;
    if (row.side === "con") warStats.con.total++;

    if (row.action_type === "attack") warStats.global.attack++;
    if (row.action_type === "support") warStats.global.support++;
    if (row.action_type === "defend") warStats.global.defend++;
  });
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

  bb.innerHTML = s.data
    .slice((s.bb - 1) * PAGE_SIZE_BB, s.bb * PAGE_SIZE_BB)
    .map(makeComment)
    .join("");

  th.innerHTML = s.data
    .slice(5 + (s.th - 1) * PAGE_SIZE_TH, 5 + s.th * PAGE_SIZE_TH)
    .map(makeComment)
    .join("");

  buildPager(side, "bb", PAGE_SIZE_BB);
  buildPager(side, "th", PAGE_SIZE_TH);
  enforceBattleButtons();
  setTimeout(enforceBattleButtons, 0);
}

function buildPager(side, type, size) {
  const pager = document.getElementById(`${side}-${type}-pager`);
  const s = state[side];
  const total = Math.ceil((s.data.length - 5) / size);
  pager.innerHTML = "";

  for (let i = 1; i <= total; i++) {
    const b = document.createElement("button");
    b.textContent = i;
    if (s[type] === i) b.classList.add("active");
    b.onclick = () => { s[type] = i; renderSide(side); };
    pager.appendChild(b);
  }
}


function renderWarDashboard() {
  const pro = document.querySelector(".war-box.pro .war-stat b");
  const con = document.querySelector(".war-box.con .war-stat b");
  const neutral = document.querySelector(".war-box.neutral .war-stat b");
  const sub = document.querySelector(".war-box.neutral .war-sub");

  if (!pro || !con || !neutral || !sub) {
    console.warn("⚠️ war dashboard UI not ready");
    return;
  }

  pro.innerText = warStats.pro.total;
  con.innerText = warStats.con.total;

  neutral.innerText =
    warStats.global.attack +
    warStats.global.support +
    warStats.global.defend;

  sub.innerText =
    `공격 ${warStats.global.attack} · 지원 ${warStats.global.support} · 방어 ${warStats.global.defend}`;
}

/* ======================
   Interaction
====================== */

function enforceBattleButtons() {
  document.querySelectorAll(".comment, .reply").forEach(unit => {
    const relation = getRelation(unit);

    const attack = unit.querySelector(".action-attack");
    const defend = unit.querySelector(".action-defend");

    if (relation === "ally") {
      attack?.remove();
    } 
    else if (relation === "enemy") {
      defend?.remove();
    }
  });
}


function bindEvents() {
  document.addEventListener("click", e => {

  // ⚔🛡 전투 버튼 클릭 → 하단 입력창으로 통일
  if (e.target.classList.contains("action-attack") || e.target.classList.contains("action-defend")) {
    const type = e.target.classList.contains("action-attack") ? "attack" : "defend";

    // comment 또는 reply 어디서 눌러도 잡히게
    const targetEl = e.target.closest(".comment") || e.target.closest(".reply");
    if (!targetEl) return;

    // 표시용 유저명 (comment면 .head .user / reply면 .head .user)
    const userEl = targetEl.querySelector(".head .user");
    const targetUser = userEl ? userEl.textContent.trim() : "익명";

    // comment의 side는 c.side로 이미 내려오고(렌더링 데이터), DOM엔 없으니 reply-actions의 data-side 우선 사용
    const sideFromAttr =
      targetEl.getAttribute("data-side") ||
      targetEl.querySelector("[data-side]")?.getAttribute("data-side") ||
      targetEl.closest(".comment")?.querySelector(".reply-actions")?.getAttribute("data-side");

    // comment쪽은 makeComment에서 data-side를 심어주는게 가장 안정적이지만, 지금은 최소 동작만
    const targetSide = sideFromAttr || document.getElementById("battle-side-select")?.value || "pro";

    BATTLE_MODE = { type, targetEl, targetUser, targetSide };

    // 하단 입력창 세팅
    const input = document.getElementById("battle-comment-input");
    if (!input) return;

    input.value = `@${targetUser} ${type === "attack" ? "⚔ 공격" : "🛡 방어"} → `;
    input.focus();

    // 전투 중엔 진영 선택 비활성(숨김)
    document.querySelectorAll(".side-btn").forEach(b => (b.style.display = "none"));

    // hidden select도 변경 금지(댓글/대댓글은 진영 따라가야 함)
    // document.getElementById("battle-side-select").value = targetSide;  // 필요 시 사용
    return;
  }

    // 💣 지원
    if (e.target.classList.contains("action-support")) {
      const unit = e.target.closest(".reply") || e.target.closest(".comment");
      let hp = Number(unit.dataset.hp);
      hp = Math.min(hp + 12, 100);
      unit.dataset.hp = hp;

      const fill = unit.querySelector(".hp-fill");
      const text = unit.querySelector(".hp-text");

      fill.style.width = hp + "%";
      text.textContent = "HP " + hp;

      const bar = unit.querySelector(".hp-bar");
      const glow = document.createElement("div");
      glow.className = "hp-support-glow";
      bar.appendChild(glow);
      setTimeout(() => glow.remove(), 900);
      return;
    }

    // 👍 좋아요
    if (e.target.classList.contains("like")) {
      const el = e.target;
      const isActive = el.classList.toggle("active-like");

      const other = el.parentElement.querySelector(".dislike");
      other.classList.remove("active-dislike");

      let n = Number(el.textContent.replace("👍", ""));
      el.textContent = "👍" + (isActive ? n + 1 : n - 1);
      return;
    }

    // 👎 싫어요
    if (e.target.classList.contains("dislike")) {
      const el = e.target;
      const isActive = el.classList.toggle("active-dislike");

      const other = el.parentElement.querySelector(".like");
      other.classList.remove("active-like");

      let n = Number(el.textContent.replace("👎", ""));
      el.textContent = "👎" + (isActive ? n + 1 : n - 1);
      return;
    }

    // ⋯ 메뉴
    if (e.target.classList.contains("action-more")) {
      alert("신고 / 차단 기능은 다음 단계에서 연결됩니다.");
      return;
    }

    const btn = e.target.closest(".reply-toggle");
    if (!btn) return;

    const currentComment = btn.closest(".comment");
    const currentReplies = currentComment.querySelector(".replies");

    // 🔒 이미 열려있는 다른 대댓글 전부 닫기
    document.querySelectorAll(".comment .replies").forEach(r => {
      if (r !== currentReplies) {
        r.hidden = true;
        const b = r.closest(".comment").querySelector(".reply-toggle");
        if (b) b.innerText = "답글 보기";
      }
    });

    // 🔁 현재 것 토글
    const isOpen = !currentReplies.hidden;
    currentReplies.hidden = isOpen;
    btn.innerText = isOpen ? "답글 보기" : "답글 숨기기";
  });


    // 🔵🔴 진영 선택 버튼 동작
  document.querySelectorAll(".side-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".side-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      const side = btn.dataset.side;
      document.getElementById("battle-side-select").value = side;

      // 🔥 핵심: 진영 선택 후 전체 재렌더
      renderSide("pro");
      renderSide("con");
    });
  });

    document.getElementById("battle-comment-submit")
    ?.addEventListener("click", async () => {

  const input = document.getElementById("battle-comment-input");
  if (!input) return;

  // ✅ 전투 모드면: 댓글/대댓글 내부로 reply HTML 삽입하고 종료
  if (BATTLE_MODE) {
    const { type, targetEl, targetUser, targetSide } = BATTLE_MODE;

    // "@유저 ⚔ 공격 → " 프리픽스 제거
    const raw = input.value.trim();
    const text = raw.replace(/^@.*?→\s*/, "").trim();

    if (!text) {
      alert("의견을 입력하세요.");
      return;
    }

    // targetEl이 reply면, 해당 reply가 들어있는 comment의 replies에 삽입해야 UX가 맞음
    const parentComment = targetEl.classList.contains("comment") ? targetEl : targetEl.closest(".comment");
    const repliesBox = parentComment?.querySelector(".replies");
    if (!repliesBox) return;

    // replies 펼치기
    repliesBox.hidden = false;
    const toggleBtn = parentComment.querySelector(".reply-toggle");
    if (toggleBtn) toggleBtn.innerText = "답글 숨기기";

    // ✅ reply 추가 (makeReply 스타일과 맞춰 최소 구조)
    const hp = Math.floor(Math.random() * 40) + 50;


    const selectedSide = document.getElementById("battle-side-select")?.value;
    const isMySide = targetSide === selectedSide;

    const battleButtons = isMySide
      ? `<span class="action-defend">🛡방어</span>`
      : `<span class="action-attack">⚔공격</span>`;

    const replyHtml = `
      <div class="reply" data-hp="${hp}">
        <div class="head">
          <div class="user">익명</div>
          <div class="hp-wrap">
            <div class="hp-bar"><div class="hp-fill" style="width:${hp}%"></div></div>
            <span class="hp-text">HP ${hp}</span>
          </div>
        </div>

        <div class="body">
          └ <b>${type === "attack" ? "⚔ 공격" : "🛡 방어"}</b>
          @${targetUser}: ${renderCommentText(text)}
        </div>

        <div class="reply-actions" data-side="${targetSide}">
          <span class="like">👍0</span>
          <span class="dislike">👎0</span>
          ${battleButtons}
          <span class="action-support">💣지원</span>
        </div>
      </div>
    `;

  repliesBox.insertAdjacentHTML("afterbegin", replyHtml);

  // 상태 초기화 + UI 복귀
  BATTLE_MODE = null;
  input.value = "";
  document.querySelectorAll(".side-btn").forEach(b => (b.style.display = ""));
  return; // ✅ 여기서 종료 (DB insert 안 함)
}
    

    const text = document.getElementById("battle-comment-input").value.trim();
    const side = document.getElementById("battle-side-select").value;

    if (!text) {
      alert("의견을 입력하세요.");
      return;
    }

    const supabase = window.supabaseClient;
    const { data: session } = await supabase.auth.getSession();

    if (!session.session) {
      alert("로그인이 필요합니다.");
      return;
    }

    // 🔍 여기만 남기고
    console.log({
      issue_id: window.CURRENT_ISSUE_ID,
      user_id: session.session.user.id,
      side,
      text,
      hp: 80
    });

    document.getElementById("battle-comment-input").value = "";

    await loadComments(window.CURRENT_ISSUE_ID);
    renderSide("pro");
    renderSide("con");

    await loadWarStats();
    renderWarDashboard();
  });

}
