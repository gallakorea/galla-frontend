/* ═══════════════════════════════════════════════════════════════
 * GALLA SPA 뷰 어댑터 — issue (issue.html · 댓글 배틀 시스템)
 *
 * 로직은 전부 기존 페이지 스크립트가 담당하고, 여기서는
 * issue.html의 스크립트 목록(로드 순서 그대로)을 1회 주입한 뒤
 * window.GALLA_PAGE_ISSUE.mount(root, params)에 위임만 한다.
 *
 * 제외(셸 app.html이 이미 로드하는 공유 싱글턴):
 *   vendor/supabase.js · js/supabase.js · js/dm-sound.js · js/dm-call.js
 * 제외(MPA 전용 크롬 — 셸/타 모듈 담당 또는 SPA 불필요):
 *   splash-boot · back.js · nav.js · desktop-pc · nav-jog · pwa ·
 *   pull-refresh · analytics · error-logger · duel-alert · bug-report
 *   (마지막 3개는 index 탭 어댑터와 동일 기준으로 제외)
 * ═══════════════════════════════════════════════════════════════ */

const V = window.GALLA_V ? "?v=" + window.GALLA_V : "";

/* issue.html 로드 순서 그대로(의존 순서 보장 — 순차 로드) */
const SCRIPTS = [
  "/vendor/hls.min.js",    // HLS 재생(비 iOS)
  "/js/hls-attach.js",     // GALLA_attachHls
  "/js/vote-bar.js",       // GALLA_VoteBar(통합 진영바)
  "/js/vote-fx.js",        // GALLA_VoteFX(투표 연출)
  "/js/battle-fx.js",      // BattleFX(파티클/충격파/햅틱)
  "/js/galla-ask.js",      // GALLA_ask(공용 확인 모달)
  "/js/items.js",          // GALLA_myItems/openShop(아이템·상점)
  "/js/emoticon.js",       // GALLA_renderEmoticons(스티커)
  "/js/gif.js",            // 댓글 GIF
  "/js/donate.js",         // GALLA_initDonations(발의자 후원)
  "/js/charge.js",         // GALLA_needGP(충전 유도)
  "/js/faction.js",        // GALLA_initFaction(진영 밀어주기)
  "/js/dm.js",             // GALLA_openDM + DM 배지(이슈 MPA도 동일 로드)
  "/js/follow.js",         // GALLA_bindFollow(팔로우 버튼)
  "/js/user-sheet.js",     // GALLA_openUserSheet(프로필 시트)
  "/js/owner-actions.js",  // GALLA_canManage/openOwnerMenu(수정·삭제)
  "/js/share-sheet.js",    // GALLA_share/GALLA_shareUrl(공유)
  "/js/report-block.js",   // GALLA_openReportMenu(신고·차단)
  "/js/comment-actions.js",// GALLA_cmtEdit/cmtDelete(댓글 수정·삭제)
  "/js/media-sound.js",    // GALLA_soundOn/setSound(전역 사운드 선호)
  "/js/fx.js",             // GALLA_FX(파티클)
  "/js/ghost.js",          // GALLA_ghost*(유령 페르소나·토글)
];

/* ES 모듈 의존 — dynamic import(모듈 캐시로 index 탭과 자연 공유).
 * issue.js(본체)는 마지막: import 체인(issue-argument/news/stats/comments) 포함,
 * 평가 시 GALLA_PAGE_ISSUE 훅을 노출한다. */
const MODULES = [
  "/js/vote.core.js",      // GALLA_VOTE/CHECK_VOTE(투표 코어)
  "/js/shorts.js",         // openShorts(릴스 전환)
  "/js/issue.js",          // 페이지 본체 — GALLA_PAGE_ISSUE 노출
];

const loadedOnce = new Set();

function alreadyInDoc(src) {
  const bare = src.split("?")[0].replace(/^\.?\//, "");
  for (const s of document.scripts) {
    const p = (s.getAttribute("src") || "").split("?")[0].replace(/^\.?\//, "");
    if (p === bare) return true;
  }
  return false;
}

function loadScriptOnce(src) {
  if (loadedOnce.has(src) || alreadyInDoc(src)) return Promise.resolve();
  loadedOnce.add(src);
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src + V;
    s.onload = () => res();
    s.onerror = () => { loadedOnce.delete(src); rej(new Error("script load fail " + src)); };
    document.head.appendChild(s);
  });
}

let bootP = null;
function bootOnce() {
  if (bootP) return bootP;
  bootP = (async () => {
    for (const src of SCRIPTS) await loadScriptOnce(src);   // 순차 — 의존 순서 보장
    for (const m of MODULES) {
      if (m === "/js/issue.js") { await import(m + V); continue; }   // 본체는 실패 시 throw(뷰 에러 표시)
      try { await import(m + V); }
      catch (e) { console.warn("[spa/issue] 모듈 로드 실패(기능 저하로 계속):", m, e); }
    }
  })();
  bootP.catch(() => { bootP = null; });   // 실패 시 재시도 가능
  return bootP;
}

export async function mount(root, params) {
  await bootOnce();
  const page = window.GALLA_PAGE_ISSUE;
  if (page && page.mount) await page.mount(root, params || {});
}

export function unmount() {
  const page = window.GALLA_PAGE_ISSUE;
  if (page && page.unmount) page.unmount();
}

export function scrolltop() {
  const page = window.GALLA_PAGE_ISSUE;
  if (page && page.scrolltop) page.scrolltop();
}
