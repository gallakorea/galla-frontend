import { getComments, setComments } from "./issue.comments.state.js";
import { renderCommentsUI, renderBattleDashboard } from "./issue.comments.ui.js";
import { calculateBattleStats, applyCombatLogic } from "./issue.comments.engine.js";
import { loadCommentsAPI } from "./issue.comments.api.js";

export async function startCommentSystem(issueId) {
  console.log("🚀 startCommentSystem:", issueId);

  const raw = await loadCommentsAPI(issueId);
  console.log("📦 RAW:", raw);

  // 🛑 최초 로딩에서는 전투 로직 적용 금지
  const initialized = raw.map(c => ({
    ...c,
    hp: c.hp ?? 100,
    attack_count: c.attack_count ?? 0,
    defense_count: c.defense_count ?? 0,
    support_count: c.support_count ?? 0
  }));

  setComments(initialized);
  renderCommentsUI(initialized);

  const stats = calculateBattleStats(initialized);
  renderBattleDashboard(stats);
}