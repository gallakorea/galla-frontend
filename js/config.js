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
/* 💳 포트원(PortOne) 결제 설정
   ⚠️ 여기 값이 비어 있으면 결제 버튼이 '준비 중' 안내로 떨어진다(js/charge.js payReady).
      PG 심사가 끝나 채널키를 받으면 이 두 줄만 채우면 결제가 열린다.
   ⚠️ storeId·channelKey 는 공개돼도 되는 식별자다(비밀키가 아니다).
      실제 지급 권한은 서버(portone-webhook + PORTONE_API_SECRET)에만 있다.
   조회 위치: 포트원 관리자콘솔 > 결제연동 > 연동 정보 */
window.GALLA_PORTONE = {
  storeId: "",      // store-xxxxxxxx-xxxx-...
  channelKey: "",   // channel-key-xxxxxxxx-... (NHN KCP 채널)
};
