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
    // 스크롤 중 일시 상태(로고 숨김·헤더 숨김·네비 축소)를 벗긴다 — 박제되면
    // 복원 화면에서 로고가 숨은 채 시작해 '늦게 뜨는' 것처럼 보인다(사장님 재현)
    root.querySelectorAll(".hdr-hidden, .hdr-nologo, .hdr-scrolled, .nav--mini").forEach(function (n) {
      n.classList.remove("hdr-hidden", "hdr-nologo", "hdr-scrolled", "nav--mini");
    });
  };
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (_) {}
  if (saved && saved.length >= CAP) saved = null;
  // 복원 직후에도 일시 상태를 벗긴다 — 이미 저장돼 있는 구버전 스냅샷 구제
  var stripTransient = function (root) {
    root.querySelectorAll(".hdr-hidden, .hdr-nologo, .hdr-scrolled, .nav--mini").forEach(function (n) {
      n.classList.remove("hdr-hidden", "hdr-nologo", "hdr-scrolled", "nav--mini");
    });
  };

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

  /* 🌀 로딩 베일 — 지난 화면이 '없을 때'의 규칙(사장님 결정, 인스타 방식):
     어중간하게 조립되는 과정을 보여주지 않고 갈라 스피너로 덮었다가
     콘텐츠가 준비되면 페이드로 한 번에 공개한다. 스냅샷이 있으면 베일 없음.
     네비(9999)보다 아래라 하단 네비는 계속 보인다. */
  var unveil = null;
  var veilOn = function (readyCheck, maxMs) {
    var v = document.createElement("div");
    v.style.cssText = "position:fixed;inset:0;z-index:9000;background:" +
      "radial-gradient(120% 80% at 50% -10%,#14141a 0%,#0a0a0b 55%) #0a0a0b;" +
      "display:flex;align-items:center;justify-content:center;transition:opacity .28s ease;pointer-events:none";
    v.innerHTML = '<div style="width:30px;height:30px;border-radius:50%;border:2.5px solid rgba(255,255,255,.14);' +
      'border-top-color:#6f86ff;animation:snapspin .7s linear infinite"></div>' +
      "<style>@keyframes snapspin{to{transform:rotate(360deg)}}</style>";
    (document.body || document.documentElement).appendChild(v);
    unveil = function () {
      if (!v.parentNode) return;
      v.style.opacity = "0";
      setTimeout(function () { v.remove(); }, 300);
    };
    if (readyCheck) {
      var vmo = new MutationObserver(function () { if (readyCheck()) { vmo.disconnect(); unveil(); } });
      vmo.observe(el, { childList: true, subtree: true });
      if (readyCheck()) { vmo.disconnect(); unveil(); }
    }
    setTimeout(function () { unveil(); }, maxMs || 2800); // 세이프가드 — 베일이 화면을 잡아먹지 않게
  };

  if (cfg.mode === "replace") {
    var injected = false;
    if (saved) { el.innerHTML = saved + '<i hidden ' + MARK + '></i>'; injected = true; }
    else veilOn(function () { return el.firstElementChild && !el.querySelector(".sk-card"); }, 2800);
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
    if (saved) { el.innerHTML = saved; stripTransient(el); }      // 같은 골격·같은 id — JS가 그대로 바인딩·갱신
    else veilOn(null, 1400);                                       // 셸은 곧 그려지므로 짧게만 가림
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
  var fadeOutGhosts = function () {
    var gs = el.querySelectorAll("[data-snap-ghost]");
    gs.forEach(function (n) { n.style.opacity = "0"; });
    setTimeout(clearGhosts, 300);
  };
  if (saved) {
    clearGhosts();                                  // 정적 스켈레톤 → 실물 잔상으로 대체
    var ghost = document.createElement("div");
    ghost.setAttribute("data-snap-ghost", "");
    /* 오버레이로 '위에 겹쳐' 둔다 — 일반 블록으로 두면 진짜 UI가 아래에 쌓여
       이중 화면이 되고, 일찍 걷으면 빈 목록이 노출돼 깜빡인다(사장님 재현).
       진짜 목록이 채워질 때까지 덮고 있다가 페이드아웃. */
    ghost.style.cssText = "position:absolute;inset:0;z-index:30;background:#0a0a0b;overflow:hidden;pointer-events:none;transition:opacity .25s ease";
    ghost.setAttribute("aria-hidden", "true");
    // id 전부 제거 — 진짜 UI가 뜰 때 getElementById 충돌이 절대 없어야 한다
    ghost.innerHTML = saved.replace(/\sid="[^"]*"/g, "");
    disarm(ghost);
    if (!el.style.position) el.style.position = "relative";
    el.appendChild(ghost);
  }
  /* ⚠️ 잔상 걷어내기는 캐시 유무와 무관하게 '항상' 무장해야 한다 —
     캐시 있을 때만 걸었더니 첫 방문의 정적 스켈레톤이 영영 안 걷혀
     진짜 채팅 UI 위에 이중으로 쌓였다(사장님 실기기 재현).
     · 캐시 잔상(오버레이): 진짜 목록에 내용이 찰 때까지 유지 후 페이드
     · 정적 스켈레톤: 진짜 UI가 붙는 즉시 제거 */
  var realReady = function () {
    for (var i = 0; i < el.children.length; i++) {
      var c = el.children[i];
      if (c.hasAttribute("data-snap-ghost")) continue;
      if (!saved) return true;                                   // 스켈레톤은 UI 등장 즉시
      if (c.querySelector(".dm-thread, .dm-empty, .dm-room, [data-snap-ready]")) return true;
    }
    return false;
  };
  var sweep = function () { if (realReady()) { fadeOutGhosts(); return true; } return false; };
  if (!sweep()) {
    var gmo = new MutationObserver(function () { if (sweep()) gmo.disconnect(); });
    gmo.observe(el, { childList: true, subtree: true });
    setTimeout(fadeOutGhosts, 8000); // 세이프가드 — 무슨 일이 있어도 잔상은 걷힌다
  }
  var saveGhost = function () {
    if (el.querySelector("[data-snap-ghost]")) return;            // 진짜 UI가 안 떴으면 저장 금지
    if (!el.firstElementChild) return;
    var tmp = el.cloneNode(true); disarm(tmp); store(tmp.innerHTML);
  };
  addEventListener("pagehide", saveGhost);
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") saveGhost(); });
})();
