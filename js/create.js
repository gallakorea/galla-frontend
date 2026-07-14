/* =========================================================
   create.js — 인스타식 '새로 만들기' 페이지
   - 유형(갈라 발제 / 예측 마켓 / 광장 글 / 제보)을 고르면
     그 유형의 작성 화면으로 이동한다.
   - 갈라 발제는 1단계에선 운영진(admin_flag)만 (그 외엔 '곧 열려요')
   ========================================================= */
(function () {
  const ROUTE = {
    galla:   "write.html",
    predict: "galla-predict.html?compose=1",
    plaza:   "plaza.html?compose=1",
    report:  "report.html",
  };

  async function me() {
    try {
      const sb = window.supabaseClient ||
        (window.waitForSupabaseClient ? await window.waitForSupabaseClient() : null);
      if (!sb) return { logged: false, admin: false };
      const { data: sess } = await sb.auth.getSession();
      if (!sess?.session) return { logged: false, admin: false };
      const { data: prof } = await sb
        .from("user_profiles").select("admin_flag")
        .eq("user_id", sess.session.user.id).maybeSingle();
      return { logged: true, admin: !!prof?.admin_flag };
    } catch (_) {
      return { logged: false, admin: false };
    }
  }

  (async function init() {
    const { logged, admin } = await me();

    if (!logged) {
      if (confirm("로그인이 필요합니다. 로그인하시겠어요?")) location.href = "login.html";
      else history.length > 1 ? history.back() : (location.href = "index.html");
      return;
    }

    // 갈라 발제는 운영진만 (그 외엔 잠금 표시)
    const gallaCard = document.querySelector('.cr-card[data-type="galla"]');
    if (gallaCard && !admin) {
      gallaCard.classList.add("locked");
      gallaCard.querySelector(".cr-lock").hidden = false;
      gallaCard.querySelector(".cr-d").textContent =
        "지금은 갈라 팀이 발제 중 · 곧 모두에게 열립니다";
    }

    document.getElementById("crList").addEventListener("click", (e) => {
      const card = e.target.closest(".cr-card");
      if (!card) return;

      if (card.classList.contains("locked")) {
        card.classList.remove("shake");
        void card.offsetWidth;          // 리플로우 강제 → 애니메이션 재생
        card.classList.add("shake");
        return;
      }
      const url = ROUTE[card.dataset.type];
      if (url) location.href = url;
    });
  })();
})();
