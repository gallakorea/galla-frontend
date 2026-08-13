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
  /* 등급 = 누적 레벨 10칸마다 승급. min 은 'GI'가 아니라 '레벨'이다.
     ⚠️ 예전엔 등급마다 Lv.1 로 리셋돼 '갈라 선동가 · Lv.1'처럼 상위 등급이 초보로 보였다
        (사장님 제보). 이제 레벨은 누적이라 숫자와 칭호가 같은 방향을 가리킨다. */
  const TIERS = [
    { key: "spark",     name: "🌱 눈팅 뉴비",   sub: "일단 스크롤만 내리는 관망러",    lv: 0,  color: "#9aa0ad" },
    { key: "breaker",   name: "🔥 발끈러",       sub: "못 참고 첫 댓글을 단 각성러",     lv: 10, color: "#4fc3f7" },
    { key: "vanguard",  name: "⌨️ 키보드 전사",  sub: "손가락이 근질근질한 참전러",      lv: 20, color: "#3d6bff" },
    { key: "authority", name: "🎤 여론 논객",    sub: "판을 읽고 흔드는 입담꾼",         lv: 30, color: "#c9d1e0" },
    { key: "dominion",  name: "🌪️ 갈라 선동가",  sub: "댓글창을 쥐락펴락하는 여론몰이",  lv: 40, color: "#c9d1e0" },
    { key: "apex",      name: "👑 갈라 대장군",  sub: "전장을 평정한 전설의 논객",       lv: 50, color: "#ff8a3d" },
  ];
  /* SUB_LEVELS·APEX_STEP 폐지 — 등급마다 Lv.1 로 리셋되던 원인.
     레벨은 이제 누적이고 서버(gi_for_level)가 곡선을 갖는다. */
  const BASE_GRANT = 10000;  // 예측 지갑 기본 지급분(순이익 계산 기준)

  window.GALLA_GALLIAN_TIERS = TIERS;

  window.GALLA_gallianOf = async function (supabase, userId) {
    const cnt = (t, col) => supabase.from(t).select(col || "id", { count: "exact", head: true }).eq("user_id", userId);
    // ⚠️ comments·plaza_comments는 컬럼잠금 테이블에서 user_id 컬럼이 grant 밖 — user_id 필터는 42501(댓글 GI가 항상 0으로 빠지던 조용한 버그, 2026-08-08 QA). author_id로 필터해야 한다.
    const cntByAuthor = (t) => supabase.from(t).select("id", { count: "exact", head: true }).eq("author_id", userId);
    const [
      issuesR, commentsR, votesR, ppR, pcR, actsR, tradesR, balR, meritR, cstatR
    ] = await Promise.all([
      cnt("issues"), cntByAuthor("comments"), cnt("votes"),
      cnt("plaza_posts"), cntByAuthor("plaza_comments"),
      cnt("comment_actions"), cnt("predict_bets"),   // 파리뮤추얼 전환: market_trades → predict_bets
      supabase.from("point_balances").select("balance").eq("user_id", userId).maybeSingle(),
      supabase.rpc("battle_merit_stats", { p_user: userId }),  // 전공(격파·어시·수호)
      supabase.rpc("creator_stats", { p_user: userId }),       // 🎬 창작(숏판/롱판) 지표
    ]);

    const issues = issuesR.count || 0;
    const comments = commentsR.count || 0;
    const votes = votesR.count || 0;
    const plaza = (ppR.count || 0) + (pcR.count || 0);
    const acts = actsR.count || 0;
    const trades = tradesR.count || 0;
    const balance = balR.data?.balance || 0;
    const merits = meritR?.data || { ko: 0, assist: 0, guard: 0, gp: 0 };  // 전공 (테이블 없으면 0)

    /* 🔢 GI·등급·레벨은 서버(gallian_of)가 단일 출처다.
       예전엔 서버 _user_gi 와 여기가 각각 다르게 계산해 값이 어긋났다.
       창작 트랙만 클라에서 이어서 만든다(창작 지수는 별도 축). */
    const gRes = await supabase.rpc("gallian_of", { p_user: userId });
    const g = gRes?.data || {};
    const gi = g.gi || 0;
    const activity = 0, battle = 0, predict = 0;   // 내역은 서버 확장 시 채운다

    /* 🎬 창작 지수 — 이건 원래도 '받은 반응' 기반이라 그대로 둔다(성과 가중 취지에 이미 맞음).
       ⚠️ 서버 GI 와 별개 축이다. 갈라리안 등급과 섞지 않는다. */
    const cs = (cstatR && cstatR.data) || {};
    const creator =
      (cs.posts | 0) * 30 + (cs.likes | 0) * 3 + (cs.comments | 0) * 5 +
      Math.round((cs.views | 0) * 0.2) + (cs.followers | 0) * 6 + Math.round((cs.support | 0) * 0.05);

    // 🎬 창작자 트랙(등급과 병행) — 창작 지수만으로 산정
    const CREATOR_TIERS = [
      { min: 0, name: "새싹 크리에이터", emoji: "🌱" },
      { min: 300, name: "라이징", emoji: "📈" },
      { min: 1500, name: "인플루언서", emoji: "✨" },
      { min: 6000, name: "스타", emoji: "🌟" },
      { min: 20000, name: "레전드", emoji: "👑" },
    ];
    let ct = CREATOR_TIERS[0], cti = 0;
    CREATOR_TIERS.forEach((t, i) => { if (creator >= t.min) { ct = t; cti = i; } });
    const ctNext = CREATOR_TIERS[cti + 1] || null;
    const creatorTrack = {
      score: creator, tier: { ...ct, index: cti }, next: ctNext,
      progress: ctNext ? Math.min(100, Math.round((creator - ct.min) / (ctNext.min - ct.min) * 100)) : 100,
      remaining: ctNext ? Math.max(0, ctNext.min - creator) : 0,
    };

    const level = g.level || 1;
    let tier = TIERS[0], idx = 0;
    TIERS.forEach((t, i) => { if (level >= t.lv) { tier = t; idx = i; } });
    const next = TIERS[idx + 1] || null;

    // 진척도 = 다음 '레벨'까지 (자주 차오르는 맛)
    const progress = g.progress ?? 0;
    const remaining = g.to_next ?? 0;
    const goalLabel = `Lv.${level + 1}`;
    const nextTierLv = g.next_tier_level || null;

    return {
      gi, level, tier: { ...tier, index: idx }, next, progress,
      goal: { label: goalLabel, remaining, isPromotion: false },
      promotion: nextTierLv ? { level: nextTierLv, gi: g.next_tier_gi, name: next?.name } : null,
      parts: { activity, battle, predict, creator },
      axes: { battle, predict, creator, community: activity },   // 4축 레이더용
      creatorTrack,
      raw: { issues, comments, votes, plaza, acts, trades, balance, merits, creatorStats: cs },
    };
  };
})();
