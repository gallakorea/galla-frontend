/* =========================================================
   GALLA VOTE CORE — GLOBAL (ISSUE / INDEX / SHORTS)
========================================================= */

console.log("[vote.core] loaded");

let votingInProgress = false;

/* =========================================================
   SESSION GUARANTEE
========================================================= */
async function waitForSessionGuaranteed(timeout = 5000) {
  const supabase = window.supabaseClient;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const { data } = await supabase.auth.getSession();
    if (data?.session) return data.session;
    await new Promise(r => setTimeout(r, 100));
  }
  return null;
}

/* =========================================================
   VOTE ACTION (INSERT)
========================================================= */
async function vote(issueId, type) {
  if (!issueId || votingInProgress) return;
  votingInProgress = true;

  const supabase = window.supabaseClient;
  if (!supabase) {
    votingInProgress = false;
    return;
  }

  const session = await waitForSessionGuaranteed();
  if (!session) {
    votingInProgress = false;
    return "__SESSION_PENDING__";
  }

  const userId = session.user.id;

  const { error } = await supabase.from("votes").insert({
    issue_id: issueId,
    user_id: userId,
    type
  });

  votingInProgress = false;

  // 이미 투표됨
  if (error) {
    if (error.code === "23505" || error.status === 409) {
      await checkVoteStatus(issueId);
      return;
    }
    console.error("[VOTE] insert error", error);
    return;
  }

  await loadVoteStats(issueId);
  await checkVoteStatus(issueId);
}

/* =========================================================
   STATS (PERCENT BAR)
========================================================= */
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

/* =========================================================
   CHECK MY VOTE + UI SYNC
========================================================= */
async function checkVoteStatus(issueId) {
  if (!issueId) return null;

  const supabase = window.supabaseClient;
  if (!supabase) return null;

  const session = await waitForSessionGuaranteed();
  if (!session) return "__SESSION_PENDING__";

  const { data } = await supabase
    .from("votes")
    .select("type")
    .eq("issue_id", issueId)
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (!data) {
    syncShortsVoteUI(null);
    return "__NO_VOTE__";
  }

  /* =========================
     ISSUE PAGE
  ========================= */
  {
    const proBtn = document.getElementById("btn-vote-pro");
    const conBtn = document.getElementById("btn-vote-con");

    if (proBtn && conBtn) {
      proBtn.disabled = true;
      conBtn.disabled = true;
      proBtn.classList.add("disabled");
      conBtn.classList.add("disabled");

      if (data.type === "pro") proBtn.innerText = "👍 투표 완료";
      if (data.type === "con") conBtn.innerText = "👎 투표 완료";
    }
  }

  /* =========================
     INDEX CARDS
  ========================= */
  document.querySelectorAll(`.card[data-id="${issueId}"]`).forEach(card => {
    const proBtn = card.querySelector(".btn-pro");
    const conBtn = card.querySelector(".btn-con");
    if (!proBtn || !conBtn) return;

    proBtn.disabled = true;
    conBtn.disabled = true;
    proBtn.classList.toggle("active-vote", data.type === "pro");
    conBtn.classList.toggle("active-vote", data.type === "con");
  });

  /* =========================
     SHORTS (SINGLE FIXED BAR)
  ========================= */
  syncShortsVoteUI(data.type);

  return data.type;
}

/* =========================================================
   SHORTS VOTE BAR SYNC (단일)
========================================================= */
function syncShortsVoteUI(type) {
  const bar = document.querySelector(".shorts-vote");
  if (!bar) return;

  const proBtn = bar.querySelector(".vote-btn.pro");
  const conBtn = bar.querySelector(".vote-btn.con");
  if (!proBtn || !conBtn) return;

  proBtn.disabled = false;
  conBtn.disabled = false;
  proBtn.classList.remove("active-vote");
  conBtn.classList.remove("active-vote");
  proBtn.innerText = "👍 찬성이오";
  conBtn.innerText = "👎 난 반댈세";

  if (!type) return;

  proBtn.disabled = true;
  conBtn.disabled = true;

  if (type === "pro") {
    proBtn.classList.add("active-vote");
    proBtn.innerText = "👍 투표 완료";
  }

  if (type === "con") {
    conBtn.classList.add("active-vote");
    conBtn.innerText = "👎 투표 완료";
  }
}

/* =========================================================
   EXPORT
========================================================= */
window.GALLA_VOTE = vote;
window.GALLA_CHECK_VOTE = checkVoteStatus;
window.GALLA_LOAD_VOTE_STATS = loadVoteStats;