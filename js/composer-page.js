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
    head.querySelector(".cp-back").addEventListener("click", () => {
      // pushState 해뒀으면 뒤로가기로 닫는다(= popstate → close)
      if (pushed) history.back();
      else spec.close();
    });
  }

  function onOpen(el, spec) {
    if (openSpec) return;
    openSpec = spec;
    ensureHeader(el, spec);
    document.body.classList.add("composer-open");
    try {
      history.pushState({ composer: spec.sel }, "");
      pushed = true;
    } catch (_) { pushed = false; }
  }

  function onClose() {
    if (!openSpec) return;
    const wasPushed = pushed;
    openSpec = null;
    pushed = false;
    document.body.classList.remove("composer-open");
    // 컴포저가 자체 버튼으로 닫힌 경우, 쌓아둔 history 항목을 되돌린다
    if (wasPushed && history.state && history.state.composer) history.back();
  }

  window.addEventListener("popstate", () => {
    if (!openSpec) return;
    const spec = openSpec;
    openSpec = null;
    pushed = false;                       // 이미 history가 빠졌으므로 back() 금지
    document.body.classList.remove("composer-open");
    spec.close();
  });

  document.addEventListener("DOMContentLoaded", () => {
    SPECS.forEach((spec) => {
      const el = document.querySelector(spec.sel);
      if (!el) return;
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
  });
})();
