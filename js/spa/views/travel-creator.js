/* ═══════════════════════════════════════════════════════════════
 * GALLA SPA 뷰 어댑터 — travel-creator (크리에이터 여정, 스택 뷰)
 *
 * 로직은 js/travel-creator.js 가 전부 갖고 있고 여기서는 그 스크립트를 1회 주입한 뒤
 * window.GALLA_PAGE_TRAVEL_CREATOR.mount(root, params) 에 위임만 한다(광장 상세와 같은 계약).
 * ⚠️ 뷰 로더는 HTML 안의 <script> 를 버린다 — 여기 배열에 없으면 앱에서 화면이 통째로 빈다.
 * ═══════════════════════════════════════════════════════════════ */
const V = window.GALLA_V ? "?v=" + window.GALLA_V : "";
const SCRIPTS = [
  "/js/travel-creator.js",   // 본체
  "/js/dm.js",             // DM 배지·GALLA_openDM (셸 크롬이 아닌 페이지 스크립트라 여기서 싣는다)
  "/js/dm-live.js",        // 라이브 난장 진입 — dm.js 뒤
];

function alreadyInDoc(src) {
  const bare = src.split("?")[0].replace(/^\.?\//, "");
  for (const s of document.scripts) {
    const p = (s.getAttribute("src") || "").split("?")[0].replace(/^\.?\//, "");
    if (p === bare) return true;
  }
  return false;
}
function loadScript(src) {
  return new Promise((res, rej) => {
    if (alreadyInDoc(src)) return res();
    const el = document.createElement("script");
    el.src = src + V;
    el.onload = res;
    el.onerror = () => rej(new Error("load " + src));
    document.head.appendChild(el);
  });
}

export async function mount(root, params) {
  for (const s of SCRIPTS) { try { await loadScript(s); } catch (_) {} }
  const api = window.GALLA_PAGE_TRAVEL_CREATOR;
  if (api && api.mount) return api.mount(root, params || {});
}
export function unmount() {
  const api = window.GALLA_PAGE_TRAVEL_CREATOR;
  if (api && api.unmount) api.unmount();
}
