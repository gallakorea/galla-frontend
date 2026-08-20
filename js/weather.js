/* =========================================================
   weather.js — "지금 우리 동네" 탭
   기상청(또는 Open-Meteo)이 말하는 실황과, 지금 거기 있는 사람들의 제보를 나란히 놓는다.
   둘이 어긋날 때가 제일 재밌다 — "기상청은 맑다는데 우리 동네는 쏟아짐".

   · 실황은 서버가 10분마다 캐시(weather-sync). 브라우저는 외부 API 를 부르지 않는다(CSP).
   · 제보는 최근 30분만 집계. 날씨는 금방 바뀌고 옛 제보는 거짓말이 된다.
   ========================================================= */
(function () {
  if (window.__gallaWeather) return;
  window.__gallaWeather = true;

  var PANEL, GRID, HERO, FOOT, SKY, sb = null;
  var timer = null, rafId = 0, drops = [], lastData = null, myRegion = null;

  /* WMO 코드 → 표시. 기상청 PTY 도 서버에서 이 코드로 통일해 보낸다. */
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

  /* ── 하늘 캔버스 — 전국에서 '진짜 오는' 비율만큼 빗줄기가 굵어진다 ── */
  function sky(wetRatio, snowy) {
    if (!SKY) return;
    var dpr = Math.min(devicePixelRatio || 1, 2);
    var w = SKY.clientWidth, h = SKY.clientHeight;
    if (!w || !h) return;
    SKY.width = w * dpr; SKY.height = h * dpr;
    var ctx = SKY.getContext("2d"); ctx.scale(dpr, dpr);
    var n = Math.round(18 + wetRatio * 150);          // 비 오는 지역이 많을수록 촘촘히
    drops = [];
    for (var i = 0; i < n; i++) {
      drops.push({ x: Math.random() * w, y: Math.random() * h,
                   v: snowy ? 0.5 + Math.random() * 0.9 : 4 + Math.random() * 6,
                   l: snowy ? 2 + Math.random() * 2 : 8 + Math.random() * 12,
                   d: Math.random() * 0.6 - 0.3, a: 0.2 + Math.random() * 0.5 });
    }
    cancelAnimationFrame(rafId);
    (function tick() {
      ctx.clearRect(0, 0, w, h);
      for (var i = 0; i < drops.length; i++) {
        var p = drops[i];
        if (snowy) {
          ctx.beginPath(); ctx.arc(p.x, p.y, p.l * 0.5, 0, 6.283);
          ctx.fillStyle = "rgba(220,240,255," + p.a + ")"; ctx.fill();
        } else {
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.d * 2, p.y + p.l);
          ctx.strokeStyle = "rgba(120,190,255," + p.a + ")"; ctx.lineWidth = 1.1; ctx.stroke();
        }
        p.y += p.v; p.x += p.d;
        if (p.y > h) { p.y = -10; p.x = Math.random() * w; }
      }
      rafId = requestAnimationFrame(tick);
    })();
  }

  /* ── 렌더 ── */
  function render(d) {
    lastData = d;
    var rs = (d && d.regions) || [];
    if (!rs.length) { GRID.innerHTML = '<div class="wx-empty">날씨를 불러오지 못했어요.</div>'; return; }

    var wetObs = 0, snowAny = 0, totalReports = 0, wetReports = 0, clash = [];
    rs.forEach(function (r) {
      var w = wx(r.code_wmo);
      if (isWet(w.k)) wetObs++;
      if (w.k === "snow") snowAny++;
      totalReports += r.reports || 0;
      wetReports += (r.rain || 0) + (r.snow || 0);
      // 실황과 사람들 말이 엇갈리는 곳(제보 3건 이상일 때만 — 한두 명으로 단정 금지)
      if ((r.reports || 0) >= 3) {
        var peopleWet = ((r.rain || 0) + (r.snow || 0)) > (r.none || 0);
        if (peopleWet !== isWet(w.k)) clash.push({ r: r, peopleWet: peopleWet, w: w });
      }
    });

    HERO.innerHTML =
      '<div class="wx-hero-big">' + (wetObs ? "🌧️" : "☀️") + "</div>" +
      '<div class="wx-hero-tx"><b>' + (wetObs ? "전국 " + wetObs + "곳에 비·눈" : "전국이 대체로 맑음") + "</b>" +
      '<span>' + (totalReports ? "30분 내 제보 " + totalReports + "건 · 그중 " + wetReports + "건이 ‘와요’" : "아직 제보가 없어요 — 첫 제보를 남겨보세요") + "</span></div>";

    if (clash.length) {
      HERO.insertAdjacentHTML("beforeend",
        '<div class="wx-clash">🚨 <b>' + clash.map(function (c) { return esc(c.r.name); }).join(" · ") +
        "</b> — 기상청은 " + esc(clash[0].w.t) + "이라는데 사람들은 " +
        (clash[0].peopleWet ? "온다고" : "안 온다고") + " 합니다</div>");
    }

    GRID.innerHTML = rs.map(function (r) {
      var w = wx(r.code_wmo), rep = r.reports || 0;
      var wetSay = (r.rain || 0) + (r.snow || 0), drySay = r.none || 0;
      var pct = rep ? Math.round(wetSay / rep * 100) : 0;
      return '<button type="button" class="wx-card ' + w.k + (isWet(w.k) ? " wet" : "") + '" data-r="' + esc(r.code) + '">' +
        '<div class="wx-c-top"><span class="wx-c-name">' + esc(r.name) + "</span>" +
          '<span class="wx-c-emo">' + w.e + "</span></div>" +
        '<div class="wx-c-temp">' + (r.temp == null ? "–" : Math.round(r.temp) + "°") + "</div>" +
        '<div class="wx-c-desc">' + esc(w.t) + (r.precip > 0 ? " " + r.precip + "mm" : "") + "</div>" +
        (rep
          ? '<div class="wx-c-bar"><i style="width:' + pct + '%"></i></div>' +
            '<div class="wx-c-rep"><b>' + wetSay + "</b>명 와요 · " + drySay + "명 안와요</div>"
          : '<div class="wx-c-rep none">제보 없음 — 눌러서 알려주기</div>') +
        "</button>";
    }).join("");

    var wetRatio = rs.length ? wetObs / rs.length : 0;
    sky(wetRatio, snowAny > wetObs / 2);
    FOOT.textContent = "실황 10분마다 갱신 · 제보는 최근 30분만 집계";
  }

  /* ── 제보 ── */
  function sheet(region, name) {
    var el = document.createElement("div");
    el.className = "wx-sheet";
    el.innerHTML = '<div class="wx-sheet-in"><div class="wx-sheet-t">' + esc(name) + ', 지금 어때요?</div>' +
      '<div class="wx-sheet-btns">' +
      '<button type="button" data-k="rain">🌧️<span>비 와요</span></button>' +
      '<button type="button" data-k="snow">❄️<span>눈 와요</span></button>' +
      '<button type="button" data-k="none">☀️<span>안 와요</span></button>' +
      "</div><button type='button' class='wx-sheet-x'>닫기</button></div>";
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add("on"); });
    var close = function () { el.classList.remove("on"); setTimeout(function () { el.remove(); }, 220); };
    el.addEventListener("click", async function (e) {
      if (e.target === el || e.target.classList.contains("wx-sheet-x")) return close();
      var b = e.target.closest("[data-k]"); if (!b) return;
      b.disabled = true;
      try {
        var r = await sb.rpc("weather_report", { p_region: region, p_kind: b.dataset.k });
        var d = r && r.data;
        if (d && d.ok) {
          myRegion = region;
          try { localStorage.setItem("galla_wx_region", region); } catch (_) {}
          window.GALLA_toast && GALLA_toast("제보 고마워요! 지금 " + esc(name) + " — " + (d.rain + d.snow) + "명 와요");
          close(); load();
        } else if (d && d.reason === "cooldown") {
          window.GALLA_toast && GALLA_toast("방금 제보했어요 — " + Math.ceil(d.wait_sec / 60) + "분 뒤에 다시");
          close();
        } else if (d && d.reason === "unauthorized") {
          if (confirm("제보하려면 로그인이 필요해요. 로그인할까요?")) (window.GALLA_nav || function (u) { location.href = u; })("login.html");
          close();
        } else { b.disabled = false; window.GALLA_toast && GALLA_toast("잠시 후 다시 시도해주세요"); }
      } catch (_) { b.disabled = false; }
    });
  }

  async function load() {
    try {
      sb = sb || (window.waitForSupabaseClient ? await window.waitForSupabaseClient() : window.supabaseClient);
      if (!sb) return;
      var r = await sb.rpc("weather_now");
      if (r && r.data) render(r.data);
    } catch (e) { /* 조용히 — 다음 주기에 다시 */ }
  }

  function start() {
    PANEL = document.querySelector('.tab-panel[data-panel="weather"]');
    if (!PANEL) return;
    GRID = document.getElementById("wx-grid");
    HERO = document.getElementById("wx-hero");
    FOOT = document.getElementById("wx-foot");
    SKY = document.getElementById("wx-sky");
    try { myRegion = localStorage.getItem("galla_wx_region"); } catch (_) {}
    GRID.addEventListener("click", function (e) {
      var c = e.target.closest(".wx-card"); if (!c) return;
      var code = c.dataset.r;
      var reg = (lastData && lastData.regions || []).find(function (x) { return x.code === code; });
      sheet(code, reg ? reg.name : "이 지역");
    });
    load();
    clearInterval(timer);
    timer = setInterval(function () { if (!document.hidden && PANEL.classList.contains("active")) load(); }, 60000);
    window.addEventListener("resize", function () { if (lastData) render(lastData); }, { passive: true });
  }

  /* 🚦 광장과 같은 규약 — 패널이 실제로 보일 때만 시작한다.
     ⚠️ click 리스너로는 부족하다: ?tab=weather 진입은 search.js 가 프로그램적으로 활성화한다. */
  (function boot() {
    var panel = document.querySelector('.tab-panel[data-panel="weather"]');
    if (!panel) return;
    if (panel.classList.contains("active")) return start();
    try {
      var mo = new MutationObserver(function () {
        if (panel.classList.contains("active")) { mo.disconnect(); start(); }
      });
      mo.observe(panel, { attributes: true, attributeFilter: ["class"] });
    } catch (_) { start(); }
  })();
})();
