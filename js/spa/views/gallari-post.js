/* ═══════════════════════════════════════════════════════════════
 * GALLA SPA 뷰 어댑터 — gallari-post (숏판·롱판 상세, 스택 뷰)
 *
 * 26.9.19 QA 에서 이 어댑터가 없어 범용 폴백이 페이지 스크립트를 한 번만 실행 →
 * 두 번째로 여는 숏판·롱판부터 「불러오는 중…」에서 멈췄다(롱판 카드·사진 숏판·마이·저장함·댓글 바로가기 전부).
 * 로직은 js/gallari-post.js 가 담당하고, 여기서는 의존 스크립트를 싣고 화면마다 init(host) 를 부른다.
 * ═══════════════════════════════════════════════════════════════ */

const V = window.GALLA_V ? "?v=" + window.GALLA_V : "";

const SCRIPTS = [
  "/js/support-btn.js",     // GALLA_support(후원 버튼 공용)
  "/js/donate.js",          // openDonatePost(후원 시트)
  "/js/report-block.js",    // 남의 글 ⋯ → 신고·차단
  "/js/owner-actions.js",   // GALLA_canManage / GALLA_openOwnerMenu
  "/js/follow.js",          // GALLA_bindFollow
  "/js/gallari-post.js",    // 본체 — GALLA_PAGE_GALLARI_POST (SPA 에선 스스로 실행하지 않는다)
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
    s.async = false;
    s.src = src + V;
    s.onload = () => res();
    s.onerror = () => { loadedOnce.delete(src); rej(new Error("script load fail " + src)); };
    document.head.appendChild(s);
  });
}

export async function mount(root) {
  await Promise.all(SCRIPTS.map(loadScriptOnce));
  const page = window.GALLA_PAGE_GALLARI_POST;
  if (page && page.mount) await page.mount(root);
}

export function unmount() {}
