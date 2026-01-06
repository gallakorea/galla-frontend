/****
 * js/supabase.js
 * Supabase UMD bootstrap (NO ESM, NO import/export)
 * This file MUST be loaded via normal <script> tag
 */

(function () {
  if (window.supabaseClient) {
    return;
  }

  const SUPABASE_URL = "https://bidqauputnhkqepvdzrr.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpZHFhdXB1dG5oa3FlcHZkenJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNzg1NDIsImV4cCI6MjA4MDg1NDU0Mn0.D-UGDPuBaNO8v-ror5-SWgUNLRvkOO-yrf2wDVZtyEM";

  function initClient() {
    if (!window.supabase || !window.supabase.createClient) {
      console.error("[supabase] SDK not available on window");
      return;
    }

    window.supabaseClient = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY
    );

    console.log("[supabase] client ready");
  }

  if (window.supabase) {
    initClient();
    return;
  }

  const script = document.createElement("script");
  script.src =
    "https://unpkg.com/@supabase/supabase-js@2.39.3/dist/umd/supabase.min.js";
  script.async = true;

  script.onload = initClient;
  script.onerror = function () {
    console.error("[supabase] failed to load SDK");
  };

  document.head.appendChild(script);
})();