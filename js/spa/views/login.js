/* ═══════════════════════════════════════════════════════════════
 * GALLA SPA 뷰 어댑터 — login (login.html)
 *
 * 로직은 기존 페이지 스크립트(js/login.js)가 담당하고,
 * 여기서는 필수 스크립트를 클래식 <script>로 1회 주입한 뒤
 * window.GALLA_PAGE_LOGIN.mount(root, params)에 위임만 한다.
 *   · params.next — 로그인 성공 후 복귀 라우트(탭명·파일명·라우트 모두 허용)
 *
 * 셸(app.html)이 이미 로드하는 공유 싱글턴(vendor/supabase·js/supabase)과
 * MPA 전용(splash-boot·back.js·pwa·pull-refresh, login.html 인라인 pw-toggle —
 * SPA에선 GALLA_PAGE_LOGIN.mount 가 대신 바인딩)은 제외.
 * 히스토리 트랩·스와이프 홈·셸 pop-out 은 js/login.js 가 MPA에서만 심는다.
 * ═══════════════════════════════════════════════════════════════ */

const V = window.GALLA_V ? "?v=" + window.GALLA_V : "";

const SCRIPTS = [
  "/js/login.js",        // 페이지 본체 — GALLA_PAGE_LOGIN 노출
  "/js/social-auth.js",  // GALLA_renderSocialButtons(간편 로그인) — mount가 명시 렌더
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
  // login.html body는 data-page="mypage"(하단탭 하이라이트용) — 뷰 호스트엔 login으로 교정
  if (root && root.dataset) root.dataset.page = "login";
  const page = window.GALLA_PAGE_LOGIN;
  if (page && page.mount) await page.mount(root, params || {});
}

export function unmount() {
  const page = window.GALLA_PAGE_LOGIN;
  if (page && page.unmount) page.unmount();
}
