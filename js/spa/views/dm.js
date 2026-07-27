/* ═══════════════════════════════════════════════════════════════
 * GALLA SPA 뷰 어댑터 — dm (dm.html)
 *
 * 로직은 전부 기존 페이지 스크립트(js/dm.js 이중 모드)가 담당하고,
 * 여기서는 필수 스크립트를 클래식 <script>로 1회 주입한 뒤
 * window.GALLA_PAGE_DM.mount(root, params)에 위임만 한다.
 *
 * 셸(app.html)이 이미 로드하는 공유 싱글턴은 제외(재로드 절대 금지):
 *   vendor/supabase.js · js/supabase.js · js/dm-sound.js · js/dm-call.js
 *   (통화 엔진 dm-call.js는 단일문서 최상위에서 돈다 — dm.js의
 *    window.GALLA_call.start(...) 직접 호출이 그대로 진짜 엔진에 닿는다)
 * MPA 전용 크롬(snapshot, nav, pwa, a2hs, analytics, pull-refresh,
 *   desktop-pc, nav-jog, social-auth, push, write-hub, duel-alert)도 제외.
 * dm-tour.js·dm-guide.js는 body[data-page="dm"]가 아니면 스스로 종료라 SPA에선 생략.
 * CSS(dm/dm-quiet/items/write-hub)는 view-loader가 dm.html <link>에서 주입.
 * ═══════════════════════════════════════════════════════════════ */

const V = window.GALLA_V ? "?v=" + window.GALLA_V : "";

/* dm.html 로드 순서 그대로(뒤 스크립트가 앞 전역을 쓴다) — dm.js 뒤에 dm-live.js */
const SCRIPTS = [
  "/js/battle-fx.js",     // BattleFX(햅틱) — dm 토스트·연출이 optional로 사용
  "/js/dm-stickers.js",   // GALLA_STK(이모티콘 엔진)
  "/js/dm-e2e.js",        // GALLA_e2e(비밀대화)
  "/js/dm-pager.js",      // GALLA_PAGER(삐삐 사서함·액정 팝업)
  "/js/share-sheet.js",   // GALLA_share(라이브 🔗 공유 등)
  "/js/follow.js",        // .js-follow 공용(라이브 무대 프로필 팔로우)
  "/js/items.js",         // 상점·아이템(무전기 사용권 게이팅 등)
  "/js/dm.js",            // 페이지 본체 — GALLA_PAGE_DM 노출(이중 모드)
  "/js/dm-live.js",       // 🎙 라이브 난장(난장 탭 LIVE 섹션) — dm.js 뒤
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
  const page = window.GALLA_PAGE_DM;
  if (page && page.mount) await page.mount(root, params || {});
  // 첫 페인트용 스켈레톤(dm.html의 data-snap-ghost) — MPA에선 snapshot.js가 걷지만
  // SPA엔 snapshot.js가 없다 → 진짜 UI(mount)가 섰으니 여기서 걷는다
  try { root.querySelectorAll("[data-snap-ghost]").forEach(n => n.remove()); } catch (_) {}
}

export function unmount() {
  const page = window.GALLA_PAGE_DM;
  if (page && page.unmount) page.unmount();
}

export function activate() {
  const page = window.GALLA_PAGE_DM;
  if (page && page.activate) page.activate();
}

export function deactivate() {
  const page = window.GALLA_PAGE_DM;
  if (page && page.deactivate) page.deactivate();
}

export function scrolltop() {
  const page = window.GALLA_PAGE_DM;
  if (page && page.scrolltop) page.scrolltop();
}
