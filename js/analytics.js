/* =========================================================
   analytics.js — Google Analytics 4 (GA4) 로더
   측정 ID: G-W5SRBDP19K (galla.im 웹 스트림)
   - gtag.js를 비동기 로드, IP 익명화, 개인정보 최소화
   - file:// (로컬 파일)·프리뷰에선 로드 안 함
   ========================================================= */
(function () {
  var GA_ID = "G-W5SRBDP19K";
  if (location.protocol === "file:") return;
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/.test(location.hostname)) return;

  var s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_ID;
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag("js", new Date());
  // 개인정보 최소화: IP 익명화, 광고 개인화 신호 비활성
  gtag("config", GA_ID, {
    anonymize_ip: true,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
})();
