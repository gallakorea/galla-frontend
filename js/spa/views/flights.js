/* ═══════════════════════════════════════════════════════════════
 * GALLA SPA 뷰 어댑터 — flights (항공권 검색, 스택 뷰)
 *
 * 하이브리드: 여행 탭 '항공권' 세그와 같은 모듈(GALLA_TravelFlights)을 쓴다.
 * 검색에서 "도쿄 항공권" → GALLA_SPA.push("flights", {to}) 로 이 스택 페이지가 열린다.
 * ⚠️ 뷰 로더는 HTML 안의 <script> 를 버린다 — 여기 배열에 없으면 앱에서 화면이 빈다.
 * ═══════════════════════════════════════════════════════════════ */
const V = window.GALLA_V ? "?v=" + window.GALLA_V : "";
const SCRIPTS = [
  "/js/travel-flights.js",   // GALLA_TravelFlights (본체)
  "/js/flights.js",          // GALLA_PAGE_FLIGHTS (얇은 래퍼)
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
  const api = window.GALLA_PAGE_FLIGHTS;
  if (api && api.mount) return api.mount(root, params || {});
}
export function unmount() {
  const api = window.GALLA_PAGE_FLIGHTS;
  if (api && api.unmount) api.unmount();
}
