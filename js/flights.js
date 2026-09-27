/* flights.js — 항공권 스택 페이지 얇은 래퍼(하이브리드)
   실제 UI·로직은 js/travel-flights.js(GALLA_TravelFlights) 가 전부 갖고 있다.
   여기서는 컨테이너를 찾아 렌더만 위임한다(여행 탭 세그와 같은 모듈 공유). */
(function () {
  function host(root) {
    return (root && root.querySelector && root.querySelector("#tf-mount")) || document.getElementById("tf-mount");
  }
  function boot(root, params) {
    var el = host(root); if (!el) return;
    if (window.GALLA_TravelFlights) window.GALLA_TravelFlights.render(el, params || {});
    else el.innerHTML = '<div style="padding:40px;text-align:center;color:#8a93a6">항공권을 불러오지 못했어요.</div>';
  }

  // SPA 계약 — 어댑터(js/spa/views/flights.js)가 mount 를 부른다.
  window.GALLA_PAGE_FLIGHTS = {
    mount: function (root, params) { boot(root, params); },
    unmount: function () {}
  };

  // MPA/웹 직접 진입 — SPA(data-page=spa)가 아니면 스스로 렌더.
  var page = (document.body && document.body.dataset && document.body.dataset.page) || "";
  if (page !== "spa") {
    document.addEventListener("DOMContentLoaded", function () {
      var p = new URLSearchParams(location.search);
      boot(document, { to: p.get("to") || "", from: p.get("from") || "" });
    });
  }
})();
