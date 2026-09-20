/* ═══════════════════════════════════════════════════════════════
 * GALLA SPA 뷰 모듈 — 홈(index) 탭.
 *
 * 얇은 어댑터: 실제 피드 로직은 js/index.js가 담당한다(이중 모드).
 *  · js/index.js는 body[data-page="index"](MPA)에서만 자동 초기화하고,
 *    SPA에선 window.GALLA_PAGE_INDEX.mount(root)를 기다린다.
 *  · 여기서는 홈 피드에 필요한 클래식 스크립트를 1회 주입한 뒤 mount를 부른다.
 *  · 공용(supabase 등)은 app.html 셸이 이미 로드 — 존재 체크로 중복 주입 방지.
 * ═══════════════════════════════════════════════════════════════ */

const V = window.GALLA_V ? "?v=" + window.GALLA_V : "";

/* 홈 피드 필수 스크립트(로드 순서 중요 — index.js가 마지막) */
/* 첫 화면에 꼭 필요한 것만 기다린다(26.9.20 속도 QA: 예전엔 릴스 엔진·투어·온보딩까지 다 받고서야 피드가 떴다 — 피드 요청이 DOM 보다 1.4초 늦게 시작). */
const CLASSIC = [
  "/vendor/hls.min.js",     // HLS 재생(비 iOS)
  "/js/hls-attach.js",      // GALLA_attachHls
  "/js/battle-fx.js",       // BattleFX(햅틱·연출)
  "/js/signals.js",         // GALLA_signal(노출·열람 신호 — 홈 랭킹의 연료)
  "/js/kind-icons.js",      // GALLA_KIND(콘텐츠 종류 표식 SVG)
  "/js/support-btn.js",     // GALLA_support(후원 버튼 공용)
  "/js/vote-lines.js",      // GALLA_VOTE_LINES(줄다리기 대사)
  "/js/vote-bar.js",        // GALLA_VoteBar(진영바)
  "/js/media-sound.js",     // GALLA_soundOn/setSound/muteIcon
  "/js/ghost.js",           // GALLA_userMap/userBadge(카드 작성자 배지)
  "/js/follow.js",          // 카드 팔로우 버튼
  "/js/owner-actions.js",   // ⋯ 메뉴·카테고리
  "/js/index.js",           // 홈 피드 본체(GALLA_PAGE_INDEX 노출)
];
/* 첫 화면 뒤에 조용히 받는다 — 누르기 전까진 필요 없는 것들 */
const LATER = [
  "/js/vote-fx.js",         // 투표 축하 연출
  "/js/share-sheet.js",     // 공유
  "/js/user-sheet.js",      // 프로필 팝오버
  "/js/report-block.js",    // 신고·차단
  "/js/fx.js",              // 파티클
  "/js/welcome.js",         // 첫 진입 환영
  "/js/onboard.js",         // 온보딩
  "/js/tour.js",            // 투어
  "/js/noti-icons.js",      // 알림 아이콘
  "/js/index-guide.js",     // 상단 안내 배너
  "/js/reels-mix.js",       // 릴스에 숏판 섞기
];
/* ES 모듈 의존 — dynamic import. 실패해도 피드 자체는 뜨게 fail-soft */
const MODULES = [
  "/js/vote.core.js",       // GALLA_VOTE/CHECK_VOTE/PREFETCH_VOTES/GET_VOTE_STATS
  "/js/shorts.js",          // openShorts(릴스 오버레이)
];

function hasScript(src) {
  // 버전 쿼리 무시, "./x"·"/x" 표기 차이 흡수 — app.html 로드분(공용) 중복 주입 방지
  return Array.from(document.scripts).some(s => {
    const p = (s.getAttribute("src") || "").replace(/^\.\//, "/").split("?")[0];
    return p === src;
  });
}

function loadOne(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.async = false;   // 병렬로 받되 삽입 순서대로 실행(의존 순서 보존)
    s.src = src + V;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("script load fail: " + src));
    document.head.appendChild(s);
  });
}

let bootP = null;
function bootOnce() {
  if (bootP) return bootP;
  bootP = (async () => {
    // 한꺼번에 꽂아 병렬로 받는다 — async=false 라 실행은 CLASSIC 순서 그대로(의존 순서 보장).
    // 예전엔 파일마다 await 해서 19개 왕복이 줄을 섰다(홈은 콜드스타트 첫 화면이라 그대로 체감).
    await Promise.all(CLASSIC.filter(src => !hasScript(src)).map(loadOne));
  })();
  return bootP;
}

export async function mount(root, params) {
  await bootOnce();
  if (window.GALLA_PAGE_INDEX && window.GALLA_PAGE_INDEX.mount) {
    await window.GALLA_PAGE_INDEX.mount(root, params || {});
  }
  afterPaint();   // 나머지 모듈은 화면이 뜬 뒤에
}

/* 첫 화면이 뜬 뒤 조용히 받는다 — 실패해도 피드는 그대로 */
let laterP = null;
function afterPaint() {
  if (laterP) return laterP;
  const run = () => Promise.all(LATER.filter(src => !hasScript(src)).map(src => loadOne(src).catch(() => {})))
    .then(async () => {
      for (const m of MODULES) {
        try { await import(m + V); } catch (e) { console.warn("[spa/index] 모듈 로드 실패(기능 저하로 계속):", m, e); }
      }
    });
  laterP = new Promise(res => {
    const go = () => res(run());
    if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 1500 }); else setTimeout(go, 400);
  });
  return laterP;
}

export function unmount()   { window.GALLA_PAGE_INDEX && window.GALLA_PAGE_INDEX.unmount && window.GALLA_PAGE_INDEX.unmount(); }
export function activate()  { window.GALLA_PAGE_INDEX && window.GALLA_PAGE_INDEX.activate && window.GALLA_PAGE_INDEX.activate(); }
export function deactivate(){ window.GALLA_PAGE_INDEX && window.GALLA_PAGE_INDEX.deactivate && window.GALLA_PAGE_INDEX.deactivate(); }
export function scrolltop() { window.GALLA_PAGE_INDEX && window.GALLA_PAGE_INDEX.scrolltop && window.GALLA_PAGE_INDEX.scrolltop(); }
