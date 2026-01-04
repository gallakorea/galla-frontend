// js/vote.core.js
console.log("[vote.core] loaded — PURE CORE MODE (patched)");

function resolveActiveIssueId(fallbackIssueId) {
  // 🔥 DOM 존재 여부 보지 말고 "모드"만 본다
  if (
    document.body.classList.contains("shorts-open") &&
    typeof window.__CURRENT_SHORT_ISSUE_ID__ === "number"
  ) {
    return window.__CURRENT_SHORT_ISSUE_ID__;
  }
  return fallbackIssueId;
}

function resolveVoteContainer(opts) {
  // 쇼츠 모드일 경우 shortsVoteBar 내부만 조작
  if (opts?.scope === "shorts") {
    return document.getElementById("shortsVoteBar");
  }
  // 기본은 문서 전체 (index / issue)
  return document;
}

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
  issueId = resolveActiveIssueId(issueId);
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
    console.warn("[VOTE][ACTION] session not ready");
    return null;
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
      const existing = await getMyVote(issueId);
      console.log("[VOTE][ACTION] already voted:", existing);
      console.log("[VOTE][ACTION] normalized return value:", existing);
      return existing;
    }
    console.error("[VOTE] insert error", error);
    console.log("[VOTE][ACTION] normalized return value:", null);
    return null;
  }

  const normalized = type === "pro" || type === "con" ? type : null;
  console.log("[VOTE][ACTION] normalized return value:", normalized);
  return normalized;
}

/* =========================
   GET MY VOTE
========================= */
async function getMyVote(issueId) {
  issueId = resolveActiveIssueId(issueId);
  if (!issueId) return null;

  const supabase = window.supabaseClient;
  if (!supabase) return null;

  const session = await waitForSessionGuaranteed();
  console.log("[VOTE][CHECK] session user_id:", session?.user?.id, "issueId:", issueId);
  if (!session) {
    console.warn("[VOTE][CHECK] session not ready");
    return null;
  }

  const { data } = await supabase
    .from("votes")
    .select("type")
    .eq("issue_id", issueId)
    .eq("user_id", session.user.id)
    .maybeSingle();
  console.log("[VOTE][CHECK] my vote row:", data);

  if (!data || !data.type) {
    console.log("[VOTE][CHECK] no vote for this user");
    console.log("[VOTE][CHECK] normalized result:", null);
    return null;
  }

  const normalized = data.type === "pro" || data.type === "con" ? data.type : null;
  console.log("[VOTE][CHECK] normalized result:", normalized);
  return normalized;
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
const __GALLA_ORIG_GET_MY_VOTE__ = getMyVote;
window.GALLA_CHECK_VOTE = async function(issueId, opts = {}) {
  const resolved = resolveActiveIssueId(issueId);
  const result = await __GALLA_ORIG_GET_MY_VOTE__(resolved);

  const container = resolveVoteContainer(opts);
  if (!container) {
    console.warn("[VOTE][UI] vote container not found");
    return result;
  }

  const proBtn = container.querySelector(".vote-btn.pro");
  const conBtn = container.querySelector(".vote-btn.con");

  if (!proBtn || !conBtn) {
    console.warn("[VOTE][UI] vote buttons missing in container");
    return result;
  }

  // 🔥 UI 초기화
  proBtn.classList.remove("active-vote");
  conBtn.classList.remove("active-vote");

  // 🔥 DB 결과 기준으로 UI 반영
  if (result === "pro") {
    proBtn.classList.add("active-vote");
  }
  if (result === "con") {
    conBtn.classList.add("active-vote");
  }

  return result;
};
window.GALLA_GET_VOTE_STATS = getVoteStats;