// js/supabase.js

console.log("[supabase.js] 로드됨 - 초기화 대기");

(async () => {

    // Supabase CDN이 로딩될 때까지 대기
    while (!window.supabase || !window.supabase.createClient) {
        console.log("[supabase.js] Supabase 라이브러리 대기중...");
        await new Promise(r => setTimeout(r, 40));
    }

    console.log("[supabase.js] Supabase 라이브러리 로드 완료");

    const SUPABASE_URL = "https://bidqauputnhkqepvdzrr.supabase.co";
    const SUPABASE_ANON_KEY = "sb_publishable_XrZUsf09b6gBsDzSDAZ_fw_uJVqv-9E";

    // 클라이언트 생성
    window.supabaseClient = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY
    );

    console.log("[supabase.js] Supabase 클라이언트 생성됨:", window.supabaseClient);

})();