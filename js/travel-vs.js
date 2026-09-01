/* =========================================================
   travel-vs.js — 어디 갈래 (여행지 16강)

   왜 만들었나: 여행 탭에 판정 0·한마디 0. 지금 장치가 "안 가본 곳을 평가하라"고
   묻고 있어서다 — 해외 여행지는 가본 한국인이 1%도 안 된다. 둘 중 하나 고르기는
   자격이 필요 없다. 가고 싶은 곳은 누구나 있다.

   ⚠️ 유입 0 에서 만드는 장치다. 그래서 **혼자 해도 끝까지 돌아가고, 결과가 밖으로
      나가야** 한다(갈라 궁합에서 배운 것). 로그인도 필요 없다.
   ⚠️ 결과는 DB 에 안 남긴다 — 주소(?r=)에 담는다. 링크만 있으면 언제든 다시 열린다.
   ⚠️ 16곳을 한 번에 받아 대진은 클라이언트가 돈다. 판마다 서버를 부르면 탭 반응이
      느려지고, 15판을 끝까지 하는 사람이 사라진다. 표는 뒤로 따로 보낸다.
   ========================================================= */
(function () {
  var sb = null, ROOT = null;
  var PAIRS = [];          // 1회전 8쌍
  var ROUND = [];          // 현재 회전의 대진(각 원소 = [a, b])
  var NEXT = [];           // 이번 회전 승자들
  var PICKS = [];          // {win, lose} 전체 기록 — 성향 계산에 쓴다
  var STAGE = 0;           // 0=16강 1=8강 2=4강 3=결승
  var IDX = 0, SHOWN_AT = 0, BUSY = false;
  var STAGE_NM = ["16강", "8강", "4강", "결승"];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c];
    });
  }
  async function client() {
    sb = sb || (window.waitForSupabaseClient ? await window.waitForSupabaseClient() : window.supabaseClient);
    return sb;
  }
  async function rpc(fn, args) {
    try { var r = await (await client()).rpc(fn, args || {}); return r && r.data; } catch (_) { return null; }
  }
  function flag(cc) {
    if (!cc || cc.length !== 2) return "";
    try {
      return String.fromCodePoint.apply(null, cc.toUpperCase().split("").map(function (c) {
        return 0x1f1e6 + c.charCodeAt(0) - 65;
      }));
    } catch (_) { return ""; }
  }
  /* 비로그인 신원 — 랭킹 오염을 막는 용도일 뿐 사람을 특정하지 않는다.
     로컬에만 있고 지우면 새로 생긴다. */
  function device() {
    try {
      var k = "galla_vs_dev", v = localStorage.getItem(k);
      if (!v) { v = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem(k, v); }
      return v;
    } catch (_) { return null; }
  }

  /* ── 성향 ──────────────────────────────────────────
     축을 둘 쓰려다 하나로 줄였다. '다 아는 곳 ↔ 아무도 모르는 곳'을 만들려고
     인증·크리에이터 구독자를 써 봤는데 둘 다 못 쓴다(실측):
       · 인증 = 이 풀에서 0곳(국가유산·유네스코엔 크리에이터 발자국이 없다)
       · 구독자 합 = 1,190만 채널이 간 곳이 '몬머스 커피 컴퍼니'다. 채널이 큰 것과
         장소가 유명한 것은 다른 얘기다.
     없는 신호를 억지로 쓰면 유형이 거짓말이 된다. 좌표는 예외 없이 정확하므로
     **거리 하나로** 간다. 결과의 주인공은 어차피 내가 고른 사진이다. */
  var TYPES = {
    DA: ["가까운 데서 잘 논다", "멀리 안 가도 된다. 비행 두 시간 안쪽에서 확실한 걸 고른다."],
    DB: ["서너 시간이 딱", "너무 가깝지도 멀지도 않게. 부담 없이 완전히 다른 데로 간다."],
    DC: ["멀리 가는 편", "한 번 가면 제대로. 열 시간 비행쯤은 감수한다."],
    DD: ["지구 반대편까지", "갈 거면 끝까지 간다. 남들이 엄두 못 내는 거리를 고른다."],
  };
  function typeKey() {
    if (!PICKS.length) return "DB";
    var avg = PICKS.reduce(function (s2, p) { return s2 + (Number(p.win.km) || 0); }, 0) / PICKS.length;
    return avg < 1000 ? "DA" : avg < 4000 ? "DB" : avg < 9000 ? "DC" : "DD";
  }
  function countries() {
    var set = {};
    PICKS.forEach(function (p) { if (p.win.country) set[p.win.country] = 1; });
    return Object.keys(set).length;
  }

  /* ── 대진 ─────────────────────────────────────────── */
  /* 이름이 곧 도시인 경우가 흔하다(뉴욕·로스앤젤레스). 그대로 두면 '뉴욕 · 뉴욕 · 미국'이 된다. */
  function where(p) {
    return [p.area, p.country].filter(Boolean)
      .filter(function (v) { return v !== p.name; })
      .filter(function (v, i, arr) { return arr.indexOf(v) === i; })
      .slice(0, 2).join(" · ");
  }
  function card(p, side) {
    var sub = where(p);
    return '<button type="button" class="tvs-card" data-side="' + side + '">' +
      '<img src="' + esc(p.cover) + '" alt="" referrerpolicy="no-referrer">' +
      (p.creators > 1 ? '<span class="tvs-who">유튜버 ' + p.creators + '명</span>' : "") +
      '<span class="tvs-nm"><b>' + esc(p.name) + "</b>" +
      "<span>" + flag(p.country_code) + " " + esc(sub) + "</span></span></button>";
  }

  function paint() {
    var m = ROUND[IDX];
    if (!m) return;
    var total = 15, done = PICKS.length;
    ROOT.innerHTML =
      '<div class="tvs-top">' +
        '<div class="tvs-bar"><i style="width:' + Math.round(done / total * 100) + '%"></i></div>' +
        '<div class="tvs-meta"><span class="tvs-stage">' + STAGE_NM[STAGE] + "</span>" +
        "<span>" + (done + 1) + " / " + total + "</span></div></div>" +
      '<div class="tvs-q">' + (STAGE === 3 ? "마지막. 어디로 갑니까?" : "둘 중 하나만 갈 수 있다면?") + "</div>" +
      '<div class="tvs-pair-wrap"><div class="tvs-pair">' +
        card(m[0], 0) + card(m[1], 1) +
      '</div><span class="tvs-vs">VS</span></div>' +
      '<div class="tvs-skip"><button type="button" id="tvs-skip">둘 다 모르겠다 →</button></div>';
    SHOWN_AT = Date.now();
    BUSY = false;
  }

  function choose(side) {
    if (BUSY) return;
    BUSY = true;
    var m = ROUND[IDX], win = m[side], lose = m[1 - side];
    var ms = Date.now() - SHOWN_AT;

    var els = ROOT.querySelectorAll(".tvs-card");
    if (els[side]) els[side].classList.add("pick");
    if (els[1 - side]) els[1 - side].classList.add("drop");

    PICKS.push({ win: win, lose: lose, stage: STAGE });
    NEXT.push(win);
    /* 표는 화면을 막지 않는다 — 실패해도 게임은 계속된다 */
    rpc("travel_vs_pick", { p_winner: win.id, p_loser: lose.id, p_ms: ms, p_device: device() });

    setTimeout(advance, 180);
  }
  function skip() {   // 모르는 짝은 버린다. 억지로 고르게 하면 랭킹이 더러워진다.
    if (BUSY) return;
    BUSY = true;
    var m = ROUND[IDX];
    NEXT.push(Math.random() < 0.5 ? m[0] : m[1]);
    PICKS.push({ win: NEXT[NEXT.length - 1], lose: m[0] === NEXT[NEXT.length - 1] ? m[1] : m[0],
                 stage: STAGE, skip: true });
    setTimeout(advance, 60);
  }

  function advance() {
    IDX++;
    if (IDX < ROUND.length) return paint();
    if (NEXT.length <= 1) return finish(NEXT[0]);
    var nx = [];
    for (var i = 0; i < NEXT.length; i += 2) nx.push([NEXT[i], NEXT[i + 1]]);
    ROUND = nx; NEXT = []; IDX = 0; STAGE++;
    paint();
  }

  /* ── 결과 ─────────────────────────────────────────── */
  function finish(champ) {
    /* 준우승 = 결승(stage 3)에서 진 곳, 4강 = 준결승(stage 2)에서 진 둘.
       ⚠️ 배열 끝에서 세면 안 된다 — 중간에 '모르겠다'로 건너뛴 판이 있으면 자리가 밀린다. */
    var at = function (st) {
      return PICKS.filter(function (p) { return p.stage === st; }).map(function (p) { return p.lose; });
    };
    var second = at(3)[0] || null;
    var semis = at(2);
    var runners = [second].concat(semis).filter(Boolean).slice(0, 3);
    var t = typeKey();
    var code = [champ.sid].concat(runners.map(function (r) { return r.sid; })).join(".") + "." + t;
    show(champ, runners, t, code);
    try { history.replaceState(null, "", location.pathname + "?r=" + code); } catch (_) {}
  }

  function show(champ, runners, t, code) {
    var ty = TYPES[t] || TYPES.DB;
    var sub = where(champ);
    ROOT.innerHTML =
      '<div class="tvs-res">' +
        '<div class="tvs-crown">내가 고른 1위</div>' +
        '<div class="tvs-win"><img src="' + esc(champ.cover) + '" alt="" referrerpolicy="no-referrer">' +
          '<span class="tvs-nm"><b>' + esc(champ.name) + "</b><span>" +
          flag(champ.country_code) + " " + esc(sub) + "</span></span></div>" +
        '<div class="tvs-type">' + esc(ty[0]) + "</div>" +
        '<div class="tvs-type-d">' + esc(ty[1]) +
          (countries() > 1 ? '<br><span class="tvs-cnt">' + countries() + "개 나라 중에서 골랐어요</span>" : "") +
        "</div>" +
        (runners.length
          ? '<div class="tvs-runners">' + runners.map(function (r) {
              return '<div class="tvs-run"><img src="' + esc(r.cover) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' +
                     "<b>" + esc(r.name) + "</b></div>";
            }).join("") + "</div>"
          : "") +
        '<div class="tvs-acts">' +
          '<button type="button" class="go" id="tvs-share">결과 공유하기</button>' +
          '<button type="button" id="tvs-detail">' + esc(champ.name) + ' 자세히 보기</button>' +
          '<button type="button" id="tvs-again">다시 하기</button>' +
        "</div>" +
        '<div class="tvs-note">고른 곳들은 “가고 싶은 여행지” 순위에 반영됩니다.</div>' +
      "</div>";
    ROOT.__code = code; ROOT.__champ = champ; ROOT.__type = ty;
  }

  /* 주소에 결과가 담겨 온 경우 — 공유 링크를 받은 사람이 보는 화면 */
  async function fromCode(code) {
    var parts = String(code).split(".");
    var t = parts.pop();
    var rows = await rpc("travel_vs_places", { p_sids: parts });
    if (!rows || !rows.length) return start();
    var by = {}; rows.forEach(function (r) { by[r.sid] = r; });
    var champ = by[parts[0]];
    if (!champ) return start();
    show(champ, parts.slice(1).map(function (s) { return by[s]; }).filter(Boolean), t, code);
  }

  async function start() {
    ROOT.innerHTML = '<div class="tvs-empty">대진 짜는 중…</div>';
    PAIRS = []; ROUND = []; NEXT = []; PICKS = []; STAGE = 0; IDX = 0;
    var d = await rpc("travel_vs_bracket");
    if (!d || !d.ok || !d.pairs || d.pairs.length < 8) {
      ROOT.innerHTML = '<div class="tvs-empty">아직 겨룰 곳이 부족해요.<br>수확이 더 돌면 열립니다.</div>';
      return;
    }
    ROUND = d.pairs;
    paint();
  }

  function wire() {
    if (ROOT.__wired) return;
    ROOT.__wired = true;
    ROOT.addEventListener("click", function (e) {
      var c = e.target.closest(".tvs-card");
      if (c) return choose(Number(c.dataset.side));
      if (e.target.closest("#tvs-skip")) return skip();
      if (e.target.closest("#tvs-again")) {
        try { history.replaceState(null, "", location.pathname); } catch (_) {}
        return start();
      }
      if (e.target.closest("#tvs-detail")) {
        var ch = ROOT.__champ; if (!ch) return;
        return (window.GALLA_nav || function (u) { location.href = u; })(
          "/travel/" + encodeURIComponent(ch.slug || "place") + "-" + ch.sid);
      }
      if (e.target.closest("#tvs-share")) {
        var base = window.GALLA_SITE || "https://galla.im";
        var url = base + "/share/travel-vs/" + encodeURIComponent(ROOT.__code || "");
        var ty = ROOT.__type || ["어디 갈래"];
        if (window.GALLA_share) {
          GALLA_share({ url: url, title: "어디 갈래", text: ty[0] + " — 내가 고른 여행지 1위는?" });
        } else if (navigator.share) {
          navigator.share({ title: "어디 갈래", url: url }).catch(function () {});
        }
      }
    });
  }

  async function boot(root, params) {
    ROOT = root || document.getElementById("tvs-page");
    if (!ROOT) return;
    wire();
    var code = (params && params.r) || new URLSearchParams(location.search).get("r") || "";
    if (/^[0-9a-f.]{8,}\.[A-Z]{2}$/.test(code)) return fromCode(code);
    return start();
  }

  window.GALLA_PAGE_TRAVEL_VS = {
    mount: function (root, params) { return boot(root && root.querySelector("#tvs-page"), params); },
    unmount: function () { ROOT = null; PICKS = []; ROUND = []; NEXT = []; },
  };
  if (!window.__gallaSPA) {
    document.addEventListener("DOMContentLoaded", function () { boot(null, {}); });
    if (document.readyState !== "loading") boot(null, {});
  }
})();
