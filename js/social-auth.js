/* 🔐 GALLA 소셜 로그인 — 구글·카카오(네이티브 Supabase OAuth) + 네이버(엣지함수, 준비중)
   + 소셜 신규 가입자 온보딩(닉네임·약관). login/signup/auth-callback 공용.
   ⚠️ 실동작하려면 사장님이 Supabase 대시보드에 Google·Kakao provider를 켜고 키를 넣어야 함. */
(function () {
  const sb = () => window.supabaseClient;
  const CALLBACK = location.origin + "/auth-callback.html";

  /* ── OAuth 시작 ── */
  async function signInSocial(provider) {
    const c = sb();
    if (!c) { alert("잠시 후 다시 시도해주세요."); return; }
    if (provider === "naver") { alert("네이버 로그인은 곧 열립니다. 지금은 카카오·구글로 로그인해 주세요."); return; }
    try {
      const { error } = await c.auth.signInWithOAuth({
        provider,               // 'google' | 'kakao'
        options: { redirectTo: CALLBACK },
      });
      if (error) {
        // provider 미설정 시 여기로 — 사장님 대시보드 설정 전이면 안내
        alert(/provider/i.test(error.message)
          ? "이 소셜 로그인은 아직 준비 중입니다."
          : "로그인 실패: " + error.message);
      }
    } catch (_) { alert("로그인 실패 — 잠시 후 다시 시도해 주세요."); }
  }
  window.GALLA_signInSocial = signInSocial;

  /* ── 버튼 렌더 (login.html / signup.html 하단) ── */
  function renderButtons(host) {
    if (!host || document.querySelector(".social-auth")) return;
    const box = document.createElement("div");
    box.className = "social-auth";
    box.innerHTML =
      '<div class="social-div"><span>간편 로그인</span></div>' +
      '<button type="button" class="soc-btn soc-kakao" data-p="kakao"><span class="soc-ic">💬</span> 카카오로 계속하기</button>' +
      '<button type="button" class="soc-btn soc-google" data-p="google"><span class="soc-ic soc-g">G</span> 구글로 계속하기</button>' +
      '<button type="button" class="soc-btn soc-naver" data-p="naver"><span class="soc-ic soc-n">N</span> 네이버로 계속하기</button>';
    host.appendChild(box);
    box.querySelectorAll(".soc-btn").forEach(b => b.onclick = () => signInSocial(b.dataset.p));
  }
  window.GALLA_renderSocialButtons = renderButtons;

  /* ── 온보딩 게이트: 로그인됐는데 닉네임 없으면(=소셜 신규) 닉네임·약관 받기 ── */
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
      // 실시간 닉 확인(기존 유틸 있으면 재사용)
      if (window.GALLA_bindNickCheck) window.GALLA_bindNickCheck(nick, msg);
      wrap.querySelector("#soco-go").onclick = async () => {
        const c = sb();
        const n = nick.value.trim();
        if (n.length < 2) { msg.textContent = "닉네임은 2자 이상이에요."; msg.className = "soco-msg bad"; return; }
        if (!wrap.querySelector("#soco-terms").checked) { msg.textContent = "필수 약관에 동의해 주세요."; msg.className = "soco-msg bad"; return; }
        const btn = wrap.querySelector("#soco-go"); btn.disabled = true; btn.textContent = "설정 중…";
        const { data, error } = await c.rpc("social_onboard", {
          p_nick: n, p_terms: true,
          p_marketing: wrap.querySelector("#soco-mkt").checked,
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

  /* 로그인 상태에서 필요 시 온보딩 강제 후 콜백 */
  async function ensureOnboarded() {
    if (await needsOnboard()) { await openOnboard(); }
    return true;
  }
  window.GALLA_ensureOnboarded = ensureOnboarded;

  // login/signup 페이지면 버튼 자동 렌더
  document.addEventListener("DOMContentLoaded", () => {
    const host = document.querySelector("[data-social-auth]")
      || document.getElementById("loginBtn")?.parentElement
      || document.getElementById("signupBtn")?.parentElement;
    if (host) renderButtons(host);
  });
})();
