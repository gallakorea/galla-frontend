/* =========================================================
   GALLA SHORTS / REELS ENGINE (FINAL)
   - index 기반 전환 (scroll 폐기)
   - transform + drag
   - 완전한 릴스/쇼츠 UX
========================================================= */

window.__SHORTS_OPEN_QUEUE__ = window.__SHORTS_OPEN_QUEUE__ || [];
window.__SHORTS_VOTING_LOCK__ = false;
window.currentCommentStance = "pro";   // pro | con
window.currentCommentSort = "latest"; // latest | popular

window.__COMMENT_OPEN__ = false;
window.__COMMENT_STATE__ = "closed"; // closed | half | full

function isScrollableTarget(el) {
  return el && el.closest && el.closest(".comment-list");
}

let shortsList = [];
let currentIndex = 0;
let overlay, track;

let isDragging = false;
let startX = 0;
let startY = 0;
let currentTranslateY = 0;
let velocityY = 0;

const SWIPE_THRESHOLD = 70;
const CLOSE_THRESHOLD_X = 120;

function getViewportHeight() {
  return window.visualViewport
    ? window.visualViewport.height
    : window.innerHeight;
}

let VIEWPORT_H = getViewportHeight();

function updateViewportHeight() {
  VIEWPORT_H = getViewportHeight();

  if (track) {
    track.style.height = `${shortsList.length * VIEWPORT_H}px`;
    track.style.transition = "none";
    track.style.transform = `translateY(-${currentIndex * VIEWPORT_H}px)`;
  }
}
window.addEventListener("resize", updateViewportHeight);
window.addEventListener("orientationchange", updateViewportHeight);

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", updateViewportHeight);
  window.visualViewport.addEventListener("scroll", updateViewportHeight);
}

/* =========================
   OPEN API
========================= */
window.__SHORTS_ENGINE_READY__ = false;

window.openShorts = function (list, startId, startTime) {
  try {
    if (typeof window.__OPEN_SHORTS_INTERNAL__ === "function") {
      window.__OPEN_SHORTS_INTERNAL__(list, startId, startTime);
    } else {
      console.warn("[SHORTS] __OPEN_SHORTS_INTERNAL__ missing, queueing");
      window.__SHORTS_OPEN_QUEUE__.push({ list, startId, startTime });
      document.addEventListener("DOMContentLoaded", () => {
        if (typeof window.__OPEN_SHORTS_INTERNAL__ === "function") {
          window.__OPEN_SHORTS_INTERNAL__(list, startId, startTime);
        }
      }, { once: true });
    }
  } catch (e) {
    console.error("[SHORTS] openShorts failed", e);
  }
};

