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
    /* 🐢 hls.js 는 290KB 다 — 모든 페이지가 미리 받고 있었다(홈 자원 1.77MB 중 최대 조각).
       실제로 필요한 건 '비(非)사파리 + m3u8' 조합뿐이고, 그마저 재생 시점에나 쓰인다.
       그래서 여기서 처음 필요할 때 한 번만 내려받는다. iOS/사파리는 위에서 네이티브로 끝나
       평생 받지 않는다. 로드 실패해도 아래 폴백(video.src)이 그대로 산다. */
    if (!window.Hls && !window.__hlsLoading) {
      window.__hlsLoading = true;
      var sc = document.createElement("script");
      sc.src = (window.GALLA_HLS_SRC || "/vendor/hls.min.js?v=080412");
      sc.async = true;
      sc.onload = function () { try { window.GALLA_attachHls(video, url); } catch (e) {} };
      sc.onerror = function () { try { video.setAttribute("src", url); } catch (e) {} };
      document.head.appendChild(sc);
      video._hlsUrl = null;           // 로드 후 재부착이 되도록 중복 방지 플래그 해제
      return;
    }
    if (window.__hlsLoading && !window.Hls) {
      // 로딩 중이면 끝난 뒤 다시 시도(그 사이 폴백으로 재생은 시작해둔다)
      video.setAttribute("src", url);
      video._hlsUrl = null;
      return;
    }
    // 그 외 = hls.js
    if (window.Hls && window.Hls.isSupported()) {
      try { if (video._hls) { video._hls.destroy(); } } catch (e) {}
      // abrEwmaDefaultEstimate: 첫 세그먼트 화질 추정을 3.5Mbps로 올려 240p가 아닌
      // 480~720p로 시작(뿌옇게 시작 방지). capLevelToPlayerSize로 과도한 화질은 억제.
      var hls = new window.Hls({
        maxBufferLength: 12,
        capLevelToPlayerSize: true,
        startLevel: -1,
        backBufferLength: 8,
        abrEwmaDefaultEstimate: 3500000,
        maxStarvationDelay: 2,
      });
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
