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
async function waitForSessionGuaranteed(timeout = 2000) {
  const supabase = window.supabaseClient;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const { data } = await supabase.auth.getSession();
    if (data?.session) return data.session;
    await new Promise(r => setTimeout(r, 100));
  }
  return null;
}

// 로그인 필요 안내 (중복 alert 방지)
let __voteLoginPrompted = false;
function promptLogin() {
  if (__voteLoginPrompted) return;
  __voteLoginPrompted = true;
  const go = confirm("로그인이 필요합니다. 로그인 페이지로 이동할까요?");
  if (go) location.href = "login.html";
  setTimeout(() => { __voteLoginPrompted = false; }, 500);
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
  if (!session) {
    votingInProgress = false;
    promptLogin();
    return null;
  }

  // 진영 확정(변경 불가): 이미 투표했으면 기존 진영을 그대로 반환(전환 금지).
  const already = await getMyVote(issueId);
  if (already === "pro" || already === "con") {
    votingInProgress = false;
    return already;
  }

  // 첫 투표만 insert. (issue_id,user_id) 유니크 + UPDATE 정책 제거로 서버단에서도 변경 차단.
  const { error } = await supabase.from("votes").insert({
    issue_id: issueId,
    user_id: session.user.id,
    type
  });

  votingInProgress = false;

  if (error) {
    // 23505 = 이미 투표(동시성) → 기존 진영 확정 반환
    if (error.code === "23505") {
      __votePrefetched.delete(Number(issueId));
      __voteCache.delete(Number(issueId));
      const cur = await getMyVote(issueId);
      return cur || null;
    }
    console.error("[VOTE] insert error", error);
    return null;
  }

  const normalized = type === "pro" || type === "con" ? type : null;
  // 캐시 갱신 (재조회 없이 즉시 반영)
  const idN = Number(resolveActiveIssueId(issueId));
  if (idN) { __votePrefetched.add(idN); if (normalized) __voteCache.set(idN, normalized); }
  return normalized;
}

/* =========================
   내 투표 캐시 (N+1 방지)
   - 피드/목록은 GALLA_PREFETCH_VOTES([ids])로 한 번에 조회 → 카드별 개별 쿼리 제거
   - prefetch된 id는 캐시에서 즉시 반환(무투표=null), 미prefetch id만 개별 조회 fallback
========================= */
const __voteCache = new Map();       // issueId(Number) → 'pro' | 'con'
const __votePrefetched = new Set();  // 배치로 이미 조회한 issueId

window.GALLA_PREFETCH_VOTES = async function (issueIds) {
  const supabase = window.supabaseClient;
  if (!supabase) return;
  const ids = [...new Set((issueIds || []).map(Number).filter(Boolean))];
  if (!ids.length) return;

  const session = await waitForSessionGuaranteed();
  ids.forEach(id => __votePrefetched.add(id));   // 세션 없어도 '무투표'로 확정
  if (!session) return;

  const { data, error } = await supabase
    .from("votes")
    .select("issue_id,type")
    .eq("user_id", session.user.id)
    .in("issue_id", ids);
  if (error) { console.error("[VOTE] prefetch error", error); return; }
  (data || []).forEach(v => {
    if (v.type === "pro" || v.type === "con") __voteCache.set(Number(v.issue_id), v.type);
  });
};

/* =========================
   GET MY VOTE (캐시 우선)
========================= */
async function getMyVote(issueId) {
  issueId = resolveActiveIssueId(issueId);
  if (!issueId) return null;

  // 배치 프리페치된 id는 추가 쿼리 없이 즉시 반환
  const idN = Number(issueId);
  if (__votePrefetched.has(idN)) return __voteCache.get(idN) || null;

  const supabase = window.supabaseClient;
  if (!supabase) return null;

  const session = await waitForSessionGuaranteed();
  if (!session) return null;

  const { data } = await supabase
    .from("votes")
    .select("type")
    .eq("issue_id", issueId)
    .eq("user_id", session.user.id)
    .maybeSingle();

  const normalized = data && (data.type === "pro" || data.type === "con") ? data.type : null;
  // 단건 조회 결과도 캐시에 반영
  __votePrefetched.add(idN);
  if (normalized) __voteCache.set(idN, normalized);
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