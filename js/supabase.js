// supabase.js (Cloudflare-safe version)

// Supabase 로드될 때까지 대기 (중요)
function waitForSupabase() {
    return new Promise(resolve => {
        const timer = setInterval(() => {
            if (window.supabase && window.supabase.createClient) {
                clearInterval(timer);
                resolve();
            }
        }, 20);
    });
}

(async () => {
    await waitForSupabase();

    const SUPABASE_URL = "https://bidqaapputnhkeqvdzrr.supabase.co";
    const SUPABASE_ANON_KEY = "sb_publishable_XrZu5f09bGbs2SDAZ_fw_uJVAq-9E";

    const { createClient } = window.supabase;

    // 글로벌 Supabase 클라이언트 생성
    window.supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    console.log("Supabase 클라이언트 준비됨:", window.supabaseClient);
})();