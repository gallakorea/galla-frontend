/* ═══════════════════════════════════════════════════════════════
 * GALLA SPA 뷰 어댑터 — settings (설정, 스택 뷰)
 *
 * 로직은 전부 기존 페이지 스크립트(js/settings.js 이중 모드)가 담당하고,
 * 여기서는 필수 스크립트를 1회 주입한 뒤
 * window.GALLA_PAGE_SETTINGS.mount(root, params)에 위임만 한다.
 * settings.html의 인라인 <script>(패스키 노출·타일 바인딩·관리자 링크 등)는
 * view-loader가 제거하므로 js/settings.js의 SPA 전용 보강이 대신 수행한다.
 *
 * id 충돌 주의: profileName이 마이페이지 탭(mypage.html)에도 있다 —
 * 본체가 조회를 root 스코프로 국소화해 해결.
 *
 * 셸(app.html)이 이미 로드하는 공유 싱글턴은 제외:
 *   vendor/supabase.js · js/supabase.js · js/dm-sound.js · js/dm-call.js
 * MPA 전용(nav, back, pwa, analytics 등 셸 크롬)도 제외.
 * ═══════════════════════════════════════════════════════════════ */

const V = window.GALLA_V ? "?v=" + window.GALLA_V : "";

/* settings.html 로드 순서 그대로(크롬 제외), 본체는 마지막 앞(bug-report는 지연 사용) */
const SCRIPTS = [
  "/js/logout-flow.js",   // GALLA_logout (만류 팝업)
  "/js/galla-type.js",    // GALLA_computeType (성향 카드)
  "/js/items.js",         // openShop (상점 타일)
  "/js/charge.js",        // GALLA_openCharge(갈라페이 GC 충전)
  "/js/titles.js",        // GALLA_openTitles (칭호 타일)
  "/js/gacha.js",         // GALLA_openGacha (가챠 타일)
  "/js/gallian.js",       // GALLA_gallianOf (레벨·XP 게이지)
  "/js/social-auth.js",   // GALLA_passkeyRegister·온보딩 모달
  "/js/settings.js",      // 페이지 본체 — GALLA_PAGE_SETTINGS 노출
  "/js/bug-report.js",    // GALLA_openBugReport / GALLA_enableShakeReport (버그 신고 항목)
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
  const page = window.GALLA_PAGE_SETTINGS;
  if (page && page.mount) await page.mount(root, params || {});
}

export function unmount() {
  const page = window.GALLA_PAGE_SETTINGS;
  if (page && page.unmount) page.unmount();
}

export function scrolltop() {
  const page = window.GALLA_PAGE_SETTINGS;
  if (page && page.scrolltop) page.scrolltop();
}
