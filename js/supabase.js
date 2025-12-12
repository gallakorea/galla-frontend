// js/supabase.js
console.log("[supabase.js] 로드됨 - 초기화 대기");

(async () => {

    /* ============================================================
       Supabase CDN 로딩 대기
       ============================================================ */
    while (!window.supabase || !window.supabase.createClient) {
        console.log("[supabase.js] Supabase 라이브러리 대기중...");
        await new Promise(r => setTimeout(r, 40));
    }

    console.log("[supabase.js] Supabase 라이브러리 로드 완료");

    /* ============================================================
       Supabase 기본 설정
       ============================================================ */
    const SUPABASE_URL = "https://bidqauputnhkqepvdzrr.supabase.co";
    const SUPABASE_ANON_KEY = "sb_publishable_XrZUsf09b6gBsDzSDAZ_fw_uJVqv-9E";

    window.supabaseClient = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY
    );

    console.log("[supabase.js] Supabase 클라이언트 생성됨:", window.supabaseClient);

    /* ============================================================
       Cloudflare 환경 변수 (write.js가 사용)
       ============================================================ */
    
    // Cloudflare Account ID (절대 변하지 않음)
    window.CF_ACCOUNT_ID = "8c46fbeae6e69848470dfacaaa8beb03";

    // Cloudflare Images 토큰 (너가 생성한 Read+Write)
    window.CF_IMAGES_TOKEN = "r0LhwA1xxC-SfHIFN_8_Sw-Q_Zd3QBvWdQmEirRt";

    // Cloudflare Stream 토큰 (너가 방금 준 새 토큰)
    window.CF_STREAM_TOKEN = "r0LhwA1xxC-SfHIFN_8_Sw-Q_Zd3QBvWdQmEirRt";

    console.log("[supabase.js] Cloudflare ENV 로드 완료", {
        CF_ACCOUNT_ID: window.CF_ACCOUNT_ID,
        CF_IMAGES_TOKEN: window.CF_IMAGES_TOKEN,
        CF_STREAM_TOKEN: window.CF_STREAM_TOKEN
    });

})();