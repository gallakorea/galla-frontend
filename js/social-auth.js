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
  });
})();
