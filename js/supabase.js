// supabase.js

document.addEventListener("DOMContentLoaded", async () => {
    console.log("[supabase.js] DOM Loaded — 초기화 시작");

    // supabase CDN이 로드될 때까지 기다림
    while (!window.supabase || !window.supabase.createClient) {
        console.log("[supabase.js] Supabase 라이브러리 로딩 대기중...");
        await new Promise(r => setTimeout(r, 30));
    }

    console.log("[supabase.js] Supabase 라이브러리 로드됨");

    // 프로젝트 URL / 키 (네가 제공한 것 그대로)
    const SUPABASE_URL = "https://bidqauputnhkqepvdzrr.supabase.co";
    const SUPABASE_ANON_KEY = "sb_publishable_XrZUsf09b6gBsDzSDAZ_fw_uJVqv-9E";

    // 클라이언트 생성
    window.supabaseClient = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY
    );

    console.log("[supabase.js] Supabase 클라이언트 생성 완료:", window.supabaseClient);
});