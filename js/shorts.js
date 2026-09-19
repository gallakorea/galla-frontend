/* =========================================================
   GALLA SHORTS / REELS ENGINE (FINAL)
   - index 기반 전환 (scroll 폐기)
   - transform + drag
   - 완전한 릴스/쇼츠 UX
========================================================= */

/* 같은 엔진이 다른 URL(?v=)로 두 번 실리면 문서 위임 핸들러가 두 벌 붙어 댓글·공유가 두 번 뜬다.
   먼저 실린 쪽만 창구(openShorts)와 위임을 가진다. */
const __SHORTS_DUP__ = window.__SHORTS_ENGINE_READY__ === true;
window.__SHORTS_OPEN_QUEUE__ = window.__SHORTS_OPEN_QUEUE__ || [];
window.__SHORTS_VOTING_LOCK__ = false;
window.currentCommentStance = "pro";   // pro | con
window.currentCommentSort = "latest"; // latest | popular

window.__COMMENT_OPEN__ = false;
window.__COMMENT_STATE__ = "closed"; // closed | half | full

/* 시트를 잡아끌면 안 되는 자리.
   ⚠️ 예전엔 .comment-list 만 뺐다. 그래서 **댓글 입력창을 누르면 시트 드래그가 시작**되고,
      touchend 에서 시트가 transform 으로 다시 자리를 잡으면서 그 탭이 클릭으로 이어지지 못했다
      = 입력창에 포커스가 안 잡힌다(실측 2026-08-28: 좌표를 세 번 바꿔 눌러도 타이핑이 안 들어감).
      입력·버튼 같은 조작 요소에서는 드래그를 시작하지 않는다. */
function isScrollableTarget(el) {
  if (!el || !el.closest) return false;
  return !!el.closest(".comment-list, .comment-input, input, textarea, button, [contenteditable]");
}

let shortsList = [];
let currentIndex = 0;
let overlay, track;
let SHORTS_ENTRY = 'detail';   // 좌상단은 어디서 열든 ‹(뒤로) — '+ 만들기'는 나갈 길을 막았다(2026-09-14)
let SHORTS_ON_CLOSE = null;    // 닫힐 때 부를 것(숏판 릴스 페이지 = 페이지째 뒤로)
/* 항목 = 이슈 | 숏판. 두 테이블 id 가 둘 다 bigint 라 숫자만으로는 겹친다 → 종류+id 로 가린다. */
const keyOf = (v) => (v && v._type === 'post' ? 'p' : 'i') + ':' + (v && Number(v.id));
const issueIdOf = (v) => (v && v._type !== 'post' ? v.id : null);
function normItem(v) {
  const post = v._type === 'post';
  return {
    _type: post ? 'post' : 'issue',
    id: Number(v.id),
    video_url: v.video_url,
    thumbnail_url: v.thumbnail_url || "",
    title: v.title || "",
    caption: v.caption || "",
    author: v.author || "익명",
    avatar_url: v.avatar_url || null,
    level: v.level != null ? v.level : "",
    category: v.category || "",
    user_id: v.user_id || "",
    faction_a: v.faction_a || "",
    faction_b: v.faction_b || "",
    like_count: v.like_count || 0,
    comment_count: v.comment_count || 0
  };
}

let isDragging = false;
let startX = 0;
let startY = 0;
let currentTranslateY = 0;
let velocityY = 0;

const SWIPE_THRESHOLD = 70;
const CLOSE_THRESHOLD_X = 120;

function getViewportHeight() {
  /* 정수로, 가능하면 트랙 실제 높이로 — visualViewport.height 는 851.33 같은 소수라 장 높이·재생기 top·
     스냅 자리가 1~3px 씩 어긋나, 멈춘 뒤 다시 맞추느라 한 번 더 움찔했다(26.9.15 폰 기록 849 → 852). */
  const el = track || overlay;
  const h = el && el.clientHeight ? el.clientHeight : (window.visualViewport ? window.visualViewport.height : window.innerHeight);
  return Math.round(h);
}

let VIEWPORT_H = getViewportHeight();

