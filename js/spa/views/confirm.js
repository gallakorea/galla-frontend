/* ═══════════════════════════════════════════════════════════════
 * GALLA SPA 뷰 어댑터 — confirm (confirm.html · 발행 전 적합성 검사)
 *
 * 로직은 기존 페이지 스크립트(js/confirm.js)가 담당하고,
 * 여기서는 필수 스크립트를 클래식 <script>로 1회 주입한 뒤
 * window.GALLA_PAGE_CONFIRM.mount(root, params)에 위임만 한다.
 *   · params.draft — issues_draft id (write 뷰가 push 시 전달)
 *
 * 셸(app.html)이 이미 로드하는 공유 싱글턴(vendor/supabase·js/supabase·dm-call)과
 * MPA 전용(nav.js·pwa·pull-refresh, confirm.html 인라인 backTop 스크립트 —
 * SPA에선 GALLA_PAGE_CONFIRM.mount 가 대신 바인딩)은 제외.
 * ═══════════════════════════════════════════════════════════════ */

const V = window.GALLA_V ? "?v=" + window.GALLA_V : "";

const SCRIPTS = [
  "/js/confirm.js",   // 페이지 본체 — GALLA_PAGE_CONFIRM 노출
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
  for (const src of SCRIPTS) await loadScriptOnce(src);
  const page = window.GALLA_PAGE_CONFIRM;
  if (page && page.mount) await page.mount(root, params || {});
}

export function unmount() {
  const page = window.GALLA_PAGE_CONFIRM;
  if (page && page.unmount) page.unmount();
}