/* =========================
   CORE OPEN
========================= */
function __openShortsInternal(list, startId, startTime) {
  // 이어보기: 시작 아이템을 이 위치(초)부터 재생 (인덱스 인라인에서 넘어옴)
  window.__SHORTS_PENDING_SEEK__ = (startTime && startTime > 0.3) ? { id: Number(startId), time: startTime } : null;
  // 🔥 HARD FIX: 항상 video_url 있는 항목만, 순서 고정
  shortsList = (list || [])
    .filter(v => v && v.video_url)
    .map(v => ({
      id: Number(v.id),
      video_url: v.video_url,
      title: v.title || "",
      author: v.author || "익명",
      avatar_url: v.avatar_url || null,
      level: v.level != null ? v.level : "",
      category: v.category || "",
      user_id: v.user_id || "",
      faction_a: v.faction_a || "",
      faction_b: v.faction_b || ""
    }));
  if (!shortsList.length) return;

  // 릴스 진입 시 소리는 항상 기본 ON (사용자가 세션 중 음소거하면 그때부터 유지)
  window.__REELS_MUTED__ = false;

  overlay = document.getElementById("shortsOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "shortsOverlay";
    document.body.appendChild(overlay);
  }

  // Clear overlay for fresh rendering
  overlay.innerHTML = `
    <div id="shortsContainer">
      <div class="shorts-scrim shorts-scrim-top"></div>
      <div class="shorts-scrim shorts-scrim-bottom"></div>
      <div class="shorts-top">
        <button id="shortsCloseBtn" class="sh-icon-btn" aria-label="닫기">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <button id="shortsMuteBtn" class="sh-icon-btn" aria-label="소리">
          <svg class="ic-on" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>
          <svg class="ic-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M22 9l-6 6"/><path d="M16 9l6 6"/></svg>
        </button>
      </div>
      <div id="shortsTrack"></div>
      <div id="shortsProgress"><div id="shortsProgressFill"></div></div>
      <div id="shortsVoteBar" class="shorts-vote">
        <button class="vote-btn pro" data-vote="pro" data-issue-id=""><span>👍</span> 찬성이오</button>
        <button class="vote-btn con" data-vote="con" data-issue-id=""><span>👎</span> 난 반댈세</button>
      </div>
    </div>
  `;
  // ===== Inject overlay styles for shorts meta (once) =====
  if (!document.getElementById("shortsMetaStyle")) {
    const style = document.createElement("style");
    style.id = "shortsMetaStyle";
    style.textContent = `
.shorts-meta{
  position:absolute; left:16px; right:84px;
  bottom:calc(env(safe-area-inset-bottom) + 96px);  /* 하단 정렬(인스타/틱톡식) */
  z-index:30; color:#fff;
  font-family:"Pretendard",system-ui,-apple-system,BlinkMacSystemFont,sans-serif;
  pointer-events:auto;
}
.shorts-author{ display:flex; gap:11px; align-items:flex-start; }
.author-avatar{
  width:46px; height:46px; border-radius:50%; object-fit:cover; flex:none;
  border:2px solid rgba(255,255,255,.92); box-shadow:0 2px 12px rgba(0,0,0,.55);
}
.author-avatar-init{
  display:flex; align-items:center; justify-content:center;
  font-weight:800; font-size:18px; color:#0a0a0b;
  background:linear-gradient(135deg,#f5cf6b,#ff9b4d);
}
.author-info{ display:flex; flex-direction:column; gap:5px; min-width:0; }
.author-line{ display:flex; align-items:center; gap:7px; font-size:15.5px; font-weight:800; line-height:1.15; }
.author-name{ text-shadow:0 1px 6px rgba(0,0,0,.75); }
.author-level{
  font-size:11px; padding:2px 8px; border-radius:999px; font-weight:800;
  background:rgba(245,207,107,.2); color:#f5cf6b; border:1px solid rgba(245,207,107,.42);
}
.shorts-cat{ font-size:12px; color:#f5cf6b; font-weight:700; opacity:.95; text-shadow:0 1px 4px rgba(0,0,0,.6); }
.shorts-title{
  margin-top:2px; font-size:14.5px; font-weight:600; line-height:1.42; color:#f2f3f5;
  text-shadow:0 1px 6px rgba(0,0,0,.7);
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
}
.shorts-goto{ cursor:pointer; }
.shorts-goto:active{ opacity:.7; }
.shorts-goto-chip, .author-follow{ display:none; }
`;
    document.head.appendChild(style);
  }

  // === 댓글 모달 HTML 생성 추가 ===
  if (!document.getElementById("shortsCommentModal")) {
    const modal = document.createElement("div");
    modal.id = "shortsCommentModal";
    modal.innerHTML = `
    <style>
    /* ===== Shorts Comment Modal UI (Issue Tone) ===== */
    #shortsCommentModal .comment-sheet{
      background:#0d0e12;
      color:#fff;
      border-top:1px solid rgba(255,255,255,.08);
      box-shadow:0 -20px 60px rgba(0,0,0,.6);
    }
    .comment-summary{
      padding:14px;
      border-bottom:1px solid rgba(255,255,255,.12);
    }
    .comment-summary .summary-bar{
      display:flex;
      align-items:center;
      gap:8px;
      font-size:13px;
      font-weight:700;
    }
    .comment-summary .bar{
      flex:1;
      height:6px;
      background:#222;
      border-radius:4px;
      overflow:hidden;
    }
    .comment-summary .bar-pro{
      height:100%;
      background:linear-gradient(90deg,#3d6bff,#6f93ff);
    }
    .comment-summary .summary-meta{
      margin-top:6px;
      font-size:11px;
      opacity:.7;
    }

    .comment-tabs.tabs-menu{
      position: sticky;
      top: 72px; /* summary height 기준 고정 */
      z-index: 5;

      display:flex;
      margin:0 14px 10px;
      padding:6px;
      gap:0;

      border-radius:14px;
      background:rgba(255,255,255,.04);
      border:1px solid rgba(255,255,255,.08);
    }
    .comment-tabs .stance-tab{
      flex:1;
      padding:10px 0;
      border-radius:10px;
      border:none;
      background:transparent;
      color:#9aa0ad;
      font-weight:800;
      letter-spacing:.5px;
      transition:.15s;
    }
    .comment-tabs .stance-tab.active{
      color:#fff;
      background:rgba(255,255,255,.08);
    }
    .comment-tabs .stance-tab.active.pro{
      background:rgba(61,107,255,.2); color:#a9c0ff;
    }
    .comment-tabs .stance-tab.active.con{
      background:rgba(255,77,103,.2); color:#ffb3c0;
    }

    /* ===============================
       COMMENT BILLBOARD (STICKY)
    ================================ */
    .comment-billboard.sticky{
      position: sticky;
      top: 128px; /* summary + tabs 높이 합 */
      z-index: 4;

      margin: 0 14px 10px;
      padding: 10px;
      border-radius: 12px;

      background:
        linear-gradient(180deg,rgba(255,255,255,.12),rgba(0,0,0,.85)),
        repeating-linear-gradient(45deg,#050505,#050505 6px,#0a0a0a 6px,#0a0a0a 12px);

      box-shadow: 0 0 28px rgba(255,255,255,.35);
    }

    .comment-billboard .billboard-item{
      padding: 8px;
      border-radius: 8px;
      font-size: 12px;
      margin-bottom: 6px;
      background: linear-gradient(180deg,#1a1a1a,#020202);
    }
    .comment-billboard .billboard-item:last-child{
      margin-bottom: 0;
    }

    .comment-list-wrap{
      flex:1;
      display:flex;
      flex-direction:column;
      overflow:hidden;
    }
    .comment-sort{
      display:none; /* 최신순 고정 */
    }
    .comment-list{
      flex:1;
      overflow-y:auto;
      padding:10px 14px;
    }

    .comment-input{
      padding:10px 14px;
      border-top:1px solid rgba(255,255,255,.15);
      display:flex;
      gap:8px;
    }
    .comment-input input{
      flex:1;
      background:#050505;
      border:1px solid rgba(255,255,255,.25);
      border-radius:10px;
      color:#fff;
      padding:10px;
    }
    .comment-input button{
      min-width:64px;
      border-radius:10px;
      border:none;
      background:linear-gradient(180deg,#ff9b2f,#ff6a00);
      color:#000;
      font-weight:800;
    }

    /* ===== 실데이터 댓글 아이템 ===== */
    .sc-empty{ padding:24px 0; text-align:center; color:#777; font-size:13px; }
    .sc-item{ padding:12px 0; border-bottom:1px solid #1e1e1e; }
    .sc-item.sc-reply{ border-bottom:none; padding:10px 0 0; }
    .sc-head{ display:flex; align-items:baseline; gap:6px; margin-bottom:4px; }
    .sc-nick{ font-size:13px; }
    .sc-nick.pro{ color:#5bbcff; }
    .sc-nick.con{ color:#ff6b6b; }
    .sc-lv{ font-size:11px; color:#f5c518; }
    .sc-time{ font-size:11px; color:#666; }
    .sc-body{ font-size:14px; line-height:1.5; color:#eee; word-break:break-word; }
    .sc-acts{ display:flex; align-items:center; gap:10px; margin-top:6px; }
    .sc-like{
      background:#141414; border:1px solid #2c2c2c; color:#aaa;
      padding:3px 10px; border-radius:999px; font-size:12px; cursor:pointer;
    }
    .sc-like.on{ border-color:#4a7bff; color:#8fb6ff; background:rgba(74,123,255,.12); }
    .sc-toggle{ background:none; border:none; color:#888; font-size:12px; cursor:pointer; }
    .sc-replies{ margin-left:14px; padding-left:12px; border-left:1px solid rgba(255,255,255,.12); }
    .billboard-item .bb-like{ color:#f5c518; font-size:11px; margin-left:4px; }
    </style>
  <div class="comment-dim"></div>

  <div class="comment-sheet">

    <!-- A. 전황 요약 (FIXED) -->
    <div class="comment-summary">
      <div class="summary-bar">
        <span class="pro">찬성 62%</span>
        <div class="bar">
          <div class="bar-pro" style="width:62%"></div>
        </div>
        <span class="con">반대 38%</span>
      </div>
      <div class="summary-meta">(총 댓글 184 · 참여자 129)</div>
    </div>

    <!-- B. 찬성 / 반대 탭 (STICKY) -->
    <div class="comment-tabs tabs-menu">
      <button class="stance-tab pro active" data-stance="pro">찬성</button>
      <button class="stance-tab con" data-stance="con">반대</button>
    </div>

    <!-- B-2. 빌보드 (STICKY, 조건부 노출 / 최대 3) -->
    <div id="commentBillboard" class="comment-billboard sticky" hidden>
      <div class="billboard-item">🔥 빌보드 댓글 1</div>
      <div class="billboard-item">🔥 빌보드 댓글 2</div>
      <div class="billboard-item">🔥 빌보드 댓글 3</div>
    </div>

    <!-- D. 댓글 리스트 (ONLY SCROLL AREA) -->
    <div class="comment-list-wrap">
      <div class="comment-sort">
        <button class="sort-btn active" data-sort="latest">최신순</button>
        <button class="sort-btn" data-sort="popular">인기순</button>
      </div>

      <div id="shortsCommentList" class="comment-list"></div>
    </div>

    <!-- E. 댓글 입력 -->
    <div class="comment-input">
      <input id="shortsCommentInput" placeholder="댓글을 입력하세요" />
      <button id="shortsCommentSend">등록</button>
    </div>

  </div>
    `;
    document.body.appendChild(modal);
  }

  track = overlay.querySelector("#shortsTrack");

  /* ===== overlay style ===== */
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    zIndex: "900",   // 🔥 nav(2000)보다 낮아야 함
    background: "#000",
    overflow: "hidden",
    touchAction: "none",
    overscrollBehavior: "contain",
    display: "block",
    pointerEvents: "auto"
  });

  /* ===== close btn ===== */
  const closeBtn = overlay.querySelector("#shortsCloseBtn");
  Object.assign(closeBtn.style, {
    background: "rgba(0,0,0,.5)", 
    color: "#fff",
    border: "none",
    fontSize: "18px",
    padding: "6px 10px",
    borderRadius: "10px",
  });
  closeBtn.onclick = closeShorts;

  /* ===== track ===== */
  Object.assign(track.style, {
    width: "100%",
    height: `${shortsList.length * VIEWPORT_H}px`,
    transition: "transform 0.35s cubic-bezier(.4,0,.2,1)",
    willChange: "transform"
  });

  // Remove any previous children in track
  track.innerHTML = "";

  shortsList.forEach(item => {
    const section = document.createElement("section");
    section.className = "short";
    section.dataset.issueId = item.id;
    if (item.user_id) section.dataset.authorId = item.user_id;

    Object.assign(section.style, {
      height: `${VIEWPORT_H}px`,
      width: "100%",
      maxWidth: "480px",
      margin: "0 auto",
      position: "relative",
      overflow: "hidden"
    });

    section.innerHTML = `
    <video 
      src="${item.video_url}" 
      playsinline
      preload="auto"
      style="width:100%;height:100%;object-fit:cover"
    ></video>

    <!-- LEFT META (AUTHOR) -->
    <div class="shorts-meta">
      <div class="shorts-author">
        <span class="author-avatar-link" ${item.user_id ? `data-profile-uid="${item.user_id}"` : ""}>${window.GALLA_avatarImg ? window.GALLA_avatarImg(item.avatar_url, "author-avatar") : `<div class="author-avatar author-avatar-init">${(item.author || "익").trim().charAt(0) || "익"}</div>`}</span>
        <div class="author-info">
          <div class="author-line">
            <span class="author-name" ${item.user_id ? `data-profile-uid="${item.user_id}"` : ""}>${item.author || "익명"}</span>
            ${item.level !== "" ? `<span class="author-level">Lv.${item.level}</span>` : ""}
          </div>
          ${item.category ? `<div class="shorts-cat">${item.category}</div>` : ""}
          <div class="shorts-title shorts-goto" data-goto="${item.id}" role="link">${item.title || ""}
            <span class="shorts-goto-chip">게시물 보기 ›</span>
          </div>
        </div>
      </div>
    </div>

    <!-- RIGHT ACTIONS -->
    <div class="shorts-actions">
      <button class="shorts-action-btn comment" aria-label="댓글">
        <span class="sa-ic"><svg viewBox="0 0 24 24">
          <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/>
        </svg></span>
        <span class="sa-label">댓글</span>
      </button>

      <button class="shorts-action-btn share" aria-label="공유">
        <span class="sa-ic"><svg viewBox="0 0 24 24">
          <path d="M22 2L11 13"/>
          <path d="M22 2L15 22L11 13L2 9L22 2Z"/>
        </svg></span>
        <span class="sa-label">공유</span>
      </button>

      <button class="shorts-action-btn goto shorts-goto" data-goto="${item.id}" aria-label="게시물">
        <span class="sa-ic"><svg viewBox="0 0 24 24">
          <path d="M4 5a1 1 0 0 1 1-1h9l6 6v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/>
          <path d="M14 4v6h6"/>
        </svg></span>
        <span class="sa-label">게시물</span>
      </button>
    </div>
    `;

    track.appendChild(section);
  });

  currentIndex = Math.max(
    0,
    shortsList.findIndex(v => v.id === startId)
  );

  /* 🔥 추가: 쇼츠 복귀용 상태 저장 */
  sessionStorage.setItem("__SHORTS_RETURN__", JSON.stringify({
    list: shortsList,
    index: currentIndex,
    issueId: shortsList[currentIndex]?.id
  }));

  // 🔒 shorts-open 모드 명시 (vote / index 충돌 방지)
  document.body.classList.add("shorts-open");
  window.__CURRENT_SHORT_ISSUE_ID__ = shortsList[currentIndex]?.id || null;

  bindGestures();
  bindWheel();
  bindTapControls();
  bindKeyboard();

  moveToIndex(currentIndex, true);

  updateShortsVoteBar();

  document.body.style.overflow = "hidden";

  const voteBar = overlay.querySelector("#shortsVoteBar");
  voteBar?.addEventListener("click", e => {
    e.preventDefault();
    e.stopPropagation();

    const btn = e.target.closest(".vote-btn");
    if (!btn) return;

    const type = btn.dataset.vote;
    const issueId = voteBar.dataset.issueId;

    if (window.GALLA_VOTE && issueId) {
      window.GALLA_VOTE(issueId, type, { scope: "shorts" });
    }
  });

  // 음소거 토글(전역 사운드 선호와 통일)
  const muteBtn = overlay.querySelector("#shortsMuteBtn");
  const syncMute = () => {
    const on = window.GALLA_soundOn ? window.GALLA_soundOn() : !window.__REELS_MUTED__;
    overlay.classList.toggle("is-muted", !on);
  };
  muteBtn?.addEventListener("click", e => {
    e.stopPropagation();
    if (window.GALLA_setSound) window.GALLA_setSound(!(window.GALLA_soundOn && window.GALLA_soundOn()));
    else window.__REELS_MUTED__ = !window.__REELS_MUTED__;
    const cur = document.querySelectorAll("#shortsTrack video")[currentIndex];
    if (cur) cur.muted = !!window.__REELS_MUTED__;
    syncMute();
  });
  window.addEventListener("galla:sound", syncMute);
  syncMute();
}

