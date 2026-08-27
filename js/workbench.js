/* 🎬 숏판 작업대 — 갈비스가 짠 컷을 사람이 1탭으로 고치는 화면.
 *
 * 왜 채팅이 아니라 화면인가:
 *   컷 배치는 눈으로 보고 고치는 일이다. "3번 컷 바꿔줘"를 말로 하면 무엇이 3번인지부터 헷갈린다.
 *   서버(reel-agent)는 처음부터 이 화면을 상정하고 만들어져 있었다 — cuts 가 썸네일·문장·후보를
 *   같이 내주고, voice·subtitles 까지 준다. **렌더 없이** 원본을 이어 재생해 미리 보라는 뜻이다.
 *   (서버 비용 0, 대기 0초. 최종 렌더는 확정 후 한 번만.)
 *
 * ⚠️ 이 화면은 GALLA_WORKFORM 을 노출한다. friend.js 가 그걸 보고 도킹 미니챗을 저절로 붙인다 —
 *    갈비스 쪽 코드를 한 줄도 안 건드리고 "작업대 옆에서 같이 고치는" 구조가 된다.
 *
 * 열기: GALLA_openWorkbench(jobId)
 */
(function () {
  "use strict";
  if (window.GALLA_openWorkbench) return;

  var FN = "/functions/v1/reel-agent";
  var _job = null, _data = null, _root = null, _audio = null, _timer = null;

  function sb() { return window.supabaseClient; }
  async function api(op, extra) {
    var c = sb(); if (!c) throw new Error("no_client");
    var s = await c.auth.getSession();
    var tok = s && s.data && s.data.session ? s.data.session.access_token : "";
    var r = await fetch(c.supabaseUrl + FN, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok, apikey: c.supabaseKey },
      body: JSON.stringify(Object.assign({ op: op, id: _job }, extra || {}))
    });
    return await r.json();
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function injectStyle() {
    if (document.getElementById("wb-style")) return;
    var s = document.createElement("style"); s.id = "wb-style";
    s.textContent = [
      /* ⚠️ 하단 네비가 z-index 9999 다. 9500 이면 '만들기' 버튼이 탭바에 덮여 못 누른다(실측). */
      ".wb{position:fixed;inset:0;z-index:10050;background:#000;color:#f3f4f6;display:flex;flex-direction:column;",
      "  font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic',sans-serif}",
      ".wb-h{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.08)}",
      ".wb-h b{font-size:15px;font-weight:800;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".wb-x{width:32px;height:32px;border-radius:99px;border:1px solid rgba(255,255,255,.14);background:transparent;color:#a4abb8;font-size:17px;line-height:1}",
      ".wb-note{font-size:11.5px;color:#6b7280;padding:10px 16px 0}",
      ".wb-list{flex:1 1 auto;overflow-y:auto;padding:8px 12px 120px;-webkit-overflow-scrolling:touch}",
      ".wb-cut{display:flex;gap:10px;align-items:flex-start;padding:9px 8px;border-radius:12px;border:1px solid rgba(255,255,255,.08);margin-bottom:7px;background:#0c0d11}",
      ".wb-cut.on{border-color:#4361ff;background:rgba(67,97,255,.10)}",
      ".wb-cut.unsure{border-color:rgba(255,180,92,.45);background:rgba(255,180,92,.06)}",
      ".wb-th{width:44px;height:58px;border-radius:7px;object-fit:cover;background:#1c1e26;flex:0 0 auto}",
      ".wb-b{flex:1 1 auto;min-width:0}",
      ".wb-txt{font-size:12.5px;color:#e6e8ee;line-height:1.45}",
      ".wb-cap{font-size:10.5px;color:#7f97a8;margin-top:3px}",
      ".wb-warn{font-size:10.5px;color:#ffb45c;margin-top:2px;font-weight:700}",
      ".wb-t{font-size:10px;color:#5b6470;flex:0 0 auto;font-variant-numeric:tabular-nums;padding-top:2px}",
      ".wb-alts{display:flex;gap:7px;padding:2px 8px 10px 62px;flex-wrap:wrap}",
      ".wb-alt{border:1px solid rgba(255,255,255,.14);border-radius:9px;background:#14151a;padding:5px;display:flex;gap:7px;align-items:center;max-width:100%}",
      ".wb-alt img{width:30px;height:40px;border-radius:5px;object-fit:cover;background:#1c1e26}",
      ".wb-alt span{font-size:10.5px;color:#cfd6e0;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".wb-foot{position:absolute;left:0;right:0;bottom:0;padding:12px 16px calc(12px + env(safe-area-inset-bottom));",
      "  background:linear-gradient(180deg,rgba(0,0,0,0),#000 32%);display:flex;gap:9px}",
      ".wb-btn{flex:1;border-radius:99px;padding:13px;font-size:14px;font-weight:800;border:0}",
      ".wb-btn.ghost{background:transparent;border:1px solid rgba(255,255,255,.18);color:#cfd6e0}",
      ".wb-btn.go{background:linear-gradient(135deg,#6a7bff,#3a5bff);color:#fff}",
      ".wb-btn[disabled]{opacity:.5}",
      ".wb-empty{padding:40px 20px;text-align:center;color:#6b7280;font-size:13px;line-height:1.7}",
      /* ⏳ 만드는 중 / ✅ 다 됐어 — 만들고 나서 아무 화면도 없으면 사람은 자기 영상이 어디 갔는지 모른다. */
      ".wb-stage{flex:1 1 auto;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 20px;text-align:center}",
      ".wb-spin{width:46px;height:46px;border-radius:99px;border:3px solid rgba(95,216,255,.18);border-top-color:#5fd8ff;animation:wbspin 1s linear infinite}",
      "@keyframes wbspin{to{transform:rotate(360deg)}}",
      "@media (prefers-reduced-motion:reduce){.wb-spin{animation-duration:3s}}",
      ".wb-stage h4{font-size:17px;font-weight:800;margin:16px 0 0}",
      ".wb-stage p{font-size:12.5px;color:#7f97a8;margin:8px 0 0;line-height:1.6}",
      ".wb-vid{width:100%;max-width:300px;border-radius:14px;background:#14151a;margin-top:14px}",
      ".wb-meta{font-size:11.5px;color:#5b6470;margin-top:10px;font-variant-numeric:tabular-nums}",
      ".wb-acts{display:flex;flex-direction:column;gap:8px;width:100%;max-width:320px;margin-top:18px}"
    ].join("");
    document.head.appendChild(s);
  }

  /* 컷 한 줄 + (있으면) 후보 칩. 후보는 서버가 이미 골라 보내준다 —
     사용자는 '다른 화면 찾기'가 아니라 'A냐 B냐'만 정하면 된다. */
  function rowHTML(c) {
    var alts = (c.alts || []).map(function (a) {
      return '<button class="wb-alt" data-cut="' + c.cut + '" data-clip="' + a.clip + '">' +
        (a.thumb ? '<img src="' + esc(a.thumb) + '" alt="">' : "") +
        "<span>" + esc(a.cap || ("클립 " + a.clip)) + "</span></button>";
    }).join("");
    return '<div class="wb-cut' + (c.unsure ? " unsure" : "") + '" data-row="' + c.cut + '">' +
      (c.thumb ? '<img class="wb-th" src="' + esc(c.thumb) + '" alt="">' : '<div class="wb-th"></div>') +
      '<div class="wb-b">' +
        '<div class="wb-txt">' + esc(c.text || "(자막 없음)") + "</div>" +
        '<div class="wb-cap">' + esc(c.cap || "") + "</div>" +
        (c.unsure ? '<div class="wb-warn">확실치 않아요 — 아래에서 골라주세요</div>' : "") +
      "</div>" +
      '<div class="wb-t">' + Number(c.at || 0).toFixed(1) + "s</div>" +
    "</div>" + (alts ? '<div class="wb-alts">' + alts + "</div>" : "");
  }

  function render() {
    var cuts = (_data && _data.cuts) || [];
    var un = cuts.filter(function (c) { return c.unsure; }).length;
    var list = _root.querySelector(".wb-list");
    list.innerHTML = cuts.length
      ? ('<div class="wb-note">문장마다 어떤 화면이 붙는지예요. ' +
         (un ? "<b style=\"color:#ffb45c\">" + un + "군데가 애매</b>하니 거기부터 봐주세요." : "애매한 자리는 없어요.") +
         " 어색하면 아래 후보를 눌러 바꾸면 돼요.</div>" +
         cuts.map(rowHTML).join(""))
      : '<div class="wb-empty">아직 컷이 없어요.<br>갈비스가 만드는 중이면 조금만 기다려 주세요.</div>';
  }

  /* ▶ 미리보기 — 렌더 없이 목소리만 틀고 지금 나갈 컷을 짚어준다.
     ⚠️ 원본 영상을 이어 붙여 재생하는 건 다음 단계다. 지금도 "언제 무슨 화면인지"는 이걸로 다 보인다. */
  function stopPreview() {
    if (_audio) { try { _audio.pause(); } catch (e) {} _audio = null; }
    if (_timer) { clearInterval(_timer); _timer = null; }
    if (_root) _root.querySelectorAll(".wb-cut.on").forEach(function (n) { n.classList.remove("on"); });
    var b = _root && _root.querySelector("[data-play]"); if (b) b.textContent = "▶ 미리 듣기";
  }
  function togglePreview() {
    if (_audio) { stopPreview(); return; }
    if (!_data || !_data.voice) return;
    _audio = new Audio(_data.voice);
    _audio.play().catch(function () { stopPreview(); });
    _root.querySelector("[data-play]").textContent = "■ 멈추기";
    _audio.addEventListener("ended", stopPreview);
    _timer = setInterval(function () {
      if (!_audio) return;
      var t = _audio.currentTime, cuts = _data.cuts || [], hit = -1;
      for (var i = 0; i < cuts.length; i++) {
        if (t >= cuts[i].at && t < cuts[i].at + cuts[i].dur) { hit = cuts[i].cut; break; }
      }
      _root.querySelectorAll(".wb-cut").forEach(function (n) {
        n.classList.toggle("on", Number(n.dataset.row) === hit);
      });
      var el = hit >= 0 && _root.querySelector('.wb-cut[data-row="' + hit + '"]');
      if (el) el.scrollIntoView({ block: "nearest" });
    }, 200);
  }

  async function swap(cut, clip) {
    var r = await api("swap", { cut: Number(cut), clip: Number(clip) });
    if (r && r.cuts) { _data.cuts = r.cuts; render(); window.BattleFX && window.BattleFX.haptic && window.BattleFX.haptic("tap"); }
  }

  /* ⏳ 만드는 중 — 승인하고 화면을 닫아버리면 자기 영상이 어디로 갔는지 알 길이 없다.
     여기서 끝까지 지켜보고 결과물을 손에 쥐여준다. */
  function stage(html) {
    var l = _root.querySelector(".wb-list") || _root.querySelector(".wb-stage");
    if (l) l.outerHTML = '<div class="wb-stage">' + html + "</div>";
    var f = _root.querySelector(".wb-foot"); if (f) f.remove();
  }
  function fmt(sec) { var m = Math.floor(sec / 60), s2 = Math.round(sec % 60); return m ? m + "분 " + s2 + "초" : s2 + "초"; }

  function watchRender() {
    var t0 = Date.now(), last = "";
    stage('<div class="wb-spin"></div><h4>만드는 중</h4><p id="wb-msg">시작하는 중…</p><p class="wb-meta" id="wb-el"></p>');
    var iv = setInterval(async function () {
      if (!_root) { clearInterval(iv); return; }
      var el = _root.querySelector("#wb-el");
      if (el) el.textContent = fmt((Date.now() - t0) / 1000) + " 지남";
      var r = await api("status", {}).catch(function () { return null; });
      var jb = r && r.job; if (!jb) return;
      var ps = jb.progress || [];
      var msg = ps.length ? (ps[ps.length - 1] || {}).msg : "";
      if (msg && msg !== last) { last = msg; var m = _root.querySelector("#wb-msg"); if (m) m.textContent = msg; }
      if (jb.state === "done") { clearInterval(iv); doneView(jb, (Date.now() - t0) / 1000); }
      else if (jb.state === "failed") {
        clearInterval(iv);
        try { window.GALLA_friendSay && window.GALLA_friendSay("만들다 막혔어 ㅜ 다시 해볼까?"); } catch (e) {}
        stage("<h4>만들다 막혔어요</h4><p>" + esc(jb.error || "잠시 뒤 다시 해볼까요?") + "</p>" +
          '<div class="wb-acts"><button class="wb-btn ghost" data-again>다시 해보기</button></div>');
        var a = _root.querySelector("[data-again]");
        if (a) a.addEventListener("click", function () { window.GALLA_openWorkbench(_job); });
      }
    }, 3000);
  }

  /* ✅ 다 됐어 — 바로 재생해 보여주고, 그 자리에서 갈라에 올리거나 내려받게 한다. */
  function doneView(jb, secs) {
    var url = (jb.artifacts || {}).video_url || "";
    stage(
      "<h4>다 됐어요</h4><p>" + fmt(secs) + " 걸렸어요</p>" +
      (url ? '<video class="wb-vid" src="' + esc(url) + '" controls playsinline preload="metadata"></video>' : "") +
      '<div class="wb-acts">' +
        '<button class="wb-btn go" data-post>갈라에 올리기</button>' +
        (url ? '<button class="wb-btn ghost" data-save>내려받기</button>' : "") +
        '<button class="wb-btn ghost" data-edit>컷 더 고치기</button>' +
      "</div>"
    );
    var v = _root.querySelector(".wb-vid");
    if (v) v.play().catch(function () { /* 자동재생이 막히면 그냥 둔다 */ });
    /* 🔁 갈비스에게 알린다 — 자기가 짠 컷으로 만들어진 결과다. 모르면 대화가 끊긴다.
       다음에 "그거 어떻게 됐어?" 하고 물었을 때 답이 있어야 한다. */
    try { window.GALLA_friendSay && window.GALLA_friendSay("다 만들었어! 어때? 마음에 안 들면 컷 다시 골라줘 🎬", url); } catch (e) {}

    var p = _root.querySelector("[data-post]");
    if (p) p.addEventListener("click", function () {
      /* 숏판 편집기로 넘긴다 — 거기 제목·태그·올리기가 이미 다 있다. 두 번 만들지 않는다. */
      close();
      try {
        if (window.GALLA_SPA) window.GALLA_SPA.push("gallari-write", { kind: "vertical" });
        else location.href = "gallari-write.html?kind=vertical";
      } catch (e) { location.href = "gallari-write.html?kind=vertical"; }
      var tries = 0;
      var t = setInterval(function () {
        var wf = window.GALLA_WORKFORM;
        if (wf && wf.setVideo) { clearInterval(t); try { wf.setVideo(url, null, "vertical"); } catch (e) {} }
        else if (++tries > 40) clearInterval(t);   // 편집기가 안 뜨면 조용히 포기 — 영상은 목록에 남아 있다
      }, 200);
    });
    var sv = _root.querySelector("[data-save]");
    if (sv) sv.addEventListener("click", function () { window.open(url, "_blank"); });
    var ed = _root.querySelector("[data-edit]");
    if (ed) ed.addEventListener("click", function () { window.GALLA_openWorkbench(_job); });
  }

  async function approve(btn) {
    btn.disabled = true; btn.textContent = "시작하는 중…";
    var r = await api("approve", {});
    if (r && r.ok) { stopPreview(); watchRender(); return; }
    btn.disabled = false; btn.textContent = "이대로 만들기";
    alert((r && r.error) === "not_preview" ? "이미 만드는 중이에요." : "지금은 시작할 수 없어요.");
  }

  function close() {
    stopPreview();
    try { delete window.GALLA_WORKFORM; } catch (e) { window.GALLA_WORKFORM = null; }
    if (_root) { _root.remove(); _root = null; }
    _job = null; _data = null;
  }

  window.GALLA_openWorkbench = async function (jobId) {
    /* 🔒 창작 에이전트는 런칭 뒤에 연다(agent-hub.js 의 ENABLED 하나로 켜진다).
       잠금 중엔 작업대도 안 뜬다 — 갈비스는 예전처럼 말풍선 카드로 컷을 보여준다(회귀 없음). */
    if (window.GALLA_AGENT_READY === false) return;
    if (!jobId) return;
    injectStyle();
    close();
    _job = String(jobId);

    _root = document.createElement("div");
    _root.className = "wb";
    _root.innerHTML =
      '<div class="wb-h"><b>숏판 작업대</b>' +
        '<button class="wb-x" aria-label="닫기">×</button></div>' +
      '<div class="wb-list"><div class="wb-empty">불러오는 중…</div></div>' +
      '<div class="wb-foot">' +
        '<button class="wb-btn ghost" data-play>▶ 미리 듣기</button>' +
        '<button class="wb-btn go" data-go>이대로 만들기</button>' +
      "</div>";
    document.body.appendChild(_root);

    _root.querySelector(".wb-x").addEventListener("click", close);
    _root.querySelector("[data-play]").addEventListener("click", togglePreview);
    _root.querySelector("[data-go]").addEventListener("click", function () { approve(this); });
    // 후보 칩은 위임으로 — 컷이 바뀔 때마다 다시 바인딩하지 않는다
    _root.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest(".wb-alt");
      if (b) swap(b.dataset.cut, b.dataset.clip);
    });

    var r = await api("cuts", {});
    if (!r || r.error) {
      _root.querySelector(".wb-list").innerHTML =
        '<div class="wb-empty">불러오지 못했어요.<br>' + esc((r && r.error) || "") + "</div>";
      return;
    }
    _data = r;
    render();

    /* 🛠 갈비스 도킹 브리지 — friend.js 가 이 객체를 보고 미니챗을 스스로 붙인다.
       작업대가 '어느 화면인지' 갈비스는 몰라도 된다. 계약만 맞추면 된다. */
    window.GALLA_WORKFORM = {
      type: "vertical",
      getFields: function () {
        var cuts = (_data && _data.cuts) || [];
        return {
          job: _job,
          cuts: cuts.map(function (c) { return { cut: c.cut, at: c.at, text: c.text, cap: c.cap, unsure: !!c.unsure }; }),
          unsure: cuts.filter(function (c) { return c.unsure; }).map(function (c) { return c.cut; })
        };
      },
      setFields: function () { /* 작업대는 컷만 다룬다 — 폼 필드가 없다 */ },
      getClips: function () { return (_data && _data.clips) || []; },
      swap: swap,
      submit: function () { var g = _root && _root.querySelector("[data-go]"); if (g) g.click(); }
    };
  };

  /* ⚠️ '새로 만들기' 목록에는 작업대 줄을 넣지 않는다.
     거긴 **내가 직접 쓰는** 곳이고, 갈비스 제작은 다른 세계다(agent-hub.js).
     한 줄로 끼워 넣으면 "글쓰기 종류 하나"로 읽힌다 — 사장님 지적. 이어서 하기는 그 세계 안에 있다. */

  /* 🔗 ?wb=<jobId> 로 바로 연다. 만들던 걸 이어서 열 때도, 남한테 보여줄 때도 같은 길을 쓴다. */
  (function deepLink() {
    try {
      var id = new URLSearchParams(location.search).get("wb");
      if (!id) return;
      var go = function () { window.GALLA_openWorkbench(id); };
      if (window.supabaseClient) go(); else setTimeout(go, 1200);
    } catch (e) { /* 링크 하나 때문에 페이지가 죽으면 안 된다 */ }
  })();
})();
