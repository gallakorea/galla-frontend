/* =========================================================
   전역 미디어 사운드 — 인덱스 피드 · 릴스 · 이슈 영상 통일 (인스타 로직)
   단일 소스: sessionStorage 'gallaSound'  ("1"=소리, 그 외=음소거)
     · 처음 진입(새 세션)엔 항상 음소거로 시작.
     · 세션 동안 페이지를 오가도(인덱스↔이슈↔릴스) 상태 유지.
     · 릴스/이슈에 '진입'하면 소리를 켠다(몰입 뷰). 거기서 음소거하면 그 상태가
       인덱스로도 이어진다. 인덱스에서 스크롤해도 현재 재생 영상은 전역 상태를 따른다.
   API:
     window.GALLA_soundOn()      현재 소리 선호(bool)
     window.GALLA_setSound(on)   선호 변경 + 현재 페이지 전 영상 즉시 반영 + 릴스 브리지
     window.GALLA_enterImmersive() 릴스·이슈 진입 시 소리 ON (몰입)
     window.GALLA_muteIcon(muted) 음소거 버튼 SVG 문자열(기기별 이모지 편차 제거)
     window.GALLA_gestured       이 페이지 첫 제스처 발생 여부(자동재생 정책)
   브라우저 정책상 첫 제스처 전엔 소리 자동재생이 막혀 muted로 시작하되,
   제스처가 들어오면 선호가 ON인 재생 영상은 자동으로 소리가 켜진다.
   ========================================================= */
(function () {
  const KEY = "gallaSound";
  // 기본 음소거 — 세션 저장이라 새 탭/앱 실행마다 다시 음소거로 시작.
  window.GALLA_soundOn = () => sessionStorage.getItem(KEY) === "1";

  /* 음소거 버튼 아이콘(스피커) — 기기마다 크기·모양이 다른 이모지 대신 SVG로 통일 */
  const SVG = (inner) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  const SPK = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none"/>`;
  const ICON_OFF = SVG(`${SPK}<line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>`);
  const ICON_ON = SVG(`${SPK}<path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>`);
  window.GALLA_muteIcon = (muted) => (muted ? ICON_OFF : ICON_ON);

  function syncBtn(v) {
    // 알려진 음소거 버튼 아이콘 동기화 (index: mute-<id>, issue: issue-vid-mute)
    const set = (el) => { if (el) el.innerHTML = window.GALLA_muteIcon(v.muted); };
    set(document.getElementById("mute-" + v.id.replace("vid-", "")));
    if (v.id === "issue-vid") set(document.getElementById("issue-vid-mute"));
  }
  window.GALLA_syncSoundBtns = () => document.querySelectorAll("video").forEach(syncBtn);

  window.GALLA_setSound = (on) => {
    on = !!on;
    sessionStorage.setItem(KEY, on ? "1" : "0");
    window.__REELS_MUTED__ = !on; // 릴스 엔진 브리지
    document.querySelectorAll("video").forEach(v => {
      if (on) { if (!v.paused) v.muted = false; }  // 재생 중인 것만 즉시 언뮤트(정책 안전)
      else { v.muted = true; }
      syncBtn(v);
    });
    document.dispatchEvent(new CustomEvent("galla:sound", { detail: { on } }));
  };

  // 릴스·이슈 진입 = 몰입 뷰 → 소리 ON (인스타처럼). 이후 음소거하면 전역으로 이어짐.
  window.GALLA_enterImmersive = () => window.GALLA_setSound(true);

  // 릴스 플래그를 선호에서 초기화 (기본 음소거 → 릴스도 음소거 플래그로 시작)
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
