/* =========================================================
   travel-hotels.js — 여행 탭 → 숙소 (아고다)
   항공권(travel-flights.js)과 같은 '네이버식': 우리 UI로 검색·비교·상세, 마지막 '예약'만 아고다로 핸드오프.
   데이터는 엣지(galla-friend):
     op:"hotel_city"   {city}                → 지역(areas)·숙소 유형(types) — 검색 전에 지역 칩을 그린다
     op:"hotel_search" {city, 날짜, 인원, 필터, sort} → offers + facets + total (정렬·필터는 서버가 한다)
     op:"hotel_detail" {hotelId, 날짜, 인원}  → 사진·시설·소개 + 그 날짜 요금(offer|null)

   입구(한 모듈):
     · 여행 탭 세그 data-view="hotel" (travel.js applyToolMode)
     · 검색 "도쿄 호텔" → 입구 카드 → GALLA_openHotels(city) → 스택 페이지(hotels.html)
     · 갈비스 숙소 카드(qtype:"hotel") — 행 탭 = 우리 상세(opts.hotelId), 「갈라에서 숙소 다 보기」 = 카드 필터 그대로

   ⚠️ 항공권이 밟은 함정을 그대로 피한다([[galla-flights]]):
     · 클라이언트는 window.supabaseClient / waitForSupabaseClient() — window.supabase 는 라이브러리라 functions 없음
     · 달력·인원·필터 패널은 전부 인라인(position:static). 고정 오버레이·body 포탈 금지(SPA transform 조상·전역 제스처)
     · iOS date input(열자마자 오늘) 함정 → 자체 달력
     · 무한 반복 애니메이션 금지(카드 여러 장 동시 리페인트로 화면이 흔들렸다) → 등장 1회성만
     · 외부 링크는 GALLA_openLink — 앱에서 target=_blank 로 열면 웹뷰가 통째로 넘어가 못 돌아온다
   상세 화면의 뒤로가기:
     · 목록 ↔ 상세는 모듈 안에서 교체(목록 DOM 은 그대로 숨김 → 스크롤 위치 복원)
     · 웹(MPA): history 한 칸({thDetail}) — 브라우저 뒤로가기 = 목록으로
     · 앱(SPA): 라우터 history 를 건드리지 않는다(스택 기록이 어긋난다). 대신
         - 상세 안 좌측 엣지 스와이프 = 목록으로(스택 스와이프보다 먼저 가로챔)
         - 안드로이드 하드웨어 뒤로가기 = [data-sheet-close] 버튼(android-back.js closeTop)
   ========================================================= */
