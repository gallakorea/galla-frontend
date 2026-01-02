/* shorts.js — TRUE Reels / Shorts (HARD SNAP + SINGLE AUDIO) */
(function () {

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
  entries.forEach(e => {
    if (e.intersectionRatio > maxRatio) {
      maxRatio = e.intersectionRatio;
      best = e;
    }
  });
  return best;
}

function setupObserver() {
  if (observer) observer.disconnect();

  observer = new IntersectionObserver(
    entries => {
      const best = getMostVisibleEntry(entries);
      if (!best) return;

      if (best.intersectionRatio < 0.6) return;

      const idx = Number(best.target.dataset.index);
      const issueId = Number(best.target.dataset.issueId);
      currentIssueId = issueId;
      syncVoteState(issueId);
      playOnly(idx);
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
function openShorts(list, startId) {
  overlay = qs("shortsOverlay");
  if (!overlay) {
    console.error("[SHORTS] overlay missing");
    return;
  }

  overlay.innerHTML = "";
  overlay.hidden = false;
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

    const btnCon = document.createElement("button");
    btnCon.className = "vote-btn con";
    btnCon.dataset.issueId = item.id;
    btnCon.textContent = "👎 난 반댈세";

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

  requestAnimationFrame(() => {
    overlay.scrollTo({
      top: startIndex * window.innerHeight,
      behavior: "instant"
    });

    setupObserver();
    playOnly(startIndex);
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
async function syncVoteState(issueId) {
  if (!issueId) return;
  if (typeof window.GALLA_CHECK_VOTE !== "function") return;

  resetVoteUI();

  const stance = await window.GALLA_CHECK_VOTE(issueId);
  if (stance === "pro" || stance === "con") {
    lockVoteUI(stance);
  }
}

function getCurrentVoteBar() {
  if (!overlay || currentIndex < 0) return null;
  const wrap = overlay.querySelector(`.short[data-index="${currentIndex}"]`);
  return wrap ? wrap.querySelector(".shorts-vote") : null;
}

function resetVoteUI() {
  const bar = getCurrentVoteBar();
  if (!bar) return;

  bar.querySelectorAll(".vote-btn").forEach(btn => {
    btn.classList.remove("active-vote", "locked");
  });
}

function lockVoteUI(type) {
  const bar = getCurrentVoteBar();
  if (!bar) return;

  bar.querySelectorAll(".vote-btn").forEach(btn => {
    btn.classList.add("locked");
  });

  const target = bar.querySelector(`.vote-btn.${type}`);
  if (target) target.classList.add("active-vote");
}

/* 클릭 이벤트 (단일 바) */
document.addEventListener("click", async e => {
  const btn = e.target.closest(".shorts-vote .vote-btn");
  if (!btn) return;
  if (!currentIssueId) return;

  const type = btn.classList.contains("pro") ? "pro" : "con";

  if (typeof window.GALLA_VOTE !== "function") {
    console.error("[SHORTS] GALLA_VOTE missing");
    return;
  }

  await window.GALLA_VOTE(currentIssueId, type);
  lockVoteUI(type);
});

/* =========================
   EXPORT
========================= */
window.openShorts = openShorts;
window.closeShorts = closeShorts;

})();