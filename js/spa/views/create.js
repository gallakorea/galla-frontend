/* ═══════════════════════════════════════════════════════════════
 * GALLA SPA 뷰 어댑터 — create (create.html · '새로 만들기' 허브)
 *
 * 로직은 기존 페이지 스크립트(js/create.js)가 담당하고,
 * 여기서는 필수 스크립트를 클래식 <script>로 1회 주입한 뒤
 * window.GALLA_PAGE_CREATE.mount(root)에 위임만 한다.
 *
 * 셸(app.html)이 이미 로드하는 공유 싱글턴(vendor/supabase·js/supabase·dm-call)과
 * MPA 전용(back.js·nav.js·social-auth·pwa 등 셸 크롬)은 제외.
 * 로더가 header.header를 걷어내므로(셸 크롬 규약) 뒤로가기 헤더는 여기서 재생성.
 * ═══════════════════════════════════════════════════════════════ */

const V = window.GALLA_V ? "?v=" + window.GALLA_V : "";

const SCRIPTS = [
  "/js/bug-report.js",    // GALLA_openBugReport (버그 신고 카드)
  "/js/create.js",        // 페이지 본체 — GALLA_PAGE_CREATE 노출
  "/js/create-guide.js",  // 부가 안내(배너·코치마크) — GALLA_CREATE_GUIDE_START/STOP
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

/* 로더가 걷어낸 create.html 헤더(header.header) 재생성 — 같은 클래스라 기존 CSS 그대로.
   뒤로가기 = 스택 pop (마크업 파일은 불변, DOM만 뷰 안에 생성) */
function ensureHead(root) {
  if (root.querySelector(".cr-head")) return;
  const head = document.createElement("header");
  head.className = "header header-common";
  head.innerHTML =
    '<div class="header-inner cr-head">' +
      '<button class="cr-back" aria-label="닫기">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>' +
      '</button>' +
      '<span class="cr-title">새로 만들기</span>' +
      '<span class="cr-spacer"></span>' +
    '</div>';
  head.querySelector(".cr-back").addEventListener("click", () => {
    try { window.GALLA_SPA && window.GALLA_SPA.pop(); } catch (_) {}
  });
  root.prepend(head);
}

export async function mount(root, params) {
  for (const src of SCRIPTS) await loadScriptOnce(src);   // 순차 — 의존 순서 보장
  ensureHead(root);
  const page = window.GALLA_PAGE_CREATE;
  if (page && page.mount) await page.mount(root, params || {});
}

export function unmount() {
  const page = window.GALLA_PAGE_CREATE;
  if (page && page.unmount) page.unmount();
}
