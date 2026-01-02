console.log("[vote.core] loaded");

let votingInProgress = false;

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

/* =====================
   VOTE ACTION
===================== */
async function vote(issueId, type) {
  if (!issueId || votingInProgress) return;
  votingInProgress = true;

  const session = await waitForSessionGuaranteed();
  if (!session) {
    votingInProgress = false;
    return;
  }

  const supabase = window.supabaseClient;
  const userId = session.user.id;

  const { error } = await supabase.from("votes").insert({
    issue_id: issueId,
    user_id: userId,
    type
  });

  votingInProgress = false;

  if (error) return;

  await checkVoteStatus(issueId);
}

/* =====================
   GET MY VOTE
===================== */
async function getMyVote(issueId) {
  const session = await waitForSessionGuaranteed();
  if (!session) return null;

  const { data } = await window.supabaseClient
    .from("votes")
    .select("type")
    .eq("issue_id", issueId)
    .eq("user_id", session.user.id)
    .maybeSingle();

  return data?.type ?? null;
}

/* =====================
   SYNC UI (핵심)
===================== */
async function checkVoteStatus(issueId) {
  const type = await getMyVote(issueId);

  const activeIssueId = window.__CURRENT_SHORT_ISSUE_ID__;
  if (Number(activeIssueId) !== Number(issueId)) return type;

  const shortEl = document.querySelector(
    `.short[data-issue-id="${issueId}"]`
  );
  if (!shortEl) return type;

  const proBtn = shortEl.querySelector(".vote-btn.pro");
  const conBtn = shortEl.querySelector(".vote-btn.con");
  if (!proBtn || !conBtn) return type;

  proBtn.disabled = false;
  conBtn.disabled = false;
  proBtn.classList.remove("active-vote");
  conBtn.classList.remove("active-vote");
  proBtn.textContent = "👍 찬성이오";
  conBtn.textContent = "👎 난 반댈세";

  if (type === "pro") {
    proBtn.disabled = true;
    conBtn.disabled = true;
    proBtn.classList.add("active-vote");
    proBtn.textContent = "👍 투표 완료";
  }

  if (type === "con") {
    proBtn.disabled = true;
    conBtn.disabled = true;
    conBtn.classList.add("active-vote");
    conBtn.textContent = "👎 투표 완료";
  }

  return type;
}

/* =====================
   EXPORT
===================== */
window.GALLA_VOTE = vote;
window.GALLA_GET_MY_VOTE = getMyVote;
window.GALLA_CHECK_VOTE = checkVoteStatus;