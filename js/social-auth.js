/* 🔐 GALLA 로그인 — 구글(네이티브 Supabase OAuth) + 패스키(WebAuthn 커스텀).
   카카오는 비즈 앱 미전환으로 account_email 동의 불가(KOE205) → 제외(2026-07-24, 사장님 확정).
   패스키: passkey 엣지함수 + verifyOtp(magiclink)로 세션. login/signup/auth-callback/설정 공용. */
(function () {
  const sb = () => window.supabaseClient;
  const CALLBACK = location.origin + "/auth-callback.html";

  /* ══════════ 구글 OAuth ══════════ */
  async function signInSocial(provider) {
    const c = sb();
    if (!c) { alert("잠시 후 다시 시도해주세요."); return; }
    try {
      const { error } = await c.auth.signInWithOAuth({ provider, options: { redirectTo: CALLBACK } });
      if (error) alert(/provider/i.test(error.message) ? "이 로그인은 아직 준비 중입니다." : "로그인 실패: " + error.message);
    } catch (_) { alert("로그인 실패 — 잠시 후 다시 시도해 주세요."); }
  }
  window.GALLA_signInSocial = signInSocial;

  /* ══════════ 패스키(WebAuthn) ══════════ */
  const hasPasskey = () => !!(window.PublicKeyCredential && navigator.credentials);

  // base64url <-> ArrayBuffer
  const b64uToBuf = (s) => {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "==".slice((s.length + 3) % 4);
    const bin = atob(b64); const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u.buffer;
  };
  const bufToB64u = (buf) => {
    const u = new Uint8Array(buf); let bin = "";
    for (let i = 0; i < u.length; i++) bin += String.fromCharCode(u[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };

  async function invokePasskey(payload) {
    const c = sb();
    const { data, error } = await c.functions.invoke("passkey", { body: payload });
    if (error) throw new Error(error.message || "passkey_invoke");
    if (data?.error) throw new Error(data.error);
    return data;
  }

  // 패스키 등록(로그인 상태에서 "이 기기에 패스키 추가")
  async function passkeyRegister() {
    if (!hasPasskey()) { alert("이 브라우저는 패스키를 지원하지 않아요."); return false; }
    try {
      const { handle, options } = await invokePasskey({ action: "register-begin" });
      const pub = {
        ...options,
        challenge: b64uToBuf(options.challenge),
        user: { ...options.user, id: b64uToBuf(options.user.id) },
        excludeCredentials: (options.excludeCredentials || []).map((x) => ({ ...x, id: b64uToBuf(x.id) })),
      };
      const cred = await navigator.credentials.create({ publicKey: pub });
      const r = cred.response;
      const resp = {
        id: cred.id, rawId: bufToB64u(cred.rawId), type: cred.type,
        response: {
          clientDataJSON: bufToB64u(r.clientDataJSON),
          attestationObject: bufToB64u(r.attestationObject),
          transports: (r.getTransports && r.getTransports()) || [],
        },
        clientExtensionResults: cred.getClientExtensionResults(),
        authenticatorAttachment: cred.authenticatorAttachment || undefined,
      };
      const label = /iphone|ipad/i.test(navigator.userAgent) ? "iPhone"
        : /android/i.test(navigator.userAgent) ? "Android"
        : /mac/i.test(navigator.userAgent) ? "Mac" : "이 기기";
      await invokePasskey({ action: "register-finish", handle, response: resp, label });
      alert("패스키가 등록됐어요. 다음부턴 비번 없이 로그인할 수 있어요 🔑");
      return true;
    } catch (e) {
      if (e && e.name === "NotAllowedError") return false; // 사용자 취소
      alert("패스키 등록 실패 — " + (e?.message || "다시 시도해 주세요."));
      return false;
    }
  }
  window.GALLA_passkeyRegister = passkeyRegister;

  // 패스키 로그인(비로그인 상태)
  async function passkeyLogin() {
    if (!hasPasskey()) { alert("이 브라우저는 패스키를 지원하지 않아요."); return false; }
    const c = sb();
    try {
      const { handle, options } = await invokePasskey({ action: "login-begin" });
      const pub = {
        ...options,
        challenge: b64uToBuf(options.challenge),
        allowCredentials: (options.allowCredentials || []).map((x) => ({ ...x, id: b64uToBuf(x.id) })),
      };
      const cred = await navigator.credentials.get({ publicKey: pub });
      const r = cred.response;
      const resp = {
        id: cred.id, rawId: bufToB64u(cred.rawId), type: cred.type,
        response: {
          clientDataJSON: bufToB64u(r.clientDataJSON),
          authenticatorData: bufToB64u(r.authenticatorData),
          signature: bufToB64u(r.signature),
          userHandle: r.userHandle ? bufToB64u(r.userHandle) : undefined,
        },
        clientExtensionResults: cred.getClientExtensionResults(),
        authenticatorAttachment: cred.authenticatorAttachment || undefined,
      };
      const out = await invokePasskey({ action: "login-finish", handle, response: resp });
      if (!out?.token_hash) throw new Error("no_session");
      const { error } = await c.auth.verifyOtp({ token_hash: out.token_hash, type: "magiclink" });
      if (error) throw error;
      // 온보딩 필요하면 처리 후 홈
      try { if (await needsOnboard()) await openOnboard(); } catch (_) {}
      location.replace("index.html");
      return true;
    } catch (e) {
      if (e && e.name === "NotAllowedError") return false; // 취소/등록된 패스키 없음
      alert("패스키 로그인 실패 — " + (e?.message || "다시 시도해 주세요."));
      return false;
    }
  }
  window.GALLA_passkeyLogin = passkeyLogin;

  /* ══════════ 버튼 렌더 (login.html / signup.html) ══════════ */
  function renderButtons(host) {
    if (!host || document.querySelector(".social-auth")) return;
    const box = document.createElement("div");
    box.className = "social-auth";
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

  function openOnboard() {
    return new Promise((resolve) => {
      if (document.getElementById("soc-onboard")) return resolve(false);
      const wrap = document.createElement("div");
      wrap.id = "soc-onboard";
      wrap.className = "soc-onboard";
      wrap.innerHTML = `
        <div class="soco-card">
          <div class="soco-title">갈라에 오신 걸 환영해요 🎉</div>
          <div class="soco-sub">닉네임만 정하면 바로 시작해요</div>
          <input id="soco-nick" class="soco-input" maxlength="16" placeholder="닉네임 (2~16자)" autocomplete="off">
          <div id="soco-nickmsg" class="soco-msg"></div>
          <label class="soco-check"><input type="checkbox" id="soco-terms"><span>[필수] 만 14세 이상 · <a href="/terms.html" target="_blank">이용약관</a> · <a href="/privacy.html" target="_blank">개인정보 수집·이용</a> 동의</span></label>
          <label class="soco-check"><input type="checkbox" id="soco-mkt"><span>[선택] 마케팅 정보 수신 동의</span></label>
          <button id="soco-go" class="soco-btn" type="button">시작하기</button>
        </div>`;
      document.body.appendChild(wrap);
      const nick = wrap.querySelector("#soco-nick");
      const msg = wrap.querySelector("#soco-nickmsg");
      if (window.GALLA_bindNickCheck) window.GALLA_bindNickCheck(nick, msg);
      wrap.querySelector("#soco-go").onclick = async () => {
        const c = sb();
        const n = nick.value.trim();
        if (n.length < 2) { msg.textContent = "닉네임은 2자 이상이에요."; msg.className = "soco-msg bad"; return; }
        if (!wrap.querySelector("#soco-terms").checked) { msg.textContent = "필수 약관에 동의해 주세요."; msg.className = "soco-msg bad"; return; }
        const btn = wrap.querySelector("#soco-go"); btn.disabled = true; btn.textContent = "설정 중…";
        const { data, error } = await c.rpc("social_onboard", {
          p_nick: n, p_terms: true, p_marketing: wrap.querySelector("#soco-mkt").checked,
        });
        if (error || !data?.ok) {
          const r = data?.reason;
          msg.textContent = r === "nick_taken" ? "이미 쓰는 닉네임이에요." : r === "nick_short" ? "닉네임이 너무 짧아요." : "저장 실패 — 다시 시도해 주세요.";
          msg.className = "soco-msg bad"; btn.disabled = false; btn.textContent = "시작하기"; return;
        }
        wrap.remove(); resolve(true);
      };
    });
  }
  window.GALLA_openOnboard = openOnboard;

  async function ensureOnboarded() {
    if (await needsOnboard()) { await openOnboard(); }
    return true;
  }
  window.GALLA_ensureOnboarded = ensureOnboarded;

  document.addEventListener("DOMContentLoaded", () => {
    const host = document.querySelector("[data-social-auth]")
      || document.getElementById("loginBtn")?.parentElement
      || document.getElementById("signupBtn")?.parentElement;
    if (host) renderButtons(host);
  });
})();
