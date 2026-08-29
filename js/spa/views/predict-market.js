/* ═══════════════════════════════════════════════════════════════
 * GALLA SPA 뷰 어댑터 — predict-market (예측 마켓 상세·베팅, 스택 뷰)
 *
 * 로직은 전부 기존 페이지 스크립트(js/predict-market.js)가 담당하고,
 * 여기서는 필수 스크립트를 클래식 <script>로 1회 주입한 뒤
 * window.GALLA_PAGE_PREDICT_MARKET.mount(root, params)에 위임만 한다.
 *
 * id 충돌 주의: pmToast가 갈라예측 탭(galla-predict.html)에도 있다 —
 * 본체가 조회를 root 스코프로 국소화해 해결(js/predict-market.js의 $).
 *
 * 셸(app.html)이 이미 로드하는 공유 싱글턴은 제외:
 *   vendor/supabase.js · js/supabase.js · js/dm-sound.js · js/dm-call.js
 * MPA 전용(splash-boot, nav, back, pwa 등 셸 크롬)도 제외.
 * ═══════════════════════════════════════════════════════════════ */

const V = window.GALLA_V ? "?v=" + window.GALLA_V : "";

/* predict-market.html 로드 순서 기준(크롬 제외), 본체는 마지막 */
const SCRIPTS = [
  "/js/follow.js",          // GALLA_bindFollow (예언자 팔로우)
  "/js/owner-actions.js",   // GALLA_canManage / GALLA_openOwnerMenu (⋯ 메뉴·수동 정산)
  "/js/share-sheet.js",     // GALLA_share / GALLA_shareUrl
  "/js/report-block.js",    // 신고·차단 (comment-actions 의존)
  "/js/comment-actions.js", // data-cmt-menu 위임 (의견 배틀 ⋯)
  "/js/fx.js",              // GALLA_FX (칩 던지기·컨페티)
  "/js/user-sheet.js",      // GALLA_openUserSheet
  "/js/ghost.js",           // GALLA_ghost / GALLA_ghostBind (유령 의견)
  "/js/items.js",           // openShop (유령권 등)
  "/js/dm.js",            // DM 배지·GALLA_openDM — MPA 는 이 페이지에서도 싣는다(웹/앱 동작 일치)
  "/js/predict-market.js",  // 페이지 본체 — GALLA_PAGE_PREDICT_MARKET 노출
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
  const page = window.GALLA_PAGE_PREDICT_MARKET;
  if (page && page.mount) await page.mount(root, params || {});
}

export function unmount() {
  const page = window.GALLA_PAGE_PREDICT_MARKET;
  if (page && page.unmount) page.unmount();
}

export function scrolltop() {
  const page = window.GALLA_PAGE_PREDICT_MARKET;
  if (page && page.scrolltop) page.scrolltop();
}
