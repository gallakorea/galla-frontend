/* =========================================================
   yt-tv.js — 「TV로 보기」 부모 쪽 받기 (앱 셸 전용)

   사장님(26.9.18): "유튜브 영상들을 바로 티비나 기기랑 페어링 하게 만들어 페어링 버튼 있자나"
   앱 안 유튜브 임베드(galla.im/yt)엔 유튜브의 캐스트(TV 연결) 버튼이 나오지 않는다 —
   유튜브가 임베드·웹뷰에서는 그 버튼을 감춘다. 그래서 재생기(yt.html)의 「TV로 보기」가
   부모에게 알리면, 여기서 **유튜브 앱을 보던 시점부터** 연다. 그 앱의 TV 연결 버튼으로
   크롬캐스트·구글TV·스마트TV(유튜브 앱)·에어플레이에 바로 붙는다.

   ⚠️ https 주소로 연다(youtube:// 스킴 아님). OS 가 유튜브 앱이 있으면 앱으로, 없으면 브라우저로 보낸다 —
      Info.plist 에 스킴 등록이 없어도 되고 안드로이드도 같은 코드로 된다.
   ⚠️ 메시지는 galla.im/yt 에서 온 것만 받는다(아무 프레임이나 앱 밖으로 링크를 열게 두지 않는다).
   ========================================================= */
(function () {
  if (window.__gallaYtTv) return;
  window.__gallaYtTv = true;
  var OK_ORIGIN = /^https:\/\/(www\.)?galla\.im$/;

  function toast(m) { try { window.GALLA_toast ? GALLA_toast(m) : 0; } catch (_) {} }

  async function openYouTube(v, t) {
    if (!/^[\w-]{6,20}$/.test(v || "")) return;
    var url = "https://www.youtube.com/watch?v=" + encodeURIComponent(v) + (t > 3 ? "&t=" + Math.floor(t) + "s" : "");
    toast("유튜브 앱에서 TV 연결 버튼을 누르세요");
    var P = window.Capacitor && window.Capacitor.Plugins;
    try {
      if (P && P.AppLauncher && P.AppLauncher.openUrl) { await P.AppLauncher.openUrl({ url: url }); return; }
    } catch (_) {}
    try {
      if (P && P.Browser && P.Browser.open) { await P.Browser.open({ url: url }); return; }
    } catch (_) {}
    try { window.open(url, "_blank", "noopener"); } catch (_) { location.href = url; }
  }

  window.addEventListener("message", function (e) {
    var d = e && e.data;
    if (!d || d.galla !== "yt-tv") return;
    if (!OK_ORIGIN.test(e.origin || "")) return;
    openYouTube(String(d.v || ""), Number(d.t) || 0);
  });
  window.GALLA_openYouTubeTV = openYouTube;
})();