/* 진행바: 현재 영상의 재생 위치를 하단 바에 반영 */
function bindShortsProgress(v) {
  const fill = document.getElementById("shortsProgressFill");
  if (!fill) return;
  if (window.__shortsProgVideo && window.__shortsProgHandler) {
    window.__shortsProgVideo.removeEventListener("timeupdate", window.__shortsProgHandler);
  }
  const h = () => { if (v.duration) fill.style.width = (v.currentTime / v.duration * 100) + "%"; };
  v.addEventListener("timeupdate", h);
  window.__shortsProgVideo = v;
  window.__shortsProgHandler = h;
  h();
}

/* =========================
   MOVE / PLAY
========================= */
function moveToIndex(idx, instant = false) {
  // 범위를 벗어나면 끝으로 스냅(항상 transform 재설정 → 드래그 잔상/튐 방지)
  idx = Math.max(0, Math.min(shortsList.length - 1, idx));

  currentIndex = idx;

  track.style.transition = instant ? "none" : "transform 0.35s cubic-bezier(.4,0,.2,1)";
  // 🔥 실제 화면 높이 기준 이동 (모바일 주소창 / iOS 대응)
  track.style.transform = `translateY(-${idx * VIEWPORT_H}px)`;
  window.__CURRENT_SHORT_ISSUE_ID__ = shortsList[currentIndex]?.id || null;

  playOnlyCurrent();
  updateShortsVoteBar();
  syncVote();
}

