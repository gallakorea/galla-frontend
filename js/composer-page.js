/* =========================================================
   composer-page.js — 작성 모달을 '전용 페이지'처럼 승격
   - 광장 글쓰기(#plaza-write-modal) / 예측 마켓 생성(#createModal)
   - 전체화면 + 상단 헤더(←/제목) + 하단 고정 액션바 (create.html 과 톤 통일)
   - 열리면 history 항목을 쌓아 '뒤로가기'로 닫힌다 → 체감상 완전한 페이지

   ⚠️ 기존 plaza.js / galla-predict.js 로직은 건드리지 않는다.
      열림/닫힘을 감시(MutationObserver)해서 껍데기만 페이지화한다.
========================================================= */
(function () {
  const SPECS = [
    {
      sel: "#plaza-write-modal",
      box: ".plaza-modal-box",
      title: "광장 글 쓰기",
      isOpen: (el) => !el.classList.contains("hidden"),
      close: () => window.closePlazaWriteModal && window.closePlazaWriteModal(),
    },
    {
      sel: "#createModal",
      box: ".pm-modal-inner",
      title: "새 예측 마켓",
      isOpen: (el) => !el.hasAttribute("hidden"),
      close: () => document.getElementById("createClose")?.click(),
    },
  ];

  let openSpec = null;      // 현재 열려 있는 컴포저
  let pushed = false;       // history 항목을 쌓았는지
  let pageMode = false;     // '이 페이지 자체가 작성화면'(?compose=1 진입) 인가
  let firstOpen = true;
  let stayOnClose = false;  // 발행 성공 닫기 — 뒤로가기(create) 대신 '뒤에 있는 목록' 노출
  let spaMode = false;      // SPA(app.html)에서 열림 — 뒤로가기 history는 라우터 오버레이가 소유(이중관리 금지)

  // SPA 셸 여부 — 여기선 라우터가 history를 소유하므로 composer는 '시각적 페이지화'만 담당하고
  // 뒤로가기/닫기 동기화는 GALLA_SPA.openOverlay 에 위임한다(웹 MPA와 동일 CSS·다른 history 소유자).
  const IS_SPA = () => !!(window.GALLA_SPA && document.body && document.body.dataset.page === "spa");

  /* 발행 성공 시 호출: 다음 닫기는 create로 되돌리지 말고 그 자리(목록)에 머문다.
     compose=1로 들어와도 뒤에 이미 광장/예측 목록이 렌더돼 있어, 모달만 닫으면 목록이 보인다. */
  window.__composerStayOnPublish = function () { stayOnClose = true; };

  // create.html → plaza/predict?compose=1 로 들어온 경우:
  //   이 페이지는 사실상 '작성 페이지'다. history를 더 쌓으면 뒤로가기가
  //   create가 아니라 피드로 가버린다 → 쌓지 말고 이전 페이지로 복귀시킨다.
  const CAME_FROM_COMPOSE =
    new URLSearchParams(location.search).get("compose") === "1";

  function goBackToPicker() {
    // SPA 셸에선 create.html로 문서를 떠나지 않는다(뒤로가기 먹통의 원인). 열린 모달이 있으면 닫고,
    // (onClose 경유로 이미 닫힌 뒤 호출되면) 그냥 그 자리(피드)에 머문다 — 절대 location 이동 안 함.
    if (window.GALLA_SPA) { if (openSpec) { try { openSpec.close(); } catch (_) {} } return; }
    if (window.GALLA_back) window.GALLA_back("create.html");
    else (window.GALLA_nav||function(u){location.href=u})("create.html");
  }

  const BACK_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';

  function ensureHeader(el, spec) {
    const box = el.querySelector(spec.box);
    if (!box || box.querySelector(".cp-head")) return;
    const head = document.createElement("div");
    head.className = "cp-head";
    head.innerHTML =
      `<button type="button" class="cp-back" aria-label="뒤로">${BACK_SVG}</button>` +
      `<span class="cp-title">${spec.title}</span>` +
      `<span class="cp-spacer"></span>`;
    box.prepend(head);
    head.querySelector(".cp-back").addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (spaMode) { try { history.back(); } catch (_) {} return; }  // 라우터 오버레이가 pop→모달 닫기
      if (pageMode) { goBackToPicker(); return; }   // 이 페이지가 곧 작성화면 → 유형 선택으로
      if (pushed) { history.back(); return; }       // 인페이지로 열었으면 popstate로 닫기
      spec.close();
    });
  }

  function onOpen(el, spec) {
    if (openSpec) return;
    // SPA 스택 뷰로 열린 compose(라우터가 모달을 스택 레이어로 이동)면 여기선 아무것도 안 한다 —
    // 헤더·전체화면·뒤로가기 전부 라우터 스택이 담당(이중 헤더/history 방지).
    if (el.__stackMode) return;
    openSpec = spec;
    ensureHeader(el, spec);
    document.body.classList.add("composer-open");

    // SPA: 라우터 오버레이가 뒤로가기/엣지스와이프/닫기 동기화를 소유(문서 history 안 씀 — 라우터와 이중관리 방지)
    if (IS_SPA() && window.GALLA_SPA.openOverlay) {
      spaMode = true; pageMode = false; firstOpen = false;
      try { window.GALLA_SPA.openOverlay(el, () => { try { spec.close(); } catch (_) {} }); } catch (_) {}
      return;
    }

    // ?compose=1 로 들어와 처음 열린 것 = 이 페이지가 곧 작성화면(page mode)
    pageMode = CAME_FROM_COMPOSE && firstOpen;
    firstOpen = false;

    if (!pageMode) {
      try {
        history.pushState({ composer: spec.sel }, "");
        pushed = true;
      } catch (_) { pushed = false; }
    }
  }

  function onClose() {
    if (!openSpec) return;
    const wasPushed = pushed;
    const wasPageMode = pageMode;
    const wasSpa = spaMode;
    openSpec = null;
    pushed = false;
    pageMode = false;
    spaMode = false;
    document.body.classList.remove("composer-open");

    // SPA: 시각적 정리만. history 소비는 라우터 오버레이(openOverlay의 감시자/ popstate)가 담당.
    if (wasSpa) { stayOnClose = false; return; }

    // 발행 성공으로 닫힌 경우 — 뒤로가기/유형선택으로 이동하지 않고 그 자리(목록)에 머문다.
    if (stayOnClose) {
      stayOnClose = false;
      // page mode였다면 history에 남은 항목을 조용히 정리(뒤로가기 눌러도 create 안 뜨게)
      if (wasPushed && history.state && history.state.composer) { try { history.back(); } catch (_) {} }
      return;
    }
    // page mode에서 자체 버튼(취소/✕)으로 닫으면 피드가 아니라 유형 선택으로 돌아간다
    if (wasPageMode) { goBackToPicker(); return; }
    // 인페이지로 열었다가 자체 버튼으로 닫힌 경우, 쌓아둔 history 항목을 되돌린다
    if (wasPushed && history.state && history.state.composer) history.back();
  }

  window.addEventListener("popstate", () => {
    if (!openSpec) return;
    if (spaMode) return;                  // SPA는 라우터 오버레이가 popstate를 소유(모달 닫기)
    const spec = openSpec;
    openSpec = null;
    pushed = false;                       // 이미 history가 빠졌으므로 back() 금지
    pageMode = false;                     // onClose가 또 이동시키지 않게
    document.body.classList.remove("composer-open");
    spec.close();
  });

  function bootComposerPage() {
    SPECS.forEach((spec) => {
      const el = document.querySelector(spec.sel);
      if (!el || el.__cpObserved) return;   // 이미 관찰 중이면 스킵(재실행 안전 — 멱등)
      el.__cpObserved = true;
      let wasOpen = spec.isOpen(el);
      new MutationObserver(() => {
        const now = spec.isOpen(el);
        if (now === wasOpen) return;
        wasOpen = now;
        if (now) onOpen(el, spec);
        else onClose();
      }).observe(el, { attributes: true, attributeFilter: ["class", "hidden"] });

      if (wasOpen) onOpen(el, spec);      // ?compose=1 로 이미 열린 채 진입한 경우
    });
  }
  // SPA에서 탭(예측/광장 모달)이 나중에 마운트돼도 관찰되게 — 뷰 mount 후 재스캔용(멱등).
  // ⚠️ composer-page.js는 문서당 1회만 로드/부팅되므로, 두 번째로 뜨는 탭의 모달은
  //    이 재스캔이 없으면 관찰되지 않아 페이지화가 안 된다(예측/광장 중 하나가 먹통).
  window.GALLA_composerRescan = bootComposerPage;

  // MPA(동기 로드) = DOMContentLoaded 대기(기존 그대로) / SPA = 뷰 마운트 후 동적 로드 → 즉시
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootComposerPage);
  else bootComposerPage();
})();
