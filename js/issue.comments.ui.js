// js/issue.comments.ui.js

import {
  computeInitialHP,
  applySupport,
  applyAttack,
  applyDefense
} from "./issue.comments.engine.js";

import { getComments, setComments, getBattleStats } from "./issue.comments.state.js";
import { calculateBattleStats } from "./issue.comments.engine.js";

export function renderBattleDashboard(stats) {
  if (!stats) return;

  const proBox = document.getElementById("battle-pro");
  const conBox = document.getElementById("battle-con");

  if (!proBox || !conBox) return;

  proBox.innerHTML = `
    <strong>찬성 진영</strong><br>
    병력: ${stats.pro.same}<br>
    적군: ${stats.pro.enemy}
  `;

  conBox.innerHTML = `
    <strong>반대 진영</strong><br>
    병력: ${stats.con.same}<br>
    적군: ${stats.con.enemy}
  `;
}

const PAGE_SIZE_BB = 5, PAGE_SIZE_TH = 4;

const state = {
  pro: { bb: 1, th: 1, data: [] },
  con: { bb: 1, th: 1, data: [] }
};

/* ======================
   렌더링
====================== */

function make(c) {
  const baseHP = computeInitialHP(c);

  return `
<div class="comment"
     data-id="${c.id}"
     data-faction="${c.faction}"
     data-base-hp="${baseHP}"
     data-hp="${baseHP}">

  <div class="head">
    <div class="user">
      ${c.user?.username ?? "익명"} Lv.${c.user_level ?? 1}
      ${c.is_anonymous ? `<span class="anon">익명 · HP -20%</span>` : ``}
    </div>

    <div class="hp-wrap">
      <div class="hp-bar">
        <div class="hp-fill" style="width:${baseHP}%"></div>
      </div>
      <span class="hp-text">HP ${baseHP}</span>
    </div>
  </div>

  <div class="body">${c.content}</div>

  <div class="actions">
    <span class="action-attack">⚔ 공격</span>
    <span class="action-defense">🛡 방어</span>
    <span class="action-support">💣 지원</span>
  </div>
</div>`;
}

function render(side) {
  const wrap = document.getElementById(side + "-bb");
  wrap.innerHTML = state[side].data.map(make).join("");
}

export function renderCommentsUI(comments) {
  state.pro.data = comments.filter(c => c.faction === "pro");
  state.con.data = comments.filter(c => c.faction === "con");

  render("pro");
  render("con");
}

/* ======================
   HP UI 반영
====================== */

function updateHP(unit, hp) {
  const fill = unit.querySelector(".hp-fill");
  const text = unit.querySelector(".hp-text");

  fill.style.width = hp + "%";
  text.textContent = "HP " + hp;

  if (hp <= 0) {
    unit.classList.add("dead");
  }
}

/* ======================
   전투 시스템
====================== */

function getRandomEnemy(side) {
  const enemies = document.querySelectorAll(`.comment[data-faction]:not([data-faction="${side}"])`);
  if (!enemies.length) return null;
  return enemies[Math.floor(Math.random() * enemies.length)];
}

document.addEventListener("click", async e => {
  const unitEl = e.target.closest(".comment");
  if (!unitEl) return;

  const id = Number(unitEl.dataset.id);
  let data = getComments();
  let updated;

  // ⚔️ ATTACK
  if (e.target.classList.contains("action-attack")) {
    const enemies = data.filter(c => c.faction !== unitEl.dataset.faction && c.hp > 0);
    if (!enemies.length) return;

    const target = enemies[Math.floor(Math.random() * enemies.length)];
    updated = await applyAttack({}, target);

    // 💥 공격 이펙트
    const targetEl = document.querySelector(`.comment[data-id="${updated.id}"]`);
    targetEl?.classList.add("hit");
    setTimeout(() => targetEl?.classList.remove("hit"), 250);

    data = data.map(c => c.id === updated.id ? updated : c);
  }

  // 🛡 DEFENSE
  if (e.target.classList.contains("action-defense")) {
    const self = data.find(c => c.id === id);
    updated = await applyDefense(self);

    const selfEl = document.querySelector(`.comment[data-id="${id}"]`);
    selfEl?.classList.add("defending");

    data = data.map(c => c.id === updated.id ? updated : c);
  }

  // 💣 SUPPORT
  if (e.target.classList.contains("action-support")) {
    const self = data.find(c => c.id === id);
    updated = await applySupport(self);

    data = data.map(c => c.id === updated.id ? updated : c);
  }

  setComments(data);
  renderCommentsUI(data);

  // ☠️ 사망 처리
  document.querySelectorAll(".comment").forEach(el => {
    const cid = Number(el.dataset.id);
    const c = data.find(v => v.id === cid);
    if (c && c.hp <= 0) el.classList.add("dead");
  });

  // 📊 전황 동기화
  const liveStats = getBattleStats();
  renderBattleDashboard(liveStats);
});