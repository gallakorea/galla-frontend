/* 🔥 GLOBAL SHORTS API (MUST BE FIRST) */
window.openShorts = function(list, startId) {
  if (typeof window.__OPEN_SHORTS_INTERNAL__ === "function") {
    window.__OPEN_SHORTS_INTERNAL__(list, startId);
  } else {
    console.error("[SHORTS] internal opener not ready");
  }
};
// Wait for session and GALLA_CHECK_VOTE to be ready
async function waitForVoteReady(timeout = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (window.supabaseClient && typeof window.GALLA_CHECK_VOTE === "function") {
      const { data } = await window.supabaseClient.auth.getSession();
      if (data?.session) return true;
    }
    await new Promise(r => setTimeout(r, 100));
  }
  return false;
}
(async function syncVoteForIssue(issueId) {
  const ready = await waitForVoteReady();
  if (!ready) return;

  const raw = await window.GALLA_CHECK_VOTE(issueId, { force: true });
  const result = raw === "pro" || raw === "con" ? raw : null;

  const wrap = document.querySelector(
    `.short[data-issue-id="${issueId}"]`
  );
  if (!wrap) return;

  // reset UI
  applyShortVoteUI(wrap, null);

  // 반드시 버튼 활성화
  wrap.querySelectorAll(".vote-btn").forEach(b => {
    b.disabled = false;
  });

  // 실제 투표 반영
  if (result) {
    applyShortVoteUI(wrap, result);
  }

  console.log("[SHORTS][FORCE_SYNC]", { issueId, result });
})

