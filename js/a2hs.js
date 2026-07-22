/* =========================================================
   📲 홈 화면에 추가 유도 (Add to Home Screen)
   - 이미 설치(홈화면 실행=standalone)면 절대 안 뜸
   - 안드로이드: appinstalled 이벤트로 영구 차단 + 네이티브 설치 프롬프트
   - iOS: 공유→홈화면 추가 안내(네이티브 프롬프트 없음)
   - 첫 방문엔 안 뜨고 2회차부터, 닫으면 30일 쿨다운, "추가함" 표시 시 영구 차단
   ========================================================= */
(function () {
  // 1) 이미 홈화면 앱/네이티브 앱으로 실행 중이면 끝 — 다신 안 뜸.
  //    ⚠️ Capacitor 앱 웹뷰는 display-mode가 'browser'라 standalone만 보면 앱 안에서도
  //    '앱으로 깔면 편해요' 배너가 떴다(사장님 에뮬레이터 QA에서 발견).
  //    → GallaApp UA(=네이티브 앱)·GALLA_isApp도 함께 검사.
  const isNativeApp = /GallaApp/i.test(navigator.userAgent) ||
    (typeof window.GALLA_isApp === "function" && window.GALLA_isApp()) ||
    !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const standalone = window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true || isNativeApp;
  if (standalone) return;

  const KEY = "galla_a2hs";
  let st = {};
  try { st = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };
  st.visits = (st.visits || 0) + 1;
  save();

  if (st.installed) return;                                         // 추가함 표시 → 영구 차단
  if (st.dismissedUntil && Date.now() < st.dismissedUntil) return;  // 쿨다운 중
  if (st.visits < 2) return;                                        // 첫 방문엔 안 띄움(자연스럽게 2회차부터)

  const ua = navigator.userAgent;
  const isIOS = /iP(hone|ad|od)/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  const isAndroid = /Android/.test(ua);
  if (!isIOS && !isAndroid) return;   // 데스크톱 등은 스킵

  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredPrompt = e; });
  // nav.js의 공용 캡처가 먼저 잡은 경우에도 설치가 되게 (둘 다 같은 이벤트를 받는다)
  window.addEventListener("appinstalled", () => { st.installed = true; save(); close(); });

  function css() {
    if (document.getElementById("a2hs-css")) return;
    const s = document.createElement("style"); s.id = "a2hs-css";
    s.textContent = `
      .a2hs-bar{position:fixed;left:10px;right:10px;bottom:calc(10px + env(safe-area-inset-bottom,0px));z-index:2147483300;
        display:flex;align-items:center;gap:12px;padding:12px 12px 12px 14px;
        background:linear-gradient(180deg,#191b22,#111319);border:1px solid rgba(255,255,255,.12);
        border-radius:18px;box-shadow:0 18px 50px rgba(0,0,0,.55);max-width:520px;margin:0 auto;
        transform:translateY(140%);transition:transform .32s cubic-bezier(.2,.9,.3,1)}
      .a2hs-bar.open{transform:translateY(0)}
      .a2hs-ic{flex:0 0 auto;width:44px;height:44px;border-radius:12px;object-fit:cover;background:#000}
      .a2hs-tx{flex:1;min-width:0}
      .a2hs-tt{font-size:14px;font-weight:900;color:#f3f4f6}
      .a2hs-sb{font-size:12px;color:#a4abb8;margin-top:2px;line-height:1.4}
      .a2hs-go{flex:0 0 auto;border:none;border-radius:12px;padding:10px 15px;font-weight:900;font-size:13.5px;cursor:pointer;
        background:linear-gradient(135deg,#6a7bff,#3a5bff);color:#fff}
      .a2hs-x{flex:0 0 auto;border:none;background:none;color:#8a8f9a;font-size:20px;cursor:pointer;padding:2px 4px;line-height:1}
      /* iOS 안내 오버레이 */
      .a2hs-dim{position:fixed;inset:0;z-index:2147483310;background:rgba(0,0,0,.6);backdrop-filter:blur(4px);
        display:flex;align-items:flex-end;justify-content:center;opacity:0;transition:opacity .2s;padding:0 0 max(18px,env(safe-area-inset-bottom))}
      .a2hs-dim.open{opacity:1}
      .a2hs-guide{width:100%;max-width:440px;background:#15161d;border:1px solid rgba(255,255,255,.12);
        border-radius:20px;margin:0 12px;padding:20px}
      .a2hs-guide h4{font-size:16px;font-weight:900;color:#fff;margin:0 0 4px;text-align:center}
      .a2hs-guide p{font-size:12.5px;color:#a4abb8;text-align:center;margin:0 0 16px}
      .a2hs-step{display:flex;align-items:center;gap:12px;padding:11px 12px;background:#0f1116;border-radius:12px;margin-bottom:8px}
      .a2hs-step .n{flex:0 0 auto;width:24px;height:24px;border-radius:50%;background:#3a5bff;color:#fff;font-weight:900;font-size:13px;display:flex;align-items:center;justify-content:center}
      .a2hs-step .t{font-size:13.5px;color:#e7ebf3}.a2hs-step .t b{color:#fff}
      .a2hs-share{display:inline-flex;vertical-align:middle;width:18px;height:18px;margin:0 2px}
      .a2hs-close2{width:100%;margin-top:10px;padding:13px;border:none;border-radius:12px;background:rgba(255,255,255,.07);color:#c9d1e0;font-weight:800;font-size:14px;cursor:pointer}
    `;
    document.head.appendChild(s);
  }

  let bar = null;
  function cooldown(days) { st.dismissedUntil = Date.now() + days * 864e5; save(); }
  function close() { bar?.classList.remove("open"); }

  function show() {
    css();
    bar = document.createElement("div"); bar.className = "a2hs-bar";
    bar.innerHTML = `
      <img class="a2hs-ic" src="/assets/app-icons/icon-192.png" alt="갈라" onerror="this.style.display='none'">
      <div class="a2hs-tx">
        <div class="a2hs-tt">앱으로 깔면 훨씬 편해요</div>
        <div class="a2hs-sb">삐삐·메시지 알림 바로 받고, 마이크 허용도 한 번만. 로그인 유지 + 전체 화면</div>
      </div>
      <button class="a2hs-go" id="a2hs-go">추가</button>
      <button class="a2hs-x" id="a2hs-x" aria-label="닫기">✕</button>`;
    document.body.appendChild(bar);
    bar.querySelector("#a2hs-x").addEventListener("click", () => { cooldown(30); close(); });
    bar.querySelector("#a2hs-go").addEventListener("click", onAdd);
    requestAnimationFrame(() => bar.classList.add("open"));
  }

  async function onAdd() {
    if (isAndroid && (deferredPrompt || window.GALLA_canInstall?.())) {
      close();
      if (!deferredPrompt) {                       // nav.js 공용 캡처가 잡은 경우
        const outcome = await window.GALLA_promptInstall();
        if (outcome === "accepted") { st.installed = true; save(); } else { cooldown(30); }
        return;
      }
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") { st.installed = true; save(); } else { cooldown(30); }
      deferredPrompt = null;
      return;
    }
    // iOS(또는 프롬프트 미지원): 공유→홈화면 추가 안내
    iosGuide();
  }

  function iosGuide() {
    close();
    const dim = document.createElement("div"); dim.className = "a2hs-dim";
    const shareSvg = '<svg class="a2hs-share" viewBox="0 0 24 24" fill="none" stroke="#3a5bff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4"/><path d="M8 8l4-4 4 4"/><path d="M4 14v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/></svg>';
    dim.innerHTML = `
      <div class="a2hs-guide">
        <h4>📲 홈 화면에 추가하는 법</h4>
        <p>3초면 끝나요 · 로그인이 계속 유지됩니다</p>
        <div class="a2hs-step"><span class="n">1</span><span class="t">사파리 하단의 <b>공유 버튼</b> ${shareSvg} 을 누르세요</span></div>
        <div class="a2hs-step"><span class="n">2</span><span class="t"><b>‘홈 화면에 추가’</b> 를 선택하세요</span></div>
        <div class="a2hs-step"><span class="n">3</span><span class="t">오른쪽 위 <b>‘추가’</b> 를 누르면 완료!</span></div>
        <button class="a2hs-close2" id="a2hs-done">알겠어요</button>
      </div>`;
    document.body.appendChild(dim);
    const finish = () => { st.installed = true; save(); dim.classList.remove("open"); setTimeout(() => dim.remove(), 200); };
    dim.addEventListener("click", (e) => { if (e.target === dim) finish(); });
    dim.querySelector("#a2hs-done").addEventListener("click", finish);
    requestAnimationFrame(() => dim.classList.add("open"));
  }

  // 자연스럽게 — 5초 뒤 슬라이드업
  setTimeout(() => { if (document.body) show(); }, 5000);
})();
