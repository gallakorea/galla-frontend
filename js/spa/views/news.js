/* ═══════════════════════════════════════════════════════════════
 * GALLA SPA 뷰 어댑터 — news (news.html · 뉴스 상세 리더)
 *   ?gn=<id>            갈라뉴스(AI 종합) / ?url=&title=&press= 원문 리더
 * 로직은 news-page.js가 담당, 여기선 스크립트 1회 주입 후 mount 위임.
 * 제외(셸 싱글턴/타 모듈 담당): supabase·error-logger·nav·back·pwa·pull-refresh·
 *   analytics·duel-alert·bug-report·desktop-pc·nav-jog·dm-call.
 * ═══════════════════════════════════════════════════════════════ */
const V = window.GALLA_V ? "?v=" + window.GALLA_V : "";

const SCRIPTS = [
  "/js/comment-actions.js", // 댓글 수정·삭제
  "/js/share-sheet.js",     // GALLA_share/shareUrl
  "/js/follow.js",          // 팔로우 버튼
  "/js/user-sheet.js",      // 닉네임 프로필 시트
  "/js/ghost.js",           // 유령 페르소나(댓글)
  "/js/items.js",           // 상점(필요 시)
  "/js/dm.js",              // GALLA_openDM + 배지
  "/js/fx.js",              // 파티클
  "/js/news-page.js",       // 본체 — GALLA_PAGE_NEWS 노출
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
    s.onerror = () => { loadedOnce.delete(src); res(); };   // 하나 실패해도 계속(기능 저하)
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
  const page = window.GALLA_PAGE_NEWS;
  if (page && page.mount) await page.mount(root, params || {});
}
export function unmount() {
  const page = window.GALLA_PAGE_NEWS;
  if (page && page.unmount) page.unmount();
}
