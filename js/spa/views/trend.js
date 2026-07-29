/* ═══════════════════════════════════════════════════════════════
 * SPA 뷰: trend (search.html — 검색·핫트렌드·뉴스·핫튜브·광장)
 *
 * 역할: 어댑터일 뿐 — 페이지 로직은 전부 기존 파일(js/search.js 등)에 있고,
 * 여기서는 ①필수 스크립트를 1회만 동적 로드하고 ②search.js가 노출한
 * window.GALLA_PAGE_TREND(mount/activate/…)로 위임한다.
 *
 * 셸(app.html)이 이미 로드하는 것은 제외: vendor/supabase.js, js/supabase.js
 * (waitForSupabaseClient·GALLA_thumb·GALLA_toast), dm-sound.js, dm-call.js.
 * 헤더·하단네비는 뷰 로더가 제거(셸 담당)라 알림(notifications)·write-hub는 싣지 않는다.
 * ═══════════════════════════════════════════════════════════════ */

const V = window.GALLA_V ? "?v=" + window.GALLA_V : "";

/* search.html의 <script> 순서를 따른 필수 목록(의존 순서 유지).
   type:"module"은 plaza.js뿐(원본도 type="module"). */
const SCRIPTS = [
  { src: "/js/fx.js" },                 // GALLA_FX(칩 버스트)
  { src: "/js/ghost.js" },              // GALLA_ghost·GALLA_userMap(핫튜브 댓글 유령)
  { src: "/js/follow.js" },             // user-sheet의 팔로우 버튼
  { src: "/js/user-sheet.js" },         // 닉네임(data-nick-uid) 프로필 시트
  { src: "/js/share-sheet.js" },        // 광장 공유
  { src: "/js/report-block.js" },       // 광장 신고·차단
  { src: "/js/draft.js" },              // GALLA_draft(광장 임시저장 — plaza.js보다 먼저)
  { src: "/js/plaza-render.js" },       // 광장 본문 렌더러
  { src: "/js/search.js" },             // 코어 — GALLA_PAGE_TREND 노출
  { src: "/js/hot-videos.js" },         // 핫튜브(즉시 bind — 이중 모드 처리됨)
  { src: "/js/plaza.js", module: true },// 광장 피드·글쓰기 엔진(원본도 module)
  // ⚠️ composer-page.js 제거 — SPA 광장 작성은 라우터 DOM-이동 스택 뷰라 불필요(마운트 실패 지점만 늘림). 웹은 search.html이 직접 로드.
  { src: "/js/trend-tab-order.js" },    // 저장된 서브탭 순서 복원(+편집 시트)
  { src: "/js/trend-guide.js" },        // 상단 안내 배너
  { src: "/js/trend-tour.js" },         // 첫 진입 코치마크
];

const stripV = (href) => String(href).replace(/[?&]v=[^&]+/, "").replace(/^\.\//, "/");

function hasScript(src) {
  const key = stripV(src);
  return [...document.querySelectorAll("script[src]")]
    .some((s) => stripV(s.getAttribute("src")) === key);
}

function loadScript(entry) {
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    if (entry.module) s.type = "module";
    s.async = false;                       // 삽입 순서대로 실행(의존 순서 보존)
    s.src = entry.src + V;
    s.onload = () => res();
    s.onerror = () => rej(new Error("script load fail: " + entry.src));
    document.head.appendChild(s);
  });
}

let scriptsReady = null;
function loadScriptsOnce() {
  if (!scriptsReady) {
    scriptsReady = (async () => {
      for (const e of SCRIPTS) {
        if (hasScript(e.src)) continue;    // 문서에 이미 있으면 스킵(중복 실행 방지)
        await loadScript(e);
      }
    })();
  }
  return scriptsReady;
}

/* search.html 인라인 스크립트 이식 — 뷰 로더가 <script>를 제거하므로 여기서 수행.
   (알림 폴러 인라인은 헤더가 셸 소유라 제외) */
function wireAppCta(root) {
  const btn = (root || document).querySelector("#trdAppCta");
  if (!btn || btn.dataset.wired) return;
  btn.dataset.wired = "1";
  const isApp = (typeof window.GALLA_isApp === "function" && window.GALLA_isApp())
    || window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true;
  if (isApp) { btn.remove(); return; }     // 앱으로 보는 중이면 유도 불필요
  btn.hidden = false;
  btn.addEventListener("click", () => {
    if (typeof window.GALLA_installApp === "function") return void window.GALLA_installApp();
    if (window.GALLA_canInstall && window.GALLA_canInstall()) return void window.GALLA_promptInstall();
    alert("브라우저 메뉴에서 ‘홈 화면에 추가’ 또는 ‘앱 설치’를 눌러주세요. 📲");
  });
}

const P = () => window.GALLA_PAGE_TREND;

export async function mount(root, params) {
  await loadScriptsOnce();
  wireAppCta(root);
  const p = P();
  if (p && p.mount) await p.mount(root, params || {});
}

export function unmount()    { const p = P(); if (p && p.unmount) p.unmount(); }
export function activate()   { const p = P(); if (p && p.activate) p.activate(); }
export function deactivate() { const p = P(); if (p && p.deactivate) p.deactivate(); }
export function scrolltop()  { const p = P(); if (p && p.scrolltop) p.scrolltop(); }
/* 구 셸 shellcmd 'trendtab' 대체 — 조그셔틀 등에서 서브탭 직행 */
export function setTab(t)    { const p = P(); if (p && p.setTab) p.setTab(t); }
