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
    alert("로그인이 필요합니다.");
    location.href = "login.html";
    return;
  }

  const user = session.user;
  const userId = user.id;

  /* =====================
     프로필 정보 로딩
  ===================== */
  const { data: profile, error: profileErr } = await supabase
    .from("users")
    .select("nickname, bio, phone, avatar_url")
    .eq("id", userId)
    .single();

  if (profileErr) {
    console.error("[settings.js] profile load error", profileErr);
  }

  if (profile) {
    const $ = id => document.getElementById(id);

    $("profileName") && ($("profileName").textContent = profile.nickname || "익명의 사용자");
    $("profileBio") && ($("profileBio").textContent = profile.bio || "소개 문구가 없습니다.");
    $("emailValue") && ($("emailValue").textContent = user.email || "-");
    $("phoneValue") && ($("phoneValue").textContent = profile.phone || "-");

    const profileImgEl = document.querySelector(".profile-card .profile-img");
    if (profileImgEl) {
      if (profile.avatar_url) {
        const SUPABASE_URL = supabase.supabaseUrl;
        profileImgEl.src =
          `${SUPABASE_URL}/storage/v1/object/public/profiles/${profile.avatar_url}?t=${Date.now()}`;
      } else {
        profileImgEl.src = "./assets/logo.png";
      }
    }
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
     로그아웃
  ===================== */
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await supabase.auth.signOut();
      alert("로그아웃되었습니다.");
      location.href = "index.html";
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