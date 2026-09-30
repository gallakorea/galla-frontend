/* ✏️ 광장 드래그 FAB (2026-09-30)
   ──────────────────────────────────────────────────────────────
   광장(트렌드›광장) 안에서만 뜨는 반투명 글쓰기 버튼.
   · 탭         → openPlazaWriteModal (헤더 글쓰기와 같은 모달. 새 시트 안 만든다)
   · 꾹+드래그  → 이동, 놓으면 가까운 좌/우 엣지에 스냅(높이 유지). 위치 localStorage 기억
   · 갈비스 오브(#frOrb, 우하단)와 겹치지 않게 기본 위치는 오브 '위'
   클릭/드래그 구분: 이동 8px 이하이고 짧게 눌렀다 떼면 '탭'으로 본다(스레드식).
   ────────────────────────────────────────────────────────────── */
(function () {
  var POS_KEY = "galla_plaza_fab_pos";
  var THRESH = 8;            // 드래그로 인식하는 최소 이동(px)
  var MARGIN = 14;           // 화면 가장자리 여백
  var SIZE = 52;             // FAB 지름
  var ORB_CLEAR = 150;       // 갈비스 오브(#frOrb)를 피하는 하단 여백 — 오브 미탐 시 폴백값(오브 위)

  var fab = null, moved = false, downX = 0, downY = 0, baseL = 0, baseT = 0, dragging = false, pid = null;

  function panel() { return document.querySelector('.tab-panel[data-panel="plaza"]'); }
  // 광장 서브탭이 실제로 보이는가(트렌드 페이지 + 광장 패널 active)
  function plazaVisible() {
    var p = panel();
    if (!p) return false;
    // 패널이 hidden/none 이 아니고 화면에 있음
    return p.offsetParent !== null || p.classList.contains("active");
  }

  function clampPos(l, t) {
    var w = window.innerWidth, h = window.innerHeight;
    l = Math.max(MARGIN, Math.min(l, w - SIZE - MARGIN));
    t = Math.max(MARGIN + 48, Math.min(t, h - SIZE - MARGIN)); // 상단 헤더 아래
    return { l: l, t: t };
  }
  function savePos(l, t) { try { localStorage.setItem(POS_KEY, JSON.stringify({ l: l, t: t })); } catch (_) {} }
  function loadPos() { try { return JSON.parse(localStorage.getItem(POS_KEY) || "null"); } catch (_) { return null; } }

  function defaultPos() {
    // 우하단, 갈비스 오브(#frOrb) '바로 위' — 오브가 FAB 을 덮지 않게 실제 사각형을 읽어 배치.
    // (오브 z-index 940 > FAB 900 이라, 겹치면 오브가 FAB 을 완전히 가린다 — 반드시 오브 위로.)
    var w = window.innerWidth, h = window.innerHeight;
    var orb = document.getElementById("frOrb");
    if (orb) {
      var r = orb.getBoundingClientRect();
      if (r && r.width) {
        return clampPos(r.right - SIZE, r.top - SIZE - 12); // 오브 오른쪽 정렬 · 12px 위
      }
    }
    return clampPos(w - SIZE - MARGIN, h - SIZE - ORB_CLEAR);
  }
  function hasSavedPos() { return !!loadPos(); }
  function applyPos(l, t) {
    var c = clampPos(l, t);
    fab.style.left = c.l + "px";
    fab.style.top = c.t + "px";
    fab.style.right = "auto";
    fab.style.bottom = "auto";
    return c;
  }
  function snapToEdge() {
    var l = parseFloat(fab.style.left) || 0, t = parseFloat(fab.style.top) || 0;
    var w = window.innerWidth;
    var toRight = (l + SIZE / 2) > w / 2;
    var nl = toRight ? (w - SIZE - MARGIN) : MARGIN;
    var c = applyPos(nl, t);
    savePos(c.l, c.t);
  }

  function openCompose() {
    if (typeof window.openPlazaWriteModal === "function") { window.openPlazaWriteModal(); return; }
    if (typeof window.__openComposeModal === "function") { window.__openComposeModal(); return; }
    // 폴백: compose 규약으로 이동
    (window.GALLA_nav || function (u) { location.href = u; })("search.html?tab=plaza&compose=1");
  }

  function onDown(e) {
    dragging = true; moved = false; pid = e.pointerId;
    downX = e.clientX; downY = e.clientY;
    var r = fab.getBoundingClientRect();
    baseL = r.left; baseT = r.top;
    fab.setPointerCapture && fab.setPointerCapture(pid);
    fab.classList.add("grab");
  }
  function onMove(e) {
    if (!dragging) return;
    var dx = e.clientX - downX, dy = e.clientY - downY;
    if (!moved && (Math.abs(dx) > THRESH || Math.abs(dy) > THRESH)) { moved = true; fab.classList.add("dragging"); }
    if (moved) { applyPos(baseL + dx, baseT + dy); e.preventDefault(); }
  }
  function onUp(e) {
    if (!dragging) return;
    dragging = false;
    fab.classList.remove("grab");
    try { fab.releasePointerCapture && fab.releasePointerCapture(pid); } catch (_) {}
    if (moved) {
      fab.classList.remove("dragging");
      snapToEdge();
    } else {
      openCompose();   // 이동 없었으면 탭 = 글쓰기
    }
  }

  function make() {
    if (fab) return;
    fab = document.createElement("button");
    fab.id = "plazaFab";
    fab.className = "plaza-fab";
    fab.type = "button";
    fab.setAttribute("aria-label", "광장에 글쓰기");
    fab.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
    document.body.appendChild(fab);
    var sp = loadPos() || defaultPos();
    applyPos(sp.l, sp.t);
    fab.addEventListener("pointerdown", onDown);
    fab.addEventListener("pointermove", onMove);
    fab.addEventListener("pointerup", onUp);
    fab.addEventListener("pointercancel", onUp);
    window.addEventListener("resize", function () { var p = loadPos() || defaultPos(); applyPos(p.l, p.t); });
  }

  function sync() {
    if (!fab) make();
    var vis = plazaVisible();
    fab.hidden = !vis;
    // 사용자가 직접 옮긴 적 없으면, 오브가 뒤늦게 생겨도 항상 오브 '위'로 재배치.
    if (vis && !dragging && !hasSavedPos()) {
      var p = defaultPos();
      fab.style.left = p.l + "px"; fab.style.top = p.t + "px";
      fab.style.right = "auto"; fab.style.bottom = "auto";
    }
  }

  // 광장 탭 전환·SPA 재주입에 반응
  function boot() {
    make();
    sync();
    // 서브탭/셸 전환은 클릭·해시·팝스테이트로 일어난다 — 가볍게 폴링 + 이벤트
    document.addEventListener("click", function () { setTimeout(sync, 60); }, true);
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    document.addEventListener("visibilitychange", sync);
    setInterval(sync, 800);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  window.GALLA_plazaFab = { sync: sync };
})();
