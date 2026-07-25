/* ─────────────────────────────────────────────────────────────
   pull-refresh.js — 전 페이지 공통 '당겨서 새로고침' (인스타식 세련된 동작)
   · 최상단에서 아래로 당기면 헤더 아래 중앙에 미니멀 스피너가 페이드·스케일로 나타나고,
     당길수록 회전. 임계치 넘겨 놓으면 계속 돌다가 새로고침.
   · 세로·최상단일 때만 → 가로 탭 스와이프 무충돌. 릴스(#shortsOverlay)·[data-no-ptr] 비활성.
   · 리로드는 '맨 위'에서 시작(헤더 로고가 스크롤 복원으로 숨는 것 방지).
   ───────────────────────────────────────────────────────────── */
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
    if (document.getElementById("shortsOverlay")) return true;      // 릴스
    if (document.getElementById("lv-stage")) return true;          // 🎙 라이브 무대 — 당겨서 새로고침 시 로비로 튕김 방지
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
        location.reload();
      }, 420);
    } else {
      reset();
    }
  }, { passive: true });
})();
