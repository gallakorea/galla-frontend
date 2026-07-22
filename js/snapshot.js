/* =========================================================
   📸 콘텐츠 스냅샷 캐시 — "도착 즉시, 지난 내용부터"
   ---------------------------------------------------------
   인스타가 탭 전환이 빠른 결정적 이유는 '이전에 보던 내용을 즉시 보여주고
   뒤에서 갱신'하기 때문. 같은 원리를 MPA에 이식한다. 페이지 렌더 방식이
   달라 3가지 모드로 나눈다(잘못 섞으면 UI가 이중으로 쌓인다):
   · replace — 목록형(홈 피드·예측 목록). 페이지 JS가 컨테이너 innerHTML을
     통째로 갈아치우므로, 지난 HTML을 넣어두면 실렌더가 자연 교체.
   · shell   — 정적 골격 + JS가 제자리 채움(트렌드·마이). 지난 '채워진 골격'으로
     정적 골격을 대체하면 JS가 같은 id에 바인딩·갱신(모두 innerHTML 재작성 계열
     확인됨). 마커 게이트 없이 떠날 때 항상 저장.
   · ghost   — 페이지 전체가 JS 생성(DM). id를 벗긴 '잔상'만 깔아두고(충돌 0,
     조작 불가), 진짜 UI가 append되는 순간 잔상을 걷는다.
   ⚠️ 컨테이너가 '완전히 닫힌 뒤' 실행돼야 한다(각 HTML에서 컨테이너 뒤 <script>).
   ========================================================= */
(function () {
  var CFG = {
    index:   { sel: "best-list",    mode: "replace" },
    predict: { sel: "marketList",   mode: "replace" },
    trend:   { sel: "app",          mode: "shell" },
    mypage:  { sel: "app",          mode: "shell" },
    dm:      { sel: "dm-page-host", mode: "ghost" },
  };
  var page = document.body && document.body.dataset.page;
  var cfg = CFG[page];
  if (!cfg) return;
  var el = document.getElementById(cfg.sel);
  if (!el) return;
  var KEY = "galla_snap_" + page;
  var MARK = "data-snap-mark";
  var CAP = 900000;

  var disarm = function (root) {
    // 재주입 영상이 제멋대로 재생/다운로드하지 않게
    root.querySelectorAll("video").forEach(function (v) {
      v.removeAttribute("autoplay");
      v.setAttribute("preload", "none");
    });
    // 컨테이너(#app)가 하단 <script> 태그들을 품는 페이지 대비 — 스냅샷에 남기면
    // 방문마다 무한 누적된다(innerHTML 주입 스크립트는 실행은 안 되지만 쌓임. 실측 +20/회)
    root.querySelectorAll("script").forEach(function (s) { s.remove(); });
    // 이전 스냅샷의 동봉 스타일도 제거 — 매 저장마다 신선하게 다시 수집
    root.querySelectorAll("style[data-snap-style]").forEach(function (s) { s.remove(); });
  };
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (_) {}
  if (saved && saved.length >= CAP) saved = null;

  /* JS가 주입하는 스타일(<style> — 닉네임 도색·아바타 칩(.gu-av) 등)을 스냅샷에
     동봉한다. 없으면 재생 시점(스크립트 실행 전)에 아바타가 원본 크기로 터진다
     (사장님 재현: 미리보기에 갈라 아바타 512px). data-snap-style 마커로 동봉분을
     구분해 다음 저장 때 이중 수집을 막는다. */
  var collectCss = function () {
    var out = [];
    document.querySelectorAll("style:not([data-snap-style])").forEach(function (s) { out.push(s.textContent); });
    return '<style data-snap-style>' + out.join("\n") + "</style>";
  };
  var store = function (h) {
    try {
      h = collectCss() + h;
      if (h && h.length < CAP) localStorage.setItem(KEY, h);
    } catch (_) {}
  };

  if (cfg.mode === "replace") {
    var injected = false;
    if (saved) { el.innerHTML = saved + '<i hidden ' + MARK + '></i>'; injected = true; }
    var save = function () {
      if (el.querySelector("[" + MARK + "]")) return;            // 아직 스냅샷 그대로 — 재저장 무의미
      if (!el.firstElementChild || el.querySelector(".sk-card")) return;
      var tmp = el.cloneNode(true); disarm(tmp); store(tmp.innerHTML);
    };
    if (injected) {
      var mo = new MutationObserver(function () {
        if (!el.querySelector("[" + MARK + "]")) { mo.disconnect(); setTimeout(save, 1500); }
      });
      mo.observe(el, { childList: true });
    } else setTimeout(save, 6000);
    addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") save(); });
    return;
  }

  if (cfg.mode === "shell") {
    if (saved) el.innerHTML = saved;                              // 같은 골격·같은 id — JS가 그대로 바인딩·갱신
    var saveShell = function () {
      if (!el.firstElementChild) return;
      var tmp = el.cloneNode(true); disarm(tmp); store(tmp.innerHTML);
    };
    addEventListener("pagehide", saveShell);
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") saveShell(); });
    setTimeout(saveShell, 6000);
    return;
  }

  // ghost — DM처럼 JS가 통째로 만드는 페이지: 조작 불가 잔상만 먼저 보여준다.
  // 잔상 = HTML의 정적 스켈레톤(캐시 없을 때) 또는 지난 화면 스냅샷(캐시 있을 때).
  var clearGhosts = function () {
    el.querySelectorAll("[data-snap-ghost]").forEach(function (n) { n.remove(); });
  };
  if (saved) {
    clearGhosts();                                  // 정적 스켈레톤 → 실물 잔상으로 대체
    var ghost = document.createElement("div");
    ghost.setAttribute("data-snap-ghost", "");
    ghost.style.cssText = "pointer-events:none";
    ghost.setAttribute("aria-hidden", "true");
    // id 전부 제거 — 진짜 UI가 뜰 때 getElementById 충돌이 절대 없어야 한다
    ghost.innerHTML = saved.replace(/\sid="[^"]*"/g, "");
    disarm(ghost);
    el.appendChild(ghost);
  }
  /* ⚠️ 잔상 걷어내기는 캐시 유무와 무관하게 '항상' 무장해야 한다 —
     캐시 있을 때만 걸었더니 첫 방문의 정적 스켈레톤이 영영 안 걷혀
     진짜 채팅 UI 위에 이중으로 쌓였다(사장님 실기기 재현). */
  var sweep = function () {
    for (var i = 0; i < el.children.length; i++) {
      if (!el.children[i].hasAttribute("data-snap-ghost")) { clearGhosts(); return true; }
    }
    return false;
  };
  if (!sweep()) {
    var gmo = new MutationObserver(function () { if (sweep()) gmo.disconnect(); });
    gmo.observe(el, { childList: true });
    setTimeout(clearGhosts, 15000); // 세이프가드 — 무슨 일이 있어도 잔상은 걷힌다
  }
  var saveGhost = function () {
    if (el.querySelector("[data-snap-ghost]")) return;            // 진짜 UI가 안 떴으면 저장 금지
    if (!el.firstElementChild) return;
    var tmp = el.cloneNode(true); disarm(tmp); store(tmp.innerHTML);
  };
  addEventListener("pagehide", saveGhost);
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") saveGhost(); });
})();
