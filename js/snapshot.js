/* =========================================================
   📸 콘텐츠 스냅샷 캐시 — "도착 즉시, 지난 내용부터"
   ---------------------------------------------------------
   인스타가 탭 전환이 빠른 결정적 이유는 '이전에 보던 내용을 즉시 보여주고
   뒤에서 갱신'하기 때문. 같은 원리를 MPA에 이식한다:
   · 페이지를 떠날 때/렌더 안정 후 목록 컨테이너의 HTML을 localStorage에 저장
   · 다음 방문 때 본문 파싱 시점에 즉시 주입(스켈레톤 대신 실물 지난 콘텐츠)
   · 페이지 JS의 실렌더가 innerHTML을 갈아치우면 자연 교체(충돌 없음)
   ⚠️ 컨테이너 바로 뒤 <script>로 동기 실행해야 첫 페인트 전에 주입된다.
   ========================================================= */
(function () {
  var MAP = { index: "best-list", predict: "marketList" };
  var page = document.body && document.body.dataset.page;
  var id = MAP[page];
  if (!id) return;
  var el = document.getElementById(id);
  if (!el) return;
  var KEY = "galla_snap_" + page;
  var MARK = "data-snap-mark";

  // 1) 직전 방문 콘텐츠 즉시 주입 (마커로 '아직 스냅샷' 상태를 표시)
  var injected = false;
  try {
    var html = localStorage.getItem(KEY);
    if (html && html.length < 900000) {
      el.innerHTML = html + '<i hidden ' + MARK + '></i>';
      injected = true;
    }
  } catch (_) {}

  // 2) 실렌더가 innerHTML을 교체하면(마커 소멸) 스냅샷 상태 해제 + 새 내용 저장
  var save = function () {
    try {
      if (el.querySelector("[" + MARK + "]")) return;          // 아직 스냅샷 표시 중 — 재저장 금지
      if (!el.firstElementChild || el.querySelector(".sk-card")) return; // 빈/스켈레톤은 저장 안 함
      var tmp = el.cloneNode(true);
      // 재주입 시 영상이 제멋대로 재생/다운로드하지 않게 무장해제
      tmp.querySelectorAll("video").forEach(function (v) {
        v.removeAttribute("autoplay");
        v.setAttribute("preload", "none");
      });
      var h = tmp.innerHTML;
      if (h && h.length < 900000) localStorage.setItem(KEY, h);
    } catch (_) {}
  };
  if (injected) {
    var mo = new MutationObserver(function () {
      if (!el.querySelector("[" + MARK + "]")) {
        mo.disconnect();
        setTimeout(save, 1500);                                 // 실렌더 안정 후 갱신 저장
      }
    });
    mo.observe(el, { childList: true });
  } else {
    setTimeout(save, 6000);                                     // 첫 방문: 렌더 여유 후 저장
  }
  addEventListener("pagehide", save);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") save();
  });
})();
