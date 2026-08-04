/**
 * js/supabase.js
 * Supabase bootstrap (UMD only, resilient)
 */
(function () {
  /* 🔒 온보딩 강제(백엔드 트리거 hint 'onboard_required')를 프론트가 잡아 모달 자동오픈.
     supabase 클라이언트의 global.fetch로 주입 → 모든 쓰기(딥링크 페이지 포함) 응답을 감시.
     social-auth.js가 없으면(미게이트 페이지) 즉석 로드해 모달을 띄운다. */
  if (!window.__onboardAwareFetch) {
    var _obShown = false;
    function _obVer() {
      try {
        var s = Array.prototype.map.call(document.scripts, function (x) { return x.src; })
          .find(function (x) { return /js\/supabase\.js/.test(x); });
        var m = s && s.match(/v=(\d+)/);
        return m ? ("?v=" + m[1]) : "";
      } catch (e) { return ""; }
    }
    function _obTrigger() {
      if (_obShown || document.getElementById("soc-onboard")) return;
      _obShown = true;
      var open = function () { _obShown = false; if (window.GALLA_openOnboard) window.GALLA_openOnboard(); };
      if (window.GALLA_openOnboard) return open();
      var v = _obVer();
      if (!document.querySelector("link[data-onboard-css]")) {
        var l = document.createElement("link");
        l.rel = "stylesheet"; l.href = "/css/auth.css" + v; l.setAttribute("data-onboard-css", "1");
        document.head.appendChild(l);
      }
      var sc = document.createElement("script");
      sc.src = "/js/social-auth.js" + v;
      sc.onload = function () { _obShown = false; if (window.GALLA_openOnboard) window.GALLA_openOnboard(); };
      sc.onerror = function () { _obShown = false; };
      document.head.appendChild(sc);
    }
    window.__onboardAwareFetch = function (input, init) {
      return fetch(input, init).then(function (res) {
        try {
          if (!res.ok && (res.status === 400 || res.status === 403 || res.status === 500)) {
            res.clone().text().then(function (t) {
              if (t && t.indexOf("onboard_required") >= 0) _obTrigger();
            }).catch(function () {});
          }
        } catch (e) {}
        return res;
      });
    };
  }

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

  /* 🏅 갈라리안 등급표(GI 기반) — grade 페이지/gallian.js와 동일 6단계 + 서브레벨.
     전 페이지 '레벨/등급'의 단일 진실. users.level(죽은 컬럼)은 쓰지 않는다.
     early-return 위에 둬 재주입에도 견고. */
  if (!window.GALLA_gallianTier) {
    const GALLIAN_TIERS = [
      { icon: "🌱", label: "눈팅 뉴비",   min: 0 },
      { icon: "🔥", label: "발끈러",     min: 150 },
      { icon: "⌨️", label: "키보드 전사", min: 500 },
      { icon: "🎤", label: "여론 논객",   min: 1500 },
      { icon: "🌪️", label: "갈라 선동가", min: 4500 },
      { icon: "👑", label: "갈라 대장군", min: 15000 },
    ];
    const SUB = 5, APEX_STEP = 5000;   // gallian.js와 동일 상수
    /* GI → 등급 + 서브레벨(Lv.1~5) + 진행도. gallian.js 공식과 동일. */
    window.GALLA_gallianOfGi = function (gi) {
      gi = Number(gi) || 0;
      let idx = 0;
      for (let i = 0; i < GALLIAN_TIERS.length; i++) if (gi >= GALLIAN_TIERS[i].min) idx = i;
      const t = GALLIAN_TIERS[idx], next = GALLIAN_TIERS[idx + 1] || null;
      const into = gi - t.min;
      let subLevel, floor, ceil;
      if (next) {
        const step = (next.min - t.min) / SUB;
        subLevel = Math.min(SUB, 1 + Math.floor(into / step));
        floor = t.min + (subLevel - 1) * step; ceil = t.min + subLevel * step;
      } else {
        subLevel = 1 + Math.floor(into / APEX_STEP);
        floor = t.min + (subLevel - 1) * APEX_STEP; ceil = t.min + subLevel * APEX_STEP;
      }
      const subProgress = Math.min(100, Math.round((gi - floor) / (ceil - floor) * 100));
      const atTop = next && subLevel >= SUB;
      const goalGi = atTop ? next.min : Math.ceil(ceil);
      return {
        icon: t.icon, label: t.label, min: t.min, index: idx, gi, subLevel, subProgress,
        goalRemaining: Math.max(0, goalGi - gi),
        goalLabel: atTop ? `${next.label} 승급` : `${t.label} Lv.${subLevel + 1}`,
      };
    };
    /* 등급 아이콘·이름만 필요할 때(도색기) — 위 헬퍼의 얇은 래퍼 */
    window.GALLA_gallianTier = function (gi) { return window.GALLA_gallianOfGi(gi); };
  }

  /* ⚠️ 여기서 early-return 하지 않는다 — 그러면 아래 아바타 헬퍼·닉네임
     도색기가 client 선존재 페이지(광장 등 자체 createClient)에서 정의 안 돼
     '꾸미기 미반영'이 된다. client 생성만 아래에서 조건부로. */
  const SUPABASE_URL = "https://bidqauputnhkqepvdzrr.supabase.co";

  // 아바타(프로필 사진) URL 해석: avatar_url은 'userid/avatar.jpg' 상대경로.
  // 없으면 기본 갈라 원형 아이콘. 전역 공용.
  window.GALLA_DEFAULT_AVATAR = "/assets/app-icons/default-avatar.png";
  window.GALLA_avatarSrc = function (avatarUrl, size) {
    if (!avatarUrl) return window.GALLA_DEFAULT_AVATAR;
    if (/^https?:\/\//.test(avatarUrl)) return avatarUrl;
    /* 리사이즈 엔드포인트 경유 — 원본 아바타(≈1MB 실측)를 그대로 받으면
       DM 목록 등에서 기본 이미지 → 사진 교체 깜빡임이 길어진다(사장님 재현).
       96px 표시엔 128px(2x)이면 충분: 981KB→4KB 실측. */
    var w = size || 128;
    return `${SUPABASE_URL}/storage/v1/render/image/public/profiles/${avatarUrl}?width=${w}&height=${w}&resize=cover`;
  };
  // 공용 아바타 세터 — 전 페이지 프로필사진 통일(설정·마이·DM·댓글 동일 소스/기본값).
  // avatar_url이 http(s)면 그대로(구글 등), 상대경로면 리사이즈 경유, 없으면 중립 기본아이콘.
  // bust=true면 캐시버스트(내 프로필 업로드 직후 갱신용).
  window.GALLA_setAvatar = function (el, avatarUrl, size, bust) {
    if (!el) return;
    var src = window.GALLA_avatarSrc(avatarUrl, size);
    if (bust && avatarUrl && !/^data:/.test(avatarUrl)) src += (src.indexOf("?") >= 0 ? "&" : "?") + "t=" + Date.now();
    // 로딩 중엔 '검은 원'만 보이고(전 사진·로고 플래시 방지), 로드되면 부드럽게 페이드인.
    try { el.style.background = "#000"; el.style.transition = "opacity .25s ease"; el.style.opacity = "0"; } catch (_) {}
    var show = function () { try { el.style.opacity = "1"; } catch (_) {} };
    el.onload = show;
    el.onerror = function () { this.onerror = null; this.src = window.GALLA_DEFAULT_AVATAR; };
    el.src = src;
    if (el.complete && el.naturalWidth) show();   // 캐시로 이미 완료된 경우
    setTimeout(show, 500);                          // 안전망(onload 유실 대비 — 절대 안 보이는 일 없게)
  };

  // onerror 시 기본 아이콘으로 폴백하는 <img> 속성 문자열
  window.GALLA_avatarImg = function (avatarUrl, cls) {
    const src = window.GALLA_avatarSrc(avatarUrl);
    return `<img class="${cls || ''}" src="${src}" alt="프로필" loading="lazy" ` +
           `onerror="this.onerror=null;this.src='${window.GALLA_DEFAULT_AVATAR}'">`;
  };

  // 전역 토스트 — 수정/삭제 등 완료 알림(전 페이지 공용). 하단 중앙, 셸 네비 위.
  window.GALLA_toast = function (msg, ms) {
    if (!document.getElementById("galla-toast-css")) {
      const st = document.createElement("style"); st.id = "galla-toast-css";
      st.textContent = ".galla-toast{position:fixed;left:50%;top:44%;" +
        "transform:translate(-50%,-50%) scale(.92);z-index:2147483000;background:rgba(24,26,34,.98);color:#fff;" +
        "font-size:15.5px;font-weight:800;padding:16px 26px;border-radius:16px;border:1px solid rgba(255,255,255,.14);" +
        "box-shadow:0 20px 50px rgba(0,0,0,.6);opacity:0;transition:opacity .2s,transform .2s;pointer-events:none;max-width:82vw;text-align:center}" +
        ".galla-toast.on{opacity:1;transform:translate(-50%,-50%) scale(1)}";
      (document.head || document.documentElement).appendChild(st);
    }
    const t = document.createElement("div"); t.className = "galla-toast"; t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add("on"));
    setTimeout(() => { t.classList.remove("on"); setTimeout(() => t.remove(), 260); }, ms || 1900);
  };

  // 공유 URL: /share/<type>/<id> (엣지에서 OG 카드 렌더). type: issue|predict|plaza|post|video|news
  window.GALLA_shareUrl = function (type, id) {
    return `${location.origin}/share/${type}/${encodeURIComponent(id)}`;
  };
  // 댓글·대댓글 인용 카드. scope: issue|news|market|plaza|post|video
  window.GALLA_shareCommentUrl = function (scope, id) {
    return `${location.origin}/share/comment/${encodeURIComponent(scope)}/${encodeURIComponent(id)}`;
  };
  // 실시간 트렌드 순위 랜딩
  window.GALLA_shareTrendUrl = function () { return `${location.origin}/share/trend`; };
  // 육성 난장 입장 초대(방 딥링크)
  window.GALLA_shareRoomUrl = function (id) { return `${location.origin}/share/room/${encodeURIComponent(id)}`; };
  // 말 걸기(오픈프로필) — 1:1 DM 초대
  window.GALLA_shareUserUrl = function (id) { return `${location.origin}/share/u/${encodeURIComponent(id)}`; };

  /* ═══ 📳 전역 햅틱 — 네이티브(iOS) Capacitor Haptics 우선, 없으면 웹 vibrate(안드로이드).
     kind: light | medium | heavy | rigid | soft | success | warning | error | selection ═══ */
  // 네이티브 Haptics 플러그인 프록시 — 원격 페이지에선 Plugins.Haptics가 비어 있어
  // registerPlugin('Haptics')로 직접 받아야 한다(이게 '진동 안 옴'의 원인이었음).
  function _hapPlugin() {
    if (window.__gallaHap !== undefined) return window.__gallaHap;
    // ⚠️ 햅틱 코드는 iframe(dm/vote 등) 안에서 도는데 Capacitor 브릿지는 top 문서(app-shell)에만
    //    주입된다 → iframe의 window.Capacitor는 undefined. same-origin이라 window.top.Capacitor로 접근.
    var Cap = window.Capacitor;
    try { if ((!Cap || !Cap.registerPlugin) && window.top && window.top !== window && window.top.Capacitor) Cap = window.top.Capacitor; } catch (_) {}
    try { if ((!Cap || !Cap.registerPlugin) && window.parent && window.parent !== window && window.parent.Capacitor) Cap = window.parent.Capacitor; } catch (_) {}
    // ⚠️ 네이티브 앱(iOS/Android)에서만 플러그인을 쓴다. 웹/PWA에선 registerPlugin이 만든
    //    프록시를 호출하면 "not implemented" Promise가 reject → unhandledrejection으로 에러가
    //    떴다(사장님: 웹·안드로이드 햅틱 오류). 웹은 navigator.vibrate로만 처리한다.
    var isNative = false;
    try { isNative = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform()); } catch (_) {}
    if (!isNative) { window.__gallaHap = null; return null; }
    var H = null;
    try { H = (Cap && Cap.Plugins && Cap.Plugins.Haptics) || (Cap && Cap.registerPlugin && Cap.registerPlugin("Haptics")) || null; } catch (_) { H = null; }
    window.__gallaHap = H;
    return H;
  }
  // Haptics 메서드는 Promise 반환 → reject가 unhandledrejection이 되지 않게 삼킨다.
  function _hapCall(fn) { try { var r = fn(); if (r && typeof r.catch === "function") r.catch(function () {}); } catch (_) {} }
  window.GALLA_haptic = function (kind) {
    kind = kind || "light";
    try {
      var H = _hapPlugin();
      if (H) {
        if (kind === "success" || kind === "warning" || kind === "error") {
          if (H.notification) { _hapCall(function () { return H.notification({ type: kind.toUpperCase() }); }); return true; }
        }
        if (kind === "selection") { if (H.selectionChanged) { _hapCall(function () { return H.selectionChanged(); }); return true; } }
        if (H.impact) {
          // 🔥 격렬한 진동 — 진영/예측 선택: HEAVY 3연타 + notification 펀치로 '쾅쾅쾅!'
          if (kind === "vote" || kind === "strong") {
            _hapCall(function () { return H.impact({ style: "HEAVY" }); });
            setTimeout(function () { _hapCall(function () { return H.impact({ style: "HEAVY" }); }); }, 55);
            setTimeout(function () { _hapCall(function () { return H.impact({ style: "HEAVY" }); }); }, 120);
            setTimeout(function () { _hapCall(function () { return H.notification ? H.notification({ type: "SUCCESS" }) : H.impact({ style: "RIGID" }); }); }, 205);
            return true;
          }
          var style = kind === "heavy" ? "HEAVY" : (kind === "light" || kind === "soft") ? "LIGHT" : "MEDIUM";
          _hapCall(function () { return H.impact({ style: style }); });
          if (kind === "heavy") setTimeout(function () { _hapCall(function () { return H.impact({ style: "HEAVY" }); }); }, 55); // 더블탭
          return true;
        }
      }
    } catch (_) {}
    try {
      if (navigator.vibrate) {
        var p = (kind === "vote" || kind === "strong") ? [50, 25, 50, 25, 80]
          : kind === "heavy" ? [35, 30, 45] : kind === "success" ? [12, 40, 12] : kind === "error" ? [30, 40, 30]
          : (kind === "light" || kind === "selection" || kind === "soft") ? 9 : 18;
        navigator.vibrate(p); return true;
      }
    } catch (_) {}
    return false;
  };

  /* 전역 델리게이트 — 버튼/링크/[data-haptic]을 누르면 자동 햅틱(누른 순간, pointerdown).
     data-haptic="heavy|success|..."로 강도 지정, 없으면 light. (스크롤은 버튼이 아니라 미발동) */
  if (!window.__gallaHapticBound) {
    window.__gallaHapticBound = true;
    document.addEventListener("pointerdown", function (e) {
      var el = e.target && e.target.closest && e.target.closest("[data-haptic], button:not([disabled]), [role=\"button\"], .nav-item, .hdr-btn");
      if (!el) return;
      window.GALLA_haptic(el.getAttribute("data-haptic") || "light");
    }, { passive: true, capture: true });
  }

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
.nick-tier{display:inline-block;font-size:.9em;margin-right:4px;vertical-align:baseline;-webkit-text-fill-color:initial!important;color:initial!important;background:none!important;-webkit-background-clip:initial!important;background-clip:initial!important;animation:none!important;text-shadow:none!important;filter:saturate(1.1)}
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

  /* 🖼 전역 이미지 폴백 — 깨진 이미지의 '물음표'가 사용자에게 절대 보이지 않게.
     개별 렌더의 onerror 누락과 무관하게 캡처 단계에서 일괄 방어.
     자체 onerror를 가진 이미지(아바타 등 맞춤 폴백)는 존중하고 건드리지 않는다. */
  if (!window.__GALLA_IMG_FBK__) {
    window.__GALLA_IMG_FBK__ = true;
    document.addEventListener("error", (e) => {
      const el = e.target;
      if (!(el instanceof HTMLImageElement)) return;
      if (el.getAttribute("onerror")) return;      // 맞춤 폴백 보유 — 존중
      if (el.dataset.fbk) return;                  // 폴백도 실패 — 루프 방지
      el.dataset.fbk = "1";
      el.src = "/assets/logo.png";
      el.style.objectFit = "contain";
      el.style.background = "#101116";
      el.style.padding = "16%";
      el.style.opacity = ".45";
    }, true);
  }

  /* 📱 갈라 앱(네이티브 셸) 감지 — Capacitor 브리지 또는 UA 마커(GallaApp).
     통화 등 앱 전용 기능의 게이트 판별에 사용. */
  /* 🖼 썸네일 리사이즈 — Cloudflare 이미지 변환(존 활성화 완료, 2026-07-22).
     원본 PNG(1~2MB)가 그대로 내려와 그리드가 '한참' 걸리던 문제의 근본 해법.
     cdn.galla.im 원본 → /cdn-cgi/image/ 경유(실측 1.35MB→64KB, 캐시 후 0.2s).
     스트림 영상 썸네일은 자체 리사이즈 파라미터 사용. 그 외 URL은 원본 유지. */
  window.GALLA_thumb = function (url, w) {
    try {
      if (!url || typeof url !== "string") return url;
      if (url.indexOf("/cdn-cgi/image/") !== -1) return url;      // 이미 변환됨
      if (/cloudflarestream\.com\/.+\/thumbnails\//.test(url))
        return url + (url.indexOf("?") === -1 ? "?" : "&") + "width=" + (w || 480) + "&fit=crop";
      var m = url.match(/^https:\/\/cdn\.galla\.im\/(.+)$/);
      if (m) return "https://cdn.galla.im/cdn-cgi/image/width=" + (w || 480) + ",quality=78,format=auto/" + m[1];
    } catch (_) {}
    return url;
  };

  /* 🎠 이슈 미디어 정규화 — 혼합 캐러셀(사진+영상)의 단일 진실.
     새 스키마(row.media[])가 있으면 그대로, 없으면 레거시(images[] + video_url)를 순서 있는
     항목으로 승격. 반환: [{ type:'image'|'video', url, thumb? }]. 모든 렌더러가 이걸 쓴다. */
  window.GALLA_issueMedia = function (row) {
    try {
      if (!row) return [];
      if (Array.isArray(row.media) && row.media.length) {
        return row.media
          .filter(function (m) { return m && m.url; })
          .map(function (m) { return { type: m.type === "video" ? "video" : "image", url: m.url, thumb: m.thumb || null }; });
      }
      var out = [];
      var imgs = row.images;
      if (typeof imgs === "string") { try { imgs = JSON.parse(imgs); } catch (_) { imgs = null; } }
      var vthumb = row.thumbnail_url || row.card_thumb_url || null;
      // ⚠️ '영상+썸네일'을 캐러셀로 오인 방지 — 영상이 있으면 그 영상의 썸네일(포스터)이
      //    images[]에 섞여 들어온 경우가 있다(레거시/자동생성). 그건 별도 슬라이드가 아니라
      //    영상의 표지이므로 이미지 항목에서 제외 → 단일 영상으로 렌더된다.
      if (Array.isArray(imgs)) imgs.forEach(function (u) {
        if (!u) return;
        if (row.video_url && vthumb && u === vthumb) return;   // 영상 표지 → 슬라이드 아님
        out.push({ type: "image", url: u, thumb: null });
      });
      if (row.video_url) out.push({ type: "video", url: row.video_url, thumb: vthumb });
      if (!out.length && vthumb) out.push({ type: "image", url: vthumb, thumb: null });
      return out;
    } catch (_) { return []; }
  };

  window.GALLA_isApp = function () {
    try {
      if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) return true;
    } catch (_) {}
    return /GallaApp/i.test(navigator.userAgent || "");
  };

  window.GALLA_decoCache = window.GALLA_decoCache || {}; // uid -> {nick_gold, emoticon}
  window.GALLA_loadDecos = async function (uids) {
    const cache = window.GALLA_decoCache;
    const need = [...new Set(uids)].filter(u => u && !(u in cache));
    if (!need.length || !window.supabaseClient) return;
    need.forEach(u => { cache[u] = cache[u] || null; }); // 로딩 마킹(중복요청 방지)
    try {
      // 등급 아이콘은 갈라리안 등급표(GI 기반)와 일치시킨다 — level이 아니라 GI.
      // gi_of_users 배치 RPC로 need 전체의 갈라 지수를 한 번에 받는다.
      const [{ data }, giRes] = await Promise.all([
        window.supabaseClient.from("user_cosmetics").select("user_id,nick_gold,emoticon,title,nick_style").in("user_id", need),
        window.supabaseClient.rpc("gi_of_users", { p_uids: need }),
      ]);
      (data || []).forEach(r => { cache[r.user_id] = { nick_gold: r.nick_gold, emoticon: r.emoticon, title: r.title, nick_style: r.nick_style }; });
      const giMap = giRes && giRes.data ? giRes.data : {};
      need.forEach(u => { cache[u] = Object.assign(cache[u] || {}, { gi: Number(giMap[u]) || 0 }); });
    } catch (e) { /* 무해 */ }
    need.forEach(u => { if (!cache[u]) cache[u] = {}; });
  };
  window.GALLA_isGoldNick = uid => !!(window.GALLA_decoCache[uid] && window.GALLA_decoCache[uid].nick_gold);

  /* 도색 대상 셀렉터 — data-nick-uid가 범용 마커. 레거시로 이름 클래스가
     data-user-id/profile-uid만 가진 경우도 포함(아바타·버튼 오적용 방지 위해
     '이름' 클래스만 열거). 새 렌더 지점은 data-nick-uid만 붙이면 된다. */
  const NICK_SEL = [
    "[data-nick-uid]",
    ".author-name[data-profile-uid]",
    ".user-name[data-user-id]",
    ".pza-name[data-user-id]", ".pmd-holder-name[data-user-id]",
    ".lb-name[data-user-id]", ".pf-cname[data-user-id]",
    ".user-row-name[data-user-id]", ".dm-thread-name[data-user-id]",
  ].join(", ");
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
        // 장착 닉네임 스타일 — 'none'은 명시적 기본(골드 폴백 금지),
        // null(미설정)일 때만 골드 구매자 폴백
        const style = d.nick_style === "none" ? null : (d.nick_style || (d.nick_gold ? "gold" : null));
        if (style) el.classList.add("ns-" + style);
        if (style === "gold") el.classList.add("nick-gold");
        // 🏅 등급 아이콘 — 갈라리안 등급표(GI)와 일치. 선택 불가·자동 부여.
        // 이름 '안쪽' 첫 요소로 넣는다(형제로 넣으면 세로 레이아웃 카드에서
        // 아이콘이 이름 위 별도 줄로 떠버린다 — 사장님 재현). CSS가 그라디언트
        // 클립을 리셋해 아이콘은 그대로 보인다.
        if (!(el.firstElementChild && el.firstElementChild.classList.contains("nick-tier"))) {
          const t = window.GALLA_gallianTier(d.gi || 0);
          const tb = document.createElement("span");
          tb.className = "nick-tier";
          tb.title = t.label + " · " + (d.gi || 0).toLocaleString() + " GI";
          tb.textContent = t.icon;
          el.insertBefore(tb, el.firstChild);
        }
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
      // 등급 아이콘은 이름 '안쪽' 첫 자식 — 여기서 제거
      const ch = el.firstElementChild;
      if (ch && ch.classList.contains("nick-tier")) ch.remove();
      // 레거시(이전 형제로 넣던 버전) 잔재도 청소
      const t = el.previousElementSibling;
      if (t && (t.classList.contains("nick-title") || t.classList.contains("nick-tier"))) t.remove();
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
      } else if (window.GALLA_gotoProfile) {
        window.GALLA_gotoProfile(uid);   // SPA면 스택 push, MPA면 mypage.html?user= 이동
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
      m.querySelector(".glm-go").addEventListener("click", () => { (window.GALLA_nav||function(u){location.href=u})("login.html"); });
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
    if (window.supabaseClient) return;   // 다른 스크립트가 이미 만들었으면 재생성 금지
    try {
      await loadUmd();
      window.supabaseClient = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY,
        {
          global: { fetch: window.__onboardAwareFetch || fetch },
          auth: {
            // 🔑 네이티브 패스키(WebAuthn) — Supabase Auth 정식(베타) 기능 opt-in.
            // registerPasskey()/signInWithPasskey() 사용. 대시보드에서 passkey_enabled + RP 설정 필요.
            experimental: { passkey: true },
            // PKCE 플로우 — 네이티브 앱 구글 로그인(딥링크 ?code=…) + exchangeCodeForSession 위해 필수.
            // 기본값 implicit이면 code verifier 미저장 → "verifier empty" 에러. 웹도 detectSessionInUrl가 처리.
            flowType: "pkce",
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
        const qs = new URLSearchParams(location.search);
        const rp = qs.get("ref");
        if (rp && /^[A-Z0-9]{4,12}$/i.test(rp) && !localStorage.getItem("galla_ref_done")) {
          localStorage.setItem("galla_ref", rp.toUpperCase());
        }
        // 🎯 초대 트랙(&to=galla|galvis|talk) 캡처 → 온보딩이 트랙에 맞춰 첫인상 강조
        const to = (qs.get("to") || "").toLowerCase();
        if (/^(galla|galvis|talk)$/.test(to)) localStorage.setItem("galla_invite_to", to);
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

      // 🎁 가입 웰컴 보너스 +500 GP — 초대 없이 가입한 사람도 무조건 1회 지급.
      //    반드시 위 apply_referral 다음에(초대가입자는 referral:join으로 이미 +500 → 서버가 스킵).
      //    서버 멱등(claim_welcome_bonus)이라 localStorage 유실돼도 재지급 안 됨 = 민원 원천 차단.
      try {
        if (!localStorage.getItem("galla_welcome_done")) {
          const { data: s } = await window.supabaseClient.auth.getSession();
          if (s?.session) {
            const { data: w } = await window.supabaseClient.rpc("claim_welcome_bonus");
            if (w && w.ok) {
              localStorage.setItem("galla_welcome_done", "1");
              if (w.amount > 0) {
                try { if (window.GALLA_toast) window.GALLA_toast("🎁 가입 축하 보너스 +" + w.amount + " GP!"); else alert("🎁 가입 축하 보너스 +" + w.amount + " GP를 받았어요!"); } catch (e) {}
              }
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
/* 🔐 로그인 이동 공용 헬퍼 — SPA(app.html)에선 문서 이탈 없이 로그인 뷰를 push하고,
   MPA/구셸에선 기존처럼 login.html로 이동한다. next: 돌아올 탭명/파일명(선택). */
window.GALLA_gotoLogin = function (next) {
  try {
    if (document.body && document.body.dataset.page === "spa" && window.GALLA_SPA) {
      window.GALLA_SPA.push("login", next ? { next: String(next) } : {});
      return;
    }
  } catch (_) {}
  location.href = "login.html" + (next ? "?next=" + encodeURIComponent(next) : "");
};
/* 👤 프로필 이동 공용 헬퍼 — SPA(app.html)에선 문서 이탈 없이 남의 프로필을 스택 push
   (mypage.html?user=로 이탈하면 nav.js의 앱/PWA 셸 복귀가 ?user를 버리고 내 마이페이지로
   보내는 문제가 있었음). MPA에선 기존처럼 mypage.html?user=로 이동(웹 문법 보존). */
window.GALLA_gotoProfile = function (uid) {
  if (!uid) return;
  try {
    if (document.body && document.body.dataset.page === "spa" && window.GALLA_SPA) {
      window.GALLA_SPA.push("mypage", { user: String(uid) });
      return;
    }
  } catch (_) {}
  location.href = "mypage.html?user=" + encodeURIComponent(uid);
};
