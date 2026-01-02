// js/vote.core.js
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

  let session = null;
  for (let i = 0; i < 10; i++) {
    const res = await supabase.auth.getSession();
    if (res.data && res.data.session) {
      session = res.data.session;
      break;
    }
    await new Promise(r => setTimeout(r, 100));
  }
  if (!session) {
    votingInProgress = false;
    return "__SESSION_PENDING__";
  }

  const userId = session.user.id;

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
  await loadVoteStats(issueId);   // 🔧 퍼센트/바 즉시 갱신
  await checkVoteStatus(issueId);

  // 댓글 전장 재초기화 (이슈 페이지에서만 실행)
  if (document.body?.dataset?.page === "issue") {
    import("./issue.comments.js").then(m => {
      if (typeof m.initCommentSystem === "function") {
        m.initCommentSystem(issueId);
      }
    });
  }
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
  if (!issueId) return null;

  const supabase = window.supabaseClient;
  if (!supabase) return null;

  const session = await waitForSessionGuaranteed();
  if (!session) {
    return "__SESSION_PENDING__";
  }

  const { data } = await supabase
    .from("votes")
    .select("type")
    .eq("issue_id", issueId)
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (!data) return "__NO_VOTE__";

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

  
/* ========= Shorts (ACTIVE SHORT ONLY) ========= */
  const activeShort = document.querySelector(
    `.short[data-issue-id="${issueId}"]:not([hidden])`
  );

  if (activeShort) {
    const proBtn = activeShort.querySelector('.shorts-vote .vote-btn.pro');
    const conBtn = activeShort.querySelector('.shorts-vote .vote-btn.con');

    if (proBtn && conBtn) {
      proBtn.disabled = true;
      conBtn.disabled = true;

      proBtn.classList.add("locked");
      conBtn.classList.add("locked");

      proBtn.classList.remove("active-vote");
      conBtn.classList.remove("active-vote");

      if (data.type === "pro") {
        proBtn.classList.add("active-vote");
        proBtn.innerText = "👍 투표 완료";
      }

      if (data.type === "con") {
        conBtn.classList.add("active-vote");
        conBtn.innerText = "👎 투표 완료";
      }
    }
  }

  /* ========= Index Cards ========= */
  document
    .querySelectorAll(`.card[data-id="${issueId}"]`)
    .forEach(card => {
      const proBtn = card.querySelector('.btn-pro');
      const conBtn = card.querySelector('.btn-con');

      if (!proBtn || !conBtn) return;

      // 공통 잠금
      proBtn.disabled = true;
      conBtn.disabled = true;

      proBtn.classList.remove('active-vote');
      conBtn.classList.remove('active-vote');

      if (data.type === 'pro') {
        proBtn.classList.add('active-vote');
      }

      if (data.type === 'con') {
        conBtn.classList.add('active-vote');
      }
    });
  return data?.type || "__NO_VOTE__";
}

/* ==========================================================================
   Global Export (기존 호출부 유지)
========================================================================== */
window.GALLA_VOTE = vote;
window.GALLA_CHECK_VOTE = checkVoteStatus;
window.GALLA_LOAD_VOTE_STATS = loadVoteStats;

/* ==========================================================================
   🔥 MOBILE SESSION RECOVERY FIX
   세션이 늦게 복원되는 모바일 환경에서 투표 UI 재동기화
========================================================================== */
if (window.supabaseClient && !window.__GALLA_AUTH_WATCHER__) {
  window.__GALLA_AUTH_WATCHER__ = true;

  window.supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    if (!session) return;

    // 현재 컨텍스트에서 issue id 추론 (issue / index / shorts 공통)
    const issueId =
      window.currentIssue?.id ||
      document.body?.dataset?.issueId ||
      document.querySelector('.card[data-id]')?.dataset?.id;

    if (!issueId) return;

    try {
      await window.GALLA_CHECK_VOTE(Number(issueId));
    } catch (e) {
      console.error('[VOTE] auth recovery sync error', e);
    }
  });
}

// ==========================================================================
// 🔥 FORCE RE-SYNC ON PAGE LOAD / VISIBILITY RESTORE (MOBILE CRITICAL)
// ==========================================================================
async function forceVoteResync() {
  // 🔥 Shorts / Issue 단일 컨텍스트
  if (window.currentIssue?.id || document.body?.dataset?.issueId) {
    const issueId =
      window.currentIssue?.id ||
      document.body?.dataset?.issueId;

    if (!issueId) return;

    try {
      await window.GALLA_CHECK_VOTE(Number(issueId));
    } catch (e) {
      console.error("[VOTE] force resync error", e);
    }
    return;
  }

  // 🔥 Index: 모든 카드에 대해 투표 상태 재동기화
  const cards = document.querySelectorAll('.card[data-id]');
  if (!cards.length) return;

  for (const card of cards) {
    const id = Number(card.dataset.id);
    if (!id) continue;

    try {
      await window.GALLA_CHECK_VOTE(id);
    } catch (e) {
      console.error("[VOTE] index resync error", e);
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  setTimeout(forceVoteResync, 0);
  setTimeout(forceVoteResync, 800); // 🔥 모바일 세션 복원 지연 대응
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    setTimeout(forceVoteResync, 0);
  }
});