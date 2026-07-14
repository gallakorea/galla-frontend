/* ============================================================
   HLS 재생 부착 — Cloudflare Stream(.m3u8) 공용
   iOS/사파리: 네이티브 HLS(video.src). 그 외: hls.js.
   ============================================================ */
(function () {
  window.GALLA_isHls = function (u) { return typeof u === "string" && u.indexOf(".m3u8") !== -1; };

  window.GALLA_attachHls = function (video, url) {
    if (!video || !url) return;
    if (video._hlsUrl === url) return;      // 중복 부착 방지
    video._hlsUrl = url;

    // 비(非)HLS는 그냥 src
    if (!window.GALLA_isHls(url)) { video.setAttribute("src", url); return; }

    // iOS/사파리 = 네이티브 HLS (가장 빠르고 hls.js 불필요)
    if (video.canPlayType && video.canPlayType("application/vnd.apple.mpegurl")) {
      video.setAttribute("src", url);
      try { video.load(); } catch (e) {}
      return;
    }
    // 그 외 = hls.js
    if (window.Hls && window.Hls.isSupported()) {
      try { if (video._hls) { video._hls.destroy(); } } catch (e) {}
      var hls = new window.Hls({ maxBufferLength: 12, capLevelToPlayerSize: true, startLevel: -1, backBufferLength: 8 });
      video._hls = hls;
      hls.loadSource(url);
      hls.attachMedia(video);
      return;
    }
    // 폴백
    video.setAttribute("src", url);
  };

  window.GALLA_detachHls = function (video) {
    if (video && video._hls) { try { video._hls.destroy(); } catch (e) {} video._hls = null; video._hlsUrl = null; }
  };
})();
