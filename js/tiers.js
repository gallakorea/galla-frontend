/* =========================================================
   tiers.js — 갈라 예언가 등급 (포인트 기반)
   견습 예언가 → 점쟁이 → 예언가 → 현자 → 대예언가 → 신탁
========================================================= */
(function () {
  const TIERS = [
    { key: 'apprentice', name: '견습 예언가', icon: '🌱', min: 0,       color: '#8ba36b' },
    { key: 'fortune',    name: '점쟁이',      icon: '🔮', min: 20000,   color: '#6fa8d8' },
    { key: 'prophet',    name: '예언가',      icon: '📜', min: 50000,   color: '#4fc3f7' },
    { key: 'sage',       name: '현자',        icon: '🦉', min: 150000,  color: '#a78bfa' },
    { key: 'grand',      name: '대예언가',    icon: '⭐', min: 500000,  color: '#ffd54a' },
    { key: 'oracle',     name: '신탁',        icon: '🌌', min: 2000000, color: '#ff8a3d' },
  ];

  function tierOf(points) {
    points = Number(points) || 0;
    let t = TIERS[0], idx = 0;
    for (let i = 0; i < TIERS.length; i++) {
      if (points >= TIERS[i].min) { t = TIERS[i]; idx = i; }
    }
    const next = TIERS[idx + 1] || null;
    const progress = next ? Math.min(100, Math.round((points - t.min) / (next.min - t.min) * 100)) : 100;
    return { ...t, index: idx, next, progress, points };
  }

  function tierBadge(points) {
    const t = tierOf(points);
    return `<span class="tier-badge" style="color:${t.color};border-color:${t.color}">${t.icon} ${t.name}</span>`;
  }

  window.GALLA_TIERS = TIERS;
  window.GALLA_tierOf = tierOf;
  window.GALLA_tierBadge = tierBadge;
})();
