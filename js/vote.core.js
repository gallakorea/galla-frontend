// js/vote.core.js
console.log("[vote.core] loaded");

let votingInProgress = false;

/* ==========================================================================
   Vote Action (공통)
========================================================================== */
async function vote(issueId, type) {
  if (!issueId || votingInProgress) return;
  votingInProgress = true;

  const supabase = window.supabaseClient;
  if (!supabase) {
    console.error("[VOTE] supabase not ready");
    votingInProgress = false;
    return;
  }

  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    alert("로그인이 필요합니다.");
    votingInProgress = false;
    return;
  }

  const userId = session.session.user.id;

  const { error } = await supabase.from("votes").insert({
    issue_id: issueId,
    user_id: userId,   // 🔥 이 줄이 지금 없어서 막힌 거다
    type
  });

  votingInProgress = false;

  if (error && error.code !== "23505") {
    console.error("[VOTE] insert error", error);
    return;
  }

  // 상태 + 통계 + 전장 UI 동기화
  await checkVoteStatus(issueId);

  // 댓글 전장 재초기화 (기존 기능 복원)
  import("./issue.comments.js").then(m => {
    if (typeof m.initCommentSystem === "function") {
      m.initCommentSystem(issueId);
    }
  });
}

/* ==========================================================================
   Vote Stats (퍼센트 / 바)
========================================================================== */
async function loadVoteStats(issueId) {
  if (!issueId) return;

  const supabase = window.supabaseClient;
  if (!supabase) return;

  const { data, error } = await supabase
    .from("votes")
    .select("type")
    .eq("issue_id", issueId);

  if (error) {
    console.error("[VOTE] stats error", error);
    return;
  }

  let pro = 0;
  let con = 0;

  data.forEach(v => {
    if (v.type === "pro") pro++;
    if (v.type === "con") con++;
  });

  const total = pro + con || 1;
  const proPercent = Math.round((pro / total) * 100);
  const conPercent = 100 - proPercent;

  // ===== Issue Page UI =====
  const proBar  = document.getElementById("vote-pro-bar");
  const conBar  = document.getElementById("vote-con-bar");
  const proText = document.getElementById("vote-pro-text");
  const conText = document.getElementById("vote-con-text");

  if (proBar && conBar && proText && conText) {
    proBar.style.width = `${proPercent}%`;
    conBar.style.width = `${conPercent}%`;
    proText.innerText = `${proPercent}%`;
    conText.innerText = `${conPercent}%`;
  }
}

/* ==========================================================================
   Vote Status Sync (Issue + Shorts)
========================================================================== */
async function checkVoteStatus(issueId) {
  if (!issueId) return;

  const supabase = window.supabaseClient;
  if (!supabase) return;

  const { data: session } = await supabase.auth.getSession();
  if (!session.session) return;

  const { data } = await supabase
    .from("votes")
    .select("type")
    .eq("issue_id", issueId)
    .eq("user_id", session.session.user.id)
    .maybeSingle();

  if (!data) return;

  /* ========= Issue Page ========= */
  const proBtn = document.getElementById("btn-vote-pro");
  const conBtn = document.getElementById("btn-vote-con");

  if (proBtn && conBtn) {
    proBtn.disabled = true;
    conBtn.disabled = true;

    proBtn.classList.add("disabled");
    conBtn.classList.add("disabled");

    if (data.type === "pro") proBtn.innerText = "👍 투표 완료";
    if (data.type === "con") conBtn.innerText = "👎 투표 완료";

    const status = document.getElementById("vote-status-text");
    if (status) {
      status.innerText =
        data.type === "pro"
          ? "👍 찬성으로 투표하셨습니다."
          : "👎 반대로 투표하셨습니다.";
    }
  }

  /* ========= Shorts ========= */
  const shortsPro = document.getElementById("shortsPro");
  const shortsCon = document.getElementById("shortsCon");

  if (shortsPro && shortsCon) {
    shortsPro.classList.add("locked");
    shortsCon.classList.add("locked");

    if (data.type === "pro") shortsPro.classList.add("active-vote");
    if (data.type === "con") shortsCon.classList.add("active-vote");
  }
}

/* ==========================================================================
   Global Export (기존 호출부 유지)
========================================================================== */
window.GALLA_VOTE = vote;
window.GALLA_CHECK_VOTE = checkVoteStatus;
window.GALLA_LOAD_VOTE_STATS = loadVoteStats;