function updateViewportHeight() {
  const h = getViewportHeight();
  if (!h || h === VIEWPORT_H) return;   // 같은 높이면 손대지 않는다 — scrollTop 을 다시 넣으면 폰이 또 스냅했다
  VIEWPORT_H = h;

  if (track) {
    /* ⚠️ 예전엔 트랙 높이·위치만 다시 잡고 슬라이드 높이는 처음 값 그대로였다 → 창 크기·주소창·
       키보드로 높이가 한 번 바뀌면 칸마다 오차가 쌓여 **두 장 사이 반쯤에 걸린 화면**이 됐다(2026-09-14 사장님 캡처). */
    track.querySelectorAll("section.short").forEach(sec => { sec.style.height = `${h}px`; });
    if (POOL) POOL.forEach(p => { if (p.__idx >= 0) { p.style.top = `${p.__idx * h}px`; p.style.height = `${h}px`; } });
    if (!FINGER_DOWN) track.scrollTop = currentIndex * VIEWPORT_H;   // 네이티브 스크롤
    requestNativePaging();   // 한 장 높이가 바뀌었다 — 페이지 크기도 다시 — 지금 장 자리로 다시 맞춘다
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
if (!__SHORTS_DUP__) window.__SHORTS_ENGINE_READY__ = false;

if (!__SHORTS_DUP__) window.openShorts = function (list, startId, startTime, entry, opts) {
  try {
    if (typeof window.__OPEN_SHORTS_INTERNAL__ === "function") {
      window.__OPEN_SHORTS_INTERNAL__(list, startId, startTime, entry, opts);
    } else {
      console.warn("[SHORTS] __OPEN_SHORTS_INTERNAL__ missing, queueing");
      window.__SHORTS_OPEN_QUEUE__.push({ list, startId, startTime, entry, opts });
      document.addEventListener("DOMContentLoaded", () => {
        if (typeof window.__OPEN_SHORTS_INTERNAL__ === "function") {
          window.__OPEN_SHORTS_INTERNAL__(list, startId, startTime, entry, opts);
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
function __openShortsInternal(list, startId, startTime, entry, opts) {
  opts = opts || {};
  SHORTS_ENTRY = 'detail';
  SHORTS_ON_CLOSE = typeof opts.onClose === "function" ? opts.onClose : null;
  const startKey = (opts.startType === 'post' ? 'p' : 'i') + ':' + Number(startId);
  // 이어보기: 시작 아이템을 이 위치(초)부터 재생 (인덱스 인라인에서 넘어옴)
  window.__SHORTS_PENDING_SEEK__ = (startTime && startTime > 0.3) ? { key: startKey, time: startTime } : null;
  // 🔥 HARD FIX: 항상 video_url 있는 항목만, 순서 고정
  const seenKeys = new Set();
  shortsList = (list || [])
    .filter(v => v && v.video_url && (v._type !== 'post' || window.GALLA_ReelPost))   // 숏판 UI 모듈 없으면 숏판은 뺀다
    .map(normItem)
    .filter(v => { const k = keyOf(v); if (seenKeys.has(k)) return false; seenKeys.add(k); return true; });
  if (!shortsList.length) return;

  // 릴스 진입 = 몰입 뷰 → 소리 ON (전역 통일). 여기서 음소거하면 인덱스로도 이어진다.
  if (window.GALLA_enterImmersive) window.GALLA_enterImmersive();
  else window.__REELS_MUTED__ = false;

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
        <button id="shortsCloseBtn" class="sh-icon-btn" aria-label="뒤로">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <!-- 상단 음성 버튼 제거(사장님 확정) — 음소거는 화면 탭으로 토글, 상태는 중앙 배지로 안내 -->
      </div>
      <div id="shortsTrack"></div>
      <div id="shortsProgress"><div id="shortsProgressFill"></div></div>
      <div id="shortsVoteBar" class="shorts-vote gv"></div>
    </div>
  `;
  // ===== Inject overlay styles for shorts meta (once) =====
  if (!document.getElementById("shortsMetaStyle")) {
    const style = document.createElement("style");
    style.id = "shortsMetaStyle";
    style.textContent = `
.shorts-meta{
  position:absolute; left:16px; right:84px;
  bottom:calc(env(safe-area-inset-bottom) + 172px);  /* 통합 진영바(약 135px) 위로 — 가림 방지 */
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
  background:linear-gradient(135deg,#c9d1e0,#ff9b4d);
}
.author-info{ display:flex; flex-direction:column; gap:5px; min-width:0; }
.author-line{ display:flex; align-items:center; gap:7px; font-size:15.5px; font-weight:800; line-height:1.15; }
.author-name{ text-shadow:0 1px 6px rgba(0,0,0,.75); }
.author-level{
  font-size:11px; padding:2px 8px; border-radius:999px; font-weight:800;
  background:rgba(201,209,224,.2); color:#c9d1e0; border:1px solid rgba(201,209,224,.42);
}
.shorts-cat{ font-size:12px; color:#c9d1e0; font-weight:700; opacity:.95; text-shadow:0 1px 4px rgba(0,0,0,.6); }
.shorts-title{
  margin-top:2px; font-size:14.5px; font-weight:600; line-height:1.42; color:#f2f3f5;
  text-shadow:0 1px 6px rgba(0,0,0,.7);
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
}
.shorts-goto{ cursor:pointer; }
.shorts-goto:active{ opacity:.7; }
.shorts-goto-chip, .author-follow{ display:none; }
/* iOS는 cursor:pointer 없으면 click을 디스패치 안 함 → 탭 대상 전부 지정 */
.author-name, .author-avatar-link, .author-avatar, .author-avatar-init{ cursor:pointer; }
.shorts-action-btn{ cursor:pointer; }
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
    .sc-more{ margin-left:auto; align-self:center; background:none; border:none; color:#8a8f9a; font-size:18px; line-height:1; padding:2px 8px; cursor:pointer; }
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
    touchAction: "pan-y",   // 세로는 폰 자체 스크롤이 처리한다(릴스 트랙)
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
  // 좌상단 = 뒤로(릴스 닫기). 어디서 열었든 같다.
  closeBtn.onclick = () => closeShorts();

  /* ===== track ===== */
  /* 🔴 5차(사장님 "전혀 달라지는 게 없다"): 손가락을 JS(touchmove→transform)로 따라가게 했더니
     아이폰 120Hz 화면에서 초당 60번·한 박자 늦게 따라왔다. 곡선을 다듬어도 체감이 안 바뀐다.
     인스타처럼 **폰 자체 스크롤 + 한 장씩 멈춤(scroll-snap)** 으로 바꾼다 — 끄는 동안·관성·멈춤을
     OS 가 처리하고, JS 는 멈춘 뒤에만 재생·진영바를 바꾼다. */
  Object.assign(track.style, {
    position: "absolute", inset: "0", width: "100%", height: "100%",
    overflowY: "auto", overflowX: "hidden",
    scrollSnapType: "y mandatory",
    overscrollBehavior: "contain",
    WebkitOverflowScrolling: "touch",
    touchAction: "pan-y",
    transform: "", transition: "", willChange: ""
  });

  // Remove any previous children in track
  track.innerHTML = "";

  shortsList.forEach(item => track.appendChild(buildSection(item)));

  currentIndex = Math.max(0, shortsList.findIndex(v => keyOf(v) === startKey));

  /* 🔥 추가: 쇼츠 복귀용 상태 저장 */
  sessionStorage.setItem("__SHORTS_RETURN__", JSON.stringify({
    list: shortsList,
    index: currentIndex,
    issueId: issueIdOf(shortsList[currentIndex])
  }));

  // 🔒 shorts-open 모드 명시 (vote / index 충돌 방지)
  document.body.classList.add("shorts-open");
  releaseFeedVideos();
  shortsNavHide(true);   // 셸 하단 nav 숨김(릴스는 풀스크린)
  window.__CURRENT_SHORT_ISSUE_ID__ = issueIdOf(shortsList[currentIndex]);   // 숏판이면 null — 투표·댓글이 엉뚱한 이슈로 가지 않게

  bindGestures();
  bindWheel();
  bindTapControls();
  bindKeyboard();

  moveToIndex(currentIndex, true, 0, true);
  // 오버레이가 보인 뒤 트랙 실제 높이로 한 번 맞춘다(열 때 계산한 높이는 소수·주소창 차이가 있다)
  requestAnimationFrame(() => { if (track && track.clientHeight) updateViewportHeight(); PAGING_TRIES = 0; requestNativePaging(); });

  document.body.style.overflow = "hidden";

  const voteBar = overlay.querySelector("#shortsVoteBar");
  voteBar?.addEventListener("click", async e => {
    e.preventDefault();
    e.stopPropagation();

    const btn = e.target.closest(".gv-btn");
    if (!btn) return;

    const type = btn.classList.contains("gv-pro") ? "pro" : "con";
    const issueId = voteBar.dataset.issueId;

    // 0) 로그인 필수 — 팝업 없이 '바로' 로그인 페이지로(사장님 확정: 릴스 위 모달은
    //    셸 nav가 떠서 지저분했다). 셸 iframe이면 최상위 문서를 통째로 이동.
    {
      let uid = null;
      try { const { data: s2 } = await window.supabaseClient.auth.getSession(); uid = s2?.session?.user?.id || null; } catch (e) {}
      if (!uid) { showShortsLoginPopup("진영 선택은 로그인 후 가능해요"); return; }
    }

    if (window.GALLA_VOTE && issueId) {
      // 0-1) 이미 투표했으면 서버 기준 잠금+안내 후 중단(변경 불가)
      if (window.GALLA_VoteBar && await window.GALLA_VoteBar.guardLocked(voteBar, issueId)) return;
      // 1) 낙관적 즉시 반영(첫 클릭에도 바로 움직임)
      if (window.GALLA_VoteBar) window.GALLA_VoteBar.applyVote(voteBar, type);
      // 2) 실제 투표 + 서버 수치로 조용히 수렴
      const stance = await window.GALLA_VOTE(issueId, type, { scope: "shorts" });
      if (window.GALLA_VoteBar && typeof window.GALLA_GET_VOTE_STATS === "function") {
        const s = await window.GALLA_GET_VOTE_STATS(issueId);
        if (s && voteBar.dataset.issueId == String(issueId)) window.GALLA_VoteBar.update(voteBar, s, { myStance: stance || type, animate: false });
      }
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
    const cur = curVideo();
    if (cur) cur.muted = !!window.__REELS_MUTED__;
    syncMute();
  });
  window.addEventListener("galla:sound", syncMute);
  syncMute();
}

/* 슬라이드 한 장 — 이슈는 배틀 UI(작성자·댓글·공유·갈비스·게시물 + 하단 고정 진영바),
   숏판은 GALLA_ReelPost(좋아요·댓글·공유·갈비스·후원·관리). 영상·넘기기·상단 버튼은 공통. */
/* 영상 첫 장면 그림 — 재생기가 아직 준비 안 됐을 때(빨리 넘길 때·처음 열 때·뒤로 갈 때) 검은 화면 대신 보인다.
   ⚠️ 옛 썸네일(3:4, 얼굴 크게 잡은 표지)은 영상과 구도가 달라 넘길 때 두 그림이 번갈아 번쩍였다(「뒤죽박죽」).
      이건 영상의 **0초 장면 그 자체**라 재생기가 그 위에 뜰 때 그림이 바뀌지 않는다.
   · 이슈(HLS): 영상 폴더의 poster.jpg (26.9.15 63개 일괄 생성, 새 업로드는 없으면 onerror 로 숨김)
   · 숏판(MP4): Cloudflare 영상 변환으로 0초 장면을 뽑는다(첫 요청 뒤 캐시) */
function posterOf(url) {
  if (!url) return "";
  if (/\/hls\/[a-f0-9]+\/video\.m3u8/i.test(url)) return url.replace(/video\.m3u8.*$/i, "poster.jpg");
  if (/^https:\/\/cdn\.galla\.im\/.+\.mp4(\?|$)/i.test(url)) return "https://cdn.galla.im/cdn-cgi/media/mode=frame,time=0s,width=480/" + url.split("?")[0];
  return "";
}
function addPoster(section, item) {
  const src = posterOf(item.video_url);
  if (!src) return;
  const img = document.createElement("img");
  img.className = "sh-poster"; img.alt = ""; img.decoding = "async";
  img.dataset.src = src;
  img.onerror = () => { img.removeAttribute("src"); img.dataset.src = ""; };
  section.prepend(img);
}
/* 첫 장면 그림은 지금 장 앞 1장 ~ 뒤 3장만 붙이고, 멀어진 건 뗀다(60장 전부 붙이면 폰 메모리). */
function syncPosters() {
  if (!track) return;
  const secs = track.querySelectorAll("section.short");
  for (let i = 0; i < secs.length; i++) {
    const img = secs[i].querySelector("img.sh-poster");
    if (!img || !img.dataset.src) continue;
    const near = i >= currentIndex - 1 && i <= currentIndex + 3;
    const far = i < currentIndex - 2 || i > currentIndex + 4;
    if (near && !img.getAttribute("src")) img.setAttribute("src", img.dataset.src);
    else if (far && img.getAttribute("src")) img.removeAttribute("src");
  }
}
function buildSection(item) {
  if (item._type === 'post') {
    const section = document.createElement("section");
    section.className = "short short-post";
    section.dataset.postId = item.id;
    if (item.user_id) section.dataset.authorId = item.user_id;
    Object.assign(section.style, { height: `${VIEWPORT_H}px`, width: "100%", maxWidth: "480px", margin: "0 auto", position: "relative", overflow: "hidden" });
    section.dataset.src = item.video_url;
    if (item.thumbnail_url) section.dataset.poster = item.thumbnail_url;
    section.innerHTML = window.GALLA_ReelPost.html(item);
    window.GALLA_ReelPost.wire(section, item, {
      remove: () => removeSlide(section),
      leave: (fn) => { closeShortsSilently(); fn(); }
    });
    addPoster(section, item);
    return section;
  }
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

  section.dataset.src = item.video_url;
  if (item.thumbnail_url) section.dataset.poster = item.thumbnail_url;
  section.innerHTML = `

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

    <!-- 후원 — 숏판 릴스(reels-mix)와 같은 자리·아이콘. 이슈 작성자에게 GC(openDonate, 26.9.19 사장님) -->
    <button class="shorts-action-btn support" aria-label="후원">
      <span class="sa-ic"><svg viewBox="0 0 24 24"><circle cx="11" cy="13" r="8.2"/><path d="M6.9 9.6l1.8 7 2.3-5 2.3 5 1.8-7"/><path d="M6.2 12.4h9.6"/><path d="M19.6 1.8v4.4M17.4 4h4.4" stroke-width="1.6"/></svg></span>
      <span class="sa-label">후원</span>
    </button>

    <button class="shorts-action-btn galvis" data-galvis data-gv-type="issue" data-gv-id="${item.id}" data-gv-title="${String(item.title || "").replace(/"/g, "&quot;").slice(0, 120)}" aria-label="갈비스와 얘기">
      <span class="sa-ic"><svg viewBox="0 0 24 24" fill="none" class="gv-galvis" stroke="currentColor"><circle cx="12" cy="12" r="8.2" stroke-width="1.5" stroke-dasharray="2.3 2.2"/><circle cx="12" cy="12" r="4.7" stroke-width="1.3"/><circle cx="12" cy="12" r="1.9" fill="currentColor" stroke="none"/></svg></span>
      <span class="sa-label">갈비스</span>
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

  wireSlideControls(section, item);
  addPoster(section, item);
  return section;
}

/* 🎁 이슈 후원 — 홈엔 donate.js 가 안 실려 있어 누를 때 싣는다(숏판 릴스와 같은 방식) */
async function supportIssue(item) {
  let uid = null;
  try { const { data } = await window.supabaseClient.auth.getSession(); uid = data?.session?.user?.id || null; } catch (_) {}
  const say = (m) => (window.showToast || window.GALLA_toast || alert)(m);
  if (!uid) { (window.GALLA_needLogin || say)("로그인하고 후원할 수 있어요"); return; }
  if (item.user_id && item.user_id === uid) { say("내 이슈예요"); return; }
  if (!window.openDonate) {
    await new Promise((res) => {
      const sc = document.createElement("script");
      sc.src = "/js/donate.js?v=" + (window.GALLA_V || "1");
      sc.onload = sc.onerror = res; document.head.appendChild(sc);
    });
  }
  if (window.openDonate) window.openDonate(item.id, item.author || "");
  else say("후원 준비 중");
}

/* 삭제된 슬라이드를 걷어낸다(숏판 ⋯ 삭제). 마지막 한 장이면 릴스를 닫는다. */
function removeSlide(section) {
  if (!track) return;
  const secs = Array.from(track.querySelectorAll("section.short"));
  const i = secs.indexOf(section);
  if (i < 0) return;
  shortsList.splice(i, 1);
  if (POOL) POOL.forEach(p => { p.__idx = -1; });
  section.remove();
  if (!shortsList.length) { closeShorts(); return; }
  moveToIndex(Math.min(i, shortsList.length - 1), true, 0, true);
}

/* 이슈 릴스에 숏판을 섞는다 — 열린 뒤 도착한 것을 '지금 보는 다음 장' 뒤쪽에만 끼운다
   (이미 본 앞쪽 순서·현재 위치는 건드리지 않는다). every=2 → 이슈 2장마다 숏판 1장. */
window.GALLA_shortsMix = function (posts, every) {
  if (!overlay || !track || !shortsList.length || !window.GALLA_ReelPost) return;
  every = every || 2;
  const have = new Set(shortsList.map(keyOf));
  const add = (posts || []).filter(v => v && v.video_url).map(v => normItem({ ...v, _type: 'post' })).filter(v => !have.has(keyOf(v)));
  if (!add.length) return;
  const cut = Math.min(shortsList.length, currentIndex + 2);
  const tail = shortsList.slice(cut), out = [];
  let pi = 0;
  tail.forEach((it, i) => { out.push(it); if ((i + 1) % every === 0 && pi < add.length) out.push(add[pi++]); });
  while (pi < add.length) out.push(add[pi++]);
  /* ⚠️ 예전엔 cut 뒤 장들을 지우고 다시 그렸다 — 폰에서 그 '다시 그린 첫 장'을 재생하는 순간 웹뷰가
     죽었다(26.9.14 실기기, 세 빌드 모두 두 번째 넘기기). 이제 이미 있는 장은 건드리지 않고 숏판 장만 끼운다. */
  const fresh = new Set(add);
  const tailSecs = Array.from(track.querySelectorAll("section.short")).slice(cut);
  let ti = 0;
  out.forEach(it => {
    if (fresh.has(it)) track.insertBefore(buildSection(it), tailSecs[ti] || null);
    else ti++;
  });
  shortsList = shortsList.slice(0, cut).concat(out);
  if (POOL) { POOL.forEach(p => { if (p.__idx >= cut) p.__idx = -1; }); scheduleAhead(); }
  requestNativePaging();   // 장 수가 늘었다   // 뒤쪽 번호가 밀렸다 — 미리 받기를 곧바로 다시 채운다
};

/* 영상 연결을 끊고 버퍼를 반납한다(재생기 수를 늘 최소로). */
function releaseVideo(v) {
  try { v.pause(); } catch (_) {}
  try { if (window.GALLA_detachHls) window.GALLA_detachHls(v); } catch (_) {}
  v._hlsUrl = null;
  v._srcReady = false;          // 홈 피드 규약(ensureVideoSrc) — 다시 보이면 홈이 알아서 다시 붙인다
  v.removeAttribute("src");
  v.preload = "none";
  try { v.load(); } catch (_) {}
}
/* 재생기 3개(돌려쓰기). i 번째 장 = POOL[i % 3] — 지금 장 + 앞으로 두 장을 미리 받아 둔다.
   ⚠️ 2개일 땐 다음 한 장만, 그것도 멈춘 뒤에 준비를 시작해 연달아 넘기면 로딩이 보였다(사장님: 전환 시 로딩이 느리다).
      3개 동시는 폰에서 문제없었다(튕김은 '새 재생기가 쌓여서'였고, 돌려쓰면 쌓이지 않는다). */
/* 투명 1px — 재생기 기본 그림. 안드로이드 웹뷰가 첫 프레임 전·로딩 실패 때 그리는 회색 재생 아이콘을 없앤다(26.9.15 에뮬). */
const BLANK_POSTER = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
let POOL = null;
function pool() {
  if (!POOL) {
    POOL = [0, 1, 2].map(() => {
      const v = document.createElement("video");
      v.className = "sh-player";
      v.setAttribute("playsinline", ""); v.setAttribute("webkit-playsinline", "");
      v.muted = true; v.loop = true; v.preload = "auto";
      v.poster = BLANK_POSTER;
      v.__idx = -1;
      return v;
    });
  }
  return POOL;
}
function sectionAt(i) { return track ? track.querySelectorAll("section.short")[i] || null : null; }
/* 재생기 p 를 i 번째 장 자리에 두고 그 장 영상을 붙인다(이미 그 장이면 그대로 — 다시 받지 않는다).
   ⚠️ 재생기를 장(section) 사이로 옮겨 달면 아이폰 웹킷이 끄는 동안 그 영상을 못 그렸다 — 손가락을 대는
      순간 영상이 검게 사라졌다(26.9.14 사장님 녹화, 0.25초 단위로 확인). 재생기는 트랙에 **한 번만** 붙이고
      절대 옮기지 않는다. 맡은 장이 바뀌면 위치(top)만 바꾼다. 트랙이 움직이면 같이 움직인다. */
function placePlayer(p, i) {
  const sec = sectionAt(i);
  if (!sec || !sec.dataset.src) return;
  if (p.parentNode !== track) track.appendChild(p);
  p.style.top = `${i * VIEWPORT_H}px`;
  p.style.height = `${VIEWPORT_H}px`;
  if (p.__idx !== i || !p._hlsUrl) {
    releaseVideo(p);
    p.__idx = i; p.__sig = 0; p.__primed = -1; p.__priming = -1;
    p.preload = "auto";
    /* 재생기에는 poster 를 달지 않는다(썸네일도 깔지 않는다 — 영상과 구도가 달라 번쩍였다).
       대기 중인 다음 장은 primeFirstFrame 이 첫 장면을 미리 그려 둔다. */
    p.poster = BLANK_POSTER;   // 안드로이드 웹뷰는 poster 가 없으면 회색 큰 재생 아이콘을 그려 밑의 첫 장면 그림을 가렸다
    if (window.GALLA_attachHls) window.GALLA_attachHls(p, sec.dataset.src);
    else p.setAttribute("src", sec.dataset.src);
  }
}
let LAST_SNAP_MS = 0;
let LAST_DIR = 1;          // 마지막으로 넘긴 방향(+1 앞, -1 뒤) — 미리 받을 장을 고른다
let FINGER_DOWN = false;   // 손가락이 트랙에 닿아 있는 동안은 장을 확정하지 않는다
let EARLY = -1;            // 손 뗀 뒤 멈추기 전에 미리 재생을 시작한 장
/* 미리 받아 둘 장 — 앞으로 넘기는 중이면 다음 두 장, 뒤로 넘기는 중이면 앞뒤 한 장씩.
   (재생기가 3개라 i-1 과 i+2 는 같은 재생기다. 뒤로 가던 사람이 또 뒤로 가면 바로 나오게) */
function aheadWanted() {
  const i = currentIndex;
  return LAST_DIR < 0 ? [i - 1, i + 1] : [i + 1, i + 2];
}
/* 지금 장 말고 나머지 재생기에 미리 받을 장을 채운다. 떠나는 재생기는 멈추기만 하고
   deferMs 뒤에 자리를 옮긴다(넘기는 동작 중에 옮기면 그 장이 번쩍였다). */
function fillAhead(deferMs) {
  const P = pool(), N = P.length, cur = P[currentIndex % N];
  const wanted = aheadWanted().filter(w => w >= 0 && w < shortsList.length);
  P.forEach(p => {
    if (p === cur) return;
    if (p.__priming === p.__idx && wanted.includes(p.__idx)) return;   // 첫 장면 그리는 중 — 끊지 않는다
    try { p.pause(); } catch (_) {}
  });
  wanted.forEach(want => {
    const p = P[want % N];
    if (p === cur) return;
    clearTimeout(p.__deferT);
    if (p.__idx === want) { primeFirstFrame(p); return; }
    const go = () => {
      if (!track || !aheadWanted().includes(want)) return;   // 그 사이 또 넘겼다
      placePlayer(p, want);
      primeFirstFrame(p);
    };
    if (deferMs > 0) p.__deferT = setTimeout(go, deferMs); else go();
  });
}
/* 이웃 장 미리 받기의 유일한 입구. 지금 장이 아직 안 받아졌으면(첫 열기·뒤로 넘기기) 지금 장이 재생된 뒤에 받는다
   — 셋이 동시에 받으면 대역폭을 나눠 첫 재생이 2초 걸렸다(26.9.15 폰 기록 1794ms, 셋 다 ▶).
   ⚠️ fillAhead 를 직접 부르지 말 것. 숏판 섞기가 열자마자 fillAhead(0) 을 불러 이 순서를 깨고 있었다. */
function scheduleAhead() {
  const P = pool(), cur = P[currentIndex % P.length];
  const defer = () => (LAST_SNAP_MS || 0) + 80;
  clearTimeout(cur.__aheadT);
  if (cur.__aheadGo) { cur.removeEventListener("playing", cur.__aheadGo); cur.__aheadGo = null; }
  if (cur.__idx !== currentIndex || cur.readyState >= 3) { fillAhead(defer()); return; }
  const mine = currentIndex;
  P.forEach(p => { if (p !== cur) { clearTimeout(p.__deferT); try { p.pause(); } catch (_) {} } });
  const go = () => {
    clearTimeout(cur.__aheadT);
    if (cur.__aheadGo) { cur.removeEventListener("playing", cur.__aheadGo); cur.__aheadGo = null; }
    if (mine === currentIndex && track) fillAhead(defer());
  };
  cur.__aheadGo = go;
  cur.addEventListener("playing", go, { once: true });
  cur.__aheadT = setTimeout(go, 1500);
}
/* 대기 중인 장 재생기에 첫 장면을 그려 둔다 — 소리 끈 채 잠깐 재생했다 멈춘다(아이폰은 멈춘 채로는
   첫 장면을 안 그려, 도착하는 순간 영상이 튀어나왔다). 그 사이 지금 장이 되면 그대로 재생을 이어간다.
   ⚠️ '그렸다' 표시는 실제로 장면이 준비된 뒤에만 한다 — 중간에 멈추면 다음 호출이 다시 시도한다. */
function primeFirstFrame(v) {
  if (!v || v.__idx < 0 || v.__primed === v.__idx || v.__priming === v.__idx) return;
  const idx = v.__idx;
  v.__priming = idx;
  const done = () => {
    if (v.__idx !== idx) return;
    v.__priming = -1;
    if (v.readyState >= 2) v.__primed = idx;
    if (idx !== currentIndex) { try { v.pause(); } catch (_) {} }
  };
  try {
    v.muted = true;
    const pr = v.play();
    if (pr && pr.then) pr.then(() => { if (v.readyState >= 2) done(); else v.addEventListener("loadeddata", done, { once: true }); })
      .catch(() => { if (v.__idx === idx) v.__priming = -1; });
    else done();
  } catch (_) { v.__priming = -1; }
}

/* 지금 장의 영상(재생기). 없으면 null. */
function curVideo() {
  const p = POOL && POOL[currentIndex % POOL.length];
  return p && p.__idx === currentIndex ? p : null;
}

/* 릴스를 여는 순간 홈 피드 카드 영상의 재생기를 전부 푼다. 홈은 스크롤한 만큼 영상을 붙여 두고
   절대 풀지 않아서, 그 위에 릴스 재생기가 얹히면 폰 웹뷰가 메모리 한도로 죽었다. */
function releaseFeedVideos() {
  document.querySelectorAll(".card-media video[data-src]").forEach(v => {
    if (v._hlsUrl || v.getAttribute("src")) releaseVideo(v);
  });
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
function moveToIndex(idx, instant = false, dur = 0, force = false) {
  if (!track) return;
  idx = Math.max(0, Math.min(shortsList.length - 1, idx));
  const target = idx * VIEWPORT_H;
  if (Math.abs(track.scrollTop - target) > 1) {
    if (instant) track.scrollTop = target;
    else { try { track.scrollTo({ top: target, behavior: "smooth" }); } catch (_) { track.scrollTop = target; } }
  }
  // 프로그램으로 바로 옮긴 경우(열기·삭제)는 곧바로 확정. 부드럽게 옮기면 스크롤이 멈춘 뒤 확정된다.
  if (instant || force) settleTo(idx, force);
}

/* 스크롤이 멈춘 자리 = 지금 장. 끄는 동안·관성 중에는 아무것도 안 한다(무거운 일은 멈춘 뒤). */
function settleTo(idx, force) {
  idx = Math.max(0, Math.min(shortsList.length - 1, idx));
  const early = EARLY === idx; EARLY = -1;
  const changed = force || idx !== currentIndex;
  if (idx !== currentIndex) LAST_DIR = idx > currentIndex ? 1 : -1;
  currentIndex = idx;
  window.__CURRENT_SHORT_ISSUE_ID__ = issueIdOf(shortsList[currentIndex]);   // 숏판이면 null
  if (!changed && !early) return;
  LAST_SNAP_MS = 0;          // 이미 멈춘 뒤라 떠나는 재생기는 화면 밖 — 곧바로 돌려도 된다
  if (changed) playOnlyCurrent();
  else scheduleAhead();   // 재생은 이미 시작됨 — 떠난 재생기만 이제 돌린다
  updateShortsVoteBar();
}
function onScrollSettle() {
  if (!track || !VIEWPORT_H) return;
  if (FINGER_DOWN) return;   // 끄는 중 잠깐 멈춘 것 — 손 뗄 때까지 장을 바꾸지 않는다
  settleTo(Math.round(track.scrollTop / VIEWPORT_H));
}
/* 손을 뗀 뒤 도착할 장이 반 넘게 들어오면 그 장 영상을 곧바로 튼다 — 멈춘 뒤에 틀면 「올라가다 멈추고
   그다음에 영상이 뜬다」(26.9.15 사장님). 떠나는 재생기는 멈추기만 하고, 자리 옮기기·진영바는 멈춘 뒤. */
/* 앱(iOS)에서만: 릴스 트랙(웹뷰 안 UIScrollView)에 UIKit 페이징을 켠다 — GallaBridgeVC 의 gallaReels.
   웹킷이 스크롤뷰를 새로 만들 수 있어 열 때·높이 바뀔 때·숏판 끼운 뒤·댓글 닫은 뒤 다시 요청한다.
   못 찾으면(스크롤뷰가 아직 안 올라옴) 0.3초 뒤 세 번까지 다시 찾는다. 웹은 그대로 scroll-snap. */
let PAGING_TRIES = 0;
function requestNativePaging(on = true) {
  try {
    const h = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.gallaReels;
    if (!h) return;
    if (!on) { PAGING_TRIES = 0; h.postMessage({ on: false }); return; }
    requestAnimationFrame(() => {
      if (!track || !track.clientHeight || !overlay || !document.body.contains(overlay)) return;
      h.postMessage({ on: true, contentH: track.scrollHeight, pageH: track.clientHeight });
    });
  } catch (_) {}
}
window.__gallaReelsPaging = function (ok) {
  window.__REELS_NATIVE_PAGING__ = !!ok;
  if (ok) { PAGING_TRIES = 0; return; }
  if (++PAGING_TRIES <= 3) setTimeout(() => requestNativePaging(), 300);
};
function commitEarly(k) {
  if (EARLY === k || k === currentIndex || k < 0 || k >= shortsList.length) return;
  EARLY = k;
  LAST_DIR = k > currentIndex ? 1 : -1;
  LAST_SNAP_MS = 900;        // 아직 움직이는 중 — 떠나는 장 재생기는 멈춘 뒤(settleTo)에 돌린다
  currentIndex = k;
  window.__CURRENT_SHORT_ISSUE_ID__ = issueIdOf(shortsList[k]);
  playOnlyCurrent();
}

function playOnlyCurrent() {
  /* 🔴 폰에서 두 장 넘기면 웹뷰가 죽었다(26.9.14 실기기 로그 「WebView process terminated」).
     60장 전부에 썸네일을 박고, 지나간 영상의 연결·버퍼를 한 번도 놓지 않아 메모리가 계속 쌓였다.
     인스타식 창: 영상은 현재±1 장만, 썸네일은 ±2 장만, 그 밖은 연결을 끊고 버퍼를 버린다
     → 몇 장을 넘기든 동시에 붙잡는 영상 ≤3, 썸네일 ≤5. */
  /* ⚠️ 2차(같은 날 실기기): ±1 장을 붙여도 두 번째 넘기기에서 또 죽었다. 푼 재생기의 메모리가
     바로 안 돌아와 1080p60 HLS 재생기가 사실상 4개 겹치는 순간(=두 번째 넘기기)이 한도였다.
     → 영상은 **지금 장 하나만** 연결한다. 다음 장은 썸네일만 깔아 넘기는 순간 그림은 바로 보이고
       영상이 뒤따른다. 지난 장은 넘기는 즉시 푼다. */
  /* 🔴 3차(실기기): 재생기를 풀어도 두 번째 넘기기에 또 죽었다 — 아이폰 웹뷰는 영상 요소마다 만든
     재생기 메모리를 바로 돌려주지 않아, 새 영상 요소를 재생할 때마다 쌓였다(홈 1 + 릴스 3 = 4번째에서 죽음).
     → 인스타식 **재생기 2개 돌려쓰기**: 릴스 전체에서 <video> 는 2개뿐이다. i 번째 장은 POOL[i%2] 가
       맡는다 — 지금 장이 재생하는 동안 다른 하나가 다음 장을 미리 받아 두므로, 넘기면 바로 재생된다.
       각 장에는 썸네일 그림만 둔다(±2 장만 그림을 붙인다). */
  /* ⚠️ 4차(사장님 녹화 16:18 + "뒤죽박죽·번쩍임"):
     · 썸네일(3:4, 얼굴 크게)을 영상(9:16) 밑에 깔았더니 넘길 때 두 그림이 번갈아 번쩍였다 → 썸네일 없음.
     · 넘기는 순간 떠나는 장의 재생기를 다음다음 장으로 돌려, 올라가는 동안 그 장이 번쩍였다
       → 떠나는 재생기는 멈추기만 하고, 넘기기 동작이 끝난 뒤에 돌린다.
     · 다음 장이 멈춘 채 대기만 해서 도착해야 영상이 튀어나왔다
       → 소리 끈 채 잠깐 재생했다 멈춰 첫 장면을 미리 그려 둔다. */
  syncPosters();
  const P = pool();
  const cur = P[currentIndex % P.length];
  clearTimeout(cur.__deferT);
  placePlayer(cur, currentIndex);
  scheduleAhead();
  [cur].forEach((v) => {
    const i = currentIndex;
    if (i === currentIndex) {
      /* 🔁 무한 재생 (사용자가 멈출 때까지)
         ⚠️ 한때 Stream 요금 때문에 3회로 끊었다가 되돌렸다 — 영상이 R2로 가서 재생이 공짜고,
            중간에 멈추면 '음소거가 아닌데 소리가 안 나는' 상태가 되어 소리 제어가 꼬인다. */
      v.loop = true;
      v.setAttribute("loop", "");
      // 소리는 기본 ON, 사용자가 음소거하면 다음 영상까지 그 상태 유지(스티키)
      v.muted = !!window.__REELS_MUTED__;

      // 이어보기: 인덱스에서 넘어온 재생 위치 적용(해당 아이템 최초 활성화 시 1회)
      const seek = window.__SHORTS_PENDING_SEEK__;
      if (seek && shortsList[currentIndex] && seek.key === keyOf(shortsList[currentIndex])) {
        const mine = v.__idx;   // 재생기는 돌려쓴다 — 늦게 도착한 콜백이 다른 장 영상에 손대지 않게
        const apply = () => { if (v.__idx !== mine) return; try { if (v.duration && seek.time < v.duration - 0.3) v.currentTime = seek.time; } catch (_) {} };
        if (v.readyState >= 1) apply();
        else v.addEventListener("loadedmetadata", apply, { once: true });
        window.__SHORTS_PENDING_SEEK__ = null;
      }

      // 진행바 연결(현재 영상 timeupdate)
      bindShortsProgress(v);
      /* 📊 숏판은 '완주율'이 랭킹 핵심 — 영상마다 한 번 붙인다(멈추거나 끝날 때 기록) */
      const it = shortsList[currentIndex];
      if (it && it._type === 'post' && window.GALLA_signal && !v.__sig) {
        v.__sig = 1;
        try { window.GALLA_signal.video(v, { kind: 'vertical', id: String(it.id), surface: 'reels' }); } catch (_) {}
      }

      const mine = v.__idx;
      const stillMine = () => v.__idx === mine && mine === currentIndex;
      const playPromise = v.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(err => {
          if (!stillMine()) return;
          if (err && err.name === "NotAllowedError") {
            // 진짜 자동재생 정책 차단(제스처 없음)일 때만 음소거로 폴백
            v.muted = true;
            v.play().catch(() => {});
          } else {
            // 데이터 부족 등 → 소리 유지한 채 준비되면 재시도(느린 R2 대응)
            v.addEventListener("canplay", () => {
              if (!stillMine()) return;   // 그 사이 넘겼으면 이 재생기는 이미 다음 장 몫이다
              v.muted = !!window.__REELS_MUTED__;
              v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
            }, { once: true });
          }
        });
      }
      v.playbackRate = 1;
    }
  });
}

/* =========================
   TOUCH GESTURE
========================= */
/* 🖐 UI 컨트롤(진영바·액션·상단버튼) 위 터치인가? — 제스처가 이걸 삼키면
   touchend에서 moveToIndex()가 진영바를 재생성하고, iOS는 '눌렀던 버튼이 사라지면
   click을 발사하지 않는다' → 아이폰만 진영 버튼 무반응(사장님 재현: PC·안드로이드는 정상). */
function isReelControl(t) {
  /* ⚠️ 예전엔 버튼·레일·작성자 줄·진영바 위에서 시작한 끌기를 통째로 무시했다 → 화면 아래 절반
     (제목·작성자·진영바)에서 밀면 안 넘어갔다(2026-09-14 시뮬 실측). 그 보호는 '제자리 스냅 때
     진영바 재생성 → iOS click 취소' 때문이었는데, 이제 같은 칸이면 아무것도 다시 안 그린다.
     인스타처럼 어디서 밀어도 넘어가고, 안 움직인 탭은 그대로 클릭이 된다. 입력칸만 뺀다. */
  return !!(t && t.closest && t.closest("#shortsLoginPop, input, textarea, select, [contenteditable]"));
}

/* 트랙의 '지금' 위치(스크롤) — 옛 transform 방식과 부호를 맞춘다 */
function trackY() { return track ? -track.scrollTop : 0; }

/* 세로 넘기기는 폰 자체 스크롤(scroll-snap)이 한다 — 손가락 1:1, 관성, 한 장씩 멈춤, 끝 고무줄 전부 OS.
   여기서는 ① 스크롤이 멈춘 순간을 잡아 지금 장을 확정하고 ② 가로로 크게 밀면 닫기만 한다. */
function bindGestures() {
  if (track && !track.__scrollBound) {
    track.__scrollBound = true;
    let t = 0;
    track.addEventListener("touchstart", () => { FINGER_DOWN = true; }, { passive: true });
    /* 손 뗀 뒤 도착은 폰이 한다. 앱에선 이 트랙에 UIKit 페이징을 켠다(requestNativePaging) — 인스타 앱과 같은 넘김.
       ⚠️ JS smooth scrollTo 로 도착 장까지 미끄러뜨려 봤더니 아이폰에선 느리게 출발해 떼는 순간 0.6초 멈칫하고
          착지까지 0.7~1초였다(26.9.15 폰 기록, 시뮬은 0.38초라 속았다). 쓰지 말 것. */
    const up = () => {
      if (!FINGER_DOWN) return;
      FINGER_DOWN = false;
      clearTimeout(t); t = setTimeout(onScrollSettle, 120);   // 딱 칸에 맞춰 떼면 스크롤 이벤트가 더 안 온다
    };
    track.addEventListener("touchend", up, { passive: true });
    track.addEventListener("touchcancel", up, { passive: true });
    track.addEventListener("scroll", () => {
      clearTimeout(t);
      if (!track) return;   // 닫힌 뒤 늦게 도착한 스크롤(관성 중 닫기) — track 이 null 이라 TypeError 가 났다
      const H = VIEWPORT_H;
      if (!FINGER_DOWN && H) {
        const st = track.scrollTop, k = Math.round(st / H);
        commitEarly(k);                                          // 손 뗀 뒤 반 넘게 들어온 장 → 지금 튼다
        if (Math.abs(st - k * H) <= 1) { onScrollSettle(); return; }   // 칸에 닿은 순간 확정(scrollend 기다리지 않음)
      }
      t = setTimeout(onScrollSettle, 90);
    }, { passive: true });
    if ("onscrollend" in window) track.addEventListener("scrollend", () => { clearTimeout(t); onScrollSettle(); });
  }
  if (overlay.__gestures) return; overlay.__gestures = true;
  let sx = 0, sy = 0, on = false;
  overlay.addEventListener("touchstart", e => {
    if (e.touches.length !== 1 || window.__COMMENT_OPEN__) { on = false; return; }
    on = true; sx = e.touches[0].clientX; sy = e.touches[0].clientY;
  }, { passive: true });
  overlay.addEventListener("touchend", e => {
    if (!on) return; on = false;
    const c = e.changedTouches && e.changedTouches[0]; if (!c) return;
    const dx = c.clientX - sx, dy = c.clientY - sy;
    // 👉 오른쪽으로 확실히 밀면 → 릴스만 닫고 원래 피드로 복귀
    if (dx > CLOSE_THRESHOLD_X && Math.abs(dx) > Math.abs(dy) * 1.5) closeShorts();
  }, { passive: true });
  overlay.addEventListener("touchcancel", () => { on = false; }, { passive: true });
}

/* =========================
   TAP / DOUBLE TAP
========================= */
/* 릴스 조작:
   - 한 번 탭  → 음소거 토글 (음소거하면 다음 영상까지 유지)
   - 더블 탭 후 누르고 있기 → 누르는 동안 2배속, 떼면 1배속
*/
/* 🔊 음소거/소리 배지 아이콘 — 이모지 대신 SVG(톤 통일, 사장님 확정) */
const REEL_ICONS = {
  soundOn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
  soundOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M22 9l-6 6"/><path d="M16 9l6 6"/></svg>',
  speed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l8 6-8 6V6z"/><path d="M13 6l8 6-8 6V6z"/></svg>'
};
function reelBadge(section, html, isSpeed) {
  if (!section) return null;
  let b = section.querySelector(`.reel-badge.${isSpeed ? "speed" : "mute"}`);
  if (!b) {
    b = document.createElement("div");
    b.className = `reel-badge ${isSpeed ? "speed" : "mute"}`;
    section.appendChild(b);
  }
  b.innerHTML = html;
  return b;
}
function flashBadge(section, html) {
  const b = reelBadge(section, html, false);
  if (!b) return;
  b.classList.add("show");
  clearTimeout(b.__t);
  b.__t = setTimeout(() => b.classList.remove("show"), 650);
}
function showSpeedBadge(section, on) {
  const b = reelBadge(section, REEL_ICONS.speed + '<i class="rb-tx">2배속</i>', true);
  if (!b) return;
  b.classList.toggle("show", on);
}

function curVideoAndSection() {
  const video = curVideo();
  const section = document.querySelectorAll(".short")[currentIndex];
  return { video, section };
}

// 슬라이드 컨트롤 직접 바인딩 — 문서 위임/iOS click 디스패치 이슈에 안전.
function shareShort(item) {
  if (!item) return;
  const url = window.GALLA_SITE + "/share/issue/" + item.id;
  const title = (item.title || "GALLA").trim();
  if (window.GALLA_share) window.GALLA_share({ url, title, text: title });
  else if (navigator.share) navigator.share({ url, title }).catch(() => {});
  else { try { navigator.clipboard.writeText(url); } catch (e) {} }
}
// 모바일 신뢰성: click 대신 touchend(탭) 직접 처리 + 데스크톱 click 폴백.
// 릴스 오버레이 제스처와 충돌 없이 확실히 발화(스와이프면 무시).
function onTap(el, fn) {
  if (!el) return;
  let sx = 0, sy = 0, moved = false, handled = false;
  el.addEventListener("touchstart", (e) => {
    const t = e.touches[0]; sx = t.clientX; sy = t.clientY; moved = false;
  }, { passive: true });
  el.addEventListener("touchmove", (e) => {
    const t = e.touches[0];
    if (Math.abs(t.clientX - sx) > 10 || Math.abs(t.clientY - sy) > 10) moved = true;
  }, { passive: true });
  el.addEventListener("touchend", (e) => {
    if (moved) return;                 // 스와이프 → 슬라이드 이동에 양보
    e.preventDefault();                // 뒤따르는 ghost click 억제(중복 방지)
    e.stopPropagation();
    handled = true; setTimeout(() => { handled = false; }, 600);
    fn(e);
  });
  el.addEventListener("click", (e) => {
    if (handled) { handled = false; return; }  // 터치로 이미 처리됨
    e.preventDefault(); e.stopPropagation();
    fn(e);
  });
}
function wireSlideControls(section, item) {
  onTap(section.querySelector(".shorts-action-btn.comment"), () => { openCommentModal(); loadShortsComments(); });
  onTap(section.querySelector(".shorts-action-btn.share"), () => shareShort(item));
  onTap(section.querySelector(".shorts-action-btn.support"), () => supportIssue(item));
  section.querySelectorAll(".shorts-goto").forEach(g => onTap(g, () => {
    const cv = curVideo();
    const t = (cv && cv.currentTime > 0.3) ? "&t=" + cv.currentTime.toFixed(1) : "";   // 보던 위치 이어보기
    const url = "issue.html?id=" + item.id + t;
    // SPA(앱): 릴스 닫고 스택 push로 진입 — location.href 하드내비는 MPA로 이탈해 스크롤이 죽는다(프로필 열기와 동일 규약)
    if (document.body.dataset.page === "spa" && window.GALLA_nav) { try { closeShortsSilently(); } catch (_) {} window.GALLA_nav(url); return; }
    location.href = url;
  }));
  section.querySelectorAll("[data-profile-uid]").forEach(p => onTap(p, () => {
    const uid = p.getAttribute("data-profile-uid");
    if (!uid) return;
    // SPA(app.html): 릴스 닫고 스택 push(문서 이탈 시 nav.js 셸 복귀가 ?user를 버림)
    if (document.body.dataset.page === "spa" && window.GALLA_gotoProfile) { try { closeShortsSilently(); } catch (_) {} window.GALLA_gotoProfile(uid); return; }
    location.href = "mypage.html?user=" + encodeURIComponent(uid);
  }));
}

function bindTapControls() {
  if (overlay.__taps) return; overlay.__taps = true;
  let tapTimer = null;
  let waitingSecond = false;
  let holding2x = false;
  let downX = 0, downY = 0, moved = false;

  const isControl = t =>
    t.closest &&
    t.closest(".shorts-vote,.vote-btn,.shorts-actions,.shorts-action-btn,#shortsCloseBtn,.shorts-top,.author-follow,.shorts-goto,#shortsCommentModal,[data-profile-uid],.grl-rail,.grl-userrow,.grl-cap-box");

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
      /* 들리는 상태를 기준으로 뒤집는다. 선호값 기준으로 뒤집으면, 소리 켠 자동재생이 막혀
         음소거로 대신 튼 영상에서 첫 탭이 '끄기'가 되어 두 번 눌러야 소리가 났다(2026-09-14 실측). */
      const wantOn = video.muted;
      if (window.GALLA_setSound) window.GALLA_setSound(wantOn);
      window.__REELS_MUTED__ = !wantOn;
      video.muted = !wantOn;
      // 자동재생이 통째로 막혀 멈춰 있던 영상이면 이 탭(진짜 제스처)으로 같이 튼다
      if (wantOn && video.paused) video.play().catch(() => {});
      flashBadge(section, window.__REELS_MUTED__ ? REEL_ICONS.soundOff : REEL_ICONS.soundOn);
    }, 260);
  });

  overlay.addEventListener("pointercancel", endHold);
}

/* =========================
   WHEEL (PC)
========================= */
function bindWheel() {
  /* 휠은 브라우저 기본 스크롤 + scroll-snap(한 장씩 멈춤)이 처리한다. 예전처럼 막고(preventDefault)
     직접 옮기면 폰 자체 스크롤과 싸운다. */
}

/* =========================
   KEYBOARD
========================= */
function bindKeyboard() {
  /* ⚠️ 릴스를 열 때마다 window 에 새로 붙였다 → 두 번째로 열면 화살표 한 번에 두 칸,
     Esc 한 번에 닫기 두 번(2026-09-14 실측). window 쪽은 한 번만 붙인다. */
  if (window.__shortsKeyBound) return;
  window.__shortsKeyBound = true;
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

function bumpReelView(issueId) {
  if (!issueId) return;
  const key = "gv_viewed_" + issueId;
  try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, "1"); } catch (e) {}
  try { window.supabaseClient?.rpc("bump_view", { p_issue: issueId }); } catch (e) {}
}

function updateShortsVoteBar() {
  const cur = shortsList[currentIndex] || {};
  // 숏판 장 = 진영바·진행바 위치가 다르다(CSS #shortsOverlay.sh-post)
  if (overlay) overlay.classList.toggle("sh-post", cur._type === "post");
  const bar = document.getElementById("shortsVoteBar");
  if (!bar) return;
  if (cur._type === "post") { bar.dataset.issueId = ""; return; }
  if (!window.GALLA_VoteBar) return;
  const issueId = cur.id;
  bar.dataset.issueId = issueId || "";
  if (!issueId) { console.warn("[SHORTS][VOTE] missing issueId"); return; }
  bumpReelView(issueId);   // 조회수(유튜브식): 릴스 시청도 세션당 1회 카운트

  // 통합 진영바 마운트(슬라이드마다 진영명 갱신)
  window.GALLA_VoteBar.mount(bar, {
    factionA: cur.faction_a || "찬성이오", factionB: cur.faction_b || "난 반댈세",
    pro: 0, con: 0
  });
  // 실제 통계 + 내 진영 반영(애니메이션 없이 초기 세팅)
  (async () => {
    if (typeof window.GALLA_GET_VOTE_STATS === "function") {
      const s = await window.GALLA_GET_VOTE_STATS(issueId);
      if (s && bar.dataset.issueId == String(issueId)) window.GALLA_VoteBar.update(bar, s, { animate: false });
    }
    if (typeof window.GALLA_GET_MY_VOTE === "function") {
      const mine = await window.GALLA_GET_MY_VOTE(issueId);
      if (mine && bar.dataset.issueId == String(issueId)) window.GALLA_VoteBar.setMine(bar, mine);
    }
  })();
}

/* =========================
   CLOSE
========================= */

/* 🛡 릴스 진영/댓글 로그인 게이트 — document 캡처 단계 위임.
   릴스 위에서 다른 핸들러·레이어가 클릭을 삼켜도 여기서 '먼저' 잡는다(사장님: 강하게 막히는 느낌).
   미로그인이면 즉시 팝업 + 이벤트 중단(투표 진행 차단). 로그인 상태면 그냥 흘려보낸다. */
(function () {
  if (window.__shortsGateBound) return; window.__shortsGateBound = 1;
  let cachedUid = undefined;
  async function uid() {
    try { const { data } = await window.supabaseClient.auth.getSession(); return data?.session?.user?.id || null; }
    catch (e) { return null; }
  }
  document.addEventListener("click", function (e) {
    if (!document.getElementById("shortsOverlay")) return;          // 릴스 열려있을 때만
    const t = e.target.closest && e.target.closest(".gv-btn, #shortsCommentSend, #shortsCommentModal .sc-like");
    if (!t) return;
    if (cachedUid) return;                                          // 로그인 확인됨 → 통과
    // 미확인/미로그인 → 일단 막고 세션 확인 후 팝업(또는 재클릭 허용)
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    uid().then(function (u) {
      cachedUid = u;
      if (u) { try { t.click(); } catch (_) {} return; }             // 로그인 상태였다면 원래 동작 재실행
      try { showShortsLoginPopup(t.classList.contains("gv-btn") ? "진영 선택은 로그인 후 가능해요" : "로그인 후 이용할 수 있어요"); } catch (_) {}
    });
  }, true);   // ⚠️ capture:true — 버블 차단(stopPropagation)에도 영향받지 않는다
})();

/* 공용 로그인 창의 「로그인하기」를 릴스 위에서 누르면 릴스부터 닫는다 — 안 닫으면 로그인 화면이 릴스 밑에 깔린다.
   공용 창 자체 핸들러(버블)보다 먼저 돌도록 capture. 숏판 장(reels-mix → GALLA_needLogin)도 여기로 온다. */
(function () {
  if (window.__reelsLoginCloseBound) return; window.__reelsLoginCloseBound = 1;
  document.addEventListener("click", function (e) {
    if (!e.target.closest || !e.target.closest("#galla-login-modal .glm-go")) return;
    if (document.getElementById("shortsOverlay")) { try { closeShortsSilently(); } catch (_) {} }
  }, true);
})();

/* 🔐 릴스 위 로그인 팝업 — 자동 리다이렉트 대신 즉각 보이는 안내(사장님 확정).
   [로그인하기] = 릴스 닫고(영상 레이어 제거) 로그인으로 3중 이동. */
function showShortsLoginPopup(msg) {
  /* 로그인 안내창은 앱 공용 하나(GALLA_needLogin — 파란 「닫기 / 로그인하기」)로 통일(사장님 26.9.15).
     예전엔 이슈 장은 이 빨간 「로그인하기 / 나중에」, 숏판 장은 공용 창이라 두 모양이 섞였다.
     아래 옛 팝업은 공용 창이 없을 때(supabase.js 미로드)만 쓴다. */
  if (typeof window.GALLA_needLogin === "function") { window.GALLA_needLogin(msg || "로그인 후 이용할 수 있어요"); return; }
  const host = document.body;   // ⚠️ 반드시 body — 오버레이 안이면 릴스 레이어에 가려질 수 있다
  if (document.getElementById("shortsLoginPop")) return;
  if (!document.getElementById("shortsLoginPopCss")) {
    const st = document.createElement("style"); st.id = "shortsLoginPopCss";
    st.textContent = [
      "#shortsLoginPop{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:rgba(4,6,12,.6)}",
      "#shortsLoginPop .slp-card{width:min(82vw,320px);border-radius:20px;padding:24px 20px 16px;text-align:center;color:#fff;",
        "background:linear-gradient(160deg,rgba(24,27,38,.98),rgba(14,16,22,.98));border:1px solid rgba(255,255,255,.14);box-shadow:0 24px 60px rgba(0,0,0,.6)}",
      "#shortsLoginPop .slp-ic{font-size:40px;margin-bottom:10px}",
      "#shortsLoginPop .slp-t{font-size:17px;font-weight:950;margin-bottom:6px}",
      "#shortsLoginPop .slp-s{font-size:13px;color:#a7afc0;line-height:1.5;margin-bottom:16px}",
      "#shortsLoginPop .slp-go{width:100%;padding:13px;border:0;border-radius:12px;font-size:14.5px;font-weight:950;color:#fff;cursor:pointer;",
        "background:linear-gradient(135deg,#ff4d67,#ff2d55)}",
      "#shortsLoginPop .slp-x{margin-top:10px;background:none;border:0;color:#8b93a6;font-size:12.5px;font-weight:800;cursor:pointer;padding:4px 8px}"
    ].join("");
    document.head.appendChild(st);
  }
  const pop = document.createElement("div");
  pop.id = "shortsLoginPop";
  pop.innerHTML = '<div class="slp-card"><div class="slp-ic">🔒</div><div class="slp-t">로그인이 필요해요</div>' +
    '<div class="slp-s">' + (msg || "로그인 후 이용할 수 있어요") + '</div>' +
    '<button class="slp-go" type="button">로그인하기</button>' +
    '<button class="slp-x" type="button">나중에</button></div>';
  host.appendChild(pop);
  pop.querySelector(".slp-x").onclick = () => pop.remove();
  pop.addEventListener("click", e => { if (e.target === pop) pop.remove(); });
  pop.querySelector(".slp-go").onclick = () => {
    const go = "login.html?next=" + encodeURIComponent("index.html");
    try { closeShortsSilently(); } catch (e) {}
    /* 앱(SPA)에선 셸 안 로그인 뷰로 — location.href 로 나가면 셸을 벗어난다(26.9.18 비로그인 점검) */
    if (window.GALLA_gotoLogin) { window.GALLA_gotoLogin("index.html"); return; }
    try { if (window.parent && window.parent !== window) window.parent.postMessage({ galla: "shell", t: "goto", url: go }, location.origin); } catch (e) {}
    try { (window.top || window).location.href = go; } catch (e) {}
    setTimeout(function () { try { location.href = go; } catch (e) {} }, 400);
  };
}

/* 셸(네이티브) 하단 nav 숨김 — 릴스는 풀스크린인데 nav는 부모 문서라 iframe이 못 덮는다(사장님 재현) */
function shortsNavHide(on) {
  try { if (window.parent && window.parent !== window) window.parent.postMessage({ galla: "shell", t: "navhide", on: on }, location.origin); } catch (e) {}
}

function closeShorts() {
  shortsNavHide(false);
  requestNativePaging(false);
  /* 댓글을 연 채로 닫히면(Esc·가로 밀어 닫기) comment-open 이 몸통에 남아 다음 릴스가 잠겼다 — 곧바로 걷는다 */
  if (window.__COMMENT_OPEN__) {
    document.getElementById("shortsCommentModal")?.classList.remove("visible");
    document.body.classList.remove("comment-open");
    window.__COMMENT_OPEN__ = false;
    window.__COMMENT_STATE__ = "closed";
  }
  // 이어보기(역방향): 현재 릴스 재생 위치를 인덱스 인라인 영상에 반영
  try {
    const cur = curVideo();
    const id = shortsList[currentIndex]?.id;
    if (cur && id != null && cur.currentTime > 0.3) {
      const inline = document.getElementById("vid-" + id);
      if (inline) inline.currentTime = cur.currentTime;
    }
  } catch (_) {}
  document.body.style.overflow = "";
  document.body.classList.remove("shorts-open");
  window.__CURRENT_SHORT_ISSUE_ID__ = null;
  document.getElementById("grl-cdim")?.remove();   // 숏판 댓글 시트
  if (POOL) { POOL.forEach(p => { releaseVideo(p); p.remove(); }); POOL = null; }
  if (overlay) {
    track = null;
    overlay.remove();
    overlay = null;
  }
  const cb = SHORTS_ON_CLOSE; SHORTS_ON_CLOSE = null;
  if (cb) { try { cb(); } catch (_) {} }
  // 릴스 열 때 풀어 둔 홈 영상 — 보이는 것부터 다시 붙여 재생
  setTimeout(() => { try { window.GALLA_resumeHomeVideo && window.GALLA_resumeHomeVideo(); } catch (_) {} }, 0);
}
/* 다른 화면으로 떠날 때 — 닫기 콜백(페이지째 뒤로)을 부르지 않는다. 부르면 뒤로가기와 이동이 겹친다. */
function closeShortsSilently() { SHORTS_ON_CLOSE = null; closeShorts(); }
if (!__SHORTS_DUP__) window.GALLA_shortsCloseSilently = closeShortsSilently;

/* =========================
   EXPORT
========================= */
if (!__SHORTS_DUP__) {
  window.__OPEN_SHORTS_INTERNAL__ = __openShortsInternal;
  window.__SHORTS_ENGINE_READY__ = true;
}
console.info("[SHORTS] engine ready");

if (window.__SHORTS_ENGINE_READY__ && window.__SHORTS_OPEN_QUEUE__.length) {
  window.__SHORTS_OPEN_QUEUE__.forEach(x =>
    window.__OPEN_SHORTS_INTERNAL__(x.list, x.startId, x.startTime, x.entry, x.opts)
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
if (!__SHORTS_DUP__) document.addEventListener("click", e => {
  const go = e.target.closest(".shorts-goto");
  if (!go || !go.dataset.goto) return;
  e.preventDefault();
  e.stopPropagation();
  const cv = curVideo();
  const t = (cv && cv.currentTime > 0.3) ? `&t=${cv.currentTime.toFixed(1)}` : "";
  const url = `issue.html?id=${go.dataset.goto}${t}`;
  // SPA(앱): 스택 push로 — 하드내비는 MPA 이탈로 스크롤 죽음
  if (document.body.dataset.page === "spa" && window.GALLA_nav) { try { closeShortsSilently(); } catch (_) {} window.GALLA_nav(url); return; }
  location.href = url;
});

if (!__SHORTS_DUP__) document.addEventListener("click", e => {
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
    shareShort(shortsList[currentIndex] || { id: issueId });
  }
});

function openCommentModal() {
  const modal = document.getElementById("shortsCommentModal");
  const sheet = modal?.querySelector(".comment-sheet");
  if (!modal || !sheet) return;
  if (window.__COMMENT_OPEN__) return;

  window.__COMMENT_OPEN__ = true;
  window.__COMMENT_STATE__ = "full";

  modal.classList.add("visible");
  document.body.classList.add("comment-open");

  /* ⚠️ 시트는 height:92dvh 에 bottom:0 이라, 아래로 밀면 밀어낸 만큼이 화면 밖으로 나간다.
     예전엔 열 때 45%(=365px)를 밀어서 **시트 맨 아래 65px 인 댓글 입력창이 화면 밖**에 있었다.
     "첫 포문을 여세요!" 라고 해놓고 쓸 곳이 없는 상태 — 드래그로 끝까지 올려야만 보였고
     그걸 알려주는 것도 없었다(실측 2026-08-28 에뮬).
     열 때는 끝까지 올린다. 반만 보고 싶으면 드래그로 내리면 된다 — 그건 그대로 살아 있다. */
  const OPEN_Y = 0;

  sheet.style.transition = "none";
  sheet.style.transform = `translateX(-50%) translateY(${window.innerHeight}px)`;

  /* ⚠️ rAF 로 하면 백그라운드·비활성 상태에서 콜백이 안 돌아 시트가 숨김 위치(translateY(100vh))에
     그대로 갇힌다 — 열었는데 아무것도 안 뜨는 상태다. plans.js 가 같은 이유로 이미 setTimeout 을 쓴다. */
  setTimeout(() => {
    sheet.style.transition = "transform 0.28s cubic-bezier(.4,0,.2,1)";
    sheet.style.transform = `translateX(-50%) translateY(${OPEN_Y}px)`;
  }, 16);

  bindCommentDrag();

}

/* 🔙 하드웨어 뒤로가기가 부를 수 있는 단일 창구.
   안드로이드 뒤로가기가 릴스를 못 닫고 있었다(실측 2026-08-28 에뮬) — android-back.js 의
   닫기 목록에 릴스가 아예 없었다. 닫기 버튼을 눌러서 해결할 수도 없다:
   피드에서 들어온 경우 #shortsCloseBtn 은 '만들기'로 동작해서 글쓰기 허브가 열려 버린다.
   처리했으면 true 를 준다 — 안 그러면 뒤로가기가 앱을 꺼뜨리는 쪽으로 흘러간다. */
window.GALLA_shortsBack = function () {
  try {
    const gd = document.getElementById("grl-cdim");
    if (gd) { gd.remove(); return true; }                                   // ⓪ 숏판 댓글 시트
    if (window.__COMMENT_OPEN__) { closeCommentModal(); return true; }   // ① 댓글 시트 먼저
    const ov = document.getElementById("shortsOverlay");
    if (ov && ov.isConnected) { closeShorts(); return true; }            // ② 그다음 릴스
  } catch (_) {}
  return false;
};

function closeCommentModal() {
  const modal = document.getElementById("shortsCommentModal");
  const sheet = modal?.querySelector(".comment-sheet");
  if (!modal || !sheet) return;

  sheet.style.transition = "transform 0.25s cubic-bezier(.4,0,.2,1)";
  sheet.style.transform = `translateX(-50%) translateY(${window.innerHeight}px)`;

  setTimeout(() => {
    modal.classList.remove("visible");
    document.body.classList.remove("comment-open");
    requestNativePaging();   // 댓글 동안 overflow:hidden → 웹킷이 스크롤뷰를 새로 만들 수 있다
    window.__COMMENT_OPEN__ = false;
    window.__COMMENT_STATE__ = "closed";

    const video = curVideo();
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
    // 조작 요소(입력·버튼)는 스크롤 위치와 무관하게 항상 드래그에서 뺀다
    if (e.target?.closest?.(".comment-input, input, textarea, button, [contenteditable]")) return;
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
    /* 🔴 여기서 e.preventDefault() 가 **입력창 포커스를 죽이고 있었다**(실측 2026-08-28 시뮬).
       iOS 는 탭 뒤에 mousedown 을 합성해 보내고, 포커스는 그 기본동작으로 잡힌다.
       시트 전체에 preventDefault 를 걸면 탭은 먹는데(다른 버튼은 click 으로 동작) 텍스트 필드만
       영영 커서가 안 잡힌다 — "눌러도 아무 반응 없는 댓글창"의 진짜 원인.
       기존 예외(list.scrollTop > 0)는 댓글이 하나도 없으면 절대 성립하지 않아 무용지물이었다.
       조작 요소 위에서는 드래그를 아예 시작하지 않는다 — 터치 쪽(ontouchstart)과 같은 규칙. */
    if (e.target?.closest?.(".comment-input, input, textarea, button, select, a, [contenteditable]")) return;
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
function scTimeAgo(iso) { if (window.GALLA_ago) return window.GALLA_ago(iso); 
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
      .select("id,user_id:author_id,content,created_at,faction,parent_id,is_anonymous")
      .eq("issue_id", issueId).neq("status", "deleted")
      .order("created_at", { ascending: false }).limit(300)
  ]);
  // 로딩 중 스크롤로 이슈가 바뀌었으면 무시
  if (SC.issueId !== window.__CURRENT_SHORT_ISSUE_ID__) return;
  SC.rows = rows || [];
  // 🚫 차단한 사람 댓글은 안 보인다 — 차단 안내가 약속한 것(report-block.js)
  if (window.GALLA_filterBlocked) SC.rows = await window.GALLA_filterBlocked(SC.rows, "user_id");

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
          <button class="sc-more" data-cid="${c.id}" aria-label="더보기">⋯</button>
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

  /* ⋯ — 내 댓글이면 삭제, 남의 댓글이면 신고·이 사용자 차단.
     예전엔 릴스 댓글에 ⋯ 자체가 없어 앱에서 신고·차단할 길이 없었다(26.9.15 사장님 심사 녹화 중 발견, App Store 1.2). */
  const moreBtn = e.target.closest("#shortsCommentModal .sc-more");
  if (moreBtn) {
    const cid = Number(moreBtn.dataset.cid);
    const row = SC.rows.find(r => r.id === cid);
    if (!row) return;
    if (!SC.myId) { showShortsLoginPopup("로그인 후 이용할 수 있어요"); return; }
    if (row.user_id && row.user_id === SC.myId) {
      if (!confirm("이 댓글을 삭제할까요?")) return;
      const { count, error } = await supabase.from("comments").update({ status: "deleted" }, { count: "exact" }).eq("id", cid);
      if (error || !count) { alert("삭제하지 못했어요" + (error?.message ? ": " + error.message : "")); return; }
      SC.rows = SC.rows.filter(r => r.id !== cid && r.parent_id !== cid);
      renderShortsComments();
      window.GALLA_toast?.("🗑️ 댓글을 삭제했어요");
      return;
    }
    if (window.GALLA_openReportMenu) {
      window.GALLA_openReportMenu({
        contentType: "comment", contentId: cid, authorId: row.user_id || null, authorName: scNick(row),
        onBlocked: () => { SC.rows = SC.rows.filter(r => r.user_id !== row.user_id); renderShortsComments(); },
      });
    }
    return;
  }

  const likeBtn = e.target.closest("#shortsCommentModal .sc-like");
  if (likeBtn && supabase) {
    if (!SC.myId) {
      showShortsLoginPopup("로그인 후 이용할 수 있어요");
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

/* ⌨️ 엔터로도 보낸다. 버튼 하나에만 매달려 있으면 그 버튼이 숨는 순간(실제로 그랬다)
   기능이 통째로 죽는다. 모바일 키보드의 '전송' 키가 이 경로를 탄다. */
document.addEventListener("keydown", e => {
  if (e.key !== "Enter" || e.isComposing) return;          // 한글 조합 중 엔터는 확정용이다
  const t = e.target;
  if (!t || t.id !== "shortsCommentInput") return;
  e.preventDefault();
  document.getElementById("shortsCommentSend")?.click();
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
    showShortsLoginPopup("로그인 후 이용할 수 있어요");
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