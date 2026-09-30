/* ☰ 홈 채널 서랍 — 즐겨찾기(구독) + 카테고리. 채널을 누르면 트렌드›광장 채널방으로.
   plaza-channels.js(트렌드 안)와 독립. 구독은 같은 localStorage(galla_plaza_channels).
   홈(index.html) 전용. MPA/SPA 양쪽: index.html <script> + SPA 홈 뷰에서 로드. */
(function () {
  var SUB_KEY = "galla_plaza_channels";
  var EMO = {
    "정치": "🗳️", "사회": "🏛️", "경제": "📈", "투자": "💰", "직장": "🏢",
    "커리어·이직": "🧭", "연애": "💘", "결혼·육아": "👶", "인간관계": "🤝",
    "일상": "☕", "패션·뷰티": "💄", "엔터": "🎬", "스포츠": "⚽",
    "여행": "✈️", "맛집": "🍜", "가치·논쟁": "⚖️", "불만·푸념": "😤",
    "19금": "🔞", "기타": "📌"
  };
  var GRAD = {
    "정치": "linear-gradient(135deg,#8a5aff,#5a6bff)", "사회": "linear-gradient(135deg,#6f86ff,#4361ff)",
    "경제": "linear-gradient(135deg,#2fd07a,#1f9d5e)", "투자": "linear-gradient(135deg,#ffcf5a,#ff9a5a)",
    "직장": "linear-gradient(135deg,#5ab0ff,#4361ff)", "커리어·이직": "linear-gradient(135deg,#4d8dff,#6f86ff)",
    "연애": "linear-gradient(135deg,#ff5a9a,#ff5a6e)", "결혼·육아": "linear-gradient(135deg,#ff8a5a,#ff5a9a)",
    "인간관계": "linear-gradient(135deg,#36c2a0,#2fd07a)", "일상": "linear-gradient(135deg,#a4abb8,#6b7280)",
    "패션·뷰티": "linear-gradient(135deg,#ff5a9a,#c15aff)", "엔터": "linear-gradient(135deg,#ffcf5a,#ff9a5a)",
    "스포츠": "linear-gradient(135deg,#2fd07a,#36c2a0)", "여행": "linear-gradient(135deg,#4d8dff,#6f86ff)",
    "맛집": "linear-gradient(135deg,#ff9a5a,#ff5a6e)", "가치·논쟁": "linear-gradient(135deg,#8a5aff,#5a6bff)",
    "불만·푸념": "linear-gradient(135deg,#ff5a6e,#c14a4a)", "19금": "linear-gradient(135deg,#c15aff,#8a5aff)",
    "기타": "linear-gradient(135deg,#6b7280,#4b5563)"
  };
  var CATS = ["정치", "사회", "경제", "투자", "직장", "커리어·이직", "연애", "결혼·육아",
    "인간관계", "일상", "패션·뷰티", "엔터", "스포츠", "여행", "맛집", "가치·논쟁", "불만·푸념", "19금", "기타"];

  function getSubs() { try { return JSON.parse(localStorage.getItem(SUB_KEY) || "[]"); } catch (_) { return []; } }
  function row(n) {
    return '<div class="chd-ch" data-ch="' + n + '">' +
             '<span class="chd-av" style="background:' + (GRAD[n] || "linear-gradient(135deg,#3a4fff,#6f86ff)") + '">' + (EMO[n] || "💬") + "</span>" +
             '<span class="chd-n">' + n + "</span></div>";
  }
  function render() {
    var body = document.getElementById("chdBody");
    if (!body) return;
    var subs = getSubs().filter(function (n) { return CATS.indexOf(n) >= 0 || n; });
    var fav = subs.length ? '<div class="chd-sect">⭐ 즐겨찾기</div>' + subs.map(row).join("") : "";
    body.innerHTML = fav + '<div class="chd-sect">카테고리</div>' + CATS.map(row).join("");
  }
  function open() {
    render();
    var d = document.getElementById("chDrawer"), b = document.getElementById("chdBackdrop");
    if (b) { b.hidden = false; requestAnimationFrame(function () { b.classList.add("on"); }); }
    if (d) { d.classList.add("on"); d.setAttribute("aria-hidden", "false"); }
  }
  function close() {
    var d = document.getElementById("chDrawer"), b = document.getElementById("chdBackdrop");
    if (d) { d.classList.remove("on"); d.setAttribute("aria-hidden", "true"); }
    if (b) { b.classList.remove("on"); setTimeout(function () { b.hidden = true; }, 240); }
  }
  function go(name) {
    close();
    var u = "search.html?tab=plaza&ch=" + encodeURIComponent(name);
    (window.GALLA_nav || function (x) { location.href = x; })(u);
  }

  function bind() {
    var menu = document.getElementById("hdrMenu");
    if (menu && !menu.dataset.cdbound) {
      menu.dataset.cdbound = "1";
      menu.addEventListener("click", open);
    }
    var bd = document.getElementById("chdBackdrop");
    if (bd && !bd.dataset.cdbound) { bd.dataset.cdbound = "1"; bd.addEventListener("click", close); }
    var body = document.getElementById("chdBody");
    if (body && !body.dataset.cdbound) {
      body.dataset.cdbound = "1";
      body.addEventListener("click", function (e) {
        var ch = e.target.closest("[data-ch]");
        if (ch) go(ch.dataset.ch);
      });
    }
  }

  bind();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  window.GALLA_bindChDrawer = bind;
})();
