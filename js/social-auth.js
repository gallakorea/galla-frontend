/* 🔐 GALLA 로그인 — 구글(네이티브 Supabase OAuth) + 패스키(WebAuthn 커스텀).
   카카오는 비즈 앱 미전환으로 account_email 동의 불가(KOE205) → 제외(2026-07-24, 사장님 확정).
   패스키: passkey 엣지함수 + verifyOtp(magiclink)로 세션. login/signup/auth-callback/설정 공용. */
(function () {
  const sb = () => window.supabaseClient;
  // app-url-ok: 웹 전용 — 앱은 아래 NATIVE_REDIRECT(im.galla.app://) 로 딥링크 복귀한다
  const CALLBACK = location.origin + "/auth-callback.html";

  /* ══════════ 구글 OAuth ══════════ */
  // Capacitor 네이티브 앱인지 (구글 로그인을 인앱 브라우저+딥링크로 완결)
  function isNativeApp() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }
  const NATIVE_REDIRECT = "im.galla.app://auth-callback";

  // 딥링크 복귀 리스너 — OAuth 끝나고 im.galla.app://auth-callback?code=... 로 앱이 열리면 세션 확립
  let _nativeAuthListener = false;
  /* Capacitor 브릿지는 top 문서에만 주입된다. SPA 뷰는 iframe 안에서 돌아 그 프레임의
     window.Capacitor 는 비어 있다 — 그래서 이 리스너가 조용히 등록조차 안 됐다
     (실측 2026-08-28: "No listeners found for event appUrlOpen"). 햅틱·뒤로가기와 같은 함정. */
  function capBridge() {
    let C = window.Capacitor;
    try { if (!(C && C.Plugins && C.Plugins.App) && window.top !== window && window.top.Capacitor) C = window.top.Capacitor; } catch (_) {}
    try { if (!(C && C.Plugins && C.Plugins.App) && window.parent !== window && window.parent.Capacitor) C = window.parent.Capacitor; } catch (_) {}
    return C || null;
  }

  function setupNativeAuthListener() {
    if (_nativeAuthListener || !isNativeApp()) return;
    const C = capBridge();
    const App = C && C.Plugins && C.Plugins.App;
    if (!App) return;
    _nativeAuthListener = true;

    /* 🧊 콜드 스타트 — 앱이 꺼져 있을 때 링크로 열리면 appUrlOpen 이 오지 않는다.
       그 경우 실행 URL 을 직접 물어봐야 한다. 안 물어보면 '링크로 열었는데 로그인이 안 되는'
       상태가 된다 — 메일의 로그인 링크를 누른 사람이 정확히 이 경우다. */
    try {
      App.getLaunchUrl && App.getLaunchUrl().then((r) => {
        if (r && r.url) handleAuthUrl(r.url);
      }).catch(() => {});
    } catch (_) {}
    App.addListener("appUrlOpen", (event) => handleAuthUrl((event && event.url) || ""));
  }

  async function handleAuthUrl(url) {
    {
      const pick = (k) => {
        // 값은 ? 뒤에도 # 뒤에도 올 수 있다 — 둘 다 뒤진다
        const m = url.match(new RegExp("[?&#]" + k + "=([^&#]+)"));
        return m ? decodeURIComponent(m[1]) : null;
      };
      const code = pick("code");
      const at = pick("access_token"), rt = pick("refresh_token");
      /* ⚠️ 예전엔 주소에 'auth-callback' 이 들어 있을 때만 처리했다. 그런데 Supabase 는
         redirect_to 를 못 쓰는 상황이면 SITE_URL(https://galla.im/#access_token=...)로 되돌린다.
         그러면 이 리스너가 조용히 무시해서 **로그인이 아무 말 없이 실패**했다(실측 2026-08-28).
         이제는 '토큰이나 코드가 들어 있으면' 처리한다 — 어디로 떨어지든 받는다.
         매직링크·이메일 인증처럼 코드 대신 토큰이 바로 오는 경로도 같이 살아난다. */
      /* 🔒 우리 콜백에서 온 것만 받는다 (2026-09-01 실측 결함).
         예전엔 "토큰이 들어 있으면 어디서 왔든" 처리했다. 그래서 아무 앱·웹페이지가
             im.galla.app://cb#access_token=…&refresh_token=…
         를 열면 그대로 setSession 이 돌아 **피해자 앱이 공격자 계정으로 로그인**됐다
         (세션 고정). 시뮬레이터에서 openurl 로 재현 — 가짜 토큰이라 'Invalid JWT structure'
         까지 갔다 = 토큰을 실제로 먹었다는 뜻이다. 진짜 토큰이면 조용히 바뀐다.
         정상 경로는 둘뿐이다:
           · im.galla.app://auth-callback…  (NATIVE_REDIRECT)
           · https://galla.im/…             (SITE_URL 폴백·유니버설링크·auth-callback.html)
         PKCE code 경로는 로컬 code_verifier 로 검증되지만, 토큰 직행 경로는 검증이 없어
         출처를 여기서 막아야 한다. */
      const fromOurCallback = url.indexOf("auth-callback") >= 0 || /^https:\/\/galla\.im\//i.test(url);
      if (!fromOurCallback) return;
      if (!code && !at) return;
      try { window.Capacitor?.Plugins?.Browser?.close?.(); } catch (_) {}
      try {
        const c = sb();
        if (code) {
          const { error } = await c.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (at && rt) {
          const { error } = await c.auth.setSession({ access_token: at, refresh_token: rt });
          if (error) throw error;
        } else {
          throw new Error("no_auth_code");
        }
        try { if (await needsOnboard()) await openOnboard(); } catch (_) {}
        /* ⚠️ 앱(SPA 셸)에서 location.replace 를 하면 셸 자체가 index.html 로 바뀌어
           라우터·네비가 통째로 죽는다(실측: 로그인은 됐는데 화면이 스켈레톤에서 멈췄다).
           셸이면 라우터로 홈에 보내고, 아니면 예전처럼 이동한다. */
        if (window.GALLA_shellGo) { window.GALLA_shellGo("index.html", "home"); return; }
        if (window.GALLA_SPA && window.GALLA_nav) { window.GALLA_nav("index.html"); return; }
        location.replace("index.html");
      } catch (e) {
        alert("로그인 처리 실패 — " + (e?.message || "다시 시도해 주세요."));
      }
    }
  }

  async function signInSocial(provider) {
    const c = sb();
    if (!c) { alert("잠시 후 다시 시도해주세요."); return; }
    try {
      // 매번 계정 선택 화면 강제 → 다른 구글 계정 선택/추가 가능(안 그러면 같은 계정으로 자동로그인)
      const qp = { prompt: "select_account" };
      // 네이티브 앱: 인앱 브라우저로 열고 딥링크로 복귀(사파리로 안 튐)
      if (isNativeApp()) {
        setupNativeAuthListener();
        const { data, error } = await c.auth.signInWithOAuth({
          provider, options: { redirectTo: NATIVE_REDIRECT, skipBrowserRedirect: true, queryParams: qp },
        });
        if (error) throw error;
        if (data?.url) await window.Capacitor.Plugins.Browser.open({ url: data.url, presentationStyle: "popover" });
        return;
      }
      // 웹: 기존 리다이렉트
      const { error } = await c.auth.signInWithOAuth({ provider, options: { redirectTo: CALLBACK, queryParams: qp } });
      if (error) alert(/provider/i.test(error.message) ? "이 로그인은 아직 준비 중입니다." : "로그인 실패: " + error.message);
    } catch (e) { alert("로그인 실패 — " + (e?.message || "잠시 후 다시 시도해 주세요.")); }
  }
  window.GALLA_signInSocial = signInSocial;

  /* ══════════ 🟢 네이버 로그인 (커스텀 — Supabase 기본 provider 아님) ══════════
     흐름: naver-auth(action:authorize)로 인가URL 발급(client_id는 서버 보관) → 네이버 동의 →
     /auth-callback.html?code=&state= 복귀 → naver-auth로 code 교환 → token_hash → verifyOtp로 세션.
     state는 sessionStorage에 저장했다가 콜백에서 대조(CSRF 방어). */
  const NAVER_FN = "/functions/v1/naver-auth";
  const NAVER_STATE_KEY = "galla_naver_state";
  const SB_URL = "https://bidqauputnhkqepvdzrr.supabase.co";
  const SB_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpZHFhdXB1dG5oa3FlcHZkenJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNzg1NDIsImV4cCI6MjA4MDg1NDU0Mn0.D-UGDPuBaNO8v-ror5-SWgUNLRvkOO-yrf2wDVZtyEM";
  function fnUrl(path) {
    const base = (window.GALLA_SUPABASE_URL || (sb() && sb().supabaseUrl) || SB_URL).replace(/\/$/, "");
    return base + path;
  }
  async function naverFetch(payload) {
    const key = window.GALLA_SUPABASE_ANON || (sb() && sb().supabaseKey) || SB_ANON;
    const res = await fetch(fnUrl(NAVER_FN), {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, Authorization: "Bearer " + key },
      body: JSON.stringify(payload),
    });
    return await res.json();
  }
  async function signInNaver() {
    try {
      const redirect = isNativeApp() ? NATIVE_REDIRECT : CALLBACK;
      const r = await naverFetch({ action: "authorize", redirect_uri: redirect });
      if (!r || !r.url) {
        alert(r && r.error === "naver_not_configured" ? "네이버 로그인은 준비 중이에요." : "네이버 로그인을 시작하지 못했어요.");
        return;
      }
      try { sessionStorage.setItem(NAVER_STATE_KEY, r.state); } catch (_) {}
      if (isNativeApp()) {
        setupNativeAuthListener();
        await window.Capacitor.Plugins.Browser.open({ url: r.url, presentationStyle: "popover" });
        return;
      }
      location.href = r.url;
    } catch (e) { alert("네이버 로그인 실패 — " + (e?.message || "잠시 후 다시 시도해 주세요.")); }
  }
  window.GALLA_signInNaver = signInNaver;

  /* 콜백에서 호출: ?code=&state= 있으면 세션까지 확립하고 true 반환 */
  async function handleNaverCallback() {
    const q = new URLSearchParams(location.search);
    const code = q.get("code"), state = q.get("state");
    if (!code || !state) return false;
    // 구글 등 Supabase OAuth는 해시 토큰으로 오므로 code가 있으면 네이버 경로
    let saved = null;
    try { saved = sessionStorage.getItem(NAVER_STATE_KEY); } catch (_) {}
    if (saved && saved !== state) { alert("로그인 검증에 실패했어요. 다시 시도해 주세요."); return false; }
    try { sessionStorage.removeItem(NAVER_STATE_KEY); } catch (_) {}
    const r = await naverFetch({ code, state, redirect_uri: CALLBACK });
    if (!r || !r.ok || !r.token_hash) return false;
    const c = sb();
    if (!c) return false;
    const { error } = await c.auth.verifyOtp({ token_hash: r.token_hash, type: "magiclink" });
    return !error;
  }
  window.GALLA_handleNaverCallback = handleNaverCallback;

  /* ══════════ 패스키(WebAuthn) ══════════ */
  const hasPasskey = () => !!(window.PublicKeyCredential && navigator.credentials);

  // 🔑 네이티브 패스키(Supabase Auth 정식·베타) — WebAuthn 전 과정을 supabase-js가 내부 처리.
  //    대시보드 passkey_enabled + RP(id=galla.im, origin=https://galla.im) 설정 필요.

  // 패스키 등록(로그인 상태에서 "이 기기에 패스키 추가")
  async function passkeyRegister() {
    if (!hasPasskey()) { alert("이 브라우저는 패스키를 지원하지 않아요."); return false; }
    const c = sb();
    if (!c?.auth?.registerPasskey) { alert("패스키 모듈이 아직 안 올라왔어요.\n앱을 완전히 껐다 켠 뒤(또는 새로고침) 다시 시도해 주세요."); return false; }
    try {
      const { data, error } = await c.auth.registerPasskey();
      if (error) throw error;
      alert("패스키가 등록됐어요. 다음부턴 비번 없이 로그인할 수 있어요 🔑");
      return true;
    } catch (e) {
      console.warn("[passkey register] fail:", e && e.name, e && e.message, e);
      if (e && e.name === "NotAllowedError") {
        alert("패스키 등록이 취소됐거나 이 환경에서 막혔어요.\n(" + (e.message || "NotAllowedError") + ")");
        return false;
      }
      alert("패스키 등록 실패 — [" + ((e && e.name) || "?") + "] " + ((e && e.message) || "다시 시도해 주세요."));
      return false;
    }
  }
  window.GALLA_passkeyRegister = passkeyRegister;

  // 패스키 로그인(비로그인 상태)
  async function passkeyLogin() {
    if (!hasPasskey()) { alert("이 브라우저는 패스키를 지원하지 않아요."); return false; }
    const c = sb();
    if (!c?.auth?.signInWithPasskey) { alert("패스키 준비 중이에요. 잠시 후 다시 시도해 주세요."); return false; }
    try {
      const { error } = await c.auth.signInWithPasskey();
      if (error) throw error;
      // 온보딩 필요하면 처리 후 홈
      try { if (await needsOnboard()) await openOnboard(); } catch (_) {}
      location.replace("index.html");
      return true;
    } catch (e) {
      // NotAllowedError = 사용자가 취소했거나, 이 기기에 등록된 패스키가 없음
      if (e && e.name === "NotAllowedError") {
        alert("사용할 패스키가 없어요.\n먼저 구글/이메일로 로그인한 뒤,\n설정 → '이 기기에 패스키 등록'을 하면 다음부터 패스키로 로그인할 수 있어요. 🔑");
        return false;
      }
      alert("패스키 로그인 실패 — " + (e?.message || "다시 시도해 주세요."));
      return false;
    }
  }
  window.GALLA_passkeyLogin = passkeyLogin;

  // iOS '홈화면 웹클립 PWA'인지 — 여긴 구글(사파리로 튐)·패스키(iOS가 WebAuthn 차단) 불가.
  // ⚠️ 네이티브 앱(Capacitor, UA에 GallaApp)은 제외 — Associated Domains로 패스키 가능하므로 버튼 유지.
  function isStandalonePWA() {
    if (/GallaApp/i.test(navigator.userAgent || "")) return false;
    return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
           window.navigator.standalone === true;
  }
  window.GALLA_isStandalonePWA = isStandalonePWA;

  /* ══════════ 버튼 렌더 (login.html / signup.html) ══════════ */
  function renderButtons(host) {
    if (!host || document.querySelector(".social-auth")) return;
    const box = document.createElement("div");
    box.className = "social-auth";
    // 홈화면 앱: 구글·패스키가 iOS 한계로 안 됨 → 버튼 대신 안내(사파리에선 됨)
    if (isStandalonePWA()) {
      box.innerHTML = '<div class="social-div"><span>다른 로그인</span></div>' +
        '<div class="soc-hint">🔑 구글·패스키 로그인은 <b>Safari(브라우저)</b>에서 galla.im을 열면 쓸 수 있어요.<br>앱에선 이메일로 로그인해 주세요.</div>';
      host.appendChild(box);
      return;
    }
    // 애플 로고 SVG(흰색) — Sign in with Apple 가이드라인(검정 버튼 + 흰 로고)
    const APPLE_SVG = '<svg class="soc-ic soc-a" viewBox="0 0 17 20" fill="currentColor" aria-hidden="true"><path d="M14.06 15.53c-.26.6-.57 1.16-.93 1.67-.5.71-.9 1.2-1.22 1.47-.49.45-1.02.68-1.59.7-.41 0-.9-.12-1.48-.35-.58-.24-1.11-.35-1.6-.35-.51 0-1.06.11-1.65.35-.59.24-1.06.36-1.42.38-.55.02-1.09-.22-1.62-.72-.34-.29-.76-.79-1.26-1.51-.53-.76-.97-1.65-1.31-2.66C.44 13.86.25 12.8.25 11.78c0-1.17.25-2.18.76-3.02a4.5 4.5 0 0 1 1.6-1.61c.66-.39 1.38-.59 2.15-.6.44 0 1.01.14 1.72.4.71.27 1.16.4 1.36.4.15 0 .65-.16 1.5-.47.8-.29 1.48-.41 2.03-.36 1.5.12 2.62.71 3.37 1.77-1.34.81-2 1.95-1.99 3.41.01 1.14.42 2.09 1.24 2.84.37.35.79.62 1.25.81-.1.29-.21.57-.33.83zM11.6.4c0 .87-.32 1.69-.95 2.44-.77.9-1.7 1.42-2.7 1.34a2.7 2.7 0 0 1-.02-.33c0-.84.36-1.73 1-2.47.32-.37.73-.68 1.22-.93.49-.24.96-.38 1.4-.4.02.12.05.24.05.35z"/></svg>';
    /* 🍎 애플 로그인은 애플 쪽에서만 띄운다.
       iOS 앱은 심사 지침 4.8 이 요구하니 반드시 있어야 하고, 안드로이드 앱에는 요구가 없다.
       그런데 안드로이드에서도 그려지고 있었다(실측 2026-08-28 에뮬) — 딥링크 복귀가
       애플 쪽으로 잡혀 있지 않아 눌러도 돌아오지 못할 가능성이 크다.
       로그인 화면에서 '눌러도 안 되는 버튼'은 그냥 이탈이다. 안 되는 곳에선 안 보이게 한다. */
    const androidApp = (function () {
      try {
        const C = window.Capacitor;
        const native = !!(C && C.isNativePlatform && C.isNativePlatform());
        const plat = C && C.getPlatform && C.getPlatform();
        return native && plat === "android";
      } catch (_) { return /Android/i.test(navigator.userAgent) && /GallaApp/i.test(navigator.userAgent); }
    })();

    let html = '<div class="social-div"><span>간편 로그인</span></div>' +
      '<button type="button" class="soc-btn soc-google" data-act="google"><span class="soc-ic soc-g">G</span> 구글로 계속하기</button>' +
      (androidApp ? '' :
      '<button type="button" class="soc-btn soc-apple" data-act="apple">' + APPLE_SVG + ' Apple로 계속하기</button>') +
      '<button type="button" class="soc-btn soc-naver" data-act="naver"><span class="soc-ic soc-n">N</span> 네이버로 계속하기</button>';
    if (hasPasskey())
      html += '<button type="button" class="soc-btn soc-passkey" data-act="passkey"><span class="soc-ic">🔑</span> 패스키로 로그인</button>';
    box.innerHTML = html;
    host.appendChild(box);
    box.querySelector('[data-act="google"]').onclick = () => signInSocial("google");
    const ap = box.querySelector('[data-act="apple"]');
    if (ap) ap.onclick = () => signInSocial("apple");
    const nv = box.querySelector('[data-act="naver"]');
    if (nv) nv.onclick = () => signInNaver();
    const pk = box.querySelector('[data-act="passkey"]');
    if (pk) pk.onclick = () => passkeyLogin();
  }
  window.GALLA_renderSocialButtons = renderButtons;

  /* ══════════ 온보딩 게이트 (소셜/패스키 신규 → 닉네임·약관) ══════════ */
  async function needsOnboard() {
    const c = sb(); if (!c) return false;
    try { const { data } = await c.rpc("needs_onboard"); return data === true; }
    catch (_) { return false; }
  }
  window.GALLA_needsOnboard = needsOnboard;

  const REGIONS = ["서울","부산","대구","인천","광주","대전","울산","세종","경기","강원","충북","충남","전북","전남","경북","경남","제주","해외"];
  const NOW_Y = new Date().getFullYear();
  const MAX_BIRTH_Y = NOW_Y - 14;                 // 만 14세 이상
  const YEARS = Array.from({ length: MAX_BIRTH_Y - 1930 + 1 }, (_, i) => MAX_BIRTH_Y - i);

  function openOnboard() {
    return new Promise((resolve) => {
      if (document.getElementById("soc-onboard")) return resolve(false);
      const wrap = document.createElement("div");
      wrap.id = "soc-onboard";
      wrap.className = "soc-onboard";
      wrap.innerHTML = `
        <div class="soco-card soco-full">
          <div class="soco-title">가입을 마무리해요 🎉</div>
          <div class="soco-sub">활동하려면 아래 정보가 필요해요. 잠깐이면 돼요.</div>

          <label class="soco-lab">닉네임 <em>필수</em></label>
          <input id="soco-nick" class="soco-input" maxlength="20" placeholder="닉네임 (2~12자)" autocomplete="off">
          <div id="soco-nickmsg" class="soco-msg"></div>

          <label class="soco-lab">출생연도 <em>필수</em></label>
          <select id="soco-birth" class="soco-input soco-select">
            <option value="">출생연도 선택</option>
            ${YEARS.map(y => `<option value="${y}">${y}년</option>`).join("")}
          </select>

          <label class="soco-lab">성별 <em>필수</em></label>
          <div class="soco-chips" id="soco-gender">
            <button type="button" class="soco-chip" data-g="male">남성</button>
            <button type="button" class="soco-chip" data-g="female">여성</button>
          </div>

          <label class="soco-lab">지역 <em>필수</em></label>
          <select id="soco-region" class="soco-input soco-select">
            <option value="">지역 선택</option>
            ${REGIONS.map(r => `<option value="${r}">${r}</option>`).join("")}
          </select>

          <label class="soco-lab">휴대폰 <em class="opt">선택</em></label>
          <input id="soco-phone" class="soco-input" type="tel" inputmode="tel" placeholder="010-0000-0000 (수익 정산·계정 복구에 필요)">

          <label class="soco-check soco-agree"><input type="checkbox" id="soco-terms"><span>[필수] 만 14세 이상 · <a href="/terms.html" target="_blank">이용약관</a> · <a href="/privacy.html" target="_blank">개인정보 수집·이용</a> 동의</span></label>
          <label class="soco-check"><input type="checkbox" id="soco-mkt"><span>[선택] 마케팅·이벤트 정보 수신 동의 🎁 무료 GP 소식</span></label>

          <div id="soco-err" class="soco-msg"></div>
          <button id="soco-go" class="soco-btn" type="button">가입 완료하고 시작하기</button>
        </div>`;
      document.body.appendChild(wrap);
      const nick = wrap.querySelector("#soco-nick");
      const msg = wrap.querySelector("#soco-nickmsg");
      const birth = wrap.querySelector("#soco-birth");
      const err = wrap.querySelector("#soco-err");
      let gender = "";
      if (window.GALLA_bindNickCheck) window.GALLA_bindNickCheck(nick, msg);
      wrap.querySelectorAll(".soco-chip").forEach(ch => ch.onclick = () => {
        gender = ch.dataset.g;
        wrap.querySelectorAll(".soco-chip").forEach(x => x.classList.toggle("on", x === ch));
      });
      wrap.querySelector("#soco-go").onclick = async () => {
        const c = sb();
        const n = nick.value.trim();
        err.textContent = ""; err.className = "soco-msg";
        if (n.length < 2) return fail("닉네임은 2자 이상이에요.");
        if (!birth.value) return fail("출생연도를 선택해 주세요.");
        if (!gender) return fail("성별을 선택해 주세요.");
        if (!wrap.querySelector("#soco-region").value) return fail("지역을 선택해 주세요.");
        if (!wrap.querySelector("#soco-terms").checked) return fail("필수 약관에 동의해 주세요.");
        const btn = wrap.querySelector("#soco-go"); btn.disabled = true; btn.textContent = "설정 중…";
        const { data, error } = await c.rpc("social_onboard", {
          p_nick: n, p_terms: true,
          p_marketing: wrap.querySelector("#soco-mkt").checked,
          p_birth_year: parseInt(birth.value, 10),
          p_gender: gender,
          p_region: wrap.querySelector("#soco-region").value,
          p_phone: wrap.querySelector("#soco-phone").value.trim() || null,
        });
        if (error || !data?.ok) {
          const r = data?.reason;
          const m = { nick_taken:"이미 쓰는 닉네임이에요.", nick_short:"닉네임이 너무 짧아요.",
            age14:"만 14세 이상만 가입할 수 있어요.", gender:"성별을 선택해 주세요.",
            region:"지역을 선택해 주세요.", birth:"출생연도를 선택해 주세요.", terms:"약관에 동의해 주세요." };
          fail(m[r] || "저장 실패 — 다시 시도해 주세요."); btn.disabled = false; btn.textContent = "가입 완료하고 시작하기"; return;
        }
        wrap.remove(); resolve(true);
      };
      function fail(t) { err.textContent = t; err.className = "soco-msg bad"; }
    });
  }
  window.GALLA_openOnboard = openOnboard;

  async function ensureOnboarded() {
    if (await needsOnboard()) { await openOnboard(); }
    return true;
  }
  window.GALLA_ensureOnboarded = ensureOnboarded;

  // ── 온보딩 게이트: 로그인됐는데 미완(소셜/패스키 신규)이면 페이지 진입 시 강제 모달 ──
  async function onboardGate() {
    const path = location.pathname;
    if (/login|signup|auth-callback|reset|confirm/.test(path)) return; // 인증 흐름 페이지 제외
    let c = sb();
    for (let i = 0; i < 30 && !c; i++) { await new Promise(r => setTimeout(r, 150)); c = sb(); }
    if (!c) return;
    try {
      const { data } = await c.auth.getUser();
      if (!data?.user) return;                 // 비로그인은 게이트 없음(둘러보기 허용)
      if (await needsOnboard()) await openOnboard();
    } catch (_) {}
  }
  window.GALLA_onboardGate = onboardGate;

  document.addEventListener("DOMContentLoaded", () => {
    const host = document.querySelector("[data-social-auth]")
      || document.getElementById("loginBtn")?.parentElement
      || document.getElementById("signupBtn")?.parentElement;
    if (host) renderButtons(host);
    onboardGate();
    setupNativeAuthListener();
  });
})();
