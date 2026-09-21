/* =========================================================
   perm-notice.js — 접근권한 고지 (26.9.21)
   ─────────────────────────────────────────────────────────
   ⚖️ 왜 필요한가 — 이건 디자인 선택이 아니라 법이다.
     정보통신망법 제22조의2 는 앱이 단말기 접근권한을 쓸 때
     ①필수 / ②선택 을 구분해 ③그 이유와 함께 ④미리 알리도록 강제한다.
     선택 권한은 동의하지 않아도 서비스를 쓸 수 있다는 것까지 알려야 한다.
     카카오톡이 설치 직후 띄우는 「접근권한 안내」 화면이 이 조항 때문이다.

   ⚠️ 이 화면은 권한을 '요청'하지 않는다. 고지만 한다.
      실제 요청은 그 기능을 쓸 때 한다(첫 실행 몰아치기는 거절률을 3~4배로 올린다).
      그래서 「확인」 버튼 하나뿐이고 거부 버튼이 없다 — 고지의 성격이 그렇다.

   네이티브 앱에서 최초 1회만. 웹은 대상이 아니다(단말 권한 고지 의무는 앱 대상).
   ========================================================= */
(function () {
  var KEY = "galla_perm_notice_v1";

  function isNative() {
    try { return !!(window.Capacitor && (window.Capacitor.isNativePlatform ? window.Capacitor.isNativePlatform() : window.Capacitor.isNative)); }
    catch (_) { return false; }
  }
  if (!isNative()) return;
  try { if (localStorage.getItem(KEY)) return; } catch (_) { return; }
  // 가입 직후 흐름을 끊지 않는다 — 온보딩과 겹치면 둘 다 방해가 된다
  try { if (localStorage.getItem("galla_fresh_signup")) return; } catch (_) {}

  var REQUIRED = [];   // 갈라는 필수 접근권한이 없다 — 권한 없이도 보고 읽을 수 있다
  var OPTIONAL = [
    { icon: "🎙", name: "마이크",       why: "육성톡·음성 메시지·삐삐 녹음" },
    { icon: "📷", name: "카메라",       why: "면상톡(영상통화)·사진/영상 촬영" },
    { icon: "🖼", name: "사진",         why: "글·댓글에 사진과 영상을 올릴 때" },
    { icon: "📍", name: "위치",         why: "대화에서 위치 보내기·내 주변 맛집" },
    { icon: "🔔", name: "알림",         why: "답글·귓속말·통화 알림 받기" }
  ];

  function show() {
    var st = document.createElement("style");
    st.textContent =
      "#gpn{position:fixed;inset:0;z-index:2147481500;background:#08090d;color:#e9edf6;overflow:auto;" +
        "font-family:-apple-system,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;" +
        "padding:calc(34px + env(safe-area-inset-top)) 22px calc(28px + env(safe-area-inset-bottom));" +
        "opacity:0;transition:opacity .28s ease}" +
      "#gpn.on{opacity:1}" +
      "#gpn h2{font-size:21px;font-weight:800;margin:0 0 10px;line-height:1.35}" +
      "#gpn .lead{font-size:13.5px;color:#98a2b8;line-height:1.65;margin:0 0 26px}" +
      "#gpn h3{font-size:12px;font-weight:700;color:#7f8aa3;letter-spacing:.6px;margin:0 0 12px}" +
      "#gpn ul{list-style:none;margin:0 0 24px;padding:0}" +
      "#gpn li{display:flex;gap:13px;align-items:flex-start;padding:13px 0;border-bottom:1px solid #191d26}" +
      "#gpn li:last-child{border-bottom:0}" +
      "#gpn .ic{font-size:21px;line-height:1.2;width:28px;text-align:center;flex:none}" +
      "#gpn .nm{font-size:14.5px;font-weight:700;margin-bottom:3px}" +
      "#gpn .wy{font-size:12.5px;color:#8e97ab;line-height:1.5}" +
      "#gpn .note{font-size:12px;color:#6f7a93;line-height:1.7;background:#10131a;border-radius:12px;padding:14px 15px;margin-bottom:24px}" +
      "#gpn button{width:100%;border:0;border-radius:13px;padding:16px;font-size:15.5px;font-weight:800;" +
        "background:#2f6bff;color:#fff;font-family:inherit;cursor:pointer}";
    document.head.appendChild(st);

    var el = document.createElement("div");
    el.id = "gpn";
    el.setAttribute("role", "dialog");
    el.innerHTML =
      "<h2>갈라가 쓰는 권한을 알려드려요</h2>" +
      '<p class="lead">아래 권한은 <b>해당 기능을 쓸 때만</b> 물어봐요.<br>' +
        "지금 허용하지 않아도 갈라를 보고 읽는 데는 아무 지장이 없어요.</p>" +
      (REQUIRED.length
        ? "<h3>필수 접근권한</h3><ul>" + REQUIRED.map(row).join("") + "</ul>"
        : "") +
      "<h3>선택 접근권한</h3><ul>" + OPTIONAL.map(row).join("") + "</ul>" +
      '<div class="note">선택 권한은 동의하지 않아도 갈라를 이용할 수 있어요. ' +
        "다만 그 기능(통화·촬영·위치 보내기 등)은 쓸 수 없어요.<br>" +
        "허용한 뒤에도 <b>휴대폰 설정 → 갈라</b>에서 언제든 끌 수 있어요.</div>" +
      "<button type=\"button\">확인했어요</button>";

    function row(p) {
      return '<li><span class="ic">' + p.icon + '</span><div><div class="nm">' + p.name +
             '</div><div class="wy">' + p.why + "</div></div></li>";
    }

    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add("on"); });
    el.querySelector("button").addEventListener("click", function () {
      try { localStorage.setItem(KEY, "1"); } catch (_) {}
      el.classList.remove("on");
      setTimeout(function () { el.remove(); }, 300);
    });
  }

  // 스플래시가 내려간 뒤에 — 첫 화면부터 덮으면 앱이 뭘 하는 곳인지 못 보고 판단하게 된다
  function boot() { setTimeout(show, 900); }
  if (document.readyState === "complete") boot();
  else window.addEventListener("load", boot, { once: true });
})();
