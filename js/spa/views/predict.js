/* ═══════════════════════════════════════════════════════════════
 * GALLA SPA 뷰 어댑터 — predict (galla-predict.html)
 *
 * 로직은 전부 기존 페이지 스크립트(js/galla-predict.js)가 담당하고,
 * 여기서는 필수 스크립트를 클래식 <script>로 1회 주입한 뒤
 * window.GALLA_PAGE_PREDICT.mount(root)에 위임만 한다.
 *
 * 셸(app.html)이 이미 로드하는 공유 싱글턴은 제외:
 *   vendor/supabase.js · js/supabase.js · js/dm-sound.js · js/dm-call.js
 * MPA 전용(splash-boot, snapshot, pwa, nav 등 셸 크롬)도 제외.
 * ═══════════════════════════════════════════════════════════════ */

const V = window.GALLA_V ? "?v=" + window.GALLA_V : "";

/* 순서 의존: video-compress → media-upload, 본체(galla-predict)는 마지막 */
const SCRIPTS = [
  "/js/follow.js",         // GALLA_bindFollow (유저시트 팔로우 버튼)
  "/js/ghost.js",          // GALLA_userMap / GALLA_userBadge + data-nick-uid 위임
  "/js/user-sheet.js",     // GALLA_openUserSheet (프로필 시트)
  "/js/share-sheet.js",    // GALLA_share / GALLA_shareUrl (카드 공유)
  "/js/tiers.js",          // GALLA_tierOf / GALLA_tierBadge (랭킹 탭)
  "/js/fx.js",             // GALLA_FX (파티클 연출)
  "/js/video-compress.js", // media-upload 의존
  "/js/media-upload.js",   // GALLA_UPLOAD_MEDIA (마켓 생성 이미지)
  "/js/draft.js",          // GALLA_draft (작성 임시저장)
  "/js/galla-predict.js",  // 페이지 본체 — GALLA_PAGE_PREDICT 노출
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
  const page = window.GALLA_PAGE_PREDICT;
  if (page && page.mount) await page.mount(root, params || {});
}

export function unmount() {
  const page = window.GALLA_PAGE_PREDICT;
  if (page && page.unmount) page.unmount();
}

export function activate() {
  const page = window.GALLA_PAGE_PREDICT;
  if (page && page.activate) page.activate();
}

export function deactivate() {
  const page = window.GALLA_PAGE_PREDICT;
  if (page && page.deactivate) page.deactivate();
}

export function scrolltop() {
  const page = window.GALLA_PAGE_PREDICT;
  if (page && page.scrolltop) page.scrolltop();
}
