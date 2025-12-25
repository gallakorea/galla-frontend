// js/issue.comments.state.js

let comments = [];
let battleStats = {
  pro: { same: 0, enemy: 0 },
  con: { same: 0, enemy: 0 }
};

export function setComments(data) {
  comments = data;
  recalcBattleStats(); // ← 🔥 이 줄만 추가
}

export function getComments() {
  return comments;
}

export function setBattleStats(stats) {
  battleStats = stats;
}

export function getBattleStats() {
  return battleStats;
}

/* =========================
   내부 전황 재계산 로직
========================= */
function recalcBattleStats() {
  const stats = {
    pro: { same: 0, enemy: 0 },
    con: { same: 0, enemy: 0 }
  };

  comments.forEach(c => {
    if (c.hp <= 0) return;

    if (c.faction === "pro") {
      stats.pro.same++;
      stats.con.enemy++;
    }

    if (c.faction === "con") {
      stats.con.same++;
      stats.pro.enemy++;
    }
  });

  battleStats = stats;
}