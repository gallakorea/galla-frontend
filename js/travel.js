/* =========================================================
   travel.js — 여행 (전 세계)
   여행 유튜버가 실제로 간 곳을 모으고, "또 가냐"로 가른다.

   · 데이터는 남의 여행 지도를 긁지 않는다. 크리에이터 영상의 **설명란**에서 뽑고
     (harvest-travel-places), OSM·위키데이터·관광공사로 실재를 검증한다.
   · 판정 축이 맛집과 다르다 — 여행지는 안 가본 사람이 대다수라 추천/비추로 받으면
     표가 통째로 '가고 싶다'로 오염된다. 그래서 축을 둘로 가른다:
       가본 사람  → 또 간다 / 한 번이면 족   (경험자의 판정)
       안 가본 사람 → 가고 싶다 / 관심 없다   (수요·기대)
     둘의 낙차가 '과대평가 여행지' 랭킹이다. 상세는 travel_battle 마이그레이션 주석 참고.
   · 화면 규칙(2026-09-01 확정) — 이걸 어기면 화면이 다시 중구난방이 된다:
       ① **카드는 항상 '장소(spot)'다.** 나라·지역·도시는 카드가 아니라 내비게이션이다.
          (섞어 놓으면 '우간다' 카드와 '돈키호테 롯폰기점' 카드가 나란히 뜬다 — 실제로 그랬다)
       ② 둘러보기는 2계층: **나라 그리드 → (나라 선택) 지역 칩 + 장소 카드**.
       ③ **층마다 사진의 출처가 다르다.** 이게 화면의 구분성을 만든다:
          · 나라 카드 · 지역 카드 = 위키보이저 여행 배너(그 나라·도시의 가장 아름다운 컷).
            🚫 영상 썸네일 절대 금지 — 나라가 '영상'처럼 보인다(사장님 지적).
          · 장소 카드 = 장소 실사진 → 없으면 영상 썸네일(허용)
          · 누가 갔나 = 그 크리에이터의 영상 썸네일 + ▶ 배지, 16:9 (영상임을 형태로 말한다)
   · 🚨 지도는 아직 없다. tile.openstreetmap.org 는 OSM 재단이 **앱 배포에 쓰는 걸 금지**해서
     맛집도 출시 전 교체 과제로 남아 있다. 같은 빚을 하나 더 지지 않는다 —
     타일 문제가 풀리면 travel_map RPC 가 이미 준비돼 있으니 그때 붙인다.
   ========================================================= */
