/* 갈라 공식 소개 사이트(galla.im/about) — 인터랙션 전부
   핵심 장면: 빨강·파랑 두 기운이 화면 가운데서 부딪히는 '전장' 캔버스. 누르면 그쪽 편 힘이 세져 경계선이 밀린다.
   ⚠️ 연출 규칙: 이모지 파티클 금지(전부 캔버스·SVG), 방사형 빛줄기 금지(충격파는 원형 고리만). */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var RM = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  function haptic() { try { navigator.vibrate && navigator.vibrate(10); } catch (_) {} }

  /* ── 로더 ── */
  (function () {
    var ld = $("#loader"), bar = $(".ld-bar i", ld), p = 0;
    var seen = false; try { seen = !!sessionStorage.getItem("gab-seen"); sessionStorage.setItem("gab-seen", "1"); } catch (_) {}
    if (seen || RM) { ld.classList.add("done"); return; }
    var t = setInterval(function () { p = Math.min(90, p + 7 + Math.random() * 12); bar.style.width = p + "%"; }, 90);
    function done() { clearInterval(t); bar.style.width = "100%"; setTimeout(function () { ld.classList.add("done"); }, 260); }
    if (document.readyState === "complete") setTimeout(done, 500); else addEventListener("load", function () { setTimeout(done, 300); });
    setTimeout(done, 2600);
  })();

  /* ── 상단 메뉴·드로어·하단 버튼 ── */
  var gnb = $("#gnb"), fab = $("#fab"), dlSec = $("#download");
  function onScroll() {
    var y = scrollY, h = innerHeight;
    gnb.classList.toggle("solid", y > 40);
    var dl = dlSec.getBoundingClientRect();
    fab.classList.toggle("on", y > h * 0.8 && !(dl.top < h && dl.bottom > 0));
  }
  addEventListener("scroll", onScroll, { passive: true }); onScroll();
  var drawer = $("#drawer"), menu = $("#menu");
  function setDrawer(on) { drawer.classList.toggle("on", on); drawer.setAttribute("aria-hidden", on ? "false" : "true"); menu.setAttribute("aria-expanded", on ? "true" : "false"); document.body.style.overflow = on ? "hidden" : ""; }
  menu.onclick = function () { setDrawer(true); };
  $("#menuX").onclick = function () { setDrawer(false); };
  $$("a", drawer).forEach(function (a) { a.addEventListener("click", function () { setDrawer(false); }); });

  /* ── 충격파 고리 ── */
  function ring(x, y, color) {
    if (RM) return;
    var r = document.createElement("i"); r.className = "ring"; r.style.left = x + "px"; r.style.top = y + "px"; r.style.setProperty("--rc", color);
    document.body.appendChild(r); setTimeout(function () { r.remove(); }, 750);
  }
  $$("[data-go]").forEach(function (a) {
    a.addEventListener("click", function (e) { ring(e.clientX, e.clientY, "#a98bff"); try { window.GALLA_track && window.GALLA_track("share_click", { from: "about", to: a.getAttribute("href").slice(0, 80) }); } catch (_) {} });
  });

  /* ── 나타나기 ── */
  var io = "IntersectionObserver" in window ? new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }) : null;
  function watch(el) { if (io) io.observe(el); else el.classList.add("in"); }

  /* ═════════ 전장 캔버스 ═════════ */
  function Clash(canvas, opt) {
    opt = opt || {};
    var ctx = canvas.getContext("2d"), W = 0, H = 0, dpr = 1, running = false, raf = 0, t0 = performance.now();
    var seam = 0.5, seamT = 0.5, push = 0, tilt = 0;
    var parts = [], sparks = [], bolt = [], boltAt = 0;
    var dense = opt.dense || 1;
    function size() {
      dpr = Math.min(window.devicePixelRatio || 1, 1.6);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var n = Math.round(Math.min(260, (W * H) / 5200) * dense);
      parts = [];
      for (var i = 0; i < n * 2; i++) parts.push(spawn(i % 2 ? 1 : -1, true));
    }
    function spawn(side, anywhere) {
      // side -1 = 빨강(왼쪽에서 오른쪽으로), 1 = 파랑(오른쪽에서 왼쪽으로)
      var sx = seam * W;
      var x = anywhere ? (side < 0 ? Math.random() * sx : sx + Math.random() * (W - sx)) : (side < 0 ? -10 : W + 10);
      return { s: side, x: x, y: Math.random() * H, px: x, py: 0, v: (0.6 + Math.random() * 1.8), w: Math.random() * 6.28, a: 0.25 + Math.random() * 0.75, r: 0.6 + Math.random() * 1.6 };
    }
    function spark(x, y, side) {
      if (sparks.length > 420) return;
      var ang = (side < 0 ? Math.PI : 0) + (Math.random() - 0.5) * 2.2;
      var sp = 1 + Math.random() * 4.5;
      sparks.push({ x: x, y: y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 0.4, life: 1, c: Math.random() < 0.5 ? "255,255,255" : (side < 0 ? "255,150,170" : "150,190,255") });
    }
    function makeBolt() {   // 경계선 기준 상대 좌표로 저장 → 경계가 밀려도 번개가 따라간다
      bolt = []; var y = -10;
      while (y < H + 10) { bolt.push([(Math.random() - 0.5) * 26, y]); y += 14 + Math.random() * 26; }
      boltAt = performance.now();
    }
    function nebula(t) {
      var sx = seam * W;
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      var blobs = [
        [-1, 0.18, 0.32, 0.55, 0], [-1, 0.32, 0.72, 0.5, 1.7], [-1, 0.08, 0.86, 0.38, 3.1],
        [1, 0.82, 0.3, 0.55, 0.9], [1, 0.68, 0.74, 0.5, 2.4], [1, 0.93, 0.85, 0.38, 4.2]
      ];
      for (var i = 0; i < blobs.length; i++) {
        var b = blobs[i], side = b[0];
        var bx = (side < 0 ? b[1] * (sx / (W * 0.5)) : 1 - (1 - b[1]) * ((W - sx) / (W * 0.5))) * W + Math.sin(t * 0.00031 + b[4]) * W * 0.04;
        var by = b[2] * H + Math.cos(t * 0.00027 + b[4]) * H * 0.05;
        var rr = b[3] * Math.max(W, H) * (0.9 + 0.1 * Math.sin(t * 0.0006 + b[4]));
        var g = ctx.createRadialGradient(bx, by, 0, bx, by, rr);
        if (side < 0) { g.addColorStop(0, "rgba(255,52,82,.42)"); g.addColorStop(0.45, "rgba(150,16,48,.18)"); g.addColorStop(1, "rgba(0,0,0,0)"); }
        else { g.addColorStop(0, "rgba(46,110,255,.44)"); g.addColorStop(0.45, "rgba(14,40,150,.18)"); g.addColorStop(1, "rgba(0,0,0,0)"); }
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
      // 경계의 보랏빛 충돌광
      var gw = Math.max(80, W * 0.12);
      var sg = ctx.createLinearGradient(sx - gw, 0, sx + gw, 0);
      sg.addColorStop(0, "rgba(0,0,0,0)"); sg.addColorStop(0.5, "rgba(190,110,255," + (0.22 + 0.08 * Math.sin(t * 0.004)) + ")"); sg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = sg; ctx.fillRect(sx - gw, 0, gw * 2, H);
    }
    function frame(now) {
      if (!running) return;
      var t = now - t0;
      push *= 0.985; seamT = 0.5 + push + tilt;
      seamT = Math.max(0.22, Math.min(0.78, seamT));
      seam += (seamT - seam) * 0.05;
      var sx = seam * W;
      nebula(t);
      // 입자 — 짧은 꼬리를 그리며 경계로 돌진, 닿으면 불꽃
      ctx.lineCap = "round";
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        p.px = p.x; p.py = p.y;
        var boost = p.s < 0 ? 1 + Math.max(0, push) * 6 : 1 + Math.max(0, -push) * 6;
        p.w += 0.03;
        p.x += -p.s * p.v * boost * (W / 900 + 0.6);
        p.y += Math.sin(p.w + p.x * 0.01) * 0.6;
        var hit = p.s < 0 ? p.x >= sx : p.x <= sx;
        if (hit) { if (Math.random() < 0.35) spark(sx, p.y, p.s); parts[i] = spawn(p.s, false); continue; }
        if (p.y < -5) p.y = H + 5; if (p.y > H + 5) p.y = -5;
        var near = 1 - Math.min(1, Math.abs(p.x - sx) / (W * 0.5));
        var al = p.a * (0.35 + near * 0.9);
        ctx.strokeStyle = p.s < 0 ? "rgba(255," + (90 + near * 90 | 0) + "," + (100 + near * 40 | 0) + "," + al + ")" : "rgba(" + (80 + near * 80 | 0) + "," + (150 + near * 60 | 0) + ",255," + al + ")";
        ctx.lineWidth = p.r;
        ctx.beginPath(); ctx.moveTo(p.px + p.s * p.v * 6, p.py); ctx.lineTo(p.x, p.y); ctx.stroke();
      }
      // 불꽃
      for (var k = sparks.length - 1; k >= 0; k--) {
        var s = sparks[k];
        s.x += s.vx; s.y += s.vy; s.vy += 0.05; s.vx *= 0.97; s.life -= 0.022;
        if (s.life <= 0) { sparks.splice(k, 1); continue; }
        ctx.fillStyle = "rgba(" + s.c + "," + s.life + ")";
        ctx.beginPath(); ctx.arc(s.x, s.y, 1.4 * s.life + 0.4, 0, 6.283); ctx.fill();
      }
      // 번개 경계선
      if (now - boltAt > 70 + Math.random() * 90 || !bolt.length) makeBolt();
      ctx.save();
      ctx.shadowColor = "rgba(210,170,255,1)"; ctx.shadowBlur = 22;
      for (var pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = pass ? "rgba(255,255,255,.95)" : "rgba(200,150,255,.55)";
        ctx.lineWidth = pass ? 1.6 : 6;
        ctx.beginPath();
        for (var j = 0; j < bolt.length; j++) { if (j) ctx.lineTo(sx + bolt[j][0], bolt[j][1]); else ctx.moveTo(sx + bolt[j][0], bolt[j][1]); }
        ctx.stroke();
      }
      ctx.restore();
      raf = requestAnimationFrame(frame);
    }
    function start() { if (running) return; running = true; raf = requestAnimationFrame(frame); }
    function stop() { running = false; cancelAnimationFrame(raf); }
    size();
    addEventListener("resize", function () { size(); });
    if (RM) { running = true; frame(performance.now()); running = false; }
    else if ("IntersectionObserver" in window) new IntersectionObserver(function (es) { es[0].isIntersecting ? start() : stop(); }).observe(canvas);
    else start();
    return {
      hit: function (side, cx, cy) {     // side -1 빨강 / 1 파랑 — 그 편이 밀어붙인다
        push = Math.max(-0.26, Math.min(0.26, push + (side < 0 ? 0.075 : -0.075)));
        var sx = seam * W;
        for (var i = 0; i < 46; i++) spark(sx, (cy != null ? cy : H / 2) + (Math.random() - 0.5) * H * 0.5, -side);
        if (RM) { running = true; frame(performance.now()); running = false; }
      },
      tilt: function (v) { tilt = v; },
      seam: function () { return seam; }
    };
  }

  var kv = $(".kv"), clash = Clash($("#clash"), { dense: innerWidth < 700 ? 0.7 : 1 });
  Clash($("#clash2"), { dense: 0.5 });
  // 마우스를 따라 경계가 살짝 기운다(데스크톱만)
  kv.addEventListener("pointermove", function (e) {
    if (e.pointerType !== "mouse") return;
    var r = kv.getBoundingClientRect(); clash.tilt(((e.clientX - r.left) / r.width - 0.5) * -0.12);
  });
  kv.addEventListener("pointerleave", function () { clash.tilt(0); });

  /* ── 키비주얼 VS — 계속 바뀌는 생활 논쟁, 누르면 그 편이 밀어붙인다 ── */
  var MATCH = [["부먹", "찍먹"], ["민초", "반민초"], ["짜장", "짬뽕"], ["강아지", "고양이"], ["여름", "겨울"], ["아침형", "저녁형"], ["깻잎 떼 준다", "안 떼 준다"], ["카톡 바로 답장", "천천히 답장"]];
  var mi = 0, hits = { r: 0, b: 0 }, vsA = $("#vsA"), vsB = $("#vsB"), hint = $("#kvHint");
  function rotate() {
    mi = (mi + 1) % MATCH.length; hits = { r: 0, b: 0 };
    [vsA, vsB].forEach(function (el, k) { el.style.transition = "opacity .25s,transform .25s"; el.style.opacity = 0; el.style.transform = "translateY(8px)"; setTimeout(function () { el.textContent = MATCH[mi][k]; el.style.opacity = 1; el.style.transform = "none"; }, 250); });
  }
  var rotT = setInterval(rotate, 3600);
  $$(".kv-vs .vs").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      var side = btn.dataset.side; hits[side]++; haptic();
      var r = btn.getBoundingClientRect();
      clash.hit(side === "r" ? -1 : 1, null, r.top + r.height / 2 - kv.getBoundingClientRect().top);
      ring(e.clientX || r.left + r.width / 2, e.clientY || r.top + r.height / 2, side === "r" ? "#ff4d64" : "#3d7bff");
      btn.classList.remove("hit"); void btn.offsetWidth; btn.classList.add("hit");
      clearInterval(rotT); rotT = setInterval(rotate, 5200);
      var name = MATCH[mi][side === "r" ? 0 : 1], n = hits[side];
      hint.classList.add("hot");
      hint.textContent = n < 3 ? name + " 편에 힘을 실었어요!" : n < 6 ? name + " 진영, 밀어붙이는 중… " + n + "타" : name + " 진영 폭주! 진짜 판은 갈라에서 →";
    });
  });

  /* ── 트레일러 ── */
  (function () {
    var v = $("#trVid"), snd = $("#trSnd"), loaded = false;
    function load() { if (loaded) return; loaded = true; v.src = v.dataset.src; v.play().catch(function () {}); }
    if ("IntersectionObserver" in window) new IntersectionObserver(function (es) { if (es[0].isIntersecting) { if (!RM) load(); else if (loaded) v.play().catch(function () {}); } else if (loaded) v.pause(); }, { threshold: 0.4 }).observe(v);
    $$(".tr-tabs button").forEach(function (b) {
      b.onclick = function () {
        $$(".tr-tabs button").forEach(function (x) { x.setAttribute("aria-selected", x === b ? "true" : "false"); });
        loaded = true; v.poster = b.dataset.poster; v.src = b.dataset.src; v.play().catch(function () {});
      };
    });
    snd.onclick = function () {
      if (!loaded) load();
      v.muted = !v.muted; snd.setAttribute("aria-pressed", v.muted ? "false" : "true");
      $("span", snd).textContent = v.muted ? "소리 켜기" : "소리 끄기";
      if (!v.muted) { v.currentTime = 0; v.play().catch(function () {}); }
      window.__gabBgm && window.__gabBgm(v.muted);   // 영상 소리를 켜면 BGM 은 잠시 내린다
    };
    v.addEventListener("click", function () { snd.click(); });
  })();

  /* ── 지금 갈리는 판 — 실제 공개 판(정치는 소개 페이지에서 뺀다) ── */
  (function () {
    var row = $("#liveRow");
    var SB = "https://bidqauputnhkqepvdzrr.supabase.co";
    var ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpZHFhdXB1dG5oa3FlcHZkenJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNzg1NDIsImV4cCI6MjA4MDg1NDU0Mn0.D-UGDPuBaNO8v-ror5-SWgUNLRvkOO-yrf2wDVZtyEM";
    var q = "select=id,title,category,faction_a,faction_b,thumbnail_url,card_thumb_url,visibility,moderation_status,status" +
      "&category=not.in.(%22%EC%A0%95%EC%B9%98%C2%B7%EC%82%AC%ED%9A%8C%22)&status=neq.deleted&order=created_at.desc&limit=24";
    fetch(SB + "/rest/v1/issues?" + q, { headers: { apikey: ANON, Authorization: "Bearer " + ANON } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        rows = (rows || []).filter(function (x) {
          return x && x.title && x.faction_a && x.faction_b && (!x.visibility || x.visibility === "public") && !/reject|block|hidden|remov|ban/i.test(x.moderation_status || "");
        }).slice(0, 10);
        if (!rows.length) { $("#live").remove(); return; }
        row.innerHTML = rows.map(function (x) {
          var img = x.card_thumb_url || x.thumbnail_url || "";
          var safe = /^https:\/\//.test(img) ? img.replace(/[()'"\\\s]/g, encodeURIComponent) : "";
          return '<a class="lv-card" href="https://galla.im/issue.html?id=' + (x.id | 0) + '&amp;utm_source=about&amp;utm_medium=live">' +
            '<div class="lv-img"' + (safe ? ' style="background-image:url(' + safe + ')"' : "") + '><span class="lv-cat">' + esc(x.category || "판") + "</span></div>" +
            '<div class="lv-body"><p class="lv-t">' + esc(x.title) + '</p><div class="lv-vs"><span class="r">' + esc(x.faction_a) + '</span><i>VS</i><span class="b">' + esc(x.faction_b) + "</span></div>" +
            '<span class="lv-go">이 판 참전하기 →</span></div></a>';
        }).join("");
      })
      .catch(function () { $("#live") && $("#live").remove(); });
  })();

  /* ── 체험 배틀(동작 예시) ── */
  (function () {
    var Q = [
      { cat: "생활 논쟁", q: "탕수육, 소스는 어떻게?", a: ["부먹", "소스가 배어야 완성이지"], b: ["찍먹", "바삭함은 지켜야지"],
        ca: ["눅눅한 게 아니라 촉촉한 거임", "중국집 사장님도 부어서 주심", "부먹은 소스랑 한 몸이 되는 맛"], cb: ["바삭함 포기는 탕수육 포기", "찍먹은 선택권 존중이다", "부먹은 합의 없이 부으면 전쟁"] },
      { cat: "연애 논쟁", q: "애인 친구의 깻잎, 떼 줘도 된다?", a: ["된다", "그냥 친절일 뿐"], b: ["안 된다", "그건 선 넘은 거지"],
        ca: ["깻잎 한 장에 무슨 의미를", "안 떼주는 게 더 어색함", "젓가락 두 개면 금방인데"], cb: ["손길 닿는 순간 끝", "내 애인 깻잎은 내가 뗀다", "그 친구가 알아서 하게 둬"] },
      { cat: "직장 논쟁", q: "퇴근 후 업무 카톡, 답해야 한다?", a: ["답한다", "급하면 어쩔 수 없지"], b: ["안 한다", "퇴근은 퇴근이다"],
        ca: ["한 줄이면 서로 편함", "안 읽으면 내일 더 피곤", "급한 건 급한 거"], cb: ["읽씹도 권리다", "수당 안 주면 업무 아님", "답하는 순간 루틴 된다"] },
      { cat: "음식 논쟁", q: "민트초코, 음식이다?", a: ["민초단", "상쾌한 디저트"], b: ["반민초", "치약 아니냐"],
        ca: ["한 번 빠지면 못 나옴", "여름엔 민초가 정답", "치약 드립 이제 지겹다"], cb: ["양치하고 초콜릿 먹는 맛", "민트는 껌으로 충분", "초코한테 사과해"] }
    ];
    var qi = 0, box = $("#battle"), feed = $("#btFeed"), timers = [];
    function set(i) {
      var d = Q[i]; timers.forEach(clearTimeout); timers = [];
      box.classList.remove("voted"); $$(".bt-side", box).forEach(function (s) { s.classList.remove("mine"); s.disabled = false; });
      $("#btCat").textContent = d.cat; $("#btQ").textContent = d.q;
      $("#btA").textContent = d.a[0]; $("#btAs").textContent = d.a[1]; $("#btB").textContent = d.b[0]; $("#btBs").textContent = d.b[1];
      bar(50); feed.innerHTML = ""; $("#btDone").hidden = true;
    }
    function bar(rp) {
      $("#btR").style.width = rp + "%"; $("#btBb").style.width = (100 - rp) + "%"; $("#btSpark").style.left = rp + "%";
      $("#btRp").textContent = Math.round(rp) + "%"; $("#btBp").textContent = Math.round(100 - rp) + "%";
    }
    function cm(side, text, delay) {
      timers.push(setTimeout(function () {
        var d = Q[qi], el = document.createElement("div"); el.className = "bt-c " + side;
        el.innerHTML = '<span class="tag">' + esc(side === "r" ? d.a[0] : d.b[0]) + "</span><p>" + esc(text) + "</p>";
        feed.appendChild(el); while (feed.children.length > 4) feed.firstChild.remove();
      }, delay));
    }
    $$(".bt-side", box).forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        if (box.classList.contains("voted")) return;
        var side = btn.dataset.pick, d = Q[qi]; haptic();
        box.classList.add("voted"); btn.classList.add("mine");
        ring(e.clientX, e.clientY, side === "r" ? "#ff4d64" : "#3d7bff");
        // 출렁이며 자리 잡기 — 동작 예시라 실제 수치가 아니다
        var lead = 51 + Math.random() * 9, target = side === "r" ? lead : 100 - lead;   // 내 편이 아슬아슬하게 앞선다
        bar(side === "r" ? 66 : 34);
        timers.push(setTimeout(function () { bar(side === "r" ? 47 : 53); }, 650));
        timers.push(setTimeout(function () { bar(target); }, 1300));
        var my = side === "r" ? d.ca : d.cb, th = side === "r" ? d.cb : d.ca, other = side === "r" ? "b" : "r";
        cm(side, my[0], 500); cm(other, th[0], 1200); cm(side, my[1], 1900); cm(other, th[1], 2600); cm(side, my[2], 3300);
        timers.push(setTimeout(function () { $("#btDone").hidden = false; }, 3700));
      });
    });
    $("#btNext").onclick = function () { qi = (qi + 1) % Q.length; set(qi); };
    set(0);
  })();

  /* ── 게임 모드 ── */
  (function () {
    var M = [
      { k: "issue", ic: "i-flag", c: "#ff5a6e", t: "이슈 배틀", img: "s-home", n: "MODE 01", h: "오늘의 판에서<br>편을 갈라라",
        p: "매일 올라오는 뜨거운 이슈마다 두 진영이 맞붙어요. 영상·사진·요약까지 한 장에 다 들어 있어서 보는 순간 편이 갈려요.",
        li: ["버튼 하나로 진영 선택", "진영 게이지가 실시간으로 출렁", "마감 뒤 이긴 진영에 GP 보상"] },
      { k: "battle", ic: "i-sword", c: "#c04bff", t: "댓글 대전", img: "s-battle", n: "MODE 02", h: "댓글 한 줄이<br>전투력이 된다",
        p: "공격·방어·지원. 내 댓글이 우리 진영의 전투력으로 쌓여요. 상대 진영에 침투하거나 1:1 일기토를 걸 수도 있어요.",
        li: ["공격·방어·지원 액션", "상대 진영 침투", "1:1 일기토 결투"] },
      { k: "predict", ic: "i-target", c: "#3ee6c1", t: "갈라예측", img: "s-predict", n: "MODE 03", h: "맞히는 사람이<br>이긴다",
        p: "주가·경기 결과·화제의 결말까지. 결과를 예측하고 적중하면 GP를 받아요. 연속으로 맞히면 콤보 보너스가 최대 ×2.5까지 붙어요.",
        li: ["매일 새로 열리는 예측", "연속 적중 콤보 최대 ×2.5", "예측왕 시즌 랭킹"], note: "GP는 게임 안에서만 쓰는 포인트예요. 현금으로 바꿀 수 없어요." },
      { k: "trend", ic: "i-flame", c: "#ff8a3d", t: "핫트렌드", img: "s-trend", n: "MODE 04", h: "지금 뜨는 건<br>여기서 다 잡힌다",
        p: "실시간 검색어와 급상승 유튜브, 커뮤니티 화제를 한곳에 모았어요. 어제 모르면 아싸, 오늘 알면 트민남·트민녀.",
        li: ["실시간 급상승 키워드", "지금 터지는 핫튜브", "통합검색 한 번으로 전부"] },
      { k: "plaza", ic: "i-chat", c: "#3d7bff", t: "광장·숏판·롱판", img: "s-search", n: "MODE 05", h: "내 콘텐츠로<br>판을 키워라",
        p: "글·짤·밈은 광장에, 세로 영상은 숏판에, 긴 영상은 롱판에. 내가 올린 콘텐츠에 들어온 후원의 75%는 내 몫이에요.",
        li: ["채널별 광장 게시판", "세로 영상 숏판 · 가로 영상 롱판", "후원 75% 크리에이터 몫"] }
    ];
    var tabs = $("#modeTabs"), txt = $("#modeTxt"), img = $("#modeImg"), ph = $("#modePhone"), stage = $(".mode-stage"), cur = -1;
    tabs.innerHTML = M.map(function (m, i) { return '<button role="tab" aria-selected="false" data-i="' + i + '" style="--mc:' + m.c + '"><svg class="ic"><use href="#' + m.ic + '"/></svg>' + m.t + "</button>"; }).join("");
    function show(i) {
      if (i === cur) return; cur = i; var m = M[i];
      $$("button", tabs).forEach(function (b, k) { b.setAttribute("aria-selected", k === i ? "true" : "false"); });
      stage.style.setProperty("--mc", m.c); txt.style.setProperty("--mc", m.c);
      txt.innerHTML = '<span class="num">' + m.n + "</span><h3>" + m.h + "</h3><p>" + esc(m.p) + "</p><ul>" + m.li.map(function (l) { return "<li>" + esc(l) + "</li>"; }).join("") + "</ul>" + (m.note ? '<p class="note">' + esc(m.note) + "</p>" : "");
      img.src = "/assets/about/" + m.img + ".webp"; img.alt = m.t + " 화면";
      [txt, ph].forEach(function (el) { el.classList.remove("swap"); void el.offsetWidth; el.classList.add("swap"); });
    }
    tabs.addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) { show(+b.dataset.i); auto = false; } });
    var auto = true; show(0);
    setInterval(function () { if (auto && !document.hidden) { var r = stage.getBoundingClientRect(); if (r.top < innerHeight && r.bottom > 0) show((cur + 1) % M.length); } }, 5200);
  })();

  /* ── 다섯 왕좌 ── */
  (function () {
    var K = [["이슈왕", "가장 많은 판을 뒤흔든 사람", "ISSUE"], ["광장왕", "광장을 가장 뜨겁게 달군 사람", "ARENA"], ["숏판왕", "세로 영상으로 판을 쓸어 담은 사람", "SHORT"], ["롱판왕", "긴 영상으로 끝까지 붙잡은 사람", "LONG"], ["예측왕", "가장 많이, 가장 길게 맞힌 사람", "PREDICT"]];
    var crown = '<svg class="crown" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3cf"/><stop offset=".55" stop-color="#e7cd8f"/><stop offset="1" stop-color="#9d7a35"/></linearGradient></defs><path d="M8 24l12 10 12-20 12 20 12-10-5 26H13z" fill="url(#cg)" stroke="#fff6dc" stroke-width="1.5" stroke-linejoin="round"/><rect x="13" y="50" width="38" height="6" rx="2" fill="url(#cg)"/><circle cx="8" cy="22" r="3.2" fill="#fff3cf"/><circle cx="32" cy="12" r="3.6" fill="#fff3cf"/><circle cx="56" cy="22" r="3.2" fill="#fff3cf"/><circle cx="32" cy="40" r="3.4" fill="#ff5a6e"/><circle cx="21" cy="42" r="2.4" fill="#5b87ff"/><circle cx="43" cy="42" r="2.4" fill="#5b87ff"/></svg>';
    $("#thrones").innerHTML = K.map(function (k, i) { return '<div class="throne" data-rv style="--d:' + (i * 0.08) + 's">' + crown.replace('class="crown"', 'class="crown" style="--d:' + (i * 0.4) + 's"').replace(/id="cg"/, 'id="cg' + i + '"').replace(/url\(#cg\)/g, "url(#cg" + i + ")") + "<b>" + k[0] + "</b><span>" + k[1] + "</span><small>KING OF " + k[2] + "</small></div>"; }).join("");
  })();

  /* ── 클래스 — 문장(紋章)은 절차적 SVG ── */
  (function () {
    var C = [
      { code: "HA", n: "돌격 검투사", c: "#ff4d64", d: "가장 먼저 뛰어들어 가장 많이 때린다. 판이 열리면 이미 앞줄에 서 있다.", tags: ["#열혈", "#공격형"], shape: "sword" },
      { code: "HD", n: "열혈 수문장", c: "#ff8a3d", d: "뜨겁지만 지킬 줄 안다. 우리 진영이 밀릴 때 제일 먼저 막아선다.", tags: ["#열혈", "#수비형"], shape: "gate" },
      { code: "CA", n: "냉혈 저격수", c: "#5ee1ff", d: "말은 적게, 한 방은 정확하게. 조용히 지켜보다 결정적인 순간에 쏜다.", tags: ["#냉정", "#공격형"], shape: "scope" },
      { code: "CD", n: "침착한 방패", c: "#7a8bff", d: "흔들리지 않는다. 판이 아무리 뜨거워도 끝까지 자리를 지킨다.", tags: ["#냉정", "#수비형"], shape: "shield" }
    ];
    function emb(s, c) {
      var g = '<svg class="emb" viewBox="0 0 200 140" aria-hidden="true"><defs><radialGradient id="eg' + s + '" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="' + c + '" stop-opacity=".45"/><stop offset="1" stop-color="' + c + '" stop-opacity="0"/></radialGradient></defs><circle cx="100" cy="70" r="66" fill="url(#eg' + s + ')"/>' +
        '<circle cx="100" cy="70" r="46" fill="none" stroke="' + c + '" stroke-opacity=".35" stroke-width="1.5" stroke-dasharray="3 5"/>';
      if (s === "sword") g += '<path d="M100 22l9 14v48h-18V36z" fill="' + c + '"/><path d="M78 86h44v8H78z" fill="#fff"/><path d="M96 94h8v22h-8z" fill="' + c + '"/><circle cx="100" cy="120" r="5" fill="#fff"/>';
      if (s === "gate") g += '<path d="M64 112V58a36 36 0 0 1 72 0v54h-16V60a20 20 0 0 0-40 0v52z" fill="' + c + '"/><path d="M58 112h84v8H58z" fill="#fff"/><path d="M88 74h24v38H88z" fill="none" stroke="#fff" stroke-width="3"/>';
      if (s === "scope") g += '<circle cx="100" cy="70" r="30" fill="none" stroke="' + c + '" stroke-width="6"/><circle cx="100" cy="70" r="8" fill="#fff"/><path d="M100 30v20M100 90v20M60 70h20M120 70h20" stroke="#fff" stroke-width="4" stroke-linecap="round"/>';
      if (s === "shield") g += '<path d="M100 24l38 14v30c0 26-17 42-38 52-21-10-38-26-38-52V38z" fill="' + c + '"/><path d="M100 40l24 9v20c0 16-10 27-24 34z" fill="#fff" fill-opacity=".85"/>';
      return g + "</svg>";
    }
    $("#classGrid").innerHTML = C.map(function (k, i) {
      return '<div class="cls" data-rv style="--cc:' + k.c + ";--d:" + (i * 0.08) + 's">' + emb(k.shape, k.c) + '<span class="code">CLASS ' + k.code + "</span><h3>" + k.n + "</h3><p>" + k.d + '</p><div class="tags">' + k.tags.map(function (t) { return "<i>" + t + "</i>"; }).join("") + "</div></div>";
    }).join("");
  })();

  /* ── 갈비스 대화(동작 예시) ── */
  (function () {
    var body = $("#gvBody"), started = false;
    var S = [
      ["me", "오늘 팀장님이 내 기획안 또 엎었어"],
      ["ai", "헐 또? 그거 너 사흘 밤새서 만든 거잖아. 난 무조건 네 편이야. 뭐가 문제래?"],
      ["me", "그냥 느낌이 별로래 ㅋㅋ"],
      ["ai", "느낌이 별로면 어디가 별로인지는 말해 줘야지! 내일 다시 들고 갈 때 같이 다듬어 볼까?"],
      ["card", "지금 '퇴근 후 업무 카톡, 답해야 한다?' 판 완전 불붙었어", "직장 논쟁 · 지금 뜨는 판"],
      ["me", "ㅋㅋ 당연히 안 한다 쪽이지"],
      ["ai", "역시 내 편! 같이 참전하러 가자. 오늘 저녁엔 맛있는 거 먹고 푹 쉬어 :)"]
    ];
    function play() {
      if (started) return; started = true; var i = 0; body.innerHTML = "";
      (function next() {
        if (i >= S.length) { setTimeout(function () { started = false; play(); }, 6000); return; }
        var s = S[i++];
        var isAi = s[0] !== "me";
        var typing;
        if (isAi) { typing = document.createElement("div"); typing.className = "typing"; typing.innerHTML = "<i></i><i></i><i></i>"; body.appendChild(typing); }
        setTimeout(function () {
          if (typing) typing.remove();
          var m = document.createElement("div");
          if (s[0] === "card") { m.className = "msg ai card-msg"; m.innerHTML = "<b>" + esc(s[1]) + "</b><span>" + esc(s[2]) + "</span>"; }
          else { m.className = "msg " + (isAi ? "ai" : "me"); m.textContent = s[1]; }
          body.appendChild(m);
          while (body.children.length > 7) body.firstChild.remove();
          setTimeout(next, isAi ? 900 : 700);
        }, isAi ? 1100 : 500);
      })();
    }
    if ("IntersectionObserver" in window) new IntersectionObserver(function (es) { if (es[0].isIntersecting) play(); }, { threshold: 0.35 }).observe(body);
    else play();
  })();

  /* ── 갈라톡 ── */
  (function () {
    var I = {
      chat: '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
      group: '<svg viewBox="0 0 24 24"><circle cx="9" cy="9" r="3.2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17" cy="10" r="2.6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 19c.8-3.2 3.2-5 6-5s5.2 1.8 6 5M15 15.5c2.6-.3 4.8 1 5.6 3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
      live: '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
      video: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="13" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 10.5l5-3v9l-5-3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
      voice: '<svg viewBox="0 0 24 24"><path d="M6.6 3.5l2.8 3.3-1.8 2.4a12 12 0 0 0 7.2 7.2l2.4-1.8 3.3 2.8-1.6 3c-8.3.2-15.1-6.6-14.9-14.9z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
      pager: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><rect x="6" y="9" width="9" height="4" rx="1" fill="currentColor"/></svg>'
    };
    var T = [
      ["chat", "#7a8bff", "메신저", "판에서 만난 내 편과 바로 대화. 사진·음성·GIF까지."],
      ["group", "#3ee6c1", "단체방·난장", "같은 편끼리 모이는 단체방, 누구나 들어오는 오픈 난장."],
      ["live", "#ff5a6e", "라이브 난장", "목소리로 붙는 실시간 음성방. 손 들고 무대에 올라와요."],
      ["video", "#c04bff", "면상톡", "얼굴 보고 하는 영상통화."],
      ["voice", "#5ee1ff", "육성톡", "목소리만으로 편하게 음성통화."],
      ["pager", "#78ff8c", "삐삐", "90년대 감성 음성사서함. 호출만 오고, 사서함에 들어가야 들을 수 있어요.", true]
    ];
    $("#talkGrid").innerHTML = T.map(function (t, i) {
      return '<div class="tk' + (t[4] ? " pager" : "") + '" data-rv style="--tc:' + t[1] + ";--d:" + (i * 0.06) + 's"><span class="ti">' + I[t[0]] + "</span><h3>" + t[2] + "</h3><p>" + t[3] + "</p>" + (t[4] ? '<div class="lcd">012-1004-486</div>' : "") + "</div>";
    }).join("");
  })();

  /* ── 크리에이터 숫자 올라가기 ── */
  (function () {
    var d = $(".donut"), b = $("[data-count]", d), done = false;
    function go() {
      if (done) return; done = true; d.classList.add("in");
      var to = +b.dataset.count, s = performance.now();
      (function step(n) { var k = Math.min(1, (n - s) / 1400); b.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); })(s);
    }
    if ("IntersectionObserver" in window) new IntersectionObserver(function (es) { if (es[0].isIntersecting) go(); }, { threshold: 0.4 }).observe(d); else go();
  })();

  /* ── 스크린샷 넘기기 ── */
  (function () {
    var row = $("#shotRow");
    $$("[data-shot]").forEach(function (b) { b.onclick = function () { row.scrollBy({ left: +b.dataset.shot * 260, behavior: "smooth" }); }; });
  })();

  /* ── 배경음악 — 자동재생은 브라우저가 막으니 버튼으로만 켠다. 켜 둔 사람은 다음 방문 첫 터치에 이어서 ── */
  (function () {
    /* 곡 2개(Pixabay Content License): A=Space Adventures(Luis_Humanoide) 전체, B=Space War(The_Mountain) 22초부터.
       들어올 때마다 무작위로 시작하고, 한 곡이 끝나면 다른 곡으로 넘어간다. */
    var btn = $("#bgm"), kvb = $("#kvBgm");
    if (!btn || !kvb) return;
    var LIST = ["/assets/about/bgm-a.m4a", "/assets/about/bgm-b.m4a"], cur = Math.random() < 0.5 ? 0 : 1;
    var a = new Audio(), on = false, fadeT = 0;
    a.preload = "none"; a.volume = 0; a.src = LIST[cur];
    a.addEventListener("ended", function () { cur = 1 - cur; a.src = LIST[cur]; if (on) a.play().catch(function () {}); });
    function fade(to, ms, done) {
      clearInterval(fadeT); var from = a.volume, s = performance.now();
      fadeT = setInterval(function () { var k = Math.min(1, (performance.now() - s) / ms); a.volume = from + (to - from) * k; if (k >= 1) { clearInterval(fadeT); done && done(); } }, 30);
    }
    function set(v, save) {
      on = v; btn.setAttribute("aria-pressed", v ? "true" : "false"); btn.setAttribute("aria-label", v ? "배경음악 끄기" : "배경음악 켜기");
      kvb.classList.toggle("gone", v);
      if (v) { a.play().then(function () { fade(0.55, 1500); }).catch(function () { set(false); }); }
      else fade(0, 500, function () { a.pause(); });
      if (save) try { localStorage.setItem("gab-bgm", v ? "on" : "off"); } catch (_) {}
    }
    window.__gabBgm = function (v) { if (on && !v) fade(0, 400, function () { a.pause(); }); else if (on && v) { a.play().catch(function () {}); fade(0.55, 800); } };
    btn.onclick = function () { set(!on, true); };
    kvb.onclick = function () { set(true, true); };
    var pref = null; try { pref = localStorage.getItem("gab-bgm"); } catch (_) {}
    if (pref === "on" && !RM) {
      var first = function () { removeEventListener("pointerdown", first, true); if (!on) set(true, false); };
      addEventListener("pointerdown", first, true);
    }
    document.addEventListener("visibilitychange", function () { if (!on) return; document.hidden ? a.pause() : a.play().catch(function () {}); });
  })();

  // 동적으로 그린 것까지 포함해 나타나기 연결
  $$("[data-rv]").forEach(watch);
})();
