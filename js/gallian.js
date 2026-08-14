/* =========================================================
   갈라리안 — 두 트랙 (리니지 + 롤)

     ① 평생 레벨  누적. 절대 안 내려간다. '오르는 재미'.
     ② 시즌 등급  상위 % + 절대 하한. 시즌마다 재출발. '희소성'.

   왜 나눴나: 하나로 하면 둘 중 하나를 잃는다.
   평생 누적만 두면 늦게 온 사람이 영영 못 따라잡아 시작을 안 하고,
   시즌만 두면 쌓이는 맛이 없다. 롤은 ②만, 리니지는 ①만 있다. 우리는 둘 다 쓴다.

   ⚠️ 계산은 전부 서버(gallian_of)가 한다. 여기서 GI 를 다시 세지 않는다.
      예전엔 서버·이 파일·gi_of_users·supabase.js 가 각각 다르게 계산해
      같은 유저가 2,226 / 4,722 로 갈렸다(피드 배지와 등급 페이지가 달랐다).

   window.GALLA_gallianOf(supabase, userId) → Promise<gallian|null>
   ========================================================= */
(function () {
  /* 시즌 등급 — 서버 season_tiers() 의 거울. 순서·이름이 어긋나면 안 된다. */
  const TIERS = [
    { key: "spark",     lv: 0,  name: "🌱 눈팅러",      sub: "일단 스크롤만 내리는 구경꾼",   color: "#9aa0ad" },
    { key: "breaker",   lv: 10, name: "🔥 참견러",      sub: "못 참고 한마디 얹는 사람",      color: "#4fc3f7" },
    { key: "vanguard",  lv: 20, name: "🎪 판벌이",      sub: "슬슬 판을 벌이기 시작한 사람",  color: "#3d6bff" },
    { key: "authority", lv: 30, name: "🎯 판잡이",      sub: "판을 읽고 끌고 가는 사람",      color: "#c9d1e0" },
    { key: "dominion",  lv: 40, name: "🌪️ 판몰이",      sub: "판 자체를 몰고 가는 사람",      color: "#ffd166" },
    { key: "apex",      lv: 50, name: "👑 갈라 대장군", sub: "판을 평정한 전설",              color: "#ff8a3d" },
  ];

  const DOMAINS = [
    { key: "opinion",  emoji: "🗣",  name: "여론", hint: "이슈 발의 · 투표 · 받은 참전",      color: "#4fc3f7" },
    { key: "debate",   emoji: "⚔️", name: "논전", hint: "댓글 전투 · 일기토 · 전공",         color: "#ff6b6b" },
    { key: "creation", emoji: "🎬", name: "창작", hint: "숏판 · 롱판 · AI 창작 · 조회수",    color: "#c77dff" },
    { key: "predict",  emoji: "🔮", name: "예측", hint: "베팅 · 적중 · 연승",                color: "#ffd166" },
    { key: "arena",    emoji: "🎪", name: "난장", hint: "광장 · 오픈챗 · 라이브 · 갈라뉴스", color: "#06d6a0" },
  ];

  /* 등급 혜택 — 서버 tier_perks() 의 거울.
     ⚠️ '상단 노출·알고리즘 최우선'은 없다. hot_score 를 계산하는 코드가
        아예 없어서(피드는 created_at 순) 줄 수 없는 약속이었다. 문구에서 뺐다. */
  const PERKS = {
    0:  ["기본"],
    10: ["활동 GP +5%",  "전투 일일 상한 420"],
    20: ["활동 GP +10%", "전투 일일 상한 440"],
    30: ["활동 GP +18%", "전투 일일 상한 470"],
    40: ["활동 GP +28%", "전투 일일 상한 510"],
    50: ["활동 GP +45%", "전투 일일 상한 580"],
  };

  window.GALLA_GALLIAN_TIERS = TIERS;
  window.GALLA_GALLIAN_DOMAINS = DOMAINS;
  window.GALLA_TIER_PERKS = PERKS;
  window.GALLA_tierByLv = lv => TIERS.reduce((a, t) => (lv >= t.lv ? t : a), TIERS[0]);

  window.GALLA_gallianOf = async function (supabase, userId) {
    const res = await supabase.rpc("gallian_of", { p_user: userId });
    const g = (res && res.data) || {};
    if (!g.ok) return null;

    const tierLv = (g.tier && g.tier.lv) || 0;
    let tier = TIERS[0], idx = 0;
    TIERS.forEach((t, i) => { if (tierLv >= t.lv) { tier = t; idx = i; } });
    const next = TIERS[idx + 1] || null;

    /* 영역별 — 0 인 영역도 지우지 않는다.
       '창작 0' 이 보여야 뭘 안 하고 있는지 알고, 그게 다음 행동이 된다. */
    const dom = g.domains || {};
    const total = Math.max(1, g.gi_season || 0);
    const domains = DOMAINS.map(d => {
      const pts = Math.round(Number(dom[d.key]) || 0);
      return { ...d, points: pts, pct: Math.round(pts / total * 100) };
    });

    return {
      // ① 평생(리니지)
      giLife: g.gi_life || 0,
      level: g.level || 1,
      levelProgress: g.level_progress ?? 0,
      toNextLevel: g.to_next_level ?? 0,
      // ② 시즌(롤)
      season: g.season || null,
      giSeason: g.gi_season || 0,
      rank: g.rank || null,
      pct: g.pct,
      tier: { ...tier, index: idx },
      next,
      nextTier: g.next_tier || null,      // gi_short · needs_rank · top_pct · floor_gi
      perks: PERKS[tierLv] || PERKS[0],
      specialty: g.specialty || { key: "all", name: "만능형", emoji: "🎲", pct: 0 },
      domains,
    };
  };

  /* 여러 유저의 등급을 한 번에 — 피드 배지용.
     ⚠️ 시즌 등급은 '남들과 비교해야' 나오므로 GI 만으로 계산할 수 없다.
        서버가 미리 계산해둔 gallian_cache 를 읽는다. */
  window.GALLA_tiersOf = async function (supabase, uids) {
    const out = {};
    if (!uids || !uids.length) return out;
    const { data } = await supabase.from("gallian_cache")
      .select("user_id,tier_lv,level,gi_season").in("user_id", uids);
    (data || []).forEach(r => {
      const t = window.GALLA_tierByLv(r.tier_lv || 0);
      out[r.user_id] = { tierLv: r.tier_lv || 0, level: r.level || 1,
                         giSeason: r.gi_season || 0,
                         icon: (t.name || "🌱").trim().split(/\s+/)[0],
                         label: t.name, color: t.color };
    });
    return out;
  };
})();