function playOnlyCurrent() {
  document.querySelectorAll("#shortsTrack video").forEach((v, i) => {
    if (i === currentIndex) {
      // 🔁 무한 재생 (사용자가 멈출 때까지)
      v.loop = true;
      v.setAttribute("loop", "");
      // 소리는 기본 ON, 사용자가 음소거하면 다음 영상까지 그 상태 유지(스티키)
      v.muted = !!window.__REELS_MUTED__;

      // 이어보기: 인덱스에서 넘어온 재생 위치 적용(해당 아이템 최초 활성화 시 1회)
      const seek = window.__SHORTS_PENDING_SEEK__;
      if (seek && shortsList[currentIndex] && seek.id === shortsList[currentIndex].id) {
        const apply = () => { try { if (v.duration && seek.time < v.duration - 0.3) v.currentTime = seek.time; } catch (_) {} };
        if (v.readyState >= 1) apply();
        else v.addEventListener("loadedmetadata", apply, { once: true });
        window.__SHORTS_PENDING_SEEK__ = null;
      }

      // 진행바 연결(현재 영상 timeupdate)
      bindShortsProgress(v);

      const playPromise = v.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(err => {
          if (err && err.name === "NotAllowedError") {
            // 진짜 자동재생 정책 차단(제스처 없음)일 때만 음소거로 폴백
            v.muted = true;
            v.play().catch(() => {});
          } else {
            // 데이터 부족 등 → 소리 유지한 채 준비되면 재시도(느린 R2 대응)
            v.addEventListener("canplay", () => {
              v.muted = !!window.__REELS_MUTED__;
              v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
            }, { once: true });
          }
        });
      }
      v.playbackRate = 1;
    } else {
      v.pause();
      v.currentTime = 0;
    }
  });
}

/* =========================
   TOUCH GESTURE
========================= */
function bindGestures() {
  overlay.addEventListener("touchstart", e => {
    if (window.__COMMENT_OPEN__) return;
    isDragging = true;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    currentTranslateY = -currentIndex * VIEWPORT_H;
    track.style.transition = "none";
  }, { passive: true });

  overlay.addEventListener("touchmove", e => {
    if (window.__COMMENT_OPEN__) return;
    if (!isDragging) return;

    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;

    if (Math.abs(dx) > Math.abs(dy)) {
      // 🔒 block vertical movement, but DO NOT move track horizontally
      return;
    }

    track.style.transform = `translateY(${currentTranslateY + dy}px)`;
  }, { passive: true });

  overlay.addEventListener("touchend", e => {
    if (window.__COMMENT_OPEN__) return;
    isDragging = false;
    track.style.transition = "transform 0.35s cubic-bezier(.4,0,.2,1)";
    track.style.opacity = "1";

    const dy = e.changedTouches[0].clientY - startY;
    const dx = e.changedTouches[0].clientX - startX;
    const horizontal = Math.abs(dx) > Math.abs(dy);

    // 👉 오른쪽으로 확실히 밀면 → 릴스만 닫고 원래 피드로 복귀 (딴 페이지로 안 감)
    if (horizontal && dx > CLOSE_THRESHOLD_X) {
      closeShorts();
      return;
    }

    // 가로 스와이프(왼쪽/애매한 대각선)는 아무 이동 없이 제자리 스냅
    if (horizontal) {
      moveToIndex(currentIndex);
      return;
    }

    // 세로 스와이프 → 릴스 한 칸씩 (범위 밖이면 clamp되어 제자리 스냅)
    if (dy < -SWIPE_THRESHOLD) moveToIndex(currentIndex + 1);
    else if (dy > SWIPE_THRESHOLD) moveToIndex(currentIndex - 1);
    else moveToIndex(currentIndex);
  });
}

