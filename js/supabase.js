const SUPABASE_URL = "https://bidqaapputnhkeqvdzrr.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_XrZu5f09bGbs2SDAZ_fw_uJVAq-9E";

const { createClient } = window.supabase;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);