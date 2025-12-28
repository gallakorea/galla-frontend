let CURRENT_ISSUE_ID = null;

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


export async function initCommentSystem(issueId) {
  CURRENT_ISSUE_ID = issueId;
  console.log("💬 initCommentSystem:", issueId);

  await new Promise(r => requestAnimationFrame(r));

  const zone = document.getElementById("battle-zone");
  if (!zone) {
    console.warn("❌ battle-zone not found");
    return;
  }

  await loadComments(CURRENT_ISSUE_ID);
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
      ❤4 👎1 ⚔공격 🛡방어 <span class="action-support">💣지원</span> 🔗
    </div>
  </div>`;
}

function makeComment(c) {
  const r1 = Math.floor(Math.random() * 40) + 50;
  const r2 = Math.floor(Math.random() * 40) + 50;

  const myVote = window.MY_VOTE_TYPE;

  let actionUI = "";
  if (myVote === "pro") actionUI = "🛡 방어";
  else if (myVote === "con") actionUI = "⚔ 공격";
  else actionUI = "💬 댓글";

  return `
  <div class="comment" data-hp="${c.hp}">
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

    <div class="actions">${actionUI}</div>

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

function bindEvents() {
  document.addEventListener("click", e => {
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
      document.getElementById("battle-side-select").value = btn.dataset.side;
    });
  });

  document.addEventListener("click", e => {
    if (!e.target.classList.contains("action-support")) return;

    const unit = e.target.closest(".comment, .reply");
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
  });

    document.getElementById("battle-comment-submit")
    ?.addEventListener("click", async () => {

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

    await supabase.from("comments").insert({
      issue_id: CURRENT_ISSUE_ID,
      user_id: session.session.user.id,
      side,
      text,
      hp: 80
    });

    document.getElementById("battle-comment-input").value = "";

    await loadComments(CURRENT_ISSUE_ID);
    renderSide("pro");
    renderSide("con");

    await loadWarStats();
    renderWarDashboard();
  });

}
