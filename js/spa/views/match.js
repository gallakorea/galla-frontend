/* ═══════════════════════════════════════════════════════════════
 * SPA 뷰: match (갈라 궁합)
 *
 * 왜 어댑터가 필요한가 — 라우터의 범용 폴백(loadPageScripts)은 스크립트를
 * 세션당 1회만 로드한다(loadedPageScripts Set). 즉 두 번째로 궁합을 열면
 * 스크립트가 다시 안 돌아 빈 화면이 된다. 그래서 전용 어댑터로 mount를
 * 결정적으로 호출한다. [[galla-native-app]]의 gallari-write 교훈과 같은 이유.
 * ═══════════════════════════════════════════════════════════════ */

const V = window.GALLA_V ? "?v=" + window.GALLA_V : "";
let loaded = null;

function loadOnce() {
  if (!loaded) {
    loaded = new Promise((res, rej) => {
      if (window.GALLA_PAGE_MATCH) return res();
      const s = document.createElement("script");
      s.src = "/js/match.js" + V;
      s.async = false;
      s.onload = () => res();
      s.onerror = () => rej(new Error("match.js load fail"));
      document.head.appendChild(s);
    });
  }
  return loaded;
}

export async function mount(root, params) {
  await loadOnce();
  // 라우터가 준 쿼리(#/match?vs=…)를 그대로 넘긴다 — SPA에선 location.search가 셸 것이라 못 쓴다.
  if (window.GALLA_PAGE_MATCH && window.GALLA_PAGE_MATCH.mount) {
    window.GALLA_PAGE_MATCH.mount(params || null);
  }
}
