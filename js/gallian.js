/* =========================================================
   갈라리안 등급 — 통합 마스터 등급 (갈라 지수 기반)

   갈라 지수(GI) = 5개 영역의 압축 점수 합
     🗣 여론 · ⚔️ 논전 · 🎬 창작 · 🔮 예측 · 🎪 난장
   어느 길로 와도 오른다 — 종합 콘텐츠 플랫폼이면 등급도 종합이어야 한다.

   ⚠️ 계산은 전부 서버(gallian_of)가 한다. 여기서 GI를 다시 세지 않는다.
      예전엔 서버 _user_gi · 이 파일 · gi_of_users · supabase.js 가 각각
      다르게 계산해 같은 유저가 2,226 / 4,722 로 갈렸다(피드 배지와 등급
      페이지가 서로 다른 등급을 보여줬다). 사본을 만들지 않는다.

   창작자 등급(별도 사다리)은 폐지 — '창작' 영역으로 흡수됐다.
   축 3개(갈라리안/Lv/창작자) → 사다리 1개 + 주특기 배지.

   window.GALLA_gallianOf(supabase, userId) → Promise<gallian>
   ========================================================= */
(function () {
  /* 등급 = 누적 레벨 10칸마다 승급. lv 는 'GI'가 아니라 '레벨'이다.
     ⚠️ 이름·순서는 서버 gallian_of 의 티어표와 반드시 같아야 한다. */
  const TIERS = [
    { key: "spark",     name: "🌱 눈팅러",      sub: "일단 스크롤만 내리는 구경꾼",   lv: 0,  color: "#9aa0ad" },
    { key: "breaker",   name: "🔥 참견러",      sub: "못 참고 한마디 얹는 사람",      lv: 10, color: "#4fc3f7" },
    { key: "vanguard",  name: "🎪 판벌이",      sub: "슬슬 판을 벌이기 시작한 사람",  lv: 20, color: "#3d6bff" },
    { key: "authority", name: "🎯 판잡이",      sub: "판을 읽고 끌고 가는 사람",      lv: 30, color: "#c9d1e0" },
    { key: "dominion",  name: "🌪️ 판몰이",      sub: "판 자체를 몰고 가는 사람",      lv: 40, color: "#ffd166" },
    { key: "apex",      name: "👑 갈라 대장군", sub: "판을 평정한 전설",              lv: 50, color: "#ff8a3d" },
  ];

  /* 영역 — 화면 순서와 라벨의 단일 출처. 서버 gi_domains 의 키와 1:1. */
  const DOMAINS = [
    { key: "opinion",  emoji: "🗣",  name: "여론", hint: "이슈 발의 · 투표 · 받은 참전",        color: "#4fc3f7" },
    { key: "debate",   emoji: "⚔️", name: "논전", hint: "댓글 전투 · 일기토 · 전공",           color: "#ff6b6b" },
    { key: "creation", emoji: "🎬", name: "창작", hint: "숏판 · 롱판 · AI 창작 · 조회수",      color: "#c77dff" },
    { key: "predict",  emoji: "🔮", name: "예측", hint: "베팅 · 적중 · 연승",                  color: "#ffd166" },
    { key: "arena",    emoji: "🎪", name: "난장", hint: "광장 · 오픈챗 · 라이브 · 갈라뉴스",   color: "#06d6a0" },
  ];

  window.GALLA_GALLIAN_TIERS = TIERS;
  window.GALLA_GALLIAN_DOMAINS = DOMAINS;

  window.GALLA_gallianOf = async function (supabase, userId) {
    const gRes = await supabase.rpc("gallian_of", { p_user: userId });
    const g = (gRes && gRes.data) || {};
    if (!g.ok) return null;

    const gi = g.gi || 0;
    const level = g.level || 1;

    let tier = TIERS[0], idx = 0;
    TIERS.forEach((t, i) => { if (level >= t.lv) { tier = t; idx = i; } });
    const next = TIERS[idx + 1] || null;

    /* 영역별 기여도 — 0 인 영역도 빼지 않는다.
       '창작 0'이 보여야 뭘 안 하고 있는지 유저가 안다(그게 다음 행동을 만든다). */
    const dom = g.domains || {};
    const total = Math.max(1, gi);
    const domains = DOMAINS.map(d => {
      const pts = Math.round(Number(dom[d.key]) || 0);
      return { ...d, points: pts, pct: Math.round(pts / total * 100) };
    });

    const nextTierLv = g.next_tier_level || null;

    return {
      gi, level, tier: { ...tier, index: idx }, next,
      progress: g.progress ?? 0,
      goal: { label: `Lv.${level + 1}`, remaining: g.to_next ?? 0, isPromotion: false },
      promotion: nextTierLv ? { level: nextTierLv, gi: g.next_tier_gi, name: next && next.name } : null,
      specialty: g.specialty || { key: "all", name: "만능형", emoji: "🎲", pct: 0 },
      domains,
    };
  };
})();
