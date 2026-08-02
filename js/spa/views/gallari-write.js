/* ═══════════════════════════════════════════════════════════════
 * GALLA SPA 뷰 어댑터 — gallari-write (갈라리 작성: 숏판·롱판, 스택 뷰)
 *
 * 로직은 전부 기존 페이지 스크립트(js/gallari-write.js)가 담당하고,
 * 여기서는 필수 스크립트를 클래식 <script>로 1회 주입한 뒤
 * window.GALLA_PAGE_GALLARI_WRITE.mount(root, params)에 위임만 한다.
 *
 * ⚠️ 어댑터 신설 이유(2026-08-02): gallari-write는 유일하게 전용 어댑터가
 * 없어 라우터 loadPageScripts 폴백 + 자체 auto-init에 의존했다. 브라우저에선
 * 동작했지만 네이티브(WKWebView)에서 미디어 파이프라인 의존 스크립트/리스너·
 * WORKFORM 브리지 배선이 불안정(사진 선택·AI썸네일 첨부·미디어 토글 먹통).
 * predict-market 방식으로 통일 — deps를 순차 loadScriptOnce 후 결정적 mount.
 *
 * 셸(app.html)이 이미 로드하는 공유 싱글턴은 제외:
 *   vendor/supabase.js · js/supabase.js · js/error-logger.js
 * MPA 전용(back.js 등 셸 크롬)도 제외.
 * ═══════════════════════════════════════════════════════════════ */

const V = window.GALLA_V ? "?v=" + window.GALLA_V : "";

/* gallari-write.html 로드 순서 기준(셸 싱글턴·MPA 크롬 제외), 본체는 마지막 */
const SCRIPTS = [
  "/js/video-compress.js",   // 영상 압축(세로/가로 업로드 전처리)
  "/js/media-upload.js",     // GALLA_UPLOAD_MEDIA / GALLA_UPLOAD_VIDEO
  "/js/bg-video-upload.js",  // GALLA_bgVideo (백그라운드 영상 업로드)
  "/js/img-crop.js",         // GALLA_PROCESS_IMAGES (사진 4:5 크롭)
  "/js/write-media.js",      // 업로드 오버레이(인스타식) O()
  "/js/gallari-write.js",    // 페이지 본체 — GALLA_PAGE_GALLARI_WRITE 노출
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
  const page = window.GALLA_PAGE_GALLARI_WRITE;
  if (page && page.mount) await page.mount(root, params || {});
}

export function unmount() {
  const page = window.GALLA_PAGE_GALLARI_WRITE;
  if (page && page.unmount) page.unmount();
}
