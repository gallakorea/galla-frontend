document.addEventListener("DOMContentLoaded", async () => {
  console.log("[settings.js] Loaded");

  /* =====================
     Supabase client 대기
  ===================== */
  const waitForSupabase = () =>
    new Promise(resolve => {
      const t = setInterval(() => {
        if (window.supabaseClient) {
          clearInterval(t);
          resolve(window.supabaseClient);
        }
      }, 20);
    });

  const supabase = await waitForSupabase();
  if (!supabase) {
    console.error("[settings.js] Supabase client 없음");
    return;
  }

  /* =====================
     로그인 세션 확인
  ===================== */
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;

  if (!session?.user) {
    if (!document.body.classList.contains("in-shell")) alert("로그인이 필요합니다."); // 셸 백그라운드 판에선 알럿이 셸 전체를 덮는다
    location.href = "login.html";
    return;
  }

  const user = session.user;
  const userId = user.id;

  /* =====================
     갈라 성향 (실제 행동 기반, 매번 재계산)
  ===================== */
  (async () => {
    try {
      if (!window.GALLA_computeType) return;
      const d = await window.GALLA_computeType(supabase, userId);
      const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
      set("gtBadge", `${d.emoji} ${d.name}${d.rookie ? "" : "형"}`);
      set("gtPro", d.proPct + "%");
      set("gtCon", d.conPct + "%");
      set("gtDesc", d.desc);
      const tagsEl = document.getElementById("gtTags");
      if (tagsEl) tagsEl.innerHTML = (d.tags || []).map(t => `<span>${t}</span>`).join("");
    } catch (e) { console.error("[galla-type card]", e); }
  })();

  /* =====================
     프로필 정보 로딩
  ===================== */
  // 본인 계정정보는 PII(phone 등) 포함이라 SECURITY DEFINER RPC로만 조회(직접 users 조회 차단됨)
  const { data: profile, error: profileErr } = await supabase.rpc("get_my_account");

  if (profileErr) {
    console.error("[settings.js] profile load error", profileErr);
  }

  if (profile) {
    const $ = id => document.getElementById(id);

    if ($("profileName")) { $("profileName").textContent = profile.nickname || "익명의 사용자"; if (user && user.id) $("profileName").setAttribute("data-nick-uid", user.id); }
    $("profileBio") && ($("profileBio").textContent = profile.bio || "소개 문구가 없습니다.");
    $("emailValue") && ($("emailValue").textContent = user.email || "-");
    $("phoneValue") && ($("phoneValue").textContent = profile.phone || "-");

    const profileImgEl = document.getElementById("plAvatar") || document.querySelector(".profile-card .profile-img");
    if (profileImgEl) window.GALLA_setAvatar(profileImgEl, profile.avatar_url, 256, true);
  }

  /* =====================
     지갑 / 정산 (현재 0 처리)
  ===================== */
  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  setText("revenueTotal", "₩ 0");
  setText("revenueAvailable", "₩ 0");
  setText("donationTotal", "₩ 0");

  /* =====================
     활동 통계
     - 만든 갈라
     - 찬성 / 반대
     - 댓글 수
  ===================== */

  // 1) 내가 만든 이슈
  const { count: myIssueCount } = await supabase
    .from("issues")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  setText("statMy", myIssueCount ?? 0);

  // 2) 내가 만든 이슈 id 목록
  const { data: myIssues } = await supabase
    .from("issues")
    .select("id")
    .eq("user_id", userId);

  const myIssueIds = (myIssues || []).map(i => i.id);

  // 3) 찬성 / 반대 수
  if (myIssueIds.length > 0) {
    const { count: proCount } = await supabase
      .from("votes")
      .select("id", { count: "exact", head: true })
      .in("issue_id", myIssueIds)
      .eq("type", "pro");

    const { count: conCount } = await supabase
      .from("votes")
      .select("id", { count: "exact", head: true })
      .in("issue_id", myIssueIds)
      .eq("type", "con");

    setText("statPro", proCount ?? 0);
    setText("statCon", conCount ?? 0);
  } else {
    setText("statPro", 0);
    setText("statCon", 0);
  }

  // 4) 댓글 수 (comments 테이블 기준)
  const { count: commentCount } = await supabase
    .from("comments")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  setText("statComments", commentCount ?? 0);

  /* =====================
     ⚔️ 전투 전적 (공격/방어/지원) + 오늘 침투
  ===================== */
  const { data: myActs } = await supabase
    .from("comment_actions")
    .select("action_type")
    .eq("user_id", userId)
    .limit(5000);
  const acts = { attack: 0, defend: 0, support: 0 };
  (myActs || []).forEach(a => { if (acts[a.action_type] !== undefined) acts[a.action_type]++; });
  setText("statAtk", acts.attack);
  setText("statDef", acts.defend);
  setText("statSup", acts.support);

  const { data: infSt } = await supabase.rpc("infiltration_status");
  setText("statInfil", infSt?.used ?? 0);

  /* =====================
     🎮 레벨 · 전투력 · XP 게이지
     전투력 = 갈라×50 + 댓글×10 + 전투액션×5 + 받은찬반×2
  ===================== */
  // 레벨·전투력·XP — 죽은 users.level 폐지, 갈라리안 GI로 통일(마이페이지·grade와 동일)
  const totalActs = acts.attack + acts.defend + acts.support;
  const levelEl = document.getElementById("plLevel");
  const powerEl = document.getElementById("plPower");
  const xpFill = document.getElementById("plXpFill");
  const xpLabel = document.getElementById("plXpLabel");
  try {
    // grade·마이페이지와 완전히 동일한 full 계산으로 통일
    const g = window.GALLA_gallianOf ? await window.GALLA_gallianOf(supabase, userId) : null;
    if (g) {
      if (levelEl) levelEl.textContent = `${g.tier.name} Lv.${g.subLevel}`;
      if (xpLabel) xpLabel.textContent = g.goal?.remaining > 0 ? `다음 레벨까지 ${g.goal.remaining.toLocaleString()} GI` : "최고 레벨";
      requestAnimationFrame(() => { if (xpFill) xpFill.style.width = (g.subProgress || 0) + "%"; });
    }
  } catch (_) {}
  // 전투력 = 전투 액션(공격·방어·지원) 총량 — 마이페이지와 동일 정의(전투지수)
  const power = totalActs;

  /* 숫자 카운트업 연출 (전적 + 전투력) */
  const countUp = (el, target) => {
    if (!el) return;
    const t0 = performance.now(), dur = 900;
    (function step(now) {
      const p = Math.min(1, (now - t0) / dur);
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))).toLocaleString("ko-KR");
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  };
  countUp(powerEl, power);
  document.querySelectorAll(".rec-num").forEach(el => {
    const v = Number(el.textContent) || 0;
    if (v > 0) countUp(el, v);
  });

  /* =====================
     로그아웃
  ===================== */
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    // 네이티브 alert 폐지 → 우리 팝업(앱=로그아웃 차단·인스타식 / 웹=강한 만류 + "또 오세요")
    logoutBtn.addEventListener("click", () => {
      if (window.GALLA_logout) window.GALLA_logout();
      else { supabase.auth.signOut().then(() => location.href = "index.html"); }
    });
  }

  /* =====================
     네비게이션 이동
  ===================== */
  document.querySelectorAll("[data-target]").forEach(el => {
    el.style.cursor = "pointer";
    el.addEventListener("click", () => {
      const to = el.dataset.target;
      if (to) location.href = to;
    });
  });
});