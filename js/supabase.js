/**
 * js/supabase.js
 * Supabase bootstrap (UMD only, resilient)
 */
(function () {
  if (!window.waitForSupabaseClient) {
    window.waitForSupabaseClient = function () {
      return new Promise(resolve => {
        const timer = setInterval(() => {
          if (window.supabaseClient) {
            clearInterval(timer);
            resolve(window.supabaseClient);
          }
        }, 20);
      });
    };
  }

  if (window.supabaseClient) return;

  const SUPABASE_URL = "https://bidqauputnhkqepvdzrr.supabase.co";

  // 아바타(프로필 사진) URL 해석: avatar_url은 'userid/avatar.jpg' 상대경로.
  // 없으면 기본 갈라 원형 아이콘. 전역 공용.
  window.GALLA_DEFAULT_AVATAR = "/assets/app-icons/profile-circle-128.png";
  window.GALLA_avatarSrc = function (avatarUrl) {
    if (!avatarUrl) return window.GALLA_DEFAULT_AVATAR;
    if (/^https?:\/\//.test(avatarUrl)) return avatarUrl;
    return `${SUPABASE_URL}/storage/v1/object/public/profiles/${avatarUrl}`;
  };
  // onerror 시 기본 아이콘으로 폴백하는 <img> 속성 문자열
  window.GALLA_avatarImg = function (avatarUrl, cls) {
    const src = window.GALLA_avatarSrc(avatarUrl);
    return `<img class="${cls || ''}" src="${src}" alt="프로필" loading="lazy" ` +
           `onerror="this.onerror=null;this.src='${window.GALLA_DEFAULT_AVATAR}'">`;
  };

  // 공유 URL: /share/<type>/<id> (엣지에서 OG 카드 렌더). type: issue|predict|plaza
  window.GALLA_shareUrl = function (type, id) {
    return `${location.origin}/share/${type}/${encodeURIComponent(id)}`;
  };

  // 작성자(아바타/이름) 클릭 → 해당 유저 마이페이지 (인스타식). 전역 캡처 위임.
  if (!window.__GALLA_PROFILE_NAV__) {
    window.__GALLA_PROFILE_NAV__ = true;
    document.addEventListener("click", function (e) {
      const el = e.target.closest("[data-profile-uid]");
      if (!el) return;
      const uid = el.getAttribute("data-profile-uid");
      if (!uid) return;
      e.preventDefault();
      e.stopPropagation();
      location.href = "mypage.html?user=" + encodeURIComponent(uid);
    }, true);
  }
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpZHFhdXB1dG5oa3FlcHZkenJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNzg1NDIsImV4cCI6MjA4MDg1NDU0Mn0.D-UGDPuBaNO8v-ror5-SWgUNLRvkOO-yrf2wDVZtyEM";

  function loadUmd() {
    return new Promise((resolve, reject) => {
      if (window.supabase && window.supabase.createClient) {
        return resolve();
      }

      const urls = [
        "./js/vendor/supabase.js",   // 로컬 우선 (Cloudflare Pages CDN + 브라우저 캐시 공유, 외부 CDN 왕복 제거)
        "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js",
        "https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.min.js"
      ];

      let idx = 0;

      const tryNext = () => {
        if (idx >= urls.length) {
          reject(new Error("All Supabase UMD CDN failed"));
          return;
        }

        const s = document.createElement("script");
        s.src = urls[idx++];
        s.async = true;
        s.onload = () => {
          if (window.supabase?.createClient) resolve();
          else tryNext();
        };
        s.onerror = tryNext;
        document.head.appendChild(s);
      };

      tryNext();
    });
  }

  (async () => {
    try {
      await loadUmd();
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