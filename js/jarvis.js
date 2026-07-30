/* 갈라비스 — 유저 개인 AI 에이전트(프론트). SPA(앱) 전용.
   상주 오브 → 대화 시트. 엣지함수 galla-jarvis 호출.
   서버가 돌려준 action(navigate/compose)을 '칩'으로 띄우고, 탭하면 실행.
   ⚠️ 자율 발행 없음 — 작성창을 초안으로 열어주는 것까지만. */
(function () {
  "use strict";
  if (window.__jarvisInit) return; window.__jarvisInit = true;

  var SB = "https://bidqauputnhkqepvdzrr.supabase.co";
  var ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpZHFhdXB1dG5oa3FlcHZkenJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNzg1NDIsImV4cCI6MjA4MDg1NDU0Mn0.D-UGDPuBaNO8v-ror5-SWgUNLRvkOO-yrf2wDVZtyEM";
  var history = [];   // {role, content}
  var busy = false;

  var ICON = {
    core: '<svg class="jv-core" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4" fill="#fff"/><circle cx="12" cy="12" r="9" stroke="#fff" stroke-opacity=".6" stroke-width="1.4"/><circle cx="19" cy="6" r="1.6" fill="#fff"/></svg>',
    go: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 12h14M13 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 20h4L18 10l-4-4L4 16v4zM14 6l4 4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 11l18-8-8 18-2-7-8-3z"/></svg>'
  };

  var HINTS = ["오늘 핫이슈 뭐야?", "요즘 뜨는 예측 보여줘", "이 주제로 광장글 써줘", "갈라뉴스 요약해줘"];

  var orb, sheet, logEl, taEl, sendEl;

  function el(html) { var d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstChild; }

  function build() {
    orb = el('<button id="jvOrb" aria-label="갈라비스">' + ICON.core + '</button>');
    document.body.appendChild(orb);
    orb.addEventListener("click", open);

    sheet = el(
      '<div id="jvSheet" role="dialog" aria-label="갈라비스">' +
        '<div class="jv-scrim"></div>' +
        '<div class="jv-panel">' +
          '<div class="jv-head"><div class="jv-av"></div>' +
            '<div><div class="jv-name">갈라비스</div><div class="jv-sub">너의 갈라 비서 · 검색·분석·창작</div></div>' +
            '<button class="jv-x" aria-label="닫기">×</button></div>' +
          '<div class="jv-log"></div>' +
          '<div class="jv-hints"></div>' +
          '<div class="jv-input">' +
            '<textarea rows="1" placeholder="갈라비스에게 뭐든 물어봐"></textarea>' +
            '<button class="jv-send">' + ICON.send + '</button>' +
          '</div>' +
        '</div>' +
      '</div>');
    document.body.appendChild(sheet);
    logEl = sheet.querySelector(".jv-log");
    taEl = sheet.querySelector("textarea");
    sendEl = sheet.querySelector(".jv-send");

    sheet.querySelector(".jv-scrim").addEventListener("click", close);
    sheet.querySelector(".jv-x").addEventListener("click", close);
    sendEl.addEventListener("click", submit);
    taEl.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } });
    taEl.addEventListener("input", function () { taEl.style.height = "auto"; taEl.style.height = Math.min(taEl.scrollHeight, 120) + "px"; });

    var hintWrap = sheet.querySelector(".jv-hints");
    HINTS.forEach(function (h) {
      var b = el('<button class="jv-hint"></button>'); b.textContent = h;
      b.addEventListener("click", function () { taEl.value = h; submit(); });
      hintWrap.appendChild(b);
    });
  }

  function open() {
    if (!sheet) build();
    sheet.classList.add("jv-open");
    if (!logEl.children.length) greet();
    setTimeout(function () { taEl && taEl.focus(); }, 320);
  }
  function close() { sheet && sheet.classList.remove("jv-open"); }

  function greet() {
    addMsg("a", "안녕, 나 갈라비스야. 오늘 갈라에서 뭐 궁금해? 핫이슈·예측·뉴스 찾아주고, 글도 초안 잡아줄게.");
  }

  function addMsg(role, text) {
    var m;
    if (role === "u") { m = el('<div class="jv-msg jv-u"></div>'); m.textContent = text; }
    else { m = el('<div class="jv-msg jv-a"><div class="jv-bubble"></div></div>'); m.querySelector(".jv-bubble").textContent = text; }
    logEl.appendChild(m);
    logEl.scrollTop = logEl.scrollHeight;
    return m;
  }

  function addActions(msgEl, actions) {
    if (!actions || !actions.length) return;
    var wrap = el('<div class="jv-acts"></div>');
    actions.forEach(function (a) {
      var chip = el('<button class="jv-chip"></button>');
      if (a.kind === "compose") { chip.innerHTML = ICON.pen + "<span></span>"; chip.querySelector("span").textContent = a.title ? ("‘" + a.title + "’ 작성창 열기") : "작성창 열기"; }
      else { chip.innerHTML = ICON.go + "<span></span>"; chip.querySelector("span").textContent = a.label || labelFor(a.target); }
      chip.addEventListener("click", function () { runAction(a); });
      wrap.appendChild(chip);
    });
    (msgEl.querySelector(".jv-bubble") || msgEl).appendChild(wrap);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function labelFor(t) {
    t = String(t || "");
    if (t.indexOf("issue:") === 0) return "이 이슈 보기";
    if (t.indexOf("market:") === 0) return "이 예측 보기";
    if (t.indexOf("news:") === 0) return "이 뉴스 보기";
    var map = { home: "홈으로", predict: "예측으로", search: "검색으로", dm: "메시지로", mypage: "마이로" };
    return map[t] || "이동";
  }

  function nav(url) { (window.GALLA_nav || function (u) { location.href = u; })(url); }

  function runAction(a) {
    close();
    if (a.kind === "navigate") {
      var t = String(a.target || "");
      if (t.indexOf("issue:") === 0) return nav("issue.html?id=" + t.slice(6));
      if (t.indexOf("market:") === 0) return nav("predict-market.html?id=" + t.slice(7));
      if (t.indexOf("news:") === 0) return nav("news.html?gn=" + t.slice(5));
      var spa = window.GALLA_SPA;
      var view = { home: "index", predict: "predict", search: "trend", dm: "dm", mypage: "mypage" }[t];
      if (spa && view) { try { spa.push(view); return; } catch (e) {} }
      nav({ home: "index.html", predict: "galla-predict.html", search: "search.html", dm: "dm.html", mypage: "mypage.html" }[t] || "index.html");
      return;
    }
    if (a.kind === "compose") {
      // 초안을 기존 GALLA_SEED 채널에 심고 작성창을 연다(write.js/plaza.js가 소비). 발행은 유저 몫.
      var body = a.body || "";
      var tags = Array.isArray(a.tags) ? a.tags : [];
      // 본문에 해시태그가 없으면 추천 태그를 꼬리에 붙임(광장은 본문 태그를 자동수집).
      if (tags.length && !/#[^\s#]/.test(body)) body += "\n\n" + tags.map(function (t) { return "#" + String(t).replace(/^#/, ""); }).join(" ");
      try {
        sessionStorage.setItem("GALLA_SEED", JSON.stringify({
          from: "jarvis", kind: a.composeKind,
          title: a.title || "", oneLine: a.oneLine || "", description: body,
          category: a.category || "", tags: tags, at: Date.now()
        }));
      } catch (e) {}
      var ctx = { galla: "galla", plaza: "plaza", predict: "predict" }[a.composeKind] || "galla";
      if (window.openWriteHub) window.openWriteHub(ctx);
      else nav(ctx === "plaza" ? "search.html?tab=plaza&compose=1" : ctx === "predict" ? "galla-predict.html?compose=1" : "write.html");
    }
  }

  async function token() {
    try {
      var sb = window.supabaseClient;
      var r = await sb.auth.getSession();
      if (r && r.data && r.data.session) return r.data.session.access_token;
    } catch (e) {}
    return null;
  }

  function typing(on) {
    var t = logEl.querySelector(".jv-typing");
    if (on && !t) { logEl.appendChild(el('<div class="jv-typing"><i></i><i></i><i></i></div>')); logEl.scrollTop = logEl.scrollHeight; }
    if (!on && t) t.remove();
  }

  async function submit() {
    if (busy) return;
    var text = (taEl.value || "").trim();
    if (!text) return;
    var jwt = await token();
    if (!jwt) { addMsg("a", "로그인하면 내가 제대로 도와줄 수 있어. 먼저 로그인해줘."); return; }

    busy = true; sendEl.disabled = true;
    taEl.value = ""; taEl.style.height = "auto";
    addMsg("u", text);
    history.push({ role: "user", content: text });
    typing(true);

    try {
      var res = await fetch(SB + "/functions/v1/galla-jarvis", {
        method: "POST",
        headers: { "apikey": ANON, "Authorization": "Bearer " + jwt, "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history: history.slice(0, -1) })
      });
      var j = await res.json().catch(function () { return {}; });
      typing(false);
      if (!j || !j.ok) { addMsg("a", j && j.reply ? j.reply : "잠깐 문제가 생겼어. 다시 물어봐 줄래?"); busy = false; sendEl.disabled = false; return; }
      var m = addMsg("a", j.reply || "…");
      history.push({ role: "assistant", content: j.reply || "" });
      if (history.length > 16) history = history.slice(-16);
      addActions(m, j.actions);
    } catch (e) {
      typing(false); addMsg("a", "네트워크가 삐끗했어. 잠시 뒤 다시.");
    }
    busy = false; sendEl.disabled = false;
    taEl.focus();
  }

  // SPA(앱)에서만 상주. 로그인 여부는 전송 시점에 확인.
  function boot() {
    if (!document.body || document.body.dataset.page !== "spa") return;
    build();
    window.GALLA_openJarvis = open;
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
