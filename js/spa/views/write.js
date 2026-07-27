/* ═══════════════════════════════════════════════════════════════
 * GALLA SPA 뷰 어댑터 — write (write.html · 갈라 발제 작성)
 *
 * 로직은 전부 기존 페이지 스크립트들이 담당하고,
 * 여기서는 필수 스크립트를 클래식 <script>로 1회 주입한 뒤
 * window.GALLA_PAGE_WRITE.mount(root, params)에 위임만 한다.
 * (write.ai / draft.restore / draft.save 는 GALLA_WRITE_INITS 로 등록되어
 *  GALLA_PAGE_WRITE.mount 가 순서대로 부른다)
 *
 * 셸(app.html)이 이미 로드하는 공유 싱글턴(vendor/supabase·js/supabase·dm-call)과
 * MPA 전용(back.js·nav.js·pwa·pull-refresh 등 셸 크롬)은 제외.
 * write.html의 상단 앱바(.wr-appbar)는 header.header가 아니라 로더가 보존 —
 * 뒤로가기(.wr-back)는 GALLA_PAGE_WRITE.mount 가 스택 pop으로 바인딩한다.
 * ═══════════════════════════════════════════════════════════════ */

const V = window.GALLA_V ? "?v=" + window.GALLA_V : "";

/* 순서 의존(write.html 로드 순서 그대로): video-compress → media-upload → bg-video-upload,
   draft/vote-bar → write 본체 → write.ai → draft.restore → draft.save(반드시 마지막) */
const SCRIPTS = [
  "/js/video-compress.js",       // media-upload 의존
  "/js/media-upload.js",         // GALLA_UPLOAD_MEDIA / GALLA_UPLOAD_VIDEO
  "/js/bg-video-upload.js",      // GALLA_bgVideo (영상 배경 선업로드)
  "/js/img-crop.js",             // GALLA_PROCESS_IMAGES (4:5 크롭)
  "/js/draft.js",                // GALLA_draft (텍스트 자동 임시저장)
  "/js/vote-bar.js",             // GALLA_VoteBar (미리보기 진영바)
  "/js/write.js",                // 페이지 본체 — GALLA_PAGE_WRITE 노출
  "/js/write.ai.js",             // GALLA_WRITE_INITS.ai
  "/js/write.draft.restore.js",  // GALLA_WRITE_INITS.restore
  "/js/write.draft.save.js",     // GALLA_WRITE_INITS.save
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
  const page = window.GALLA_PAGE_WRITE;
  if (page && page.mount) await page.mount(root, params || {});
}

export function unmount() {
  const page = window.GALLA_PAGE_WRITE;
  if (page && page.unmount) page.unmount();
}
