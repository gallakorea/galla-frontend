/* =========================================================
   갈라 성향 로직 (GALLA 자체 4축 성향 시스템)
   - 유저의 실제 행동(투표/공격·방어/댓글/광장/예측)에서 성향을 도출
   - 저장하지 않고 매 조회 시 재계산 → 행동이 바뀌면 성향도 자동 변경
   window.GALLA_computeType(supabase, userId) → Promise<typeData>
   ========================================================= */
(function () {
  const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

  // 4축 정의: 각 축은 [왼쪽 폴, 오른쪽 폴]. pct=오른쪽 폴 쪽 강도(0~100)
  // 1) 토론 온도: 냉정(C) ↔ 열혈(H)
  // 2) 전투 스타일: 수비(D) ↔ 공격(A)
  // 3) 주 무대: 예측(B) ↔ 광장(T)
  // 4) 진영 성향: 균형(E) ↔ 확신(P)

  const CORE = {
    HA: { emoji: "🔥", name: "돌격 검투사", desc: "선봉에서 뜨겁게 몰아치는 공격형" },
    HD: { emoji: "🛡️", name: "열혈 수문장", desc: "물러서지 않고 아군을 지키는 방패" },
    CA: { emoji: "🎯", name: "냉혈 저격수", desc: "조용히 노렸다가 정확히 찌르는 한 방" },
    CD: { emoji: "🧊", name: "침착한 방패", desc: "감정에 휘둘리지 않는 냉정한 수비형" },
  };

  window.GALLA_computeType = async function (supabase, userId) {
    const [
      votesRes, actsRes, cmtRes, ppRes, pcRes, trRes
    ] = await Promise.all([
      supabase.from("votes").select("type, issue_id").eq("user_id", userId),
      supabase.from("comment_actions").select("action_type").eq("user_id", userId),
      supabase.from("comments").select("content, issue_id").eq("author_id", userId).limit(1000),
      supabase.from("plaza_posts").select("id", { count: "exact", head: true }).eq("user_id", userId),
      supabase.from("plaza_comments").select("id", { count: "exact", head: true }).eq("author_id", userId),
      supabase.from("market_trades").select("id", { count: "exact", head: true }).eq("user_id", userId),
    ]);

    const votes = votesRes.data || [];
    const pro = votes.filter(v => v.type === "pro").length;
    const con = votes.filter(v => v.type === "con").length;

    const acts = actsRes.data || [];
    const attack = acts.filter(a => a.action_type === "attack").length;
    const defend = acts.filter(a => a.action_type === "defend").length;
    const support = acts.filter(a => a.action_type === "support").length;

    const cmts = cmtRes.data || [];
    const commentCount = cmts.length;
    const plazaN = (ppRes.count || 0) + (pcRes.count || 0);
    const betN = trRes.count || 0;

    const total = pro + con + attack + defend + support + commentCount + plazaN + betN;

    // 활동 없음 → 신병
    if (total === 0) {
      return {
        rookie: true,
        emoji: "🌱", code: "----",
        name: "무명 신병",
        desc: "아직 전투 기록이 없어요. 갈라에 참전하면 당신만의 성향이 분석됩니다.",
        proPct: 50, conPct: 50,
        tags: ["#참전전"],
        axes: [
          { label: "토론 온도", pct: 50, text: "아직 분석 전" },
          { label: "전투 스타일", pct: 50, text: "아직 분석 전" },
          { label: "주 무대", pct: 50, text: "아직 분석 전" },
          { label: "진영 성향", pct: 50, text: "아직 분석 전" },
        ],
        behavior: { avgLen: 0, freq: "–", variety: "–", logicPct: 50 },
      };
    }

    // ── 축 계산 ──
    const engage = attack + defend + support + commentCount;
    const passive = pro + con;
    const heat = clamp((engage / (engage + passive + 1)) * 100);          // 열혈도
    const atkPct = clamp((attack / (attack + defend + 1)) * 100);          // 공격도
    const talkPct = clamp((plazaN / (plazaN + betN + 1)) * 100);          // 광장도
    const skew = clamp((Math.abs(pro - con) / (pro + con + 1)) * 100);     // 진영 확신도

    const L1 = heat >= 50 ? "H" : "C";   // 열혈/냉정
    const L2 = atkPct >= 50 ? "A" : "D"; // 공격/수비
    const L3 = talkPct >= 50 ? "T" : "B"; // 광장/예측
    const L4 = skew >= 50 ? "P" : "E";   // 확신/균형
    const code = L1 + L2 + L3 + L4;

    const core = CORE[L1 + L2];
    const stageTag = L3 === "T" ? "#토론파" : "#예언가";
    const sideTag = L4 === "P"
      ? (pro >= con ? "#찬성확신" : "#반대확신")
      : "#균형감각";
    const heatTag = L1 === "H" ? "#열혈" : "#냉정";
    const styleTag = L2 === "A" ? "#공격형" : "#수비형";

    // 설명 문장
    const stageDesc = L3 === "T" ? "광장에서 말로 승부하고" : "예측 마켓에서 적중으로 증명하며";
    const sideDesc = L4 === "P"
      ? (pro >= con ? "한쪽(찬성) 진영을 확실히 미는" : "한쪽(반대) 진영을 확실히 미는")
      : "양쪽을 저울질하는 균형잡힌";

    const desc = `${core.desc}. ${stageDesc}, ${sideDesc} 스타일입니다.`;

    // 행동 지표
    const avgLen = commentCount
      ? Math.round(cmts.reduce((s, c) => s + (c.content ? c.content.length : 0), 0) / commentCount)
      : 0;
    const varietySet = new Set([
      ...votes.map(v => v.issue_id),
      ...cmts.map(c => c.issue_id),
    ].filter(Boolean));
    const variety = varietySet.size;
    const freqLabel = total >= 60 ? "매우 활발" : total >= 20 ? "활발" : total >= 5 ? "보통" : "낮음";
    const varietyLabel = variety >= 15 ? "매우 다양" : variety >= 6 ? "다양" : variety >= 2 ? "보통" : "집중형";
    const logicPct = clamp(((defend + support) / (attack + defend + support + 1)) * 100);

    const proPct = pro + con ? clamp((pro / (pro + con)) * 100) : 50;

    return {
      rookie: false,
      emoji: core.emoji, code,
      name: core.name,
      desc,
      proPct, conPct: 100 - proPct,
      tags: [heatTag, styleTag, stageTag, sideTag],
      axes: [
        {
          label: "토론 온도", pct: heat,
          text: heat >= 60 ? "🔥 뜨겁게 참전하는 열혈파"
              : heat >= 40 ? "⚖️ 상황 봐가며 참전"
              : "🧊 조용히 지켜보는 냉정파",
        },
        {
          label: "전투 스타일", pct: atkPct,
          text: atkPct >= 60 ? "⚔️ 먼저 공격하는 편"
              : atkPct >= 40 ? "🔄 공수 균형"
              : "🛡️ 방어·지원에 강한 편",
        },
        {
          label: "주 무대", pct: talkPct,
          text: talkPct >= 60 ? "🗣️ 광장 토론 중심"
              : talkPct >= 40 ? "🎭 광장·예측 병행"
              : "📈 예측 마켓 중심",
        },
        {
          label: "진영 성향", pct: skew,
          text: skew >= 60 ? (pro >= con ? "🎯 찬성 쪽 확신형" : "🎯 반대 쪽 확신형")
              : skew >= 40 ? "↔️ 사안별로 유동적"
              : "⚖️ 찬반 균형감각형",
        },
      ],
      behavior: { avgLen, freq: freqLabel, variety: varietyLabel, logicPct },
    };
  };

  // 상세 페이지(galla-type.html) DOM 채우기
  window.GALLA_renderTypePage = function (d) {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const setW = (id, pct) => { const el = document.getElementById(id); if (el) requestAnimationFrame(() => el.style.width = pct + "%"); };
    set("typeName", `${d.emoji} ${d.name}${d.rookie ? "" : "형"}`);
    set("proRatio", d.proPct + "%");
    set("conRatio", d.conPct + "%");
    set("typeDesc", d.desc);
    const axIds = [["axisHot", "axisHotText"], ["axisProSide", "axisProSideText"], ["axisExplore", "axisExploreText"], ["axisLogic", "axisLogicText"]];
    d.axes.forEach((ax, i) => {
      const [barId, txtId] = axIds[i];
      setW(barId, ax.pct);
      set(txtId, ax.text);
      const box = document.getElementById(barId)?.closest(".axis-box");
      const lab = box?.querySelector(".axis-label");
      if (lab) lab.textContent = ax.label;
    });
    set("avgCommentLen", d.behavior.avgLen ? d.behavior.avgLen + "자" : "–");
    set("participationFreq", d.behavior.freq);
    set("issueVariety", d.behavior.variety);
    set("logicRatio", `논리 ${d.behavior.logicPct}% · 감정 ${100 - d.behavior.logicPct}%`);
  };
})();
