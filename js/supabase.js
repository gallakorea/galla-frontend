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

  // ───────────────────────────────────────────────
  // 코스메틱: 닉네임 골드(🎨 nick_deco) 전역 자동 렌더
  // 렌더 지점을 건드리지 않고, 닉네임 요소([data-profile-uid]/[data-user-id])에
  // 골드 클래스를 자동 부여한다. user_cosmetics(공개 조회)로 보유 여부 판별.
  // ───────────────────────────────────────────────
  window.GALLA_decoCache = window.GALLA_decoCache || {}; // uid -> {nick_gold, emoticon}
  window.GALLA_loadDecos = async function (uids) {
    const cache = window.GALLA_decoCache;
    const need = [...new Set(uids)].filter(u => u && !(u in cache));
    if (!need.length || !window.supabaseClient) return;
    need.forEach(u => { cache[u] = cache[u] || null; }); // 로딩 마킹(중복요청 방지)
    try {
      const { data } = await window.supabaseClient
        .from("user_cosmetics").select("user_id,nick_gold,emoticon,title,nick_style").in("user_id", need);
      (data || []).forEach(r => { cache[r.user_id] = { nick_gold: r.nick_gold, emoticon: r.emoticon, title: r.title, nick_style: r.nick_style }; });
    } catch (e) { /* 무해 */ }
    need.forEach(u => { if (!cache[u]) cache[u] = {}; });
  };
  window.GALLA_isGoldNick = uid => !!(window.GALLA_decoCache[uid] && window.GALLA_decoCache[uid].nick_gold);

  const NICK_SEL = ".author-name[data-profile-uid], .user-name[data-user-id], [data-nick-uid]";
  let _ngPending = false;
  async function _applyNickGold() {
    _ngPending = false;
    const els = [...document.querySelectorAll(NICK_SEL)].filter(el => !el.hasAttribute("data-gold-done"));
    if (!els.length) return;
    const map = new Map();
    els.forEach(el => {
      el.setAttribute("data-gold-done", "1");
      const uid = el.getAttribute("data-profile-uid") || el.getAttribute("data-user-id") || el.getAttribute("data-nick-uid");
      if (!uid) return;
      if (!map.has(uid)) map.set(uid, []);
      map.get(uid).push(el);
    });
    if (!map.size) return;
    await window.GALLA_loadDecos([...map.keys()]);
    map.forEach((list, uid) => {
      const d = window.GALLA_decoCache[uid] || {};
      list.forEach(el => {
        // 장착 닉네임 스타일(없으면 골드 폴백)
        const style = d.nick_style || (d.nick_gold ? "gold" : null);
        if (style) el.classList.add("ns-" + style);
        if (style === "gold") el.classList.add("nick-gold");
        // 장착 칭호 배지 — 닉네임 앞에 1회 삽입
        if (d.title && el.parentNode && !(el.previousElementSibling && el.previousElementSibling.classList.contains("nick-title"))) {
          const b = document.createElement("span");
          b.className = "nick-title";
          // "🌱 눈팅 뉴비" → 아이콘/이름 분리 (작성자 헤더에선 아이콘만 노출)
          const t = String(d.title).trim();
          const sp = t.indexOf(" ");
          const ico = sp > 0 ? t.slice(0, sp) : t;
          const nm = sp > 0 ? t.slice(sp + 1) : "";
          b.innerHTML = `<span class="nt-ico">${ico}</span>` + (nm ? `<span class="nt-name">${nm}</span>` : "");
          el.parentNode.insertBefore(b, el);
        }
      });
    });
  }
  window.GALLA_titleOf = (uid) => (window.GALLA_decoCache[uid] || {}).title || null;
  window.GALLA_refreshNickGold = function () {
    if (_ngPending) return;
    _ngPending = true;
    requestAnimationFrame(() => { window.supabaseClient ? _applyNickGold() : setTimeout(_applyNickGold, 300); });
  };
  if (!window.__GALLA_NICKGOLD__) {
    window.__GALLA_NICKGOLD__ = true;
    const start = () => {
      window.GALLA_refreshNickGold();
      try {
        const mo = new MutationObserver(() => window.GALLA_refreshNickGold());
        mo.observe(document.body, { childList: true, subtree: true });
      } catch (e) {}
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
  }

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

  // 공용 로그인 유도 모달 (톤앤매너 통일) — 전 페이지 공통
  window.GALLA_needLogin = function (msg) {
    let m = document.getElementById("galla-login-modal");
    if (!m) {
      m = document.createElement("div");
      m.id = "galla-login-modal";
      m.className = "glm-dim";
      m.innerHTML =
        '<div class="glm-card" role="dialog" aria-modal="true">' +
        '<div class="glm-ico">🔒</div>' +
        '<div class="glm-title">로그인이 필요해요</div>' +
        '<div class="glm-msg"></div>' +
        '<div class="glm-btns">' +
        '<button class="glm-cancel" type="button">닫기</button>' +
        '<button class="glm-go" type="button">로그인하기</button>' +
        "</div></div>";
      document.body.appendChild(m);
      m.addEventListener("click", (e) => { if (e.target === m || e.target.classList.contains("glm-cancel")) m.classList.remove("open"); });
      m.querySelector(".glm-go").addEventListener("click", () => { location.href = "login.html"; });
    }
    m.querySelector(".glm-msg").textContent = msg || "이 기능은 로그인 후 이용할 수 있어요.";
    requestAnimationFrame(() => m.classList.add("open"));
  };
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
      // 📊 활동 계측 핑 — 세션·시간당 1회(로그인 유저). DAU/MAU/실시간용
      try {
        const hk = "galla_ping_" + new Date().toISOString().slice(0, 13); // 시간 단위 키
        if (!localStorage.getItem(hk)) {
          const { data: s } = await window.supabaseClient.auth.getSession();
          if (s?.session) { window.supabaseClient.rpc("activity_ping"); localStorage.setItem(hk, "1"); }
        }
      } catch (e) {}
    } catch (e) {
      console.error("[supabase] bootstrap failed", e);
    }
  })();
})();