// supabase.js
// ----------------------------------------------------
// Supabase 클라이언트 설정 (v2)
// Settings > API > Public API Keys > Publishable key 사용
// ----------------------------------------------------

// 실제 전체 Publishable Key 붙여넣기
const SUPABASE_URL = "https://bidqaapputnhkeqvdzrr.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_XrZu5f09bGbs2SDAZ_fw_uJVAq-9E"; 
// 위 값은 네 화면 캡처에 있던 실제 key로 예시. 반드시 **전체 그대로 붙여넣기**!

// v2에서는 createClient 글로벌 함수가 자동으로 window로 노출됨
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);