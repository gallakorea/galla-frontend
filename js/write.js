/**
 * GALLA Supabase Client Initializer
 * - Cloudflare Pages (non-module)
 * - Supabase CDN v2 사용
 * - window.supabaseClient 단일 인스턴스
 */

console.log("[supabase.js] 로드됨 - 초기화 대기");

(function initSupabase() {
  // 중복 초기화 방지
  if (window.supabaseClient) {
    console.warn("[supabase.js] 이미 초기화됨 - 재사용");
    return;
  }

  // Supabase CDN 로드 확인
  if (!window.supabase || !window.supabase.createClient) {
    console.error("[supabase.js] Supabase CDN 로드 실패");
    return;
  }

  // === 프로젝트 고정 값 ===
  const SUPABASE_URL = "https://bidqauputnhkqepvdzrr.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpZHFhdXB1dG5oa3FlcHZkenJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNzg1NDIsImV4cCI6MjA4MDg1NDU0Mn0.D-UGDPuBaNO8v-ror5-SWgUNLRvkOO-yrf2wDVZtyEM";

  try {
    // Supabase Client 생성
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

    console.log("[supabase.js] Supabase 클라이언트 생성 완료");

    // 세션 로그 (디버그용)
    window.supabaseClient.auth.getSession().then(({ data }) => {
      if (data?.session?.user) {
        console.log(
          "[supabase.js] 로그인 유저:",
          data.session.user.id
        );
      } else {
        console.log("[supabase.js] 비로그인 상태");
      }
    });

  } catch (err) {
    console.error("[supabase.js] 초기화 실패:", err);
  }
})();