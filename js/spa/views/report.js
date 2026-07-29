/* ═══════════════════════════════════════════════════════════════
 * GALLA SPA 뷰 어댑터 — report (report.html · 제보하기, 스택 뷰)
 *
 * 로직은 기존 페이지 스크립트(js/report.js)가 담당하고, 여기서는 필수
 * 스크립트를 1회 주입한 뒤 window.GALLA_PAGE_REPORT.mount(root)에 위임.
 * 뒤로가기(.rp-back)는 report.js가 SPA에서 스택 pop으로 바인딩한다.
 *
 * 셸(app.html) 공유 싱글턴(vendor/supabase·js/supabase·dm-call)과
 * MPA 전용(back·nav·pwa 등 셸 크롬)은 제외.
 * ═══════════════════════════════════════════════════════════════ */

const V = window.GALLA_V ? "?v=" + window.GALLA_V : "";

const SCRIPTS = [
  "/js/video-compress.js",   // media-upload 의존(영상 압축)
  "/js/media-upload.js",     // GALLA_UPLOAD_MEDIA (제보 미디어 업로드)
  "/js/draft.js",            // GALLA_draft (제보 임시저장)
  "/js/report.js",           // 페이지 본체 — GALLA_PAGE_REPORT 노출
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
  const page = window.GALLA_PAGE_REPORT;
  if (page && page.mount) await page.mount(root, params || {});
}
