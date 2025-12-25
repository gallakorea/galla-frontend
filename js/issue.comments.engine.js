// js/issue.comments.engine.js

export function computeInitialHP(comment) {
  const maxHP = comment.is_anonymous ? 80 : 100;
  return Math.min(comment.hp ?? maxHP, maxHP);
}

import { updateCommentBattle } from "./issue.comments.api.js";

export function normalizeHP(unit) {
  const maxHP = unit.is_anonymous ? 80 : 100;
  return Math.max(0, Math.min(maxHP, unit.hp));
}

export async function applySupport(unit) {
  let heal = 12;
  if (unit.is_anonymous) heal = 8;
  if (unit.hp >= 70) heal = 6;

  unit.hp = normalizeHP({ ...unit, hp: unit.hp + heal });
  unit.support_count++;

  await updateCommentBattle(unit.id, {
    hp: unit.hp,
    support_count: unit.support_count
  });

  return unit;
}

export async function applyAttack(attacker, target) {
  let damage = 12;
  if (target.hp <= 20) damage = 18;
  if (target.defending) damage *= 0.5;

  target.hp = normalizeHP({ ...target, hp: target.hp - damage });
  target.attack_count++;

  await updateCommentBattle(target.id, {
    hp: target.hp,
    attack_count: target.attack_count
  });

  return target;
}

export async function applyDefense(unit) {
  unit.defending = true;
  unit.defense_count++;

  await updateCommentBattle(unit.id, {
    defense_count: unit.defense_count
  });

  return unit;
}

export function applyCombatLogic(comments) {
  return comments.map(c => {
    const maxHP = c.is_anonymous ? 80 : 100;
    return {
      ...c,
      maxHP,
      hp: Math.min(c.hp ?? maxHP, maxHP),
      dead: (c.hp ?? maxHP) <= 0,
      defending: false
    };
  });
}

export function calculateBattleStats(comments) {
  const stats = {
    total: comments.length,
    pro: { total: 0, same: 0, enemy: 0 },
    con: { total: 0, same: 0, enemy: 0 }
  };

  comments.forEach(c => stats[c.faction].total++);

  stats.pro.same = stats.pro.total;
  stats.con.same = stats.con.total;
  stats.pro.enemy = stats.con.same;
  stats.con.enemy = stats.pro.same;

  return stats;
}