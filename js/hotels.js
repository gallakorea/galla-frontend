/* hotels.js — 숙소 스택 페이지 얇은 래퍼(하이브리드)
   실제 UI·로직은 js/travel-hotels.js(GALLA_TravelHotels) 가 전부 갖고 있다.
   여기서는 컨테이너를 찾아 렌더만 위임한다(여행 탭 세그와 같은 모듈 공유). */
(function () {
  function host(root) {
    return (root && root.querySelector && root.querySelector("#th-mount")) || document.getElementById("th-mount");
  }
  function boot(root, params) {
    var el = host(root); if (!el) return;
    if (window.GALLA_TravelHotels) window.GALLA_TravelHotels.render(el, params || {});
    else el.innerHTML = '<div style="padding:40px;text-align:center;color:#8a93a6">숙소를 불러오지 못했어요.</div>';
  }

  // SPA 계약 — 어댑터(js/spa/views/hotels.js)가 mount 를 부른다.
  // 숙소 위에 숙소가 또 쌓일 수 있다(갈비스 카드) — 라우터는 같은 모듈의 unmount 를 위에서부터 부르므로 LIFO 로 짝을 맞춘다.
  var mounted = [];
  window.GALLA_PAGE_HOTELS = {
    mount: function (root, params) { var el = host(root); if (el) mounted.push(el); boot(root, params); },
    unmount: function () {
      var el = mounted.pop();
      if (el && window.GALLA_TravelHotels && window.GALLA_TravelHotels.release) window.GALLA_TravelHotels.release(el);
    }
  };

  // MPA/웹 직접 진입 — SPA(data-page=spa)가 아니면 스스로 렌더.
  var page = (document.body && document.body.dataset && document.body.dataset.page) || "";
  if (page !== "spa") {
    document.addEventListener("DOMContentLoaded", function () {
      var p = new URLSearchParams(location.search);
      var o = {}; p.forEach(function (v, k) { o[k] = v; });   // city·in·out·adults·children·ages·area·types·minStar·minScore·priceMin·priceMax·hid
      boot(document, o);
    });
  }
})();
