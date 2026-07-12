/* =========================================================
   전역 미디어 사운드 — 인덱스 피드 · 릴스 · 이슈 영상 통일 제어
   단일 소스: localStorage 'gallaSound' (기본 ON)
   - window.GALLA_soundOn() : 현재 소리 선호(bool)
   - window.GALLA_setSound(on) : 선호 변경 + 현재 페이지 전 영상 즉시 반영 + 릴스 브리지
   - window.GALLA_gestured : 이 페이지에서 첫 제스처 발생 여부(자동재생 정책)
   브라우저 정책상 첫 제스처 전엔 소리 자동재생이 막혀 muted로 시작하되,
   제스처가 들어오면 선호가 ON인 영상은 자동으로 소리가 켜진다.
   ========================================================= */
(function () {
  const KEY = "gallaSound";
  window.GALLA_soundOn = () => localStorage.getItem(KEY) !== "0"; // 기본 켜짐

  function syncBtn(v) {
    // 알려진 음소거 버튼 아이콘 동기화 (index: mute-<id>, issue: issue-vid-mute)
    const idx = document.getElementById("mute-" + v.id.replace("vid-", ""));
    if (idx) idx.textContent = v.muted ? "🔇" : "🔊";
    if (v.id === "issue-vid") {
      const b = document.getElementById("issue-vid-mute");
      if (b) b.textContent = v.muted ? "🔇" : "🔊";
    }
  }
  window.GALLA_syncSoundBtns = () => document.querySelectorAll("video").forEach(syncBtn);

  window.GALLA_setSound = (on) => {
    localStorage.setItem(KEY, on ? "1" : "0");
    window.__REELS_MUTED__ = !on; // 릴스 엔진 브리지
    document.querySelectorAll("video").forEach(v => {
      if (on) { if (!v.paused) v.muted = false; }
      else { v.muted = true; }
      syncBtn(v);
    });
    document.dispatchEvent(new CustomEvent("galla:sound", { detail: { on } }));
  };

  // 릴스 플래그를 선호에서 초기화
  window.__REELS_MUTED__ = !window.GALLA_soundOn();

  // 첫 제스처 → 선호가 ON이면 재생 중 영상 자동 언뮤트 (정책 우회)
  window.GALLA_gestured = false;
  function onGesture() {
    if (window.GALLA_gestured) return;
    window.GALLA_gestured = true;
    if (window.GALLA_soundOn()) {
      document.querySelectorAll("video").forEach(v => { if (!v.paused) v.muted = false; syncBtn(v); });
    }
    document.dispatchEvent(new CustomEvent("galla:gesture"));
  }
  ["pointerdown", "touchend", "click", "keydown"].forEach(e =>
    window.addEventListener(e, onGesture, { passive: true }));
})();
