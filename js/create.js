/* =========================================================
   create.js — 인스타식 '새로 만들기' 페이지
   - 유형(갈라 발제 / 예측 마켓 / 광장 글 / 제보)을 고르면
     그 유형의 작성 화면으로 이동한다.
   - 갈라 발제는 1단계에선 운영진(admin_flag)만 (그 외엔 '곧 열려요')

   이중 모드(2026-07-27):
   - MPA(단독 문서, body data-page≠'spa')면 기존처럼 즉시 자동 초기화.
   - SPA(app.html)면 어댑터(js/spa/views/create.js)가
     window.GALLA_PAGE_CREATE.mount(root)를 부를 때까지 대기.
   ========================================================= */
(function () {
  const ROUTE = {
    galla:   "write.html",
    gallari: "gallari-write.html",
    predict: "galla-predict.html?compose=1",
    plaza:   "search.html?tab=plaza&compose=1",
    report:  "report.html",
  };

  const isSpa = () => !!(document.body && document.body.dataset.page === "spa");

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

  async function initCreatePage(root) {
    const scope = root || document;
    const list = scope.querySelector("#crList");
    if (!list) return;

    const { logged, admin } = await me();

    // 비로그인: 차단형 confirm 대신 인라인 안내 (페이지가 그대로 보이게)
    // (SPA에선 login.html 링크를 라우터가 가로채 #/login 스택 push — 문서 유지)
    if (!logged) {
      list.innerHTML = `
        <div class="cr-need">
          <p>로그인하면 갈라를 발제하고, 예측 마켓을 열고, 광장에 글을 쓸 수 있어요.</p>
          <a class="cr-login" href="login.html">로그인하기</a>
        </div>`;
      return;
    }

    // 갈라 발제는 운영진만 (그 외엔 잠금 표시)
    const gallaCard = scope.querySelector('.cr-card[data-type="galla"]');
    if (gallaCard && !admin) {
      gallaCard.classList.add("locked");
      gallaCard.querySelector(".cr-lock").hidden = false;
      gallaCard.querySelector(".cr-d").textContent =
        "지금은 갈라 팀이 발제 중 · 곧 모두에게 열립니다";
    }

    // 갈라리(콘텐츠)는 아직 비공개 — 플래그(gallari_enabled) 켜졌거나 운영진일 때만 노출
    const glrCard = scope.querySelector('.cr-card[data-type="gallari"]');
    if (glrCard) {
      let gallariOn = false;
      try {
        const sb = window.supabaseClient;
        if (sb) {
          const { data } = await sb.from("app_settings").select("v").eq("k", "gallari_enabled").maybeSingle();
          gallariOn = !!data && (data.v === true || data.v === "true");
        }
      } catch (_) {}
      if (admin || gallariOn) glrCard.hidden = false;
    }

    list.addEventListener("click", (e) => {
      const card = e.target.closest(".cr-card");
      if (!card) return;

      if (card.classList.contains("locked")) {
        card.classList.remove("shake");
        void card.offsetWidth;          // 리플로우 강제 → 애니메이션 재생
        card.classList.add("shake");
        return;
      }
      const type = card.dataset.type;
      const url = ROUTE[type];
      if (!url) return;
      // SPA(app.html): 모든 유형을 문서 이탈 없이 SPA 안에서 연다(스플래시·뒤로가기 붕괴 방지).
      //   갈라 발제 → write 스택 뷰 / 제보 → report 스택 뷰(뒤로가기=pop)
      //   예측·광장 → 해당 탭 활성 후 compose 모달(뒤로가기=모달 닫기)
      if (isSpa() && window.GALLA_SPA) {
        if (type === "galla")   { window.GALLA_SPA.push("write");   return; }
        if (type === "gallari") { window.GALLA_SPA.push("gallari-write"); return; }
        if (type === "report")  { window.GALLA_SPA.push("report");  return; }
        if (type === "predict") { window.GALLA_SPA.compose("predict"); return; }
        if (type === "plaza")   { window.GALLA_SPA.compose("plaza");   return; }
      }
      location.href = url;
    });
  }

  /* 이중 모드 — MPA면 기존처럼 즉시 초기화(스크립트가 body 끝이라 DOM 준비됨) */
  if (!isSpa()) {
    initCreatePage(document);
  }

  /* SPA 페이지 훅 — 초기화 로직은 위 initCreatePage 그대로. */
  window.GALLA_PAGE_CREATE = {
    _root: null,
    async mount(root) {
      this._root = root || null;
      await initCreatePage(root || document);
      // 부가 안내(배너·코치마크) — 재-mount에도 다시 붙게 명시 시작
      try { window.GALLA_CREATE_GUIDE_START && window.GALLA_CREATE_GUIDE_START(root || document); } catch (_) {}
    },
    unmount() {
      this._root = null;
      // 코치마크 오버레이는 body에 붙으므로 명시 정리
      try { window.GALLA_CREATE_GUIDE_STOP && window.GALLA_CREATE_GUIDE_STOP(); } catch (_) {}
    },
  };
})();
