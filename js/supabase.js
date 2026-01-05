/**
 * js/supabase.js
 * Global Supabase client bootstrap (NON-module)
 * This file MUST NOT use import/export.
 */

console.log("[supabase.js] bootstrap start");

(function initSupabase() {
  const SUPABASE_URL = "https://bidqauputnhkqepvdzrr.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpZHFhdXB1dG5oa3FlcHZkenJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNzg1NDIsImV4cCI6MjA4MDg1NDU0Mn0.D-UGDPuBaNO8v-ror5-SWgUNLRvkOO-yrf2wDVZtyEM";

  function createClient() {
    if (!window.supabase) {
      console.error("[supabase.js] Supabase SDK not found on window");
      return;
    }

    if (window.supabaseClient) {
      console.log("[supabase.js] Supabase client already exists");
      return;
    }

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

    console.log("[supabase.js] Supabase client ready", window.supabaseClient);
  }

  // SDK already loaded
  if (window.supabase) {
    createClient();
    return;
  }

  // Dynamically inject SDK (non-module)
  const script = document.createElement("script");
  script.src = "https://esm.sh/@supabase/supabase-js@2";
  script.async = true;

  script.onload = () => {
    console.log("[supabase.js] Supabase SDK loaded dynamically");
    createClient();
  };

  script.onerror = () => {
    console.error("[supabase.js] Failed to load Supabase SDK");
  };

  document.head.appendChild(script);
})();