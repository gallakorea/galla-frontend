// js/supabase.js
console.log("[supabase.js] 로드됨 - 초기화 대기");

(async () => {
  while (!window.supabase || !window.supabase.createClient) {
    console.log("[supabase.js] Supabase 라이브러리 대기중...");
    await new Promise(r => setTimeout(r, 40));
  }

  console.log("[supabase.js] Supabase 라이브러리 로드 완료");

  const SUPABASE_URL = "https://bidqauputnhkqepvdzrr.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpZHFhdXB1dG5oa3FlcHZkenJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNzg1NDIsImV4cCI6MjA4MDg1NDU0Mn0.D-UGDPuBaNO8v-ror5-SWgUNLRvkOO-yrf2wDVZtyEM";

  window.supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );

  console.log("[supabase.js] Supabase 클라이언트 생성 완료");
})();