/* =========================
   TAP / DOUBLE TAP
========================= */
/* 릴스 조작:
   - 한 번 탭  → 음소거 토글 (음소거하면 다음 영상까지 유지)
   - 더블 탭 후 누르고 있기 → 누르는 동안 2배속, 떼면 1배속
*/
function reelBadge(section, text, isSpeed) {
  if (!section) return null;
  let b = section.querySelector(`.reel-badge.${isSpeed ? "speed" : "mute"}`);
  if (!b) {
    b = document.createElement("div");
    b.className = `reel-badge ${isSpeed ? "speed" : "mute"}`;
    section.appendChild(b);
  }
  b.textContent = text;
  return b;
}
function flashBadge(section, text) {
  const b = reelBadge(section, text, false);
  if (!b) return;
  b.classList.add("show");
  clearTimeout(b.__t);
  b.__t = setTimeout(() => b.classList.remove("show"), 650);
}
function showSpeedBadge(section, on) {
  const b = reelBadge(section, "2배속 ⏩", true);
  if (!b) return;
  b.classList.toggle("show", on);
}

function curVideoAndSection() {
  const video = document.querySelectorAll("#shortsTrack video")[currentIndex];
  const section = document.querySelectorAll(".short")[currentIndex];
  return { video, section };
}

function bindTapControls() {
  let tapTimer = null;
  let waitingSecond = false;
  let holding2x = false;
  let downX = 0, downY = 0, moved = false;

  const isControl = t =>
    t.closest &&
    t.closest(".shorts-vote,.vote-btn,.shorts-actions,.shorts-action-btn,#shortsCloseBtn,.shorts-top,.author-follow,.shorts-goto,#shortsCommentModal,[data-profile-uid]");

  overlay.addEventListener("pointerdown", e => {
    if (isControl(e.target)) return;
    downX = e.clientX; downY = e.clientY; moved = false;
    if (waitingSecond) {
      // 더블탭의 두 번째 탭 → 누르는 동안 2배속
      if (tapTimer) { clearTimeout(tapTimer); tapTimer = null; }
      waitingSecond = false;
      const { video, section } = curVideoAndSection();
      if (video) { video.playbackRate = 2; holding2x = true; showSpeedBadge(section, true); }
    }
  });

  overlay.addEventListener("pointermove", e => {
    if (Math.abs(e.clientX - downX) > 12 || Math.abs(e.clientY - downY) > 12) moved = true;
  });

  const endHold = () => {
    if (!holding2x) return;
    holding2x = false;
    const { video, section } = curVideoAndSection();
    if (video) video.playbackRate = 1;
    showSpeedBadge(section, false);
  };

  overlay.addEventListener("pointerup", e => {
    if (isControl(e.target)) { endHold(); return; }
    if (holding2x) { endHold(); return; }
    if (moved) { // 스와이프였음 → 탭 아님
      if (tapTimer) { clearTimeout(tapTimer); tapTimer = null; }
      waitingSecond = false;
      return;
    }
    // 깔끔한 탭 → 더블탭 여부 확인 후 단일 탭이면 음소거 토글
    waitingSecond = true;
    tapTimer = setTimeout(() => {
      waitingSecond = false; tapTimer = null;
      const { video, section } = curVideoAndSection();
      if (!video) return;
      // 전역 선호를 뒤집어 인덱스·이슈와 통일 (현재 뮤트면 → 켜기)
      if (window.GALLA_setSound) window.GALLA_setSound(window.__REELS_MUTED__);
      else window.__REELS_MUTED__ = !window.__REELS_MUTED__;
      video.muted = window.__REELS_MUTED__;
      flashBadge(section, window.__REELS_MUTED__ ? "🔇 음소거" : "🔊 소리 켜짐");
    }, 260);
  });

  overlay.addEventListener("pointercancel", endHold);
}

/* =========================
   WHEEL (PC)
========================= */
function bindWheel() {
  let lock = false;
  let unlockTimer = null;
  overlay.addEventListener("wheel", e => {
    e.preventDefault();
    // 관성/연속 휠이 들어오는 동안 계속 잠금 유지 → 스크롤 1번 = 릴스 1칸
    clearTimeout(unlockTimer);
    unlockTimer = setTimeout(() => { lock = false; }, 260);

    if (lock) return;
    if (Math.abs(e.deltaY) < 8) return;   // 미세 스크롤 무시
    lock = true;

    if (e.deltaY > 0) moveToIndex(currentIndex + 1);
    else moveToIndex(currentIndex - 1);
  }, { passive: false });
}

/* =========================
   KEYBOARD
========================= */
function bindKeyboard() {
  window.addEventListener("keydown", e => {
    if (!overlay) return;
    if (e.key === "ArrowDown") moveToIndex(currentIndex + 1);
    if (e.key === "ArrowUp") moveToIndex(currentIndex - 1);
    if (e.key === "Escape") closeShorts();
  });
}

/* =========================
   VOTE SYNC (기존 시스템 연동)
========================= */
function syncVote() {
  const issueId = shortsList[currentIndex].id;
  if (window.GALLA_CHECK_VOTE) {
    window.GALLA_CHECK_VOTE(issueId, { force: true });
  }
}

function updateShortsVoteBar() {
  const bar = document.getElementById("shortsVoteBar");
  if (!bar) return;
  const issueId = shortsList[currentIndex]?.id;
  bar.dataset.issueId = issueId;
  // Guard for missing issueId, and log
  if (!issueId) {
    console.warn("[SHORTS][VOTE] missing issueId");
    return;
  }
  console.info("[SHORTS][VOTE] sync issueId =", issueId);
  // Sync issueId onto each vote button, and reset active-vote class
  // 진영명(있으면) 반영 — 없으면 기본 찬성/반대
  const cur = shortsList[currentIndex] || {};
  const proBtn = bar.querySelector('.vote-btn.pro');
  const conBtn = bar.querySelector('.vote-btn.con');
  if (proBtn) proBtn.textContent = `👍 ${cur.faction_a || "찬성이오"}`;
  if (conBtn) conBtn.textContent = `👎 ${cur.faction_b || "난 반댈세"}`;

  bar.querySelectorAll(".vote-btn").forEach(btn => {
    btn.dataset.issueId = issueId;
    btn.classList.remove("active-vote");
  });
  if (window.GALLA_CHECK_VOTE) {
    window.GALLA_CHECK_VOTE(issueId, { force: true, scope: "shorts" });
  }
}

