// js/vote.core.js
console.log("[vote.core] loaded — PURE CORE MODE (patched)");

let votingInProgress = false;

/* =========================
   SESSION
========================= */
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

/* =========================
   VOTE ACTION
========================= */
async function vote(issueId, type) {
  if (!issueId || votingInProgress) return;
  votingInProgress = true;

  const supabase = window.supabaseClient;
  if (!supabase) {
    votingInProgress = false;
    return;
  }

  const session = await waitForSessionGuaranteed();
  console.log("[VOTE][ACTION] session user_id:", session?.user?.id, "issueId:", issueId, "type:", type);
  if (!session) {
    votingInProgress = false;
    return "__SESSION_PENDING__";
  }

  const { error } = await supabase.from("votes").insert({
    issue_id: issueId,
    user_id: session.user.id,
    type
  });

  votingInProgress = false;

  // 이미 투표한 경우
  if (error) {
    if (error.code === "23505" || error.status === 409) {
      return await getMyVote(issueId);
    }
    console.error("[VOTE] insert error", error);
    return null;
  }

  return type;
}

/* =========================
   GET MY VOTE
========================= */
async function getMyVote(issueId) {
  if (!issueId) return null;

  const supabase = window.supabaseClient;
  if (!supabase) return null;

  const session = await waitForSessionGuaranteed();
  console.log("[VOTE][CHECK] session user_id:", session?.user?.id, "issueId:", issueId);
  if (!session) return "__SESSION_PENDING__";

  const { data } = await supabase
    .from("votes")
    .select("type")
    .eq("issue_id", issueId)
    .eq("user_id", session.user.id)
    .maybeSingle();
  console.log("[VOTE][CHECK] my vote row:", data);

  if (!data) {
    const { data: allVotes } = await supabase
      .from("votes")
      .select("user_id, type")
      .eq("issue_id", issueId);
    console.log("[VOTE][CHECK] all votes for issue:", allVotes);
    return "__NO_VOTE__";
  }
  return data.type;
}

/* =========================
   GET VOTE STATS
========================= */
async function getVoteStats(issueId) {
  if (!issueId) return null;

  const supabase = window.supabaseClient;
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("votes")
    .select("type")
    .eq("issue_id", issueId);

  if (error) {
    console.error("[VOTE] stats error", error);
    return null;
  }

  let pro = 0;
  let con = 0;

  data.forEach(v => {
    if (v.type === "pro") pro++;
    if (v.type === "con") con++;
  });

  const total = pro + con || 1;

  return {
    pro,
    con,
    proPercent: Math.round((pro / total) * 100),
    conPercent: 100 - Math.round((pro / total) * 100)
  };
}

/* =========================
   EXPORT
========================= */
window.GALLA_VOTE = vote;
window.GALLA_GET_MY_VOTE = getMyVote;
// 🔥 backward compatibility (issue / shorts expect this name)
window.GALLA_CHECK_VOTE = getMyVote;
window.GALLA_GET_VOTE_STATS = getVoteStats;