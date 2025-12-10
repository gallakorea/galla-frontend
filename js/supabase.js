// supabase.js
// ----------------------------------------------------
// Supabase 클라이언트 설정 (v2)
// 절대 로컬 URL(127.0.0.1:54321) 사용 금지!
// Settings > Data API > Project URL + Publishable Key 사용
// ----------------------------------------------------

const SUPABASE_URL = "https://bidqaapputnhkeqvdzrr.supabase.co";  
const SUPABASE_ANON_KEY = "sb_publishable_XrZu5f09b..."; // 네 Publishable key 전체 붙여넣기!

// Supabase 클라이언트 생성 (브라우저 환경)
export const supabase = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);