(function () {
  if (window.__gallaTravel) return;
  window.__gallaTravel = true;

  var SEC = null, LIST = null, CHIPS = null, CHIPS2 = null, DASH = null, DETAIL = null;
  var sb = null;
  /* 세그먼트는 둘뿐이다. '판정' 랭킹 탭은 사장님 지시로 뺐다 —
     "누적 투표로 갈리게 될 거니" 랭킹을 따로 화면으로 만들 필요가 없다.
     travel_rank RPC 는 그대로 살려둔다(표가 쌓이면 그때 어디든 붙일 수 있게). */
  var VIEW = "feed";          // feed | who
  var COUNTRY = null;         // 나라 필터(ISO2)
  var AREA = null;            // 나라 안의 광역 필터(도쿄도·교토부·온타리오주 …)
  var loading = false;

  /* 진영 라벨 — 화면 문구를 한 곳에 모은다. 네 곳에 흩어 놓으면 축이 조용히 갈라진다. */
  /* 판정은 **둘뿐**이다(사장님: 선택지가 너무 많다).
     '가고 싶다'는 판정이 아니라 찜(하트)으로 뺐고 '관심 없다'는 없앴다 — 누를 이유가 없다.
     want/pass 라벨은 옛 댓글의 진영 표시에만 남긴다. */
  var V = {
    again: { label: "또 간다",      tone: "hot"  },
    once:  { label: "한 번이면 족", tone: "cold" },
    want:  { label: "가고 싶다",    tone: "want" },
    pass:  { label: "관심 없다",    tone: "pass" },
  };

  /* ── 공용 ─────────────────────────────────────────── */
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
  function toast(m) { window.GALLA_toast ? GALLA_toast(m) : 0; }

  /* 영상 재생은 **앱 공용 경로 하나만** 쓴다(js/supabase.js 의 GALLA_openVideoPage).
     ⚠️ youtube.com 링크를 그대로 열면 앱(capacitor://localhost)에서 새 탭이 안 열리거나
        임베드가 오류 153 으로 죽는다 — 핫튜브가 그래서 프록시 재생 페이지를 만들었다.
        여기서 URL 을 따로 조립하면 화면마다 결과가 갈린다. */
  function playVideo(id, title, ch) {
    if (!id) return;
    if (window.GALLA_openVideoPage) return window.GALLA_openVideoPage(id, title || "", ch || "");
    var u = "watch.html?v=" + encodeURIComponent(id) +
            (title ? "&t=" + encodeURIComponent(title) : "") +
            (ch ? "&c=" + encodeURIComponent(ch) : "");
    (window.GALLA_nav || function (x) { location.href = x; })(u);
  }
  function needLogin() {
    if (confirm("로그인이 필요해요. 로그인할까요?")) (window.GALLA_nav || function (u) { location.href = u; })("login.html");
  }
  async function loggedIn() {
    try { var u = await (await client()).auth.getUser(); return !!(u && u.data && u.data.user); } catch (_) { return false; }
  }
  function flag(cc) {
    /* 국기 이모지는 국가코드 두 글자를 리저널 인디케이터로 옮기면 나온다 — 이미지가 필요 없다. */
    if (!cc || cc.length !== 2) return "🌍";
    try {
      return String.fromCodePoint.apply(null, cc.toUpperCase().split("").map(function (c) {
        return 0x1f1e6 + c.charCodeAt(0) - 65;
      }));
    } catch (_) { return "🌍"; }
  }
  var SCALE_TX = { country: "나라", region: "지역", city: "도시", spot: "" };
  var KIND_TX = { food: "🍽", stay: "🛏", activity: "🎟", spot: "" };

  /* ── 탭 안 섹션 ───────────────────────────────────── */
  function mount() {
    var panel = document.querySelector('.tab-panel[data-panel="travel"]');
    if (!panel || panel.querySelector(".tv-sec")) return false;

    SEC = document.createElement("div");
    SEC.className = "tv-sec";
    SEC.innerHTML =
      '<div class="tv-top">' +
        '<div class="tv-seg" id="tv-seg">' +
        '<button type="button" class="tv-sg on" data-view="feed">둘러보기</button>' +
        '<button type="button" class="tv-sg" data-view="who">누가 갔나</button>' +
      '</div>' +
        '<button type="button" class="tv-mapbtn" id="tv-openmap" aria-label="지도">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3 3 5.5v15L9 18l6 3 6-2.5v-15L15 6 9 3z"/><path d="M9 3v15M15 6v15"/></svg>' +
          "<span>지도</span></button>" +
      "</div>" +
      '<div class="tv-chips chip-scroll" id="tv-chips"></div>' +
      '<div class="tv-chips tv-chips2 chip-scroll" id="tv-chips2" hidden></div>' +
      '<div class="tv-dash" id="tv-dash" hidden></div>' +
      '<div class="tv-list" id="tv-list"></div>';
    panel.appendChild(SEC);

    grab(panel);
    wire();
    return true;
  }

  /* 참조와 리스너를 갈라 놓는다.
     ⚠️ SPA 스냅샷이 패널을 통째로 복원하면 .tv-sec 마크업은 돌아오지만 그 DOM 은 **새 노드**다.
        예전엔 재부팅 경로가 참조만 다시 잡고 리스너를 안 붙여서, 화면은 멀쩡한데
        나라 카드를 눌러도 아무 일이 없었다(실측 2026-09-01). 둘을 항상 같이 한다. */
  function grab(panel) {
    SEC = panel.querySelector(".tv-sec");
    CHIPS = SEC.querySelector("#tv-chips");
    CHIPS2 = SEC.querySelector("#tv-chips2");
    DASH = SEC.querySelector("#tv-dash");
    LIST = SEC.querySelector("#tv-list");
  }

  function wire() {
    /* ⚠️ 가드를 data- 속성으로 두면 안 된다. 스냅샷이 마크업을 직렬화해 복원할 때
       data-wired="1" 까지 같이 살아나서, 리스너가 없는 새 DOM 이 '이미 붙었다'고 주장한다.
       JS 프로퍼티는 직렬화되지 않으므로 복원된 노드에선 항상 false 다. */
    if (!SEC || SEC.__tvWired) return;
    SEC.__tvWired = true;

    SEC.querySelector("#tv-openmap").addEventListener("click", openMap);
    DASH.addEventListener("click", async function (e) {
      var tb = e.target.closest("[data-dtab]");
      if (tb) { DASH_TAB = tb.dataset.dtab; paintDash(); return; }
      var cc = e.target.closest("[data-country]");
      if (cc) { COUNTRY = cc.dataset.country; AREA = null;
                await loadAreas(); paintChips(); paintDash(); load(); return; }
      var pl = e.target.closest("[data-place]");
      if (pl) openDetail(pl.dataset.place);
    });
    SEC.querySelector("#tv-seg").addEventListener("click", function (e) {
      var b = e.target.closest(".tv-sg"); if (!b) return;
      VIEW = b.dataset.view;
      SEC.querySelectorAll(".tv-sg").forEach(function (x) { x.classList.toggle("on", x === b); });
      paintChips(); paintDash(); load();
    });
    CHIPS.addEventListener("click", async function (e) {
      var b = e.target.closest(".tv-chip"); if (!b) return;
      if (b.dataset.areaBack) { AREA = null; paintChips(); load(); return; }   // 지역 → 나라
      COUNTRY = b.dataset.cc || null;
      AREA = null;                    // 나라가 바뀌면 지역 선택은 버린다
      await loadAreas();
      paintChips(); paintDash(); load();
    });
    CHIPS2.addEventListener("click", function (e) {
      var b = e.target.closest(".tv-chip"); if (!b) return;
      AREA = b.dataset.area || null;
      paintChips(); load();
    });
    LIST.addEventListener("click", async function (e) {
      var cc = e.target.closest("[data-country]");
      if (cc) {
        COUNTRY = cc.dataset.country; AREA = null;
        await loadAreas(); paintChips(); paintDash(); load();
        try { LIST.scrollIntoView({ block: "start" }); } catch (_) {}
        return;
      }
      var cr = e.target.closest("[data-creator]");
      if (cr) { openCreator(cr.dataset.creator); return; }
      var ar = e.target.closest("[data-area]");
      if (ar) { AREA = ar.dataset.area; paintChips(); load(); return; }
      if (e.target.closest("[data-area-all]")) { AREA = "*"; paintChips(); load(); return; }
      var card = e.target.closest("[data-place]");
      if (card) openDetail(card.dataset.place);
    });
  }

  /* ── 칩 ───────────────────────────────────────────── */
  var COUNTRIES = [];
  async function loadCountries() {
    var r = await rpc("travel_country_cards", { p_limit: 40 });
    COUNTRIES = (r && r.countries) || [];
  }
  function countryOf(code) {
    for (var i = 0; i < COUNTRIES.length; i++) if (COUNTRIES[i].code === code) return COUNTRIES[i];
    return null;
  }
  var AREAS = [];
  async function loadAreas() {
    /* 지역은 '칩'이 아니라 '그리드'로 보여준다 — 칩과 그리드가 같은 일을 두 번 하면
       유저는 무엇을 눌러야 할지 모른다(사장님: 중구난방). 여기선 카드용 데이터를 받는다. */
    if (!COUNTRY) { AREAS = []; return; }
    var r = await rpc("travel_area_cards", { p_country: COUNTRY, p_limit: 30 });
    AREAS = (r && r.areas) || [];
  }
  function paintChips() {
    if (!CHIPS) return;
    /* 나라를 고르기 전엔 칩이 없다 — 나라 선택은 그리드가 맡는다.
       칩과 그리드가 같은 일을 두 번 하면 유저는 뭘 눌러야 할지 모른다. */
    var html = "";
    if (VIEW === "feed" && COUNTRY) {
      var c = countryOf(COUNTRY);
      var cname = (c && c.name) || COUNTRY;
      html = '<button type="button" class="tv-chip back" data-cc="">← 전체 나라</button>' +
        (AREA
          ? '<button type="button" class="tv-chip back" data-area-back="1">' + flag(COUNTRY) + " " + esc(cname) + "</button>" +
            '<span class="tv-crumb">' + esc(AREA === "*" ? "전체 장소" : AREA) + "</span>"
          : '<span class="tv-crumb">' + flag(COUNTRY) + " " + esc(cname) + "</span>");
    }
    CHIPS.innerHTML = html;
    CHIPS.hidden = !html;

    if (CHIPS2) { CHIPS2.innerHTML = ""; CHIPS2.hidden = true; }   // 지역은 그리드가 맡는다
  }

  /* ── 대시보드 ─────────────────────────────────────────
     사장님: "나라들 위에 데이터를 보여주면 좋겠다. 인기 여행지, 유튜버 최다 방문 같은."
     ⚠️ 유저 표(또 간다/찜)는 아직 0이다. 그걸로 '인기 여행지'를 만들면 빈 화면이거나 거짓말이다.
        우리가 실제로 가진 건 **크리에이터의 발자국**이라 세 축으로 간다:
          겹친 곳(여러 유튜버가 간 곳) / 최근 다녀간 곳 / 유튜버가 많이 간 나라.
        표가 쌓이면 '또 간다 랭킹'을 여기 얹는다(travel_rank 가 이미 있다). */
  var DASH_DATA = null, DASH_TAB = "recent";
  async function loadDash() {
    DASH_DATA = await rpc("travel_dashboard", { p_n: 12 });
  }
  function paintDash() {
    if (!DASH) return;
    var show = VIEW === "feed" && !COUNTRY && DASH_DATA && DASH_DATA.ok;
    if (!show) { DASH.hidden = true; DASH.innerHTML = ""; return; }
    var d = DASH_DATA, t = d.totals || {};
    /* 겹친 곳이 아직 없으면 그 탭 자체를 안 만든다 — 눌렀는데 비어 있는 탭이 제일 나쁘다. */
    var tabs = [];
    if ((d.multi || []).length) tabs.push(["multi", "🔥 여러 유튜버가 간 곳"]);
    tabs.push(["recent", "🆕 최근 다녀간 곳"]);
    if ((d.certs || []).length) tabs.push(["certs", "🏛 인증 여행지"]);
    tabs.push(["countries", "🌍 유튜버가 많이 간 나라"]);
    if (!tabs.some(function (x) { return x[0] === DASH_TAB; })) DASH_TAB = tabs[0][0];

    var body = "";
    if (DASH_TAB === "countries") {
      body = (d.countries || []).map(function (c) {
        return '<button type="button" class="tv-dc" data-country="' + esc(c.code) + '">' +
          '<span class="tv-dc-f">' + flag(c.code) + "</span>" +
          '<span class="tv-dc-n">' + esc(c.name || c.code) + "</span>" +
          '<span class="tv-dc-s">' + c.n + "곳 · " + c.chn + "명</span></button>";
      }).join("");
    } else {
      var list = DASH_TAB === "multi" ? (d.multi || [])
               : DASH_TAB === "certs" ? (d.certs || []) : (d.recent || []);
      body = list.map(function (p) {
        var badge = DASH_TAB === "multi" ? p.n + "명 다녀감"
                  : DASH_TAB === "certs" ? ((p.emoji || "🏛") + " " + (p.cert || "인증"))
                  : (String(p.at || "").slice(0, 10).replace(/-/g, ".").slice(2));
        return '<button type="button" class="tv-dp" data-place="' + esc(p.id) + '">' +
          '<span class="tv-dp-i">' +
            (p.cover ? '<img src="' + esc(p.cover) + '" alt="" loading="lazy" referrerpolicy="no-referrer">'
                     : '<span class="tv-ph">' + flag(p.country_code) + "</span>") +
            '<i class="tv-dp-b">' + esc(badge) + "</i></span>" +
          '<span class="tv-dp-n">' + esc(p.name) + "</span>" +
          '<span class="tv-dp-s">' + flag(p.country_code) + " " +
            esc([p.area, p.country].filter(Boolean)[0] || "") + "</span></button>";
      }).join("");
    }

    DASH.hidden = false;
    DASH.innerHTML =
      '<div class="tv-dash-t">여행 유튜버 <b>' + (t.creators || 0) + "명</b>이 다녀간 <b>" +
        (t.places || 0) + "곳</b> · " + (t.countries || 0) + "개국" +
        '<span class="tv-dash-v">영상 ' + (t.videos || 0).toLocaleString() + "편에서 뽑는 중</span></div>" +
      '<div class="tv-dash-tabs">' + tabs.map(function (x) {
        return '<button type="button" class="tv-dash-tb' + (DASH_TAB === x[0] ? " on" : "") +
          '" data-dtab="' + x[0] + '">' + x[1] + "</button>";
      }).join("") + "</div>" +
      '<div class="tv-dash-row chip-scroll">' + body + "</div>";
  }

  /* ── 나라 카드 ────────────────────────────────────────
     커버는 **그 나라 장소의 실사진**만 쓴다. 영상 썸네일을 쓰면 나라가 '영상'처럼 보인다. */
  function countryHTML(c) {
    var names = (c.names || []).slice(0, 3).join(" · ");
    return '<button type="button" class="tv-cc" data-country="' + esc(c.code) + '">' +
      '<div class="tv-cc-img">' +
        (c.cover ? '<img src="' + esc(c.cover) + '" alt="" loading="lazy" referrerpolicy="no-referrer">'
                 : '<span class="tv-ph">' + flag(c.code) + "</span>") +
        '<span class="tv-cc-flag">' + flag(c.code) + "</span>" +
      "</div>" +
      '<div class="tv-cc-b">' +
        '<div class="tv-cc-n">' + esc(c.name || c.code) + "</div>" +
        '<div class="tv-cc-s">' +
          (c.spots ? c.spots + "곳 · 크리에이터 " + c.creators + "명" : "곧 채워져요") + "</div>" +
        (names ? '<div class="tv-cc-p">' + esc(names) + "</div>" : "") +
      "</div></button>";
  }

  /* 지역 = **정사각 타일**(사진 위에 글자).
     띠(가로 밴드)로 만들었더니 '목록'처럼 읽혀서 고르는 층이라는 느낌이 약했다(사장님 지적).
     나라는 2:1 와이드 + 글자가 사진 **아래**, 지역은 1:1 + 글자가 사진 **위** —
     비율과 글자 위치 두 가지가 동시에 달라서 층이 헷갈리지 않는다. */
  function areaHTML(a) {
    return '<button type="button" class="tv-tile" data-area="' + esc(a.name) + '"' +
      (a.cover ? ' style="background-image:linear-gradient(180deg,rgba(0,0,0,.05) 40%,rgba(0,0,0,.78)),url(' +
                 esc(a.cover).replace(/"/g, "%22") + ')"' : "") + ">" +
      '<span class="tv-tile-n">' + esc(a.name) + "</span>" +
      '<span class="tv-tile-s">' + a.spots + "곳" +
        (a.creators ? " · 크리에이터 " + a.creators + "명" : "") + "</span></button>";
  }

  /* ── 목록 ─────────────────────────────────────────── */
  function cardHTML(p) {
    /* 나라를 이미 고른 화면에서 나라명을 또 붙이면 줄이 지저분해진다 —
       칩에 '🇯🇵 일본'이 이미 떠 있다. 지역만 남긴다. */
    var sub = [p.admin1, p.city, COUNTRY ? null : p.country].filter(Boolean)
                .filter(function (v, i, arr) { return arr.indexOf(v) === i; })
                .join(" · ");
    var badge = SCALE_TX[p.scale] || KIND_TX[p.kind] || "";
    var a = p.again || 0, o = p.once || 0, w = p.want || 0;
    var votes = a + o > 0
      ? '<span class="tv-v hot">또 간다 ' + Math.round(a * 100 / (a + o)) + "%</span>" +
        '<span class="tv-vn">가본 사람 ' + (a + o) + "명</span>"
      : (w > 0 ? '<span class="tv-v want">♡ ' + w + "</span>" : '<span class="tv-vn">아직 표 없음</span>');
    /* 인증(유네스코 등)은 카드 오른쪽 위에 이모지 하나로. 맛집의 '인증' 세그먼트와 같은 자리다. */
    var cert = (p.certs || [])[0];
    return '<article class="tv-card" data-place="' + esc(p.id) + '">' +
      '<div class="tv-thumb">' +
        (p.cover ? '<img src="' + esc(p.cover) + '" alt="" loading="lazy" referrerpolicy="no-referrer">'
                 : '<span class="tv-ph">' + flag(p.country_code) + "</span>") +
        (badge ? '<span class="tv-badge">' + badge + "</span>" : "") +
        (cert ? '<span class="tv-cert">' + esc(cert) + "</span>" : "") +
      "</div>" +
      '<div class="tv-body">' +
        '<div class="tv-name">' + esc(p.name) + "</div>" +
        '<div class="tv-sub">' + flag(p.country_code) + " " + esc(sub) + "</div>" +
        '<div class="tv-meta">' + votes + "</div>" +
        (p.channels && p.channels.length
          ? '<div class="tv-ch">' + esc(p.channels.slice(0, 2).join(" · ")) +
            (p.channels.length > 2 ? " 외 " + (p.channels.length - 2) : "") + " 다녀감</div>"
          : "") +
      "</div></article>";
  }

  async function load() {
    if (!LIST || loading) return;
    loading = true;
    LIST.innerHTML = '<div class="tv-empty">불러오는 중…</div>';
    try {
      if (VIEW === "who") {
        var b = await rpc("travel_browse", { p_per: 8, p_channels: 14 });
        var secs = (b && b.sections) || [];
        LIST.innerHTML = secs.length ? secs.map(function (s) {
          return '<section class="tv-who">' +
            '<button type="button" class="tv-who-h" data-creator="' + esc(s.slug) + '">' +
              (s.thumb ? '<img src="' + esc(s.thumb) + '" alt="" referrerpolicy="no-referrer">' : "") +
              '<span><span class="tv-who-n">' + esc(s.name) + "</span>" +
              '<span class="tv-who-s">' + s.total + "곳" +
              (s.visited ? " · 내가 간 곳 " + s.visited : "") + "</span></span>" +
              '<span class="tv-who-x">›</span>' +
            "</button>" +
            '<div class="tv-row chip-scroll">' + s.places.map(function (p) {
              /* 16:9 + ▶ 배지 — '이건 그 사람이 찍은 화면'이라고 형태로 말한다.
                 둘러보기의 정사각 실사진과 한눈에 갈린다. */
              return '<button type="button" class="tv-mini" data-place="' + esc(p.id) + '">' +
                '<span class="tv-mini-i">' +
                  (p.cover ? '<img src="' + esc(p.cover) + '" alt="" loading="lazy" referrerpolicy="no-referrer">'
                           : '<span class="tv-ph">🌍</span>') +
                  '<i class="tv-play"></i></span>' +
                '<span class="tv-mini-n">' + esc(p.name) + "</span>" +
                '<span class="tv-mini-s">' + esc([p.city, p.country].filter(Boolean)[0] || "") + "</span></button>";
            }).join("") + "</div></section>";
        }).join("") : '<div class="tv-empty">아직 연결된 크리에이터가 없어요.</div>';
      } else if (!COUNTRY) {
        /* 1계층 — 나라 그리드. 여행은 '어디 나라 갈까'에서 시작한다. */
        LIST.innerHTML = COUNTRIES.length
          ? '<div class="tv-grid">' + COUNTRIES.map(countryHTML).join("") + "</div>"
          : '<div class="tv-empty">아직 모인 곳이 없어요.</div>';
      } else if (!AREA) {
        /* 2계층 — 그 나라의 지역(도쿄도·교토부). 여기까지가 '어디로 갈까'의 층이다.
           지역이 하나뿐이면 층을 하나 세울 이유가 없다 — 바로 장소로 내려간다. */
        if (AREAS.length === 1) { AREA = AREAS[0].name; return await load(); }
        var all = '<button type="button" class="tv-all" data-area-all="1">이 나라 장소 전부 보기 →</button>';
        LIST.innerHTML = AREAS.length
          ? '<div class="tv-grid">' + AREAS.map(areaHTML).join("") + all + "</div>"
          : '<div class="tv-empty">아직 이 나라에 장소가 없어요. 크리에이터가 다녀가면 채워집니다.</div>';
      } else {
        /* 2계층 — 그 나라의 장소만. scale='spot' 고정이라 나라·지역 행이 섞이지 않는다. */
        var f = await rpc("travel_feed", {
          p_scale: "spot", p_country: COUNTRY,
          p_area: AREA === "*" ? null : AREA, p_limit: 40 });
        var fp = (f && f.places) || [];
        LIST.innerHTML = fp.length ? fp.map(cardHTML).join("")
          : '<div class="tv-empty">이 지역엔 아직 장소가 없어요. 크리에이터가 다녀가면 채워집니다.</div>';
      }
    } finally { loading = false; }
  }

  /* ── 지도 ─────────────────────────────────────────────
     사장님: "지도상에서 그 여행 크리에이터가 간 곳을 맛집처럼 정확히 찍어."

     🗺 백엔드 선택 (2026-09-01)
       · 구글 Maps JS  — 동적 지도 월 1만 로드 무료, 이후 1,000로드당 약 $7. 전 세계 서비스에 얹기엔 비싸다.
       · 네이버 지도    — 무료지만 **해외가 사실상 비어 있다**. 게다가 등록 도메인에서만 인증을 내주는데
                         앱 origin 은 capacitor://localhost 라 등록 자체가 안 된다(맛집에서 백지로 확인).
       · tile.openstreetmap.org — OSM 재단이 **앱 배포 사용을 금지**한다. 맛집이 진 빚이다. 안 쓴다.
       → MapLibre GL + OpenFreeMap. 키 없음·요청 제한 없음·전 세계 벡터 타일, 비용 0.
         표시 의무는 © OpenStreetMap contributors 하나다.

     ⚠️ 전체화면 오버레이여야 한다. 탭 패널 안에 인라인으로 넣으면 지도 드래그가
        셸 탭 스와이프로 새어나가 탭이 멋대로 넘어간다(맛집에서 겪은 사고).
        nav.js 의 overlayOpen() 에 '.tv-map.open' 이 등록돼 있어야 이 방어가 성립한다. */
  var MAPBOX = null, MAP = null, MARKERS = [], mapLoading = null;
  var STYLE = "https://tiles.openfreemap.org/styles/liberty";

  function loadMapLibre() {
    if (window.maplibregl) return Promise.resolve();
    if (mapLoading) return mapLoading;
    mapLoading = new Promise(function (res, rej) {
      var css = document.createElement("link");
      css.rel = "stylesheet"; css.href = "vendor/maplibre-gl.css";
      document.head.appendChild(css);
      var sc = document.createElement("script");
      sc.src = "vendor/maplibre-gl.js";   /* CSP 가 script-src 'self' 라 CDN 은 못 쓴다 — 로컬 벤더링 */
      sc.onload = function () { window.maplibregl ? res() : rej(new Error("no_maplibre")); };
      sc.onerror = function () { rej(new Error("maplibre_load_fail")); };
      document.head.appendChild(sc);
    });
    return mapLoading;
  }

  function buildMapBox() {
    if (MAPBOX && document.body.contains(MAPBOX)) return MAPBOX;
    MAPBOX = document.createElement("div");
    MAPBOX.className = "tv-map";
    MAPBOX.innerHTML =
      '<div class="tv-map-c" id="tv-map-c"></div>' +
      '<button type="button" class="tv-map-x" id="tv-map-x" aria-label="닫기">✕</button>' +
      '<div class="tv-map-hint" id="tv-map-hint">여행 유튜버가 간 곳</div>' +
      '<div class="tv-trips chip-scroll" id="tv-trips"></div>' +
      '<div class="tv-routes chip-scroll" id="tv-routes"></div>';
    document.body.appendChild(MAPBOX);
    MAPBOX.querySelector("#tv-map-x").addEventListener("click", closeMap);
    MAPBOX.querySelector("#tv-routes").addEventListener("click", function (e) {
      var b = e.target.closest("[data-route]"); if (!b) return;
      TRIP = null;                       // 크리에이터를 바꾸면 여정 선택은 버린다
      drawRoute(b.dataset.route || null);
    });
    MAPBOX.querySelector("#tv-trips").addEventListener("click", function (e) {
      var b = e.target.closest("[data-trip]"); if (!b) return;
      TRIP = b.dataset.trip ? Number(b.dataset.trip) : null;
      paintRoute();
    });
    return MAPBOX;
  }
  function closeMap() {
    if (!MAPBOX) return;
    MAPBOX.classList.remove("open");
    document.body.classList.remove("tv-lock");
  }

  async function openMap() {
    var box = buildMapBox();
    box.classList.add("open");
    document.body.classList.add("tv-lock");
    try { await loadMapLibre(); }
    catch (_) { toast("지도를 불러오지 못했어요."); closeMap(); return; }

    /* ⚠️ 오버레이를 여는 **그 프레임**에 지도를 만들면 컨테이너 높이가 아직 0/부분값이라
       MapLibre 가 그 크기로 캔버스를 굳힌다(실측: 화면 위 215px 만 그려지고 아래는 검정).
       레이아웃이 한 번 돌 때까지 기다렸다가 만들고, 그 뒤에도 크기 변화를 계속 따라간다. */
    await new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); });

    if (!MAP) {
      MAP = new maplibregl.Map({
        container: "tv-map-c",
        style: STYLE,
        center: [30, 25], zoom: 1.4,
        attributionControl: { compact: true },
      });
      MAP.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
      /* moveend 마다 bbox 로 다시 물어본다 — 전 세계를 한 번에 내려받으면 안 된다. */
      MAP.on("moveend", refreshPins);
      MAP.on("load", function () { MAP.resize(); refreshPins(); loadRouteChips(); });
      /* dvh 는 주소창이 접히고 펴질 때 값이 바뀐다 — 그때마다 다시 맞춘다.
         이게 없으면 스크롤 한 번에 지도 아래가 잘린 채로 남는다. */
      try {
        new ResizeObserver(function () { if (MAP) MAP.resize(); })
          .observe(document.getElementById("tv-map-c"));
      } catch (_) {
        window.addEventListener("resize", function () { if (MAP) MAP.resize(); });
      }
    } else {
      MAP.resize();
      ROUTE ? paintRoute() : refreshPins();
      loadRouteChips();
    }
  }

  /* ── 크리에이터 여정 ───────────────────────────────────
     Polarsteps 가 하는 것: 다녀온 점을 시간순으로 이어 선으로 만든다.
     우리는 새로 모을 게 없다 — (채널, 영상, 방영일)과 좌표가 이미 다 있다.
     ⚠️ 경로 모드에선 bbox 핀 갱신을 멈춘다. 안 그러면 지도를 움직일 때마다
        경로 마커 위에 일반 핀이 겹쳐 쌓여 선이 안 보인다. */
  var ROUTE = null;                 // 선택된 채널 slug (null = 전체 핀 모드)
  var TRIP = null;                  // 선택된 여정 번호 (null = 전 여정)
  var ROUTE_DATA = null;            // 마지막으로 받은 travel_route 응답
  var ROUTE_MARKERS = [];

  async function loadRouteChips() {
    var r = await rpc("travel_route_channels", { p_limit: 20 });
    var chans = (r && r.channels) || [];
    var box = document.getElementById("tv-routes");
    if (!box) return;
    box.innerHTML =
      '<button type="button" class="tv-rchip' + (ROUTE ? "" : " on") + '" data-route="">전체</button>' +
      chans.map(function (c) {
        return '<button type="button" class="tv-rchip' + (ROUTE === c.slug ? " on" : "") +
          '" data-route="' + esc(c.slug) + '">' +
          (c.thumb ? '<img src="' + esc(c.thumb) + '" alt="" referrerpolicy="no-referrer">' : "") +
          esc(c.name) + " <i>" + c.n + "</i></button>";
      }).join("");
  }

  function clearRoute() {
    ROUTE_MARKERS.forEach(function (m) { m.remove(); });
    ROUTE_MARKERS = [];
    try {
      if (MAP.getLayer("tv-route-line")) MAP.removeLayer("tv-route-line");
      if (MAP.getLayer("tv-route-glow")) MAP.removeLayer("tv-route-glow");
      if (MAP.getSource("tv-route")) MAP.removeSource("tv-route");
    } catch (_) {}
  }

  async function drawRoute(slug) {
    if (!MAP) return;
    ROUTE = slug || null;
    loadRouteChips();
    clearRoute();
    if (!ROUTE) {                                   // 전체 핀 모드로 복귀
      ROUTE_DATA = null; paintTripChips();
      refreshPins(); return;
    }
    MARKERS.forEach(function (m) { m.remove(); });
    MARKERS = [];
    ROUTE_DATA = await rpc("travel_route", { p_channel: ROUTE, p_limit: 200 });
    TRIP = null;
    paintTripChips();
    paintRoute();
  }

  /* 여정 칩 — 점이 둘 이상인 여정만 고를 수 있게 한다(한 점짜리는 선이 안 그려진다). */
  function paintTripChips() {
    var box = document.getElementById("tv-trips");
    if (!box) return;
    var trips = ((ROUTE_DATA && ROUTE_DATA.trips) || []).filter(function (t) { return t.n >= 2; });
    if (!ROUTE_DATA || !trips.length) { box.innerHTML = ""; box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML =
      '<button type="button" class="tv-tchip' + (TRIP ? "" : " on") + '" data-trip="">전 여정</button>' +
      trips.map(function (t) {
        var d = String(t.from || "").slice(2, 7).replace("-", ".");   // 26.03
        var cs = (t.countries || []).join("·");
        return '<button type="button" class="tv-tchip' + (TRIP === t.trip ? " on" : "") +
          '" data-trip="' + t.trip + '">' + esc(d) + " " + esc(cs) + " <i>" + t.n + "곳</i></button>";
      }).join("");
  }

  /* 같은 날짜(=같은 영상)에서 나온 점들은 방영일이 같아 순서가 아무렇게나 정해진다.
     그대로 이으면 한 도시 안에서 선이 지그재그로 엉킨다(사장님: 뒤죽박죽 난리).
     → **날짜가 같은 구간만** 직전 점에서 가까운 순으로 다시 세운다(그리디 최근접).
     ⚠️ 날짜가 다른 점들의 순서는 절대 안 건드린다 — 그건 실제 여행 순서다. */
  function tidyOrder(steps) {
    var day = function (s) { return String(s.aired_at || "").slice(0, 10); };
    var out = [], i = 0;
    while (i < steps.length) {
      var j = i;
      while (j + 1 < steps.length && day(steps[j + 1]) === day(steps[i]) && day(steps[i])) j++;
      if (j === i) { out.push(steps[i]); i++; continue; }
      var run = steps.slice(i, j + 1);
      var cur = out.length ? out[out.length - 1] : run[0];
      var left = run.slice(), seq = [];
      while (left.length) {
        var best = 0, bd = Infinity;
        for (var k = 0; k < left.length; k++) {
          var dx = Number(left[k].lat) - Number(cur.lat), dy = Number(left[k].lon) - Number(cur.lon);
          var d = dx * dx + dy * dy;                       // 정렬만 하면 되니 제곱거리로 충분
          if (d < bd) { bd = d; best = k; }
        }
        cur = left[best]; seq.push(cur); left.splice(best, 1);
      }
      out = out.concat(seq);
      i = j + 1;
    }
    return out.map(function (s, idx) { return Object.assign({}, s, { n: idx + 1 }); });
  }

  /* 🚩 여정마다 선을 끊는다. 이걸 안 하면 6년치가 한 줄로 이어져 선이 지구를 여러 번 가로지른다
     (빠니보틀 41점 실측). MultiLineString 하나에 여정별 좌표 묶음을 넣으면 레이어는 하나로 끝난다. */
  function paintRoute() {
    if (!MAP || !ROUTE_DATA) return;
    clearRoute();
    paintTripChips();
    var raw = (ROUTE_DATA.steps || []).filter(function (s) {
      return TRIP == null || s.trip === TRIP;
    });
    /* 여정별로 나눠 정돈한 뒤 다시 합친다 — 여정을 넘나들며 정렬하면 안 된다. */
    var byT = {}, order = [];
    raw.forEach(function (s) {
      if (!(s.trip in byT)) { byT[s.trip] = []; order.push(s.trip); }
      byT[s.trip].push(s);
    });
    var steps = [];
    order.forEach(function (t) { steps = steps.concat(tidyOrder(byT[t])); });
    var hint = document.getElementById("tv-map-hint");
    if (!steps.length) { if (hint) hint.textContent = "그릴 경로가 없어요"; return; }

    var byTrip = {};
    steps.forEach(function (s) { (byTrip[s.trip] = byTrip[s.trip] || []).push([Number(s.lon), Number(s.lat)]); });
    var lines = Object.keys(byTrip).map(function (k) { return byTrip[k]; })
                      .filter(function (c) { return c.length >= 2; });

    if (lines.length) {
      MAP.addSource("tv-route", {
        type: "geojson",
        data: { type: "Feature", geometry: { type: "MultiLineString", coordinates: lines } },
      });
      MAP.addLayer({ id: "tv-route-glow", type: "line", source: "tv-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#38d6b0", "line-width": 8, "line-opacity": 0.22 } });
      MAP.addLayer({ id: "tv-route-line", type: "line", source: "tv-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#38d6b0", "line-width": 2.4, "line-dasharray": [2, 1.4] } });
    }

    steps.forEach(function (st) {
      var el = document.createElement("button");
      el.type = "button";
      el.className = "tv-step" + (st.n === 1 ? " first" : "");
      el.innerHTML = '<span class="tv-step-n">' + st.n + "</span>";
      el.title = st.n + ". " + st.name + (st.city ? " · " + st.city : "");
      el.addEventListener("click", function (e) { e.stopPropagation(); openDetail(st.id); });
      ROUTE_MARKERS.push(new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([Number(st.lon), Number(st.lat)]).addTo(MAP));
    });

    var coords = steps.map(function (s) { return [Number(s.lon), Number(s.lat)]; });
    var b = coords.reduce(function (acc, c) { return acc.extend(c); },
      new maplibregl.LngLatBounds(coords[0], coords[0]));
    MAP.fitBounds(b, { padding: 56, duration: 700, maxZoom: 9 });

    if (hint) {
      var t = TRIP && (ROUTE_DATA.trips || []).filter(function (x) { return x.trip === TRIP; })[0];
      hint.textContent = (ROUTE_DATA.name || "") +
        (t ? " · " + String(t.from || "").slice(0, 7) + " " + (t.countries || []).join("·") : " · 전 여정") +
        " · " + steps.length + "곳";
    }
  }

  var pinBusy = false;
  async function refreshPins() {
    if (ROUTE) return;              // 경로 모드에선 일반 핀을 얹지 않는다
    if (!MAP || pinBusy) return;
    pinBusy = true;
    try {
      var b = MAP.getBounds();
      var r = await rpc("travel_map", {
        p_south: b.getSouth(), p_west: b.getWest(),
        p_north: b.getNorth(), p_east: b.getEast(), p_limit: 300,
      });
      var ps = (r && r.places) || [];
      MARKERS.forEach(function (m) { m.remove(); });
      MARKERS = [];
      ps.forEach(function (p) {
        var el = document.createElement("button");
        el.type = "button";
        el.className = "tv-pin" + (p.scale !== "spot" ? " area" : "");
        /* 핀 얼굴은 크리에이터 로고다 — 맛집 지도와 같은 문법(누가 갔는지 핀만 봐도 안다).
           로고가 없으면 장소 사진, 그것도 없으면 국기. */
        el.innerHTML = p.ch_thumb
          ? '<img src="' + esc(p.ch_thumb) + '" alt="" referrerpolicy="no-referrer">'
          : (p.cover ? '<img src="' + esc(p.cover) + '" alt="" referrerpolicy="no-referrer">'
                     : '<span>' + flag((p.country_code || "")) + "</span>") ;
        if (p.ch_n > 1) el.innerHTML += '<i class="tv-pin-n">' + p.ch_n + "</i>";
        el.title = p.name + (p.ch_name ? " · " + p.ch_name : "");
        el.addEventListener("click", function (e) {
          e.stopPropagation();
          openDetail(p.id);
        });
        MARKERS.push(new maplibregl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([Number(p.lon), Number(p.lat)]).addTo(MAP));
      });
      var hint = document.getElementById("tv-map-hint");
      if (hint) hint.textContent = ps.length ? "이 화면에 " + ps.length + "곳" : "이 지역엔 아직 없어요";
    } finally { pinBusy = false; }
  }

  /* ── 크리에이터 상세 ──────────────────────────────────
     '누가 갔나'는 가로 스크롤 몇 장이 끝이라 그 사람이 어디를 얼마나 다녔는지가 안 보인다.
     여기서는 **나라 → 지역 → 장소(+그 영상)** 로 펼친다(사장님 지시).
     ⚠️ 상세 시트(DETAIL)와 같은 오버레이를 재사용하면 장소를 열 때 서로 덮어쓴다.
        크리에이터는 자기 오버레이를 갖는다. */
  var CRE = null, CRE_DATA = null, CRE_CC = null;
  function buildCre() {
    if (CRE && document.body.contains(CRE)) return CRE;
    CRE = document.createElement("div");
    CRE.className = "tv-detail tv-cre";
    document.body.appendChild(CRE);
    CRE.addEventListener("click", function (e) {
      if (e.target === CRE || e.target.closest("#tv-cre-x")) return closeCre();
      var cc = e.target.closest("[data-cc2]");
      if (cc) { CRE_CC = cc.dataset.cc2 || null; paintCre(); return; }
      if (e.target.closest("#tv-cre-map")) {
        closeCre();
        openMap().then(function () { drawRoute(CRE_DATA.channel.slug); });
        return;
      }
      var vb = e.target.closest("[data-vid]");
      if (vb) { playVideo(vb.dataset.vid, vb.dataset.vt, (CRE_DATA && CRE_DATA.channel || {}).name); return; }
      var pl = e.target.closest("[data-place]");
      if (pl) openDetail(pl.dataset.place);
    });
    return CRE;
  }
  function closeCre() {
    if (!CRE) return;
    CRE.classList.remove("open"); CRE.innerHTML = "";
    document.body.classList.remove("tv-lock");
  }
  async function openCreator(slug) {
    var d = buildCre();
    d.classList.add("open");
    document.body.classList.add("tv-lock");
    d.innerHTML = '<div class="tv-sheet"><div class="tv-empty">불러오는 중…</div></div>';
    CRE_DATA = await rpc("travel_creator", { p_slug: slug, p_limit: 200 });
    CRE_CC = null;
    if (!CRE_DATA || !CRE_DATA.ok) { d.innerHTML = '<div class="tv-sheet"><div class="tv-empty">불러오지 못했어요.</div></div>'; return; }
    paintCre();
  }
  function paintCre() {
    var d = buildCre(), c = CRE_DATA.channel || {};
    var places = (CRE_DATA.places || []).filter(function (p) {
      return !CRE_CC || p.country_code === CRE_CC;
    });
    /* 지역별로 묶는다. 지역을 모르는 건 '기타'로 몰지 않고 나라 이름을 쓴다 —
       '기타'는 유저에게 아무 정보도 주지 않는다. */
    var groups = [], idx = {};
    places.forEach(function (p) {
      var key = p.area || p.country || "그 외";
      if (!(key in idx)) { idx[key] = groups.length; groups.push({ key: key, items: [] }); }
      groups[idx[key]].items.push(p);
    });

    d.innerHTML =
      '<div class="tv-sheet">' +
        '<button type="button" class="tv-x" id="tv-cre-x" aria-label="닫기">✕</button>' +
        '<div class="tv-cre-h">' +
          (c.thumb ? '<img src="' + esc(c.thumb) + '" alt="" referrerpolicy="no-referrer">' : "") +
          '<div><div class="tv-cre-n">' + esc(c.name || "") + "</div>" +
            '<div class="tv-cre-s">' + (CRE_DATA.total || 0) + "곳 · 영상 " + (c.videos || 0) + "편</div></div>" +
          '<button type="button" class="tv-cre-map" id="tv-cre-map">지도에서 경로 보기</button>' +
        "</div>" +
        '<div class="tv-chips chip-scroll tv-cre-cc">' +
          '<button type="button" class="tv-chip' + (CRE_CC ? "" : " on") + '" data-cc2="">전체</button>' +
          (CRE_DATA.countries || []).map(function (x) {
            return '<button type="button" class="tv-chip' + (CRE_CC === x.code ? " on" : "") +
              '" data-cc2="' + esc(x.code) + '">' + flag(x.code) + " " + esc(x.name || x.code) +
              ' <i>' + x.n + "</i></button>";
          }).join("") +
        "</div>" +
        '<div class="tv-cre-b">' +
          (groups.length ? groups.map(function (g) {
            return '<div class="tv-cre-g"><div class="tv-cre-gt">' + esc(g.key) +
              ' <i>' + g.items.length + "곳</i></div>" +
              /* 썸네일을 누르면 **영상이 재생**되고, 이름을 누르면 장소 상세로 간다.
                 한 줄에 두 가지가 붙어 있으니 눌리는 자리를 갈라 놓는다. */
              g.items.map(function (p) {
                return '<div class="tv-cre-i">' +
                  (p.video_id
                    ? '<button type="button" class="tv-cre-th" data-vid="' + esc(p.video_id) +
                      '" data-vt="' + esc(p.video_title || "") + '" aria-label="영상 재생">' +
                      (p.cover ? '<img src="' + esc(p.cover) + '" alt="" loading="lazy" referrerpolicy="no-referrer">'
                               : '<span class="tv-ph">🌍</span>') +
                      '<i class="tv-play"></i></button>'
                    : '<span class="tv-cre-th">' +
                      (p.cover ? '<img src="' + esc(p.cover) + '" alt="" loading="lazy" referrerpolicy="no-referrer">'
                               : '<span class="tv-ph">🌍</span>') + "</span>") +
                  '<button type="button" class="tv-cre-t" data-place="' + esc(p.id) + '">' +
                    '<b>' + esc(p.name) + (p.visited ? " ✓" : "") + "</b>" +
                    '<i>' + esc(p.video_title || "") + "</i>" +
                  "</button></div>";
              }).join("") + "</div>";
          }).join("") : '<div class="tv-empty">아직 정리된 곳이 없어요.</div>') +
        "</div>" +
      "</div>";
  }

  /* ── 상세 오버레이 ────────────────────────────────── */
  function buildDetail() {
    if (DETAIL && document.body.contains(DETAIL)) return DETAIL;
    DETAIL = document.createElement("div");
    DETAIL.className = "tv-detail";
    /* body 직속이어야 한다 — 탭 패널 안에 넣으면 transform 조상 밑에서 위치가 깨지고
       스와이프가 셸 탭 전환으로 새어나간다(맛집 지도에서 겪은 그 사고). */
    document.body.appendChild(DETAIL);
    DETAIL.addEventListener("click", function (e) {
      if (e.target === DETAIL || e.target.closest("#tv-close")) closeDetail();
    });
    return DETAIL;
  }
  function closeDetail() {
    if (!DETAIL) return;
    DETAIL.classList.remove("open");
    DETAIL.innerHTML = "";
    document.body.classList.remove("tv-lock");
  }

  var CUR = null;
  async function openDetail(id) {
    var d = buildDetail();
    d.classList.add("open");
    document.body.classList.add("tv-lock");
    d.innerHTML = '<div class="tv-sheet"><div class="tv-empty">불러오는 중…</div></div>';
    var info = await rpc("travel_place_info", { p_id: id });
    if (!info || !info.ok) { d.innerHTML = '<div class="tv-sheet"><div class="tv-empty">없는 장소예요.</div></div>'; return; }
    CUR = info;
    paintDetail();
    loadTalk(id);
  }

  function voteBtn(k, mine, n) {
    return '<button type="button" class="tv-vote ' + V[k].tone + (mine === k ? " on" : "") +
      '" data-v="' + k + '">' + V[k].label + '<i>' + (n || 0) + "</i></button>";
  }
  function paintDetail() {
    var p = CUR.place, s = CUR.stats, mine = CUR.mine;
    var d = buildDetail();
    var sub = [p.city, p.country].filter(Boolean).join(" · ");
    var visited = (s.again || 0) + (s.once || 0);
    var pct = visited ? Math.round(s.again * 100 / visited) : 0;

    d.innerHTML =
      '<div class="tv-sheet">' +
        '<button type="button" class="tv-x" id="tv-close" aria-label="닫기">✕</button>' +
        (p.cover ? '<div class="tv-hero"><img src="' + esc(p.cover) + '" alt="" referrerpolicy="no-referrer">' +
                   (p.photo_credit ? '<span class="tv-credit">' + esc(p.photo_credit) + "</span>" : "") + "</div>"
                 : '<div class="tv-hero empty">' + flag(p.country_code) + "</div>") +
        '<div class="tv-d-body">' +
          '<h3 class="tv-d-name">' + esc(p.name) + "</h3>" +
          '<div class="tv-d-sub">' + flag(p.country_code) + " " + esc(sub) +
            (p.category ? " · " + esc(p.category) : "") + "</div>" +
          (p.name_local || p.name_en
            ? '<div class="tv-d-alt">' + esc(p.name_local || p.name_en) + "</div>" : "") +
          ((p.certs || []).length
            ? '<div class="tv-certs">' + p.certs.map(function (c) {
                return '<span class="tv-certp">' + esc(c.emoji || "🏅") + " " + esc(c.name) +
                  (c.blurb ? '<i>' + esc(c.blurb) + "</i>" : "") + "</span>";
              }).join("") + "</div>"
            : "") +
          (p.status === "pending"
            ? '<div class="tv-warn">좌표를 아직 못 찾은 곳이에요. 지도에는 안 올라갑니다.</div>' : "") +

          /* 설명 — 지어낸 문장이 아니라 위키백과·관광공사에서 가져온 것이다.
             출처를 함께 띄운다(CC BY-SA·공공누리 둘 다 표시 의무가 있다). */
          (p.summary
            ? '<p class="tv-desc">' + esc(p.summary) +
              (p.summary_url
                ? ' <a href="' + esc(p.summary_url) + '" target="_blank" rel="noopener">' +
                  (p.summary_src === "tour" ? "한국관광공사" : "위키백과") + " ↗</a>"
                : ' <span class="tv-desc-s">' +
                  (p.summary_src === "tour" ? "한국관광공사" : "위키백과") + "</span>") +
              "</p>"
            : "") +

          /* 판정 두 개 + 찜 하나. 넷을 늘어놓으면 유저가 '나는 가본 사람인가'부터 분류해야 한다. */
          '<div class="tv-judge">' +
            voteBtn("again", mine, s.again) + voteBtn("once", mine, s.once) +
            '<button type="button" class="tv-heart' + (CUR.saved ? " on" : "") + '" id="tv-save"' +
              ' aria-label="가고 싶다">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>' +
              (s.want ? '<i>' + s.want + "</i>" : "") + "</button>" +
          "</div>" +
          '<div class="tv-jhint">가봤다면 판정하고, 아직이면 하트로 담아두세요</div>' +

          (visited ? '<div class="tv-gauge"><div class="tv-gbar"><i style="width:' + pct + '%"></i></div>' +
                     '<div class="tv-gtx">가본 ' + visited + "명 중 " + pct + "%가 또 간다" +
                     (s.want ? " · " + s.want + "명이 담아둠" : "") + "</div></div>"
                   : "") +
          (s.hype > 0.4 && visited >= 3
            ? '<div class="tv-hype">기대가 실제보다 앞선 곳 — 과대평가 지수 ' + s.hype + "</div>" : "") +

          (CUR.videos && CUR.videos.length
            ? '<div class="tv-vids"><div class="tv-h">누가 갔나</div>' + CUR.videos.slice(0, 6).map(function (v) {
                return '<button type="button" class="tv-vid" data-vid="' + esc(v.video_id) +
                  '" data-vt="' + esc(v.title || "") + '" data-vc="' + esc(v.channel || "") + '">' +
                  '<span class="tv-vid-i">' +
                    '<img src="https://i.ytimg.com/vi/' + esc(v.video_id) + '/mqdefault.jpg" alt="" loading="lazy" referrerpolicy="no-referrer">' +
                    '<i class="tv-play"></i></span>' +
                  '<span><b>' + esc(v.channel) + "</b>" + esc(v.title || "") + "</span></button>";
              }).join("") + "</div>"
            : "") +

          '<div class="tv-talk"><div class="tv-h">한마디 <i>' + (s.comments || 0) + "</i></div>" +
            '<div id="tv-cmts" class="tv-cmts"></div>' +
            '<form class="tv-write" id="tv-write">' +
              '<input type="text" id="tv-input" maxlength="600" placeholder="판정하고 한마디 남기기">' +
              "<button type=\"submit\">등록</button></form></div>" +
          (p.geo_source === "osm" ? '<div class="tv-src">위치 © OpenStreetMap contributors</div>' : "") +
          (p.geo_source === "wikidata" ? '<div class="tv-src">위치·사진 출처 Wikidata / Wikimedia Commons</div>' : "") +
          (p.geo_source === "tour" ? '<div class="tv-src">위치·사진 출처 한국관광공사</div>' : "") +
        "</div>" +
      "</div>";

    d.querySelector(".tv-judge").addEventListener("click", function (e) {
      var b = e.target.closest(".tv-vote"); if (b) return judge(b.dataset.v);
      if (e.target.closest("#tv-save")) toggleSave();
    });
    d.querySelector("#tv-write").addEventListener("submit", function (e) {
      e.preventDefault(); say();
    });
    var vids = d.querySelector(".tv-vids");
    if (vids) vids.addEventListener("click", function (e) {
      var b = e.target.closest("[data-vid]"); if (!b) return;
      playVideo(b.dataset.vid, b.dataset.vt, b.dataset.vc);
    });
  }

  async function judge(v) {
    if (!(await loggedIn())) return needLogin();
    var r = await rpc("travel_judge", { p_id: CUR.place.id, p_verdict: v });
    if (!r || !r.ok) return toast("판정에 실패했어요.");
    CUR.mine = r.mine;
    CUR.stats.again = r.again; CUR.stats.once = r.once;
    CUR.stats.want = r.want; CUR.stats.pass = r.pass;
    CUR.stats.hype = r.hype;
    var cmts = document.querySelector("#tv-cmts");
    var keep = cmts ? cmts.innerHTML : "";
    paintDetail();
    var c2 = document.querySelector("#tv-cmts"); if (c2 && keep) c2.innerHTML = keep;
    load();   // 목록의 표 수치도 같이 갱신
  }

  async function toggleSave() {
    if (!(await loggedIn())) return needLogin();
    var r = await rpc("travel_save", { p_id: CUR.place.id });
    if (!r || !r.ok) return toast("실패했어요.");
    CUR.saved = r.saved;
    if (r.want != null) CUR.stats.want = r.want;
    var b = document.querySelector("#tv-save");
    if (b) {
      b.classList.toggle("on", !!r.saved);
      var i = b.querySelector("i");
      if (CUR.stats.want) { if (i) i.textContent = CUR.stats.want;
        else b.insertAdjacentHTML("beforeend", "<i>" + CUR.stats.want + "</i>"); }
      else if (i) i.remove();
    }
    toast(r.saved ? "가고 싶은 곳에 담았어요" : "담기를 해제했어요");
  }

  async function loadTalk(id) {
    var r = await rpc("travel_talk", { p_id: id, p_limit: 60 });
    var box = document.querySelector("#tv-cmts"); if (!box) return;
    var cs = (r && r.comments) || [];
    box.innerHTML = cs.length ? cs.map(function (c) {
      return '<div class="tv-cmt ' + (V[c.faction] ? V[c.faction].tone : "") + '">' +
        '<span class="tv-cf">' + (V[c.faction] ? V[c.faction].label : "") + "</span>" +
        '<b>' + esc(c.nick) + "</b> " + esc(c.body) + "</div>";
    }).join("") : '<div class="tv-none">첫 한마디를 남겨보세요.</div>';
  }

  async function say() {
    if (!(await loggedIn())) return needLogin();
    var inp = document.querySelector("#tv-input"); if (!inp) return;
    var body = inp.value.trim(); if (!body) return;
    var r = await rpc("travel_say", { p_id: CUR.place.id, p_body: body });
    if (!r || !r.ok) {
      /* '투표해야 말할 수 있다' 를 유저에게 그대로 말해준다 — 실패 이유를 안 알려주면
         버튼이 고장난 걸로 읽힌다. */
      return toast(r && r.reason === "pick_side" ? "먼저 판정을 골라주세요."
                 : r && r.reason === "slow_down" ? "조금 천천히요."
                 : "등록에 실패했어요.");
    }
    inp.value = "";
    loadTalk(CUR.place.id);
  }

  /* ── 부팅 ─────────────────────────────────────────────
     한 번 하고 끝내면 안 된다. SPA 재방문 때 패널이 스냅샷으로 껍데기만 복원되는
     경우가 있어서, '패널은 있는데 .tv-sec 이 없다'를 계속 지켜본다(맛집과 같은 방어). */
  var booting = false;
  async function tryBoot() {
    var panel = document.querySelector('.tab-panel[data-panel="travel"]');
    if (!panel || booting) return;
    if (panel.querySelector(".tv-sec")) {
      if (!SEC || !document.contains(SEC) || !SEC.__tvWired) {
        /* ⚠️ 참조만 다시 잡고 끝내면 화면은 멀쩡한데 아무것도 안 눌린다.
           스냅샷이 복원한 .tv-sec 은 **새 노드**라 리스너가 없다. grab 과 wire 는 항상 같이.
           조건에 __tvWired 를 넣은 이유: 노드가 문서 안에 있어도(=contains 통과) 리스너가
           없을 수 있다. 실제로 그 상태로 나라 카드·세그·지도 버튼이 전부 죽어 있었다. */
        grab(panel);
        wire();
        booting = true;
        try { await loadCountries(); await loadAreas(); await loadDash();
              paintChips(); paintDash(); await load(); } finally { booting = false; }
      }
      return;
    }
    booting = true;
    try {
      if (mount()) { await loadCountries(); await loadAreas(); await loadDash();
                     paintChips(); paintDash(); await load(); }
    } finally { booting = false; }
  }
  var start = function () {
    tryBoot();
    try {
      new MutationObserver(function () { tryBoot(); })
        .observe(document.body, { childList: true, subtree: true });
    } catch (_) {}
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();

  window.GALLA_openTravelPlace = openDetail;
  window.GALLA_openTravelMap = openMap;
  window.GALLA_openTravelCreator = openCreator;
})();
