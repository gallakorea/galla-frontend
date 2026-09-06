/* ===========================================================
   config.js
   - GALLA 전역 설정 파일
   - 환경별 설정 (dev / prod)
   - API URL / Supabase 키 / 기능 플래그
   - 전체 프로젝트에서 window.CONFIG 로 접근
=========================================================== */

window.CONFIG = {
    /* -------------------------------------------------------
       기본 정보
    ------------------------------------------------------- */
    APP_NAME: "GALLA",
    APP_VERSION: "1.0.0",

    /* -------------------------------------------------------
       환경 설정
    ------------------------------------------------------- */
    ENV: "development", // production 변경 가능

    /* -------------------------------------------------------
       Supabase 설정
       (⚠️ 실제 서비스에서는 .env 파일에 보관!)
    ------------------------------------------------------- */
    SUPABASE_URL: "https://YOUR_PROJECT_ID.supabase.co",
    SUPABASE_KEY: "public-anon-key-placeholder",  // 실제 키로 교체 필요

    /* -------------------------------------------------------
       기능 플래그
    ------------------------------------------------------- */
    FEATURES: {
        ENABLE_AI_PREDICTION: true,
        ENABLE_NOTIFICATIONS: false,
        ENABLE_LOGGING: true
    },

    /* -------------------------------------------------------
       API 경로
    ------------------------------------------------------- */
    API: {
        FEED_LIST: "/api/feed",
        ISSUE_DETAIL: "/api/issue",
        USER_PROFILE: "/api/user",
        ADMIN_REPORTS: "/api/admin/reports",
    },

    /* -------------------------------------------------------
       로그 함수 (DEBUG 모드)
    ------------------------------------------------------- */
    log: (...msg) => {
        if (window.CONFIG.ENV === "development" && window.CONFIG.FEATURES.ENABLE_LOGGING) {
            console.log("[GALLA LOG]:", ...msg);
        }
    }
};
/* 💳 포트원(PortOne) 결제 설정은 여기 없다 → js/charge.js 상단으로 옮겼다(2026-09-06).
   이 파일은 charge-return.html 한 곳에서만 로드돼서, 정작 충전 시트가 뜨는
   mypage·wallet·issue·settings 에는 window.GALLA_PORTONE 이 실리지 않았다.
   유일한 소비자(charge.js)가 스스로 들고 있는 게 맞다. */
