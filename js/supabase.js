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
  /* 닉네임 스타일 CSS 자체 주입 — galla-ui.css를 안 싣는 페이지(설정·홈 등)에서
     클래스만 붙고 스타일이 없어 '장착해도 변화 없음'이 됐다(사장님 재현).
     도색기와 CSS는 한 몸이어야 한다: 여기서 함께 주입해 전 페이지 자립. */
  (function injectNickCss() {
    if (document.getElementById("nick-style-css")) return;
    const st = document.createElement("style");
    st.id = "nick-style-css";
    st.textContent = `
.nick-gold{background:linear-gradient(92deg,#f7d774 0%,#fff2b8 20%,#e8a93a 45%,#ffe89a 65%,#d98f24 100%);background-size:220% 100%;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;font-weight:900!important;text-shadow:0 0 10px rgba(201,209,224,.35);animation:nickGoldShine 3.4s linear infinite}
.nick-gold::after{content:" 👑";-webkit-text-fill-color:initial;color:#c9d1e0;font-size:.82em;text-shadow:none}
@keyframes nickGoldShine{0%{background-position:0% 0}100%{background-position:220% 0}}
.nick-title{display:inline-block;font-size:.72em;font-weight:900;vertical-align:middle;color:#c9d1e0;background:rgba(201,209,224,.14);border:1px solid rgba(201,209,224,.35);border-radius:99px;padding:1px 7px;margin-right:5px;line-height:1.5;white-space:nowrap}
.ns-neon,.ns-ice,.ns-fire,.ns-toxic,.ns-royal,.ns-rainbow{-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;font-weight:900!important;background-size:200% 100%}
.ns-neon{background-image:linear-gradient(92deg,#00e5ff,#3d6bff,#00e5ff);text-shadow:0 0 10px rgba(0,229,255,.5);animation:nsShine 3s linear infinite}
.ns-ice{background-image:linear-gradient(92deg,#bfefff,#7fd4ff,#e8f8ff,#9fd8ff);text-shadow:0 0 8px rgba(150,220,255,.45);animation:nsShine 4s linear infinite}
.ns-fire{background-image:linear-gradient(92deg,#ffd24a,#ff6a00,#ff2d2d,#ff9a3d);text-shadow:0 0 10px rgba(255,90,0,.5);animation:nsShine 2.2s linear infinite}
.ns-toxic{background-image:linear-gradient(92deg,#b6ff2e,#39d17a,#c9ff4a);text-shadow:0 0 9px rgba(120,230,80,.5);animation:nsShine 3s linear infinite}
.ns-royal{background-image:linear-gradient(92deg,#c9a3ff,#7b5cff,#a17bff,#e0c9ff);text-shadow:0 0 10px rgba(150,110,255,.5);animation:nsShine 3.4s linear infinite}
.ns-rainbow{background-image:linear-gradient(92deg,#ff4f6e,#ffcf6b,#4fd17a,#4fc3f7,#a17bff,#ff4f6e);background-size:300% 100%;animation:nsShine 2.4s linear infinite}
@keyframes nsShine{0%{background-position:0% 0}100%{background-position:200% 0}}
@media (prefers-reduced-motion:reduce){.nick-gold,.ns-neon,.ns-ice,.ns-fire,.ns-toxic,.ns-royal,.ns-rainbow{animation:none}}`;
    (document.head || document.documentElement).appendChild(st);
  })();

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
        // 장착 칭호 배지 — 폐지(2026-07-20 사장님: 장착식 칭호는 등급과 어긋나 혼란만).
        //   등급 표시는 등급 화면·레벨 칩이 담당한다.
        if (false && d.title && el.parentNode && !(el.previousElementSibling && el.previousElementSibling.classList.contains("nick-title"))) {
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
  /* 장착 변경(꾸미기) 즉시 반영 — data-gold-done 마크 때문에 한 번 칠한
     요소는 다시 안 칠하므로, 마크·클래스·칭호 배지를 걷어내고 새로 칠한다.
     ('장착했는데 변화가 없다'의 원흉) */
  window.GALLA_repaintDecos = function () {
    document.querySelectorAll("[data-gold-done]").forEach(el => {
      el.removeAttribute("data-gold-done");
      el.classList.remove("nick-gold");
      [...el.classList].filter(c => c.startsWith("ns-")).forEach(c => el.classList.remove(c));
      const t = el.previousElementSibling;
      if (t && t.classList.contains("nick-title")) t.remove();
    });
    window.GALLA_refreshNickGold();
  };
  document.addEventListener("galla:items-changed", () => window.GALLA_repaintDecos());

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

  // 작성자(아바타/이름) 클릭 — 유저 팝오버(user-sheet.js)가 있으면 그 옆에 팝오버,
  // 없는 페이지에선 기존처럼 마이페이지로 이동. 전역 캡처 위임.
  if (!window.__GALLA_PROFILE_NAV__) {
    window.__GALLA_PROFILE_NAV__ = true;
    document.addEventListener("click", function (e) {
      const el = e.target.closest("[data-profile-uid]");
      if (!el) return;
      const uid = el.getAttribute("data-profile-uid");
      if (!uid) return;
      e.preventDefault();
      e.stopPropagation();
      if (window.GALLA_openUserSheet) {
        const nick = el.getAttribute("data-user-nick") || (el.textContent || "").trim().slice(0, 20);
        window.GALLA_openUserSheet(uid, nick, el);
      } else {
        location.href = "mypage.html?user=" + encodeURIComponent(uid);
      }
    }, true);
  }

  // 로그인 여부 확인 + 미로그인 시 모달 (행동 동작 게이트 공용)
  window.GALLA_isLoggedIn = async function () {
    try { const { data } = await window.supabaseClient.auth.getSession(); return !!(data && data.session); }
    catch (e) { return false; }
  };
  window.GALLA_requireLogin = async function (msg) {
    if (await window.GALLA_isLoggedIn()) return true;
    if (window.GALLA_needLogin) window.GALLA_needLogin(msg || "로그인이 필요해요.");
    else alert("로그인이 필요합니다.");
    return false;
  };

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
        "./vendor/supabase.js",   // 로컬 우선 (Cloudflare Pages CDN + 브라우저 캐시 공유, 외부 CDN 왕복 제거)
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
        SUPABASE_ANON_KEY,
        {
          auth: {
            // 인스타식 지속 로그인: 로그아웃 전까지 세션 유지 + 토큰 자동 갱신
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storage: window.localStorage,
            // 전 페이지(광장 자체 클라이언트 포함) 세션 공유용 고정 키
            storageKey: "sb-bidqauputnhkqepvdzrr-auth-token",
          },
        }
      );
      console.log("[supabase] client ready");
      // 🎁 친구 초대(추천인) — ?ref=코드 캡처 → 첫 로그인 세션에서 1회 적용(+GP 양쪽 보상)
      try {
        const rp = new URLSearchParams(location.search).get("ref");
        if (rp && /^[A-Z0-9]{4,12}$/i.test(rp) && !localStorage.getItem("galla_ref_done")) {
          localStorage.setItem("galla_ref", rp.toUpperCase());
        }
      } catch (e) {}
      // 📊 활동 계측 핑 — 세션·시간당 1회(로그인 유저). DAU/MAU/실시간용
      try {
        const hk = "galla_ping_" + new Date().toISOString().slice(0, 13); // 시간 단위 키
        if (!localStorage.getItem(hk)) {
          const { data: s } = await window.supabaseClient.auth.getSession();
          if (s?.session) { window.supabaseClient.rpc("activity_ping"); localStorage.setItem(hk, "1"); }
        }
      } catch (e) {}
      // 🎁 추천 적용 — 로그인 세션이 있고 보관된 코드가 있으면 1회 시도
      try {
        const code = localStorage.getItem("galla_ref");
        if (code && !localStorage.getItem("galla_ref_done")) {
          const { data: s } = await window.supabaseClient.auth.getSession();
          if (s?.session) {
            const { data: r } = await window.supabaseClient.rpc("apply_referral", { p_code: code });
            // 성공/이미적용/무효코드/기존유저 — 어느 쪽이든 재시도 불필요한 종결 상태
            if (r && (r.ok || ["already", "bad_code", "not_new", "self"].includes(r.reason))) {
              localStorage.setItem("galla_ref_done", "1");
              localStorage.removeItem("galla_ref");
              if (r.ok) { try { alert("🎁 친구 초대 보너스 +" + (r.invitee_gp || 500) + " GP를 받았어요!"); } catch (e) {} }
            }
          }
        }
      } catch (e) {}

      // 🟢 실시간 presence 하트비트 — 회원/비회원(anon) 모두. 화면 표시 중 45초마다.
      try {
        let sid = localStorage.getItem("galla_sid");
        if (!sid) { sid = "s_" + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem("galla_sid", sid); }
        let tz = null; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) {}
        const beat = () => {
          if (document.hidden) return;
          try { window.supabaseClient.rpc("presence_ping", { p_session: sid, p_tz: tz }); } catch (e) {}
        };
        beat();
        setInterval(beat, 45000);
        document.addEventListener("visibilitychange", () => { if (!document.hidden) beat(); });
      } catch (e) {}
    } catch (e) {
      console.error("[supabase] bootstrap failed", e);
    }
  })();
})();