/* shorts.js — TRUE Reels / Shorts (HARD SNAP + SINGLE AUDIO) */
(function () {
  const isShortsPage = document.body?.dataset?.page === "shorts";

  const page = document.body?.dataset?.page;

  // ❌ 함수 정의는 막지 말고
  // ⛔ observer / 이벤트만 shorts 페이지에서만 동작

  let overlay = null;
  let observer = null;
  let currentIndex = -1;
  let currentIssueId = null;

/* =========================
   UTILS
========================= */
function qs(id) {
  return document.getElementById(id);
}

function hardPauseAll(exceptIndex = null) {
  document.querySelectorAll(".short video").forEach((v, i) => {
    if (i === exceptIndex) return;
    try {
      v.pause();
      v.currentTime = 0;
      v.muted = true;
    } catch {}
  });
}

function playOnly(index) {
  if (!overlay) return;
  if (currentIndex === index) return;

  const wrap = overlay.querySelector(`.short[data-index="${index}"]`);
  if (!wrap) return;

  const video = wrap.querySelector("video");
  if (!video) return;

  currentIndex = index;
  window.__GALLA_SHORTS_STATE__.currentIndex = index;

  hardPauseAll(index);

  video.muted = true;
  video.currentTime = 0;

  const p = video.play();
  if (p && typeof p.then === "function") {
    p.then(() => {
      video.muted = false;
    }).catch(() => {});
  }
}

function applyShortVoteUI(wrap, result) {
  if (!wrap) return;
  const proBtn = wrap.querySelector(".vote-btn.pro");
  const conBtn = wrap.querySelector(".vote-btn.con");
  if (!proBtn || !conBtn) return;

  // reset
  proBtn.disabled = false;
  conBtn.disabled = false;
  proBtn.classList.remove("active-vote");
  conBtn.classList.remove("active-vote");
  proBtn.textContent = "👍 찬성이오";
  conBtn.textContent = "👎 난 반댈세";

  if (result === "pro") {
    proBtn.disabled = true;
    conBtn.disabled = true;
    proBtn.classList.add("active-vote");
    proBtn.textContent = "👍 투표 완료";
  }
  if (result === "con") {
    proBtn.disabled = true;
    conBtn.disabled = true;
    conBtn.classList.add("active-vote");
    conBtn.textContent = "👎 투표 완료";
  }
}

/* =========================
   OBSERVER (CORE)
========================= */
function getMostVisibleEntry(entries) {
  let best = null;
  let maxRatio = 0;
  entries.forEach(e => {
    if (e.intersectionRatio > maxRatio) {
      maxRatio = e.intersectionRatio;
      best = e;
    }
  });
  return best;
}

function setupObserver() {
  if (!isShortsPage) return;
  if (observer) observer.disconnect();

  observer = new IntersectionObserver(
    entries => {
      if (!isShortsPage) return;
      const best = getMostVisibleEntry(entries);
      if (!best) return;

      if (best.intersectionRatio < 0.6) return;

      const idx = Number(best.target.dataset.index);
      const issueId = Number(best.target.dataset.issueId);

      window.__CURRENT_SHORT_ISSUE_ID__ = issueId; // ✅ 이 줄 추가
      
      window.__CURRENT_SHORT_INDEX__ = idx;
      window.__GALLA_SHORTS_STATE__.currentIndex = idx;

    currentIssueId = issueId;
    window.__CURRENT_SHORT_ISSUE_ID__ = issueId;
    playOnly(idx);

    // 🔥 ALWAYS re-sync vote state when this short becomes active
    syncVoteForIssue(issueId);

    },
    {
      root: null,
      threshold: [0.25, 0.5, 0.6, 0.75, 0.9]
    }
  );

  overlay.querySelectorAll(".short").forEach(el => observer.observe(el));
}

/* =========================
   OPEN SHORTS
========================= */
function __openShortsInternal(list, startId) {
  overlay = qs("shortsOverlay");
  if (!overlay) {
    console.error("[SHORTS] overlay missing");
    return;
  }

  overlay.innerHTML = "";
  overlay.hidden = false;
  window.dispatchEvent(new Event("shorts:opened"));
  overlay.style.display = "block";
  overlay.scrollTop = 0;

  document.body.style.overflow = "hidden";

  const shorts = list.filter(v => v && v.video_url);
  if (!shorts.length) return;

  shorts.forEach((item, i) => {
    const wrap = document.createElement("section");
    wrap.className = "short";
    wrap.dataset.index = i;
    wrap.dataset.issueId = item.id;      // JS용
    wrap.setAttribute("data-issue-id", item.id); // 🔥 DOM selector용

    const video = document.createElement("video");
    video.src = item.video_url;
    video.playsInline = true;
    video.preload = "auto";
    video.loop = true;
    video.muted = true;

    /* ===== VOTE BAR (ABOVE NAV) ===== */
    const voteBar = document.createElement("div");
    voteBar.className = "shorts-vote";

    const btnPro = document.createElement("button");
    btnPro.className = "vote-btn pro";
    btnPro.dataset.issueId = item.id;
    btnPro.textContent = "👍 찬성이오";
    btnPro.disabled = true; // 🔒 disable until initial vote sync

    const btnCon = document.createElement("button");
    btnCon.className = "vote-btn con";
    btnCon.dataset.issueId = item.id;
    btnCon.textContent = "👎 난 반댈세";
    btnCon.disabled = true; // 🔒 disable until initial vote sync

    voteBar.appendChild(btnPro);
    voteBar.appendChild(btnCon);

    wrap.appendChild(video);
    wrap.appendChild(voteBar);
    overlay.appendChild(wrap);

  });

  const startIndex =
    shorts.findIndex(v => Number(v.id) === Number(startId)) >= 0
      ? shorts.findIndex(v => Number(v.id) === Number(startId))
      : 0;

  const firstIssueId = Number(shorts[startIndex].id);
  window.__CURRENT_SHORT_ISSUE_ID__ = firstIssueId; // 🔥 필수


  requestAnimationFrame(() => {
    (async () => {
      overlay.scrollTo({
        top: startIndex * window.innerHeight,
        behavior: "instant"
      });

      setupObserver();
      playOnly(startIndex);

      const firstShort = overlay.querySelector(
        `.short[data-index="${startIndex}"]`
      );
      if (!firstShort) return;
      const issueId = Number(firstShort.dataset.issueId);
      if (!issueId) return;

      await syncVoteForIssue(issueId);
    })();
  });

}

/* =========================
   CLOSE SHORTS
========================= */
function closeShorts() {
  hardPauseAll();
  currentIndex = -1;

  if (observer) observer.disconnect();

  if (overlay) {
    overlay.hidden = true;
    overlay.style.display = "none";
    overlay.innerHTML = "";
  }

  document.body.style.overflow = "";
}

/* =========================
   KEYBOARD (DESKTOP)
========================= */

window.addEventListener("keydown", e => {
  if (!isShortsPage) return;
  if (!overlay || overlay.hidden) return;

  if (e.key === "ArrowDown") {
    overlay.scrollBy({ top: window.innerHeight, behavior: "smooth" });
  }
  if (e.key === "ArrowUp") {
    overlay.scrollBy({ top: -window.innerHeight, behavior: "smooth" });
  }
  if (e.key === "Escape") {
    closeShorts();
  }
});

/* =========================
   WHEEL (DESKTOP — SMOOTH SNAP)
========================= */
let wheelAccum = 0;
let wheelTimer = null;

window.addEventListener("wheel", e => {
  if (!isShortsPage) return;
  if (!overlay || overlay.hidden) return;

  // 기본 스크롤 허용 (자연스러운 감속)
  wheelAccum += e.deltaY;

  if (wheelTimer) return;

  wheelTimer = setTimeout(() => {
    const dir = wheelAccum > 0 ? 1 : -1;
    wheelAccum = 0;
    wheelTimer = null;

    overlay.scrollBy({
      top: dir * window.innerHeight,
      behavior: "smooth"
    });
  }, 120);
}, { passive: true });

/* =========================
   VOTE (DB SYNC)
========================= */

/* 클릭 이벤트 (단일 바) */
document.addEventListener("click", async e => {
  const btn = e.target.closest(".shorts-vote .vote-btn");
  if (!btn || btn.disabled) return;

  // 🔥 버튼 기준으로 issueId를 직접 사용 (observer 의존 제거)
  const issueId = Number(btn.dataset.issueId);
  if (!issueId) return;

  // 🔥 Shorts must ignore cached index/issue state
  if (typeof window.GALLA_CHECK_VOTE === "function") {
    const existing = await window.GALLA_CHECK_VOTE(issueId, { force: true });
    if (existing === "pro" || existing === "con") {
      await syncVoteForIssue(issueId);
      return;
    }
  }

  const type = btn.classList.contains("pro") ? "pro" : "con";
  await window.GALLA_VOTE(issueId, type);
  await syncVoteForIssue(issueId);
});

/* =========================
   EXPORT
========================= */
window.__OPEN_SHORTS_INTERNAL__ = __openShortsInternal;
// 🔥 Shorts opened → invalidate any previous vote-core UI cache
window.addEventListener("shorts:opened", () => {
  // vote-core UI 적용 캐시 전면 리셋
  window.__GALLA_LAST_VOTE_APPLY__ = null;
  window.__GALLA_LAST_VOTE_ISSUE__ = null;
  window.__GALLA_LAST_VOTE_PAGE__ = "shorts";
  console.log("[SHORTS] vote-core cache reset (force sync)");
  if (window.__CURRENT_SHORT_ISSUE_ID__) {
    syncVoteForIssue(window.__CURRENT_SHORT_ISSUE_ID__);
  }
});
window.closeShorts = closeShorts;

})();

// 🔥 현재 활성 쇼츠 index 외부 노출 (vote.core.js용)
window.__GALLA_SHORTS_STATE__ = {
  currentIndex: -1
};