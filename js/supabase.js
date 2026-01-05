// js/supabase.js
// Non-module (global) Supabase client bootstrap
// 반드시 https://esm.sh/@supabase/supabase-js@2 가 이 파일보다 먼저 로드되어야 함

console.log("[supabase.js] 로드됨");

if (!window.supabase) {
  console.error("[supabase.js] Supabase SDK가 로드되지 않았습니다. <script src=\"https://esm.sh/@supabase/supabase-js@2\"></script> 를 먼저 포함하세요.");
} else {
  const SUPABASE_URL = "https://bidqauputnhkqepvdzrr.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpZHFhdXB1dG5oa3FlcHZkenJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNzg1NDIsImV4cCI6MjA4MDg1NDU0Mn0.D-UGDPuBaNO8v-ror5-SWgUNLRvkOO-yrf2wDVZtyEM";

  window.supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );

  console.log("[supabase.js] Supabase 클라이언트 생성 완료", window.supabaseClient);
}