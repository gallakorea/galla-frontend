/* 🚪 로그아웃 흐름 — 네이티브 alert 폐지, 우리 톤 팝업.
   · 만류는 하되 나가는 길은 앱·웹 모두 연다.
   · 웹: 만류(머무르기 강조 / 로그아웃 약하게) → 로그아웃 시 "또 오세요" 인사 후 이동.
   window.GALLA_logout()

   ⚠️ 2026-09-06 이전엔 앱에서 isApp() 이면 팝업만 띄우고 return 해 signOut 에 닿지도 못했다
   ("인스타처럼 로그아웃 없음"). 전제가 틀렸고(인스타에도 있다) 결과가 나빴다 —
   계정 전환이 불가능하고, 기기를 공유하면 남의 계정에서 빠져나올 방법이 없었다.
   스토어 심사에서도 계정 관리 부재로 걸릴 수 있는 자리다. 앱도 같은 흐름을 탄다. */
(function () {

  function css() {
    if (document.getElementById("lo-css")) return;
    var s = document.createElement("style"); s.id = "lo-css";
    s.textContent =
      ".lo-dim{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:24px;" +
      "background:rgba(0,0,0,.72);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);opacity:0;transition:opacity .18s}" +
      ".lo-dim.on{opacity:1}" +
      ".lo-card{width:100%;max-width:340px;background:#16181f;border:1px solid rgba(255,255,255,.09);border-radius:20px;" +
      "padding:24px 20px 18px;text-align:center;box-shadow:0 24px 60px rgba(0,0,0,.6);transform:translateY(8px) scale(.98);transition:transform .2s cubic-bezier(.2,.8,.2,1)}" +
      ".lo-dim.on .lo-card{transform:none}" +
      ".lo-emoji{font-size:38px;line-height:1}" +
      ".lo-title{font-size:18px;font-weight:900;color:#fff;margin:10px 0 6px}" +
      ".lo-body{font-size:13px;line-height:1.6;color:#aab0bd}" +
      ".lo-btns{margin-top:18px;display:flex;flex-direction:column;gap:9px}" +
      ".lo-stay{width:100%;height:50px;border:none;border-radius:14px;font-size:15px;font-weight:900;cursor:pointer;" +
      "background:linear-gradient(135deg,#3d6bff,#5a86ff);color:#fff}" +
      ".lo-go{width:100%;height:44px;border:none;border-radius:12px;background:transparent;color:#7b7f8a;font-size:13px;font-weight:700;cursor:pointer}" +
      ".lo-go:active{color:#ff6a6a}";
    document.head.appendChild(s);
  }

  function open(html) {
    css();
    var dim = document.createElement("div");
    dim.className = "lo-dim";
    dim.innerHTML = '<div class="lo-card">' + html + "</div>";
    document.body.appendChild(dim);
    requestAnimationFrame(function () { dim.classList.add("on"); });
    return dim;
  }
  function close(dim) { if (!dim) return; dim.classList.remove("on"); setTimeout(function () { dim.remove(); }, 200); }

  async function doLogout(dim) {
    try { await (window.supabaseClient && window.supabaseClient.auth.signOut()); } catch (_) {}
    /* signOut 이 네트워크로 실패해도 로컬 세션은 반드시 지운다 — 안 그러면
       "로그아웃했는데 그대로 로그인 상태"가 된다(비행기모드·지하철에서 재현). */
    try { localStorage.removeItem("sb-bidqauputnhkqepvdzrr-auth-token"); } catch (_) {}
    try { sessionStorage.clear(); } catch (_) {}
    // "또 오세요" 인사로 교체 후 홈으로
    if (dim) dim.querySelector(".lo-card").innerHTML =
      '<div class="lo-emoji">👋</div><div class="lo-title">또 만나요!</div>' +
      '<div class="lo-body">언제든 다시 로그인해서<br>이어서 즐겨주세요 💜</div>';
    setTimeout(function () {
      /* 앱(SPA 셸)에서 location.href 로 문서를 갈아치우면 셸·라우터가 통째로 죽는다
         — social-auth 의 로그인 복귀에서 이미 물렸던 함정이다. 셸이면 라우터로 간다. */
      if (window.GALLA_shellGo) { window.GALLA_shellGo("index.html", "home"); return; }
      if (window.GALLA_SPA && window.GALLA_nav) { window.GALLA_nav("index.html"); return; }
      location.href = "index.html";
    }, 1100);
  }

  function logout() {
    var dim = open(
      '<div class="lo-emoji">🥺</div>' +
      '<div class="lo-title">정말 나가시게요?</div>' +
      '<div class="lo-body">로그아웃하면 다음에 이메일·비밀번호를<br>다시 입력해야 해요. 그냥 두면 바로 이어집니다.</div>' +
      '<div class="lo-btns">' +
      '<button class="lo-stay" id="lo-stay">그냥 머무르기</button>' +
      '<button class="lo-go" id="lo-go">그래도 로그아웃</button>' +
      "</div>"
    );
    dim.querySelector("#lo-stay").onclick = function () { close(dim); };
    dim.addEventListener("click", function (e) { if (e.target === dim) close(dim); });
    dim.querySelector("#lo-go").onclick = function () { doLogout(dim); };
  }

  window.GALLA_logout = logout;
})();
