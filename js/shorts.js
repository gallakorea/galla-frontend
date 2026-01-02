/* shorts.js — TRUE Reels / Shorts (HARD SNAP + SINGLE AUDIO) */
(function () {

  let overlay = null;
  let observer = null;
  let currentIndex = -1;

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
    if (p?.then) p.then(() => (video.muted = false)).catch(() => {});
  }

  function setupObserver() {
    if (observer) observer.disconnect();

    observer = new IntersectionObserver(entries => {
      let best = null;
      let max = 0;

      entries.forEach(e => {
        if (e.intersectionRatio > max) {
          max = e.intersectionRatio;
          best = e;
        }
      });

      if (!best || best.intersectionRatio < 0.6) return;

      const idx = Number(best.target.dataset.index);
      const issueId = Number(best.target.dataset.issueId);

      window.__CURRENT_SHORT_ISSUE_ID__ = issueId;
      window.__CURRENT_SHORT_INDEX__ = idx;

      playOnly(idx);

      if (typeof window.GALLA_CHECK_VOTE === "function") {
        window.GALLA_CHECK_VOTE(issueId);
      }
    }, {
      threshold: [0.25, 0.5, 0.6, 0.75, 1]
    });

    overlay.querySelectorAll(".short").forEach(el => observer.observe(el));
  }

  function openShorts(list, startId) {
    overlay = qs("shortsOverlay");
    if (!overlay) return;

    overlay.innerHTML = "";
    overlay.hidden = false;
    overlay.style.display = "block";
    overlay.scrollTop = 0;
    document.body.style.overflow = "hidden";

    const shorts = list.filter(v => v?.video_url);
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
      video.loop = true;
      video.muted = true;

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

    window.__CURRENT_SHORT_ISSUE_ID__ = Number(shorts[startIndex].id);

    requestAnimationFrame(() => {
      overlay.scrollTo({
        top: startIndex * window.innerHeight,
        behavior: "instant"
      });

      setupObserver();
      playOnly(startIndex);

      if (typeof window.GALLA_CHECK_VOTE === "function") {
        window.GALLA_CHECK_VOTE(Number(shorts[startIndex].id));
      }
    });
  }

  document.addEventListener("click", async e => {
    const btn = e.target.closest(".shorts-vote .vote-btn");
    if (!btn || btn.disabled) return;

    const issueId = Number(btn.dataset.issueId);
    if (!issueId) return;

    if (typeof window.GALLA_GET_MY_VOTE === "function") {
      const existing = await window.GALLA_GET_MY_VOTE(issueId);
      if (existing) return;
    }

    const type = btn.classList.contains("pro") ? "pro" : "con";
    await window.GALLA_VOTE(issueId, type);
  });

  window.openShorts = openShorts;
})();
window.__GALLA_SHORTS_STATE__ = { currentIndex: -1 };