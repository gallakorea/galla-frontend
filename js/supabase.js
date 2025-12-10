// supabase.js — UMD 버전

const SUPABASE_URL = "https://bidqaapputnhkeqvdzrr.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_XXXX";

// Supabase UMD 글로벌에서 createClient 가져오기
const { createClient } = window.supabase;

// 전역에 등록
window.supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);