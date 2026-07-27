/* ═══════════════════════════════════════════════════════════════
 * GALLA SPA 뷰 어댑터 — notifications (알림, 스택 뷰)
 *
 * 로직은 전부 기존 페이지 스크립트(js/notifications-page.js 이중 모드)가 담당하고,
 * 여기서는 필수 스크립트를 1회 주입한 뒤
 * window.GALLA_PAGE_NOTIFICATIONS.mount(root, params)에 위임만 한다.
 * unmount 시 실시간 알림 채널(noti-page-*)이 해제된다.
 *
 * '모두 읽음' 버튼은 페이지 헤더(셸 크롬으로 제거) 안이라 SPA엔 없다 —
 * 열람 시 자동 전체 읽음 처리가 동작을 대체한다.
 *
 * 셸(app.html)이 이미 로드하는 공유 싱글턴은 제외:
 *   vendor/supabase.js · js/supabase.js · js/dm-sound.js · js/dm-call.js
 * MPA 전용(nav, back, pwa 등 셸 크롬)도 제외.
 * ═══════════════════════════════════════════════════════════════ */

const V = window.GALLA_V ? "?v=" + window.GALLA_V : "";

/* 순서 의존: noti-icons(GALLA_svgIcon) → 본체 */
const SCRIPTS = [
  "/js/noti-icons.js",         // GALLA_svgIcon (유형 아이콘 세트)
  "/js/notifications-page.js", // 페이지 본체 — GALLA_PAGE_NOTIFICATIONS 노출
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
  const page = window.GALLA_PAGE_NOTIFICATIONS;
  if (page && page.mount) await page.mount(root, params || {});
}

export function unmount() {
  const page = window.GALLA_PAGE_NOTIFICATIONS;
  if (page && page.unmount) page.unmount();
}

export function scrolltop() {
  const page = window.GALLA_PAGE_NOTIFICATIONS;
  if (page && page.scrolltop) page.scrolltop();
}
