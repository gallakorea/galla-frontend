/* =========================================================
   📝 가입 위저드 — 타입폼식 '한 화면 한 질문'
   ---------------------------------------------------------
   · 기존 signup.js·nickname-check.js·약관 스크립트는 그대로 둔다
     (같은 ID의 입력을 쓰므로 검증·제출 로직 무손상)
   · 이 파일은 화면 전환만 담당: 진행바, 스텝 검증, Enter/칩 자동 진행
   ========================================================= */
(function () {
  const track = document.getElementById("swTrack");
  if (!track) return;
  const steps = [...track.querySelectorAll(".sw-step")];
  const fill = document.getElementById("swFill");
  const count = document.getElementById("swCount");
  const foot = document.getElementById("swFoot");
  const nextBtn = document.getElementById("swNext");
  const backBtn = document.getElementById("swBack");
  let cur = 0;

  const $ = (id) => document.getElementById(id);
  const hintEl = (id, msg, ok) => {
    const el = $(id); if (!el) return;
    el.textContent = msg || ""; el.className = "pw-hint" + (msg ? (ok ? " ok" : " no") : "");
  };

  /* ── 스텝별 통과 조건 — 막히면 이유를 그 자리에서 말해준다 ── */
  const CHECKS = {
    async email() {
      const v = $("email").value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { hintEl("emailHint", "✕ 이메일 형식을 확인해주세요", false); return false; }
      /* 중복은 이 자리에서 바로 — 마지막 제출까지 갔다가 '이미 가입됨'으로 튕기면 최악의 이탈 */
      try {
        hintEl("emailHint", "확인 중…", true);
        const { data: ea } = await window.supabaseClient.rpc("email_available", { p_email: v });
        if (ea && !ea.ok) {
          if (ea.reason === "taken") {
            hintEl("emailHint", "✕ 이미 가입된 이메일이에요 — 로그인해 주세요", false);
            const h = $("emailHint");
            if (h && !h.querySelector("a")) h.insertAdjacentHTML("beforeend",
              ' <a href="login.html" style="color:#9daaff;font-weight:800">로그인 →</a>');
          } else hintEl("emailHint", "✕ 이메일 형식을 확인해주세요", false);
          return false;
        }
      } catch (_) { /* 확인 실패 시 진행 — signUp이 최종 방어 */ }
      hintEl("emailHint", "✓ 사용할 수 있는 이메일이에요", true); return true;
    },
    password() {
      const a = $("password").value, b = $("password2").value;
      if (a.length < 6) { hintEl("pwHint", "✕ 비밀번호는 6자 이상이어야 해요 (8자 이상 권장)", false); return false; }
      if (a !== b) { hintEl("pwHint", "✕ 비밀번호가 일치하지 않습니다", false); return false; }
      return true;
    },
    async nickname() {
      const v = $("nickname").value.trim();
      if (v.length < 2) { alert("닉네임은 2자 이상으로 지어주세요."); return false; }
      try {
        const { data: nk } = await window.supabaseClient.rpc("nickname_available", { p_nick: v });
        if (nk && !nk.ok) {
          alert({ length: "닉네임은 2~12자로 지어주세요", charset: "닉네임엔 한글·영문·숫자와 _ . - 만 쓸 수 있어요",
                  reserved: "사용할 수 없는 닉네임이에요", taken: "이미 누군가 쓰고 있는 닉네임이에요" }[nk.reason] || "닉네임을 다시 확인해주세요");
          return false;
        }
      } catch (_) { /* 서버 제약이 최종 방어 */ }
      return true;
    },
    birth() {
      const a = window.GALLA_ageFromBirth?.($("birthdate").value);
      if (a === null || a === undefined) { hintEl("ageHint", "✕ 생년월일을 입력해주세요", false); return false; }
      if (a < 14) return false; // 힌트는 기존 스크립트가 이미 표시
      return true;
    },
    gender() {
      if (!document.querySelector(".gender-chip.active")) { alert("성별을 선택해주세요. (여론 통계에 필요해요)"); return false; }
      return true;
    },
    region() {
      if (!document.querySelector(".region-chip.active:not(.gender-chip)")) { alert("사는 지역을 선택해주세요. (여론 통계에 필요해요)"); return false; }
      return true;
    },
    phone() { return true; },  // 선택 항목
    agree() { return true; },  // 제출은 signup.js의 #signupBtn이 검증
  };

  function paint() {
    steps.forEach((s, i) => {
      s.classList.toggle("on", i === cur);
      s.classList.toggle("done", i < cur);
    });
    fill.style.width = ((cur + 1) / steps.length * 100) + "%";
    count.textContent = (cur + 1) + "/" + steps.length;
    const last = cur === steps.length - 1;
    foot.classList.toggle("hide", last);
    nextBtn.textContent = "다음";
    updateNextState();
    // 입력 스텝이면 전환이 끝난 뒤 포커스 (즉시 하면 슬라이드가 끊긴다)
    const inp = steps[cur].querySelector(".sw-input");
    if (inp && steps[cur].dataset.step !== "birth") setTimeout(() => { try { inp.focus({ preventScroll: true }); } catch (_) {} }, 260);
  }

  /* 필수 스텝: 최소 입력 전엔 '다음'을 잠근다 — 넘어갈 수 없음이 눈에 보이게.
     선택 스텝(phone)은 입력해야 '다음'이 열리고, 건너뛰기는 아래 보조 링크로만. */
  const FILLED = {
    email: () => $("email").value.trim().length > 3,
    password: () => $("password").value.length >= 6 && $("password2").value.length >= 6,
    nickname: () => $("nickname").value.trim().length >= 2,
    birth: () => !!$("birthdate").value,
    gender: () => !!document.querySelector(".gender-chip.active"),
    region: () => !!document.querySelector(".region-chip.active:not(.gender-chip)"),
    phone: () => $("phone").value.trim().length >= 9,
    agree: () => true,
  };
  function updateNextState() {
    const key = steps[cur].dataset.step;
    nextBtn.disabled = !(FILLED[key] ? FILLED[key]() : true);
  }
  track.addEventListener("input", updateNextState);
  track.addEventListener("change", updateNextState);

  async function next() {
    const key = steps[cur].dataset.step;
    nextBtn.disabled = true;
    const ok = await CHECKS[key]();
    if (!ok) { updateNextState(); return; }
    if (cur < steps.length - 1) { cur++; paint(); try { navigator.vibrate?.(6); } catch (_) {} }
  }
  function prev() {
    if (cur === 0) {
      /* 첫 스텝의 뒤로가기: location.href="login.html"로 새 페이지를 밀면
         history가 쌓여 로그인↔가입 무한 핑퐁이 된다(사장님 재현).
         온 곳으로 되돌아가는 history.back()이 정답 — 이력이 없으면 로그인으로. */
      if (window.GALLA_back) window.GALLA_back("login.html");
      else if (history.length > 1) history.back();
      else location.href = "login.html";
      return;
    }
    cur--; paint();
  }

  nextBtn.addEventListener("click", next);
  backBtn.addEventListener("click", prev);

  // Enter로 다음 (비밀번호 확인칸 전엔 다음 칸으로)
  track.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (e.target.id === "password") { $("password2").focus(); return; }
    next();
  });

  // 칩(성별·지역)은 고르는 순간 자동으로 다음 — 타입폼의 맛
  track.addEventListener("click", (e) => {
    const chip = e.target.closest(".region-chip");
    if (!chip) return;
    setTimeout(() => { if (CHECKS[steps[cur].dataset.step]()) { if (cur < steps.length - 1) { cur++; paint(); } } }, 220);
  });

  // 선택 스텝의 보조 스킵 — 눈에 덜 띄는 링크로만 건너뛴다
  $("swSkipPhone")?.addEventListener("click", () => {
    if (steps[cur].dataset.step !== "phone") return;
    cur++; paint();
  });

  paint();
})();
