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
  /* 🔒 로그인 유도 — 비로그인이 제보·즐겨찾기·한마디를 누르면 서버가 권한 단계(401)에서 막아
     앱엔 빈 결과(null)만 와서 아무 반응이 없었다(2026-09-12 사장님 제보 「비 와요/안 와요가 안 된다」).
     예전 needLogin 은 reason:'unauthorized' 일 때만 불렸는데, 비로그인은 함수 본문에 닿지도 못해 그 값이 안 온다.
     → 누르기 전에 세션을 보고 공용 로그인 모달로 안내한다. 방(z 100000)이 로그인 화면을 덮지 않게
       모달의 '로그인하기'를 누르면 방을 먼저 닫는다(start 의 캡처 리스너). */
  var GUEST = false;
  async function authed() {
    try { var s = await (await client()).auth.getSession(); return !!(s && s.data && s.data.session); }
    catch (_) { return false; }
  }
  function needLogin(msg) {
    msg = msg || "로그인하면 비·눈 제보와 한마디를 남길 수 있어요.";
    if (window.GALLA_needLogin) return window.GALLA_needLogin(msg);
    if (confirm("로그인이 필요해요. 로그인할까요?")) { closeRoom(); (window.GALLA_nav || function (u) { location.href = u; })("login.html"); }
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
    // 비로그인은 즐겨찾기가 없다 — weather_my 는 로그인 전용이라 부르면 매번 401 만 쌓인다
    if (!(await authed())) { FAVSEC.hidden = true; return; }
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
    GUEST = !(await authed());
    room = code;
    var el = document.getElementById("wx-room");
    if (!el) {
      el = document.createElement("div"); el.id = "wx-room"; el.className = "wx-room";
      document.body.appendChild(el);
      el.addEventListener("click", onRoomClick);
      (void el.offsetWidth, el.classList.add("on"));
    }
    paintRoom(el, d);
    clearInterval(roomTimer);
    roomTimer = setInterval(async function () {
      if (!room) return;
      /* ⌨️ 쓰는 중이면 건드리지 않는다 — paintRoom 은 innerHTML 을 통째로 갈아끼우므로
         20초마다 입력창 DOM 이 새로 만들어져 **포커스가 날아간다**(값만 draft 로 살아남는다).
         한 문장 쓰는 동안 반드시 한 번은 끊겨서, 타이핑이 통째로 허공에 들어간다.
         실측 2026-09-10(앱): 입력창을 탭하고 친 글자가 하나도 안 들어가 `weather_comments` 0행. */
      var typing = document.getElementById("wx-say");
      if (typing && (document.activeElement === typing || (typing.value || "").trim())) return;
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
        (GUEST ? '<div class="wx-guest"><span>🔒 로그인하면 제보·한마디를 남길 수 있어요</span><button type="button" data-login>로그인</button></div>' : "") +
        '<div class="wx-says">' + ((d.says || []).length
          ? d.says.map(function (s) {
              return '<div class="wx-say-row"><div class="wx-say-nick">' + esc(s.nick) + '<span>' + ago(s.at) + "</span></div>" +
                     '<div class="wx-say-body">' + esc(s.body) + "</div></div>"; }).join("")
          : '<div class="wx-says-empty">아직 조용해요 — 첫 한마디를 남겨보세요</div>') + "</div>" +
        '<form class="wx-say-form"><input id="wx-say" maxlength="140" placeholder="' + (GUEST ? "로그인하면 한마디를 남길 수 있어요" : "지금 여기 어때요? (140자)") + '" enterkeyhint="send">' +
        '<button type="submit">보내기</button></form>' +
      "</div>";
    if (draft) { var i = el.querySelector("#wx-say"); if (i) { i.value = draft; try { i.focus(); i.setSelectionRange(draft.length, draft.length); } catch (_) {} } }
    var f = el.querySelector(".wx-say-form");
    f.addEventListener("submit", async function (e) {
      e.preventDefault();
      var i = el.querySelector("#wx-say"), v = (i.value || "").trim();
      if (!v) return;
      if (!(await authed())) { needLogin(); return; }
      i.disabled = true;
      var res = await rpc("weather_say", { p_region: room, p_body: v });
      i.disabled = false;
      if (res && res.ok) { i.value = ""; var n = await rpc("weather_room", { p_region: room, p_limit: 40 }); if (n && n.ok) paintRoom(el, n); }
      else if (res && res.reason === "unauthorized") needLogin();
      else if (res && res.reason === "slow_down") window.GALLA_toast && GALLA_toast("조금만 천천히요 ㅎㅎ");
      else if (!res) window.GALLA_toast && GALLA_toast("잠시 후 다시 시도해 주세요");
      i.focus();
    });
  }
  async function onRoomClick(e) {
    var el = document.getElementById("wx-room");
    if (e.target === el || e.target.closest("[data-x]")) return closeRoom();
    if (e.target.closest("[data-login]")) return needLogin();
    var fav = e.target.closest("[data-fav]");
    if (fav) {
      if (!(await authed())) return needLogin("로그인하면 동네를 즐겨찾기할 수 있어요.");
      var on = !fav.classList.contains("on");
      var res = await rpc("weather_fav", { p_region: room, p_on: on });
      if (res && res.ok) { fav.classList.toggle("on", on); fav.textContent = on ? "★" : "☆"; loadFav(); }
      else if (res && res.reason === "unauthorized") needLogin();
      else if (res && res.reason === "too_many") window.GALLA_toast && GALLA_toast("즐겨찾기는 12곳까지예요");
      return;
    }
    var b = e.target.closest("[data-k]");
    if (b) {
      if (!(await authed())) return needLogin();
      var res2 = await rpc("weather_report", { p_region: room, p_kind: b.dataset.k });
      if (res2 && res2.ok) { var n = await rpc("weather_room", { p_region: room, p_limit: 40 }); if (n && n.ok) paintRoom(el, n, true); load(); }
      else if (res2 && res2.reason === "unauthorized") needLogin();
      else if (res2 && res2.reason === "cooldown") window.GALLA_toast && GALLA_toast("방금 제보했어요 — " + Math.ceil(res2.wait_sec / 60) + "분 뒤에 다시");
      else if (!res2) window.GALLA_toast && GALLA_toast("잠시 후 다시 시도해 주세요");
    }
  }
  function closeRoom() {
    var el = document.getElementById("wx-room");
    room = null; clearInterval(roomTimer);
    if (el) { el.classList.remove("on"); setTimeout(function () { el.remove(); }, 220); }
  }

  /* ── 🗺 전국 날씨 지도 ─────────────────────────────────────
     사장님(26.9.18): "날씨 탭도 네이버 지도를 띄워서 날씨 정보를 넣어. 전국 날씨현황을 한눈에".
     · 멀리서(줌<9) 시도 17곳, 가까이 가면 시군구 232곳 — weather_map 한 번에 249점(가볍다)
     · 알약 = [하늘 이모지 기온] + 지역 이름, 색 = 기온. 누르면 그 동네 방(openRoom)
     · 앱은 네이티브 네이버 지도(GallaNaverMap, 웹뷰 뒤 — 웹 SDK 는 capacitor origin 인증 불가),
       웹은 네이버 JS SDK. 키는 맛집과 같은 food_map_config 에서 받는다.
     ⚠️ 네이티브 지도는 한 번에 하나다(맛집과 공유). 닫을 때 반드시 destroy — 안 하면 다음 판 뒤에 남는다. */
  var WMAP = null, WMB = null, WPTS = [], wmTimer = 0;
  function tempColor(t) {
    if (t == null) return "#5b6170";
    if (t <= -5) return "#3b5bdb"; if (t <= 0) return "#4c7ef3"; if (t <= 5) return "#3fa2e8";
    if (t <= 10) return "#2fb8c4"; if (t <= 15) return "#35b779"; if (t <= 20) return "#6aae35";
    if (t <= 25) return "#e0a020"; if (t <= 30) return "#f07c2a"; return "#e0413a";
  }
  function isApp() {
    try { return location.protocol === "capacitor:" || location.protocol === "ionic:" ||
                 (typeof window.GALLA_isApp === "function" && window.GALLA_isApp()); } catch (_) { return false; }
  }
  var naverP = null;
  function loadNaverSdk(cid, param) {
    if (window.naver && window.naver.maps) return Promise.resolve();
    if (naverP) return naverP;
    naverP = new Promise(function (res, rej) {
      var sc = document.createElement("script");
      sc.src = "https://oapi.map.naver.com/openapi/v3/maps.js?" + encodeURIComponent(param || "ncpKeyId") + "=" + encodeURIComponent(cid);
      sc.onload = function () { (window.naver && window.naver.maps) ? res() : rej(new Error("no_maps")); };
      sc.onerror = function () { rej(new Error("load_fail")); };
      document.head.appendChild(sc);
      setTimeout(function () { (window.naver && window.naver.maps) ? res() : rej(new Error("timeout")); }, 8000);
    });
    return naverP;
  }
  /* 앱: 네이티브 지도 어댑터 */
  function wmNative(P, lat, lon, zoom) {
    var last = { ok: false, zoom: zoom }, idleFns = [], clicks = {}, handles = [], seq = 0;
    P.addListener("idle", function (e) {
      last = { swLat: +e.swLat, swLon: +e.swLon, neLat: +e.neLat, neLon: +e.neLon, zoom: +e.zoom,
               ok: (+e.neLat > +e.swLat) && (+e.neLon > +e.swLon) };
      idleFns.forEach(function (f) { try { f(); } catch (_) {} });
    }).then(function (h) { handles.push(h); });
    P.addListener("markerClick", function (e) { var f = clicks[e && e.id]; if (f) try { f(); } catch (_) {} })
      .then(function (h) { handles.push(h); });
    P.create({ x: 0, y: 0, width: window.innerWidth, height: window.innerHeight, lat: lat, lng: lon, zoom: zoom })
      .catch(function (e) { console.warn("[weather] 네이티브 지도 create 실패", e); });
    document.body.classList.add("fd-native-map"); document.documentElement.classList.add("fd-native-map");
    /* 터치: 위 막대 아래는 지도로. 방(#wx-room)이 떠 있으면 전부 웹으로(안 그러면 방의 버튼을 지도가 먹는다) */
    function touch() {
      if (!P.setTouchTop) return;
      var room = document.querySelector("#wx-room.on");
      var top = WMAP && WMAP.querySelector(".wx-map-top");
      var y = room ? 100000 : (top ? Math.round(top.getBoundingClientRect().bottom) : 0);
      P.setTouchTop({ y: y }).catch(function () {});
    }
    setTimeout(touch, 0);
    var mo = null;
    try { mo = new MutationObserver(touch); mo.observe(document.body, { childList: true, subtree: false, attributes: true, attributeFilter: ["class"] }); } catch (_) {}
    var roomMo = setInterval(touch, 700);   // 방은 body 자식으로 붙었다 빠진다 — class 변화까지 확실히 잡는다
    return {
      onIdle: function (f) { idleFns.push(f); },
      bounds: function () { return last.ok ? last : null; },
      zoom: function () { return last.zoom || zoom; },
      refresh: function () {
        P.getBounds().then(function (b) {
          if (b && b.ok) { last = { swLat: +b.swLat, swLon: +b.swLon, neLat: +b.neLat, neLon: +b.neLon, zoom: +b.zoom, ok: true };
                           idleFns.forEach(function (f) { try { f(); } catch (_) {} }); }
        }).catch(function () {});
      },
      draw: function (list, onClick) {
        clicks = {};
        P.setMarkers({ markers: list.map(function (r) {
          var id = "w" + (++seq); clicks[id] = function () { onClick(r); };
          return { id: id, kind: "wx", lat: +r.lat, lng: +r.lon, size: 24,
                   text: wx(r.code_wmo).e + " " + (r.temp == null ? "–" : Math.round(r.temp) + "°"),
                   badge: r.name, bg: tempColor(r.temp), ring: "#ffffff", fg: "#ffffff" };
        }) }).catch(function () {});
      },
      teardown: function () {
        try { mo && mo.disconnect(); } catch (_) {}
        clearInterval(roomMo);
        handles.forEach(function (h) { try { h.remove(); } catch (_) {} });
        document.body.classList.remove("fd-native-map"); document.documentElement.classList.remove("fd-native-map");
        P.destroy().catch(function () {});
      }
    };
  }
  /* 웹: 네이버 JS 어댑터 */
  function wmWeb(el, lat, lon, zoom) {
    var nv = window.naver.maps, markers = [];
    var map = new nv.Map(el, { center: new nv.LatLng(lat, lon), zoom: zoom, mapDataControl: false, scaleControl: false,
                               logoControlOptions: { position: nv.Position.BOTTOM_LEFT } });
    setTimeout(function () { try { map.refresh(true); } catch (_) {} }, 60);
    return {
      onIdle: function (f) { nv.Event.addListener(map, "idle", f); },
      bounds: function () {
        try { var b = map.getBounds(), mn = b.getMin(), mx = b.getMax();
              var r = { swLat: mn.y, swLon: mn.x, neLat: mx.y, neLon: mx.x, zoom: map.getZoom(), ok: true };
              return (r.neLat > r.swLat && r.neLon > r.swLon) ? r : null; } catch (_) { return null; }
      },
      zoom: function () { return map.getZoom(); },
      refresh: function () { try { map.refresh(true); } catch (_) {} },
      draw: function (list, onClick) {
        markers.forEach(function (m) { try { m.setMap(null); } catch (_) {} }); markers = [];
        list.forEach(function (r) {
          var w = wx(r.code_wmo);
          var html = '<div class="wxm"><b style="background:' + tempColor(r.temp) + '">' + w.e + " " +
                     (r.temp == null ? "–" : Math.round(r.temp) + "°") + "</b><i>" + esc(r.name) + "</i></div>";
          var m = new nv.Marker({ position: new nv.LatLng(+r.lat, +r.lon), map: map, icon: { content: html, anchor: new nv.Point(0, 0) } });
          nv.Event.addListener(m, "click", function () { onClick(r); });
          markers.push(m);
        });
      },
      teardown: function () { markers.forEach(function (m) { try { m.setMap(null); } catch (_) {} }); try { map.destroy(); } catch (_) {} el.innerHTML = ""; }
    };
  }
  function wmPaint() {
    if (!WMB || !WPTS.length) return;
    var b = WMB.bounds(), z = WMB.zoom();
    var city = z >= 9;
    var list = WPTS.filter(function (r) {
      if (city ? r.kind !== "city" : r.kind !== "sido") return false;
      if (!b) return true;
      var mLat = (b.neLat - b.swLat) * 0.1, mLon = (b.neLon - b.swLon) * 0.1;
      return r.lat >= b.swLat - mLat && r.lat <= b.neLat + mLat && r.lon >= b.swLon - mLon && r.lon <= b.neLon + mLon;
    });
    /* 겹침 솎기 — 서울(25구)처럼 촘촘한 곳은 알약이 포개져 읽히지 않는다. 화면 64×40px 칸마다 하나만.
       좌표→화면은 경계로 선형 환산(이 축척에선 충분히 정확, 네이티브도 경계만 알면 된다). 더 확대하면 나머지가 나온다 */
    if (b) {
      var W = window.innerWidth || 375, H = window.innerHeight || 800, seen = {};
      list = list.filter(function (r) {
        var x = (r.lon - b.swLon) / (b.neLon - b.swLon) * W, y = (b.neLat - r.lat) / (b.neLat - b.swLat) * H;
        var k = Math.floor(x / 64) + ":" + Math.floor(y / 40);
        if (seen[k]) return false; seen[k] = 1; return true;
      });
    }
    WMB.draw(list, function (r) { openRoom(r.code); });
    var sum = WMAP.querySelector("#wx-map-sum");
    if (sum) sum.textContent = (city ? "시·군·구 " : "시·도 ") + list.length + "곳" + (city ? "" : " · 확대하면 시·군·구까지");
  }
  async function wmLoad() {
    var d = await rpc("weather_map");
    if (!d || !d.ok) return;
    WPTS = (d.points || []).filter(function (r) { return r.lat != null; });
    var at = WMAP && WMAP.querySelector("#wx-map-at");
    var t = WPTS.reduce(function (m, r) { return r.obs_at && r.obs_at > m ? r.obs_at : m; }, "");
    if (at && t) at.textContent = new Date(t).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) + " 실황";
    wmPaint();
  }
  async function openWxMap() {
    if (!WMAP) {
      WMAP = document.createElement("div");
      WMAP.className = "wx-map"; WMAP.setAttribute("data-no-ptr", "");
      WMAP.innerHTML = '<div class="wx-map-c" id="wx-map-c"></div>' +
        '<div class="wx-map-top"><div class="wx-map-row">' +
          '<button type="button" class="wx-map-x" id="wx-map-x" aria-label="닫기">✕</button>' +
          '<div class="wx-map-t">전국 날씨<span id="wx-map-at"></span></div></div>' +
          '<div class="wx-map-sum" id="wx-map-sum"></div></div>' +
        '<div class="wx-map-legend">-5°<i></i>30°+</div>';
      document.body.appendChild(WMAP);
      WMAP.querySelector("#wx-map-x").addEventListener("click", function () { closeWxMap(); });
      /* 뒤로가기로 닫힌다 — 판정은 이벤트 state 로(라우터가 먼저 replaceState 한다, 맛집·여행과 같은 함정).
         방(#wx-room)이 떠 있으면 뒤로가기는 방부터 — 방은 기록 칸이 없어 여기서 같이 처리한다 */
      window.addEventListener("popstate", function (ev) {
        if (!WMAP.classList.contains("open")) return;
        try { if (ev && ev.state && ev.state.wxMap) return; } catch (_) {}
        closeWxMap(true);
      });
    }
    if (WMAP.classList.contains("open")) return;
    WMAP.classList.add("open");
    try { history.pushState({ wxMap: 1 }, ""); } catch (_) {}
    var cfg = await rpc("food_map_config");
    var cid = cfg && cfg.naver_client_id;
    var el = WMAP.querySelector("#wx-map-c");
    var CENTER = [35.85, 127.75], ZOOM = 7;   // 남한 전체 + 제주가 폰 세로 화면에 꽉 차게
    var why = "";
    var P = null;
    try { P = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.GallaNaverMap; } catch (_) {}
    try {
      if (!cid) why = "no_client_id";
      else if (isApp() && P) {
        await P.setup({ ncpKeyId: String(cid) });
        el.classList.add("native");
        WMB = wmNative(P, CENTER[0], CENTER[1], ZOOM);
      } else if (!isApp()) {
        await loadNaverSdk(String(cid), cfg.param);
        WMB = wmWeb(el, CENTER[0], CENTER[1], ZOOM);
      } else why = "app_without_native_plugin";
    } catch (e) { why = "exception:" + (e && (e.message || e)); WMB = null; }
    if (!WMB) {
      /* 실패 이유를 남긴다 — 앱에서 "지도 호출 실패"가 떴는데 콘솔을 볼 수 없어 원인을 몰랐다(26.9.18) */
      try { window.GALLA_logError && GALLA_logError(why || "unknown", "weather_map app=" + isApp() + " plugin=" + !!P + " cfg=" + !!cfg); } catch (_) {}
      window.GALLA_toast && GALLA_toast("지도를 불러오지 못했어요");
      closeWxMap(); return;
    }
    WMB.onIdle(function () { clearTimeout(wmTimer); wmTimer = setTimeout(wmPaint, 180); });
    await wmLoad();
    setTimeout(function () { WMB && WMB.refresh(); }, 120);
  }
  function closeWxMap(fromPop) {
    if (!WMAP) return;
    if (WMB) { try { WMB.teardown(); } catch (_) {} WMB = null; }
    WMAP.classList.remove("open");
    var el = WMAP.querySelector("#wx-map-c"); if (el) el.classList.remove("native");
    if (!fromPop) { try { if (history.state && history.state.wxMap) history.back(); } catch (_) {} }
  }
  window.GALLA_WEATHER_CLOSE_MAP = function () { closeWxMap(true); };

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
      if (e.target.closest("#wx-openmap")) { openWxMap(); return; }
      var c = e.target.closest(".wx-card, .wx-hit");
      if (c && c.dataset.r) openRoom(c.dataset.r);
    });
    // 공용 로그인 모달의 '로그인하기' → 방(z 100000)과 모달을 먼저 닫아야 로그인 화면이 보인다
    document.addEventListener("click", function (e) {
      if (!room || !e.target.closest || !e.target.closest("#galla-login-modal .glm-go")) return;
      closeRoom();
      var m = document.getElementById("galla-login-modal"); if (m) m.classList.remove("open");
    }, true);
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
