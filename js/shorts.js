/* 🔥 GLOBAL SHORTS API (MUST BE FIRST)
   - index.js 에서 window.openShorts(list, startId) 를 호출한다.
   - shorts.js 는 항상 로드되어 있어야 하므로, 파일 전체 return 금지.
   - ⚠️ 쇼츠는 "shorts 페이지"가 아니라 index 위 오버레이로도 열린다.
*/

// openShorts 호출이 "내부 오프너 준비"보다 빨리 와도 안전하게 큐잉 처리
window.__SHORTS_OPEN_QUEUE__ = window.__SHORTS_OPEN_QUEUE__ || [];

window.__SHORTS_VOTING_LOCK__ = false;

window.openShorts = function (list, startId) {
  if (typeof window.__OPEN_SHORTS_INTERNAL__ === "function") {
    window.__OPEN_SHORTS_INTERNAL__(list, startId);
    return;
  }

  // 내부 오프너 준비 전이면 큐에 쌓아둔다 (index.js에서 먼저 호출되는 케이스 대응)
  console.warn("[SHORTS] internal opener not ready (queued)");
  window.__SHORTS_OPEN_QUEUE__.push({ list, startId, at: Date.now() });

  // 혹시 같은 tick 내에 준비될 수 있으니 한 번 더 시도
  setTimeout(() => {
    if (typeof window.__OPEN_SHORTS_INTERNAL__ === "function") {
      const q = window.__SHORTS_OPEN_QUEUE__.splice(0);
      q.forEach((x) => window.__OPEN_SHORTS_INTERNAL__(x.list, x.startId));
    }
  }, 0);
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
// ✅ vote 결과 정규화 (string / object 모두 대응)
function normalizeVoteResult(raw) {
  if (!raw) return null;
  if (raw === "pro" || raw === "con") return raw;
  if (typeof raw === "object") {
    const t = raw.type || raw.vote || raw.result;
    if (t === "pro" || t === "con") return t;
  }
  return null;
}

/* =========================
   VOTE UI HELPERS
========================= */
function applyShortVoteUI(wrap, result) {
  if (!wrap) return;

  const proBtn = wrap.querySelector(".shorts-vote .vote-btn.pro");
  const conBtn = wrap.querySelector(".shorts-vote .vote-btn.con");
  if (!proBtn || !conBtn) return;

  // 항상 초기화하지 않는다 — 결과 기준 단방향
  proBtn.classList.remove("active-vote");
  conBtn.classList.remove("active-vote");

  proBtn.disabled = false;
  conBtn.disabled = false;

  if (result === "pro") {
    proBtn.disabled = true;
    conBtn.disabled = true;
    proBtn.classList.add("active-vote");
    proBtn.textContent = "👍 투표 완료";
    conBtn.textContent = "👎 난 반댈세";
    return;
  }

  if (result === "con") {
    proBtn.disabled = true;
    conBtn.disabled = true;
    conBtn.classList.add("active-vote");
    conBtn.textContent = "👎 투표 완료";
    proBtn.textContent = "👍 찬성이오";
    return;
  }
}

let __SHORTS_LAST_SYNC__ = { issueId: null, at: 0 };

async function syncVoteForIssue(issueId) {
  // 너무 잦은 연속 호출 방지 (옵저버/이벤트 중복)
  const now = Date.now();
  if (__SHORTS_LAST_SYNC__.issueId === issueId && now - __SHORTS_LAST_SYNC__.at < 250) return;
  __SHORTS_LAST_SYNC__ = { issueId, at: now };

  const ready = await waitForVoteReady();
  if (!ready) return;

  // force 옵션은 vote.core.js가 지원하는 경우만 의미 있음. (지원 안 해도 무해)
  const raw = await window.GALLA_CHECK_VOTE(issueId, { force: true });
  const result = normalizeVoteResult(raw);

  // ✅ 오버레이 내부에서만 찾는다 (index 카드 등 외부 DOM 오염 방지)
  const ov = document.getElementById("shortsOverlay");
  if (!ov || ov.hidden || ov.style.display === "none") return;

  const wrap = ov.querySelector(`.short[data-issue-id="${issueId}"]`);
  if (!wrap) return;

  // ❌ reset 제거 — vote-core 역침범 방지
  if (result) applyShortVoteUI(wrap, result);

  console.log("[SHORTS][FORCE_SYNC]", { issueId, result });
}

/* shorts.js — TRUE Reels / Shorts (HARD SNAP + SINGLE AUDIO)
   - observer / wheel / keydown / click 은 "쇼츠 오버레이가 열렸을 때"만 동작
*/
(function () {
  // 🔥 EARLY BIND: expose internal opener immediately to avoid index openShorts timeout
  window.__OPEN_SHORTS_INTERNAL__ = function(list, startId) {
    // 실제 구현은 아래에서 재정의된다
    console.warn("[SHORTS] internal opener stub called before init");
    window.__SHORTS_OPEN_QUEUE__ = window.__SHORTS_OPEN_QUEUE__ || [];
    window.__SHORTS_OPEN_QUEUE__.push({ list, startId, at: Date.now() });
  };
  // ❌ 파일 전체 return 금지. 대신 "오버레이 활성 상태"로 가드한다.
  let overlay = null;
  let observer = null;
  let currentIssueId = null;
  let orderedIssueIds = [];

  /* =========================
     UTILS
  ========================= */
  function qs(id) {
    return document.getElementById(id);
  }

  function isShortsActive() {
    if (!overlay) overlay = qs("shortsOverlay");
    return !!(overlay && !overlay.hidden && overlay.style.display !== "none");
  }

  function hardPauseAll(exceptIssueId = null) {
    document.querySelectorAll(".short").forEach((wrap) => {
      const issueId = Number(wrap.dataset.issueId);
      const v = wrap.querySelector("video");
      if (!v) return;
      if (issueId === exceptIssueId) return;
      try {
        v.pause();
        v.currentTime = 0;
        v.muted = true;
      } catch {}
    });
  }

    function playOnly(issueId) {
      if (!isShortsActive()) return;
      if (currentIssueId === issueId) return;

      const idx = orderedIssueIds.indexOf(issueId);
      if (idx === -1 || !overlay) return;

      const wrap = overlay.querySelector(`.short[data-issue-id="${issueId}"]`);
      if (!wrap) return;

      const video = wrap.querySelector("video");
      if (!video) return;

      currentIssueId = issueId;
      window.__CURRENT_SHORT_ISSUE_ID__ = issueId;

      hardPauseAll(issueId);

      // ✅ 스크롤의 주체는 overlay
      overlay.scrollTo({
        top: idx * window.innerHeight,
        behavior: "smooth"
      });

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
    if (!isShortsActive()) return;
    if (!overlay) return;

    if (observer) observer.disconnect();

    observer = new IntersectionObserver(
      (entries) => {
        if (!isShortsActive()) return;
        // 🔒 prevent race condition during voting
        if (window.__SHORTS_VOTING_LOCK__ === true) return;
        const best = getMostVisibleEntry(entries);
        if (!best) return;
        if (best.intersectionRatio < 0.6) return;

        const issueId = Number(best.target.dataset.issueId);
        if (!orderedIssueIds.includes(issueId)) return;

        syncVoteForIssue(issueId);
      },
      { root: overlay, threshold: [0.6] }
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

    /* 🔥 쇼츠 핵심: overlay를 스크롤 컨테이너로 만든다 */
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.width = "100vw";
    overlay.style.height = "100vh";
    overlay.style.overflowY = "scroll";
    overlay.style.overflowX = "hidden";
    overlay.style.scrollSnapType = "none";
    overlay.style.webkitOverflowScrolling = "auto"; // 🔥 iOS 관성 스크롤 제거
    overlay.style.touchAction = "none";              // 🔥 브라우저 제스처 전면 차단

    overlay.scrollTop = 0;

    // 🔒 index 투표 UI 완전 차단 (쇼츠 오버레이 동안)
    document.body.classList.add("shorts-open");
    // index 투표 버튼/바 숨김 (있을 경우)
    document.querySelectorAll(
      ".vote-bar, .issue-vote, .vote-fixed, .vote-bottom"
    ).forEach(el => {
      el.setAttribute("data-shorts-hidden", "1");
      el.style.pointerEvents = "none";
      el.style.display = "none";
    });

    // 오버레이 open 플래그
    overlay.dataset.open = "1";

    // 이벤트로 캐시 리셋 신호
    window.dispatchEvent(new Event("shorts:opened"));

    document.body.style.overflow = "hidden";

    const shorts = (list || []).filter((v) => v && v.video_url);
    if (!shorts.length) return;
    // 🔒 FIX: freeze deterministic order (content ↔ video 1:1)
    orderedIssueIds = shorts.map(v => Number(v.id));

    shorts.forEach((item) => {
      const wrap = document.createElement("section");
      wrap.className = "short";
      wrap.dataset.issueId = item.id;
      wrap.setAttribute("data-issue-id", item.id);

      /* 🔥 각 쇼츠는 화면 하나를 정확히 차지 */
      wrap.style.height = "100vh";
      wrap.style.width = "100vw";
      wrap.style.scrollSnapAlign = "start";
      wrap.style.overflow = "hidden";
      wrap.style.position = "relative";

      const video = document.createElement("video");
      video.src = item.video_url;
      video.playsInline = true;
      video.preload = "auto";
      video.loop = true;
      video.muted = true;

      // vote bar
      const voteBar = document.createElement("div");
      voteBar.className = "shorts-vote";

      const btnPro = document.createElement("button");
      btnPro.className = "vote-btn pro";
      btnPro.dataset.issueId = item.id;
      btnPro.dataset.type = "pro";
      btnPro.textContent = "👍 찬성이오";

      const btnCon = document.createElement("button");
      btnCon.className = "vote-btn con";
      btnCon.dataset.issueId = item.id;
      btnCon.dataset.type = "con";
      btnCon.textContent = "👎 난 반댈세";

      // ✅ 쇼츠 투표는 버튼이 직접 처리 (전역 vote-core / document 핸들러 충돌 차단)
      const onShortVoteClick = async (e) => {
        // 기본/버블/캡처 모두 차단
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        // 🔒 lock observer during vote
        window.__SHORTS_VOTING_LOCK__ = true;

        const b = e.currentTarget;
        if (!b || b.disabled) return;

        const issueId = Number(b.dataset.issueId);
        if (!issueId) return;

        // 🔥 vote-core가 index 기준 issue로 되돌아가는 것 방지
        //window.__GALLA_ACTIVE_ISSUE_ID__ = issueId;
        //window.__CURRENT_SHORT_ISSUE_ID__ = issueId;
        window.__GALLA_VOTE_CONTEXT__ = "shorts";

        // 이미 투표가 있으면 UI만 확정
        if (typeof window.GALLA_CHECK_VOTE === "function") {
          const existingRaw = await window.GALLA_CHECK_VOTE(issueId, { force: true });
          const existing = normalizeVoteResult(existingRaw);
          if (existing === "pro" || existing === "con") {
            await syncVoteForIssue(issueId);
            return;
          }
        }

        // 🔥 반드시 dataset 기준으로 판별 (CSS / class 충돌 방지)
        const type = b.dataset.type === "pro" ? "pro" : "con";
        if (typeof window.GALLA_VOTE !== "function") {
          console.error("[SHORTS] GALLA_VOTE not found");
          return;
        }

        // ❌ 낙관적 UI(즉시 반응)
        // const wrap = document.querySelector(`.short[data-issue-id="${issueId}"]`);
        // if (wrap) applyShortVoteUI(wrap, type);

        try {
          await window.GALLA_VOTE(issueId, type);
        } catch (err) {
          console.error("[SHORTS] vote error", err);
        }

        // 🔓 unlock observer after vote settles
        setTimeout(() => {
          window.__SHORTS_VOTING_LOCK__ = false;
        }, 300);

        // 🔥 DB 결과를 다시 읽어서 UI 확정 (절대 type 재사용 금지)
        await syncVoteForIssue(issueId);
      };

      // 캡처 단계로 먼저 잡아서 어떤 전역 핸들러보다 우선
      btnPro.addEventListener("click", onShortVoteClick, true);
      btnCon.addEventListener("click", onShortVoteClick, true);

      voteBar.appendChild(btnPro);
      voteBar.appendChild(btnCon);

      wrap.appendChild(video);
      wrap.appendChild(voteBar);
      overlay.appendChild(wrap);
    });

    const startIdx = orderedIssueIds.indexOf(Number(startId));
    const firstIssueId = orderedIssueIds[startIdx >= 0 ? startIdx : 0];
    window.__CURRENT_SHORT_ISSUE_ID__ = firstIssueId;

    requestAnimationFrame(() => {
      if (!isShortsActive()) return;

      /* 🔥 키보드 입력을 overlay가 직접 받도록 */
      overlay.setAttribute("tabindex", "0");
      overlay.focus();

    setupObserver();
    bindTouchEvents();

    /* 🔥 WHEEL → 실제 쇼츠 이동 */
    let wheelAccum = 0;
    let wheelTimer = null;

if (!overlay.__wheelBound) {
  overlay.__wheelBound = true;

    overlay.addEventListener(
      "wheel",
      (e) => {
        if (!isShortsActive()) return;
        e.preventDefault();

        wheelAccum += e.deltaY;
        if (wheelTimer) return;

        wheelTimer = setTimeout(() => {
          const dir = wheelAccum > 0 ? 1 : -1;
          wheelAccum = 0;
          wheelTimer = null;

          const idx = orderedIssueIds.indexOf(currentIssueId);
          const nextId = orderedIssueIds[idx + dir];
          if (nextId) playOnly(nextId);
        }, 120);
      },
      { passive: false }
    );
  }

    playOnly(firstIssueId);
    syncVoteForIssue(firstIssueId);
    

  /* =========================
     CLOSE SHORTS
  ========================= */
  function closeShorts() {
    hardPauseAll();
    currentIssueId = null;
    orderedIssueIds = [];

    if (observer) observer.disconnect();

    if (overlay) {
      overlay.hidden = true;
      overlay.style.display = "none";
      overlay.innerHTML = "";
      delete overlay.dataset.open;
    }

    document.body.style.overflow = "";

    // 🔓 index 투표 UI 복구
    document.body.classList.remove("shorts-open");
    document.querySelectorAll('[data-shorts-hidden="1"]').forEach(el => {
      el.style.pointerEvents = "";
      el.style.display = "";
      el.removeAttribute("data-shorts-hidden");
    });

    // vote-core 컨텍스트 복구
    window.__GALLA_VOTE_CONTEXT__ = "index";
    window.__GALLA_ACTIVE_ISSUE_ID__ = null;
    window.__GALLA_GET_ACTIVE_ISSUE_ID__ = null;
  }

  /* =========================
     KEYBOARD (DESKTOP)
  ========================= */
  window.addEventListener("keydown", (e) => {
    if (!isShortsActive()) return;

    if (e.key === "ArrowDown") {
      const idx = orderedIssueIds.indexOf(currentIssueId);
      const nextId = orderedIssueIds[idx + 1];
      if (nextId) playOnly(nextId);
    }

    if (e.key === "ArrowUp") {
      const idx = orderedIssueIds.indexOf(currentIssueId);
      const prevId = orderedIssueIds[idx - 1];
      if (prevId) playOnly(prevId);
    }

    if (e.key === "Escape") closeShorts();
  });


/* =========================
   TOUCH SWIPE (MOBILE)
========================= */
function bindTouchEvents() {
  if (!overlay) return;

  // ✅ 중복 바인딩 방지
  if (overlay.__touchBound) return;
  overlay.__touchBound = true;

  let startY = null;
  let lastY = null;

  // touchstart: 시작점만 기록
  overlay.addEventListener(
    "touchstart",
    (e) => {
      if (!isShortsActive()) return;
      startY = e.touches[0].clientY;
      lastY = startY;
    },
    { passive: true }
  );

  // touchmove: 기본 스크롤을 차단하고 이동량만 추적
  overlay.addEventListener(
    "touchmove",
    (e) => {
      if (!isShortsActive()) return;
      e.preventDefault(); // 🔥 중요: 브라우저 스크롤 차단
      lastY = e.touches[0].clientY;
    },
    { passive: false }
  );

  // touchend: 이동량으로 다음/이전 쇼츠 결정
  overlay.addEventListener(
    "touchend",
    () => {
      if (!isShortsActive()) return;
      if (startY === null || lastY === null) return;

      const delta = startY - lastY;
      const threshold = 60;

      const idx = orderedIssueIds.indexOf(currentIssueId);
      if (idx !== -1) {
        if (delta > threshold) {
          const nextId = orderedIssueIds[idx + 1];
          if (nextId) playOnly(nextId);
        } else if (delta < -threshold) {
          const prevId = orderedIssueIds[idx - 1];
          if (prevId) playOnly(prevId);
        }
      }

      startY = null;
      lastY = null;
    },
    { passive: true }
  );
}

  /* =========================
     EXPORT + EVENTS
  ========================= */
  // 🔥 FINAL BIND: replace stub with real implementation
  window.__OPEN_SHORTS_INTERNAL__ = __openShortsInternal;
  window.closeShorts = closeShorts;

  // 🔥 flush queued openShorts calls safely
  if (window.__SHORTS_OPEN_QUEUE__?.length) {
    const q = window.__SHORTS_OPEN_QUEUE__.splice(0);
    q.forEach((x) => {
      try {
        __openShortsInternal(x.list, x.startId);
      } catch (e) {
        console.error("[SHORTS] failed to open from queue", e);
      }
    });
  }

  window.addEventListener("shorts:opened", () => {
    // 🔥 HARD RESET: vote-core를 쇼츠 컨텍스트로 강제 전환
    window.__GALLA_VOTE_CONTEXT__ = "shorts";
    window.__GALLA_ACTIVE_ISSUE_ID__ = window.__CURRENT_SHORT_ISSUE_ID__ || null;

    // vote-core가 index 기준으로 잡은 캐시 전부 무효화
    window.__GALLA_LAST_VOTE_APPLY__ = null;
    window.__GALLA_LAST_VOTE_ISSUE__ = null;
    window.__GALLA_LAST_VOTE_PAGE__ = "shorts";

    // vote-core가 참조하는 current issue getter를 강제로 덮어쓴다
    window.__GALLA_GET_ACTIVE_ISSUE_ID__ = () => {
      return window.__CURRENT_SHORT_ISSUE_ID__ || window.__GALLA_ACTIVE_ISSUE_ID__;
    };

    console.warn("[SHORTS][HARD_BIND] vote-core context switched to shorts", {
      issueId: window.__CURRENT_SHORT_ISSUE_ID__
    });

    // vote-core UI 캐시 리셋 (있어도 되고 없어도 됨)
    window.__GALLA_LAST_VOTE_APPLY__ = null;
    window.__GALLA_LAST_VOTE_ISSUE__ = null;
    window.__GALLA_LAST_VOTE_PAGE__ = "shorts";
    console.log("[SHORTS] vote-core cache reset (force sync)");

    if (window.__CURRENT_SHORT_ISSUE_ID__) {
      syncVoteForIssue(window.__CURRENT_SHORT_ISSUE_ID__);
    }
  });
})();

// 🔥 현재 활성 쇼츠 issueId 외부 노출 (vote.core.js용)
window.__GALLA_SHORTS_STATE__ = window.__GALLA_SHORTS_STATE__ || { currentIssueId: null };
// =========================
// (안전장치) 전역 index 투표 차단 가드
// =========================
function isIndexVoteBlocked() {
  return document.body.classList.contains("shorts-open");
}