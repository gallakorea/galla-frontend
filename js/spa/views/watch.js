/* ═══════════════════════════════════════════════════════════════
 * GALLA SPA 뷰 어댑터 — watch (watch.html · 핫튜브 시청 페이지)
 *   ?v=<video_id>&t=<제목>&c=<채널>
 * 로직은 watch-page.js(GALLA_PAGE_WATCH)가 담당. 여기선 의존 스크립트 1회 주입 후 mount 위임.
 * 제외(셸 싱글턴): supabase·error-logger·nav·back·pwa·analytics 등.
 * ═══════════════════════════════════════════════════════════════ */
const V = window.GALLA_V ? "?v=" + window.GALLA_V : "";

const SCRIPTS = [
  "/js/share-sheet.js",   // GALLA_share
  "/js/ghost.js",         // 유령 댓글
  "/js/user-sheet.js",    // 닉네임 프로필 시트
  "/js/items.js",         // openShop — 다른 뷰를 먼저 안 열면 없다(순서 의존 제거)
  "/js/fx.js",            // GALLA_FX
  "/js/follow.js",        // GALLA_bindFollow
  "/js/dm.js",            // DM 배지·GALLA_openDM — MPA 는 이 페이지에서도 싣는다(웹/앱 동작 일치)
  "/js/report-block.js",  // GALLA_filterBlocked·신고차단 — 없으면 차단 필터가 무동작
  "/js/watch-page.js",    // 본체 — GALLA_PAGE_WATCH 노출
];

const loadedOnce = new Set();
function inDoc(src) {
  const bare = src.split("?")[0].replace(/^\.?\//, "");
  for (const s of document.scripts) {
    if ((s.getAttribute("src") || "").split("?")[0].replace(/^\.?\//, "") === bare) return true;
  }
  return false;
}
function loadScriptOnce(src) {
  if (loadedOnce.has(src) || inDoc(src)) return Promise.resolve();
  loadedOnce.add(src);
  return new Promise((res) => {
    const s = document.createElement("script");
    s.src = src + V;
    s.onload = () => res();
    s.onerror = () => { loadedOnce.delete(src); res(); };
    document.head.appendChild(s);
  });
}
let bootP = null;
function bootOnce() {
  if (bootP) return bootP;
  bootP = (async () => { for (const src of SCRIPTS) await loadScriptOnce(src); })();
  bootP.catch(() => { bootP = null; });
  return bootP;
}

export async function mount(root, params) {
  await bootOnce();
  const page = window.GALLA_PAGE_WATCH;
  if (page && page.mount) await page.mount(root, params || {});
}
export function unmount() {
  const page = window.GALLA_PAGE_WATCH;
  if (page && page.unmount) page.unmount();
}