/* =========================
   CLOSE
========================= */
function closeShorts() {
  // 이어보기(역방향): 현재 릴스 재생 위치를 인덱스 인라인 영상에 반영
  try {
    const cur = document.querySelectorAll("#shortsTrack video")[currentIndex];
    const id = shortsList[currentIndex]?.id;
    if (cur && id != null && cur.currentTime > 0.3) {
      const inline = document.getElementById("vid-" + id);
      if (inline) inline.currentTime = cur.currentTime;
    }
  } catch (_) {}
  document.body.style.overflow = "";
  document.body.classList.remove("shorts-open");
  window.__CURRENT_SHORT_ISSUE_ID__ = null;
  if (overlay) {
    track = null;
    overlay.remove();
    overlay = null;
  }
}

/* =========================
   EXPORT
========================= */
window.__OPEN_SHORTS_INTERNAL__ = __openShortsInternal;
window.__SHORTS_ENGINE_READY__ = true;
console.info("[SHORTS] engine ready");

if (window.__SHORTS_ENGINE_READY__ && window.__SHORTS_OPEN_QUEUE__.length) {
  window.__SHORTS_OPEN_QUEUE__.forEach(x =>
    window.__OPEN_SHORTS_INTERNAL__(x.list, x.startId)
  );
  window.__SHORTS_OPEN_QUEUE__ = [];
}

window.__FORCE_OPEN_SHORTS__ = function () {
  const list = (window.cards || []).filter(c => c.video_url)
    .map(c => ({ id: c.id, video_url: c.video_url }));
  if (!list.length) {
    alert("[SHORTS] no video cards");
    return;
  }
  window.__OPEN_SHORTS_INTERNAL__(list, list[0].id);
};
console.info("[SHORTS] FORCE_OPEN_SHORTS attached");

/* 릴스 → 게시물 본문 이동 (제목 탭) */
document.addEventListener("click", e => {
  const go = e.target.closest(".shorts-goto");
  if (!go || !go.dataset.goto) return;
  e.preventDefault();
  e.stopPropagation();
  location.href = `issue.html?id=${go.dataset.goto}`;
});

document.addEventListener("click", e => {
  const btn = e.target.closest(".shorts-action-btn");
  if (!btn) return;

  const short = btn.closest(".short");
  const issueId = Number(short?.dataset.issueId);
  if (!issueId) return;

  if (btn.classList.contains("comment")) {
    const modal = document.getElementById("shortsCommentModal");
    if (!modal) return;

    openCommentModal();
    loadShortsComments();
  }

  if (btn.classList.contains("share")) {
    console.log("[SHORTS] share issue:", issueId);
  }
});

function openCommentModal() {
  const modal = document.getElementById("shortsCommentModal");
  const sheet = modal?.querySelector(".comment-sheet");
  if (!modal || !sheet) return;
  if (window.__COMMENT_OPEN__) return;

  window.__COMMENT_OPEN__ = true;
  window.__COMMENT_STATE__ = "half";

  modal.classList.add("visible");
  document.body.classList.add("comment-open");

  const HALF_Y = Math.round(window.innerHeight * 0.45);

  sheet.style.transition = "none";
  sheet.style.transform = `translateX(-50%) translateY(${window.innerHeight}px)`;

  requestAnimationFrame(() => {
    sheet.style.transition = "transform 0.28s cubic-bezier(.4,0,.2,1)";
    sheet.style.transform = `translateX(-50%) translateY(${HALF_Y}px)`;
  });

  bindCommentDrag();
}

function closeCommentModal() {
  const modal = document.getElementById("shortsCommentModal");
  const sheet = modal?.querySelector(".comment-sheet");
  if (!modal || !sheet) return;

  sheet.style.transition = "transform 0.25s cubic-bezier(.4,0,.2,1)";
  sheet.style.transform = `translateX(-50%) translateY(${window.innerHeight}px)`;

  setTimeout(() => {
    modal.classList.remove("visible");
    document.body.classList.remove("comment-open");
    window.__COMMENT_OPEN__ = false;
    window.__COMMENT_STATE__ = "closed";

    const video = document.querySelectorAll("#shortsTrack video")[currentIndex];
    if (video) video.play().catch(() => {});
  }, 260);
}

function bindCommentDrag() {
  const modal = document.getElementById("shortsCommentModal");
  const sheet = modal?.querySelector(".comment-sheet");
  const list = sheet?.querySelector(".comment-list");
  if (!sheet || !list) return;

  let startY = 0;
  let startPos = 0;
  let currentPos = 0;
  let dragging = false;

  const FULL_Y = 0;
  const HALF_Y = Math.round(window.innerHeight * 0.45);
  const CLOSE_Y = Math.round(window.innerHeight * 0.85);

  sheet.ontouchstart = e => {
    if (isScrollableTarget(e.target) && list.scrollTop > 0) return;
    dragging = true;
    startY = e.touches[0].clientY;
    startPos = sheet.getBoundingClientRect().top;
    sheet.style.transition = "none";
  };

  sheet.ontouchmove = e => {
    if (!dragging) return;
    const dy = e.touches[0].clientY - startY;
    currentPos = Math.min(CLOSE_Y, Math.max(FULL_Y, startPos + dy));
    sheet.style.transform = `translateX(-50%) translateY(${currentPos}px)`;
  };

  sheet.ontouchend = () => {
    if (!dragging) return;
    dragging = false;
    sheet.style.transition = "transform 0.28s cubic-bezier(.4,0,.2,1)";

    if (currentPos > window.innerHeight * 0.6) {
      closeCommentModal();
      return;
    }

    if (currentPos < window.innerHeight * 0.25) {
      window.__COMMENT_STATE__ = "full";
      sheet.style.transform = `translateX(-50%) translateY(${FULL_Y}px)`;
    } else {
      window.__COMMENT_STATE__ = "half";
      sheet.style.transform = `translateX(-50%) translateY(${HALF_Y}px)`;
    }
  };

  // ===== PC MOUSE DRAG SUPPORT =====
  let mouseDragging = false;

  sheet.onmousedown = e => {
    // 댓글 리스트 스크롤 중이면 모달 드래그 막음
    if (isScrollableTarget(e.target) && list.scrollTop > 0) return;

    mouseDragging = true;
    startY = e.clientY;
    startPos = sheet.getBoundingClientRect().top;
    sheet.style.transition = "none";

    e.preventDefault();
  };

  window.onmousemove = e => {
    if (!mouseDragging) return;

    const dy = e.clientY - startY;
    currentPos = Math.min(CLOSE_Y, Math.max(FULL_Y, startPos + dy));
    sheet.style.transform = `translateX(-50%) translateY(${currentPos}px)`;
  };

  window.onmouseup = () => {
    if (!mouseDragging) return;
    mouseDragging = false;

    sheet.style.transition = "transform 0.28s cubic-bezier(.4,0,.2,1)";

    if (currentPos > window.innerHeight * 0.6) {
      closeCommentModal();
      return;
    }

    if (currentPos < window.innerHeight * 0.25) {
      window.__COMMENT_STATE__ = "full";
      sheet.style.transform = `translateX(-50%) translateY(${FULL_Y}px)`;
    } else {
      window.__COMMENT_STATE__ = "half";
      sheet.style.transform = `translateX(-50%) translateY(${HALF_Y}px)`;
    }
  };
}

