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

  /* 🏅 갈라리안 등급표 — GI만 있고 서버를 못 부르는 자리(피드 배지 도색기)용 동기 헬퍼.
     전 페이지 '레벨/등급'의 단일 진실. users.level(죽은 컬럼)은 쓰지 않는다.
     early-return 위에 둬 재주입에도 견고.

     ⚠️ 여기 곡선·티어는 서버 gi_for_level / gallian_of 의 거울이다.
        서버만 고치고 여기를 안 고쳐서, 피드 배지가 옛 등급(150/500/1500…)에
        옛 서브레벨 리셋까지 그대로 보여주고 있었다. 둘은 반드시 같이 고친다. */
  if (!window.GALLA_gallianTier) {
    /* 🏅 GI → 평생 레벨. 전 페이지 '레벨'의 단일 진실.
       ⚠️ 여기서 '등급'은 더 이상 계산하지 않는다 —
          시즌 등급은 상위 %(상대순위)라 GI 하나만 보고는 나올 수가 없다.
          등급 아이콘이 필요하면 GALLA_tiersOf(supabase, uids) 로 캐시를 읽어라.
          (예전엔 이 파일이 자기만의 임계값 사본을 들고 있어 피드 배지가
           옛 등급을 계속 보여줬다 — 사본을 다시 만들지 않는다) */
    const giForLevel = lv => (lv <= 1 ? 0 : Math.round(20 * Math.pow(lv - 1, 2)));
    const levelOfGi  = gi => Math.max(1, Math.floor(Math.sqrt(Math.max(0, Number(gi) || 0) / 20)) + 1);
    window.GALLA_giForLevel = giForLevel;
    window.GALLA_levelOfGi  = levelOfGi;

    window.GALLA_gallianOfGi = function (gi) {
      gi = Number(gi) || 0;
      const level = levelOfGi(gi);
      const floor = giForLevel(level), ceil = giForLevel(level + 1);
      return {
        gi, level, icon: "🌱", label: `Lv.${level}`,
        progress: ceil > floor ? Math.min(100, Math.round((gi - floor) / (ceil - floor) * 100)) : 0,
        goalRemaining: Math.max(0, ceil - gi),
        goalLabel: `Lv.${level + 1}`,
      };
    };
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
  /* 🔊 앱(iOS)에서 영상 소리만 작던 것 —
     앱 전역 오디오 세션이 통화용 .playAndRecord라, iOS가 마이크 하울링을 막으려고 출력을 감쇠시킨다.
     그래서 **볼륨을 최대로 올려도 작다**(볼륨과 무관한 감쇠라서). 브라우저는 .playback을 써서 크게 들린다.
     → 영상이 실제로 재생되는 동안만 네이티브에 .playback을 요청하고, 끝나면 원복한다.
     ⚠️ 통화·난장 중엔 네이티브가 알아서 무시한다(마이크가 열린 채 바꾸면 통화가 죽는다).
     ⚠️ 웹에선 브리지가 없으니 아무 일도 안 일어난다. */
  function nativeAudio(op) {
    try { window.webkit?.messageHandlers?.gallaAudio?.postMessage({ op: op }); } catch (_) {}
  }
  /* 🔬 네이티브가 실제 오디오 세션 상태를 돌려준다 → client_errors에 남긴다.
     실기기에서만 재현되는 문제라, 남겨두지 않으면 매번 사장님께 물어봐야 한다.
     ⚠️ 같은 값이 반복해서 쌓이지 않게 바뀔 때만 기록한다. */
  let _lastAudioDiag = "";
  window.__gallaAudioLog = function (op, diag) {
    try {
      const line = op + " " + diag;
      if (line === _lastAudioDiag) return;
      _lastAudioDiag = line;
      window.GALLA_logError && window.GALLA_logError(new Error("[audio] " + line), "audio-session");
    } catch (_) {}
  };
  // 앱 진입 시 한 번 현재 세션을 찍어둔다(기준값)
  setTimeout(() => nativeAudio("probe"), 3000);
  /* 🔉 소리는 언제나 '한 영상만'.
     피드는 화면 밖 영상을 pause로만 정리하는데, 정지된 영상도 muted=false를 그대로 들고 있다.
     그래서 스크롤하다 보면 위/아래 영상이 겹쳐 울리거나, 어느 게 소리 내는지 알 수 없게 된다
     (사장님 재현: "밑에 영상 소리가 나고 총체적 개판").
     ⚠️ 통화·라이브는 건드리지 않는다 — 거긴 동시에 여러 소리가 나야 정상이다. */
  function soloAudio(cur) {
    try {
      document.querySelectorAll("video").forEach(o => {
        if (o === cur || o.muted || o.srcObject) return;
        if (o.closest && o.closest("#dm-call, .live-room, [data-no-blur-pause]")) return;
        o.muted = true;
      });
      if (window.GALLA_syncSoundBtns) window.GALLA_syncSoundBtns();
    } catch (_) {}
  }

  window.GALLA_soloAudio = soloAudio;   // 피드/릴스가 '현재 영상만 소리'를 강제할 때 쓴다

  function bindMediaSession(v) {
    if (v.__mediaSessionBound) return;
    v.__mediaSessionBound = true;
    /* ⚠️ on/off는 반드시 짝이 맞아야 한다. 자기가 켠 적 없는데 off를 보내면
       네이티브 카운터가 0으로 떨어져, **다른 영상이 소리내며 재생 중인데도 세션이 꺼진다**
       (그 영상 소리가 다시 작아진다). 요소별로 켠 상태를 기억한다. */
    const on = () => { if (v.__mediaOn) return; v.__mediaOn = true; nativeAudio("mediaOn"); };
    const off = () => { if (!v.__mediaOn) return; v.__mediaOn = false; nativeAudio("mediaOff"); };
    v.addEventListener("play", () => { if (!v.muted) on(); });
    // 음소거 해제도 '소리가 나기 시작하는' 순간이다 — 피드 영상은 음소거로 시작한다
    v.addEventListener("volumechange", () => {
      if (!v.muted && !v.paused) { soloAudio(v); on(); }
      else if (v.muted) off();          // 다시 음소거하면 세션을 붙들고 있을 이유가 없다
    });
    // 재생이 시작될 때도 단독 보장 — 스크롤로 다음 영상이 뜨는 순간이 여기다
    v.addEventListener("play", () => { if (!v.muted) soloAudio(v); });
    v.addEventListener("pause", off);
    v.addEventListener("ended", off);
    v.addEventListener("emptied", off);
  }

  /* 🔁 반복 재생 제한은 **되돌렸다**(한때 3회로 끊었음). 두 가지 이유:
     ① 영상을 Stream → R2로 옮겨서 **재생이 공짜**가 됐다. 제한할 이유가 사라졌다.
     ② 피드의 소리 제어가 '영상은 계속 돈다'를 전제로 짜여 있다. 3회 뒤 멈추면
        **음소거가 아닌데 소리가 안 나는** 상태가 되고, 스크롤하며 보면 어느 영상이
        소리를 내는지 통째로 꼬인다(사장님 재현: "총체적 개판").
     낭비 방지는 화면 밖 정지(IntersectionObserver)와 창 비활성 정지로 충분하다. */
  function sweepLoops(root) {
    try {
      const r = root || document;
      /* 오디오 세션은 **모든 영상**에 건다.
         ⚠️ 통화·라이브 영상은 제외 — 네이티브가 세션을 직접 관리하는 영역이다. */
      r.querySelectorAll("video").forEach(v => {
        if (v.srcObject) return;
        if (v.closest && v.closest("#dm-call, .live-room, [data-no-blur-pause]")) return;
        bindMediaSession(v);
      });
    } catch (_) {}
  }
  if (!window.__GALLA_LOOPCAP__) {
    window.__GALLA_LOOPCAP__ = true;
    const boot = () => {
      sweepLoops();
      // 피드·댓글은 나중에 그려진다 — 늦게 들어온 영상도 잡는다
      try { new MutationObserver(() => sweepLoops()).observe(document.documentElement, { childList: true, subtree: true }); } catch (_) {}
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();

    /* 창이 뒤로 밀려도(다른 앱·다른 창) 재생을 멈춘다.
       visibilitychange는 '탭 숨김'만 잡는다 — 보이는 채로 방치된 창은 계속 돌아간다.
       그 방치 시간이 이번 청구서의 주범이다. */
    window.addEventListener("blur", () => {
      try {
        document.querySelectorAll("video").forEach(v => {
          /* ⚠️ 통화·라이브는 절대 멈추면 안 된다. WebRTC 영상은 srcObject로 붙고
             다른 창을 잠깐 봤다고 통화가 끊기면 그건 고장이다.
             (내가 처음에 '모든 video'를 멈춰서 통화까지 죽였다) */
          if (v.srcObject) return;
          if (v.closest("#dm-call, .live-room, [data-no-blur-pause]")) return;
          if (!v.paused) { v.pause(); v.__blurPaused = true; }
        });
      } catch (_) {}
    });
  }

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
/* 🎫 이용권 배지 — 이름 뒤. 닉네임 그라디언트가 배지까지 먹지 않게 클립을 리셋한다
   (nick-tier와 같은 이유). 과시가 아니라 '구독자'라는 조용한 표식이라 톤을 낮게 잡았다. */
.sub-badge{display:inline-block;margin-left:4px;font-size:.78em;line-height:1;vertical-align:baseline;
  -webkit-text-fill-color:initial!important;background:none!important;-webkit-background-clip:initial!important;
  background-clip:initial!important;animation:none!important;text-shadow:none!important}
.sub-badge.sub-lite{color:#9aa4bf}
.sub-badge.sub-friend{color:#7c8cff}
.sub-badge.sub-pro{color:#a78bfa;text-shadow:0 0 6px rgba(167,139,250,.45)!important}
/* 🖼 프로필 프레임 — 아바타 테두리.
   ⚠️ border가 아니라 box-shadow(inset+outer)로 그린다. border를 쓰면 아바타 크기가
      화면마다 1~2px씩 밀려서 정렬이 깨진다(아바타는 크기가 제각각인 데다 flex 안에 있다). */
.pf-frame{position:relative;border-radius:50%}
.pf-silver{box-shadow:0 0 0 2px #b9c0cf, 0 0 6px rgba(185,192,207,.5)}
.pf-aqua  {box-shadow:0 0 0 2px #4dd8e6, 0 0 9px rgba(77,216,230,.55)}
.pf-ember {box-shadow:0 0 0 2px #ff9a4d, 0 0 10px rgba(255,154,77,.55)}
.pf-violet{box-shadow:0 0 0 2px #a78bfa, 0 0 12px rgba(167,139,250,.6)}
.pf-prism {box-shadow:0 0 0 2px #7c8cff, 0 0 14px rgba(124,140,255,.5), 0 0 22px rgba(255,120,200,.35)}
@media (prefers-reduced-motion: no-preference){
  .pf-prism{animation:pfPrism 4s linear infinite}
  @keyframes pfPrism{
    0%,100%{box-shadow:0 0 0 2px #7c8cff, 0 0 14px rgba(124,140,255,.5), 0 0 22px rgba(255,120,200,.35)}
    50%    {box-shadow:0 0 0 2px #ff78c8, 0 0 14px rgba(255,120,200,.5), 0 0 22px rgba(124,140,255,.35)}
  }
}
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
      // 🎫 이용권 등급도 같이 받는다 — 배지는 남의 것도 봐야 해서 전용 RPC(tiers_of).
      //    등급 문자열만 온다(만료일·결제정보 없음). 무료·게스트는 아예 결과에 없다.
      const [{ data }, giRes, tierRes, nsRes, frRes] = await Promise.all([
        window.supabaseClient.from("user_cosmetics").select("user_id,nick_gold,emoticon,title,nick_style").in("user_id", need),
        window.supabaseClient.rpc("gi_of_users", { p_uids: need }),
        window.supabaseClient.rpc("tiers_of", { p_uids: need }).then(r => r, () => ({ data: null })),
        window.supabaseClient.rpc("nickstyles_of", { p_uids: need }).then(r => r, () => ({ data: null })),
        window.supabaseClient.rpc("frames_of", { p_uids: need }).then(r => r, () => ({ data: null })),
      ]);
      (data || []).forEach(r => { cache[r.user_id] = { nick_gold: r.nick_gold, emoticon: r.emoticon, title: r.title, nick_style: r.nick_style }; });
      const giMap = giRes && giRes.data ? giRes.data : {};
      const tierMap = tierRes && tierRes.data ? tierRes.data : {};
      const nsMap = nsRes && nsRes.data ? nsRes.data : null;
      need.forEach(u => { cache[u] = Object.assign(cache[u] || {}, { gi: Number(giMap[u]) || 0, sub: tierMap[u] || null }); });
      /* 🎫 스타일은 '유효 스타일'로 덮어쓴다 — user_cosmetics 값은 장착 기록일 뿐이고,
         구독으로 빌려 쓰던 스타일은 만료되면 기본으로 떨어져야 한다.
         ⚠️ RPC가 실패하면 덮어쓰지 않는다(장착 기록 그대로) — 일시 장애로 남의 꾸미기가
            통째로 사라지는 것보다는 낫다. */
      if (nsMap) need.forEach(u => { cache[u].nick_style = nsMap[u] || null; });
      const frMap = frRes && frRes.data ? frRes.data : {};
      need.forEach(u => { cache[u].frame = frMap[u] || null; });
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
  /* 🖼 아바타 선별 목록 — 닉네임(NICK_SEL)과 같은 방식. 화면마다 클래스가 달라
     범용 마커가 없어서 열거한다. 새 화면을 만들 땐 여기 추가하거나 .gu-av를 쓰면 된다. */
  /* 클래스 이름이 화면마다 달라서(gu-av·c-avatar·dm-ava·mah-avatar…) 열거로는 못 따라간다.
     이 코드베이스의 아바타는 예외 없이 'avatar' 또는 '-av' 조각을 갖고 있어 패턴으로 잡는다. */
  const AV_SEL = '[class*="avatar"], [class*="-av"], .avatar';
  function _applyFrame(nickEl, frame) {
    let node = nickEl, av = null;
    for (let i = 0; i < 3 && node && !av; i++) {
      node = node.parentElement;
      if (!node) break;
      const hits = node.querySelectorAll(AV_SEL);
      /* ⚠️ 조상이 '목록'이면 옆 사람 아바타를 잡는다. 후보가 둘 이상이면 그 층은 건너뛰고
         더 좁은 층에서만 찾는다 — 남의 아바타에 내 프레임을 씌우는 사고를 막는다. */
      if (hits.length === 1) av = hits[0];
      else if (hits.length > 1) break;
    }
    if (!av) return;
    if (av.getAttribute("data-frame") === frame) return;   // 이미 같은 프레임
    [...av.classList].filter(c => c.startsWith("pf-")).forEach(c => av.classList.remove(c));
    av.classList.add("pf-frame", "pf-" + frame);
    av.setAttribute("data-frame", frame);
  }

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
        /* 🎫 이용권 배지 — 이름 '뒤'에 붙인다. 앞은 갈라리안 등급 아이콘 자리다.
           등급 아이콘(활동)과 이용권 배지(결제)는 성격이 달라 붙는 위치로 구분한다.
           ⚠️ 무료·게스트는 tiers_of 결과에 아예 없으므로 배지도 안 붙는다
              — "이 사람 무과금"이라는 정보를 흘리지 않기 위해서다. */
        /* 🖼 프로필 프레임 — 아바타에 테두리를 입힌다.
           아바타는 화면마다 클래스가 제각각이라(gu-av·pza-av·dm-ava…) 닉네임처럼
           범용 마커가 없다. 그래서 **이름 요소에서 가까운 조상 안의 아바타**를 찾는다.
           ⚠️ 3단계까지만 올라간다. 더 올라가면 남의 아바타(옆 카드)를 잡는다. */
        if (d.frame) _applyFrame(el, d.frame);
        if (d.sub && !(el.lastElementChild && el.lastElementChild.classList.contains("sub-badge"))) {
          const sb = document.createElement("span");
          sb.className = "sub-badge sub-" + d.sub;
          sb.title = { lite: "라이트 이용권", friend: "프렌드 이용권", pro: "프로 이용권" }[d.sub] || "이용권";
          sb.textContent = d.sub === "lite" ? "◇" : "◆";
          el.appendChild(sb);
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
      // 🎫 이용권 배지는 이름 '뒤' — 안 지우면 재도색마다 겹겹이 쌓인다
      const sb = el.lastElementChild;
      if (sb && sb.classList.contains("sub-badge")) sb.remove();
      // 🖼 프레임도 벗긴다 — 구독 해지·프레임 변경이 화면에 반영되려면 초기화가 필요하다
      let n = el, av = null;
      for (let i = 0; i < 3 && n && !av; i++) {
        n = n.parentElement; if (!n) break;
        const hits = n.querySelectorAll(AV_SEL);
        if (hits.length === 1) av = hits[0]; else if (hits.length > 1) break;
      }
      if (av) {
        [...av.classList].filter(c => c.startsWith("pf-")).forEach(c => av.classList.remove(c));
        av.removeAttribute("data-frame");
      }
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
      // 🧟 좀비 세션 정리 — 계정이 삭제(탈퇴·관리자 삭제)됐는데 기기에 토큰이 남으면
      //    JWT는 만료 전까지 유효해 보여 '로그인된 척'하지만 모든 조회가 실패한다.
      //    → 페이지들이 로그인/게이트로 서로 튕겨 무한 새로고침(2026-08-08 관제센터 사고). 한 번에 정리.
      (async () => {
        try {
          const { data: s } = await window.supabaseClient.auth.getSession();
          if (!s?.session) return;
          const { error } = await window.supabaseClient.auth.getUser();   // 서버 검증
          const msg = String(error?.message || "");
          if (error && /user.*not.*found|does not exist|invalid claim|sub claim|forbidden/i.test(msg)) {
            console.warn("[supabase] 좀비 세션 정리:", msg.slice(0, 60));
            try { await window.supabaseClient.auth.signOut(); } catch (_) {}
            try {
              Object.keys(localStorage).filter((k) => /^sb-.*-auth-token$/.test(k)).forEach((k) => localStorage.removeItem(k));
            } catch (_) {}
          }
        } catch (_) { /* 네트워크 문제면 건드리지 않는다(오탐 로그아웃 방지) */ }
      })();
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

      // 🚪 온보딩 봉인(계정 단위) — 오리엔테이션/투어가 웹·앱·재설치 넘나들며 또 뜨는 걸 근본 차단.
      //    mark_onboarded()는 '이전에 온보딩했는지'를 반환하고(true=이미 봄) 없으면 지금 기록.
      //    이미 온보딩된 계정이면 모든 로컬 투어 플래그를 세팅해 어떤 오리엔테이션도 안 뜨게 한다.
      //    (localStorage가 기기/오리진마다 분리·초기화돼도 서버 진실이 봉인을 보장.)
      try {
        const { data: s } = await window.supabaseClient.auth.getSession();
        if (s?.session && !localStorage.getItem("galla_fresh_signup")) {
          const { data: already } = await window.supabaseClient.rpc("mark_onboarded");
          if (already === true) {
            ["galla_tour_v2", "galla_onboarded", "galla_dm_tour_v2", "galla_trend_tour_v1", "galla_create_tour_v1"]
              .forEach((k) => { try { localStorage.setItem(k, "1"); } catch (e) {} });
            // 진행 중인 오버레이가 있으면 즉시 제거(막 로그인해 부트 중 뜬 경우)
            try { document.querySelectorAll(".gtour, .obd").forEach((el) => el.remove()); } catch (e) {}
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
