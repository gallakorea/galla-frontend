/* ═══════════════════════════════════════════════════════════════
 * GALLA SPA 뷰 어댑터 — plaza_detail (광장 글 상세, 스택 뷰)
 *
 * 로직은 전부 기존 페이지 스크립트(js/plaza_detail.js, ES 모듈)가 담당하고,
 * 여기서는 필수 스크립트를 1회 주입한 뒤
 * window.GALLA_PAGE_PLAZA_DETAIL.mount(root, params)에 위임만 한다.
 *
 * 셸(app.html)이 이미 로드하는 공유 싱글턴은 제외:
 *   vendor/supabase.js · js/supabase.js · js/dm-sound.js · js/dm-call.js
 * MPA 전용(splash-boot, nav, back, pwa, dm.js, dm-live 등 셸 크롬)도 제외.
 * ═══════════════════════════════════════════════════════════════ */

const V = window.GALLA_V ? "?v=" + window.GALLA_V : "";

/* plaza_detail.html 로드 순서 그대로(크롬 제외) — 본체(모듈)는 아래서 dynamic import */
const SCRIPTS = [
  "/js/follow.js",          // GALLA_bindFollow (작성자 팔로우)
  "/js/share-sheet.js",     // GALLA_share / GALLA_shareUrl
  "/js/report-block.js",    // 신고·차단 (comment-actions 의존)
  "/js/plaza-render.js",    // GALLA_renderPlazaBody (본문 렌더러)
  "/js/owner-actions.js",   // GALLA_canManage / GALLA_openOwnerMenu (⋯ 메뉴)
  "/js/comment-actions.js", // data-cmt-menu 위임 (댓글 ⋯)
  "/js/fx.js",              // GALLA_FX
  "/js/user-sheet.js",      // GALLA_openUserSheet
  "/js/ghost.js",           // GALLA_ghost / GALLA_ghostBind (유령 댓글)
  "/js/items.js",           // openShop (유령권 구매 유도)
  "/js/donate.js",          // openDonatePlaza (💝 응원)
  "/js/dm.js",              // DM 배지·GALLA_openDM (MPA 도 여기서 싣는다)
  "/js/dm-live.js",         // 라이브 난장 진입 — dm.js 뒤
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

export async function mount(root, params) {
  for (const src of SCRIPTS) await loadScriptOnce(src);   // 순차 — 의존 순서 보장
  await import("/js/plaza_detail.js" + V);                // 본체(모듈) — GALLA_PAGE_PLAZA_DETAIL 등록
  const page = window.GALLA_PAGE_PLAZA_DETAIL;
  if (page && page.mount) await page.mount(root, params || {});
}

export function unmount() {
  const page = window.GALLA_PAGE_PLAZA_DETAIL;
  if (page && page.unmount) page.unmount();
}

export function scrolltop() {
  const page = window.GALLA_PAGE_PLAZA_DETAIL;
  if (page && page.scrolltop) page.scrolltop();
}
