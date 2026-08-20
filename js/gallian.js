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
    { key: "spark",     lv: 0,  name: "🌱 눈팅러",   sub: "일단 스크롤만 내리는 구경꾼", color: "#9aa0ad" },
    { key: "breaker",   lv: 10, name: "🔥 참견러",   sub: "못 참고 한마디 얹는 사람",    color: "#4fc3f7" },
    { key: "vanguard",  lv: 20, name: "🎪 단골",     sub: "이 판에 자주 오는 사람",      color: "#3d6bff" },
    { key: "authority", lv: 30, name: "🎯 고수",     sub: "판을 읽고 끌고 가는 사람",    color: "#ffd166" },
    { key: "dominion",  lv: 40, name: "🌪️ 터줏대감", sub: "판의 주인. 다음은 왕좌",      color: "#ff8a3d" },
  ];

  /* 왕 다섯 — 갈라엔 왕이 다섯이다. 아무도 다섯을 다 갖지 못한다.
     서버 gi_domains() / kings_now() 의 거울. 키가 어긋나면 영역이 0으로 보인다. */
  const DOMAINS = [
    { key: "issue",   emoji: "⚔️", name: "이슈", king: "이슈왕", hint: "발의 · 투표 · 댓글 전투 · 일기토", color: "#ff6b6b" },
    { key: "arena",   emoji: "🎪", name: "광장", king: "광장왕", hint: "광장 · 난장 · 라이브 · 갈라뉴스",   color: "#06d6a0" },
    { key: "short",   emoji: "📱", name: "숏판", king: "숏판왕", hint: "세로 영상 · AI 창작 · 조회수",      color: "#c77dff" },
    { key: "long",    emoji: "🎞", name: "롱판", king: "롱판왕", hint: "가로 영상 · 오래 붙잡는 힘",        color: "#4fc3f7" },
    { key: "predict", emoji: "🔮", name: "예측", king: "예측왕", hint: "베팅 · 적중 · 연승",                color: "#ffd166" },
  ];

  /* 판별 등급 — 서버 domain_tiers() 의 거울. 상대% 없이 절대 GI 만 본다.
     (통합 등급은 상위 10% 같은 조건 때문에 판별 모수 3~5명에선 아무도 승급을
      못 했다. 상대 순위는 왕이 맡는다 — 판마다 딱 한 명.) */
  const DOM_TIERS = [
    { lv: 0,  div: 0, name: "눈팅러",   emoji: "🌱", sub: "이 판은 아직 구경만",     floor: 0,    color: "#9aa0ad" },
    { lv: 10, div: 3, name: "참견러",   emoji: "🔥", sub: "못 참고 한마디 얹기 시작", floor: 30,   color: "#4fc3f7" },
    { lv: 10, div: 2, name: "참견러",   emoji: "🔥", sub: "못 참고 한마디 얹기 시작", floor: 60,   color: "#4fc3f7" },
    { lv: 10, div: 1, name: "참견러",   emoji: "🔥", sub: "못 참고 한마디 얹기 시작", floor: 100,  color: "#4fc3f7" },
    { lv: 20, div: 3, name: "단골",     emoji: "🎪", sub: "이 판에 자주 온다",       floor: 150,  color: "#3d6bff" },
    { lv: 20, div: 2, name: "단골",     emoji: "🎪", sub: "이 판에 자주 온다",       floor: 220,  color: "#3d6bff" },
    { lv: 20, div: 1, name: "단골",     emoji: "🎪", sub: "이 판에 자주 온다",       floor: 300,  color: "#3d6bff" },
    { lv: 30, div: 3, name: "고수",     emoji: "🎯", sub: "이 판을 읽고 끌고 간다",   floor: 400,  color: "#ffd166" },
    { lv: 30, div: 2, name: "고수",     emoji: "🎯", sub: "이 판을 읽고 끌고 간다",   floor: 520,  color: "#ffd166" },
    { lv: 30, div: 1, name: "고수",     emoji: "🎯", sub: "이 판을 읽고 끌고 간다",   floor: 660,  color: "#ffd166" },
    { lv: 40, div: 3, name: "터줏대감", emoji: "🌪️", sub: "이 판의 주인. 다음은 왕좌", floor: 820,  color: "#ff8a3d" },
    { lv: 40, div: 2, name: "터줏대감", emoji: "🌪️", sub: "이 판의 주인. 다음은 왕좌", floor: 1000, color: "#ff8a3d" },
    { lv: 40, div: 1, name: "터줏대감", emoji: "🌪️", sub: "이 판의 주인. 다음은 왕좌", floor: 1200, color: "#ff8a3d" },
  ].map(t => ({ ...t, label: t.name + (t.div ? " " + "I".repeat(t.div) : "") }));
  const domTierOf = gi => DOM_TIERS.reduce((a, t) => (gi >= t.floor ? t : a), DOM_TIERS[0]);
  const domNextTier = gi => DOM_TIERS.find(t => gi < t.floor) || null;

  /* 레벨 곡선 — 서버 level_of_gi/gi_for_level 의 거울(÷5).
     ⚠️ 서버와 이 두 줄이 어긋나면 진행바가 거짓말을 한다. */
  const levelOf  = gi => Math.max(1, Math.floor(Math.sqrt(Math.max(gi, 0) / 5)) + 1);
  const giForLv  = lv => (lv <= 1 ? 0 : Math.round(5 * Math.pow(lv - 1, 2)));

  /* 레벨 띠 — 숫자만 올라가면 금방 무뎌진다. 10 단위로 색이 바뀐다. */
  const BANDS = [
    { from: 0,  name: "무명",   color: "#9aa0ad" },
    { from: 10, name: "이름값", color: "#4fc3f7" },
    { from: 20, name: "한가락", color: "#3d6bff" },
    { from: 30, name: "터줏대감", color: "#c9d1e0" },
    { from: 40, name: "거물",   color: "#ffd166" },
    { from: 50, name: "전설",   color: "#ff8a3d" },
  ];
  const bandOf = lv => BANDS.reduce((a, b) => (lv >= b.from ? b : a), BANDS[0]);

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
  window.GALLA_DOM_TIERS = DOM_TIERS;
  window.GALLA_domTierOf = domTierOf;
  window.GALLA_LEVEL_BANDS = BANDS;
  window.GALLA_levelOf = levelOf;
  window.GALLA_giForLevel = giForLv;
  window.GALLA_bandOf = bandOf;
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
    const crowns = g.my_kings || [];
    const domLife = g.domains_life || {};
    const domains = DOMAINS.map(d => {
      const pts  = Math.round(Number(dom[d.key]) || 0);       // 이번 시즌 → 등급
      const life = Math.round(Number(domLife[d.key]) || 0);   // 평생 누적 → 레벨
      /* 판마다 레벨(평생)과 등급(시즌)을 따로 매긴다.
         둘 다 같은 숫자로 매기면 한 줄에서 같은 걸 두 번 말하게 된다. */
      const lv = levelOf(life), from = giForLv(lv), to = giForLv(lv + 1);
      const tier = domTierOf(pts), nextT = domNextTier(pts);
      return {
        ...d, points: pts, lifePoints: life, pct: Math.round(pts / total * 100),
        level: lv, band: bandOf(lv),
        /* 판마다 등급이 다르다 — 이슈에선 고수여도 예측에선 눈팅러다 */
        tier, nextTier: nextT,
        tierShort: nextT ? Math.max(0, nextT.floor - pts) : 0,
        toNext: Math.max(0, to - life),
        progress: to > from ? Math.min(100, Math.round((life - from) / (to - from) * 100)) : 0,
        isKing: crowns.indexOf(d.key) >= 0,
      };
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
      band: bandOf(g.level || 1),
      crowns,
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
