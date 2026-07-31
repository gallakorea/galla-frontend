/* ─────────────────────────────────────────────────────────────
   pull-refresh.js — 전 페이지 공통 '당겨서 새로고침' (인스타식 세련된 동작)
   · 최상단에서 아래로 당기면 헤더 아래 중앙에 미니멀 스피너가 페이드·스케일로 나타나고,
     당길수록 회전. 임계치 넘겨 놓으면 계속 돌다가 새로고침.
   · 세로·최상단일 때만 → 가로 탭 스와이프 무충돌. 릴스(#shortsOverlay)·[data-no-ptr] 비활성.
   · 리로드는 '맨 위'에서 시작(헤더 로고가 스크롤 복원으로 숨는 것 방지).
   ───────────────────────────────────────────────────────────── */
/* 🔄 확실한 리로드 — 네이티브 앱 WKWebView는 그냥 location.reload()면 옛 문서를 캐시에서 다시 줘
   '리로드가 안 되는' 것처럼 보였다. SPA(app.html)에선 URL에 캐시버스터를 붙여 '새 문서'로 강제 재요청
   (해시=현재 라우트 보존). MPA는 기존 reload. 버전 프로브도 이 함수를 쓴다. */
if (!window.gallaHardReload) {
  window.gallaHardReload = function () {
    try {
      var isSpa = document.body && document.body.dataset.page === "spa";
      if (isSpa) { location.replace(location.pathname + "?_r=" + Date.now() + (location.hash || "")); return; }
    } catch (_) {}
    try { location.reload(); } catch (_) { try { location.href = location.pathname + "?_r=" + Date.now(); } catch (__) {} }
  };
}

(function () {
  if (window.__gallaPTR) return;
  window.__gallaPTR = true;

  var TRIG = 88;                 // 새로고침 발동 임계치(px)
  var startY = 0, startX = 0, pulling = false, dy = 0, active = false, ind = null, spin = null;

  function winTop() {
    return (window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0) <= 0;
  }
  function containerTop(el) {
    for (var n = el; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      var oy; try { oy = getComputedStyle(n).overflowY; } catch (_) { oy = ""; }
      if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight + 2) return n.scrollTop <= 0;
    }
    return true;
  }
  function blocked(target) {
    if (window.GALLA_isWriting && window.GALLA_isWriting()) return true;  // ✍️ 작성 중(글쓰기·발행·제보·버그신고) 리로드 금지 → 내용 유실 방지
    if (document.getElementById("shortsOverlay")) return true;      // 릴스
    if (document.getElementById("lv-stage")) return true;          // 🎙 라이브 무대 — 당겨서 새로고침 시 로비로 튕김 방지
    if (document.body.classList.contains("dm-detail")) return true; // 💬 대화방(1:1·난장) — 리로드하면 로비로 튕김(사장님 재현)
    if (document.body.classList.contains("fr-chatting")) return true; // 🫂 갈라 친구 챗 — 당겨서 새로고침하면 대화 닫힘/유실 방지
    // 리로드하면 상태가 날아가는 오버레이 전부(통화·삐삐·조그·시트·모달) — nav.js 스와이프 차단과 동일 기준
    if (document.querySelector(
      "#dm-call.on, #pager-call.on, #pager-book.on, #nav-jog, " +
      "#dm-root.open:not(.page), .wh-sheet.open, .shop-sheet.open, .noti-drawer.open, " +
      "#mpQuickView.open, #createModal:not([hidden]), #plaza-write-modal:not(.hidden), " +
      "#lv-new-sheet, #lv-prof-sheet, #lv-pres-sheet, #lv-super-sheet"
    )) return true;
    for (var n = target; n && n.nodeType === 1; n = n.parentElement)
      if (n.getAttribute && n.getAttribute("data-no-ptr") != null) return true;
    return false;
  }
  function ensureInd() {
    if (ind) return ind;
    var st = document.createElement("style");
    st.textContent =
      "#galla-ptr{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 58px);" +
      "width:30px;height:30px;margin-left:-15px;z-index:2147483600;pointer-events:none;" +
      "opacity:0;transform:translateY(-6px) scale(.55)}" +
      "#galla-ptr.snap{transition:opacity .28s ease,transform .28s cubic-bezier(.2,.85,.3,1)}" +
      "#galla-ptr i{display:block;width:28px;height:28px;border-radius:50%;" +
        "background:conic-gradient(from 8deg,rgba(160,172,196,0) 0deg,rgba(190,200,222,.10) 60deg,rgba(226,232,246,.95) 355deg);" +
        "-webkit-mask:radial-gradient(farthest-side,#0000 calc(100% - 3px),#000 0);" +
        "mask:radial-gradient(farthest-side,#0000 calc(100% - 3px),#000 0)}" +
      "#galla-ptr.on{opacity:1 !important;transform:translateY(0) scale(1) !important}" +
      "#galla-ptr.on i{animation:gptrSpin .62s linear infinite}" +
      "@keyframes gptrSpin{to{transform:rotate(360deg)}}";
    (document.head || document.documentElement).appendChild(st);
    ind = document.createElement("div"); ind.id = "galla-ptr";
    spin = document.createElement("i"); ind.appendChild(spin);
    document.body.appendChild(ind);
    return ind;
  }
  // 당기는 동안: 진행도(0~1)에 따라 페이드·스케일·회전 (손가락 추종, transition 없음)
  function drag(d) {
    ensureInd();
    ind.classList.remove("snap", "on");
    var p = Math.max(0, Math.min(d / TRIG, 1));           // 0~1
    var over = Math.max(0, d - TRIG);
    ind.style.opacity = Math.min(1, d / 44);
    ind.style.transform = "translateY(" + Math.min(d * 0.35, 30) + "px) scale(" + (0.55 + 0.45 * p) + ")";
    if (spin) spin.style.transform = "rotate(" + (d * 2.6 + over * 1.5) + "deg)";
  }
  function reset() { if (ind) { ind.classList.add("snap"); ind.classList.remove("on"); ind.style.opacity = "0"; ind.style.transform = "translateY(-6px) scale(.55)"; } }

  document.addEventListener("touchstart", function (e) {
    if (active || e.touches.length !== 1) { pulling = false; return; }
    startY = e.touches[0].clientY; startX = e.touches[0].clientX; dy = 0;
    pulling = winTop() && containerTop(e.target) && !blocked(e.target);
  }, { passive: true });

  document.addEventListener("touchmove", function (e) {
    if (!pulling || active) return;
    var ny = e.touches[0].clientY - startY;
    var nx = e.touches[0].clientX - startX;
    if (ny <= 0 || Math.abs(nx) > Math.abs(ny)) { pulling = false; reset(); return; }
    e.preventDefault();
    dy = ny * 0.6;                 // 고무줄 저항감
    drag(dy);
  }, { passive: false });

  document.addEventListener("touchend", function () {
    if (!pulling) return;
    pulling = false;
    if (dy >= TRIG && !active) {
      active = true;
      ensureInd(); ind.classList.add("snap", "on");   // 제자리에서 계속 회전
      setTimeout(function () {
        try { history.scrollRestoration = "manual"; } catch (_) {}   // 맨 위에서 시작(로고 보이게)
        try { window.scrollTo(0, 0); } catch (_) {}
        gallaHardReload();
      }, 420);
    } else {
      reset();
    }
  }, { passive: true });
})();