(function () {
  if (window.GALLA_TravelHotels) return;

  var sb = null;
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }
  function won(n) { return (Math.round(Number(n) || 0)).toLocaleString("ko-KR"); }
  function wonShort(n) { n = Number(n) || 0; return n >= 10000 && n % 10000 === 0 ? (n / 10000) + "만" : won(n); }
  function reduced() { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (_) { return false; } }
  function isSPA() { return !!(window.GALLA_SPA && document.body && document.body.dataset && document.body.dataset.page === "spa"); }
  function listOf(v) { if (Array.isArray(v)) return v.map(String).filter(Boolean); return String(v || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean); }
  function int(v, d) { var n = parseInt(v, 10); return isFinite(n) ? n : d; }

  /* 인기 도시 — 국기는 텍스트 이모지(파티클 아님). 이름은 엣지 도시 사전과 맞춘다. */
  var POPULAR = [
    { c: "도쿄", f: "🇯🇵" }, { c: "오사카", f: "🇯🇵" }, { c: "후쿠오카", f: "🇯🇵" },
    { c: "방콕", f: "🇹🇭" }, { c: "다낭", f: "🇻🇳" }, { c: "세부", f: "🇵🇭" },
    { c: "타이베이", f: "🇹🇼" }, { c: "홍콩", f: "🇭🇰" }, { c: "싱가포르", f: "🇸🇬" },
    { c: "발리", f: "🇮🇩" }, { c: "제주", f: "🇰🇷" }, { c: "부산", f: "🇰🇷" }
  ];
  /* 숙소 유형 — 엣지가 facets.types 를 안 주면 이 목록으로 그린다(키는 엣지 계약과 같다) */
  var TYPES = [
    ["hotel", "호텔"], ["resort", "리조트"], ["ryokan", "료칸"], ["apartment", "아파트·레지던스"], ["guesthouse", "게스트하우스"],
    ["hostel", "호스텔"], ["capsule", "캡슐호텔"], ["house", "단독주택"], ["pension", "펜션"], ["motel", "모텔"], ["camping", "캠핑"]
  ];
  var TYPE_KO = {}; TYPES.forEach(function (t) { TYPE_KO[t[0]] = t[1]; });
  var STARS = [[0, "전체"], [2, "2성+"], [3, "3성+"], [4, "4성+"], [5, "5성"]];
  var SCORES = [[0, "전체"], [7, "7+"], [8, "8+"], [9, "9+"]];
  var PRICES = [[0, 0, "전체"], [0, 50000, "~5만"], [50000, 100000, "5~10만"], [100000, 200000, "10~20만"], [200000, 0, "20만~"]];
  var SORTS = [["rec", "추천"], ["price_asc", "낮은 가격"], ["price_desc", "높은 가격"], ["score", "평점"], ["reviews", "리뷰 많은"], ["star", "등급"]];
  var MAX_NIGHTS = 30, MAX_ADULTS = 8, MAX_KIDS = 4;

  /* ── 날짜(KST 기준 · UTC Date 로 계산해 시간대 흔들림 없게) ── */
  var DOW = ["일", "월", "화", "수", "목", "금", "토"];
  var DAY = 86400000;
  function todayKST() { var d = new Date(Date.now() + 9 * 3600000); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); }
  function iso(d) { return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0"); }
  function parseIso(s) { var m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null; }
  function addDays(s, n) { var d = parseIso(s); return d ? iso(new Date(d.getTime() + n * DAY)) : ""; }
  function nightsOf(a, b) { var x = parseIso(a), y = parseIso(b); return (x && y) ? Math.round((y - x) / DAY) : 0; }
  function fmtDate(s) { var d = parseIso(s); if (!d) return ""; return (d.getUTCMonth() + 1) + "월 " + d.getUTCDate() + "일(" + DOW[d.getUTCDay()] + ")"; }
  function fmtShort(s) { var d = parseIso(s); if (!d) return ""; return (d.getUTCMonth() + 1) + "." + d.getUTCDate() + "(" + DOW[d.getUTCDay()] + ")"; }
  function defaultIn() { return iso(new Date(todayKST().getTime() + 14 * DAY)); }   // 2주 뒤 1박 — 가장 흔한 '다음 여행' 출발점

  function freshFilters() { return { types: [], minStar: 0, minScore: 0, priceMin: 0, priceMax: 0, discountOnly: false, breakfast: false, freeWifi: false }; }
  var state = {
    city: "", cityName: "", areas: [], typeFacet: null, facetCity: "",
    checkIn: defaultIn(), checkOut: "", adults: 2, children: 0, childAges: [],
    area: "", f: freshFilters(), sort: "rec",
    offers: null, total: 0, loading: false, meta: null, err: null, errCity: "",
    detailId: null
  };
  state.checkOut = addDays(state.checkIn, 1);

  var ROOT = null;
  var calBox = null, calY = 0, calM = 0, calPick = "in", draftIn = "", draftOut = "";
  var draftF = null;                        // 필터 패널 안에서 고르는 중인 값(적용 전까지 검색에 안 씀)
  var draftG = null;                        // 인원 패널 안에서 고르는 중인 값
  var seq = 0, dseq = 0, cseq = 0;          // 늦게 온 옛 응답 무시(검색·상세·도시)
  var listScroll = 0;                       // 상세 들어가기 전 목록 스크롤 위치

  /* ── SVG 아이콘(이모지 대신) ── */
  var IC = {
    bed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18V6"/><path d="M3 14h18v4"/><path d="M21 14v-2a3 3 0 0 0-3-3h-7v5"/><circle cx="7" cy="11" r="1.6"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.4"/></svg>',
    cup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M8 3v3M12 3v3"/></svg>',
    wifi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 9a14 14 0 0 1 19 0"/><path d="M5.5 12.5a9.5 9.5 0 0 1 13 0"/><path d="M8.7 15.8a5 5 0 0 1 6.6 0"/><circle cx="12" cy="19" r="1" fill="currentColor"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.6"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>',
    out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
    filter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M7 12h10M10 18h4"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M7 7l10 10M17 7L7 17"/></svg>',
    tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.4"/></svg>',
    map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3 3 5.5v15L9 18l6 3 6-2.5v-15L15 6 9 3z"/><path d="M9 3v15M15 6v15"/></svg>'
  };

  /* 야경 스카이라인 — 창문이 한 번 차례로 켜진다(1회성). 좌표는 고정이라 매번 같은 도시. */
  function skylineSVG() {
    var b = [[0, 70, 26], [24, 52, 20], [42, 78, 30], [70, 40, 18], [86, 62, 26], [110, 30, 16], [124, 56, 30], [152, 74, 22],
      [172, 46, 28], [198, 66, 20], [216, 36, 24], [238, 58, 30], [266, 76, 22], [286, 50, 26], [310, 68, 30], [338, 44, 22], [358, 72, 42]];
    var H = 120, out = "", win = "", k = 0;
    b.forEach(function (r) {
      var x = r[0], w = r[2];
      out += '<rect x="' + x + '" y="' + r[1] + '" width="' + w + '" height="' + (H - r[1]) + '"/>';
      for (var yy = r[1] + 8; yy < H - 8; yy += 11) {
        for (var xx = x + 4; xx < x + w - 4; xx += 7) {
          if (((xx * 7 + yy * 13) % 5) === 0) { win += '<rect class="th-win" style="--k:' + (k++ % 14) + '" x="' + xx + '" y="' + yy + '" width="3" height="4"/>'; }
        }
      }
    });
    return '<svg class="th-sky-line" viewBox="0 0 400 120" preserveAspectRatio="xMidYMax slice" aria-hidden="true"><g class="th-bld">' + out + '</g><g class="th-wins">' + win + "</g></svg>";
  }

  function shell() {
    return '' +
    '<div class="th">' +
      '<div class="th-main" id="th-main">' +
        '<div class="th-hero">' +
          '<div class="th-sky"></div>' +
          '<div class="th-moon"></div>' +
          '<div class="th-stars"><i></i><i></i><i></i><i></i><i></i></div>' +
          skylineSVG() +
          '<div class="th-hero-t"><b>어디서 묵을까요</b><span>아고다 숙소 요금을 한눈에 비교하고 예약까지</span></div>' +
        '</div>' +

        '<form class="th-form" id="th-form" autocomplete="off">' +
          '<label class="th-fld th-city"><span class="th-lb">도시</span>' +
            '<span class="th-city-row"><span class="th-ic">' + IC.pin + '</span>' +
            '<input class="th-in" id="th-city" type="text" inputmode="text" enterkeyhint="search" placeholder="도시 이름 (예: 도쿄)" value="' + esc(state.city) + '"></span>' +
          '</label>' +
          '<div class="th-areas chip-scroll" id="th-areas" hidden></div>' +
          '<div class="th-dates">' +
            '<button type="button" class="th-fld th-when" id="th-in-btn"><span class="th-lb">체크인</span><span class="th-datev" id="th-in-v"></span></button>' +
            '<span class="th-nights" id="th-nights"></span>' +
            '<button type="button" class="th-fld th-when" id="th-out-btn"><span class="th-lb">체크아웃</span><span class="th-datev" id="th-out-v"></span></button>' +
          '</div>' +
          // 📅 인라인 달력
          '<div class="th-cal-box th-pane" id="th-cal" hidden>' +
            '<div class="th-cal">' +
              '<div class="th-cal-top"><b id="th-cal-h">체크인 날짜</b><button type="button" class="th-cal-x" id="th-cal-x" aria-label="닫기">✕</button></div>' +
              '<div class="th-cal-nav"><button type="button" id="th-cal-prev" aria-label="이전 달">‹</button>' +
                '<span id="th-cal-mon"></span><button type="button" id="th-cal-next" aria-label="다음 달">›</button></div>' +
              '<div class="th-cal-dow">' + DOW.map(function (d) { return "<span>" + d + "</span>"; }).join("") + "</div>" +
              '<div class="th-cal-grid" id="th-cal-grid"></div>' +
              '<div class="th-cal-foot"><span class="th-cal-sum" id="th-cal-sum"></span>' +
                '<button type="button" class="th-cal-ok" id="th-cal-ok">확인</button></div>' +
            "</div>" +
          "</div>" +
          '<div class="th-row2">' +
            '<button type="button" class="th-fld th-guests" id="th-guests"><span class="th-gl"><span class="th-ic">' + IC.user + '</span><span><span class="th-lb">인원</span><b id="th-guests-v"></b></span></span><span class="th-chev">›</span></button>' +
            '<button type="button" class="th-fbtn" id="th-fbtn">' + IC.filter + '<span>필터</span><i class="th-fbadge" id="th-fbadge" hidden></i></button>' +
          '</div>' +
          // 👪 인라인 인원 패널
          '<div class="th-pane th-gpane" id="th-gpane" hidden></div>' +
          // 🎚 인라인 필터 패널
          '<div class="th-pane th-fpane" id="th-fpane" hidden></div>' +
          '<div class="th-pop" id="th-pop">' + POPULAR.map(function (p) {
            return '<button type="button" class="th-poch" data-city="' + esc(p.c) + '"><span class="th-flag">' + p.f + "</span>" + esc(p.c) + "</button>";
          }).join("") + "</div>" +
          '<button type="submit" class="th-go" id="th-go">숙소 검색</button>' +
        "</form>" +

        '<div class="th-results" id="th-results"></div>' +
      "</div>" +
      '<div class="th-detail" id="th-detail" hidden></div>' +
    "</div>";
  }

  /* ── 폼 표시 갱신 ── */
  function guestsLabel(a, c) { return "성인 " + a + (c ? " · 아동 " + c : ""); }
  function activeCount(f) {
    f = f || state.f;
    return (f.types.length ? 1 : 0) + (f.minStar ? 1 : 0) + (f.minScore ? 1 : 0) + ((f.priceMin || f.priceMax) ? 1 : 0) +
      (f.discountOnly ? 1 : 0) + (f.breakfast ? 1 : 0) + (f.freeWifi ? 1 : 0);
  }
  function paintForm() {
    if (!ROOT) return;
    var a = ROOT.querySelector("#th-in-v"); if (a) a.textContent = fmtDate(state.checkIn);
    var b = ROOT.querySelector("#th-out-v"); if (b) b.textContent = fmtDate(state.checkOut);
    var n = ROOT.querySelector("#th-nights"); if (n) n.textContent = nightsOf(state.checkIn, state.checkOut) + "박";
    var g = ROOT.querySelector("#th-guests-v"); if (g) g.textContent = guestsLabel(state.adults, state.children);
    var cnt = activeCount();
    var bd = ROOT.querySelector("#th-fbadge"); if (bd) { bd.hidden = !cnt; bd.textContent = cnt; }
    var fb = ROOT.querySelector("#th-fbtn"); if (fb) fb.classList.toggle("on", !!cnt);
    paintAreas();
  }
  function paintAreas() {
    var box = ROOT && ROOT.querySelector("#th-areas"); if (!box) return;
    var areas = state.areas || [];
    if (!areas.length) { box.hidden = true; box.innerHTML = ""; return; }
    box.hidden = false;
    box.innerHTML = '<span class="th-areas-l">지역</span>' +
      '<button type="button" class="th-ach' + (!state.area ? " on" : "") + '" data-area="">전체</button>' +
      areas.map(function (ar) {
        return '<button type="button" class="th-ach' + (state.area === ar.key ? " on" : "") + '" data-area="' + esc(ar.key) + '">' + esc(ar.name || ar.key) + "</button>";
      }).join("");
  }

  /* ── 패널은 한 번에 하나만 펼친다(달력·인원·필터) ── */
  function closePanes(except) {
    if (except !== "cal") closeCal();
    if (except !== "g") { var g = ROOT && ROOT.querySelector("#th-gpane"); if (g) g.hidden = true; var gb = ROOT && ROOT.querySelector("#th-guests"); if (gb) gb.classList.remove("act"); }
    if (except !== "f") { var f = ROOT && ROOT.querySelector("#th-fpane"); if (f) f.hidden = true; var fb = ROOT && ROOT.querySelector("#th-fbtn"); if (fb) fb.classList.remove("act"); }
  }
  function showPane(el) {
    el.hidden = false;
    el.classList.remove("on"); void el.offsetWidth; el.classList.add("on");
    try { el.scrollIntoView({ block: "nearest" }); } catch (_) {}   // smooth 금지 — 키프얼라이브 판에서 흔들림
  }

  /* ── 📅 범위 달력 ── */
  function calGridHTML() {
    var first = new Date(Date.UTC(calY, calM, 1));
    var days = new Date(Date.UTC(calY, calM + 1, 0)).getUTCDate();
    var today = todayKST().getTime(), limit = today + 365 * DAY;
    var a = parseIso(draftIn), z = parseIso(draftOut);
    var at = a ? a.getTime() : 0, zt = z ? z.getTime() : 0;
    var html = "";
    for (var i = 0; i < first.getUTCDay(); i++) html += '<span class="th-cd empty"></span>';
    for (var d = 1; d <= days; d++) {
      var cur = new Date(Date.UTC(calY, calM, d)), t = cur.getTime();
      var off = t < today || t > limit;
      if (!off && calPick === "out" && at && (t - at) / DAY > MAX_NIGHTS) off = true;   // 체크아웃은 30박까지만
      var cls = "th-cd";
      if (off) cls += " past";
      if (at && t === at) cls += zt ? " sel s-in" : " sel";   // 체크아웃 전엔 둥근 단독 표시
      if (zt && t === zt) cls += " sel s-out";
      if (at && zt && t > at && t < zt) cls += " inrange";
      var dw = cur.getUTCDay();
      if (dw === 0) cls += " sun"; else if (dw === 6) cls += " sat";
      if (t === today) cls += " today";
      html += '<button type="button" class="' + cls + '"' + (off ? " disabled" : ' data-d="' + iso(cur) + '"') + ">" + d + "</button>";
    }
    return html;
  }
  function paintCal() {
    if (!calBox) return;
    calBox.querySelector("#th-cal-mon").textContent = calY + "년 " + (calM + 1) + "월";
    calBox.querySelector("#th-cal-h").textContent = calPick === "out" ? "체크아웃 날짜" : "체크인 날짜";
    calBox.querySelector("#th-cal-grid").innerHTML = calGridHTML();
    var t = todayKST();
    calBox.querySelector("#th-cal-prev").disabled = (calY === t.getUTCFullYear() && calM === t.getUTCMonth());
    var lim = new Date(t.getTime() + 365 * DAY);
    calBox.querySelector("#th-cal-next").disabled = (calY > lim.getUTCFullYear() || (calY === lim.getUTCFullYear() && calM >= lim.getUTCMonth()));
    var n = nightsOf(draftIn, draftOut);
    calBox.querySelector("#th-cal-sum").innerHTML = (draftIn && draftOut)
      ? esc(fmtShort(draftIn)) + " → " + esc(fmtShort(draftOut)) + " · <b>" + n + "박</b>"
      : (draftIn ? esc(fmtShort(draftIn)) + " → 체크아웃을 골라 주세요" : "체크인을 골라 주세요");
    calBox.querySelector("#th-cal-ok").disabled = !(draftIn && draftOut);
  }
  function openCal(which) {
    if (!calBox) return;
    if (!calBox.hidden && calPick === which) { closeCal(); return; }   // 같은 필드 다시 누르면 접기
    closePanes("cal");
    draftIn = state.checkIn; draftOut = state.checkOut;
    calPick = which === "out" ? "out" : "in";
    var base = parseIso(calPick === "out" ? (draftOut || draftIn) : draftIn) || todayKST();
    calY = base.getUTCFullYear(); calM = base.getUTCMonth();
    paintCal();
    showPane(calBox);
    ROOT.querySelector("#th-in-btn").classList.toggle("act", calPick === "in");
    ROOT.querySelector("#th-out-btn").classList.toggle("act", calPick === "out");
  }
  function closeCal() {
    if (!calBox) return;
    calBox.hidden = true; calBox.classList.remove("on");
    var a = ROOT && ROOT.querySelector("#th-in-btn"); if (a) a.classList.remove("act");
    var b = ROOT && ROOT.querySelector("#th-out-btn"); if (b) b.classList.remove("act");
  }
  function pickDay(d) {
    if (calPick === "in" || !draftIn || d <= draftIn) { draftIn = d; draftOut = ""; calPick = "out"; }
    else { draftOut = d; calPick = "in"; }
    paintCal();
  }
  function commitCal() {
    if (!(draftIn && draftOut)) return;
    var changed = draftIn !== state.checkIn || draftOut !== state.checkOut;
    state.checkIn = draftIn; state.checkOut = draftOut;
    paintForm(); closeCal();
    if (changed) researchIfShown();
  }

  /* ── 👪 인원 패널(성인·아동 + 아동 나이) ── */
  function ageSelect(i, v) {
    var o = '<option value=""' + (v == null || v === "" ? " selected" : "") + ">나이</option>";
    for (var a = 0; a <= 17; a++) o += '<option value="' + a + '"' + (String(v) === String(a) ? " selected" : "") + ">" + (a === 0 ? "1살 미만" : a + "살") + "</option>";
    return '<label class="th-age"><span>아동 ' + (i + 1) + "</span><select data-age=\"" + i + "\">" + o + "</select></label>";
  }
  function paintGuests() {
    var p = ROOT.querySelector("#th-gpane"), g = draftG;
    var missing = g.ages.some(function (x) { return x === "" || x == null; });
    p.innerHTML =
      '<div class="th-pin">' +
        '<div class="th-prow"><span><b>성인</b><small>18세 이상</small></span><span class="th-step">' +
          '<button type="button" data-g="a-" aria-label="성인 한 명 빼기"' + (g.adults <= 1 ? " disabled" : "") + '>−</button><b>' + g.adults + '</b>' +
          '<button type="button" data-g="a+" aria-label="성인 한 명 더하기"' + (g.adults >= MAX_ADULTS ? " disabled" : "") + ">+</button></span></div>" +
        '<div class="th-prow"><span><b>아동</b><small>0~17세</small></span><span class="th-step">' +
          '<button type="button" data-g="c-" aria-label="아동 한 명 빼기"' + (g.children <= 0 ? " disabled" : "") + '>−</button><b>' + g.children + '</b>' +
          '<button type="button" data-g="c+" aria-label="아동 한 명 더하기"' + (g.children >= MAX_KIDS ? " disabled" : "") + ">+</button></span></div>" +
        (g.children ? '<div class="th-ages">' + g.ages.map(function (v, i) { return ageSelect(i, v); }).join("") + "</div>" +
          '<p class="th-hint">요금이 아동 나이에 따라 달라져요. 체크인 날 기준 나이를 골라 주세요.</p>' : "") +
        '<div class="th-pfoot"><span class="th-psum">' + esc(guestsLabel(g.adults, g.children)) + "</span>" +
          '<button type="button" class="th-cal-ok" id="th-g-ok"' + (missing ? " disabled" : "") + ">" + (missing ? "나이를 골라 주세요" : "완료") + "</button></div>" +
      "</div>";
  }
  function openGuests() {
    var p = ROOT.querySelector("#th-gpane");
    if (!p.hidden) { closePanes(); return; }
    closePanes("g");
    draftG = { adults: state.adults, children: state.children, ages: state.childAges.slice(0, state.children) };
    while (draftG.ages.length < draftG.children) draftG.ages.push("");
    paintGuests();
    ROOT.querySelector("#th-guests").classList.add("act");
    showPane(p);
  }
  function commitGuests() {
    var g = draftG; if (!g) return;
    var changed = g.adults !== state.adults || g.children !== state.children || g.ages.join(",") !== state.childAges.join(",");
    state.adults = g.adults; state.children = g.children; state.childAges = g.ages.map(function (x) { return int(x, 0); });
    closePanes(); paintForm();
    if (changed) researchIfShown();
  }

  /* ── 🎚 필터 패널 ── */
  function typeList() {
    var tf = state.typeFacet;
    if (tf && tf.length) return tf.map(function (t) { return [t.key, t.name || TYPE_KO[t.key] || t.key, t.count]; });
    return TYPES.map(function (t) { return [t[0], t[1], null]; });
  }
  function segHTML(name, list, cur) {
    return '<div class="th-seg">' + list.map(function (x) {
      return '<button type="button" class="th-sgb' + (cur === x[0] ? " on" : "") + '" data-f="' + name + '" data-v="' + x[0] + '">' + x[1] + "</button>";
    }).join("") + "</div>";
  }
  function paintFilters() {
    var p = ROOT.querySelector("#th-fpane"), f = draftF;
    var pIdx = -1; PRICES.forEach(function (x, i) { if (x[0] === f.priceMin && x[1] === f.priceMax) pIdx = i; });
    p.innerHTML =
      '<div class="th-pin">' +
        '<div class="th-ftop"><b>필터</b><button type="button" class="th-cal-x" data-fx="close" aria-label="닫기">✕</button></div>' +
        '<div class="th-fsec"><span class="th-fl">숙소 유형</span><div class="th-tchips">' +
          typeList().map(function (t) {
            var on = f.types.indexOf(t[0]) >= 0;
            return '<button type="button" class="th-tch' + (on ? " on" : "") + '" data-type="' + esc(t[0]) + '"' + (t[2] === 0 && !on ? " disabled" : "") + ">" +
              esc(t[1]) + (t[2] != null ? "<i>" + won(t[2]) + "</i>" : "") + "</button>";
          }).join("") + "</div></div>" +
        '<div class="th-fsec"><span class="th-fl">성급</span>' + segHTML("minStar", STARS, f.minStar) + "</div>" +
        '<div class="th-fsec"><span class="th-fl">평점</span>' + segHTML("minScore", SCORES, f.minScore) + "</div>" +
        '<div class="th-fsec"><span class="th-fl">1박 가격</span><div class="th-tchips">' +
          PRICES.map(function (x, i) { return '<button type="button" class="th-tch' + (pIdx === i ? " on" : "") + '" data-price="' + i + '">' + x[2] + "</button>"; }).join("") + "</div>" +
          '<div class="th-prange"><label><span>최소</span><input type="text" inputmode="numeric" id="th-pmin" placeholder="0" value="' + (f.priceMin ? won(f.priceMin) : "") + '"><em>원</em></label>' +
          '<i>~</i><label><span>최대</span><input type="text" inputmode="numeric" id="th-pmax" placeholder="제한 없음" value="' + (f.priceMax ? won(f.priceMax) : "") + '"><em>원</em></label></div>' +
        "</div>" +
        '<div class="th-fsec th-togs">' +
          togHTML("discountOnly", IC.tag, "할인 중인 곳만", f.discountOnly) +
          togHTML("breakfast", IC.cup, "조식 포함", f.breakfast) +
          togHTML("freeWifi", IC.wifi, "무료 와이파이", f.freeWifi) +
        "</div>" +
        '<div class="th-pfoot"><button type="button" class="th-reset" data-fx="reset">초기화</button>' +
          '<button type="button" class="th-cal-ok th-apply" data-fx="apply">' + (activeCount(f) ? "필터 " + activeCount(f) + "개 적용" : "적용") + "</button></div>" +
      "</div>";
  }
  function togHTML(k, ic, label, on) {
    return '<button type="button" class="th-tog' + (on ? " on" : "") + '" data-tog="' + k + '" role="switch" aria-checked="' + (on ? "true" : "false") + '">' +
      '<span class="th-tog-l">' + ic + label + '</span><span class="th-sw"><i></i></span></button>';
  }
  function openFilters() {
    var p = ROOT.querySelector("#th-fpane");
    if (!p.hidden) { closePanes(); return; }
    closePanes("f");
    draftF = JSON.parse(JSON.stringify(state.f));
    paintFilters();
    ROOT.querySelector("#th-fbtn").classList.add("act");
    showPane(p);
  }
  function readPriceInputs() {
    var p = ROOT.querySelector("#th-fpane"); if (!p || !draftF) return;
    var a = p.querySelector("#th-pmin"), b = p.querySelector("#th-pmax");
    if (a) draftF.priceMin = int(String(a.value).replace(/[^\d]/g, ""), 0);
    if (b) draftF.priceMax = int(String(b.value).replace(/[^\d]/g, ""), 0);
    if (draftF.priceMax && draftF.priceMin > draftF.priceMax) { var t = draftF.priceMin; draftF.priceMin = draftF.priceMax; draftF.priceMax = t; }
  }
  function applyFilters() {
    readPriceInputs();
    state.f = draftF; draftF = null;
    closePanes(); paintForm();
    researchIfShown(true);
  }

  /* 결과가 떠 있으면(또는 실패 화면이면) 조건이 바뀔 때 다시 찾는다 */
  function researchIfShown(force) {
    if (!state.city.trim()) return;
    if (force || state.offers !== null || state.err) search();
  }

  /* ── 결과 ── */
  function scoreLabel(s) {
    s = Number(s) || 0;
    if (s >= 9) return "최고예요";
    if (s >= 8) return "아주 좋아요";
    if (s >= 7) return "좋아요";
    if (s > 0) return "괜찮아요";
    return "";
  }
  function starsHTML(n) {
    n = Number(n) || 0; if (n <= 0) return "";
    var full = Math.floor(n), half = (n - full) >= 0.5, s = "";
    for (var i = 0; i < full && i < 5; i++) s += "<i>★</i>";
    if (half && full < 5) s += '<i class="h">★</i>';
    return '<span class="th-stars-r" aria-label="' + n + '성급">' + s + "</span>";
  }
  function imgUrl(u) {
    u = String(u || "").trim();
    if (/^\/\//.test(u)) u = "https:" + u;
    if (/^http:\/\//i.test(u)) u = "https://" + u.slice(7);
    if (!/^https:\/\//i.test(u) || /["'<>\s`]/.test(u)) return "";
    return u;
  }
  function safeUrl(u) { u = String(u || ""); return /^https?:\/\//i.test(u) && !/["'<>\s`]/.test(u) ? u : ""; }
  function areaName(key) { var a = (state.areas || []).filter(function (x) { return x.key === key; })[0]; return a ? (a.name || a.key) : key; }
  function placeLine(o) {
    var bits = [];
    if (o.area) bits.push(esc(o.area));
    if (o.distKm != null && isFinite(Number(o.distKm))) bits.push((Number(o.distKm) < 10 ? Number(o.distKm).toFixed(1) : Math.round(Number(o.distKm))) + "km");
    return bits.join(" · ");
  }

  function offerHTML(o, i) {
    var img = imgUrl(o.img), url = safeUrl(o.url) || safeUrl(state.meta && state.meta.bookUrl);
    var disc = Math.round(Number(o.discount) || 0);
    var crossed = Number(o.crossed) || 0;
    var showCross = disc > 0 && crossed > (Number(o.price) || 0);
    var sc = Number(o.score) || 0;
    var nights = (state.meta && state.meta.nights) || nightsOf(state.checkIn, state.checkOut);
    var total = Number(o.totalPrice) || (nights > 1 ? (Number(o.price) || 0) * nights : 0);
    var place = placeLine(o);
    var tags = "";
    if (o.breakfast) tags += '<span class="th-tag">' + IC.cup + "조식 포함</span>";
    if (o.wifi) tags += '<span class="th-tag">' + IC.wifi + "무료 와이파이</span>";
    return '' +
    '<div class="th-card" style="--i:' + Math.min(i, 12) + '" role="button" tabindex="0" data-hid="' + esc(o.id) + '" data-url="' + esc(url) + '">' +
      '<div class="th-ph' + (img ? " skel" : " noimg") + '">' +
        (img ? '<img src="' + esc(img) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onload="this.parentNode.classList.add(\'ok\')" onerror="this.parentNode.classList.remove(\'skel\');this.parentNode.classList.add(\'noimg\');this.remove()">' : "") +
        '<span class="th-ph-ic">' + IC.bed + "</span>" +
        (disc > 0 ? '<span class="th-disc">-' + disc + "%</span>" : "") +
      "</div>" +
      '<div class="th-body">' +
        (o.typeKo || place ? '<div class="th-kind">' + (o.typeKo ? '<span class="th-type">' + esc(o.typeKo) + "</span>" : "") + (place ? '<span class="th-place">' + IC.pin + place + "</span>" : "") + "</div>" : "") +
        '<div class="th-nm">' + esc(o.name || "숙소") + "</div>" +
        '<div class="th-meta">' + starsHTML(o.star) +
          (sc > 0 ? '<span class="th-score"><b>' + sc.toFixed(1) + "</b>" + esc(scoreLabel(sc)) + "</span>" : "") +
          (o.reviews ? '<span class="th-rev">리뷰 ' + won(o.reviews) + "</span>" : "") +
        "</div>" +
        (tags ? '<div class="th-tags">' + tags + "</div>" : "") +
        '<div class="th-pr">' +
          '<div class="th-pr-l">' +
            (showCross ? '<span class="th-cross"><s>' + won(crossed) + '원</s><em>' + disc + "%</em></span>" : "") +
            '<span class="th-price"><b class="th-won" data-v="' + (Number(o.price) || 0) + '">0</b>원<small> / 1박</small></span>' +
            (nights > 1 && total ? '<span class="th-total">' + nights + "박 총 " + won(total) + "원</span>" : "") +
            (o.roomType ? '<span class="th-total th-rt">' + esc(o.roomType) + " 기준</span>" : "") +
          "</div>" +
          '<button type="button" class="th-book" data-book="1">아고다에서 예약' + IC.out + "</button>" +
        "</div>" +
      "</div>" +
    "</div>";
  }

  function countUp(el) {
    var to = Number(el.getAttribute("data-v")) || 0;
    if (reduced()) { el.textContent = won(to); return; }
    var t0 = 0, done = false;
    function step(ts) {
      if (done) return;
      if (!t0) t0 = ts;
      var p = Math.min(1, (ts - t0) / 700), e = 1 - Math.pow(1 - p, 3);
      el.textContent = won(to * e);
      if (p < 1) requestAnimationFrame(step); else { done = true; el.classList.add("pop"); }
    }
    requestAnimationFrame(step);
    // 화면이 가려져 rAF 가 멈춰도 끝엔 진짜 값(「0원」에 멈춘 사고 — friend.js 26.9.22)
    setTimeout(function () { if (!done) { done = true; el.textContent = won(to); } }, 1000);
  }

  function skeletonHTML(n) {
    var sk = "";
    for (var i = 0; i < n; i++) sk += '<div class="th-skc" style="--i:' + i + '"><div class="th-sk-ph"></div><div class="th-sk-b"><i></i><i></i><i></i></div></div>';
    return sk;
  }

  function emptyHTML(title, sub, retry) {
    return '<div class="th-empty"><span class="th-empty-ic">' + IC.bed + "</span><b>" + esc(title) + "</b><span>" + esc(sub) + "</span>" +
      (retry ? '<button type="button" class="th-retry" id="th-retry">다시 찾기</button>' : "") +
      (activeCount() || state.area ? '<button type="button" class="th-retry th-clear" data-clear="all">필터 모두 해제</button>' : "") +
      (state.meta && safeUrl(state.meta.bookUrl) ? '<a class="th-empty-go" href="' + esc(state.meta.bookUrl) + '" target="_blank" rel="noopener noreferrer" data-url="' + esc(state.meta.bookUrl) + '">아고다에서 직접 찾기 ↗</a>' : "") +
      "</div>";
  }

  /* 켜진 조건 요약 칩 — 누르면 그 조건만 풀고 다시 찾는다 */
  function summaryChips() {
    var f = state.f, out = [];
    if (state.area) out.push(["area", areaName(state.area)]);
    if (f.types.length) out.push(["types", f.types.map(function (k) { var t = typeList().filter(function (x) { return x[0] === k; })[0]; return t ? t[1] : (TYPE_KO[k] || k); }).join("·")]);
    if (f.minStar) out.push(["minStar", f.minStar === 5 ? "5성" : f.minStar + "성 이상"]);
    if (f.minScore) out.push(["minScore", "평점 " + f.minScore + "+"]);
    if (f.priceMin || f.priceMax) out.push(["price", (f.priceMin ? wonShort(f.priceMin) : "") + "~" + (f.priceMax ? wonShort(f.priceMax) : "") + "원"]);
    if (f.discountOnly) out.push(["discountOnly", "할인 중"]);
    if (f.breakfast) out.push(["breakfast", "조식 포함"]);
    if (f.freeWifi) out.push(["freeWifi", "무료 와이파이"]);
    if (!out.length) return "";
    return '<div class="th-fsum chip-scroll">' + out.map(function (c) {
      return '<button type="button" class="th-fsc" data-clear="' + c[0] + '">' + esc(c[1]) + IC.x + "</button>";
    }).join("") + (out.length > 1 ? '<button type="button" class="th-fsc th-fsc-all" data-clear="all">모두 해제</button>' : "") + "</div>";
  }
  function clearOne(k) {
    if (k === "all") { state.f = freshFilters(); state.area = ""; }
    else if (k === "area") state.area = "";
    else if (k === "types") state.f.types = [];
    else if (k === "price") { state.f.priceMin = 0; state.f.priceMax = 0; }
    else if (k === "minStar" || k === "minScore") state.f[k] = 0;
    else state.f[k] = false;
    if (!state.area && state.sort === "distance") state.sort = "rec";
    paintForm();
    researchIfShown(true);
  }

  function headHTML() {
    var m = state.meta || {};
    var nights = m.nights || nightsOf(state.checkIn, state.checkOut);
    var who = "성인 " + (m.adults || state.adults) + ((m.children != null ? m.children : state.children) ? " · 아동 " + (m.children != null ? m.children : state.children) : "");
    var sorts = SORTS.slice(); if (state.area) sorts.push(["distance", "가까운 순"]);
    return '<div class="th-rhead">' +
        '<div class="th-rtitle"><b>' + esc(m.cityName || state.cityName || state.city) + (state.area ? " · " + esc(areaName(state.area)) : "") + ' 숙소</b>' +
          '<span class="th-rsub">' + esc(fmtShort(m.checkIn || state.checkIn)) + " ~ " + esc(fmtShort(m.checkOut || state.checkOut)) + " · " + nights + "박 · " + esc(who) + "</span>" +
        "</div>" +
      "</div>" +
      summaryChips() +
      '<div class="th-sort chip-scroll" id="th-sort">' + sorts.map(function (s) {
        return '<button type="button" class="th-so' + (state.sort === s[0] ? " on" : "") + '" data-s="' + s[0] + '">' + s[1] + "</button>";
      }).join("") + "</div>";
  }

  function paintResults() {
    var box = ROOT && ROOT.querySelector("#th-results"); if (!box) return;
    if (state.loading) {
      // 정렬·필터로 다시 찾을 땐 머리(조건·정렬)는 남기고 목록만 스켈레톤 — 칩이 사라졌다 나타나면 어지럽다
      box.innerHTML = (state.city && state.keepHead ? headHTML() : "") +
        '<div class="th-loading"><div class="th-ld-t">' + IC.bed + "<span><b>" + esc(state.city) + "</b> 빈 방 찾는 중…</span></div>" + skeletonHTML(3) + "</div>";
      return;
    }
    if (state.err) {
      var c = state.err, head = (c === "no_result" && state.keepHead) ? headHTML() : "";
      if (c === "no_key") box.innerHTML = emptyHTML("숙소 검색 준비 중이에요", "곧 열려요. 조금만 기다려 주세요.");
      else if (c === "no_city") box.innerHTML = emptyHTML("'" + state.errCity + "' 도시를 못 찾았어요", "도시 이름을 다시 확인하거나 위의 인기 도시를 눌러 보세요.");
      else if (c === "no_result") box.innerHTML = head + emptyHTML(activeCount() || state.area ? "조건에 맞는 숙소가 없어요" : "그 날짜엔 빈 방이 없어요", activeCount() || state.area ? "필터를 풀거나 날짜를 바꿔 보세요." : "날짜나 인원을 바꿔 다시 찾아보세요.");
      else box.innerHTML = emptyHTML("숙소를 불러오지 못했어요", "잠시 뒤 다시 시도해 주세요.", true);
      return;
    }
    if (!state.offers) { box.innerHTML = ""; return; }
    var m = state.meta || {};
    var lo = state.offers.reduce(function (mm, o) { var p = Number(o.price) || 0; return p && (!mm || p < mm) ? p : mm; }, 0);
    box.innerHTML = headHTML() +
      '<div class="th-count"><b>' + won(state.total || state.offers.length) + "곳</b>" + (lo ? " · 1박 최저 <em>" + won(lo) + "</em>원부터" : "") +
        (state.total > state.offers.length ? '<span class="th-count-s">상위 ' + state.offers.length + "곳 표시</span>" : "") + "</div>" +
      '<div class="th-list">' + state.offers.map(offerHTML).join("") + "</div>" +
      (safeUrl(m.bookUrl) ? '<a class="th-more" href="' + esc(m.bookUrl) + '" target="_blank" rel="noopener noreferrer" data-url="' + esc(m.bookUrl) + '">아고다에서 더 많은 숙소 보기 ↗</a>' : "") +
      '<p class="th-note">가격은 아고다 제휴 요금(표시된 객실 기준·세금 별도일 수 있음). 아고다로 넘어가면 더 싼 객실이나 회원 쿠폰가가 보일 수 있어요 · 예약은 아고다에서 진행</p>';
    box.querySelectorAll(".th-won").forEach(countUp);
  }

  async function client() {
    sb = sb || window.supabaseClient || (window.waitForSupabaseClient ? await window.waitForSupabaseClient() : null);
    if (!sb || !sb.functions) throw new Error("no client");
    return sb;
  }
  async function call(body) {
    var c = await client();
    var res = await c.functions.invoke("galla-friend", { body: body });
    var d = res && res.data;
    if (!d && res && res.error) {
      // 비 2xx 응답이어도 본문에 {ok:false, code} 가 실려 오는 경우가 있다
      try { var ctx = res.error.context; if (ctx && ctx.json) d = await ctx.json(); } catch (_) {}
    }
    return d || null;
  }

  /* 도시의 지역·유형 — 검색 전에 지역 칩을 그린다(검색 응답의 facets 로도 채워진다) */
  async function loadCity(city) {
    city = String(city || "").trim();
    if (!city || state.facetCity === city) return;
    var my = ++cseq;
    var d = null;
    try { d = await call({ op: "hotel_city", city: city }); } catch (_) {}
    if (my !== cseq || !ROOT) return;
    if (d && d.ok) {
      state.facetCity = city;
      state.cityName = (d.city && d.city.name) || city;
      state.areas = d.areas || [];
      if (d.types && d.types.length) state.typeFacet = d.types;
      if (state.area && !state.areas.some(function (a) { return a.key === state.area; })) state.area = "";
      paintAreas();
    }
  }
  function setCity(city) {
    city = String(city || "").trim();
    if (city === state.city.trim() && state.facetCity) return;
    if (city !== state.city.trim()) {                 // 도시가 바뀌면 그 도시의 지역·유형 정보는 버린다
      state.areas = []; state.typeFacet = null; state.facetCity = ""; state.area = "";
      if (state.sort === "distance") state.sort = "rec";
      state.offers = null; state.err = null;
    }
    state.city = city;
    paintAreas();
  }

  function searchBody() {
    var f = state.f;
    return {
      op: "hotel_search", city: state.city.trim(), checkIn: state.checkIn, checkOut: state.checkOut,
      adults: state.adults, children: state.children, childAges: state.childAges.slice(0, state.children),
      area: state.area || "", types: f.types.slice(), minStar: f.minStar, minScore: f.minScore,
      priceMin: f.priceMin, priceMax: f.priceMax, discountOnly: !!f.discountOnly, breakfast: !!f.breakfast, freeWifi: !!f.freeWifi,
      sort: (state.sort === "distance" && !state.area) ? "rec" : state.sort
    };
  }

  async function search() {
    var inp = ROOT && ROOT.querySelector("#th-city");
    var city = String(state.city || "").trim();
    if (!city) {
      if (inp) { try { inp.focus({ preventScroll: true }); } catch (_) {} inp.classList.add("th-shake"); setTimeout(function () { inp.classList.remove("th-shake"); }, 500); }
      return;
    }
    closePanes();
    if (state.detailId) closeDetail(true);
    var my = ++seq;
    // 같은 도시에서 조건만 바꾼 재검색이면 결과 머리(조건 칩·정렬)를 유지
    state.keepHead = !!(state.meta && state.meta.cityQ === city);
    state.loading = true; state.offers = null; state.err = null;
    paintResults();
    if (!state.facetCity) loadCity(city);              // 지역 칩은 따로 빨리(검색과 병렬)
    var t0 = Date.now(), d = null;
    try { d = await call(searchBody()); } catch (_) { d = null; }
    var wait = Math.max(0, 650 - (Date.now() - t0));     // 스켈레톤이 깜빡이고 사라지지 않게 최소 노출
    if (wait) await new Promise(function (r) { setTimeout(r, wait); });
    if (my !== seq || !ROOT) return;
    state.loading = false;
    var keepMeta = state.meta;
    if (!d || d.ok === false) {
      state.err = (d && d.code) || "api_error"; state.errCity = city;
      state.meta = d && d.bookUrl ? { bookUrl: d.bookUrl, cityQ: city } : (state.err === "no_result" ? keepMeta : null);
    } else {
      if (d.facets) {
        if (d.facets.areas && d.facets.areas.length) { state.areas = d.facets.areas; state.facetCity = city; }
        if (d.facets.types && d.facets.types.length) state.typeFacet = d.facets.types;
        state.priceFacet = d.facets.price || null;
      }
      if (d.city && d.city.name) state.cityName = d.city.name;
      state.meta = {
        cityQ: city, cityName: (d.city && d.city.name) || city, checkIn: d.checkIn || state.checkIn, checkOut: d.checkOut || state.checkOut,
        nights: d.nights, adults: d.adults, children: d.children, bookUrl: d.bookUrl, source: d.source
      };
      if (!d.offers || !d.offers.length) { state.err = "no_result"; state.keepHead = true; }
      else { state.offers = d.offers; state.total = Number(d.total) || d.offers.length; }
      paintAreas();
    }
    paintResults();
  }

  function openOut(url) {
    if (!url) return;
    if (window.GALLA_openLink) window.GALLA_openLink(url);
    else { try { window.open(url, "_blank", "noopener"); } catch (_) { location.href = url; } }
  }

  /* ════════ 🏨 상세 ════════ */
  function scrollParent(el) {
    var p = el && el.parentElement;
    while (p && p !== document.body && p !== document.documentElement) {
      var s = getComputedStyle(p).overflowY;
      if ((s === "auto" || s === "scroll") && p.scrollHeight > p.clientHeight + 1) return p;
      p = p.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }
  function getScroll() { var sp = scrollParent(ROOT); return sp ? sp.scrollTop : 0; }
  function setScroll(y) { var sp = scrollParent(ROOT); if (sp) sp.scrollTop = y; }

  function findOffer(id) { return (state.offers || []).filter(function (o) { return String(o.id) === String(id); })[0] || null; }

  function openDetail(id, opts) {
    opts = opts || {};
    if (!id || !ROOT) return;
    closePanes();
    listScroll = getScroll();
    state.detailId = String(id);
    var main = ROOT.querySelector("#th-main"), det = ROOT.querySelector("#th-detail");
    main.hidden = true; det.hidden = false;
    var pre = findOffer(id);
    det.innerHTML = detailTopHTML(pre && pre.name) + detailSkeleton(pre);
    if (!isSPA() && !opts.noHistory) { try { history.pushState({ thDetail: String(id) }, ""); } catch (_) {} }
    // 상세 맨 위로 — 모듈 머리가 보이게
    try { var sp = scrollParent(ROOT); var top = ROOT.getBoundingClientRect().top - (sp === document.scrollingElement || sp === document.documentElement ? 0 : sp.getBoundingClientRect().top); sp.scrollTop = Math.max(0, sp.scrollTop + top - 8); } catch (_) {}
    loadDetail(id);
  }
  function closeDetail(silent) {
    if (!ROOT || !state.detailId) return;
    state.detailId = null; dseq++;
    var main = ROOT.querySelector("#th-main"), det = ROOT.querySelector("#th-detail");
    det.hidden = true; det.innerHTML = ""; main.hidden = false;
    if (!silent) {
      // 바로 갈라에서 상세로 들어와 목록이 아직 없으면 지금 찾는다
      if (state.offers === null && !state.err && !state.loading && state.city) search();
      else {
        // 브라우저가 popstate 뒤에 그 칸의 옛 스크롤(0)을 되살려 덮어쓴다 — 한 박자 늦게 한 번 더
        var y = listScroll; setScroll(y);
        requestAnimationFrame(function () { setScroll(y); });
        setTimeout(function () { setScroll(y); }, 60);
      }
    }
  }
  /* 상세의 '목록으로' — 웹은 history 한 칸을 되돌려(popstate 가 닫는다), 앱은 바로 닫는다 */
  function backToList() {
    if (!isSPA()) { try { if (history.state && history.state.thDetail) { history.back(); return; } } catch (_) {} }
    closeDetail();
  }
  window.addEventListener("popstate", function (ev) {
    if (!state.detailId || isSPA()) return;
    var st = ev && ev.state;
    if (st && st.thDetail === state.detailId) return;    // 다시 상세 칸으로 온 것(앞으로 가기)
    closeDetail();
  });

  function detailTopHTML(name) {
    return '<div class="th-dtop"><button type="button" class="th-dback" data-sheet-close data-dback="1" aria-label="목록으로">' + IC.back + "<span>목록</span></button>" +
      '<span class="th-dtop-t">' + esc(name || "숙소 정보") + "</span></div>";
  }
  function detailSkeleton(pre) {
    var img = pre && imgUrl(pre.img);
    return '<div class="th-dload"><div class="th-gal th-gal-sk">' + (img ? '<img src="' + esc(img) + '" alt="">' : "") + "</div>" +
      '<div class="th-dsk"><i></i><i></i><i></i><i></i></div></div>';
  }

  async function loadDetail(id) {
    var my = ++dseq;
    var body = { op: "hotel_detail", hotelId: id, checkIn: state.checkIn, checkOut: state.checkOut,
      adults: state.adults, children: state.children, childAges: state.childAges.slice(0, state.children) };
    var d = null;
    try { d = await call(body); } catch (_) { d = null; }
    if (my !== dseq || !ROOT || state.detailId !== String(id)) return;
    var det = ROOT.querySelector("#th-detail");
    if (!d || d.ok === false || !d.hotel) {
      var pre = findOffer(id);
      det.innerHTML = detailTopHTML(pre && pre.name) + '<div class="th-dbody"><div class="th-empty"><span class="th-empty-ic">' + IC.bed + "</span>" +
        "<b>" + (d && d.code === "no_key" ? "숙소 정보 준비 중이에요" : "숙소 정보를 불러오지 못했어요") + "</b><span>잠시 뒤 다시 시도해 주세요.</span>" +
        '<button type="button" class="th-retry" data-dretry="' + esc(id) + '">다시 불러오기</button></div>' +
        (pre && safeUrl(pre.url) ? '<a class="th-dbook" href="' + esc(pre.url) + '" target="_blank" rel="noopener noreferrer" data-url="' + esc(pre.url) + '">아고다에서 보기' + IC.out + "</a>" : "") + "</div>";
      return;
    }
    det.innerHTML = detailTopHTML(d.hotel.name) + detailHTML(d);
    wireGallery(det);
    det.querySelectorAll(".th-won").forEach(countUp);
  }

  function galleryHTML(h) {
    var ph = (h.photos || []).map(imgUrl).filter(Boolean).slice(0, 5);
    if (!ph.length) { var pre = findOffer(h.id); if (pre && imgUrl(pre.img)) ph = [imgUrl(pre.img)]; }
    if (!ph.length) return '<div class="th-gal th-gal-none"><span class="th-ph-ic">' + IC.bed + "</span></div>";
    return '<div class="th-gal" data-no-ptr><div class="th-gal-track" id="th-gal-track">' +
      ph.map(function (u, i) {
        return '<div class="th-gal-s skel"><img src="' + esc(u) + '" alt="" ' + (i ? 'loading="lazy" ' : "") + 'decoding="async" referrerpolicy="no-referrer" onload="this.parentNode.classList.add(\'ok\')" onerror="this.parentNode.classList.add(\'no\');this.remove()"><span class="th-ph-ic">' + IC.bed + "</span></div>";
      }).join("") + "</div>" +
      (ph.length > 1 ? '<span class="th-gal-n" id="th-gal-n">1 / ' + ph.length + "</span>" +
        '<div class="th-gal-dots">' + ph.map(function (_, i) { return "<i" + (i ? "" : ' class="on"') + "></i>"; }).join("") + "</div>" : "") +
    "</div>";
  }
  function wireGallery(det) {
    var tr = det.querySelector("#th-gal-track"); if (!tr) return;
    var n = det.querySelector("#th-gal-n"), dots = det.querySelectorAll(".th-gal-dots i"), tot = tr.children.length, last = 0, raf = 0;
    tr.addEventListener("scroll", function () {
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = 0;
        var i = Math.max(0, Math.min(tot - 1, Math.round(tr.scrollLeft / Math.max(1, tr.clientWidth))));
        if (i === last) return; last = i;
        if (n) n.textContent = (i + 1) + " / " + tot;
        dots.forEach(function (d, k) { d.classList.toggle("on", k === i); });
      });
    }, { passive: true });
  }

  function infoRow(label, val) { return val ? '<div class="th-irow"><span>' + label + "</span><b>" + esc(val) + "</b></div>" : ""; }
  function hasHangul(s) { return /[가-힣]/.test(String(s || "")); }

  function detailHTML(d) {
    var h = d.hotel, o = d.offer, nights = d.nights || nightsOf(state.checkIn, state.checkOut);
    var sc = Number(h.score) || 0;
    var price = "";
    if (o) {
      var disc = Math.round(Number(o.discount) || 0), crossed = Number(o.crossed) || 0;
      var total = Number(o.totalPrice) || (Number(o.price) || 0) * nights;
      price = '<div class="th-dprice">' +
        '<div class="th-dp-l">' +
          (disc > 0 && crossed > (Number(o.price) || 0) ? '<span class="th-cross"><s>' + won(crossed) + '원</s><em>' + disc + "% 할인</em></span>" : "") +
          '<span class="th-price th-price-l"><b class="th-won" data-v="' + (Number(o.price) || 0) + '">0</b>원<small> / 1박</small></span>' +
          (nights > 1 && total ? '<span class="th-total">' + nights + "박 총 " + won(total) + "원</span>" : "") +
        "</div>" +
        '<div class="th-dp-r"><span class="th-rsub">' + esc(fmtShort(state.checkIn)) + " ~ " + esc(fmtShort(state.checkOut)) + "</span>" +
          '<span class="th-dp-who">' + esc(guestsLabel(state.adults, state.children)) + "</span></div>" +
        (o.roomType ? '<div class="th-room">' + IC.bed + "<span>" + esc(o.roomType) + "</span></div>" : "") +
        ((o.breakfast || o.wifi) ? '<div class="th-tags">' + (o.breakfast ? '<span class="th-tag">' + IC.cup + "조식 포함</span>" : "") + (o.wifi ? '<span class="th-tag">' + IC.wifi + "무료 와이파이</span>" : "") + "</div>" : "") +
      "</div>";
    } else {
      price = '<div class="th-dprice th-dnone"><b>' + (d.offerError ? "지금 요금을 불러오지 못했어요" : "그 날짜엔 빈 방이 없어요") + '</b><span>' + esc(fmtShort(state.checkIn)) + " ~ " + esc(fmtShort(state.checkOut)) + " · " + esc(guestsLabel(state.adults, state.children)) + "</span>" +
        '<button type="button" class="th-retry" data-redate="1">날짜 바꾸기</button></div>';
    }
    var reno = [h.yearOpened ? h.yearOpened + "년 개업" : "", h.yearRenovated ? h.yearRenovated + "년 리노베이션" : ""].filter(Boolean).join(" · ");
    var info = infoRow("체크인", h.checkinTime ? h.checkinTime + " 부터" : "") + infoRow("체크아웃", h.checkoutTime ? h.checkoutTime + " 까지" : "") +
      infoRow("객실", h.rooms ? won(h.rooms) + "개" : "") + infoRow("층수", h.floors ? h.floors + "층" : "") +
      infoRow("연도", reno) + infoRow("브랜드", h.chain || "");
    var lat = Number(h.lat), lng = Number(h.lng), hasGeo = isFinite(lat) && isFinite(lng) && (lat || lng);
    var mapUrl = hasGeo ? "https://www.google.com/maps/search/?api=1&query=" + lat + "," + lng : "";
    var ov = String(h.overview || "").trim();
    var book = safeUrl(o && o.url) || safeUrl((findOffer(h.id) || {}).url) || safeUrl(state.meta && state.meta.bookUrl);
    return '<div class="th-dbody">' +
      galleryHTML(h) +
      '<div class="th-dhead">' +
        '<div class="th-kind">' + (h.typeKo || TYPE_KO[h.type] ? '<span class="th-type">' + esc(h.typeKo || TYPE_KO[h.type]) + "</span>" : "") + starsHTML(h.star) + "</div>" +
        '<h2 class="th-dname">' + esc(h.name || "숙소") + "</h2>" +
        (sc > 0 ? '<div class="th-meta"><span class="th-score th-score-l"><b>' + sc.toFixed(1) + "</b>" + esc(scoreLabel(sc)) + "</span>" +
          (h.reviews ? '<span class="th-rev">리뷰 ' + won(h.reviews) + "개</span>" : "") + "</div>" : "") +
      "</div>" +
      price +
      (info ? '<div class="th-dsec"><h3>숙소 정보</h3><div class="th-info">' + info + "</div></div>" : "") +
      ((h.address || hasGeo) ? '<div class="th-dsec"><h3>위치</h3>' +
        (h.address ? '<p class="th-addr">' + IC.pin + "<span>" + esc(h.address) + (h.zipcode ? " (" + esc(h.zipcode) + ")" : "") + "</span></p>" : "") +
        (mapUrl ? '<button type="button" class="th-mapbtn" data-url="' + esc(mapUrl) + '">' + IC.map + "지도에서 보기</button>" : "") + "</div>" : "") +
      (ov ? '<div class="th-dsec"><h3>' + (hasHangul(ov) ? "소개" : "소개(영문)") + '</h3><div class="th-ov" id="th-ov">' + esc(ov) + "</div>" +
        (ov.length > 180 ? '<button type="button" class="th-ovt" data-ov="1">펼치기</button>' : "") + "</div>" : "") +
      (book && o ? '<a class="th-dbook" href="' + esc(book) + '" target="_blank" rel="noopener noreferrer" data-url="' + esc(book) + '">아고다에서 예약' + IC.out + "</a>" : "") +
      '<p class="th-note">표시 요금은 위 객실 기준 아고다 제휴 요금이에요(세금 별도일 수 있음). 아고다에서 다른 객실·회원 쿠폰가가 더 쌀 수 있어요 · 예약·결제는 아고다에서 진행돼요</p>' +
    "</div>";
  }

  /* 앱(SPA) 스택 안에서 상세의 좌측 엣지 스와이프 = 목록으로.
     라우터의 스택 스와이프(레이어 touchstart)보다 먼저 받아 전파를 끊는다 — 안 끊으면 숙소 화면 전체가 닫힌다. */
  function armEdgeBack(det) {
    if (det.__thEdge) return; det.__thEdge = true;
    var sx = 0, sy = 0, on = false, lock = null, dx = 0;
    det.addEventListener("touchstart", function (e) {
      if (!state.detailId || !det.closest(".stack-view")) { on = false; return; }
      var t = e.touches[0];
      on = t.clientX <= 28; if (!on) return;
      sx = t.clientX; sy = t.clientY; lock = null; dx = 0;
      e.stopPropagation();
    }, { passive: true });
    det.addEventListener("touchmove", function (e) {
      if (!on) return;
      e.stopPropagation();
      var t = e.touches[0], mx = t.clientX - sx, my = t.clientY - sy;
      if (lock === null) { if (Math.abs(mx) < 6 && Math.abs(my) < 6) return; lock = (mx > 0 && Math.abs(mx) > Math.abs(my) * 1.2) ? "h" : "v"; }
      if (lock !== "h") return;
      dx = Math.max(0, mx);
      det.style.transition = "none"; det.style.transform = "translateX(" + dx + "px)"; det.style.opacity = String(Math.max(.4, 1 - dx / 600));
    }, { passive: true });
    function end(e) {
      if (!on) return; on = false;
      if (e) e.stopPropagation();
      det.style.transition = "transform .2s ease, opacity .2s ease";
      if (lock === "h" && dx > 90) { det.style.transform = "translateX(40%)"; det.style.opacity = "0"; setTimeout(function () { det.style.cssText = ""; backToList(); }, 180); }
      else { det.style.transform = ""; det.style.opacity = ""; setTimeout(function () { det.style.transition = ""; }, 220); }
    }
    det.addEventListener("touchend", end, { passive: true });
    det.addEventListener("touchcancel", end, { passive: true });
  }

  function wire() {
    var form = ROOT.querySelector("#th-form");
    var inp = ROOT.querySelector("#th-city");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (e.isComposing) return;
      setCity(inp.value);
      inp.blur();
      search();
    });
    // 안드로이드 한글 IME — 조합 중 Enter 는 조합 확정이지 검색이 아니다
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter" && (e.isComposing || e.keyCode === 229)) e.preventDefault(); });
    // 입력 중엔 DOM 을 건드리지 않는다(IME 이중입력 함정). 확정(change)되면 그 도시의 지역 칩을 받아 온다.
    inp.addEventListener("change", function () { var v = inp.value.trim(); if (v && v !== state.city.trim()) { setCity(v); loadCity(v); } });

    ROOT.querySelector("#th-areas").addEventListener("click", function (e) {
      var b = e.target.closest(".th-ach"); if (!b) return;
      var k = b.dataset.area || "";
      if (k === state.area) return;
      state.area = k;
      if (!k && state.sort === "distance") state.sort = "rec";
      paintAreas();
      if (!state.city.trim()) setCity(inp.value);
      researchIfShown(true);
    });

    ROOT.querySelector("#th-in-btn").addEventListener("click", function () { openCal("in"); });
    ROOT.querySelector("#th-out-btn").addEventListener("click", function () { openCal("out"); });
    calBox = ROOT.querySelector("#th-cal");
    calBox.addEventListener("click", function (e) {
      if (e.target.closest("#th-cal-x")) { closeCal(); return; }
      if (e.target.closest("#th-cal-prev")) { if (--calM < 0) { calM = 11; calY--; } paintCal(); return; }
      if (e.target.closest("#th-cal-next")) { if (++calM > 11) { calM = 0; calY++; } paintCal(); return; }
      if (e.target.closest("#th-cal-ok")) { commitCal(); return; }
      var cd = e.target.closest(".th-cd[data-d]"); if (cd) pickDay(cd.dataset.d);
    });

    ROOT.querySelector("#th-guests").addEventListener("click", openGuests);
    var gp = ROOT.querySelector("#th-gpane");
    gp.addEventListener("click", function (e) {
      var b = e.target.closest("[data-g]");
      if (b && !b.disabled) {
        var g = draftG, k = b.dataset.g;
        if (k === "a-" && g.adults > 1) g.adults--;
        if (k === "a+" && g.adults < MAX_ADULTS) g.adults++;
        if (k === "c-" && g.children > 0) { g.children--; g.ages.pop(); }
        if (k === "c+" && g.children < MAX_KIDS) { g.children++; g.ages.push(""); }
        paintGuests(); return;
      }
      if (e.target.closest("#th-g-ok")) commitGuests();
    });
    gp.addEventListener("change", function (e) {
      var s = e.target.closest("select[data-age]"); if (!s) return;
      draftG.ages[int(s.dataset.age, 0)] = s.value;
      paintGuests();
    });

    ROOT.querySelector("#th-fbtn").addEventListener("click", openFilters);
    var fp = ROOT.querySelector("#th-fpane");
    fp.addEventListener("click", function (e) {
      if (!draftF) return;
      var x = e.target.closest("[data-fx]");
      if (x) {
        if (x.dataset.fx === "close") { draftF = null; closePanes(); return; }
        if (x.dataset.fx === "reset") { draftF = freshFilters(); paintFilters(); return; }
        if (x.dataset.fx === "apply") { applyFilters(); return; }
      }
      readPriceInputs();
      var t = e.target.closest("[data-type]");
      if (t && !t.disabled) { var k = t.dataset.type, i = draftF.types.indexOf(k); if (i >= 0) draftF.types.splice(i, 1); else draftF.types.push(k); paintFilters(); return; }
      var s = e.target.closest("[data-f]");
      if (s) { draftF[s.dataset.f] = int(s.dataset.v, 0); paintFilters(); return; }
      var pr = e.target.closest("[data-price]");
      if (pr) { var P = PRICES[int(pr.dataset.price, 0)]; draftF.priceMin = P[0]; draftF.priceMax = P[1]; paintFilters(); return; }
      var tg = e.target.closest("[data-tog]");
      if (tg) { draftF[tg.dataset.tog] = !draftF[tg.dataset.tog]; paintFilters(); return; }
    });
    // 직접 입력한 가격은 숫자만 + 천 단위 쉼표(포커스 뺄 때)
    fp.addEventListener("focusout", function (e) {
      var el = e.target; if (!el || (el.id !== "th-pmin" && el.id !== "th-pmax") || !draftF) return;
      readPriceInputs();
      var n = int(String(el.value).replace(/[^\d]/g, ""), 0);
      el.value = n ? won(n) : "";
      var ap = fp.querySelector(".th-apply"); if (ap) ap.textContent = activeCount(draftF) ? "필터 " + activeCount(draftF) + "개 적용" : "적용";
      fp.querySelectorAll("[data-price]").forEach(function (b) { var P = PRICES[int(b.dataset.price, 0)]; b.classList.toggle("on", P[0] === draftF.priceMin && P[1] === draftF.priceMax); });
    });

    ROOT.querySelector("#th-pop").addEventListener("click", function (e) {
      var b = e.target.closest(".th-poch"); if (!b) return;
      inp.value = b.dataset.city; setCity(b.dataset.city);
      search();
    });

    ROOT.querySelector("#th-results").addEventListener("click", function (e) {
      var so = e.target.closest(".th-so");
      if (so) { if (state.sort !== so.dataset.s) { state.sort = so.dataset.s; search(); } return; }
      var cl = e.target.closest("[data-clear]");
      if (cl) { clearOne(cl.dataset.clear); return; }
      if (e.target.closest("#th-retry")) { search(); return; }
      var a = e.target.closest("a[data-url]");
      if (a) { e.preventDefault(); openOut(a.getAttribute("data-url")); return; }
      var card = e.target.closest(".th-card");
      if (!card) return;
      if (e.target.closest("[data-book]")) { openOut(card.getAttribute("data-url")); return; }   // 예약 버튼만 아고다 직행
      if (card.dataset.hid) openDetail(card.dataset.hid);
      else openOut(card.getAttribute("data-url"));
    });
    ROOT.querySelector("#th-results").addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      var card = e.target.closest && e.target.closest(".th-card"); if (card && card.dataset.hid) openDetail(card.dataset.hid);
    });

    var det = ROOT.querySelector("#th-detail");
    det.addEventListener("click", function (e) {
      if (e.target.closest("[data-dback]")) { backToList(); return; }
      var dr = e.target.closest("[data-dretry]");
      if (dr) { det.innerHTML = detailTopHTML((findOffer(dr.dataset.dretry) || {}).name) + detailSkeleton(findOffer(dr.dataset.dretry)); loadDetail(dr.dataset.dretry); return; }
      if (e.target.closest("[data-redate]")) { backToList(); setTimeout(function () { openCal("in"); }, 60); return; }
      var ovt = e.target.closest("[data-ov]");
      if (ovt) { var ov = det.querySelector("#th-ov"); var open = ov.classList.toggle("open"); ovt.textContent = open ? "접기" : "펼치기"; return; }
      var u = e.target.closest("[data-url]");
      if (u) { e.preventDefault(); openOut(u.getAttribute("data-url")); }
    });
    armEdgeBack(det);
  }

  function norm(s) { return parseIso(s) ? s : ""; }

  /* 파라미터 → 상태. 웹 쿼리·SPA 해시(문자열)·직접 호출(배열/숫자) 어느 쪽이 와도 같은 결과. */
  function applyParams(p) {
    if (p.city) setCity(String(p.city));
    var pin = norm(p.checkIn || p["in"]), pout = norm(p.checkOut || p.out);
    var today = iso(todayKST());
    if (pin && pin >= today) {
      state.checkIn = pin;
      state.checkOut = (pout && pout > pin && nightsOf(pin, pout) <= MAX_NIGHTS) ? pout : addDays(pin, 1);
    } else if (state.checkIn < today) {        // 오래 켜 둔 화면 — 지난 날짜는 기본값으로
      state.checkIn = defaultIn(); state.checkOut = addDays(state.checkIn, 1);
    }
    var ad = int(p.adults, 0); if (ad >= 1 && ad <= MAX_ADULTS) state.adults = ad;
    var ages = listOf(p.childAges || p.ages).map(function (x) { return Math.max(0, Math.min(17, int(x, 0))); });
    var ch = p.children != null && p.children !== "" ? int(p.children, 0) : (ages.length || null);
    if (ch != null && ch >= 0 && ch <= MAX_KIDS) {
      state.children = ch;
      while (ages.length < ch) ages.push(7);           // 나이를 안 넘겨줬으면 일단 7살(패널에서 고칠 수 있다)
      state.childAges = ages.slice(0, ch);
    }
    var hasFilter = ["area", "types", "minStar", "minScore", "priceMin", "priceMax", "discountOnly", "breakfast", "freeWifi"].some(function (k) { return p[k] != null && p[k] !== ""; });
    if (hasFilter) {
      var f = freshFilters();
      f.types = listOf(p.types).filter(function (k) { return TYPE_KO[k]; });
      var ms = int(p.minStar, 0); if ([2, 3, 4, 5].indexOf(ms) >= 0) f.minStar = ms;
      var mc = int(p.minScore, 0); if ([7, 8, 9].indexOf(mc) >= 0) f.minScore = mc;
      f.priceMin = Math.max(0, int(p.priceMin, 0)); f.priceMax = Math.max(0, int(p.priceMax, 0));
      f.discountOnly = p.discountOnly === true || p.discountOnly === "1" || p.discountOnly === "true";
      f.breakfast = p.breakfast === true || p.breakfast === "1" || p.breakfast === "true";
      f.freeWifi = p.freeWifi === true || p.freeWifi === "1" || p.freeWifi === "true";
      state.f = f;
      state.area = String(p.area || "");
    }
    if (p.sort && SORTS.concat([["distance"]]).some(function (s) { return s[0] === p.sort; })) state.sort = p.sort;
  }

  /* 화면이 여러 곳에 동시에 떠 있을 수 있다(여행 탭 세그 + 그 위에 쌓인 숙소 스택, 숙소 위에 또 숙소).
     모듈 상태·ROOT 는 하나라, 위의 화면이 닫히면 아래 화면을 다시 그려 리스너를 되살린다(release). */
  var ROOTS = [];
  function release(container) {
    ROOTS = ROOTS.filter(function (c) { return c !== container && c.isConnected; });
    if (ROOT !== container) return;
    ROOT = null; seq++; dseq++;
    var prev = ROOTS[ROOTS.length - 1];
    // 위 화면이 목록을 버렸으면(상세로 바로 들어왔던 경우) 아래 화면은 지금 조건으로 다시 찾는다
    if (prev && prev.querySelector(".th")) render(prev, (state.offers === null && !state.err && state.city) ? { city: state.city } : {});
  }

  function render(container, params) {
    if (!container) return;
    params = params || {};
    ROOTS = ROOTS.filter(function (c) { return c !== container && c.isConnected; }); ROOTS.push(container);
    ROOT = container;
    seq++; dseq++;                             // 이전 화면의 늦은 응답 무시
    state.loading = false; state.detailId = null;
    applyParams(params);
    calBox = null; draftF = null; draftG = null;
    container.innerHTML = shell();
    wire();
    paintForm();
    var hid = params.hotelId || params.hid;
    if (hid) {                                 // 갈비스·링크에서 특정 숙소로 — 바로 상세
      state.offers = null; state.err = null;   // 넘어온 조건으로 목록을 새로 찾게(뒤로 = 그 조건의 목록)
      if (state.city && !state.facetCity) loadCity(state.city);
      openDetail(String(hid), { noHistory: true });
      return;
    }
    if (params.city) search();                 // 검색·갈비스에서 넘어왔으면 바로 찾는다
    else { if (state.city && !state.facetCity) loadCity(state.city); paintResults(); }   // 같은 세션 재진입 — 직전 결과 유지
  }

  window.GALLA_TravelHotels = { render: render, release: release };

  /* 검색·갈비스에서 숙소 스택 페이지 열기(하이브리드 입구).
     opts: { checkIn, checkOut, adults, children, childAges, area, types, minStar, minScore, priceMin, priceMax, hotelId } */
  function openParams(city, opts) {
    opts = opts || {};
    var p = { city: city || "" };
    function put(k, v) { if (v == null || v === "" || v === 0 || v === false || (Array.isArray(v) && !v.length)) return; p[k] = Array.isArray(v) ? v.join(",") : String(v); }
    put("in", opts.checkIn); put("out", opts.checkOut); put("adults", opts.adults); put("children", opts.children);
    put("ages", opts.childAges); put("area", opts.area); put("types", opts.types); put("minStar", opts.minStar);
    put("minScore", opts.minScore); put("priceMin", opts.priceMin); put("priceMax", opts.priceMax); put("hid", opts.hotelId);
    return p;
  }
  window.GALLA_openHotels = function (city, opts) {
    var p = openParams(city, opts);
    if (window.GALLA_SPA && window.GALLA_SPA.push) return window.GALLA_SPA.push("hotels", p);
    var qs = Object.keys(p).map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(p[k]); }).join("&");
    (window.GALLA_nav || function (u) { location.href = u; })("hotels.html?" + qs);
  };
})();
