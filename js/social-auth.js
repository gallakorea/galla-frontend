/* 🔐 GALLA 로그인 — 구글(네이티브 Supabase OAuth) + 패스키(WebAuthn 커스텀).
   카카오는 비즈 앱 미전환으로 account_email 동의 불가(KOE205) → 제외(2026-07-24, 사장님 확정).
   패스키: passkey 엣지함수 + verifyOtp(magiclink)로 세션. login/signup/auth-callback/설정 공용. */
(function () {
  const sb = () => window.supabaseClient;
  const CALLBACK = location.origin + "/auth-callback.html";

  /* ══════════ 구글 OAuth ══════════ */
  // Capacitor 네이티브 앱인지 (구글 로그인을 인앱 브라우저+딥링크로 완결)
  function isNativeApp() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }
  const NATIVE_REDIRECT = "im.galla.app://auth-callback";

  // 딥링크 복귀 리스너 — OAuth 끝나고 im.galla.app://auth-callback?code=... 로 앱이 열리면 세션 확립
  let _nativeAuthListener = false;
  function setupNativeAuthListener() {
    if (_nativeAuthListener || !isNativeApp()) return;
    const App = window.Capacitor?.Plugins?.App;
    if (!App) return;
    _nativeAuthListener = true;
    App.addListener("appUrlOpen", async (event) => {
      const url = (event && event.url) || "";
      if (url.indexOf("auth-callback") < 0) return;
      try { window.Capacitor?.Plugins?.Browser?.close?.(); } catch (_) {}
      try {
        const c = sb();
        let code = null;
        try { code = new URL(url).searchParams.get("code"); } catch (_) {}
        const { error } = await c.auth.exchangeCodeForSession(code || url);
        if (error) throw error;
        try { if (await needsOnboard()) await openOnboard(); } catch (_) {}
        location.replace("index.html");
      } catch (e) {
        alert("구글 로그인 처리 실패 — " + (e?.message || "다시 시도해 주세요."));
      }
    });
  }

  async function signInSocial(provider) {
    const c = sb();
    if (!c) { alert("잠시 후 다시 시도해주세요."); return; }
    try {
      // 네이티브 앱: 인앱 브라우저로 열고 딥링크로 복귀(사파리로 안 튐)
      if (isNativeApp()) {
        setupNativeAuthListener();
        const { data, error } = await c.auth.signInWithOAuth({
          provider, options: { redirectTo: NATIVE_REDIRECT, skipBrowserRedirect: true },
        });
        if (error) throw error;
        if (data?.url) await window.Capacitor.Plugins.Browser.open({ url: data.url, presentationStyle: "popover" });
        return;
      }
      // 웹: 기존 리다이렉트
      const { error } = await c.auth.signInWithOAuth({ provider, options: { redirectTo: CALLBACK } });
      if (error) alert(/provider/i.test(error.message) ? "이 로그인은 아직 준비 중입니다." : "로그인 실패: " + error.message);
    } catch (e) { alert("로그인 실패 — " + (e?.message || "잠시 후 다시 시도해 주세요.")); }
  }
  window.GALLA_signInSocial = signInSocial;

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
    let html = '<div class="social-div"><span>간편 로그인</span></div>' +
      '<button type="button" class="soc-btn soc-google" data-act="google"><span class="soc-ic soc-g">G</span> 구글로 계속하기</button>';
    if (hasPasskey())
      html += '<button type="button" class="soc-btn soc-passkey" data-act="passkey"><span class="soc-ic">🔑</span> 패스키로 로그인</button>';
    box.innerHTML = html;
    host.appendChild(box);
    box.querySelector('[data-act="google"]').onclick = () => signInSocial("google");
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
