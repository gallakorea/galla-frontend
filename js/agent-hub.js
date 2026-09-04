/* 🛸 갈비스 제작 — 기존 '새로 만들기'와 완전히 다른 세계.
 *
 * 왜 목록의 한 줄이면 안 되나:
 *   '새로 만들기'는 **내가 직접 쓰는** 곳이다. 유형을 고르면 빈 작성 화면이 열린다.
 *   갈비스 제작은 반대다 — 내가 재료만 주고 **갈비스가 만든다**. 고르는 것도, 보는 것도,
 *   고치는 방식도 다르다. 같은 카드 목록에 한 줄로 끼워 넣으면 "글쓰기 종류 하나"로 읽힌다.
 *   그래서 여기서는 목록을 떠나 다른 화면으로 들어간다. 문이지 항목이 아니다.
 *
 * ⚠️ 이 화면의 톤은 갈비스 HUD(청록·격자)다. 앱 본체(카드·인디고)와 일부러 다르게 간다 —
 *    "다른 데로 들어왔다"가 첫 인상이어야 한다.
 */
(function () {
  "use strict";
  if (window.GALLA_openAgent) return;

  /* 🔒 창작 에이전트 — 앱 런칭 뒤 제1 개발 과제(사장님 결정 2026-08-27).
     그때까지 진입을 막는다. **코드는 지우지 않는다** — 지우면 다시 지어야 하고,
     반쯤 된 걸 열어두면 "되다 마는 기능"으로 기억된다. 스위치 하나만 내린다.

     🚦 2026-09-04: 상수 → **서버 플래그**(app_settings.features.agent)로 옮겼다.
        상수는 켜려면 배포가 필요하고, 배포는 PWA 캐시 전파까지 걸린다.
        이제 관제센터에서 값만 바꾸면 배포 없이 열린다.
        ⚠️ 플래그가 늦게 도착하면 그동안은 닫힌 상태다(fail-closed). 값이 오면
           GALLA_onFeatures 가 문을 다시 그린다 — 잠긴 문이 열린 문으로 바뀐다. */
  var ENABLED = false;
  window.GALLA_AGENT_READY = ENABLED;

  function applyFlag(on) {
    ENABLED = !!on;
    window.GALLA_AGENT_READY = ENABLED;
    /* 이미 그려둔 '잠긴 문'을 갱신한다.
       portal() 은 .ag-portal 이 있으면 조기 반환하므로, 지우고 다시 부르면 새 상태로 그려진다.
       문이 아직 없으면(='새로 만들기'가 안 열린 페이지) 아무 일도 안 한다. */
    try {
      var b = document.querySelector(".ag-portal");
      if (b) { b.remove(); portal(); }
    } catch (_) {}
  }
  try {
    if (window.GALLA_feature) applyFlag(window.GALLA_feature("agent"));
    window.GALLA_onFeatures && window.GALLA_onFeatures(function (f) { applyFlag(f && f.agent); });
  } catch (_) {}

  var FN = "/functions/v1/reel-agent";


  function sb() { return window.supabaseClient; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function injectStyle() {
    if (document.getElementById("ag-style")) return;
    var s = document.createElement("style"); s.id = "ag-style";
    s.textContent = [
      /* 앱 본체와 다른 톤 — 청록 격자 HUD. 하단 네비(9999)보다 위. */
      ".ag{position:fixed;inset:0;z-index:10040;color:#eaf6ff;overflow-y:auto;-webkit-overflow-scrolling:touch;",
      "  background:#04070d;background-image:repeating-linear-gradient(0deg,rgba(95,216,255,.045) 0 1px,transparent 1px 26px),",
      "    repeating-linear-gradient(90deg,rgba(95,216,255,.045) 0 1px,transparent 1px 26px);",
      "  font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic',sans-serif}",
      /* 아래 절반은 갈비스 도킹이 차지한다 — 그만큼 비워 둔다(가려서 못 누르면 안 된다). */
      ".ag-in{padding:22px 20px 56vh}",
      ".ag-x{position:fixed;top:calc(10px + env(safe-area-inset-top));right:16px;z-index:2;width:34px;height:34px;border-radius:99px;",
      "  border:1px solid rgba(95,216,255,.28);background:transparent;color:#7f97a8;font-size:18px;line-height:1}",
      ".ag-orb{width:56px;height:56px;border-radius:99px;margin-top:26px;",
      "  background:radial-gradient(circle at 34% 30%,#8ce8ff,#2b8fb5 62%,#0f2733 100%);",
      "  box-shadow:0 0 26px rgba(95,216,255,.35)}",
      ".ag-say{font-size:20px;font-weight:800;line-height:1.42;letter-spacing:-.3px;margin-top:16px}",
      ".ag-sub{font-size:13px;color:#7f97a8;line-height:1.6;margin-top:8px}",
      ".ag-sec{font-size:10.5px;font-weight:800;color:#5fd8ff;letter-spacing:.7px;margin:26px 0 10px}",
      ".ag-opt{width:100%;text-align:left;border:1px solid rgba(95,216,255,.24);background:rgba(10,16,26,.72);",
      "  border-radius:15px;padding:15px 16px;margin-bottom:9px;display:flex;gap:12px;align-items:center;color:inherit}",
      ".ag-opt:active{border-color:#5fd8ff;background:rgba(95,216,255,.10)}",
      /* ⚠️ span 은 inline 이라 그냥 두면 제목과 설명이 한 줄로 붙는다(포털에서 이미 당했다). */
      ".ag-opt>span:last-child{flex:1 1 auto;min-width:0}",
      ".ag-opt .n{display:block;font-size:14.5px;font-weight:800;color:#eaf6ff;line-height:1.35}",
      ".ag-opt .d{display:block;font-size:11.5px;color:#7f97a8;margin-top:3px;line-height:1.5}",
      ".ag-opt .ico{width:38px;height:38px;border-radius:11px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;",
      "  background:rgba(95,216,255,.10);border:1px solid rgba(95,216,255,.22)}",
      ".ag-opt .ico svg{width:19px;height:19px;stroke:#5fd8ff;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}",
      ".ag-go{border-color:rgba(255,180,92,.45);background:rgba(255,180,92,.07)}",
      ".ag-go .ico{background:rgba(255,180,92,.12);border-color:rgba(255,180,92,.3)}",
      ".ag-go .ico svg{stroke:#ffb45c}",
      ".ag-foot{font-size:11px;color:#5b6470;line-height:1.65;margin-top:22px}",
      ".ag-back{background:transparent;border:0;color:#7f97a8;font-size:12.5px;padding:0;margin-top:4px}",
      /* 문 — '새로 만들기' 목록 위에 얹히는 배너. 카드가 아니라 다른 데로 나가는 입구다. */
      ".ag-portal{display:block;width:100%;text-align:left;border:1px solid rgba(95,216,255,.34);border-radius:16px;",
      "  padding:15px 16px;margin:0 0 14px;color:#eaf6ff;position:relative;overflow:hidden;",
      "  background:#04070d;background-image:repeating-linear-gradient(0deg,rgba(95,216,255,.05) 0 1px,transparent 1px 22px),",
      "    repeating-linear-gradient(90deg,rgba(95,216,255,.05) 0 1px,transparent 1px 22px)}",
      ".ag-portal .r{display:flex;gap:12px;align-items:center}",
      ".ag-portal .o{width:34px;height:34px;border-radius:99px;flex:0 0 auto;",
      "  background:radial-gradient(circle at 34% 30%,#8ce8ff,#2b8fb5 62%,#0f2733 100%);box-shadow:0 0 14px rgba(95,216,255,.4)}",
      /* ⚠️ span 은 inline 이라 그냥 두면 제목과 설명이 한 줄로 붙는다(실측). block 으로 세운다. */
      ".ag-portal .r>span:last-child{flex:1 1 auto;min-width:0;padding-right:18px}",
      ".ag-portal .t{display:block;font-size:14.5px;font-weight:800;line-height:1.35}",
      ".ag-portal .s{display:block;font-size:11.5px;color:#7f97a8;margin-top:3px;line-height:1.45}",
      ".ag-portal .k{position:absolute;right:14px;top:50%;transform:translateY(-50%);color:#5fd8ff;font-size:16px}",
      ".ag-portal.ag-soon{border-color:rgba(95,216,255,.16);opacity:.62}",
      ".ag-portal.ag-soon .o{filter:grayscale(.5);box-shadow:none}",
      ".ag-badge{font-style:normal;font-size:10.5px;font-weight:800;color:#04070d;background:#5fd8ff;",
      "  border-radius:99px;padding:2px 7px;margin-left:6px;vertical-align:middle}",
      /* ⚠️ 갈비스 시트는 z-index 950 이라 이 화면(10040) 뒤에 깔린다 — 도킹이 안 보인다(실측).
         작업 화면이 떠 있는 동안만 갈비스를 위로 올린다. 아래 절반이 그 위에 얹혀야 '같이 상의'가 된다. */
      "body.ag-on #frSheet{z-index:10060}",
      "body.ag-on #frOrb,body.ag-on #frMini{z-index:10061}",
      /* ⚠️ #frSheet 은 inset:0 컨테이너라, 스크림만 통과시켜도 **컨테이너 자신이** 위쪽 탭을 먹는다.
         그 바람에 판 선택이 아예 안 눌렸다(실측). 도킹 중엔 컨테이너를 통과시키고 패널만 받게 한다. */
      "body.ag-on #frSheet.fr-dock{pointer-events:none}",
      "body.ag-on #frSheet.fr-dock .fr-panel{pointer-events:auto}",
      /* 🧭 각도 카드 — 근거와 '불리한 점'을 같이 보여준다. 좋은 말만 적힌 제안은 판단이 아니라 영업이다. */
      ".ag-ang{border:1px solid rgba(95,216,255,.24);background:rgba(10,16,26,.72);border-radius:15px;",
      "  padding:14px 15px;margin-bottom:9px;width:100%;text-align:left;color:inherit;display:block}",
      ".ag-ang:active{border-color:#5fd8ff;background:rgba(95,216,255,.10)}",
      ".ag-ang .t{display:block;font-size:14.5px;font-weight:800;color:#eaf6ff;line-height:1.4}",
      ".ag-ang .w{display:flex;gap:7px;margin-top:7px;font-size:11.5px;color:#8fb0c2;line-height:1.5}",
      ".ag-ang .r{display:flex;gap:7px;margin-top:5px;font-size:11.5px;color:#c99a5e;line-height:1.5}",
      ".ag-ang .k{flex:0 0 auto;font-weight:800;font-size:10px;letter-spacing:.4px;padding-top:1px}",
      ".ag-ang .w .k{color:#5fd8ff}",
      ".ag-ang .r .k{color:#ffb45c}",
      ".ag-load{font-size:12.5px;color:#7f97a8;padding:14px 2px}"
    ].join("");
    document.head.appendChild(s);
  }

  function ico(d) {
    return '<span class="ico"><svg viewBox="0 0 24 24">' + d + "</svg></span>";
  }

  async function pendingJobs() {
    try {
      var c = sb(); if (!c) return [];
      var ss = await c.auth.getSession(); if (!ss || !ss.data || !ss.data.session) return [];
      var r = await fetch(c.supabaseUrl + FN, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + ss.data.session.access_token, apikey: c.supabaseKey },
        body: JSON.stringify({ op: "list" })
      });
      var d = await r.json();
      return ((d && d.jobs) || []).filter(function (x) { return x.state === "preview"; });
    } catch (e) { return []; }
  }

  /* 📚 다섯 판 — 갈라는 숏판만 있는 곳이 아니다.
     ⚠️ 여기서 형식을 숨기면 안 된다(사장님 지적). 사용자가 고르게 하고,
        못 고르겠으면 그때 갈비스가 제안한다. 고른 뒤엔 판마다 다음 선택지가 다시 나온다.
     ⚠️ 지금 실제 파이프라인이 끝까지 있는 건 숏판뿐이다. 나머지는 갈비스 대화로 이어진다 —
        없는 걸 있는 척하지 않되, 고른 건 들고 간다(같은 걸 두 번 묻지 않는다). */
  var SURFACES = [
    { k: "vertical",   n: "숏판",   d: "세로 릴스 — 찍어온 걸로 짧게",
      i: '<path d="M8 3h8v18H8z"/><path d="M11 9.5v5l4-2.5z"/>' },
    { k: "horizontal", n: "롱판",   d: "가로 영상 — 길게 풀어서",
      i: '<path d="M3 6h18v12H3z"/><path d="M10 9.5v5l4-2.5z"/>' },
    { k: "issue",      n: "이슈",   d: "편이 갈릴 주제를 던진다",
      i: '<path d="M6 4l12 12M18 4L6 16"/><path d="M4 20h16"/>' },
    { k: "predict",    n: "예측",   d: "결과가 나올 일을 건다",
      i: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>' },
    { k: "plaza",      n: "광장",   d: "그냥 하고 싶은 말",
      i: '<path d="M4 5h16v11H8l-4 3z"/>' }
  ];

  /* 판마다 '그다음 선택'. 시작하는 방식이 판마다 다르다 — 재료가 다르니까. */
  var NEXT = {
    vertical: [
      ["찍어온 걸로", "사진·영상을 올리면 거기 맞춰 짠다", "숏판 만들래. 찍어온 영상 있어."],
      ["주제만 말할게", "뭘 다룰지만 정하면 각도부터 같이 잡는다", "숏판 만들래. 주제부터 같이 정하자."],
      ["네가 정해줘", "요즘 뭐가 되는지 보고 내가 골라온다", "숏판 만들래. 뭐가 좋을지 네가 골라줘."]
    ],
    horizontal: [
      ["찍어온 영상으로", "긴 원본을 챕터로 나눠 짠다", "롱판 만들래. 찍어온 영상 있어."],
      ["대본부터", "할 말을 정하고 거기 맞춰 붙인다", "롱판 만들래. 대본부터 같이 쓰자."],
      ["네가 정해줘", "요즘 뭐가 되는지 보고 골라온다", "롱판 만들래. 주제는 네가 골라줘."]
    ],
    issue: [
      ["던지고 싶은 게 있어", "주제만 말하면 찬반 구도까지 잡는다", "이슈 발제하고 싶어. 주제 같이 다듬자."],
      ["요즘 뜨는 것 중에서", "지금 갈라에서 갈리는 것들부터 본다", "요즘 갈라에서 뜨는 이슈 중에 발제할 거 골라줘."],
      ["내 글에서 뽑기", "내가 쓴 것 중 논쟁이 될 만한 걸 찾는다", "내가 쓴 것 중에 이슈로 만들 만한 거 있어?"]
    ],
    predict: [
      ["걸고 싶은 게 있어", "결과가 나올 일을 마켓으로 만든다", "예측 마켓 만들래. 걸 만한 거 같이 다듬자."],
      ["곧 결판날 것 중에서", "날짜가 정해진 것들부터 본다", "곧 결판날 일 중에 예측 마켓 만들 거 골라줘."],
      ["네가 골라줘", "사람들이 갈릴 만한 걸 찾아온다", "예측 마켓 뭐가 좋을지 네가 골라줘."]
    ],
    plaza: [
      ["하고 싶은 말이 있어", "말만 하면 읽히게 다듬는다", "광장에 글 쓸래. 하고 싶은 말 같이 다듬자."],
      ["짤·밈으로", "그림 한 장으로 끝내는 글", "광장에 짤로 글 쓸래."],
      ["네가 정해줘", "지금 반응 좋은 결로 잡아준다", "광장에 뭐 쓰면 좋을지 네가 정해줘."]
    ]
  };

  /* 🖥 전환 화면 + 아래 붙은 갈비스.
     ⚠️ 선택을 대화 칩으로만 하면 "화면"이 없고, 화면만 있으면 "갈비스랑"이 아니다. 둘 다다.
        위는 고르는 화면, 아래 절반은 갈비스 도킹 대화 — 고르면서 동시에 상의한다.
     ⚠️ 도킹은 friend.js 의 openDock 을 그대로 쓴다(반쪽 시트·키보드 추적이 이미 붙어 있다).
        GALLA_WORKFORM 을 노출해 두면 갈비스가 지금 무슨 화면인지도 안다. */
  var _el = null, _sf = null;

  function close() {
    try { window.GALLA_closeDock && window.GALLA_closeDock(); } catch (e) {}
    try { delete window.GALLA_WORKFORM; } catch (e) { window.GALLA_WORKFORM = null; }
    if (_el) { _el.remove(); _el = null; }
    document.body.classList.remove("ag-on");
    _sf = null;
  }

  function optRow(attr, name, desc, iconPath) {
    return '<button class="ag-opt" ' + attr + ">" + ico(iconPath) +
      '<span><span class="n">' + esc(name) + '</span><span class="d">' + esc(desc) + "</span></span></button>";
  }

  /* 2단계 — 판을 고른 뒤 '어떻게 시작할래'. 뒤로 갈 수 있어야 한다(잘못 고를 수 있다). */
  function step2(sf) {
    _sf = sf;
    var rows = NEXT[sf.k] || [];
    var body = _el.querySelector("#ag-body");
    body.innerHTML =
      '<button class="ag-back" data-back>← 다른 판 고르기</button>' +
      '<div class="ag-say" style="margin-top:10px">' + esc(sf.n) + ", 어떻게 시작할래?</div>" +
      '<div class="ag-sub">' + esc(sf.d) + "</div>" +
      '<div class="ag-sec">시작하는 방법</div>' +
      rows.map(function (r, n) {
        return optRow('data-ask="' + n + '"', r[0], r[1], '<path d="M9 6l6 6-6 6"/>');
      }).join("") +
      '<div class="ag-foot">고르기 애매하면 아래 갈비스한테 그냥 말해도 돼요.</div>';
    body.querySelector("[data-back]").addEventListener("click", function () { step1(); });
    body.querySelectorAll("[data-ask]").forEach(function (b) {
      b.addEventListener("click", function () {
        var r = rows[Number(this.dataset.ask)];
        /* '찍어온 걸로'는 재료가 이미 있으니 기획을 건너뛴다 — 있는 걸 두고 각도부터 고르라면 헛걸음이다.
           나머지는 기획으로 간다: 각도 셋을 근거·불리한 점과 함께 놓고 고르게 한다. */
        if (/찍어온|영상으로/.test(r[0])) {
          if (window.GALLA_friendAsk) window.GALLA_friendAsk(r[2]);
          var f = _el && _el.querySelector(".ag-foot");
          if (f) f.textContent = "갈비스한테 넘겼어요. 아래에서 이어서 얘기하면 돼요.";
          return;
        }
        step3(sf, r);
      });
    });
  }

  /* 3단계 · 기획 — 각도 셋을 근거와 함께. 그리고 불리한 점도 같이.
     ⚠️ 초안을 하나만 내밀면 사람은 그게 최선인지 알 수 없어 그냥 받거나 그냥 버린다.
        셋을 놓고 고르게 하면 "왜 이걸 골랐는지"가 남고, 그 선택이 다음 기획의 근거가 된다. */
  async function step3(sf, how) {
    var body = _el.querySelector("#ag-body");
    body.innerHTML =
      '<button class="ag-back" data-back>← 시작 방법 다시</button>' +
      '<div class="ag-say" style="margin-top:10px">어떤 각도로 갈까?</div>' +
      '<div class="ag-sub">' + esc(sf.n) + " · " + esc(how[0]) + "</div>" +
      '<div class="ag-sec">각도 세 개</div>' +
      '<div id="ag-angles"><div class="ag-load">갈비스가 생각하는 중…</div></div>' +
      '<div class="ag-foot">마음에 드는 게 없으면 아래 갈비스한테 그냥 말해도 돼요.</div>';
    body.querySelector("[data-back]").addEventListener("click", function () { step2(sf); });

    var angles = [];
    try {
      var c = sb(); var ss = await c.auth.getSession();
      var r = await fetch(c.supabaseUrl + "/functions/v1/galla-friend", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + ss.data.session.access_token, apikey: c.supabaseKey },
        body: JSON.stringify({ op: "plan", surface: sf.k })
      });
      var d = await r.json();
      angles = (d && d.angles) || [];
    } catch (e) { /* 실패해도 화면은 산다 */ }

    var box = _el && _el.querySelector("#ag-angles");
    if (!box) return;
    if (!angles.length) {
      box.innerHTML = '<div class="ag-load">각도를 못 뽑았어요. 아래 갈비스한테 하고 싶은 얘기를 그냥 말해주세요.</div>';
      if (window.GALLA_friendAsk) window.GALLA_friendAsk(how[2]);
      return;
    }
    box.innerHTML = angles.map(function (a, n) {
      return '<button class="ag-ang" data-ang="' + n + '">' +
        '<span class="t">' + esc(a.title) + "</span>" +
        (a.why ? '<span class="w"><span class="k">될 것 같은 이유</span><span>' + esc(a.why) + "</span></span>" : "") +
        (a.risk ? '<span class="r"><span class="k">불리한 점</span><span>' + esc(a.risk) + "</span></span>" : "") +
        "</button>";
    }).join("");
    box.querySelectorAll("[data-ang]").forEach(function (b) {
      b.addEventListener("click", function () {
        var a = angles[Number(this.dataset.ang)];
        /* 고른 각도를 그대로 들고 간다 — 갈비스가 처음부터 다시 묻지 않게. */
        if (window.GALLA_friendAsk) {
          window.GALLA_friendAsk(how[2] + " 각도는 이걸로 가자: \"" + a.title + "\" (" + (a.why || "") + ")");
        }
        var f = _el && _el.querySelector(".ag-foot");
        if (f) f.textContent = "이 각도로 갈비스한테 넘겼어요. 아래에서 이어서 얘기하면 돼요.";
      });
    });
  }

  /* 1단계 — 무슨 판을 만들지. 갈라는 숏판만 있는 곳이 아니다. */
  function step1() {
    _sf = null;
    var body = _el.querySelector("#ag-body");
    body.innerHTML =
      '<div class="ag-say">뭐 만들까?</div>' +
      '<div class="ag-sub">재료만 줘. 대본도 목소리도 내가 해볼게.<br>고르기 어려우면 아래 갈비스한테 물어봐.</div>' +
      '<div id="ag-resume"></div>' +
      '<div class="ag-sec">어느 판</div>' +
      SURFACES.map(function (s2, n) {
        return optRow('data-sf="' + n + '"', s2.n, s2.d, s2.i);
      }).join("") +
      '<div class="ag-foot">만드는 순간에만 값이 붙어요. 올리고 고르고 바꾸는 건 전부 무료입니다.</div>';
    body.querySelectorAll("[data-sf]").forEach(function (b) {
      b.addEventListener("click", function () { step2(SURFACES[Number(this.dataset.sf)]); });
    });
    resume();
  }

  /* 만들던 게 있으면 맨 위. 못 찾으면 사람은 처음부터 다시 만든다 — 제일 비싼 실패다. */
  async function resume() {
    var pend = await pendingJobs();
    var m = _el && _el.querySelector("#ag-resume");
    if (!pend.length || !m) return;
    m.innerHTML = '<div class="ag-sec">만들던 것</div>' +
      '<button class="ag-opt ag-go" data-resume="' + esc(pend[0].id) + '">' +
        ico('<path d="M5 4l14 8-14 8z"/>') +
        '<span><span class="n">이어서 하기 — 숏판 ' + pend.length + "개</span>" +
        '<span class="d">컷만 확인하면 바로 만들어져요</span></span></button>';
    m.querySelector("[data-resume]").addEventListener("click", function () {
      var id = this.dataset.resume; close();
      window.GALLA_openWorkbench && window.GALLA_openWorkbench(id);
    });
  }

  window.GALLA_openAgent = function () {
    if (!ENABLED) return;                    // 잠금 중엔 어떤 경로로도 안 열린다
    injectStyle();
    close();
    _el = document.createElement("div");
    _el.className = "ag";
    _el.innerHTML =
      '<button class="ag-x" aria-label="닫기">×</button>' +
      '<div class="ag-in"><div class="ag-orb"></div><div id="ag-body"></div></div>';
    document.body.appendChild(_el);
    document.body.classList.add("ag-on");
    _el.querySelector(".ag-x").addEventListener("click", close);
    step1();

    /* 🛠 갈비스가 지금 무슨 화면인지 알게 해두면, 도킹 대화가 맥락을 갖고 붙는다. */
    window.GALLA_WORKFORM = {
      type: "agent",
      getFields: function () { return { stage: _sf ? "how" : "surface", surface: _sf ? _sf.k : null }; },
      setFields: function () {},
      submit: function () {}
    };
    setTimeout(function () { window.GALLA_openDock && window.GALLA_openDock({ type: "agent" }); }, 260);
  };

  /* 🚪 '새로 만들기' 위에 문을 얹는다. 목록의 한 줄이 아니라, 나가는 입구로 보이게. */
  function portal() {
    var host = document.getElementById("crList");
    if (!host || host.querySelector(".ag-portal")) return;
    injectStyle();
    var b = document.createElement("button");
    b.className = "ag-portal" + (ENABLED ? "" : " ag-soon");
    b.innerHTML = '<span class="r"><span class="o"></span><span>' +
      '<span class="t">갈비스랑 만들기' + (ENABLED ? "" : ' <i class="ag-badge">곧 열려요</i>') + "</span>" +
      '<span class="s">' + (ENABLED
        ? "재료만 주면 대본·목소리까지 만들어 줘요"
        : "재료만 주면 대본·목소리까지 — 준비 중이에요") + "</span></span></span>" +
      '<span class="k">' + (ENABLED ? "›" : "") + "</span>";
    b.addEventListener("click", function () {
      if (ENABLED) { window.GALLA_openAgent(); return; }
      /* 막을 땐 이유를 말한다. 아무 반응 없는 버튼이 제일 나쁘다. */
      alert("갈비스랑 만들기는 아직 준비 중이에요.\n앱 정식 출시 뒤 바로 열립니다 🙂");
    });
    host.insertBefore(b, host.firstChild);
  }
  function scan() { portal(); }
  if (document.readyState !== "loading") setTimeout(scan, 300);
  else document.addEventListener("DOMContentLoaded", function () { setTimeout(scan, 300); });
  try { new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
})();
