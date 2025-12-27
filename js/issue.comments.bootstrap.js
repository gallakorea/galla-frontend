import { getComments, setComments } from "./issue.comments.state.js";
import { renderCommentsUI, renderBattleDashboard } from "./issue.comments.ui.js";
import { calculateBattleStats, applyCombatLogic } from "./issue.comments.engine.js";
import { fetchComments } from "./issue.comments.api.js";

export async function startCommentSystem(issueId) {
  const raw = await fetchComments(issueId);

  const units = applyCombatLogic(raw);
  setComments(units);

  renderCommentsUI(units);

  const stats = calculateBattleStats(units);
  renderBattleDashboard(stats);
}