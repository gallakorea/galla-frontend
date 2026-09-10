/* 🧬 「나의 갈라 성향」 상세 페이지(galla-type.html) 초기화 — 로그인 확인 → 성향 계산 → 화면 채우기.

   ⚠️ 왜 인라인이 아니라 별도 파일인가 — SPA 뷰 로더(js/spa/view-loader.js)는 `script[src]` 만
      실행하고 **인라인 <script> 는 버린다**. 예전엔 이 초기화가 galla-type.html 안의 인라인
      스크립트였어서, 앱(SPA)에선 계산이 아예 안 돌고 HTML 에 박혀 있던 자리표시 값
      「🔥 논리적 개척자형 · 찬성 62% / 반대 38%」가 **모든 사용자에게 그대로** 보였다
      (2026-09-10 QA: 찬성 투표 1표뿐인 계정이 설정 카드엔 「침착한 방패형 100/0」,
       상세 페이지엔 「논리적 개척자형 62/38」 — 같은 계정·같은 엔진인데 다른 결과).
   ⚠️ 왜 DOMContentLoaded 로 거는가 — SPA 는 한 번 로드한 페이지 스크립트를 재방문 때 다시
      실행하지 않고, 로드 중에 걸린 DCL 리스너만 되감아(replay) 부른다. MPA 에서도 DCL 은 한 번 돈다. */
(function () {
  function nav(u) { (window.GALLA_nav || function (x) { location.href = x; })(u); }

  function waitSupabase(timeoutMs) {
    return new Promise(function (resolve) {
      if (window.supabaseClient) return resolve(window.supabaseClient);
      var t0 = Date.now();
      var timer = setInterval(function () {
        if (window.supabaseClient || Date.now() - t0 > (timeoutMs || 8000)) {
          clearInterval(timer);
          resolve(window.supabaseClient || null);
        }
      }, 20);
    });
  }

  var running = false;
  async function init() {
    if (!document.getElementById("typeSummary")) return;   // 이 페이지가 아니면 아무것도 안 한다
    if (running) return;
    running = true;
    try {
      var supabase = await waitSupabase();
      if (!supabase) return;
      var sess = (await supabase.auth.getSession()).data.session;
      if (!sess || !sess.user) {
        alert("로그인이 필요합니다.");
        nav("login.html");
        return;
      }
      if (typeof window.GALLA_computeType !== "function" || typeof window.GALLA_renderTypePage !== "function") return;
      /* 실제 행동 기반 성향 계산 → 화면 채우기 (행동 바뀌면 매번 재계산됨) */
      var data = await window.GALLA_computeType(supabase, sess.user.id);
      window.GALLA_renderTypePage(data);
    } catch (e) {
      console.error("[galla-type]", e);
    } finally {
      running = false;
    }
  }

  document.addEventListener("DOMContentLoaded", init);
  if (document.readyState !== "loading") init();
})();
