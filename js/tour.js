/* ============================================================================
   🎪 갈라 첫 진입 오리엔테이션 — "별거 없네"를 부수는 병맛 캐러셀
   ----------------------------------------------------------------------------
   목표: 초대로 들어온 사람이 10초 안에 "어 뭐야 이거 재밌네?" 하게 만든다.
   원칙:
     - 설명 대신 '체감'. 살아 움직이는 진영바·동전비·삐삐 진동으로 보여준다.
     - DM(메신저)이 진짜 무기 → 마이크·카메라 권한의 명분으로 앞세운다.
     - 성질 급한 사람은 언제든 [건너뛰기]. 대신 그 전에 웃겨서 못 나가게.
     - 최초 1회(localStorage galla_tour_v2). top 문서에서만(셸 iframe 중복 방지).
     - 웹/네이티브 앱 카피 분기. 외부 의존 없이 CSS 자가 주입.
   ========================================================================== */
(function () {
  var KEY = "galla_tour_v2";
  var PROJ = "bidqauputnhkqepvdzrr";

  function loggedIn() { try { return !!localStorage.getItem("sb-" + PROJ + "-auth-token"); } catch (e) { return false; } }
  // 🎁 +500 GP는 이제 '가입 웰컴'으로 서버 자동 지급(supabase.js claim_welcome_bonus) — 투어는 안내만.

  // 셸 iframe 안(자식)에서는 투어 표시 안 함 — top 문서(app-shell/직접 index)만
  try { if (window.self !== window.top) return; } catch (e) { return; }
  try { if (localStorage.getItem(KEY)) return; } catch (e) { return; }

  var NATIVE = false;
  try { NATIVE = !!(window.Capacitor && (window.Capacitor.isNativePlatform ? window.Capacitor.isNativePlatform() : window.Capacitor.isNative)); } catch (e) {}
  var reduce = false;
  try { reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

  /* ── 슬라이드 정의 ─────────────────────────────────────────────────────── */
  var SLIDES = [
    {
      bg: "radial-gradient(120% 90% at 50% 8%, #3a1030, #14060f 62%, #0a0409)",
      kicker: "⚠️ 경고 · 중립 금지 구역",
      title: "여기선 '그냥 구경'이 안 됩니다",
      sub: "세상 모든 떡밥에 편을 갈라 <b>싸우는</b> 곳.<br>회색분자는 문 앞에서 돌려보내요 😈",
      art: artFight
    },
    {
      bg: "radial-gradient(120% 90% at 50% 8%, #10233a, #060e18 62%, #05080d)",
      kicker: "룰 #1",
      title: "편을 골라야 입장",
      sub: "👍 찬성이냐 👎 반대냐, 딱 하나만 고르면 끝.<br>당신이 누른 순간 <b>진영바가 요동칩니다.</b>",
      art: artVoteBar
    },
    {
      bg: "radial-gradient(120% 90% at 50% 8%, #2a2306, #140f04 62%, #0a0803)",
      kicker: "말로만 싸우기? 노잼",
      title: "결과를 예측하고 적중시켜라 🎯",
      sub: "누가 이길지 맞히면 <b>대박 보너스</b>.<br>연승 이어가면 🔥 <b>리턴 ×5</b> 🔥",
      art: artPredict
    },
    {
      bg: "radial-gradient(120% 90% at 50% 8%, #06281f, #04140f 62%, #030a08)",
      kicker: "★ 이게 진짜 무기 ★",
      title: "카톡 대신, 여기서 다 해요",
      sub: "1:1 · 난장 오픈챗 · <b>음성·영상통화</b> · 그리고 삐삐📟<br><small>90년대 삐삐 쳐본 적 있어요? 없으면 지금 쳐보세요.</small>",
      art: artMessenger
    },
    {
      bg: "radial-gradient(120% 90% at 50% 8%, #06263a, #041019 62%, #030a10)",
      kicker: "떠들고 싶을 땐",
      title: "광장 — 아무말 대잔치 🗣️",
      sub: "짤·밈·드립 다 받아줌.<br>레딧처럼 글 쓰고, 댓글로 <b>전투</b>하고, 유령으로 뒷담화 😎",
      art: artPlaza
    },
    {
      bg: "radial-gradient(120% 90% at 50% 8%, #0a2036, #05121e 62%, #030a12)",
      kicker: "뉴스 볼 시간 없지?",
      title: "갈라뉴스 — AI가 씹어서 떠먹여줌 🥄",
      sub: "여러 언론 기사를 AI가 <b>싹 종합</b>해 3줄 요약.<br>편파보도 걸러내고, 남들 헤드라인 볼 때 넌 이미 다 앎 🧠",
      art: artNews
    },
    {
      bg: "radial-gradient(120% 90% at 50% 8%, #1e0c33, #0e0518 62%, #08040e)",
      kicker: "이런 것도 됩니다",
      title: "유령 변신 · AI 이모티콘 · 성향 까발리기",
      sub: "익명 <b>유령</b>으로 뒷담화, 나만의 <b>AI 스티커</b>,<br>당신의 '정치 DNA' 4축 분석 😳",
      art: artFun
    },
    {
      bg: "radial-gradient(120% 90% at 50% 8%, #123a10, #08210a 60%, #041206)",
      kicker: "★ 진짜 핵심 ★",
      title: "유튜브처럼, 크리에이터가 되세요",
      sub: "이슈를 터뜨리고 팬을 모으는 <b>크리에이터 활동</b>.<br>구경만 하지 말고 판을 만드는 사람이 되세요.<br><small>크리에이터·리워드 자세한 안내는 따로 준비 중이에요.</small>",
      art: artCreator
    },
    {
      bg: "radial-gradient(120% 90% at 50% 8%, #0b1c3a, #050c19 62%, #04070d)",
      kicker: "마지막 세팅 · 딱 한 번",
      title: "목소리로 싸우고, 영상으로 통화하려면",
      sub: NATIVE
        ? "DM 음성·영상통화엔 🎙마이크·📷카메라,<br>새 소식엔 🔔알림. <b>한 번만 허용하면 평생 끝!</b>"
        : "DM 음성·영상통화엔 🎙마이크·📷카메라,<br>놓치기 싫은 소식엔 🔔알림이 필요해요.",
      art: artPerms,
      perms: true
    },
    {
      bg: "radial-gradient(120% 90% at 50% 8%, #3a1010, #180707 62%, #0b0404)",
      kicker: "준비 끝",
      title: "자, 이제 시작해볼까요",
      sub: "가입하면 <b>+500 GP</b>가 지갑에 쏙 🎁<br>편 고르고, 예측하고, 갈라톡으로 떠들어봐요.",
      art: artFlag,
      cta: true
    }
  ];

  var idx = 0;

  /* ── 부팅: 스플래시/첫 페인트 후 살짝 지연해서 등장 ──────────────────────── */
  function boot() {
    injectCSS();
    var ov = document.createElement("div");
    ov.className = "gtour";
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-label", "갈라 오리엔테이션");
    ov.innerHTML =
      '<div class="gt-bg"></div>' +
      '<div class="gt-reward">🎁 가입하면 <b>+500 GP</b></div>' +
      '<button class="gt-mute" type="button" aria-label="소리">' + (_muted ? "🔇" : "🔊") + "</button>" +
      '<button class="gt-skip" type="button">건너뛰기 ✕</button>' +
      '<div class="gt-stage"><div class="gt-track"></div></div>' +
      '<div class="gt-foot">' +
        '<div class="gt-dots"></div>' +
        '<button class="gt-next" type="button">다음</button>' +
      '</div>' +
      '<div class="gt-spark"></div>';
    document.body.appendChild(ov);

    var track = ov.querySelector(".gt-track");
    var dotsWrap = ov.querySelector(".gt-dots");
    SLIDES.forEach(function (s, i) {
      var el = document.createElement("div");
      el.className = "gt-slide";
      el.innerHTML =
        '<div class="gt-artbox">' + s.art() + "</div>" +
        '<div class="gt-kicker">' + s.kicker + "</div>" +
        '<h2 class="gt-title">' + s.title + "</h2>" +
        '<p class="gt-sub">' + s.sub + "</p>" +
        (s.perms ? permButtonsHTML() : "") +
        (s.cta ? '<button class="gt-cta" type="button">🎁 +500 GP 받고 시작하기</button>' : "");
      track.appendChild(el);
      var d = document.createElement("i");
      d.className = "gt-dot" + (i === 0 ? " on" : "");
      dotsWrap.appendChild(d);
    });

    requestAnimationFrame(function () { ov.classList.add("show"); go(0, true); });
    burst(ov);   // 등장 폭죽
    haptic("heavy");   // 등장 임팩트(네이티브는 제스처 없이도 진동)

    /* 조작 */
    ov.querySelector(".gt-mute").onclick = function () { setMuted(!_muted); };
    ov.querySelector(".gt-skip").onclick = function () { finish(false); };
    ov.querySelector(".gt-next").onclick = function () {
      startMusic();
      if (idx >= SLIDES.length - 1) return finish(true);
      go(idx + 1);
    };
    ov.addEventListener("click", function (e) {
      startMusic();   // 첫 제스처에서 BGM 활성(자동재생 제약 우회)
      if (e.target.closest(".gt-mute")) return;
      if (e.target.closest(".gt-cta")) return finish(true);
      bindPerm(e, ov);
    });

    /* 스와이프 */
    var sx = 0, sy = 0, dragging = false;
    var stage = ov.querySelector(".gt-stage");
    stage.addEventListener("touchstart", function (e) {
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; dragging = true;
    }, { passive: true });
    stage.addEventListener("touchend", function (e) {
      if (!dragging) return; dragging = false;
      startMusic();
      var dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) < 44 || Math.abs(dx) < Math.abs(dy)) return;
      if (dx < 0) { if (idx < SLIDES.length - 1) go(idx + 1); }
      else { if (idx > 0) go(idx - 1); }
    }, { passive: true });

    /* 키보드(데스크톱) */
    ov._key = function (e) {
      if (e.key === "ArrowRight") { if (idx < SLIDES.length - 1) go(idx + 1); }
      else if (e.key === "ArrowLeft") { if (idx > 0) go(idx - 1); }
      else if (e.key === "Escape") finish();
    };
    document.addEventListener("keydown", ov._key);

    window.__gtour = ov;
  }

  function go(i, silent) {
    var ov = window.__gtour || document.querySelector(".gtour");
    if (!ov) return;
    idx = i;
    var track = ov.querySelector(".gt-track");
    track.style.transform = "translateX(" + (-i * 100) + "%)";
    ov.querySelector(".gt-bg").style.background = SLIDES[i].bg;
    ov.querySelectorAll(".gt-dot").forEach(function (d, k) { d.classList.toggle("on", k === i); });
    var last = i >= SLIDES.length - 1;
    var nextBtn = ov.querySelector(".gt-next");
    nextBtn.style.visibility = last ? "hidden" : "visible";
    var rw = ov.querySelector(".gt-reward"); if (rw) rw.classList.toggle("hide", last);
    // 슬라이드별 아트 애니메이션 리트리거
    var slide = ov.querySelectorAll(".gt-slide")[i];
    slide.classList.remove("live"); void slide.offsetWidth; slide.classList.add("live");
    if (!silent) { haptic(SLIDES[i].cta ? "boom" : "medium"); sfx(SLIDES[i].cta ? "win" : "woosh"); }
  }

  function finish(completed) {
    var ov = window.__gtour || document.querySelector(".gtour");
    try { localStorage.setItem(KEY, "1"); } catch (e) {}
    // 기존 "편 고르기" 온보딩과 겹치지 않게 — 이 투어가 첫경험을 대신한다
    try { localStorage.setItem("galla_onboarded", "1"); } catch (e) {}

    var goSignup = false;
    if (completed) {
      haptic("boom"); sfx("win");
      // 미로그인 완주 → 가입 유도. +500 GP는 가입 후 첫 로그인에서 supabase.js가 서버 지급(웰컴).
      if (!loggedIn()) goSignup = true;
    }

    stopMusic();
    var done = function () {
      window.__gtour = null;
      if (goSignup) { try { location.href = "signup.html"; } catch (e) {} }
    };
    if (!ov) return void done();
    if (ov._key) document.removeEventListener("keydown", ov._key);
    ov.classList.remove("show");
    setTimeout(function () { ov.remove(); done(); }, 340);
  }

  /* ── 권한 프라이밍 ───────────────────────────────────────────────────────── */
  function permButtonsHTML() {
    return (
      '<div class="gt-perms">' +
        '<button class="gt-perm" data-perm="notif" type="button"><span class="gt-pi">🔔</span><span class="gt-pt">알림 켜기</span><span class="gt-pc">›</span></button>' +
        '<button class="gt-perm" data-perm="media" type="button"><span class="gt-pi">🎙</span><span class="gt-pt">마이크·카메라 켜기</span><span class="gt-pc">›</span></button>' +
        '<div class="gt-permnote">' + (NATIVE ? "허용하면 통화·삐삐를 바로 쓸 수 있어요." : "지금 켜두면 통화할 때 안 끊겨요.") + "</div>" +
      "</div>"
    );
  }

  function bindPerm(e, ov) {
    var btn = e.target.closest(".gt-perm");
    if (!btn || btn.classList.contains("done") || btn.classList.contains("busy")) return;
    var kind = btn.dataset.perm;
    btn.classList.add("busy");
    var label = btn.querySelector(".gt-pt");
    var old = label.textContent;
    label.textContent = "요청 중…";

    var doneOk = function (ok, txt) {
      btn.classList.remove("busy");
      btn.classList.add(ok ? "done" : "fail");
      btn.querySelector(".gt-pi").textContent = ok ? "✅" : "🙈";
      label.textContent = txt || (ok ? "허용됨" : old);
      btn.querySelector(".gt-pc").textContent = ok ? "" : "다시";
      if (ok) { haptic("success"); sfx("coin"); }
    };

    if (kind === "notif") {
      requestNotif().then(function (r) {
        doneOk(r === "granted", r === "granted" ? "알림 켜짐" : (r === "denied" ? "나중에 · 설정에서" : old));
      });
    } else {
      requestMedia().then(function (ok) {
        doneOk(ok, ok ? "마이크·카메라 준비 완료" : "통화 켤 때 다시 물어볼게요");
      });
    }
  }

  function requestNotif() {
    try {
      if (typeof window.GALLA_pushEnable === "function") {
        return Promise.resolve(window.GALLA_pushEnable()).then(function () {
          try { return (window.Notification && Notification.permission) || "granted"; } catch (e) { return "granted"; }
        }).catch(function () { return "default"; });
      }
      if (window.Notification && Notification.requestPermission) {
        var p = Notification.requestPermission();
        return (p && p.then) ? p : Promise.resolve(p);
      }
    } catch (e) {}
    return Promise.resolve("default");
  }

  function requestMedia() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.resolve(false);
    // 영상통화 명분 → 오디오+비디오 함께. 실패하면 오디오만이라도.
    var stop = function (s) { try { s.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} };
    return navigator.mediaDevices.getUserMedia({ audio: true, video: true })
      .then(function (s) { stop(s); return true; })
      .catch(function () {
        return navigator.mediaDevices.getUserMedia({ audio: true })
          .then(function (s) { stop(s); return true; })
          .catch(function () { return false; });
      });
  }

  /* ── 햅틱: 네이티브 Capacitor(top 문서에 브리지 있음) 직접 호출, 없으면 vibrate ── */
  var _hap = null, _hapTried = false;
  function hapPlugin() {
    if (_hapTried) return _hap;
    _hapTried = true;
    try { var C = window.Capacitor || (window.top && window.top.Capacitor); if (C && C.registerPlugin) _hap = C.registerPlugin("Haptics"); } catch (e) {}
    return _hap;
  }
  function haptic(kind) {
    var h = hapPlugin();
    try {
      if (h) {
        if (kind === "heavy") h.impact({ style: "HEAVY" });
        else if (kind === "success") h.notification({ type: "SUCCESS" });
        else if (kind === "boom") { h.impact({ style: "HEAVY" }); setTimeout(function () { h.impact({ style: "HEAVY" }); }, 70); setTimeout(function () { h.notification({ type: "SUCCESS" }); }, 150); }
        else if (kind === "medium") h.impact({ style: "MEDIUM" });
        else h.impact({ style: "LIGHT" });
        return;
      }
    } catch (e) {}
    try {
      if (navigator.vibrate) {
        if (kind === "heavy") navigator.vibrate([35, 25, 55]);
        else if (kind === "success") navigator.vibrate([25, 20, 25, 20, 45]);
        else if (kind === "boom") navigator.vibrate([50, 30, 60, 30, 90]);
        else if (kind === "medium") navigator.vibrate(22);
        else navigator.vibrate(12);
      }
    } catch (e) {}
  }

  /* ── 효과음: Web Audio 합성(음원 파일 불필요). 첫 탭 제스처에서 컨텍스트 활성 ── */
  var _ac = null, _muted = false;
  try { _muted = localStorage.getItem("galla_tour_muted") === "1"; } catch (e) {}
  function ac() {
    if (_muted) return null;
    try { if (!_ac) _ac = new (window.AudioContext || window.webkitAudioContext)(); if (_ac.state === "suspended") _ac.resume(); } catch (e) { _ac = null; }
    return _ac;
  }
  function tone(freq, t0, dur, type, gain, track) {
    var c = ac(); if (!c) return null;
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || "sine"; o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain || 0.14, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0 + dur + 0.02);
    // BGM 음표는 추적 배열에 담아 stopMusic이 예약분까지 즉시 끊을 수 있게
    if (track) { track.push(o); o.onended = function () { var i = track.indexOf(o); if (i >= 0) track.splice(i, 1); }; }
    return o;
  }
  function sfx(kind) {
    var c = ac(); if (!c) return;
    var t = c.currentTime;
    if (kind === "woosh") { // 슬라이드 전환 — 상승 블립
      var o = c.createOscillator(), g = c.createGain();
      o.type = "triangle"; o.frequency.setValueAtTime(320, t); o.frequency.exponentialRampToValueAtTime(760, t + 0.16);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.1, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.24);
    } else if (kind === "coin") { tone(880, t, 0.09, "square", 0.09); tone(1320, t + 0.06, 0.12, "square", 0.08); }
    else if (kind === "win") { // 팡파레 — 상행 아르페지오
      [523, 659, 784, 1047].forEach(function (f, i) { tone(f, t + i * 0.09, 0.28, "triangle", 0.13); });
      tone(1568, t + 0.42, 0.5, "triangle", 0.1);
    } else if (kind === "pop") { tone(660, t, 0.08, "sine", 0.1); }
  }
  /* ── 8비트 칩튠 BGM(방구차·아케이드 감성) — 합성 루프. 첫 제스처에서 시작 ── */
  var STEP = 0.15;   // 8분음표 길이(초) ≈ 경쾌한 템포
  // C장조 펜타토닉 훅(16스텝) — 어떤 조합도 안 튀게
  var LEAD = [523.25, 784, 659.25, 1046.5, 880, 784, 659.25, 587.33,
              523.25, 659.25, 784, 880, 1046.5, 880, 784, 659.25];
  var BASS = [130.81, 130.81, 196.00, 196.00, 174.61, 174.61, 196.00, 196.00]; // 2스텝당 1
  var _music = { on: false, timer: null, next: 0, nodes: [] };
  function scheduleBar(startT) {
    for (var i = 0; i < 16; i++) {
      var t = startT + i * STEP;
      if (LEAD[i]) tone(LEAD[i], t, STEP * 0.86, "square", 0.05, _music.nodes);
      if (i % 2 === 0) { var b = BASS[i / 2]; if (b) tone(b, t, STEP * 1.7, "triangle", 0.085, _music.nodes); }
    }
    return startT + 16 * STEP;
  }
  function startMusic() {
    var c = ac(); if (!c || _music.on) return;
    _music.on = true;
    _music.next = scheduleBar(c.currentTime + 0.1);
    _music.timer = setInterval(function () {
      var cc = ac(); if (!cc || !_music.on) return;
      if (_music.next < cc.currentTime + 0.5) _music.next = scheduleBar(_music.next);
    }, 120);
  }
  function stopMusic() {
    _music.on = false;
    if (_music.timer) { clearInterval(_music.timer); _music.timer = null; }
    // 이미 오디오에 예약된 음표까지 즉시 정지(안 그러면 완주 후에도 한 마디 더 남음)
    _music.nodes.slice().forEach(function (o) { try { o.stop(0); } catch (e) {} try { o.disconnect(); } catch (e) {} });
    _music.nodes = [];
  }

  function setMuted(m) {
    _muted = m; try { localStorage.setItem("galla_tour_muted", m ? "1" : "0"); } catch (e) {}
    var b = document.querySelector(".gt-mute"); if (b) b.textContent = m ? "🔇" : "🔊";
    if (m) { stopMusic(); if (_ac) { try { _ac.suspend(); } catch (e) {} } }
    else { startMusic(); }
  }

  /* 등장 폭죽 — SVG 조각(이모지 파티클 금지 톤 준수) */
  function burst(ov) {
    if (reduce) return;
    var host = ov.querySelector(".gt-spark");
    var cols = ["#ff4d67", "#3d6bff", "#ffd166", "#33d17a", "#b56bff"];
    for (var i = 0; i < 18; i++) {
      var p = document.createElement("i");
      var a = (Math.random() * 360), d = 60 + Math.random() * 120;
      p.style.cssText =
        "--tx:" + (Math.cos(a * Math.PI / 180) * d).toFixed(0) + "px;" +
        "--ty:" + (Math.sin(a * Math.PI / 180) * d).toFixed(0) + "px;" +
        "background:" + cols[i % cols.length] + ";animation-delay:" + (Math.random() * .12).toFixed(2) + "s";
      host.appendChild(p);
    }
    setTimeout(function () { host.innerHTML = ""; }, 1400);
  }

  /* ── 아트(인라인 SVG, CSS로 살아 움직임) ───────────────────────────────── */
  function artFight() {
    return '<svg class="gt-art" viewBox="0 0 260 170" aria-hidden="true">' +
      '<g class="gt-fl">' +
        '<circle cx="66" cy="88" r="44" fill="#3d6bff"/>' +
        '<circle cx="52" cy="80" r="7" fill="#fff"/><circle cx="82" cy="80" r="7" fill="#fff"/>' +
        '<circle cx="54" cy="82" r="3.2" fill="#0b0d16"/><circle cx="84" cy="82" r="3.2" fill="#0b0d16"/>' +
        '<path d="M44 68 l18 6" stroke="#0b0d16" stroke-width="5" stroke-linecap="round"/>' +
        '<path d="M92 68 l-6 3" stroke="#0b0d16" stroke-width="5" stroke-linecap="round"/>' +
        '<path d="M52 104 q14 10 30 0" stroke="#0b0d16" stroke-width="4" fill="none" stroke-linecap="round"/>' +
      "</g>" +
      '<g class="gt-fr">' +
        '<circle cx="194" cy="88" r="44" fill="#ff4d67"/>' +
        '<circle cx="178" cy="80" r="7" fill="#fff"/><circle cx="208" cy="80" r="7" fill="#fff"/>' +
        '<circle cx="176" cy="82" r="3.2" fill="#0b0d16"/><circle cx="206" cy="82" r="3.2" fill="#0b0d16"/>' +
        '<path d="M168 71 l6 3" stroke="#0b0d16" stroke-width="5" stroke-linecap="round"/>' +
        '<path d="M216 68 l-18 6" stroke="#0b0d16" stroke-width="5" stroke-linecap="round"/>' +
        '<path d="M178 104 q14 10 30 0" stroke="#0b0d16" stroke-width="4" fill="none" stroke-linecap="round"/>' +
      "</g>" +
      '<g class="gt-vs">' +
        '<path d="M130 34 l-13 40 h10 l-4 26 22 -46 h-11 z" fill="#ffd166" stroke="#0b0d16" stroke-width="2"/>' +
      "</g>" +
      "</svg>";
  }
  function artVoteBar() {
    return '<svg class="gt-art gt-vbart" viewBox="0 0 260 150" aria-hidden="true">' +
      '<rect x="20" y="60" width="220" height="34" rx="17" fill="#1a1d27" stroke="rgba(255,255,255,.1)"/>' +
      '<clipPath id="gtvb"><rect x="20" y="60" width="220" height="34" rx="17"/></clipPath>' +
      '<g clip-path="url(#gtvb)">' +
        '<rect class="gt-vfp" x="20" y="60" width="150" height="34" fill="#3d6bff"/>' +
        '<rect class="gt-vfc" x="170" y="60" width="70" height="34" fill="#ff4d67"/>' +
      "</g>" +
      '<circle class="gt-needle" cx="170" cy="77" r="9" fill="#fff" stroke="#0b0d16" stroke-width="2"/>' +
      '<text x="46" y="82" fill="#fff" font-size="15" font-weight="900">👍</text>' +
      '<text x="206" y="82" fill="#fff" font-size="15" font-weight="900">👎</text>' +
      '<text class="gt-vpop" x="120" y="34" fill="#ffd166" font-size="20" font-weight="900" text-anchor="middle">+1 참전!</text>' +
      "</svg>";
  }
  function artPredict() {
    var coins = "";
    for (var i = 0; i < 9; i++) {
      coins += '<text class="gt-coin" style="--i:' + i + ';--x:' + (24 + i * 26) + '" x="' + (24 + i * 26) + '" y="0" font-size="18">🪙</text>';
    }
    // 슬롯머신(사행성 이미지) 대신 과녁+명중 다트 — '예측 적중' 컨셉
    return '<svg class="gt-art" viewBox="0 0 260 160" aria-hidden="true">' +
      '<g transform="translate(0,20)">' + coins + "</g>" +
      '<g class="gt-target">' +
        '<circle cx="130" cy="98" r="46" fill="none" stroke="#3a4050" stroke-width="10"/>' +
        '<circle cx="130" cy="98" r="32" fill="none" stroke="#5a6270" stroke-width="10"/>' +
        '<circle cx="130" cy="98" r="18" fill="#ff4d67"/>' +
        '<circle cx="130" cy="98" r="6" fill="#fff"/>' +
      "</g>" +
      '<text class="gt-dart" x="150" y="86" font-size="30">🎯</text>' +
      '<text class="gt-hit" x="130" y="42" fill="#ffd166" font-size="16" font-weight="900" text-anchor="middle">적중!</text>' +
      "</svg>";
  }
  function artMessenger() {
    return '<svg class="gt-art" viewBox="0 0 260 170" aria-hidden="true">' +
      '<rect class="gt-phone" x="86" y="20" width="88" height="140" rx="16" fill="#141824" stroke="rgba(255,255,255,.14)" stroke-width="2"/>' +
      '<rect x="98" y="40" width="64" height="20" rx="10" fill="#2b6bff"/>' +
      '<rect x="98" y="66" width="46" height="16" rx="8" fill="#242938"/>' +
      '<rect x="116" y="88" width="46" height="16" rx="8" fill="#2b6bff" opacity=".8"/>' +
      '<rect x="98" y="110" width="40" height="16" rx="8" fill="#242938"/>' +
      '<g class="gt-pager"><rect x="150" y="112" width="70" height="42" rx="7" fill="#1c3b2a" stroke="#33d17a" stroke-width="2"/>' +
        '<rect x="157" y="120" width="56" height="17" rx="3" fill="#0a1f14"/>' +
        '<text x="185" y="133" fill="#7bffb0" font-size="11" font-weight="900" text-anchor="middle" font-family="monospace">8282</text>' +
        '<circle cx="185" cy="148" r="2.4" fill="#33d17a"/></g>' +
      '<g class="gt-call"><circle cx="52" cy="52" r="20" fill="#33d17a"/><text x="52" y="59" font-size="18" text-anchor="middle">📞</text></g>' +
      '<g class="gt-cam"><circle cx="52" cy="112" r="20" fill="#ff4d67"/><text x="52" y="119" font-size="17" text-anchor="middle">📷</text></g>' +
      "</svg>";
  }
  function artPlaza() {
    return '<svg class="gt-art" viewBox="0 0 260 160" aria-hidden="true">' +
      '<g class="gt-bub1"><rect x="24" y="30" width="118" height="46" rx="14" fill="#2b6bff"/>' +
        '<path d="M44 76 l-6 16 22 -16 z" fill="#2b6bff"/>' +
        '<text x="40" y="59" font-size="17" fill="#fff" font-weight="900">아 ㅋㅋㅋ 인정</text></g>' +
      '<g class="gt-bub2"><rect x="120" y="70" width="120" height="44" rx="14" fill="#ff4d67"/>' +
        '<path d="M214 114 l8 16 -24 -16 z" fill="#ff4d67"/>' +
        '<text x="136" y="98" font-size="16" fill="#fff" font-weight="900">그건 좀 아니지 😤</text></g>' +
      '<g class="gt-bub3"><rect x="60" y="112" width="96" height="38" rx="13" fill="#242938" stroke="rgba(255,255,255,.14)"/>' +
        '<text x="76" y="137" font-size="17" fill="#e9edff" font-weight="800">🤡 짤 투척</text></g>' +
      "</svg>";
  }
  function artNews() {
    return '<svg class="gt-art" viewBox="0 0 260 160" aria-hidden="true">' +
      '<g class="gt-paper"><rect x="66" y="26" width="128" height="112" rx="8" fill="#f4f1e8" stroke="#c9c3b2" stroke-width="2"/>' +
        '<rect x="78" y="38" width="104" height="16" rx="3" fill="#141824"/>' +
        '<rect x="78" y="62" width="58" height="44" rx="4" fill="#b9c3d6"/>' +
        '<rect x="142" y="62" width="40" height="6" rx="3" fill="#8a8f9a"/>' +
        '<rect x="142" y="74" width="40" height="6" rx="3" fill="#adb2bd"/>' +
        '<rect x="142" y="86" width="40" height="6" rx="3" fill="#adb2bd"/>' +
        '<rect x="78" y="114" width="104" height="6" rx="3" fill="#adb2bd"/>' +
        '<rect x="78" y="126" width="72" height="6" rx="3" fill="#c3c7cf"/></g>' +
      '<g class="gt-airobot"><circle cx="210" cy="60" r="26" fill="#33d17a"/>' +
        '<text x="210" y="69" font-size="24" text-anchor="middle">🤖</text>' +
        '<text x="210" y="98" font-size="11" fill="#7ef0ae" font-weight="900" text-anchor="middle">3줄 요약</text></g>' +
      "</svg>";
  }
  function artCreator() {
    return '<svg class="gt-art" viewBox="0 0 260 168" aria-hidden="true">' +
      '<g class="gt-rise"><polyline points="34,138 84,104 124,116 210,52" fill="none" stroke="#33d17a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="M210 52 l-17 1 8 15 z" fill="#33d17a"/></g>' +
      '<g class="gt-star2"><circle cx="70" cy="82" r="30" fill="#ffd166"/>' +
        '<text x="70" y="92" font-size="28" text-anchor="middle">🤩</text>' +
        '<text x="70" y="52" font-size="20" text-anchor="middle">👑</text></g>' +
      '<g class="gt-wallet"><rect x="150" y="98" width="80" height="56" rx="12" fill="#101a12" stroke="#ffd166" stroke-width="2"/>' +
        '<text x="190" y="134" font-size="22" text-anchor="middle">💰</text></g>' +
      '<text class="gt-c2 gt-c2a" x="118" y="92" font-size="18">🪙</text>' +
      '<text class="gt-c2 gt-c2b" x="146" y="84" font-size="15">🪙</text>' +
      '<text class="gt-c2 gt-c2c" x="132" y="74" font-size="17">🪙</text>' +
      "</svg>";
  }
  function artFun() {
    return '<svg class="gt-art" viewBox="0 0 260 160" aria-hidden="true">' +
      '<g class="gt-ghost"><path d="M60 40 a34 34 0 0 1 68 0 v52 l-11 -9 -11 9 -12 -9 -11 9 -11 -9 z" fill="#e9edff" opacity=".92"/>' +
        '<circle cx="80" cy="66" r="5" fill="#0b0d16"/><circle cx="108" cy="66" r="5" fill="#0b0d16"/>' +
        '<ellipse cx="94" cy="80" rx="7" ry="5" fill="#ff9ab0"/></g>' +
      '<g class="gt-sticker"><circle cx="176" cy="58" r="30" fill="#ffd166"/>' +
        '<circle cx="167" cy="52" r="4" fill="#0b0d16"/><circle cx="185" cy="52" r="4" fill="#0b0d16"/>' +
        '<path d="M164 66 q12 12 24 0" stroke="#0b0d16" stroke-width="3.5" fill="none" stroke-linecap="round"/>' +
        '<text x="205" y="40" font-size="15">🤖</text></g>' +
      '<g class="gt-dna"><rect x="150" y="98" width="86" height="46" rx="10" fill="#141824" stroke="#b56bff" stroke-width="2"/>' +
        '<text x="193" y="120" fill="#d9c6ff" font-size="11" font-weight="900" text-anchor="middle">정치 DNA</text>' +
        '<text x="193" y="135" fill="#8a6bff" font-size="10" text-anchor="middle">4축 분석</text></g>' +
      "</svg>";
  }
  function artPerms() {
    return '<svg class="gt-art" viewBox="0 0 260 150" aria-hidden="true">' +
      '<g class="gt-p1"><circle cx="66" cy="75" r="34" fill="#2b6bff"/><text x="66" y="86" font-size="30" text-anchor="middle">🎙</text></g>' +
      '<g class="gt-p2"><circle cx="130" cy="75" r="34" fill="#ff4d67"/><text x="130" y="86" font-size="28" text-anchor="middle">📷</text></g>' +
      '<g class="gt-p3"><circle cx="194" cy="75" r="34" fill="#ffb020"/><text x="194" y="86" font-size="28" text-anchor="middle">🔔</text></g>' +
      "</svg>";
  }
  function artFlag() {
    return '<svg class="gt-art" viewBox="0 0 260 170" aria-hidden="true">' +
      '<line x1="120" y1="30" x2="120" y2="150" stroke="#8a8f9a" stroke-width="6" stroke-linecap="round"/>' +
      '<g class="gt-flag"><path d="M123 34 h96 l-18 20 18 20 h-96 z" fill="#ff4d67" stroke="#0b0d16" stroke-width="2"/>' +
        '<text x="160" y="62" font-size="22">⚔️</text></g>' +
      '<circle cx="120" cy="150" r="16" fill="#3d6bff"/>' +
      "</svg>";
  }

  /* ── CSS ───────────────────────────────────────────────────────────────── */
  function injectCSS() {
    if (document.getElementById("gtour-css")) return;
    var s = document.createElement("style");
    s.id = "gtour-css";
    s.textContent = [
      ".gtour{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;",
        "font-family:'Pretendard',system-ui,-apple-system,BlinkMacSystemFont,sans-serif;",
        "opacity:0;transition:opacity .34s ease;overflow:hidden;color:#fff;",
        "padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);",
        "-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}",
      ".gtour.show{opacity:1}",
      ".gt-bg{position:absolute;inset:0;background:#0a0409;transition:background .5s ease;z-index:0}",
      ".gt-bg::after{content:'';position:absolute;inset:0;background:radial-gradient(80% 40% at 50% 100%,rgba(0,0,0,.5),transparent);}",
      ".gt-skip{position:absolute;top:calc(12px + env(safe-area-inset-top,0px));right:14px;z-index:5;",
        "background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.14);color:#dfe3ec;",
        "font-size:12.5px;font-weight:800;padding:8px 13px;border-radius:999px;cursor:pointer;backdrop-filter:blur(6px)}",
      ".gt-skip:active{transform:scale(.94)}",
      ".gt-mute{position:absolute;top:calc(12px + env(safe-area-inset-top,0px));right:96px;z-index:5;",
        "width:34px;height:34px;border-radius:999px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.14);",
        "font-size:15px;line-height:1;cursor:pointer;backdrop-filter:blur(6px);padding:0}",
      ".gt-mute:active{transform:scale(.9)}",
      ".gt-stage{position:relative;z-index:2;flex:1;overflow:hidden;display:flex}",
      ".gt-track{display:flex;width:100%;height:100%;transition:transform .42s cubic-bezier(.25,.9,.3,1)}",
      ".gt-slide{flex:0 0 100%;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;",
        "justify-content:center;text-align:center;padding:20px 26px 8px;box-sizing:border-box}",
      ".gt-artbox{width:min(78vw,320px);max-height:38vh;display:flex;align-items:center;justify-content:center;margin-bottom:22px}",
      ".gt-art{width:100%;height:auto;overflow:visible;filter:drop-shadow(0 14px 30px rgba(0,0,0,.45))}",
      /* 아트 팝인(오버슈트) — 슬라이드 들어올 때 튀어나온다 */
      ".gt-slide .gt-artbox{opacity:0;transform:scale(.55) rotate(-9deg)}",
      ".gt-slide.live .gt-artbox{animation:gtPopIn .62s cubic-bezier(.18,1.5,.35,1) forwards}",
      "@keyframes gtPopIn{0%{opacity:0;transform:scale(.5) rotate(-12deg)}55%{opacity:1;transform:scale(1.12) rotate(4deg)}78%{transform:scale(.96) rotate(-1.5deg)}100%{opacity:1;transform:scale(1) rotate(0)}}",
      /* 배경 회전 셔머 — 화면이 미묘하게 계속 살아있게 */
      ".gt-bg::before{content:'';position:absolute;top:-40%;left:-40%;width:180%;height:180%;",
        "background:conic-gradient(from 0deg,transparent 0deg,rgba(255,255,255,.055) 40deg,transparent 90deg,transparent 220deg,rgba(255,255,255,.04) 260deg,transparent 320deg);",
        "animation:gtSpin 16s linear infinite;pointer-events:none}",
      "@keyframes gtSpin{to{transform:rotate(360deg)}}",
      ".gt-kicker{font-size:12.5px;font-weight:900;letter-spacing:.4px;color:#ffd166;margin-bottom:11px;",
        "text-transform:none;padding:5px 12px;border-radius:999px;background:rgba(255,209,102,.12);border:1px solid rgba(255,209,102,.28)}",
      ".gt-title{font-size:25px;line-height:1.28;font-weight:950;letter-spacing:-.6px;margin:0 0 12px;",
        "text-shadow:0 4px 22px rgba(0,0,0,.5)}",
      ".gt-sub{font-size:14.5px;line-height:1.62;color:#c8cede;margin:0;max-width:340px}",
      ".gt-sub b{color:#fff;font-weight:900}",
      ".gt-sub small{display:inline-block;margin-top:6px;font-size:12px;color:#8f97a8}",
      /* 슬라이드 등장 시 요소 순차 페이드업 */
      ".gt-slide .gt-kicker,.gt-slide .gt-title,.gt-slide .gt-sub,.gt-slide .gt-perms,.gt-slide .gt-cta{opacity:0;transform:translateY(14px)}",
      ".gt-slide.live .gt-kicker{animation:gtUp .5s .04s forwards}",
      ".gt-slide.live .gt-title{animation:gtUp .5s .1s forwards}",
      ".gt-slide.live .gt-sub{animation:gtUp .5s .17s forwards}",
      ".gt-slide.live .gt-perms{animation:gtUp .5s .24s forwards}",
      ".gt-slide.live .gt-cta{animation:gtUp .55s .3s forwards}",
      "@keyframes gtUp{to{opacity:1;transform:none}}",
      /* 하단 */
      ".gt-foot{position:relative;z-index:3;display:flex;align-items:center;justify-content:space-between;",
        "gap:14px;padding:14px 22px calc(18px + env(safe-area-inset-bottom,0px))}",
      ".gt-dots{display:flex;gap:7px}",
      ".gt-dot{width:7px;height:7px;border-radius:999px;background:rgba(255,255,255,.24);transition:.3s}",
      ".gt-dot.on{width:22px;background:#fff}",
      ".gt-next{background:#fff;color:#0b0d16;font-size:14.5px;font-weight:950;border:0;border-radius:999px;",
        "padding:12px 26px;cursor:pointer;box-shadow:0 8px 22px rgba(0,0,0,.35)}",
      ".gt-next:active{transform:scale(.95)}",
      /* 권한 버튼 */
      ".gt-perms{margin-top:20px;width:100%;max-width:320px;display:flex;flex-direction:column;gap:10px}",
      ".gt-perm{display:flex;align-items:center;gap:12px;width:100%;padding:14px 16px;border-radius:15px;cursor:pointer;",
        "background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);color:#fff;transition:.18s}",
      ".gt-perm:active{transform:scale(.98)}",
      ".gt-perm .gt-pi{font-size:20px;line-height:1}",
      ".gt-perm .gt-pt{flex:1;text-align:left;font-size:14.5px;font-weight:900}",
      ".gt-perm .gt-pc{color:#8f97a8;font-size:18px;font-weight:900}",
      ".gt-perm.done{background:rgba(51,209,122,.16);border-color:rgba(51,209,122,.45)}",
      ".gt-perm.done .gt-pt{color:#7ef0ae}",
      ".gt-perm.fail{background:rgba(255,143,160,.12);border-color:rgba(255,143,160,.4)}",
      ".gt-perm.busy{opacity:.7}",
      ".gt-permnote{font-size:11.5px;color:#8f97a8;text-align:center;margin-top:2px}",
      ".gt-cta{margin-top:22px;background:linear-gradient(135deg,#ff4d67,#ff2d55);color:#fff;font-size:16px;",
        "font-weight:950;border:0;border-radius:16px;padding:16px 34px;cursor:pointer;",
        "box-shadow:0 12px 34px rgba(255,45,85,.45);animation:gtPulse 1.6s ease-in-out infinite}",
      ".gt-cta:active{transform:scale(.96)}",
      "@keyframes gtPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.045)}}",
      /* 폭죽 */
      ".gt-spark{position:absolute;inset:0;z-index:4;pointer-events:none;display:flex;align-items:center;justify-content:center}",
      ".gt-spark i{position:absolute;top:34%;width:9px;height:9px;border-radius:2px;opacity:0;",
        "animation:gtSpark 1.15s cubic-bezier(.2,.7,.3,1) forwards}",
      "@keyframes gtSpark{0%{opacity:1;transform:translate(0,0) scale(1)}100%{opacity:0;transform:translate(var(--tx),var(--ty)) scale(.3) rotate(180deg)}}",
      /* ── 아트 애니메이션 ── */
      ".gt-fl{transform-origin:66px 88px}.gt-fr{transform-origin:194px 88px}",
      ".gt-slide.live .gt-fl{animation:gtLunge 1.1s ease-in-out infinite}",
      ".gt-slide.live .gt-fr{animation:gtLunge 1.1s ease-in-out infinite reverse}",
      "@keyframes gtLunge{0%,100%{transform:translateX(0) rotate(0)}50%{transform:translateX(14px) rotate(4deg)}}",
      ".gt-vs{transform-origin:130px 60px}.gt-slide.live .gt-vs{animation:gtVs .5s ease-in-out infinite}",
      "@keyframes gtVs{0%,100%{transform:scale(1) rotate(-4deg)}50%{transform:scale(1.22) rotate(4deg)}}",
      ".gt-slide.live .gt-vfp{animation:gtBarP 2.4s ease-in-out infinite}",
      ".gt-slide.live .gt-vfc{animation:gtBarC 2.4s ease-in-out infinite}",
      ".gt-slide.live .gt-needle{animation:gtNeedle 2.4s ease-in-out infinite}",
      ".gt-slide.live .gt-vpop{animation:gtPop 2.4s ease-in-out infinite}",
      "@keyframes gtBarP{0%,100%{width:150px}50%{width:96px}}",
      "@keyframes gtBarC{0%,100%{x:170px;width:70px}50%{x:116px;width:124px}}",
      "@keyframes gtNeedle{0%,100%{cx:170px}50%{cx:116px}}",
      "@keyframes gtPop{0%,42%{opacity:0;transform:translateY(6px)}55%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(-10px)}}",
      ".gt-coin{opacity:0}.gt-slide.live .gt-coin{animation:gtCoin 1.5s linear infinite;animation-delay:calc(var(--i)*.13s)}",
      "@keyframes gtCoin{0%{opacity:0;transform:translateY(-30px)}10%{opacity:1}90%{opacity:1}100%{opacity:0;transform:translateY(96px)}}",
      ".gt-target{transform-origin:130px 98px}.gt-slide.live .gt-target{animation:gtVs 1.4s ease-in-out infinite}",
      ".gt-dart{transform-origin:150px 86px}.gt-slide.live .gt-dart{animation:gtDart 1.1s ease-out infinite}",
      "@keyframes gtDart{0%{opacity:0;transform:translate(40px,-30px) rotate(30deg)}40%{opacity:1;transform:translate(0,0) rotate(0)}100%{opacity:1;transform:translate(0,0)}}",
      ".gt-hit{transform-origin:130px 42px}.gt-slide.live .gt-hit{animation:gtVs .6s ease-in-out infinite}",
      ".gt-slide.live .gt-phone{animation:gtFloat 2.6s ease-in-out infinite}",
      "@keyframes gtFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}",
      ".gt-pager{transform-origin:185px 133px}.gt-slide.live .gt-pager{animation:gtBuzz .22s linear infinite}",
      "@keyframes gtBuzz{0%,100%{transform:translate(0,0) rotate(0)}25%{transform:translate(-2px,1px) rotate(-3deg)}75%{transform:translate(2px,-1px) rotate(3deg)}}",
      ".gt-call{transform-origin:52px 52px}.gt-slide.live .gt-call{animation:gtRing 1s ease-in-out infinite}",
      "@keyframes gtRing{0%,100%{transform:rotate(0)}25%{transform:rotate(-14deg)}75%{transform:rotate(14deg)}}",
      ".gt-cam{transform-origin:52px 112px}.gt-slide.live .gt-cam{animation:gtPulse 1.4s ease-in-out infinite}",
      ".gt-bub1,.gt-bub2,.gt-bub3{transform-origin:center;transform-box:fill-box}",
      ".gt-slide.live .gt-bub1{animation:gtBob 2s ease-in-out infinite}",
      ".gt-slide.live .gt-bub2{animation:gtBob 2s ease-in-out .3s infinite}",
      ".gt-slide.live .gt-bub3{animation:gtBob 2s ease-in-out .6s infinite}",
      ".gt-slide.live .gt-paper{animation:gtFloat 2.8s ease-in-out infinite}",
      ".gt-airobot{transform-origin:210px 60px}.gt-slide.live .gt-airobot{animation:gtVs .9s ease-in-out infinite}",
      ".gt-ghost{transform-origin:94px 66px}.gt-slide.live .gt-ghost{animation:gtFloat 2.2s ease-in-out infinite}",
      ".gt-sticker{transform-origin:176px 58px}.gt-slide.live .gt-sticker{animation:gtVs .8s ease-in-out infinite}",
      ".gt-slide.live .gt-dna{animation:gtFloat 3s ease-in-out infinite}",
      ".gt-p1,.gt-p2,.gt-p3{transform-origin:center;transform-box:fill-box}",
      ".gt-slide.live .gt-p1{animation:gtBob 1.5s ease-in-out infinite}",
      ".gt-slide.live .gt-p2{animation:gtBob 1.5s ease-in-out .2s infinite}",
      ".gt-slide.live .gt-p3{animation:gtBob 1.5s ease-in-out .4s infinite}",
      "@keyframes gtBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}",
      ".gt-flag{transform-origin:120px 44px}.gt-slide.live .gt-flag{animation:gtWave 1.4s ease-in-out infinite}",
      "@keyframes gtWave{0%,100%{transform:rotate(-2deg)}50%{transform:rotate(3deg)}}",
      ".gt-star2{transform-origin:70px 82px}.gt-slide.live .gt-star2{animation:gtVs .9s ease-in-out infinite}",
      ".gt-slide.live .gt-wallet{animation:gtFloat 2.4s ease-in-out infinite}",
      ".gt-slide.live .gt-rise{stroke-dasharray:320;stroke-dashoffset:320;animation:gtDraw 1.3s ease-out forwards}",
      "@keyframes gtDraw{to{stroke-dashoffset:0}}",
      ".gt-c2{opacity:0}",
      ".gt-slide.live .gt-c2a{animation:gtFly 1.4s ease-in infinite}",
      ".gt-slide.live .gt-c2b{animation:gtFly 1.4s ease-in .35s infinite}",
      ".gt-slide.live .gt-c2c{animation:gtFly 1.4s ease-in .7s infinite}",
      "@keyframes gtFly{0%{opacity:0;transform:translate(0,26px)}20%{opacity:1}80%{opacity:1}100%{opacity:0;transform:translate(58px,10px)}}",
      /* 완주 보너스 배지 */
      ".gt-reward{position:absolute;top:calc(13px + env(safe-area-inset-top,0px));left:14px;z-index:5;",
        "font-size:12px;font-weight:800;color:#ffe08a;padding:7px 12px;border-radius:999px;",
        "background:rgba(255,209,102,.14);border:1px solid rgba(255,209,102,.34);backdrop-filter:blur(6px);",
        "animation:gtRewardGlow 1.8s ease-in-out infinite}",
      ".gt-reward b{color:#fff}",
      ".gt-reward.hide{opacity:0;pointer-events:none}",
      "@keyframes gtRewardGlow{0%,100%{box-shadow:0 0 0 0 rgba(255,209,102,.4)}50%{box-shadow:0 0 0 6px rgba(255,209,102,0)}}",
      "@media (prefers-reduced-motion:reduce){.gtour *{animation:none!important}.gt-slide .gt-kicker,.gt-slide .gt-title,.gt-slide .gt-sub,.gt-slide .gt-perms,.gt-slide .gt-cta{opacity:1;transform:none}}"
    ].join("");
    document.head.appendChild(s);
  }

  /* 스플래시가 걷힌 뒤 등장 — galla:ready 신호 우선, 없으면 타이머 */
  var launched = false;
  function launch() { if (launched) return; launched = true; setTimeout(boot, 260); }
  if (document.readyState === "complete") setTimeout(launch, 300);
  else window.addEventListener("load", function () { setTimeout(launch, 300); });
  document.addEventListener("galla:ready", launch);
  setTimeout(launch, 2600); // 안전망
})();