document.addEventListener("click", e => {
  const modal = document.getElementById("shortsCommentModal");
  if (!modal || !modal.classList.contains("visible")) return;

  if (e.target.classList.contains("comment-dim")) {
    closeCommentModal();
  }
});

// =========================
// COMMENT STANCE TAB (STATE)
// =========================
document.addEventListener("click", e => {
  const tab = e.target.closest("#shortsCommentModal .stance-tab");
  if (!tab) return;

  e.preventDefault();
  e.stopPropagation();

  const stance = tab.dataset.stance;
  if (!stance) return;

  // 상태 저장
  window.currentCommentStance = stance;

  // UI 갱신
  document
    .querySelectorAll("#shortsCommentModal .stance-tab")
    .forEach(btn => btn.classList.remove("active"));

  tab.classList.add("active");

  // 댓글 다시 로딩
  loadShortsComments();
});


// =========================
// COMMENT LOAD (REAL DATA — issue comments 연동)
// =========================
const SC = {
  issueId: null,
  rows: [],           // 전체 댓글 rows
  profiles: {},       // user_id → {nickname, level}
  likeAgg: {},        // comment_id → {up, down}
  myLikes: new Map(), // comment_id → 1|-1
  myId: null,
  expanded: new Set() // 답글 펼침 상태
};
window.currentCommentStance = window.currentCommentStance || "pro";
window.currentCommentSort = window.currentCommentSort || "latest";

