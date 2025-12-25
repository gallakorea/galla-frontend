// js/issue.comments.js
import { loadCommentsAPI } from "./issue.comments.api.js";
import { applyCombatLogic, calculateBattleStats } from "./issue.comments.engine.js";
import { renderCommentsUI, renderBattleDashboard } from "./issue.comments.ui.js";
import { setComments, setBattleStats } from "./issue.comments.state.js";

export async function initComments(issueId) {
  const raw = await loadCommentsAPI(issueId);
  const processed = applyCombatLogic(raw);

  setComments(processed);

  const battle = calculateBattleStats(processed);
  setBattleStats(battle);

  renderBattleDashboard(battle);
  renderCommentsUI(processed);
}