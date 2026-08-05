/* ═══ 이중 모드(MPA/SPA) ═══
   · MPA(settings.html 단독 문서): 기존처럼 DOMContentLoaded 자동 초기화.
   · SPA(app.html, body[data-page="spa"]): 자동 초기화를 건너뛰고
     window.GALLA_PAGE_SETTINGS.mount(root, params)를 어댑터(js/spa/views/settings.js)가 호출.
   로직 동일 — 요소 조회만 root(D)로 스코프해 단일문서 내 id 충돌(profileName 등, 마이페이지와 겹침)을 막는다. */
async function GALLA_settingsInit(root) {
  // 조회 루트 — MPA면 document, SPA면 view-host(#app 추출분)
  const D = (root && root !== document && root.querySelector) ? root : document;
  const byId = (id) => (D === document) ? document.getElementById(id) : D.querySelector("#" + id);

  console.log("[settings.js] Loaded");

  /* 📦 버전 표시 — 배포 빌드번호(GALLA_V) 노출. 웹/앱 공통. '안 보인다' 제보 시 이 값으로 최신 여부 확인.
     GALLA_V는 SPA 셸(app.html)이 정의. MPA 단독 문서면 스크립트 ?v= 쿼리에서 추출. */
  try {
    const vEl = byId("st-version");
    if (vEl) {
      let build = window.GALLA_V;
      if (!build) {
        const s = document.querySelector('script[src*="settings.js?v="]') || document.querySelector('script[src*="?v="]');
        const m = s && s.getAttribute("src").match(/[?&]v=([^&]+)/);
        build = m ? m[1] : "";
      }
      vEl.textContent = build ? "1.0.0 · b" + build : "1.0.0";
    }
  } catch (_) {}

  // 뒤로가기 — SPA 스택 뷰면 pop(문서 유지). MPA는 back.js의 [data-back]가 담당.
  if (document.body && document.body.dataset.page === "spa") {
    const back = (D.querySelector ? D : document).querySelector(".st-back[data-back]");
    if (back && !back.dataset.spaWired) {
      back.dataset.spaWired = "1";
      back.addEventListener("click", (e) => { e.preventDefault(); try { window.GALLA_SPA && window.GALLA_SPA.pop(); } catch (_) {} });
    }
  }

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
    window.GALLA_gotoLogin ? GALLA_gotoLogin() : ((window.GALLA_nav||function(u){location.href=u})("login.html"));
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
      const set = (id, v) => { const el = byId(id); if (el) el.textContent = v; };
      set("gtBadge", `${d.emoji} ${d.name}${d.rookie ? "" : "형"}`);
      set("gtPro", d.proPct + "%");
      set("gtCon", d.conPct + "%");
      set("gtDesc", d.desc);
      const tagsEl = byId("gtTags");
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
    const $ = byId;

    if ($("profileName")) { $("profileName").textContent = profile.nickname || "익명의 사용자"; if (user && user.id) $("profileName").setAttribute("data-nick-uid", user.id); }
    $("profileBio") && ($("profileBio").textContent = profile.bio || "소개 문구가 없습니다.");
    $("emailValue") && ($("emailValue").textContent = user.email || "-");
    $("phoneValue") && ($("phoneValue").textContent = profile.phone || "-");

    const profileImgEl = byId("plAvatar") || D.querySelector(".profile-card .profile-img");
    if (profileImgEl) window.GALLA_setAvatar(profileImgEl, profile.avatar_url, 256, true);
  }

  /* =====================
     지갑 / 정산 (현재 0 처리)
  ===================== */
  const setText = (id, value) => {
    const el = byId(id);
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
    .eq("author_id", userId);

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
  const levelEl = byId("plLevel");
  const powerEl = byId("plPower");
  const xpFill = byId("plXpFill");
  const xpLabel = byId("plXpLabel");
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
  D.querySelectorAll(".rec-num").forEach(el => {
    const v = Number(el.textContent) || 0;
    if (v > 0) countUp(el, v);
  });

  /* =====================
     로그아웃
  ===================== */
  const logoutBtn = byId("logoutBtn");
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
  D.querySelectorAll("[data-target]").forEach(el => {
    el.style.cursor = "pointer";
    el.addEventListener("click", () => {
      const to = el.dataset.target;
      if (!to) return;
      // SPA면 스택 뷰로 push(문서 이탈·스플래시 없음). 전용 뷰 모듈 없는 페이지는 라우터가 자체 스크립트로 폴백.
      if (document.body && document.body.dataset.page === "spa" && window.GALLA_SPA && window.GALLA_SPA.push) {
        const m = to.match(/^\.?\/?([a-z0-9_-]+)\.html(?:\?(.*))?$/i);
        if (m) { const p = {}; if (m[2]) new URLSearchParams(m[2]).forEach((v, k) => p[k] = v); window.GALLA_SPA.push(m[1], p); return; }
      }
      location.href = to;
    });
  });

  /* =====================
     SPA 전용 보강 — MPA에선 settings.html 인라인 <script>가 하던 일
     (view-loader가 인라인 스크립트를 제거하므로 여기서 동일 로직 수행)
  ===================== */
  if (D !== document) {
    // 1) '이 기기에 패스키 등록' 노출 — 패스키 지원 + 홈화면 웹클립 PWA 아님(네이티브 GallaApp은 허용)
    try {
      const isWebClip = !/GallaApp/i.test(navigator.userAgent || "") &&
        ((window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true);
      if (window.PublicKeyCredential && navigator.credentials && !isWebClip) {
        const pk = byId("st-passkey"); if (pk) pk.hidden = false;
      }
    } catch (_) {}

    // 2) 📳 흔들어서 신고 — iOS(권한 요청 필요 기기)에서만 항목 노출
    try {
      const DM = window.DeviceMotionEvent;
      if (DM && typeof DM.requestPermission === "function") {
        const row = byId("st-shake"), val = byId("st-shake-v");
        if (row) {
          row.hidden = false;
          row.addEventListener("click", () => {
            if (val) val.textContent = "확인 중…";
            window.GALLA_enableShakeReport && window.GALLA_enableShakeReport().then(ok => {
              if (val) val.textContent = ok ? "켜짐 ✓" : "거부됨 — 설정 > Safari에서 동작 접근을 허용해주세요";
            });
          });
        }
      }
    } catch (_) {}

    // 3) 칭호·가챠·상점 타일
    byId("notifyTile")?.addEventListener("click", () => { window.GALLA_openNotifySettings && window.GALLA_openNotifySettings(); });
    byId("titlesTile")?.addEventListener("click", () => { window.GALLA_openTitles && window.GALLA_openTitles(); });
    byId("gachaTile")?.addEventListener("click", () => { window.GALLA_openGacha && window.GALLA_openGacha(); });
    byId("shopTile")?.addEventListener("click", (e) => { e.stopPropagation(); window.openShop && window.openShop(); });

    // 4) 관리자 관제센터 링크 노출
    try {
      const { data: p } = await supabase.from("user_profiles").select("admin_flag").eq("user_id", userId).maybeSingle();
      if (p && p.admin_flag) { const el = byId("ad-admin-link"); if (el) el.style.display = "block"; }
    } catch (_) {}
  }
}

/* ═══ 모드 부트스트랩 ═══
   SPA 셸(app.html)이면 자동 초기화 금지 — 어댑터가 mount()로 부른다.
   MPA(단독 문서)면 기존과 동일하게 DOMContentLoaded에서 자동 초기화. */
(function () {
  const page = {
    _root: null,
    mount(root, params) { page._root = root || document; return GALLA_settingsInit(page._root, params); },
    unmount() { page._root = null; },   // 타이머·구독 없음 — 카운트업 rAF는 유한 루프
    scrolltop() {
      const sc = (page._root && page._root !== document) ? page._root : (document.scrollingElement || document.documentElement);
      try { sc.scrollTo({ top: 0, behavior: "smooth" }); } catch (_) { sc.scrollTop = 0; }
    },
  };
  window.GALLA_PAGE_SETTINGS = page;

  if (document.body && document.body.dataset.page === "spa") return;   // SPA — mount 대기
  document.addEventListener("DOMContentLoaded", () => { GALLA_settingsInit(document); });
})();