function scEsc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function scTimeAgo(iso) {
  if (!iso) return "";
  const t = new Date(iso.endsWith?.("Z") || iso.includes?.("+") ? iso : iso + "Z").getTime();
  const s = (Date.now() - t) / 1000;
  if (s < 60) return "방금 전";
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86400)}일 전`;
}
function scNick(r) {
  if (r.is_anonymous) return "익명";
  return SC.profiles[r.user_id]?.nickname || "익명";
}
function scLevel(r) {
  if (r.is_anonymous) return "";
  const lv = SC.profiles[r.user_id]?.level;
  return lv ? `<span class="sc-lv">Lv.${lv}</span>` : "";
}

async function loadShortsComments() {
  const supabase = window.supabaseClient;
  const list = document.getElementById("shortsCommentList");
  if (!supabase || !list) return;

  const issueId = window.__CURRENT_SHORT_ISSUE_ID__;
  if (!issueId) { list.innerHTML = ""; return; }
  SC.issueId = issueId;

  list.innerHTML = `<div class="sc-empty">불러오는 중…</div>`;

  const { data: sess } = await supabase.auth.getSession();
  SC.myId = sess?.session?.user?.id || null;

  // 이슈 전황(찬반) + 진영 이름 + 댓글
  const [{ data: issue }, { data: rows }] = await Promise.all([
    supabase.from("issues")
      .select("pro_count,con_count,faction_a,faction_b").eq("id", issueId).single(),
    supabase.from("comments")
      .select("id,user_id,content,created_at,faction,parent_id,is_anonymous")
      .eq("issue_id", issueId).neq("status", "deleted")
      .order("created_at", { ascending: false }).limit(300)
  ]);
  // 로딩 중 스크롤로 이슈가 바뀌었으면 무시
  if (SC.issueId !== window.__CURRENT_SHORT_ISSUE_ID__) return;
  SC.rows = rows || [];

  // 전황 요약 갱신
  const pro = issue?.pro_count || 0, con = issue?.con_count || 0;
  const total = pro + con;
  const proPct = total ? Math.round(pro / total * 100) : 50;
  const modal = document.getElementById("shortsCommentModal");
  const bar = modal.querySelector(".summary-bar");
  if (bar) {
    bar.querySelector(".pro").textContent = `${issue?.faction_a || "찬성이오"} ${proPct}%`;
    bar.querySelector(".con").textContent = `${issue?.faction_b || "난 반댈세"} ${100 - proPct}%`;
    bar.querySelector(".bar-pro").style.width = proPct + "%";
  }
  const participants = new Set(SC.rows.map(r => r.user_id).filter(Boolean)).size;
  const metaEl = modal.querySelector(".summary-meta");
  if (metaEl) metaEl.textContent = `(총 댓글 ${SC.rows.length} · 참여자 ${participants})`;

  // 탭 라벨도 진영 이름으로
  const tabPro = modal.querySelector('.stance-tab[data-stance="pro"]');
  const tabCon = modal.querySelector('.stance-tab[data-stance="con"]');
  if (tabPro) tabPro.textContent = issue?.faction_a || "찬성이오";
  if (tabCon) tabCon.textContent = issue?.faction_b || "난 반댈세";

  // 프로필 + 좋아요
  SC.profiles = {}; SC.likeAgg = {}; SC.myLikes = new Map();
  const userIds = [...new Set(SC.rows.map(r => r.user_id).filter(Boolean))];
  const ids = SC.rows.map(r => r.id);
  const [profRes, likeRes] = await Promise.all([
    userIds.length
      ? supabase.from("user_profiles").select("user_id,nickname,level").in("user_id", userIds)
      : Promise.resolve({ data: [] }),
    ids.length
      ? supabase.from("comment_likes").select("comment_id,user_id,value").in("comment_id", ids)
      : Promise.resolve({ data: [] })
  ]);
  (profRes.data || []).forEach(p => SC.profiles[p.user_id] = p);
  (likeRes.data || []).forEach(l => {
    const a = SC.likeAgg[l.comment_id] ||= { up: 0, down: 0 };
    if (l.value === 1) a.up++; else a.down++;
    if (SC.myId && l.user_id === SC.myId) SC.myLikes.set(l.comment_id, l.value);
  });

  renderShortsComments();
}

function renderShortsComments() {
  const list = document.getElementById("shortsCommentList");
  if (!list) return;

  const stance = window.currentCommentStance;
  const sort = window.currentCommentSort;

  const tops = SC.rows.filter(r => !r.parent_id && r.faction === stance);
  const byParent = {};
  SC.rows.forEach(r => { if (r.parent_id) (byParent[r.parent_id] ||= []).push(r); });

  const up = id => (SC.likeAgg[id]?.up || 0);
  if (sort === "popular") tops.sort((a, b) => up(b.id) - up(a.id));
  // latest는 이미 created_at desc 정렬 상태

  // 빌보드: 현재 진영 좋아요 상위 3 (1개 이상일 때만 노출)
  const billboard = document.getElementById("commentBillboard");
  const hot = [...tops].filter(c => up(c.id) > 0).sort((a, b) => up(b.id) - up(a.id)).slice(0, 3);
  if (billboard) {
    billboard.hidden = hot.length === 0;
    billboard.innerHTML = hot.map(c =>
      `<div class="billboard-item">🔥 <b>${scEsc(scNick(c))}</b> ${scEsc(c.content).slice(0, 40)} <span class="bb-like">👍${up(c.id)}</span></div>`
    ).join("");
  }

  if (!tops.length) {
    list.innerHTML = `<div class="sc-empty">아직 이 진영의 댓글이 없어요. 첫 포문을 여세요!</div>`;
    return;
  }

  const itemHtml = (c, isReply) => {
    const my = SC.myLikes.get(c.id);
    const replies = byParent[c.id] || [];
    return `
      <div class="sc-item ${isReply ? "sc-reply" : ""}" data-cid="${c.id}">
        <div class="sc-head">
          <b class="sc-nick ${c.faction === "pro" ? "pro" : "con"}">${scEsc(scNick(c))}</b>
          ${scLevel(c)}
          <span class="sc-time">${scTimeAgo(c.created_at)}</span>
        </div>
        <div class="sc-body">${scEsc(c.content)}</div>
        <div class="sc-acts">
          <button class="sc-like ${my === 1 ? "on" : ""}" data-cid="${c.id}">👍 ${up(c.id)}</button>
          ${!isReply && replies.length
            ? `<button class="sc-toggle" data-cid="${c.id}">답글 ${replies.length}개 ${SC.expanded.has(c.id) ? "접기" : "보기"}</button>`
            : ""}
        </div>
        ${!isReply && SC.expanded.has(c.id)
          ? `<div class="sc-replies">${replies.slice().reverse().map(r => itemHtml(r, true)).join("")}</div>`
          : ""}
      </div>`;
  };

  list.innerHTML = tops.map(c => itemHtml(c, false)).join("");
}

// ===== 댓글 상호작용: 정렬 / 답글 펼침 / 좋아요 =====
document.addEventListener("click", async e => {
  const modal = document.getElementById("shortsCommentModal");
  if (!modal || !modal.classList.contains("visible")) return;
  const supabase = window.supabaseClient;

  const sortBtn = e.target.closest("#shortsCommentModal .sort-btn");
  if (sortBtn) {
    window.currentCommentSort = sortBtn.dataset.sort;
    modal.querySelectorAll(".sort-btn").forEach(b => b.classList.toggle("active", b === sortBtn));
    renderShortsComments();
    return;
  }

  const tg = e.target.closest("#shortsCommentModal .sc-toggle");
  if (tg) {
    const cid = Number(tg.dataset.cid);
    if (SC.expanded.has(cid)) SC.expanded.delete(cid); else SC.expanded.add(cid);
    renderShortsComments();
    return;
  }

  const likeBtn = e.target.closest("#shortsCommentModal .sc-like");
  if (likeBtn && supabase) {
    if (!SC.myId) {
      if (confirm("로그인이 필요합니다. 로그인하시겠어요?")) location.href = "login.html";
      return;
    }
    const cid = Number(likeBtn.dataset.cid);
    const mine = SC.myLikes.get(cid);
    if (mine === 1) {
      await supabase.from("comment_likes").delete().eq("comment_id", cid).eq("user_id", SC.myId);
      SC.myLikes.delete(cid);
      if (SC.likeAgg[cid]) SC.likeAgg[cid].up = Math.max(0, SC.likeAgg[cid].up - 1);
    } else {
      const { error } = await supabase.from("comment_likes")
        .upsert({ comment_id: cid, user_id: SC.myId, value: 1 }, { onConflict: "comment_id,user_id" });
      if (!error) {
        (SC.likeAgg[cid] ||= { up: 0, down: 0 }).up++;
        SC.myLikes.set(cid, 1);
      }
    }
    renderShortsComments();
    return;
  }
});

// ===== 댓글 등록 (로그인 필수, 현재 진영 탭으로 등록) =====
document.addEventListener("click", async e => {
  if (!e.target.closest("#shortsCommentSend")) return;
  const supabase = window.supabaseClient;
  const input = document.getElementById("shortsCommentInput");
  if (!supabase || !input) return;

  const content = input.value.trim();
  if (!content) return;

  const { data: sess } = await supabase.auth.getSession();
  const uid = sess?.session?.user?.id;
  if (!uid) {
    if (confirm("로그인이 필요합니다. 로그인하시겠어요?")) location.href = "login.html";
    return;
  }

  const { error } = await supabase.from("comments").insert({
    issue_id: SC.issueId,
    user_id: uid,
    faction: window.currentCommentStance,
    content
  });
  if (error) { console.error("[SHORTS] comment insert", error); alert("댓글 등록 실패"); return; }

  input.value = "";
  loadShortsComments();
});
  // ===== Inject overlay styles for shorts actions (once) =====
  // (액션 레일 스타일은 css/shorts.css 로 이관 — 중복 주입 제거)