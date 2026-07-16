/* =========================================================
   갈라리안 등급 — 통합 마스터 등급 (갈라 지수 기반)
   갈라 지수(GI) = 활동지수 + 전투지수 + 예측지수
   - 활동: 발의×50 + 댓글×10 + 투표×2 + 광장글×15 + 광장댓글×5
   - 전투: 전투액션(공격·방어·지원)×8  ← 기존 전투력 병합
   - 예측: 거래×10 + 순이익 GP×0.05 (기본지급 10000 초과분만)
   저장하지 않고 매 조회 재계산 → 활동이 바뀌면 등급도 자동 변동
   window.GALLA_gallianOf(supabase, userId) → Promise<gallian>
   ========================================================= */
(function () {
  // 유머러스·한국적 서사 — 눈팅하던 뉴비가 전설의 갈라 대장군으로 진화
  // 임계값: 초반은 금방(온보딩 몰입), 상위로 갈수록 급격히 어려워짐(약 3배씩)
  const TIERS = [
    { key: "spark",     name: "🌱 눈팅 뉴비",   sub: "일단 스크롤만 내리는 관망러",       min: 0,     color: "#9aa0ad" },
    { key: "breaker",   name: "🔥 발끈러",       sub: "못 참고 첫 댓글을 단 각성러",        min: 150,   color: "#4fc3f7" },
    { key: "vanguard",  name: "⌨️ 키보드 전사",  sub: "손가락이 근질근질한 참전러",         min: 500,   color: "#3d6bff" },
    { key: "authority", name: "🎤 여론 논객",    sub: "판을 읽고 흔드는 입담꾼",            min: 1500,  color: "#c9d1e0" },
    { key: "dominion",  name: "🌪️ 갈라 선동가",  sub: "댓글창을 쥐락펴락하는 여론몰이",     min: 4500,  color: "#c9d1e0" },
    { key: "apex",      name: "👑 갈라 대장군",  sub: "전장을 평정한 전설의 논객",          min: 15000, color: "#ff8a3d" },
  ];
  const SUB_LEVELS = 5;      // 각 등급 내부 서브레벨(Lv.1~5) — 잦은 소진급으로 몰입 유지
  const APEX_STEP = 5000;    // 대장군 이후 무한 프레스티지: 5,000 GI마다 Lv +1
  const BASE_GRANT = 10000;  // 예측 지갑 기본 지급분(순이익 계산 기준)

  window.GALLA_GALLIAN_TIERS = TIERS;

  window.GALLA_gallianOf = async function (supabase, userId) {
    const cnt = (t, col) => supabase.from(t).select(col || "id", { count: "exact", head: true }).eq("user_id", userId);
    const [
      issuesR, commentsR, votesR, ppR, pcR, actsR, tradesR, balR, meritR
    ] = await Promise.all([
      cnt("issues"), cnt("comments"), cnt("votes"),
      cnt("plaza_posts"), cnt("plaza_comments"),
      cnt("comment_actions"), cnt("predict_bets"),   // 파리뮤추얼 전환: market_trades → predict_bets
      supabase.from("point_balances").select("balance").eq("user_id", userId).maybeSingle(),
      supabase.rpc("battle_merit_stats", { p_user: userId }),  // 전공(격파·어시·수호)
    ]);

    const issues = issuesR.count || 0;
    const comments = commentsR.count || 0;
    const votes = votesR.count || 0;
    const plaza = (ppR.count || 0) + (pcR.count || 0);
    const acts = actsR.count || 0;
    const trades = tradesR.count || 0;
    const balance = balR.data?.balance || 0;
    const merits = meritR?.data || { ko: 0, assist: 0, guard: 0, gp: 0 };  // 전공 (테이블 없으면 0)

    const activity = issues * 50 + comments * 10 + votes * 2 + (ppR.count || 0) * 15 + (pcR.count || 0) * 5;
    // 전투지수 = 액션량 + 전공(성과) — 격파는 판을 끝내는 성과라 가중 최대
    const battle = acts * 8 + (merits.ko | 0) * 30 + (merits.assist | 0) * 10 + (merits.guard | 0) * 12;
    // 예측 지수는 거래 활동만 반영 — 보유 잔액과 분리(소비해도 등급 안 떨어짐)
    const predict = trades * 10;
    const gi = activity + battle + predict;

    let tier = TIERS[0], idx = 0;
    TIERS.forEach((t, i) => { if (gi >= t.min) { tier = t; idx = i; } });
    const next = TIERS[idx + 1] || null;
    const progress = next
      ? Math.min(100, Math.round(((gi - tier.min) / (next.min - tier.min)) * 100))
      : 100;

    // 서브레벨(Lv) — 등급 내부를 잘게 쪼개 잦은 소진급으로 몰입 유지
    const into = gi - tier.min;
    let subLevel, subCount, subFloor, subCeil;
    if (next) {
      const step = (next.min - tier.min) / SUB_LEVELS;
      subCount = SUB_LEVELS;
      subLevel = Math.min(SUB_LEVELS, 1 + Math.floor(into / step));
      subFloor = tier.min + (subLevel - 1) * step;
      subCeil = tier.min + subLevel * step;
    } else {
      // 대장군: 무한 프레스티지 레벨
      subCount = Infinity;
      subLevel = 1 + Math.floor(into / APEX_STEP);
      subFloor = tier.min + (subLevel - 1) * APEX_STEP;
      subCeil = tier.min + subLevel * APEX_STEP;
    }
    const subProgress = Math.min(100, Math.round((gi - subFloor) / (subCeil - subFloor) * 100));

    // 가장 가까운 목표(다음 서브레벨 or 다음 등급) — "앞으로 N GI!" 이탈방지 프레이밍
    const atTierTop = next && subLevel >= SUB_LEVELS;
    const goalGi = atTierTop ? next.min : Math.ceil(subCeil);
    const remaining = Math.max(0, goalGi - gi);
    const goalLabel = (next && atTierTop)
      ? `${next.name} 승급`
      : `${tier.name} Lv.${subLevel + 1}`;

    return {
      gi, tier: { ...tier, index: idx }, next, progress,
      subLevel, subCount, subProgress,
      goal: { label: goalLabel, remaining, isPromotion: !!(next && atTierTop) },
      parts: { activity, battle, predict },
      raw: { issues, comments, votes, plaza, acts, trades, balance, merits },
    };
  };
})();
