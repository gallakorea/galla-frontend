/* =========================================================
   GALLA SHORTS — REAL REELS / SHORTS ENGINE (JS)
   Native Scroll + Scroll Snap (NO TRANSFORM)
========================================================= */

console.log("[shorts] loaded");

(function () {
  const overlay = document.getElementById("shortsOverlay");
  if (!overlay) return;

  let observer = null;
  let currentIndex = -1;
  let shortsData = [];

  // 🔥 외부(vote.core.js)에서 참조
  window.__CURRENT_SHORT_ISSUE_ID__ = null;

  /* =========================================================
     SHORTS DATA LOAD (임시)
     👉 실제로는 index / issue 페이지에서
        window.openShorts(list, startId) 호출
  ========================================================= */
  window.openShorts = function (list, startId = null) {
    if (!overlay) return;

    overlay.classList.add("active");

    overlay.innerHTML = "";

    const normalized = Array.isArray(list) ? list : [list];
    shortsData = normalized.filter(v => v && v.video_url);
    if (!shortsData.length) return;

    // overlay 활성화 (CSS 상태 기반)
    // Removed overlay.style.visibility = "visible";

    shortsData.forEach((item, i) => {
      const section = document.createElement("section");
      section.className = "short";
      section.dataset.index = i;
      section.dataset.issueId = item.id;
      section.setAttribute("data-issue-id", item.id);

      const video = document.createElement("video");
      video.src = item.video_url;
      video.playsInline = true;
      video.preload = "metadata";
      video.muted = true;
      video.loop = true;

      // 🔥 탭 제어 (모바일)
      let tapTimer = null;
      let tapCount = 0;

      section.addEventListener("click", () => {
        tapCount++;

        if (tapCount === 1) {
          tapTimer = setTimeout(() => {
            if (video.paused) video.play();
            else video.pause();
            tapCount = 0;
          }, 250);
        }

        if (tapCount === 2) {
          clearTimeout(tapTimer);
          video.playbackRate = video.playbackRate === 1 ? 2 : 1;
          tapCount = 0;
        }
      });

      section.appendChild(video);
      overlay.appendChild(section);
    });

    // 🔥 투표 바 (단일)
    injectVoteBar();

    // 시작 위치
    let startIndex = 0;
    if (startId) {
      const found = shortsData.findIndex(v => Number(v.id) === Number(startId));
      if (found >= 0) startIndex = found;
    }

    requestAnimationFrame(() => {
      overlay.scrollTo({
        top: startIndex * window.innerHeight,
        behavior: "instant"
      });
      setupObserver();
      activateShort(startIndex);
    });
  };

  /* =========================================================
     INTERSECTION OBSERVER
  ========================================================= */
  function setupObserver() {
    if (observer) observer.disconnect();

    observer = new IntersectionObserver(
      entries => {
        let best = null;
        let maxRatio = 0;

        entries.forEach(e => {
          if (e.intersectionRatio > maxRatio) {
            maxRatio = e.intersectionRatio;
            best = e;
          }
        });

        if (!best || best.intersectionRatio < 0.6) return;

        const index = Number(best.target.dataset.index);
        activateShort(index);
      },
      {
        root: overlay,
        threshold: [0.25, 0.5, 0.6, 0.75, 0.9]
      }
    );

    overlay.querySelectorAll(".short").forEach(el => observer.observe(el));
  }

  /* =========================================================
     ACTIVATE SHORT (PLAY ONE ONLY)
  ========================================================= */
  function activateShort(index) {
    if (index === currentIndex) return;

    const shorts = overlay.querySelectorAll(".short");

    shorts.forEach((el, i) => {
      const video = el.querySelector("video");
      if (!video) return;

      if (i === index) {
        video.currentTime = 0;
        video.muted = true;
        video.play().catch(() => {});

        const issueId = Number(el.dataset.issueId);
        window.__CURRENT_SHORT_ISSUE_ID__ = issueId;

        if (window.GALLA_CHECK_VOTE) {
          queueMicrotask(() => window.GALLA_CHECK_VOTE(issueId));
        }
      } else {
        video.pause();
        video.currentTime = 0;
        video.muted = true;
      }
    });

    currentIndex = index;
  }

  /* =========================================================
     VOTE BAR (FIXED, SINGLE INSTANCE)
  ========================================================= */
  function injectVoteBar() {
    if (document.querySelector(".shorts-vote")) return;

    const bar = document.createElement("div");
    bar.className = "shorts-vote";

    const pro = document.createElement("button");
    pro.className = "vote-btn pro";
    pro.innerText = "👍 찬성이오";

    const con = document.createElement("button");
    con.className = "vote-btn con";
    con.innerText = "👎 난 반댈세";

    pro.addEventListener("click", async () => {
      const id = window.__CURRENT_SHORT_ISSUE_ID__;
      if (!id || !window.GALLA_VOTE) return;
      await window.GALLA_VOTE(id, "pro");
    });

    con.addEventListener("click", async () => {
      const id = window.__CURRENT_SHORT_ISSUE_ID__;
      if (!id || !window.GALLA_VOTE) return;
      await window.GALLA_VOTE(id, "con");
    });

    bar.appendChild(pro);
    bar.appendChild(con);
    document.body.appendChild(bar);
  }

  /* =========================================================
     CLOSE (ESC / BACK)
  ========================================================= */
  function closeShorts() {
    overlay.classList.remove("active");
    overlay.innerHTML = "";
    overlay.scrollTop = 0;

    if (observer) {
      observer.disconnect();
      observer = null;
    }

    const bar = document.querySelector(".shorts-vote");
    if (bar) bar.remove();

    window.__CURRENT_SHORT_ISSUE_ID__ = null;
  }

  window.closeShorts = closeShorts;

  window.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    if (!overlay.innerHTML.trim()) return; // 쇼츠 열려 있을 때만
    closeShorts();
  });

  window.addEventListener("popstate", () => {
    closeShorts();
  });

/* =========================================================
   AUTO BOOTSTRAP FOR /shorts PAGE
   (standalone entry)
========================================================= */
console.log("[shorts] standalone page detected:", document.body?.dataset?.page === "shorts");
document.addEventListener("DOMContentLoaded", () => {
  // shorts 단독 페이지인 경우만 자동 실행
  if (document.body?.dataset?.page !== "shorts") return;
  if (!window.openShorts) return;

  // 이미 실행된 경우 중복 방지
  if (document.querySelector("#shortsOverlay .short")) return;

  console.log("[shorts] auto bootstrap");

  // ✅ 임시 더미 (실제 연동 전까지 필수)
  window.openShorts(
    [
      {
        id: 1,
        video_url: "https://www.w3schools.com/html/mov_bbb.mp4"
      },
      {
        id: 2,
        video_url: "https://www.w3schools.com/html/movie.mp4"
      }
    ],
    1
  );
});

})();   // ← 이게 반드시 있어야 함