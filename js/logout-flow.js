/* 🚪 로그아웃 흐름 — 네이티브 alert 폐지, 우리 톤 팝업.
   · 앱(네이티브): 인스타처럼 로그아웃 불가 → "계속 함께해요" 팝업만.
   · 웹: 최대한 만류(머무르기 강조 / 로그아웃 약하게) → 로그아웃 시 "또 오세요" 인사 후 이동.
   window.GALLA_logout() */
(function () {
  function isApp() { return !!(window.GALLA_isApp && window.GALLA_isApp()); }

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
    try { sessionStorage.clear(); } catch (_) {}
    // "또 오세요" 인사로 교체 후 홈으로
    if (dim) dim.querySelector(".lo-card").innerHTML =
      '<div class="lo-emoji">👋</div><div class="lo-title">또 만나요!</div>' +
      '<div class="lo-body">언제든 다시 로그인해서<br>이어서 즐겨주세요 💜</div>';
    setTimeout(function () { location.href = "index.html"; }, 1100);
  }

  function logout() {
    // 앱: 인스타처럼 로그아웃 없음
    if (isApp()) {
      var d = open(
        '<div class="lo-emoji">💜</div>' +
        '<div class="lo-title">앱에서는 로그아웃이 없어요</div>' +
        '<div class="lo-body">껐다 켜도 바로 이어집니다.<br>계속 함께해요!</div>' +
        '<div class="lo-btns"><button class="lo-stay" id="lo-ok">계속하기</button></div>'
      );
      d.querySelector("#lo-ok").onclick = function () { close(d); };
      d.addEventListener("click", function (e) { if (e.target === d) close(d); });
      return;
    }
    // 웹: 최대한 만류
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
