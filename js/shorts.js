/* 🔥 GLOBAL SHORTS API (MUST BE FIRST)
   - index.js 에서 window.openShorts(list, startId) 를 호출한다.
   - shorts.js 는 항상 로드되어 있어야 하므로, 파일 전체 return 금지.
*/

/** 내부 오프너 준비될 때까지 자체 재시도 (핵심) */
window.openShorts = function (list, startId) {
  const tryOpen = (retry = 0) => {
    if (typeof window.__OPEN_SHORTS_INTERNAL__ === "function") {
      window.__OPEN_SHORTS_INTERNAL__(list, startId);
      return;
    }
    if (retry >= 60) {
      console.error("[SHORTS] internal opener not ready (timeout)");
      return;
    }
    setTimeout(() => tryOpen(retry + 1), 50);
  };
  tryOpen();
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

/** vote-core 반환값 표준화: "pro"/"con" 또는 {type:"pro|con"} 모두 지원 */
function normalizeVoteResult(raw) {
  if (raw === "pro" || raw === "con") return raw;
  if (raw && typeof raw === "object") {
    const t = raw.type || raw.vote || raw.stance;
    if (t === "pro" || t === "con") return t;
  }
  return null;
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

  // vote-core가 object를 줄 수도 있으니 normalize 필수
  const raw = await window.GALLA_CHECK_VOTE(issueId, { force: true });
  const result = normalizeVoteResult(raw);

  const wrap = document.querySelector(`.short[data-issue-id="${issueId}"]`);
  if (!wrap) return;

  // 1) 일단 버튼을 풀어준다 (초기 disable 해제)
  wrap.querySelectorAll(".vote-btn").forEach((b) => (b.disabled = false));

  // 2) UI reset 후 결과 반영
  applyShortVoteUI(wrap, null);
  if (result) applyShortVoteUI(wrap, result);

  console.log("[SHORTS][FORCE_SYNC]", { issueId, result });
}

/* shorts.js — TRUE Reels / Shorts (HARD SNAP + SINGLE AUDIO)
   - observer / wheel / keydown / click 은 "오버레이 열림" 상태에서만 동작
*/
(function () {
  let overlay = null;
  let observer = null;
  let currentIndex = -1;

  // 🔥 오버레이 열림 여부 기준 (index 위 오버레이 구조 대응)
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

    if (observer) observer.disconnect();

    observer = new IntersectionObserver(
      (entries) => {
        if (!isOverlayOpen()) return;

        const best = getMostVisibleEntry(entries);
        if (!best) return;
        if (best.intersectionRatio < 0.6) return;

        const idx = Number(best.target.dataset.index);
        const issueId = Number(best.target.dataset.issueId || best.target.getAttribute("data-issue-id"));

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
    overlay.style.overflowY = "scroll";
    overlay.style.touchAction = "pan-y";
    overlay.scrollTop = 0;

    overlay.dataset.open = "1";

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

      // ✅ vote bar
      const voteBar = document.createElement("div");
      voteBar.className = "shorts-vote";
      voteBar.style.touchAction = "pan-y";

      const btnPro = document.createElement("button");
      btnPro.className = "vote-btn pro";
      btnPro.dataset.issueId = item.id;
      btnPro.dataset.type = "pro"; // ✅ vote-core 호환/오판 방지
      btnPro.textContent = "👍 찬성이오";
      btnPro.style.touchAction = "manipulation";

      const btnCon = document.createElement("button");
      btnCon.className = "vote-btn con";
      btnCon.dataset.issueId = item.id;
      btnCon.dataset.type = "con"; // ✅ vote-core 호환/오판 방지
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

      // ✅ 최초 진입 동기화
      setTimeout(() => syncVoteForIssue(firstIssueId), 0);
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
    if (!isOverlayOpen()) return;

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
      if (!isOverlayOpen()) return;

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
     - 캡처 단계에서 stopImmediatePropagation()으로 vote-core 충돌 차단
  ========================= */
  document.addEventListener(
    "click",
    async (e) => {
      if (!isOverlayOpen()) return;

      const btn = e.target.closest(".shorts-vote .vote-btn");
      if (!btn) return;

      // ✅ vote-core 등 다른 핸들러가 같은 클릭을 먹지 못하게 차단
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      if (btn.disabled) return;

      const issueId = Number(btn.dataset.issueId);
      if (!issueId) return;

      // 이미 투표 있으면 UI만 반영
      if (typeof window.GALLA_CHECK_VOTE === "function") {
        const existingRaw = await window.GALLA_CHECK_VOTE(issueId, { force: true });
        const existing = normalizeVoteResult(existingRaw);
        if (existing === "pro" || existing === "con") {
          await syncVoteForIssue(issueId);
          return;
        }
      }

      const type = btn.dataset.type || (btn.classList.contains("pro") ? "pro" : "con");

      if (typeof window.GALLA_VOTE !== "function") {
        console.error("[SHORTS] GALLA_VOTE not found");
        return;
      }

      await window.GALLA_VOTE(issueId, type);
      await syncVoteForIssue(issueId);
    },
    true // ✅ capture!
  );

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