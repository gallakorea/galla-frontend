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
       Supabase 기본 설정 (정식 anon key 사용해야만 작동함)
       ============================================================ */
    const SUPABASE_URL = "https://bidqauputnhkqepvdzrr.supabase.co";

    // ★ 반드시 여기에 네가 준 정식 anon key 삽입 (publishable key 아님!)
    const SUPABASE_ANON_KEY =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpZHFhdXB1dG5oa3FlcHZkenJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNzg1NDIsImV4cCI6MjA4MDg1NDU0Mn0.D-UGDPuBaNO8v-ror5-SWgUNLRvkOO-yrf2wDVZtyEM";

    window.supabaseClient = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY
    );

    console.log("[supabase.js] Supabase 클라이언트 생성됨");

    /* ============================================================
       Cloudflare 정보는 프론트에 절대 노출 X!
       Supabase Edge Functions가 대신 처리함
       ============================================================ */

    // 더 이상 Cloudflare Token FRONT에 노출시키지 말 것!
    // write.js는 Supabase Functions로부터 업로드 URL만 받으면 된다.

})();

window.supabaseClient = supabase;