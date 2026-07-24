/* ─────────────────────────────────────────────────────────────
   pull-refresh.js — 전 페이지 공통 '당겨서 새로고침'
   · 스크롤 최상단에서 아래로 당기면 스피너가 내려오고, 임계치(70px) 넘겨 놓으면 reload.
   · 세로·최상단일 때만 동작 → 가로 스와이프(셸 탭 전환)와 충돌 없음.
   · window 스크롤뿐 아니라 내부 스크롤 컨테이너(DM 등)도 그 컨테이너가 최상단일 때만.
   셸(iframe) 안이면 그 판(현재 페이지)만 새로고침된다.
   ───────────────────────────────────────────────────────────── */
(function () {
  if (window.__gallaPTR) return;          // 중복 로드 방지
  window.__gallaPTR = true;

  var THRESH = 70, MAXPULL = 110;
  var startY = 0, startX = 0, pulling = false, dist = 0, active = false, ind = null, spin = null;

  function winTop() {
    return (window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0) <= 0;
  }
  // 터치 시작 지점의 조상 중 스크롤 컨테이너가 있으면, 그게 최상단인지 확인
  function containerTop(el) {
    for (var n = el; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      var oy;
      try { oy = getComputedStyle(n).overflowY; } catch (_) { oy = ""; }
      if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight + 2) {
        return n.scrollTop <= 0;
      }
    }
    return true;
  }
  // PTR 금지 상황: 릴스(세로 스와이프 충돌) / opt-out 영역([data-no-ptr])
  function blocked(target) {
    if (document.getElementById("shortsOverlay")) return true;   // 릴스 열림
    for (var n = target; n && n.nodeType === 1; n = n.parentElement) {
      if (n.getAttribute && n.getAttribute("data-no-ptr") != null) return true;
    }
    return false;
  }
  function ensureInd() {
    if (ind) return ind;
    var st = document.createElement("style");
    st.textContent =
      "#galla-ptr{position:fixed;top:0;left:50%;width:38px;height:38px;margin-left:-19px;" +
      "border-radius:50%;background:rgba(20,21,26,.97);border:1px solid rgba(255,255,255,.12);" +
      "display:flex;align-items:center;justify-content:center;z-index:2147483600;pointer-events:none;" +
      "box-shadow:0 6px 20px rgba(0,0,0,.5);transform:translateY(-52px);opacity:0}" +
      "#galla-ptr i{width:18px;height:18px;border-radius:50%;border:2.5px solid rgba(255,255,255,.22);" +
      "border-top-color:#6f86ff;display:block}" +
      "#galla-ptr.on i{animation:gptr .7s linear infinite}" +
      "#galla-ptr.snap{transition:transform .22s ease,opacity .22s ease}" +
      "@keyframes gptr{to{transform:rotate(360deg)}}";
    (document.head || document.documentElement).appendChild(st);
    ind = document.createElement("div"); ind.id = "galla-ptr";
    spin = document.createElement("i"); ind.appendChild(spin);
    document.body.appendChild(ind);
    return ind;
  }
  function place(y, op) { ensureInd(); ind.style.transform = "translateY(" + y + "px)"; ind.style.opacity = op; }

  document.addEventListener("touchstart", function (e) {
    if (active || e.touches.length !== 1) { pulling = false; return; }
    startY = e.touches[0].clientY; startX = e.touches[0].clientX; dist = 0;
    pulling = winTop() && containerTop(e.target) && !blocked(e.target);
    if (ind) ind.classList.remove("snap");
  }, { passive: true });

  document.addEventListener("touchmove", function (e) {
    if (!pulling || active) return;
    var dy = e.touches[0].clientY - startY;
    var dx = e.touches[0].clientX - startX;
    if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) { pulling = false; if (ind) { ind.classList.add("snap"); place(-52, 0); } return; }
    e.preventDefault();                       // 당기는 동안 네이티브 바운스 억제
    dist = dy;
    var pull = Math.min(dy * 0.5, MAXPULL);   // 저항감
    place(-52 + Math.min(pull + 52, 68), Math.min(1, pull / THRESH));
    if (spin) spin.style.transform = "rotate(" + (pull * 4) + "deg)";
  }, { passive: false });

  document.addEventListener("touchend", function () {
    if (!pulling) return;
    pulling = false;
    if (dist * 0.5 >= THRESH && !active) {
      active = true;
      ensureInd(); ind.classList.add("on", "snap");
      place(16, 1);
      setTimeout(function () {
        // 새로고침은 '맨 위'에서 시작해야 헤더 로고가 보인다(nav.js가 스크롤 복원>10px면 로고 숨김).
        try { history.scrollRestoration = "manual"; } catch (_) {}
        try { window.scrollTo(0, 0); } catch (_) {}
        location.reload();
      }, 280);
    } else if (ind) {
      ind.classList.add("snap"); place(-52, 0);
    }
  }, { passive: true });
})();
