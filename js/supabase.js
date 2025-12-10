// supabase.js

const SUPABASE_URL = "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY = "sb_publishable_ACJWlzQHLZjBrEguhv0fxq_3BJgxAaH";

// Supabase 클라이언트 생성 (v2)
export const supabase = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);