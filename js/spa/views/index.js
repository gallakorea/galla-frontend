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
const CLASSIC = [
  "/vendor/hls.min.js",     // HLS 재생(비 iOS)
  "/js/hls-attach.js",      // GALLA_attachHls
  "/js/battle-fx.js",       // BattleFX(햅틱·연출)
  "/js/vote-bar.js",        // GALLA_VoteBar(진영바)
  "/js/vote-fx.js",         // GALLA_VoteFX(투표 축하)
  "/js/media-sound.js",     // GALLA_soundOn/setSound/muteIcon(전역 사운드 선호)
  "/js/share-sheet.js",     // GALLA_share(공유)
  "/js/owner-actions.js",   // GALLA_canManage/openOwnerMenu/GALLA_CATEGORIES
  "/js/ghost.js",           // GALLA_userMap/userBadge(유령 페르소나 포함)
  "/js/user-sheet.js",      // 프로필 팝오버(data-user-id 위임)
  "/js/report-block.js",    // GALLA_openReportMenu/blockedIds
  "/js/fx.js",              // GALLA_FX(파티클 — ghost 등에서 사용)
  "/js/index.js",           // 홈 피드 본체(GALLA_PAGE_INDEX 노출)
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
    for (const src of CLASSIC) {
      if (!hasScript(src)) await loadOne(src);   // 순차 로드 — 의존 순서 보장
    }
    for (const m of MODULES) {
      try { await import(m + V); }
      catch (e) { console.warn("[spa/index] 모듈 로드 실패(기능 저하로 계속):", m, e); }
    }
  })();
  return bootP;
}

export async function mount(root, params) {
  await bootOnce();
  if (window.GALLA_PAGE_INDEX && window.GALLA_PAGE_INDEX.mount) {
    await window.GALLA_PAGE_INDEX.mount(root, params || {});
  }
}

export function unmount()   { window.GALLA_PAGE_INDEX && window.GALLA_PAGE_INDEX.unmount && window.GALLA_PAGE_INDEX.unmount(); }
export function activate()  { window.GALLA_PAGE_INDEX && window.GALLA_PAGE_INDEX.activate && window.GALLA_PAGE_INDEX.activate(); }
export function deactivate(){ window.GALLA_PAGE_INDEX && window.GALLA_PAGE_INDEX.deactivate && window.GALLA_PAGE_INDEX.deactivate(); }
export function scrolltop() { window.GALLA_PAGE_INDEX && window.GALLA_PAGE_INDEX.scrolltop && window.GALLA_PAGE_INDEX.scrolltop(); }
