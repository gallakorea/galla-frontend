// supabase.js

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

    const SUPABASE_URL = "https://bidqauputnhkqepvdzrr.supabase.co";  // ← 오타 수정됨
    const SUPABASE_ANON_KEY = "sb_publishable_XrZu5f09bGbs2SDAZ_fw_uJVAq-9E";

    const { createClient } = window.supabase;

    window.supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    console.log("Supabase 클라이언트 준비됨:", window.supabaseClient);
})();