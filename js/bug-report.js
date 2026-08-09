/* =========================================================
   🐞 버그 신고 — 전역 모달 window.GALLA_openBugReport()
   - 익명·로그인 모두 제출(submit_bug RPC, user_id 자동)
   - 현재 페이지·기기·뷰포트·앱버전 자동 첨부
   ========================================================= */
(function () {
  const APPV = (function () {
    const s = [...document.scripts].map((x) => x.src).find((u) => /[?&]v=/.test(u));
    return s ? ((s.match(/[?&]v=([^&]+)/) || [])[1] || "") : "";
  })();
  const sb = () => window.supabaseClient || (window.supabase && window.supabase.from ? window.supabase : null);

  function toast(msg) {
    try { if (window.GALLA_t) msg = window.GALLA_t(msg); } catch (e) {}   // 🌍 문구만 통과
    let t = document.getElementById("bugr-toast");
    if (!t) { t = document.createElement("div"); t.id = "bugr-toast"; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show");
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 2600);
  }

  function css() {
    if (document.getElementById("bugr-css")) return;
    const s = document.createElement("style"); s.id = "bugr-css";
    s.textContent =
      // 🐞 전체화면 페이지(모달 아님) — 우→좌 슬라이드 인, 상단 뒤로가기 헤더
      ".bugr-dim{position:fixed;inset:0;z-index:2147483400;background:#0a0a0b;display:flex;flex-direction:column;transform:translateX(100%);transition:transform .26s cubic-bezier(.2,.9,.3,1)}" +
      ".bugr-dim.open{transform:none}" +
      // 라우터 스택 뷰로 열릴 때: 자체 fixed/transform 끄고 스택 레이어(.stack-view=position:absolute inset:0)를 채운다.
      ".bugr-dim.in-stack{position:absolute;transform:none;transition:none}" +
      ".bugr-head{display:flex;align-items:center;gap:4px;height:calc(52px + env(safe-area-inset-top));padding:env(safe-area-inset-top) 12px 0 4px;border-bottom:1px solid rgba(255,255,255,.08);background:rgba(10,10,11,.92);backdrop-filter:blur(10px);flex:0 0 auto}" +
      ".bugr-back{width:40px;height:40px;display:flex;align-items:center;justify-content:center;background:none;border:none;cursor:pointer;color:#fff;padding:0}" +
      ".bugr-back svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}" +
      ".bugr-htt{font-size:16px;font-weight:900;color:#f3f4f6}" +
      ".bugr-card{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;width:100%;max-width:520px;margin:0 auto;box-sizing:border-box;padding:18px 16px calc(28px + env(safe-area-inset-bottom))}" +
      ".bugr-tt{font-size:17px;font-weight:900;color:#f3f4f6;display:flex;align-items:center;gap:7px}" +
      ".bugr-sb{font-size:12.5px;color:#9aa0ad;margin:5px 0 14px;line-height:1.5}" +
      ".bugr-ta{width:100%;box-sizing:border-box;min-height:120px;resize:vertical;background:#0e0f13;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:12px;color:#f3f4f6;font-size:14px;line-height:1.5;font-family:inherit}" +
      ".bugr-ta:focus{outline:none;border-color:#6f86ff}" +
      ".bugr-ctx{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 2px}" +
      ".bugr-chip{font-size:11px;color:#9aa0ad;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:99px;padding:3px 9px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      ".bugr-btns{display:flex;gap:8px;margin-top:14px}" +
      ".bugr-btns button{flex:1;padding:13px;border:none;border-radius:12px;font-weight:800;font-size:14px;cursor:pointer}" +
      ".bugr-cancel{background:rgba(255,255,255,.07);color:#c9d1e0}" +
      ".bugr-go{background:linear-gradient(135deg,#6a7bff,#3a5bff);color:#fff}" +
      ".bugr-go:disabled{opacity:.5}" +
      "#bugr-toast{position:fixed;left:50%;bottom:90px;transform:translateX(-50%) translateY(10px);z-index:2147483500;background:#16171c;border:1px solid rgba(255,255,255,.12);color:#eef0f4;font-weight:800;font-size:13px;padding:11px 18px;border-radius:99px;box-shadow:0 8px 30px rgba(0,0,0,.5);opacity:0;pointer-events:none;transition:opacity .2s,transform .2s}" +
      "#bugr-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}" +
      ".bugr-chip.err{color:#ffcf4d;border-color:rgba(255,207,77,.35);background:rgba(255,207,77,.1)}" +
      // 흔들기 확인 · 오류 알림 공용 바 (하단 네비 위에 뜬다)
      "#bugr-shake{position:fixed;left:12px;right:12px;bottom:calc(84px + env(safe-area-inset-bottom));" +
        "z-index:2147483450;display:flex;align-items:center;gap:8px;max-width:460px;margin:0 auto;" +
        "background:#16171d;border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:10px 12px;" +
        "box-shadow:0 12px 34px rgba(0,0,0,.55);opacity:0;transform:translateY(12px);" +
        "transition:opacity .2s,transform .2s}" +
      "#bugr-shake.show{opacity:1;transform:none}" +
      "#bugr-shake span{flex:1;min-width:0;font-size:13px;font-weight:800;color:#eef0f4;" +
        "overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      "#bugr-shake button{flex:0 0 auto;padding:8px 12px;border:none;border-radius:9px;cursor:pointer;" +
        "font-size:12.5px;font-weight:900;color:#fff;background:linear-gradient(135deg,#6a7bff,#3a5bff)}" +
      "#bugr-shake button.no{padding:8px 10px;background:rgba(255,255,255,.07);color:#9aa0ad;font-weight:700}" +
      "@media (prefers-reduced-motion:reduce){#bugr-shake{transition:none}}";
    document.head.appendChild(s);
  }

  /* 최근 발생한 JS 오류를 기억해 둔다 — 사용자가 "안 돼요"라고만 적어도
     실제 스택이 함께 가면 원인 추적이 비교할 수 없이 빨라진다. */
  let LAST_ERR = null;
  function noteError(kind, msg, extra) {
    LAST_ERR = { kind, msg: String(msg || "").slice(0, 300), extra: String(extra || "").slice(0, 300), at: Date.now() };
  }
  window.addEventListener("error", (e) => {
    if (e.message) noteError("js", e.message, (e.filename || "") + ":" + (e.lineno || ""));
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    noteError("promise", (r && (r.message || r.error_description)) || r, r && r.stack);
  });
  // 다른 코드가 "이 오류를 신고에 붙여줘"라고 알릴 수 있는 통로
  window.GALLA_noteError = (msg, extra) => noteError("manual", msg, extra);

  window.GALLA_openBugReport = function (prefillPage) {
    if (document.querySelector(".bugr-dim")) return;   // 흔들다 두 장 겹치는 것 방지
    css();
    const page = prefillPage || location.href;
    const dev = (navigator.userAgent.match(/(iPhone|iPad|Android|Macintosh|Windows)[^);]*/) || ["기기정보"])[0];
    // 최근 2분 안의 오류만 유효 — 한참 전 오류를 엉뚱한 신고에 붙이면 오히려 수사를 망친다
    const err = LAST_ERR && (Date.now() - LAST_ERR.at < 120000) ? LAST_ERR : null;
    const dim = document.createElement("div"); dim.className = "bugr-dim";
    dim.innerHTML =
      '<div class="bugr-head">' +
        '<button class="bugr-back" type="button" aria-label="뒤로"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>' +
        '<span class="bugr-htt">🐞 버그 신고</span>' +
      '</div>' +
      '<div class="bugr-card" role="region">' +
      '<div class="bugr-sb">불편했던 점이나 오류를 알려주세요. 어디서 무엇을 하다 생겼는지 적어주시면 큰 도움이 됩니다.</div>' +
      '<textarea class="bugr-ta" placeholder="예) 광장에서 글을 열었더니 화면이 깨졌어요. / 예측 공유 버튼이 안 눌려요."></textarea>' +
      '<div class="bugr-ctx">' +
      '<span class="bugr-chip">📍 ' + page.replace(/^https?:\/\//, "").slice(0, 60) + '</span>' +
      '<span class="bugr-chip">📱 ' + dev.slice(0, 40) + '</span>' +
      '<span class="bugr-chip">🖥 ' + window.innerWidth + '×' + window.innerHeight + '</span>' +
      (err ? '<span class="bugr-chip err">⚠️ 오류 기록 자동 첨부</span>' : "") +
      '</div>' +
      '<div class="bugr-btns">' +
      '<button class="bugr-go" type="button">신고 보내기</button>' +
      '</div></div>';
    document.body.appendChild(dim);
    const ta = dim.querySelector(".bugr-ta"), go = dim.querySelector(".bugr-go");
    const isSpa = !!(window.GALLA_SPA && window.GALLA_SPA.pushView && document.body && document.body.dataset.page === "spa");

    // 🖐 엣지 스와이프로 닫기(웹 MPA 전용 — SPA는 라우터 스택이 담당)
    function armSwipe(el, closeFn) {
      let sx = 0, sy = 0, dx = 0, lock = null, lastX = 0, lastT = 0, vel = 0;
      el.addEventListener("touchstart", (e) => {
        const t = e.touches[0];
        if (t.clientX > 28) { lock = "no"; return; }
        sx = lastX = t.clientX; sy = t.clientY; dx = 0; vel = 0; lock = null; lastT = performance.now();
      }, { passive: true });
      el.addEventListener("touchmove", (e) => {
        if (lock === "no") return;
        const t = e.touches[0], mx = t.clientX - sx, my = t.clientY - sy;
        if (lock === null) {
          if (Math.abs(mx) < 6 && Math.abs(my) < 6) return;
          lock = (mx > 0 && Math.abs(mx) > Math.abs(my) * 1.2) ? "h" : "no";
          if (lock === "no") return;
          el.style.transition = "none";
        }
        dx = Math.max(0, mx);
        const now = performance.now();
        vel = (t.clientX - lastX) / Math.max(1, now - lastT); lastX = t.clientX; lastT = now;
        el.style.transform = "translateX(" + dx + "px)";
      }, { passive: true });
      el.addEventListener("touchend", () => {
        if (lock !== "h") { lock = null; return; }
        lock = null; el.style.transition = "";
        if (dx > window.innerWidth * 0.32 || vel > 0.45) { el.style.transform = "translateX(100%)"; closeFn(); }
        else { el.style.transform = ""; }
      }, { passive: true });
    }

    let close;
    if (isSpa) {
      // 🚀 라우터 스택 뷰로 — 슬라이드 인/아웃·엣지스와이프·뒤로가기(pop)를 전부 라우터가 담당(다른 페이지와 동일).
      //    dim의 자체 fixed/transform은 끄고(.in-stack) 스택 레이어를 채운다.
      dim.classList.add("in-stack");
      const closeStack = window.GALLA_SPA.pushView(dim, { name: "bug", onPop: () => { try { dim.remove(); } catch (_) {} } });
      close = () => closeStack();
      setTimeout(() => { try { ta.focus(); } catch (_) {} }, 340);
    } else {
      // 웹 MPA — 자체 오버레이(fixed) + 슬라이드/스와이프.
      close = () => { dim.classList.remove("open"); setTimeout(() => dim.remove(), 240); };
      void dim.offsetWidth;                       // 리플로우 강제 → 초기 transform 적용 후 .open 전환(슬라이드 뜸)
      requestAnimationFrame(() => { dim.classList.add("open"); setTimeout(() => { try { ta.focus(); } catch (_) {} }, 260); });
      armSwipe(dim, close);
    }
    dim.querySelector(".bugr-back").addEventListener("click", () => close());
    go.addEventListener("click", async () => {
      const msg = ta.value.trim();
      if (msg.length < 4) { ta.focus(); toast("조금만 더 자세히 적어주세요"); return; }
      go.disabled = true; go.textContent = "보내는 중…";
      try {
        const c = sb();
        if (!c) throw new Error("no client");
        // 오류 기록은 본문 끝에 붙인다 — bug_reports에 전용 컬럼이 없고, 컬럼을 새로 파는 것보다
        // 관리자가 신고를 읽을 때 한눈에 같이 보이는 편이 실제로 더 쓸모 있다.
        const body = err
          ? msg + "\n\n---\n[자동 첨부] " + err.kind + ": " + err.msg + (err.extra ? "\n" + err.extra : "")
          : msg;
        const { error } = await c.rpc("submit_bug", {
          p_message: body, p_page_url: page, p_user_agent: navigator.userAgent,
          p_viewport: window.innerWidth + "x" + window.innerHeight, p_app_version: APPV,
        });
        if (error) throw error;
        close(); toast("신고 접수됐어요. 감사합니다! 🙏");
      } catch (e) {
        go.disabled = false; go.textContent = "신고 보내기";
        toast("전송 실패 — 잠시 후 다시 시도해주세요");
      }
    });
  };

  /* ─────────────────────────────────────────────────────────
     📳 흔들면 신고 — 버그를 만난 그 화면에서 바로 열린다.
     설정까지 걸어가야 했던 게 접수 0건의 주원인이었다. 여기서 열면 자동 첨부되는
     '어느 페이지' 정보도 설정 화면이 아니라 진짜 문제의 화면이 잡힌다.
     ───────────────────────────────────────────────────────── */
  const SHAKE_G = 22;        // 가속도 임계 — 주머니 속 걸음걸이로는 안 걸리는 값
  const SHAKE_HITS = 3;      // 연속 3회 흔들어야(오작동 방지)
  const SHAKE_WINDOW = 1200; // 1.2초 안에
  let hits = [], lastShake = 0;

  function onMotion(e) {
    const a = e.accelerationIncludingGravity;
    if (!a) return;
    const g = Math.sqrt((a.x || 0) ** 2 + (a.y || 0) ** 2 + (a.z || 0) ** 2);
    if (g < SHAKE_G) return;
    const now = Date.now();
    hits = hits.filter((t) => now - t < SHAKE_WINDOW);
    hits.push(now);
    if (hits.length < SHAKE_HITS) return;
    if (now - lastShake < 3000) return;          // 한 번 열고 나면 잠시 쉰다
    hits = []; lastShake = now;
    if (document.querySelector(".bugr-dim")) return;
    try { window.BattleFX && window.BattleFX.haptic && window.BattleFX.haptic("warn"); } catch (e2) {}
    askShake();
  }

  // 흔들자마자 신고창을 띄우면 실수로 흔든 사람에게 성가시다 → 한 단계 확인을 둔다
  function askShake() {
    css();
    const t = document.createElement("div");
    t.id = "bugr-shake";
    t.innerHTML = '<span>😵 문제가 있었나요?</span><button type="button">🐞 신고하기</button>' +
                  '<button type="button" class="no" aria-label="닫기">✕</button>';
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add("show"));
    const kill = () => { t.classList.remove("show"); setTimeout(() => t.remove(), 200); };
    const bs = t.querySelectorAll("button");
    bs[0].onclick = () => { kill(); window.GALLA_openBugReport(); };
    bs[1].onclick = kill;
    setTimeout(kill, 6000);
  }

  // iOS 13+는 사용자 제스처 안에서 권한을 요청해야 한다. 설정에서 켤 때만 물어보고,
  // 그 외에는 조용히 붙인다(Android·구형 iOS는 권한 개념이 없다).
  function enableShake() {
    if (window.__bugrShakeOn) return;
    window.__bugrShakeOn = true;
    window.addEventListener("devicemotion", onMotion);
  }
  window.GALLA_enableShakeReport = function () {
    const D = window.DeviceMotionEvent;
    if (D && typeof D.requestPermission === "function") {
      return D.requestPermission().then((r) => {
        if (r === "granted") { enableShake(); return true; }
        return false;
      }).catch(() => false);
    }
    enableShake();
    return Promise.resolve(true);
  };
  // 모든 페이지에서 로드 즉시 리스너를 붙인다.
  //   · 안드로이드/구형 iOS: 권한 개념이 없어 바로 동작.
  //   · iOS 13+: 권한이 나기 전엔 이벤트가 안 와서 무해하고, 설정에서 한 번 허용하면
  //     권한이 오리진에 유지되므로 이후 '모든 페이지'에서 흔들기가 동작한다.
  //     (기존엔 권한 필요 기기에서 리스너를 안 붙여, 설정 켠 페이지 말고는 흔들어도 무반응이었다.)
  enableShake();

  /* ─────────────────────────────────────────────────────────
     ⚠️ 오류 알림 + 신고 버튼 — window.GALLA_errorToast(메시지, 원인)
     기존 실패 안내는 대부분 네이티브 alert()이라 버튼을 붙일 수 없다.
     이 유틸로 바꿔 부르면 '신고' 버튼이 함께 뜨고 원인이 자동 첨부된다.
     ───────────────────────────────────────────────────────── */
  window.GALLA_errorToast = function (message, cause) {
    css();
    if (cause) noteError("manual", message, typeof cause === "string" ? cause : (cause && cause.message));
    const t = document.createElement("div");
    t.id = "bugr-shake";
    t.innerHTML = '<span>⚠️ ' + String(message || "문제가 발생했어요").slice(0, 60) + "</span>" +
                  '<button type="button">🐞 신고</button><button type="button" class="no" aria-label="닫기">✕</button>';
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add("show"));
    const kill = () => { t.classList.remove("show"); setTimeout(() => t.remove(), 200); };
    const bs = t.querySelectorAll("button");
    bs[0].onclick = () => { kill(); window.GALLA_openBugReport(); };
    bs[1].onclick = kill;
    setTimeout(kill, 8000);
  };
})();
