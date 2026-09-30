/* ☰ 홈 채널 서랍 — 즐겨찾기(구독) + 카테고리. 채널을 누르면 트렌드›광장 채널방으로.
   plaza-channels.js(트렌드 안)와 독립. 구독은 같은 localStorage(galla_plaza_channels).
   홈(index.html) 전용. MPA/SPA 양쪽: index.html <script> + SPA 홈 뷰에서 로드. */
(function () {
  var SUB_KEY = "galla_plaza_channels";
  // 채널명·이모지·색은 js/galla-channels.js(GALLA_CHANNELS) 단일 소스에서 온다(기본 7종).
  function cats() { return (window.GALLA_CHANNELS && GALLA_CHANNELS.names()) || []; }
  function emo(n) { return (window.GALLA_CHANNELS && GALLA_CHANNELS.emoji(n)) || "💬"; }
  function grd(n) { return (window.GALLA_CHANNELS && GALLA_CHANNELS.color(n)) || "linear-gradient(135deg,#3a4fff,#6f86ff)"; }

  function getSubs() { try { return JSON.parse(localStorage.getItem(SUB_KEY) || "[]"); } catch (_) { return []; } }
  function row(n) {
    return '<div class="chd-ch" data-ch="' + n + '">' +
             '<span class="chd-av" style="background:' + grd(n) + '">' + emo(n) + "</span>" +
             '<span class="chd-n">' + n + "</span></div>";
  }
  function render() {
    var body = document.getElementById("chdBody");
    if (!body) return;
    var subs = getSubs().filter(function (n) { return n; });   // 즐겨찾기(구독)는 유저 채널 포함 전부
    var fav = subs.length ? '<div class="chd-sect">⭐ 즐겨찾기</div>' + subs.map(row).join("") : "";
    body.innerHTML = fav + '<div class="chd-sect">카테고리</div>' + cats().map(row).join("");
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
