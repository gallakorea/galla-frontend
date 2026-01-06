/****
 * js/supabase.js
 * Supabase bootstrap (UMD-safe, auto-loads SDK if missing)
 */

(function () {
  if (window.supabaseClient) return;

  const SUPABASE_URL = "https://bidqauputnhkqepvdzrr.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpZHFhdXB1dG5oa3FlcHZkenJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNzg1NDIsImV4cCI6MjA4MDg1NDU0Mn0.D-UGDPuBaNO8v-ror5-SWgUNLRvkOO-yrf2wDVZtyEM";

  function loadUmd() {
    return new Promise((resolve, reject) => {
      if (window.supabase && window.supabase.createClient) return resolve();
      const s = document.createElement("script");
      s.src = "https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.min.js";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Failed to load Supabase UMD SDK"));
      document.head.appendChild(s);
    });
  }

  (async () => {
    try {
      if (!window.supabase || !window.supabase.createClient) {
        await loadUmd();
      }
      window.supabaseClient = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY
      );
      console.log("[supabase] client ready");
    } catch (e) {
      console.error("[supabase] bootstrap failed", e);
    }
  })();
})();