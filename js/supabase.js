/**
 * js/supabase.js
 * Global Supabase client bootstrap (NON-module)
 * IMPORTANT:
 * - Do NOT use import/export
 * - Do NOT use esm.sh (it serves ESM only)
 * - Must work with plain <script> loading
 */

console.log("[supabase.js] bootstrap start");

(function () {
  const SUPABASE_URL = "https://bidqauputnhkqepvdzrr.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpZHFhdXB1dG5oa3FlcHZkenJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNzg1NDIsImV4cCI6MjA4MDg1NDU0Mn0.D-UGDPuBaNO8v-ror5-SWgUNLRvkOO-yrf2wDVZtyEM";

  function createClient() {
    if (!window.supabase) {
      console.error("[supabase.js] Supabase SDK not available on window");
      return;
    }

    if (window.supabaseClient) {
      console.log("[supabase.js] Supabase client already initialized");
      return;
    }

    window.supabaseClient = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY
    );

    console.log("[supabase.js] Supabase client ready");
  }

  // If SDK already loaded
  if (window.supabase) {
    createClient();
    return;
  }

  // Load UMD SDK (NOT esm)
  const script = document.createElement("script");
  script.src = "https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.min.js";
  script.async = true;

  script.onload = () => {
    console.log("[supabase.js] Supabase SDK loaded (UMD)");
    createClient();
  };

  script.onerror = () => {
    console.error("[supabase.js] Failed to load Supabase SDK");
  };

  document.head.appendChild(script);
})();