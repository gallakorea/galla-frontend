/* =========================================================
   GALLA — Issue Comment Battle System
   UI + Logic FULL VERSION
========================================================= */

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
    <div class="body">└ ${text}</div>
    <div class="reply-actions" data-side="${side}">
      ❤4 👎1 ⚔공격 🛡방어 <span class="action-support">💣지원</span> 🔗
    </div>
  </div>`;
}

function makeComment(c) {
  const r1 = Math.floor(Math.random() * 40) + 50;
  const r2 = Math.floor(Math.random() * 40) + 50;

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

    <div class="body">${c.text}</div>

    <div class="actions" data-side="${c.side}">
      ❤12 👎3 ⚔공격 🛡방어 <span class="action-support">💣지원</span> 🔗
    </div>

    <div class="reply-meta">💬 ${c.replies} · ⚔ ${c.atk} · 🛡 ${c.def} · 💣 ${c.sup}</div>

    <div class="replies">
      ${makeReply(r1, "상대 진영 반박: 전혀 동의할 수 없습니다.", c.side)}
      ${makeReply(r2, "같은 진영 지원: 좋은 의견입니다.", c.side)}
      ${c.replies > 2 ? `<div class="more">+ ${c.replies - 2}개 더보기</div>` : ""}
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

  bb.innerHTML = s.data.slice((s.bb - 1) * PAGE_SIZE_BB, s.bb * PAGE_SIZE_BB).map(makeComment).join("");
  th.innerHTML = s.data.slice(5 + (s.th - 1) * PAGE_SIZE_TH, 5 + s.th * PAGE_SIZE_TH).map(makeComment).join("");

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

/* ======================
   Interaction
====================== */

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

/* ======================
   Init
====================== */

function init(side) {
  state[side].data = Array.from({ length: 30 }, () => createComment(side));
  renderSide(side);
}

init("pro");
init("con");