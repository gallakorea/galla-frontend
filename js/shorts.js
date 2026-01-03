/* 🔥 GLOBAL SHORTS API (MUST BE FIRST)
   - index.js 에서 window.openShorts(list, startId) 를 호출한다.
   - shorts.js 는 항상 로드되어 있어야 하므로, 파일 전체 return 금지.
*/
window.openShorts = function (list, startId) {
  if (typeof window.__OPEN_SHORTS_INTERNAL__ === "function") {
    window.__OPEN_SHORTS_INTERNAL__(list, startId);
  } else {
    console.error("[SHORTS] internal opener not ready");
  }
};

// ✅ vote-core 준비 대기 (세션 + 함수)
async function waitForVoteReady(timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      if (window.supabaseClient && typeof window.GALLA_CHECK_VOTE === "function") {
        const { data } = await window.supabaseClient.auth.getSession();
        if (data?.session) return true;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

/* =========================
   VOTE UI HELPERS
========================= */
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
  } else if (result === "con") {
    proBtn.disabled = true;
    conBtn.disabled = true;
    conBtn.classList.add("active-vote");
    conBtn.textContent = "👎 투표 완료";
  }
}

async function syncVoteForIssue(issueId) {
  const ready = await waitForVoteReady();
  if (!ready) return;

  const raw = await window.GALLA_CHECK_VOTE(issueId, { force: true });
  const result = raw === "pro" || raw === "con" ? raw : null;

  const wrap = document.querySelector(`.short[data-issue-id="${issueId}"]`);
  if (!wrap) return;

  // 1) 일단 버튼을 풀어준다 (초기 disable 해제)
  wrap.querySelectorAll(".vote-btn").forEach((b) => {
    b.disabled = false;
  });

  // 2) UI reset 후 결과 반영
  applyShortVoteUI(wrap, null);
  if (result) applyShortVoteUI(wrap, result);

  console.log("[SHORTS][FORCE_SYNC]", { issueId, result });
}

