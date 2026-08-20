/* =========================================================
   weather.js — "지금 우리 동네"
   기상청이 말하는 실황과, 지금 거기 있는 사람들의 말을 나란히 놓는다.
   둘이 어긋날 때가 제일 재밌다 — "기상청은 맑다는데 우리 동네는 쏟아짐".

   · 실황은 서버가 10분마다 캐시(weather-sync). 브라우저는 외부 API 를 부르지 않는다(CSP).
   · 단위는 시·군·구 133곳 — 도(전북·전남) 단위는 "우리 동네"와 안 맞는다(사장님 지적).
     전국 요약만 시도 17개로 가볍게, 동네는 검색·즐겨찾기·방으로 간다.
   · 진짜 재미는 댓글이다(사장님) — 지역 방에서 최근 2시간 한마디가 흐른다.
   ========================================================= */
(function () {
  if (window.__gallaWeather) return;
  window.__gallaWeather = true;

  var PANEL, GRID, FAV, FAVSEC, HERO, FOOT, SKY, QF, QI, QX, QR, sb = null;
  var timer = null, rafId = 0, drops = [], lastData = null, room = null, roomTimer = null;

  function wx(code) {
    var c = Number(code);
    if (!isFinite(c)) return { k: "unknown", e: "·", t: "정보 없음" };
    if (c === 0) return { k: "clear", e: "☀️", t: "맑음" };
    if (c <= 3) return { k: "cloud", e: "⛅", t: "구름" };
    if (c === 45 || c === 48) return { k: "fog", e: "🌫️", t: "안개" };
    if (c >= 95) return { k: "storm", e: "⛈️", t: "뇌우" };
    if (c >= 85) return { k: "snow", e: "🌨️", t: "소낙눈" };
    if (c >= 71 && c <= 77) return { k: "snow", e: "❄️", t: "눈" };
    if (c >= 80) return { k: "rain", e: "🌧️", t: "소나기" };
    if (c >= 61) return { k: "rain", e: "🌧️", t: "비" };
    if (c >= 51) return { k: "drizzle", e: "🌦️", t: "이슬비" };
    return { k: "cloud", e: "⛅", t: "흐림" };
  }
  var isWet = function (k) { return k === "rain" || k === "snow" || k === "storm" || k === "drizzle"; };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
  function ago(t) {
    var d = (Date.now() - new Date(t).getTime()) / 1000;
    if (d < 60) return "방금";
    if (d < 3600) return Math.floor(d / 60) + "분 전";
    return Math.floor(d / 3600) + "시간 전";
  }
  async function client() { sb = sb || (window.waitForSupabaseClient ? await window.waitForSupabaseClient() : window.supabaseClient); return sb; }
  async function rpc(fn, args) { try { var r = await (await client()).rpc(fn, args || {}); return r && r.data; } catch (_) { return null; } }
  function needLogin() {
    if (confirm("로그인이 필요해요. 로그인할까요?")) (window.GALLA_nav || function (u) { location.href = u; })("login.html");
  }

  /* ── 하늘 — 전국에서 '진짜 오는' 비율만큼 빗줄기가 굵어진다 ── */
  function sky(wetRatio, snowy) {
    if (!SKY) return;
    var dpr = Math.min(devicePixelRatio || 1, 2), w = SKY.clientWidth, h = SKY.clientHeight;
    if (!w || !h) return;
    SKY.width = w * dpr; SKY.height = h * dpr;
    var ctx = SKY.getContext("2d"); ctx.scale(dpr, dpr);
    drops = [];
    var n = Math.round(14 + wetRatio * 140);
    for (var i = 0; i < n; i++) drops.push({
      x: Math.random() * w, y: Math.random() * h,
      v: snowy ? .5 + Math.random() * .9 : 4 + Math.random() * 6,
      l: snowy ? 2 + Math.random() * 2 : 8 + Math.random() * 12,
      d: Math.random() * .6 - .3, a: .2 + Math.random() * .5
    });
    cancelAnimationFrame(rafId);
    (function tick() {
      ctx.clearRect(0, 0, w, h);
      for (var i = 0; i < drops.length; i++) {
        var p = drops[i];
        if (snowy) { ctx.beginPath(); ctx.arc(p.x, p.y, p.l * .5, 0, 6.283); ctx.fillStyle = "rgba(220,240,255," + p.a + ")"; ctx.fill(); }
        else { ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.d * 2, p.y + p.l); ctx.strokeStyle = "rgba(120,190,255," + p.a + ")"; ctx.lineWidth = 1.1; ctx.stroke(); }
        p.y += p.v; p.x += p.d;
        if (p.y > h) { p.y = -10; p.x = Math.random() * w; }
      }
      rafId = requestAnimationFrame(tick);
    })();
  }

  /* ── 카드 ── */
  function card(r, opts) {
    var w = wx(r.code_wmo), rep = r.reports || 0;
    var wetSay = (r.rain || 0) + (r.snow || 0), pct = rep ? Math.round(wetSay / rep * 100) : 0;
    return '<button type="button" class="wx-card ' + w.k + (isWet(w.k) ? " wet" : "") + '" data-r="' + esc(r.code) + '">' +
      '<div class="wx-c-top"><span class="wx-c-name">' + esc(r.name) + "</span><span class=\"wx-c-emo\">" + w.e + "</span></div>" +
      (opts && opts.sido && r.sido ? '<div class="wx-c-sido">' + esc(r.sido) + "</div>" : "") +
      '<div class="wx-c-temp">' + (r.temp == null ? "–" : Math.round(r.temp) + "°") + "</div>" +
      '<div class="wx-c-desc">' + esc(w.t) + (r.precip > 0 ? " " + r.precip + "mm" : "") + "</div>" +
      (rep ? '<div class="wx-c-bar"><i style="width:' + pct + '%"></i></div><div class="wx-c-rep"><b>' + wetSay + "</b>명 와요 · " + (r.none || 0) + "명 안와요</div>"
           : '<div class="wx-c-rep none">제보 없음</div>') +
      (r.says ? '<div class="wx-c-say">💬 ' + r.says + "</div>" : "") + "</button>";
  }

  function render(d) {
    lastData = d;
    var rs = (d && d.regions) || [];
    if (!rs.length) { GRID.innerHTML = '<div class="wx-empty">날씨를 불러오지 못했어요.</div>'; return; }
    var wetObs = 0, snowy = 0, totalSay = 0, clash = [];
    rs.forEach(function (r) {
      var w = wx(r.code_wmo);
      if (isWet(w.k)) wetObs++;
      if (w.k === "snow") snowy++;
      totalSay += r.says || 0;
      if ((r.reports || 0) >= 3) {
        var peopleWet = ((r.rain || 0) + (r.snow || 0)) > (r.none || 0);
        if (peopleWet !== isWet(w.k)) clash.push({ r: r, peopleWet: peopleWet, w: w });
      }
    });
    HERO.innerHTML = '<div class="wx-hero-big">' + (wetObs ? "🌧️" : "☀️") + "</div>" +
      '<div class="wx-hero-tx"><b>' + (wetObs ? "전국 " + wetObs + "곳에 비·눈" : "전국이 대체로 맑음") + "</b>" +
      "<span>" + (totalSay ? "지금 " + totalSay + "명이 동네 얘기 중" : "동네를 눌러 한마디 남겨보세요") + "</span></div>";
    if (clash.length) HERO.insertAdjacentHTML("beforeend",
      '<div class="wx-clash">🚨 <b>' + clash.map(function (c) { return esc(c.r.name); }).join(" · ") +
      "</b> — 기상청은 " + esc(clash[0].w.t) + "이라는데 사람들은 " + (clash[0].peopleWet ? "온다고" : "안 온다고") + " 합니다</div>");
    GRID.innerHTML = rs.map(function (r) { return card(r); }).join("");
    sky(rs.length ? wetObs / rs.length : 0, snowy > wetObs / 2);
    FOOT.textContent = "실황 10분마다 · 제보 30분 · 한마디 2시간 집계";
  }

  async function loadFav() {
    var d = await rpc("weather_my");
    if (!Array.isArray(d) || !d.length) {
      FAVSEC.hidden = true; return;
    }
    FAVSEC.hidden = false;
    FAV.innerHTML = d.map(function (r) { return card(r, { sido: true }); }).join("");
  }
  async function load() { var d = await rpc("weather_now"); if (d) render(d); loadFav(); }

  /* ── 동네 방 — 실황 + 제보 + 한마디(이 기능의 심장) ── */
  async function openRoom(code) {
    var d = await rpc("weather_room", { p_region: code, p_limit: 40 });
    if (!d || !d.ok) return;
    room = code;
    var el = document.getElementById("wx-room");
    if (!el) {
      el = document.createElement("div"); el.id = "wx-room"; el.className = "wx-room";
      document.body.appendChild(el);
      el.addEventListener("click", onRoomClick);
      requestAnimationFrame(function () { el.classList.add("on"); });
    }
    paintRoom(el, d);
    clearInterval(roomTimer);
    roomTimer = setInterval(async function () {
      if (!room) return;
      var n = await rpc("weather_room", { p_region: room, p_limit: 40 });
      if (n && n.ok) paintRoom(document.getElementById("wx-room"), n, true);
    }, 20000);
  }
  function paintRoom(el, d, keepInput) {
    if (!el) return;
    var r = d.region, w = wx(r.code_wmo), rep = d.reports || {};
    var draft = keepInput ? (el.querySelector("#wx-say") || {}).value : "";
    el.innerHTML =
      '<div class="wx-room-in">' +
        '<div class="wx-room-hd">' +
          '<div><div class="wx-room-nm">' + esc(r.name) + (r.sido ? ' <span>' + esc(r.sido) + "</span>" : "") + "</div>" +
          '<div class="wx-room-wx">' + w.e + " " + esc(w.t) + (r.temp == null ? "" : " · " + Math.round(r.temp) + "°") + (r.precip > 0 ? " · " + r.precip + "mm" : "") + "</div></div>" +
          '<button type="button" class="wx-fav ' + (d.faved ? "on" : "") + '" data-fav aria-label="즐겨찾기">' + (d.faved ? "★" : "☆") + "</button>" +
          '<button type="button" class="wx-room-x" data-x aria-label="닫기">✕</button>' +
        "</div>" +
        '<div class="wx-room-rep">' +
          '<button type="button" data-k="rain">🌧️ 비 와요 <b>' + (rep.rain || 0) + "</b></button>" +
          '<button type="button" data-k="snow">❄️ 눈 와요 <b>' + (rep.snow || 0) + "</b></button>" +
          '<button type="button" data-k="none">☀️ 안 와요 <b>' + (rep.none || 0) + "</b></button>" +
        "</div>" +
        '<div class="wx-says">' + ((d.says || []).length
          ? d.says.map(function (s) {
              return '<div class="wx-say-row"><div class="wx-say-nick">' + esc(s.nick) + '<span>' + ago(s.at) + "</span></div>" +
                     '<div class="wx-say-body">' + esc(s.body) + "</div></div>"; }).join("")
          : '<div class="wx-says-empty">아직 조용해요 — 첫 한마디를 남겨보세요</div>') + "</div>" +
        '<form class="wx-say-form"><input id="wx-say" maxlength="140" placeholder="지금 여기 어때요? (140자)" enterkeyhint="send">' +
        '<button type="submit">보내기</button></form>' +
      "</div>";
    if (draft) { var i = el.querySelector("#wx-say"); if (i) i.value = draft; }
    var f = el.querySelector(".wx-say-form");
    f.addEventListener("submit", async function (e) {
      e.preventDefault();
      var i = el.querySelector("#wx-say"), v = (i.value || "").trim();
      if (!v) return;
      i.disabled = true;
      var res = await rpc("weather_say", { p_region: room, p_body: v });
      i.disabled = false;
      if (res && res.ok) { i.value = ""; var n = await rpc("weather_room", { p_region: room, p_limit: 40 }); if (n && n.ok) paintRoom(el, n); }
      else if (res && res.reason === "unauthorized") needLogin();
      else if (res && res.reason === "slow_down") window.GALLA_toast && GALLA_toast("조금만 천천히요 ㅎㅎ");
      i.focus();
    });
  }
  async function onRoomClick(e) {
    var el = document.getElementById("wx-room");
    if (e.target === el || e.target.closest("[data-x]")) return closeRoom();
    var fav = e.target.closest("[data-fav]");
    if (fav) {
      var on = !fav.classList.contains("on");
      var res = await rpc("weather_fav", { p_region: room, p_on: on });
      if (res && res.ok) { fav.classList.toggle("on", on); fav.textContent = on ? "★" : "☆"; loadFav(); }
      else if (res && res.reason === "unauthorized") needLogin();
      else if (res && res.reason === "too_many") window.GALLA_toast && GALLA_toast("즐겨찾기는 12곳까지예요");
      return;
    }
    var b = e.target.closest("[data-k]");
    if (b) {
      var res2 = await rpc("weather_report", { p_region: room, p_kind: b.dataset.k });
      if (res2 && res2.ok) { var n = await rpc("weather_room", { p_region: room, p_limit: 40 }); if (n && n.ok) paintRoom(el, n, true); load(); }
      else if (res2 && res2.reason === "unauthorized") needLogin();
      else if (res2 && res2.reason === "cooldown") window.GALLA_toast && GALLA_toast("방금 제보했어요 — " + Math.ceil(res2.wait_sec / 60) + "분 뒤에 다시");
    }
  }
  function closeRoom() {
    var el = document.getElementById("wx-room");
    room = null; clearInterval(roomTimer);
    if (el) { el.classList.remove("on"); setTimeout(function () { el.remove(); }, 220); }
  }

  /* ── 검색 ── */
  var qT = null;
  async function doSearch(q) {
    if (!q) { QR.hidden = true; QR.innerHTML = ""; return; }
    var d = await rpc("weather_search", { p_q: q, p_limit: 12 });
    QR.hidden = false;
    QR.innerHTML = (Array.isArray(d) && d.length)
      ? d.map(function (r) {
          var w = wx(r.code_wmo);
          return '<button type="button" class="wx-hit" data-r="' + esc(r.code) + '">' +
            "<span>" + w.e + "</span><b>" + esc(r.name) + "</b>" +
            (r.sido ? '<i>' + esc(r.sido) + "</i>" : "") +
            (r.temp == null ? "" : '<u>' + Math.round(r.temp) + "°</u>") + "</button>"; }).join("")
      : '<div class="wx-empty">그런 동네는 아직 없어요</div>';
  }

  function start() {
    PANEL = document.querySelector('.tab-panel[data-panel="weather"]');
    if (!PANEL) return;
    GRID = document.getElementById("wx-grid"); FAV = document.getElementById("wx-fav");
    FAVSEC = document.getElementById("wx-fav-sec"); HERO = document.getElementById("wx-hero");
    FOOT = document.getElementById("wx-foot"); SKY = document.getElementById("wx-sky");
    QF = document.getElementById("wx-search"); QI = document.getElementById("wx-q");
    QX = document.getElementById("wx-qx"); QR = document.getElementById("wx-results");

    PANEL.addEventListener("click", function (e) {
      var c = e.target.closest(".wx-card, .wx-hit");
      if (c && c.dataset.r) openRoom(c.dataset.r);
    });
    QF.addEventListener("submit", function (e) { e.preventDefault(); doSearch(QI.value.trim()); });
    QI.addEventListener("input", function () {
      QX.hidden = !QI.value;
      clearTimeout(qT); qT = setTimeout(function () { doSearch(QI.value.trim()); }, 240);
    });
    QX.addEventListener("click", function () { QI.value = ""; QX.hidden = true; doSearch(""); QI.focus(); });

    load();
    clearInterval(timer);
    timer = setInterval(function () { if (!document.hidden && PANEL.classList.contains("active")) load(); }, 60000);
    window.addEventListener("resize", function () { if (lastData) render(lastData); }, { passive: true });
  }

  /* 🚦 패널이 실제로 보일 때만 시작 — ?tab=weather 진입은 search.js 가 프로그램적으로 활성화한다. */
  (function boot() {
    var panel = document.querySelector('.tab-panel[data-panel="weather"]');
    if (!panel) return;
    if (panel.classList.contains("active")) return start();
    try {
      var mo = new MutationObserver(function () { if (panel.classList.contains("active")) { mo.disconnect(); start(); } });
      mo.observe(panel, { attributes: true, attributeFilter: ["class"] });
    } catch (_) { start(); }
  })();
})();
