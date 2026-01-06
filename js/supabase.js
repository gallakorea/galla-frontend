/****
 * js/supabase.js
 * Supabase UMD bootstrap (NO ESM, NO import/export)
 * Assumes Supabase UMD SDK is already loaded via <script>
 */

(function () {
  if (window.supabaseClient) {
    return;
  }

  const SUPABASE_URL = "https://bidqauputnhkqepvdzrr.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpZHFhdXB1dG5oa3FlcHZkenJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNzg1NDIsImV4cCI6MjA4MDg1NDU0Mn0.D-UGDPuBaNO8v-ror5-SWgUNLRvkOO-yrf2wDVZtyEM";

  if (!window.supabase || !window.supabase.createClient) {
    console.error(
      "[supabase] UMD SDK not found. Ensure this script is loaded BEFORE supabase.js:\n" +
      "https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.min.js"
    );
    return;
  }

  window.supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );

  console.log("[supabase] client ready");
})();