/* shorts.js — TRUE Reels / Shorts (HARD SNAP + SINGLE AUDIO)
   - observer / wheel / keydown / click 은 shorts 페이지에서만 동작
*/
(function () {
  // NOTE:
  // Shorts는 별도 페이지가 아니라 index 등 다른 페이지 위에 "오버레이"로 열릴 수 있음.
  // 따라서 body dataset(page)로 가드하면 이벤트/observer가 죽는다.
  // 아래 헬퍼로 "오버레이가 열려있는지"를 기준으로만 가드한다.
  let overlay = null;
  let observer = null;
  let currentIndex = -1;

  function isOverlayOpen() {
    return !!(overlay && overlay.hidden === false && overlay.style.display !== "none");
  }

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

  /* =========================
     OBSERVER (CORE)
  ========================= */
  function getMostVisibleEntry(entries) {
    let best = null;
    let maxRatio = 0;
    entries.forEach((e) => {
      if (e.intersectionRatio > maxRatio) {
        maxRatio = e.intersectionRatio;
        best = e;
      }
    });
    return best;
  }

  function setupObserver() {
    if (!overlay) return;
    if (!isOverlayOpen()) return;

    if (observer) observer.disconnect();

    observer = new IntersectionObserver(
      (entries) => {
        if (!isOverlayOpen()) return;
        const best = getMostVisibleEntry(entries);
        if (!best) return;
        if (best.intersectionRatio < 0.6) return;

        const idx = Number(best.target.dataset.index);
        const issueId = Number(best.target.dataset.issueId);

        window.__CURRENT_SHORT_INDEX__ = idx;
        window.__CURRENT_SHORT_ISSUE_ID__ = issueId;
        window.__GALLA_SHORTS_STATE__.currentIndex = idx;

        playOnly(idx);

        // ✅ 활성 쇼츠마다 강제 동기화
        syncVoteForIssue(issueId);
      },
      { root: null, threshold: [0.25, 0.5, 0.6, 0.75, 0.9] }
    );

    overlay.querySelectorAll(".short").forEach((el) => observer.observe(el));
  }

  /* =========================
     OPEN SHORTS
  ========================= */
  async function __openShortsInternal(list, startId) {
    overlay = qs("shortsOverlay");
    if (!overlay) {
      console.error("[SHORTS] overlay missing");
      return;
    }

    overlay.innerHTML = "";
    overlay.hidden = false;
    overlay.style.display = "block";
    overlay.scrollTop = 0;

    // 오버레이 오픈 플래그 + 터치/스크롤 제스처 허용
    overlay.dataset.open = "1";
    overlay.style.touchAction = "pan-y";

    // 이벤트로 캐시 리셋 신호
    window.dispatchEvent(new Event("shorts:opened"));

    document.body.style.overflow = "hidden";

    const shorts = (list || []).filter((v) => v && v.video_url);
    if (!shorts.length) return;

    shorts.forEach((item, i) => {
      const wrap = document.createElement("section");
      wrap.className = "short";
      wrap.dataset.index = i;
      wrap.dataset.issueId = item.id;
      wrap.setAttribute("data-issue-id", item.id);

      const video = document.createElement("video");
      video.src = item.video_url;
      video.playsInline = true;
      video.preload = "auto";
      video.loop = true;
      video.muted = true;

      // ✅ vote bar 클래스는 반드시 shorts-vote 로 통일
      const voteBar = document.createElement("div");
      voteBar.className = "shorts-vote";
      // 버튼 위에서 스와이프/스크롤이 죽지 않도록
      voteBar.style.touchAction = "pan-y";

      const btnPro = document.createElement("button");
      btnPro.className = "vote-btn pro";
      btnPro.dataset.issueId = item.id;
      btnPro.textContent = "👍 찬성이오";
      btnPro.style.touchAction = "manipulation";

      const btnCon = document.createElement("button");
      btnCon.className = "vote-btn con";
      btnCon.dataset.issueId = item.id;
      btnCon.textContent = "👎 난 반댈세";
      btnCon.style.touchAction = "manipulation";

      voteBar.appendChild(btnPro);
      voteBar.appendChild(btnCon);

      wrap.appendChild(video);
      wrap.appendChild(voteBar);
      overlay.appendChild(wrap);
    });

    const found = shorts.findIndex((v) => Number(v.id) === Number(startId));
    const startIndex = found >= 0 ? found : 0;

    const firstIssueId = Number(shorts[startIndex].id);
    window.__CURRENT_SHORT_ISSUE_ID__ = firstIssueId;

    requestAnimationFrame(() => {
      overlay.scrollTo({ top: startIndex * window.innerHeight, behavior: "instant" });
      setupObserver();
      playOnly(startIndex);

      // ✅ 최초 진입 동기화 (여기가 가장 중요)
      syncVoteForIssue(firstIssueId);
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
      overlay.dataset.open = "0";
      overlay.hidden = true;
      overlay.style.display = "none";
      overlay.innerHTML = "";
    }

    document.body.style.overflow = "";
  }

  /* =========================
     KEYBOARD (DESKTOP)
  ========================= */
  window.addEventListener("keydown", (e) => {
    if (!overlay || overlay.hidden) return;

    if (e.key === "ArrowDown") overlay.scrollBy({ top: window.innerHeight, behavior: "smooth" });
    if (e.key === "ArrowUp") overlay.scrollBy({ top: -window.innerHeight, behavior: "smooth" });
    if (e.key === "Escape") closeShorts();
  });

  /* =========================
     WHEEL (DESKTOP)
  ========================= */
  let wheelAccum = 0;
  let wheelTimer = null;

  window.addEventListener(
    "wheel",
    (e) => {
      if (!overlay || overlay.hidden) return;

      wheelAccum += e.deltaY;
      if (wheelTimer) return;

      wheelTimer = setTimeout(() => {
        const dir = wheelAccum > 0 ? 1 : -1;
        wheelAccum = 0;
        wheelTimer = null;

        overlay.scrollBy({ top: dir * window.innerHeight, behavior: "smooth" });
      }, 120);
    },
    { passive: true }
  );

  /* =========================
     VOTE (DB SYNC)
  ========================= */
  document.addEventListener("click", async (e) => {
    if (!isOverlayOpen()) return;

    const btn = e.target.closest(".shorts-vote .vote-btn");
    // 클릭이 다른 핸들러(카드 클릭 등)로 전파되지 않게
    if (btn) e.stopPropagation();
    if (!btn) return;

    // ✅ 클릭 즉시 반응이 없었던 이유: selector 불일치 / disabled / 가드
    if (btn.disabled) return;

    const issueId = Number(btn.dataset.issueId);
    if (!issueId) return;

    // 이미 투표 있으면 UI만 반영
    if (typeof window.GALLA_CHECK_VOTE === "function") {
      const existing = await window.GALLA_CHECK_VOTE(issueId, { force: true });
      if (existing === "pro" || existing === "con") {
        await syncVoteForIssue(issueId);
        return;
      }
    }

    const type = btn.classList.contains("pro") ? "pro" : "con";

    if (typeof window.GALLA_VOTE !== "function") {
      console.error("[SHORTS] GALLA_VOTE not found");
      return;
    }

    await window.GALLA_VOTE(issueId, type);
    await syncVoteForIssue(issueId);
  });

  /* =========================
     EXPORT + EVENTS
  ========================= */
  window.__OPEN_SHORTS_INTERNAL__ = __openShortsInternal;
  window.closeShorts = closeShorts;

  window.addEventListener("shorts:opened", () => {
    // vote-core UI 캐시 리셋
    window.__GALLA_LAST_VOTE_APPLY__ = null;
    window.__GALLA_LAST_VOTE_ISSUE__ = null;
    window.__GALLA_LAST_VOTE_PAGE__ = "shorts";
    console.log("[SHORTS] vote-core cache reset (force sync)");

    if (window.__CURRENT_SHORT_ISSUE_ID__) {
      syncVoteForIssue(window.__CURRENT_SHORT_ISSUE_ID__);
    }
  });
})();

// 🔥 현재 활성 쇼츠 index 외부 노출 (vote.core.js용)
window.__GALLA_SHORTS_STATE__ = window.__GALLA_SHORTS_STATE__ || { currentIndex: -1 };