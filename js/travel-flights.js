/* =========================================================
   travel-flights.js — 여행 탭 → 항공권
   네이버 항공권식: 우리 UI로 검색·비교, 마지막 '예약'만 제휴사로 핸드오프.
   데이터는 엣지(galla-friend op:flight_search → Travelpayouts, 비용 0, 제휴 마커).

   경험 설계(사장님: "진짜 여행 가는 느낌"):
     · 하늘 히어로 — 새벽→낮으로 흐르는 그라데이션 + 흘러가는 구름 + 탑승권 폼
     · 검색하면 비행기가 점선 항로를 타고 출발지→도착지로 날아간다(SVG dashoffset)
     · 결과는 탑승권(보딩패스) 카드가 시차를 두고 미끄러져 들어오고 가격은 카운트업
   ⚠️ 이모지 파티클 금지(SVG로). 날짜 input 은 iOS 함정(열자마자 오늘) 때문에 select 로.
   ========================================================= */
(function () {
  if (window.GALLA_TravelFlights) return;

  var sb = null;
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }
  function won(n) { return (Number(n) || 0).toLocaleString("ko-KR"); }

  /* 인기 목적지(한국어 도시명은 엣지 CITY_IATA 사전과 맞춘다). 국기는 텍스트 이모지(파티클 아님). */
  var POPULAR = [
    { c: "도쿄", f: "🇯🇵" }, { c: "오사카", f: "🇯🇵" }, { c: "후쿠오카", f: "🇯🇵" },
    { c: "방콕", f: "🇹🇭" }, { c: "다낭", f: "🇻🇳" }, { c: "나트랑", f: "🇻🇳" },
    { c: "세부", f: "🇵🇭" }, { c: "싱가포르", f: "🇸🇬" }, { c: "발리", f: "🇮🇩" },
    { c: "타이베이", f: "🇹🇼" }, { c: "홍콩", f: "🇭🇰" }, { c: "괌", f: "🇬🇺" },
    { c: "파리", f: "🇫🇷" }, { c: "로마", f: "🇮🇹" }, { c: "런던", f: "🇬🇧" },
    { c: "뉴욕", f: "🇺🇸" }, { c: "하와이", f: "🇺🇸" }, { c: "다낭", f: "🇻🇳" }
  ];
  var ORIGINS = ["서울", "부산", "제주", "대구"];

  var state = { from: "서울", to: "", when: "", dateGo: "", dateBack: "", oneWay: true, sort: "price", tod: "all", offers: null, loading: false, route: null };
  var ROOT = null;
  var calY = 0, calM = 0;   // 달력에 보이는 연·월(0-based month)

  var DOW = ["일", "월", "화", "수", "목", "금", "토"];
  function todayKST() { var d = new Date(Date.now() + 9 * 3600000); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); }
  function iso(d) { return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0"); }
  function parseIso(s) { var m = String(s || "").match(/(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null; }
  function fmtDate(s) { var d = parseIso(s); if (!d) return ""; return (d.getUTCMonth() + 1) + "월 " + d.getUTCDate() + "일(" + DOW[d.getUTCDay()] + ")"; }
  function dateLabel() {
    if (!state.dateGo) return "언제든 · 최저가";
    if (state.oneWay || !state.dateBack) return fmtDate(state.dateGo);
    return fmtDate(state.dateGo) + " ~ " + fmtDate(state.dateBack);
  }

  function monthOptions() {
    var now = new Date(Date.now() + 9 * 3600000), out = ['<option value="">언제든 (최저가)</option>'];
    for (var k = 0; k < 8; k++) {
      var d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + k, 1));
      var v = d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0");
      out.push('<option value="' + v + '">' + d.getUTCFullYear() + "년 " + (d.getUTCMonth() + 1) + "월</option>");
    }
    return out.join("");
  }

  function shell() {
    return '' +
    '<div class="tf">' +
      '<div class="tf-hero">' +
        '<div class="tf-sky"></div>' +
        '<div class="tf-stars"><i></i><i></i><i></i><i></i></div>' +
        '<div class="tf-clouds"><span></span><span></span><span></span></div>' +
        '<svg class="tf-heroplane" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2.5 19l19-7.5-19-7.5 0 5.8 12 1.7-12 1.7z"/></svg>' +
        '<div class="tf-hero-t"><b>어디로 떠날까요</b><span>항공권 최저가를 바로 비교하고 예약까지</span></div>' +
      '</div>' +

      '<form class="tf-form" id="tf-form" autocomplete="off">' +
        '<div class="tf-route">' +
          '<label class="tf-fld"><span class="tf-lb">출발</span>' +
            '<select class="tf-sel" id="tf-from">' + ORIGINS.map(function (o) { return '<option value="' + o + '"' + (o === state.from ? " selected" : "") + ">" + o + "</option>"; }).join("") + '</select>' +
          '</label>' +
          '<button type="button" class="tf-swap" id="tf-swap" aria-label="바꾸기">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4L3 8l4 4"/><path d="M3 8h14"/><path d="M17 20l4-4-4-4"/><path d="M21 16H7"/></svg>' +
          '</button>' +
          '<label class="tf-fld tf-fld-to"><span class="tf-lb">도착</span>' +
            '<input class="tf-in" id="tf-to" type="text" inputmode="text" placeholder="도시 · 나라" value="' + esc(state.to) + '">' +
          '</label>' +
        '</div>' +
        '<div class="tf-row2">' +
          '<button type="button" class="tf-fld tf-when" id="tf-date"><span class="tf-lb">가는 날</span>' +
            '<span class="tf-datev" id="tf-datev">언제든 · 최저가</span></button>' +
          '<div class="tf-trip" id="tf-trip">' +
            '<button type="button" class="tf-tp on" data-ow="1">편도</button>' +
            '<button type="button" class="tf-tp" data-ow="0">왕복</button>' +
          '</div>' +
        '</div>' +
        '<div class="tf-pop" id="tf-pop">' + POPULAR.map(function (p) {
          return '<button type="button" class="tf-poch" data-city="' + esc(p.c) + '"><span class="tf-flag">' + p.f + '</span>' + esc(p.c) + "</button>";
        }).join("") + '</div>' +
        '<button type="submit" class="tf-go" id="tf-go"><span class="tf-go-t">항공권 검색</span></button>' +
      '</form>' +

      '<div class="tf-results" id="tf-results"></div>' +

      '<div class="tf-cal-ov" id="tf-cal-ov" hidden>' +
        '<div class="tf-cal">' +
          '<div class="tf-cal-top"><b id="tf-cal-h">가는 날 선택</b><button type="button" class="tf-cal-x" id="tf-cal-x" aria-label="닫기">✕</button></div>' +
          '<div class="tf-cal-nav"><button type="button" id="tf-cal-prev" aria-label="이전 달">‹</button>' +
            '<span id="tf-cal-mon"></span><button type="button" id="tf-cal-next" aria-label="다음 달">›</button></div>' +
          '<div class="tf-cal-dow">' + DOW.map(function (d) { return "<span>" + d + "</span>"; }).join("") + "</div>" +
          '<div class="tf-cal-grid" id="tf-cal-grid"></div>' +
          '<div class="tf-cal-foot">' +
            '<button type="button" class="tf-cal-any" id="tf-cal-any">언제든 · 최저가</button>' +
            '<button type="button" class="tf-cal-ok" id="tf-cal-ok">확인</button>' +
          "</div>" +
        "</div>" +
      "</div>" +
    "</div>";
  }

  /* 📅 달력 — 네이버식 가는 날(+왕복이면 오는 날 범위). 과거는 잠그고 오늘부터. */
  function calGridHTML() {
    var first = new Date(Date.UTC(calY, calM, 1));
    var startDow = first.getUTCDay();
    var days = new Date(Date.UTC(calY, calM + 1, 0)).getUTCDate();
    var today = todayKST();
    var go = parseIso(state.dateGo), back = parseIso(state.dateBack);
    var html = "";
    for (var i = 0; i < startDow; i++) html += '<span class="tf-cd empty"></span>';
    for (var d = 1; d <= days; d++) {
      var cur = new Date(Date.UTC(calY, calM, d));
      var past = cur < today;
      var cls = "tf-cd";
      var t = cur.getTime();
      if (past) cls += " past";
      if (go && t === go.getTime()) cls += " sel go";
      if (back && t === back.getTime()) cls += " sel back";
      if (go && back && t > go.getTime() && t < back.getTime()) cls += " inrange";
      var dow = cur.getUTCDay();
      if (dow === 0) cls += " sun";
      if (dow === 6) cls += " sat";
      html += '<button type="button" class="' + cls + '"' + (past ? " disabled" : ' data-d="' + iso(cur) + '"') + ">" + d + "</button>";
    }
    return html;
  }
  function paintCal() {
    if (!ROOT) return;
    var mon = ROOT.querySelector("#tf-cal-mon"); if (mon) mon.textContent = calY + "년 " + (calM + 1) + "월";
    var h = ROOT.querySelector("#tf-cal-h"); if (h) h.textContent = state.oneWay ? "날짜 선택" : (state.dateGo && !state.dateBack ? "오는 날 선택" : "가는 날 선택");
    var grid = ROOT.querySelector("#tf-cal-grid"); if (grid) grid.innerHTML = calGridHTML();
    var prev = ROOT.querySelector("#tf-cal-prev");
    if (prev) { var t = todayKST(); prev.disabled = (calY === t.getUTCFullYear() && calM === t.getUTCMonth()); }
  }
  function openCal() {
    var base = parseIso(state.dateGo) || todayKST();
    calY = base.getUTCFullYear(); calM = base.getUTCMonth();
    paintCal();
    var ov = ROOT.querySelector("#tf-cal-ov"); if (ov) { ov.hidden = false; requestAnimationFrame(function () { ov.classList.add("on"); }); }
  }
  function closeCal() { var ov = ROOT.querySelector("#tf-cal-ov"); if (ov) { ov.classList.remove("on"); setTimeout(function () { ov.hidden = true; }, 200); } }
  function pickDay(isoStr) {
    if (state.oneWay) { state.dateGo = isoStr; state.dateBack = ""; }
    else {
      if (!state.dateGo || state.dateBack) { state.dateGo = isoStr; state.dateBack = ""; }   // 새 범위 시작
      else if (isoStr < state.dateGo) { state.dateGo = isoStr; }                              // 더 이른 날 → 가는 날 갱신
      else if (isoStr === state.dateGo) { /* 같은 날 무시 */ }
      else { state.dateBack = isoStr; }                                                       // 오는 날 확정
    }
    paintCal();
  }
  function commitDate() {
    state.when = state.dateGo || "";
    var el = ROOT.querySelector("#tf-datev"); if (el) el.textContent = dateLabel();
    closeCal();
    if (state.to && state.offers !== null) search();   // 이미 결과가 있으면 새 날짜로 재검색
  }

  /* 검색 애니메이션 — 비행기가 점선 항로를 타고 날아간다 */
  function flyingHTML(fromN, toN) {
    return '' +
    '<div class="tf-fly">' +
      '<div class="tf-fly-line">' +
        '<span class="tf-fly-dot"></span>' +
        '<svg class="tf-fly-arc" viewBox="0 0 300 90" preserveAspectRatio="none">' +
          '<path class="tf-fly-path" d="M12 78 Q150 -6 288 78" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 6"/>' +
        '</svg>' +
        '<span class="tf-fly-dot tf-fly-dot2"></span>' +
        '<svg class="tf-fly-plane" viewBox="0 0 24 24" fill="currentColor"><path d="M2.5 19l19-7.5-19-7.5 0 5.8 12 1.7-12 1.7z"/></svg>' +
      '</div>' +
      '<div class="tf-fly-ep"><b>' + esc(fromN) + '</b><span>탑승 중…</span><b>' + esc(toN) + '</b></div>' +
    '</div>';
  }

  function depHour(o) { var m = String(o.depTime || "").match(/(\d{1,2}):/); return m ? +m[1] : -1; }
  function filterTod(list) {
    if (state.tod === "all") return list;
    return list.filter(function (o) { var h = depHour(o); if (h < 0) return false;
      if (state.tod === "am") return h >= 6 && h < 12;
      if (state.tod === "pm") return h >= 12 && h < 18;
      return h >= 18 || h < 6;   // night(밤·새벽)
    });
  }
  function sortOffers(list) {
    var a = list.slice();
    if (state.sort === "fast") a.sort(function (x, y) { return (x.dur || 9e9) - (y.dur || 9e9); });
    else if (state.sort === "direct") a.sort(function (x, y) { return (x.stops - y.stops) || (x.price - y.price); });
    else a.sort(function (x, y) { return x.price - y.price; });
    return a;
  }

  function offerHTML(o, i) {
    var stop = o.stops ? o.stops + "회 경유" : "직항";
    var ini = esc((o.airline || "?").slice(0, 1));
    // 실제 항공사 로고(아비아세일즈 무료 CDN, IATA 코드). 실패하면 이니셜로 폴백.
    var dot = o.airlineCode
      ? '<span class="tf-air-dot logo skel"><img src="https://pics.avs.io/60/60/' + esc(o.airlineCode) + '@2x.png" alt="" loading="lazy" onload="this.parentNode.classList.add(\'ok\')" onerror="this.parentNode.classList.remove(\'logo\',\'skel\');this.parentNode.textContent=\'' + ini + '\'"></span>'
      : '<span class="tf-air-dot">' + ini + '</span>';
    return '' +
    '<a class="tf-card" style="--i:' + i + '" href="' + esc(o.url) + '" target="_blank" rel="noopener noreferrer">' +
      '<div class="tf-card-main">' +
        '<div class="tf-air">' + dot +
          '<div class="tf-air-t"><b>' + esc(o.airline || "항공권") + '</b><span>' + esc(o.flight || "") + '</span></div></div>' +
        '<div class="tf-leg">' +
          '<div class="tf-leg-a"><b>' + esc(o.depTime || "--:--") + '</b><span>' + esc(state.route ? state.route.from.code : "") + '</span></div>' +
          '<div class="tf-leg-mid"><span class="tf-leg-dur">' + esc(o.durText || "") + '</span>' +
            '<div class="tf-leg-line"><i></i><svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.5 19l19-7.5-19-7.5 0 5.8 12 1.7-12 1.7z"/></svg></div>' +
            '<span class="tf-leg-stop ' + (o.stops ? "via" : "") + '">' + stop + '</span></div>' +
          '<div class="tf-leg-b"><b>' + esc(o.date) + '(' + esc(o.dow) + ')</b><span>' + esc(state.route ? state.route.to.code : "") + '</span></div>' +
        '</div>' +
      '</div>' +
      '<div class="tf-card-cut"><i></i><i></i></div>' +
      '<div class="tf-card-price"><b class="tf-won" data-v="' + (o.price || 0) + '">0</b><span>원~ · 예약 ↗</span></div>' +
    '</a>';
  }

  function countUp(el) {
    var to = Number(el.getAttribute("data-v")) || 0, t0 = 0;
    function step(ts) { if (!t0) t0 = ts; var p = Math.min(1, (ts - t0) / 700); var e = 1 - Math.pow(1 - p, 3);
      el.textContent = won(Math.round(to * e)); if (p < 1) requestAnimationFrame(step); else el.classList.add("pop"); }
    requestAnimationFrame(step);
  }

  function paintResults() {
    var box = ROOT && ROOT.querySelector("#tf-results"); if (!box) return;
    if (state.loading) { box.innerHTML = flyingHTML(state.from, state.to); return; }
    if (!state.offers) { box.innerHTML = ""; return; }
    if (!state.offers.length) {
      box.innerHTML = '<div class="tf-empty"><b>최근 검색된 가격이 없어요</b><span>날짜를 바꾸거나 다른 도시로 찾아보세요.</span>' +
        (state.route ? '<a class="tf-empty-go" href="' + esc(state.route.bookUrl) + '" target="_blank" rel="noopener noreferrer">예약 사이트에서 직접 찾기 ↗</a>' : "") + "</div>";
      return;
    }
    var list = sortOffers(filterTod(state.offers));
    var lo = list[0] ? list[0].price : (state.offers[0] ? state.offers[0].price : 0);
    var TOD = [["all", "전체"], ["am", "오전"], ["pm", "오후"], ["night", "밤"]];
    var dateChip = state.dateGo ? '<span class="tf-rdate">' + esc(fmtDate(state.dateGo)) + (state.dateBack ? " ~ " + esc(fmtDate(state.dateBack)) : "") + "</span>" : "";
    box.innerHTML =
      '<div class="tf-rhead">' +
        '<div class="tf-rtitle"><b>' + esc(state.route.from.name) + " → " + esc(state.route.to.name) + '</b>' +
          '<span>최저 <b>' + won(lo) + '</b>원부터 · ' + list.length + "편" + (dateChip ? " · " : "") + '</span>' + dateChip + "</div>" +
        '<div class="tf-sort" id="tf-sort">' +
          '<button type="button" class="tf-so ' + (state.sort === "price" ? "on" : "") + '" data-s="price">최저가</button>' +
          '<button type="button" class="tf-so ' + (state.sort === "fast" ? "on" : "") + '" data-s="fast">빠른편</button>' +
          '<button type="button" class="tf-so ' + (state.sort === "direct" ? "on" : "") + '" data-s="direct">직항우선</button>' +
        '</div>' +
      '</div>' +
      '<div class="tf-tod" id="tf-tod"><span class="tf-tod-l">출발 시간</span>' +
        TOD.map(function (t) { return '<button type="button" class="tf-todch ' + (state.tod === t[0] ? "on" : "") + '" data-tod="' + t[0] + '">' + t[1] + "</button>"; }).join("") +
      "</div>" +
      (list.length ? '<div class="tf-list">' + list.map(offerHTML).join("") + "</div>"
        : '<div class="tf-empty" style="padding:30px 20px"><b>이 시간대엔 편이 없어요</b><span>다른 시간대를 골라보세요.</span></div>') +
      '<a class="tf-book" href="' + esc(state.route.bookUrl) + '" target="_blank" rel="noopener noreferrer">가격 비교·예약하기 ↗</a>' +
      '<p class="tf-note">아비아세일즈 최근 검색 기준이라 실제 예약 시 가격이 달라질 수 있어요.</p>';
    box.querySelectorAll(".tf-won").forEach(countUp);
  }

  async function search() {
    if (!state.to.trim()) { var inp = ROOT.querySelector("#tf-to"); if (inp) { inp.focus(); inp.classList.add("tf-shake"); setTimeout(function () { inp.classList.remove("tf-shake"); }, 500); } return; }
    state.loading = true; state.offers = null; state.route = null;
    paintResults();
    var t0 = Date.now();
    try {
      sb = sb || (window.waitForSupabaseClient ? await window.waitForSupabaseClient() : window.supabaseClient);
      var res = await sb.functions.invoke("galla-friend", { body: { op: "flight_search", to: state.to.trim(), from: state.from, when: state.dateGo || state.when, whenBack: state.oneWay ? "" : state.dateBack, oneWay: state.oneWay } });
      var d = res && res.data;
      // 애니메이션이 최소 1.1초는 보이게(비행 연출)
      var wait = Math.max(0, 1100 - (Date.now() - t0));
      await new Promise(function (r) { setTimeout(r, wait); });
      if (!d || d.ok === false) { state.offers = []; state.route = null; }
      else { state.offers = d.offers || []; state.route = { from: d.from, to: d.to, bookUrl: d.bookUrl }; }
    } catch (e) { state.offers = []; }
    state.loading = false;
    paintResults();
    var box = ROOT.querySelector("#tf-results"); if (box) try { box.scrollIntoView({ behavior: "smooth", block: "nearest" }); } catch (_) {}
  }

  function wire() {
    var form = ROOT.querySelector("#tf-form");
    form.addEventListener("submit", function (e) { e.preventDefault();
      state.from = ROOT.querySelector("#tf-from").value;
      state.to = ROOT.querySelector("#tf-to").value;
      state.when = state.dateGo || "";
      ROOT.querySelector("#tf-to").blur();
      search();
    });
    // 📅 달력 열기/조작
    ROOT.querySelector("#tf-date").addEventListener("click", openCal);
    var ov = ROOT.querySelector("#tf-cal-ov");
    ov.addEventListener("click", function (e) {
      if (e.target === ov) { closeCal(); return; }                       // 바깥 탭 닫기
      if (e.target.closest("#tf-cal-x")) { closeCal(); return; }
      if (e.target.closest("#tf-cal-prev")) { if (--calM < 0) { calM = 11; calY--; } paintCal(); return; }
      if (e.target.closest("#tf-cal-next")) { if (++calM > 11) { calM = 0; calY++; } paintCal(); return; }
      if (e.target.closest("#tf-cal-any")) { state.dateGo = ""; state.dateBack = ""; commitDate(); return; }
      if (e.target.closest("#tf-cal-ok")) { commitDate(); return; }
      var cd = e.target.closest(".tf-cd[data-d]"); if (cd) { pickDay(cd.dataset.d); }
    });
    ROOT.querySelector("#tf-swap").addEventListener("click", function () {
      // 출발(국내 select) ↔ 도착(자유입력) 교환은 도착이 국내일 때만 의미. 간단히 시각 회전 + 값 스왑 시도.
      var fromSel = ROOT.querySelector("#tf-from"), toIn = ROOT.querySelector("#tf-to");
      var t = toIn.value.trim(); if (!t) return;
      var cur = fromSel.value;
      // 도착이 국내 도시면 스왑, 아니면 출발을 도착으로 넣고 국내는 서울로
      var opt = Array.prototype.find.call(fromSel.options, function (o) { return o.value === t; });
      if (opt) { fromSel.value = t; toIn.value = cur; } else { toIn.value = cur; fromSel.value = "서울"; }
      this.classList.remove("spin"); void this.offsetWidth; this.classList.add("spin");
    });
    ROOT.querySelector("#tf-trip").addEventListener("click", function (e) {
      var b = e.target.closest(".tf-tp"); if (!b) return;
      state.oneWay = b.dataset.ow === "1";
      if (state.oneWay) state.dateBack = "";                            // 편도로 바꾸면 오는 날 버림
      this.querySelectorAll(".tf-tp").forEach(function (x) { x.classList.toggle("on", x === b); });
      var el = ROOT.querySelector("#tf-datev"); if (el) el.textContent = dateLabel();
    });
    ROOT.querySelector("#tf-pop").addEventListener("click", function (e) {
      var b = e.target.closest(".tf-poch"); if (!b) return;
      ROOT.querySelector("#tf-to").value = b.dataset.city;
      state.to = b.dataset.city; state.from = ROOT.querySelector("#tf-from").value; state.when = state.dateGo || "";
      search();
    });
    ROOT.querySelector("#tf-results").addEventListener("click", function (e) {
      var so = e.target.closest(".tf-so");
      if (so) { state.sort = so.dataset.s; paintResults(); return; }
      var td = e.target.closest(".tf-todch");
      if (td) { state.tod = td.dataset.tod; paintResults(); return; }
    });
  }

  function render(container, params) {
    ROOT = container;
    if (params && params.to) state.to = String(params.to);
    if (params && params.from) state.from = String(params.from);
    container.innerHTML = shell();
    wire();
    if (state.to) { // 검색창에서 넘어온 경우 바로 검색
      var inp = ROOT.querySelector("#tf-to"); if (inp) inp.value = state.to;
      search();
    }
  }

  window.GALLA_TravelFlights = { render: render };

  /* 검색 등에서 항공권 스택 페이지 열기(하이브리드 입구) */
  window.GALLA_openFlights = function (to, from) {
    if (window.GALLA_SPA && window.GALLA_SPA.push) return window.GALLA_SPA.push("flights", { to: to || "", from: from || "" });
    var qs = "?to=" + encodeURIComponent(to || "") + (from ? "&from=" + encodeURIComponent(from) : "");
    (window.GALLA_nav || function (u) { location.href = u; })("flights.html" + qs);
  };
})();
