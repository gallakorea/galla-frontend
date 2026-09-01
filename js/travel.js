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
   · 🚨 지도는 아직 없다. tile.openstreetmap.org 는 OSM 재단이 **앱 배포에 쓰는 걸 금지**해서
     맛집도 출시 전 교체 과제로 남아 있다. 같은 빚을 하나 더 지지 않는다 —
     타일 문제가 풀리면 travel_map RPC 가 이미 준비돼 있으니 그때 붙인다.
   ========================================================= */
(function () {
  if (window.__gallaTravel) return;
  window.__gallaTravel = true;

  var SEC = null, LIST = null, CHIPS = null, CHIPS2 = null, DETAIL = null;
  var sb = null;
  /* 세그먼트는 둘뿐이다. '판정' 랭킹 탭은 사장님 지시로 뺐다 —
     "누적 투표로 갈리게 될 거니" 랭킹을 따로 화면으로 만들 필요가 없다.
     travel_rank RPC 는 그대로 살려둔다(표가 쌓이면 그때 어디든 붙일 수 있게). */
  var VIEW = "feed";          // feed | who
  var COUNTRY = null;         // 나라 필터(ISO2)
  var AREA = null;            // 나라 안의 광역 필터(도쿄도·교토부·온타리오주 …)
  var loading = false;

  /* 진영 라벨 — 화면 문구를 한 곳에 모은다. 네 곳에 흩어 놓으면 축이 조용히 갈라진다. */
  var V = {
    again: { label: "또 간다",       tone: "hot",  side: "been" },
    once:  { label: "한 번이면 족",  tone: "cold", side: "been" },
    want:  { label: "가고 싶다",     tone: "want", side: "not"  },
    pass:  { label: "관심 없다",     tone: "pass", side: "not"  },
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
      '<div class="tv-list" id="tv-list"></div>';
    panel.appendChild(SEC);

    CHIPS = SEC.querySelector("#tv-chips");
    CHIPS2 = SEC.querySelector("#tv-chips2");
    LIST = SEC.querySelector("#tv-list");

    SEC.querySelector("#tv-openmap").addEventListener("click", openMap);
    SEC.querySelector("#tv-seg").addEventListener("click", function (e) {
      var b = e.target.closest(".tv-sg"); if (!b) return;
      VIEW = b.dataset.view;
      SEC.querySelectorAll(".tv-sg").forEach(function (x) { x.classList.toggle("on", x === b); });
      paintChips(); load();
    });
    CHIPS.addEventListener("click", async function (e) {
      var b = e.target.closest(".tv-chip"); if (!b) return;
      COUNTRY = b.dataset.cc || null;
      AREA = null;                    // 나라가 바뀌면 지역 선택은 버린다
      await loadAreas();
      paintChips(); load();
    });
    CHIPS2.addEventListener("click", function (e) {
      var b = e.target.closest(".tv-chip"); if (!b) return;
      AREA = b.dataset.area || null;
      paintChips(); load();
    });
    LIST.addEventListener("click", function (e) {
      var card = e.target.closest("[data-place]");
      if (card) openDetail(card.dataset.place);
    });
    return true;
  }

  /* ── 칩 ───────────────────────────────────────────── */
  var COUNTRIES = [];
  async function loadCountries() {
    var r = await rpc("travel_countries", { p_limit: 40 });
    COUNTRIES = (r && r.countries) || [];
  }
  var AREAS = [];
  async function loadAreas() {
    /* 나라를 안 고르면 지역 칩은 뜻이 없다 — 전 세계 광역을 한 줄에 늘어놓을 수는 없다. */
    if (!COUNTRY) { AREAS = []; return; }
    var r = await rpc("travel_areas", { p_country: COUNTRY, p_limit: 30 });
    AREAS = (r && r.areas) || [];
  }
  function paintChips() {
    if (!CHIPS) return;
    var html = "";
    if (VIEW === "feed") {
      html = '<button type="button" class="tv-chip' + (COUNTRY ? "" : " on") + '" data-cc="">전체</button>' +
        COUNTRIES.map(function (c) {
          return '<button type="button" class="tv-chip' + (COUNTRY === c.code ? " on" : "") +
                 '" data-cc="' + esc(c.code) + '">' + flag(c.code) + " " + esc(c.name || c.code) +
                 ' <i>' + c.n + "</i></button>";
        }).join("");
    }
    CHIPS.innerHTML = html;
    CHIPS.hidden = !html;

    /* 2단 — 나라 안의 광역(도쿄도·교토부·온타리오주). 기초자치단체(미나토구)로 쪼개면
       유저가 찾는 '도쿄'가 화면에서 사라진다. 그래서 축은 광역이다. */
    if (!CHIPS2) return;
    var show = VIEW === "feed" && COUNTRY && AREAS.length;
    CHIPS2.innerHTML = show
      ? '<button type="button" class="tv-chip sm' + (AREA ? "" : " on") + '" data-area="">전체</button>' +
        AREAS.map(function (a) {
          return '<button type="button" class="tv-chip sm' + (AREA === a.name ? " on" : "") +
                 '" data-area="' + esc(a.name) + '">' + esc(a.name) + ' <i>' + a.n + "</i></button>";
        }).join("")
      : "";
    CHIPS2.hidden = !show;
  }

  /* ── 목록 ─────────────────────────────────────────── */
  function cardHTML(p) {
    var sub = [p.admin1, p.city, p.country].filter(Boolean)
                .filter(function (v, i, arr) { return arr.indexOf(v) === i; })   // 상하이시/상하이 중복 제거
                .join(" · ");
    var badge = SCALE_TX[p.scale] || KIND_TX[p.kind] || "";
    var a = p.again || 0, o = p.once || 0, w = p.want || 0;
    var votes = a + o > 0
      ? '<span class="tv-v hot">또 간다 ' + Math.round(a * 100 / (a + o)) + "%</span>" +
        '<span class="tv-vn">가본 사람 ' + (a + o) + "명</span>"
      : (w > 0 ? '<span class="tv-v want">가고 싶다 ' + w + "</span>" : '<span class="tv-vn">아직 표 없음</span>');
    return '<article class="tv-card" data-place="' + esc(p.id) + '">' +
      '<div class="tv-thumb">' +
        (p.cover ? '<img src="' + esc(p.cover) + '" alt="" loading="lazy" referrerpolicy="no-referrer">'
                 : '<span class="tv-ph">' + flag(p.country_code) + "</span>") +
        (badge ? '<span class="tv-badge">' + badge + "</span>" : "") +
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
            '<div class="tv-who-h">' +
              (s.thumb ? '<img src="' + esc(s.thumb) + '" alt="" referrerpolicy="no-referrer">' : "") +
              '<div><div class="tv-who-n">' + esc(s.name) + "</div>" +
              '<div class="tv-who-s">' + s.total + "곳" +
              (s.visited ? " · 내가 간 곳 " + s.visited : "") + "</div></div>" +
            "</div>" +
            '<div class="tv-row chip-scroll">' + s.places.map(function (p) {
              return '<button type="button" class="tv-mini" data-place="' + esc(p.id) + '">' +
                (p.cover ? '<img src="' + esc(p.cover) + '" alt="" loading="lazy" referrerpolicy="no-referrer">'
                         : '<span class="tv-ph">🌍</span>') +
                '<span class="tv-mini-n">' + esc(p.name) + "</span></button>";
            }).join("") + "</div></section>";
        }).join("") : '<div class="tv-empty">아직 연결된 크리에이터가 없어요.</div>';
      } else {
        var f = await rpc("travel_feed", { p_country: COUNTRY, p_area: AREA, p_limit: 40 });
        var fp = (f && f.places) || [];
        LIST.innerHTML = fp.length ? fp.map(cardHTML).join("")
          : '<div class="tv-empty">아직 이 나라 데이터가 없어요.</div>';
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
      '<div class="tv-map-hint" id="tv-map-hint">여행 유튜버가 간 곳</div>';
    document.body.appendChild(MAPBOX);
    MAPBOX.querySelector("#tv-map-x").addEventListener("click", closeMap);
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
      MAP.on("load", function () { MAP.resize(); refreshPins(); });
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
      refreshPins();
    }
  }

  var pinBusy = false;
  async function refreshPins() {
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
    var wantPct = (s.want + s.pass) ? Math.round(s.want * 100 / (s.want + s.pass)) : 0;

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
          (p.status === "pending"
            ? '<div class="tv-warn">좌표를 아직 못 찾은 곳이에요. 지도에는 안 올라갑니다.</div>' : "") +

          /* 판정 — 두 축을 시각적으로도 갈라 놓는다. 같이 붙여 놓으면 안 가본 사람이
             '또 간다'를 누른다(그러면 경험자 표가 통째로 오염된다). */
          '<div class="tv-judge">' +
            '<div class="tv-jrow"><span class="tv-jl">가봤다면</span>' +
              voteBtn("again", mine, s.again) + voteBtn("once", mine, s.once) + "</div>" +
            '<div class="tv-jrow"><span class="tv-jl">아직 안 가봤다면</span>' +
              voteBtn("want", mine, s.want) + voteBtn("pass", mine, s.pass) + "</div>" +
          "</div>" +

          (visited ? '<div class="tv-gauge"><div class="tv-gbar"><i style="width:' + pct + '%"></i></div>' +
                     '<div class="tv-gtx">가본 ' + visited + "명 중 " + pct + "%가 또 간다" +
                     (s.want + s.pass ? " · 안 가본 사람 " + wantPct + "%는 가고 싶다" : "") + "</div></div>"
                   : "") +
          (s.hype > 0.4 && visited >= 3
            ? '<div class="tv-hype">기대가 실제보다 앞선 곳 — 과대평가 지수 ' + s.hype + "</div>" : "") +

          (CUR.videos && CUR.videos.length
            ? '<div class="tv-vids"><div class="tv-h">누가 갔나</div>' + CUR.videos.slice(0, 6).map(function (v) {
                return '<a class="tv-vid" href="https://www.youtube.com/watch?v=' + esc(v.video_id) +
                  '" target="_blank" rel="noopener">' +
                  '<img src="https://i.ytimg.com/vi/' + esc(v.video_id) + '/mqdefault.jpg" alt="" loading="lazy" referrerpolicy="no-referrer">' +
                  '<span><b>' + esc(v.channel) + "</b>" + esc(v.title || "") + "</span></a>";
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
      var b = e.target.closest(".tv-vote"); if (b) judge(b.dataset.v);
    });
    d.querySelector("#tv-write").addEventListener("submit", function (e) {
      e.preventDefault(); say();
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
      if (!SEC || !document.contains(SEC)) {
        SEC = panel.querySelector(".tv-sec");
        CHIPS = SEC.querySelector("#tv-chips");
    CHIPS2 = SEC.querySelector("#tv-chips2");
        LIST = SEC.querySelector("#tv-list");
        booting = true;
        try { await loadCountries(); await loadAreas(); paintChips(); await load(); } finally { booting = false; }
      }
      return;
    }
    booting = true;
    try {
      if (mount()) { await loadCountries(); await loadAreas(); paintChips(); await load(); }
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
})();
