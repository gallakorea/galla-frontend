/* ============================================================
   🤸 헤더 로고에서 노는 사람들 — window.GALLA_LogoPlay
   (26.9.20 사장님: 「인덱스 상단 중앙 갈라 로고에 사람들 SVG 가 익살스럽게 노는 애니메이션」)

   · 홈(index) 헤더의 GALLA 워드마크 위·옆에 작은 사람 넷이 산다.
   · 평소엔 각자 자리에서 꼼지락거리고, 몇 초에 한 번씩 한 명이 장난을 친다
     (로고 위 달리기 · 글자에 매달리기 · 미끄럼 · 물구나무 · 로고 밀기 · 넘어지기).
   · 예측 깃발 진영(js/predict-crowd.js)·이슈 줄다리기(js/vote-bar.js)와 같은 몸 — 선 굵기·둥근 끝.
   ⚠️ 헤더는 늘 보이는 자리라 조용해야 한다 — 탭이 숨으면 멈추고, 움직임 줄이기 설정이면 아예 안 논다.
   ⚠️ 로고를 가리지 않는다(사람은 로고 위쪽 띠에만, 로고 자체는 그대로 눌러 이동).
   ============================================================ */
(function () {
  if (window.GALLA_LogoPlay) return;                  // 중복 로드 가드(MPA·SPA 양쪽)
  const reduce = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const BODY = (inner) => '<g class="lgp-body" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">' + inner + '</g>';
  const HEAD = '<circle cx="12" cy="6.2" r="4.4" fill="currentColor" stroke="none"/>';
  /* 기본 자세 — 서서 꼼지락 */
  const STAND = '<svg class="lgp-one" viewBox="0 0 24 32" aria-hidden="true">' + BODY(
    HEAD + '<path d="M12 11 L12 19.8"/><path d="M12 13.4 L6.6 17.8"/><path d="M12 13.4 L17.4 17.8"/>' +
    '<path d="M12 19.8 L7.4 29 M12 19.8 L16.6 29"/>') + '</svg>';
  /* 매달리기 — 로고 글자 위 선을 잡고 대롱대롱 */
  const HANG = '<svg class="lgp-one lgp-hang" viewBox="0 0 24 32" aria-hidden="true">' + BODY(
    '<circle cx="12" cy="11" r="4.4" fill="currentColor" stroke="none"/>' +
    '<path d="M12 14.4 L12 23"/><path d="M12 14.4 L8.6 6.4 M12 14.4 L15.4 6.4"/>' +
    '<path d="M12 23 L9.2 30 M12 23 L14.8 30"/>') + '</svg>';
  /* 물구나무 */
  const HAND = '<svg class="lgp-one lgp-hand" viewBox="0 0 24 32" aria-hidden="true">' + BODY(
    '<circle cx="12" cy="25.5" r="4.4" fill="currentColor" stroke="none"/>' +
    '<path d="M12 22 L12 12.4"/><path d="M12 22 L8.4 28.6 M12 22 L15.6 28.6"/>' +
    '<path d="M12 12.4 L8.6 5.4 M12 12.4 L15.4 5.4"/>') + '</svg>';

  /* 🪑 글자 위에 걸터앉기 — 헐리우드 사인에 사람이 앉아 노는 그림(26.9.20 사장님).
     엉덩이가 글자 윗선에 닿고 다리는 아래로 늘어뜨려 흔든다. */
  const SIT = '<svg class="lgp-one lgp-sit" viewBox="0 0 24 32" aria-hidden="true">' + BODY(
    '<circle cx="11" cy="7.4" r="4.4" fill="currentColor" stroke="none"/>' +
    '<path d="M11 12 L11.5 19"/>' +
    '<path d="M11.2 14.4 L16.6 16.6"/>' +           // 한 팔은 짚고
    '<path d="M11.2 14.8 L6.2 17.6"/>' +           // 한 팔은 무릎에
    '<g class="lgp-legs"><path d="M11.5 19 L9 27.6 M11.5 19 L14.6 27.2"/></g>') + '</svg>';
  /* 🧗 글자를 기어오른다 — 팔다리를 벌려 매달리듯 붙어 위아래로 조금씩 오른다 */
  const CLIMB = '<svg class="lgp-one lgp-climb" viewBox="0 0 24 32" aria-hidden="true">' + BODY(
    '<circle cx="12" cy="7" r="4.4" fill="currentColor" stroke="none"/>' +
    '<path d="M12 11.6 L12 21"/>' +
    '<path d="M12 13.6 L6.4 9.6"/><path d="M12 14.6 L17.8 11"/>' +
    '<path d="M12 21 L7 26.4"/><path d="M12 21 L17 27.2"/>') + '</svg>';

  const PARTS = [CLIMB, SIT, HANG, STAND];
  /* 장난 — 순서대로 돌지 않고 섞어 뽑는다(같은 장난이 연달아 보이면 금방 질린다) */
  const TRICKS = ["lgp-run", "lgp-jump", "lgp-slide", "lgp-spin", "lgp-push", "lgp-trip", "lgp-wave", "lgp-up", "lgp-drop", "lgp-kick"];

  let wrap = null, timer = null, host = null;

  function build(logo) {
    const box = document.createElement("div");
    box.className = "lgp";
    box.setAttribute("aria-hidden", "true");
    box.innerHTML = PARTS.map((svg, i) => `<span class="lgp-slot s${i + 1}">${svg}</span>`).join("");
    return box;
  }

  /* 로고를 감싸 같은 자리에 겹친다 — 로고 자체는 건드리지 않는다(클릭·정중앙 고정 그대로) */
  function attach() {
    const logo = document.querySelector(".header-inner.header-3 .logo, .header .logo");
    if (!logo || !logo.parentNode) return false;
    if (wrap && wrap.isConnected && host === logo) return true;
    if (wrap) wrap.remove();
    wrap = build(logo);
    host = logo;
    /* ⚠️ 헤더 3분할은 그리드다 — 그리드 자식으로 넣으면 absolute 의 기준이 「그 칸」이 되어
       left:50% 가 오른쪽 칸 한가운데로 간다(26.9.20 QA: 로고보다 107px 오른쪽). 헤더 자체에 붙인다. */
    const holder = logo.closest(".header") || logo.parentNode;
    if (getComputedStyle(holder).position === "static") holder.style.position = "relative";
    holder.appendChild(wrap);
    place();
    return true;
  }

  /* 로고 크기만 알려 준다 — 자리 맞추기는 CSS 가 한다(로고와 같은 절대 중앙 규칙) */
  function place() {
    if (!wrap || !host) return;
    const r = host.getBoundingClientRect();
    if (!r.width) return;
    wrap.style.setProperty("--lgp-w", r.width + "px");
    wrap.style.setProperty("--lgp-h", r.height + "px");
  }

  function tick() {
    if (!wrap || document.hidden || reduce()) return;
    if (!wrap.isConnected) { if (!attach()) return; }
    const slots = [...wrap.querySelectorAll(".lgp-slot")];
    if (!slots.length) return;
    const s = slots[Math.floor(Math.random() * slots.length)];
    if (s.dataset.busy === "1") return;
    const t = TRICKS[Math.floor(Math.random() * TRICKS.length)];
    s.dataset.busy = "1";
    s.classList.add(t);
    /* 로고 밀기 — 사람이 밀면 로고도 흔들려야 말이 된다 */
    if (t === "lgp-push" && host) {
      host.classList.remove("lgp-shake"); void host.offsetWidth; host.classList.add("lgp-shake");
      setTimeout(() => host.classList.remove("lgp-shake"), 900);
    }
    setTimeout(() => { s.classList.remove(t); s.dataset.busy = "0"; }, 1800);
  }

  function start() {
    if (!attach()) return;
    if (timer) clearInterval(timer);
    timer = setInterval(tick, 2600);
    setTimeout(tick, 900);                      // 첫 장난은 금방 한 번
  }
  function stop() { if (timer) { clearInterval(timer); timer = null; } if (wrap) { wrap.remove(); wrap = null; host = null; } }

  /* 홈에서만 논다 — 다른 판(글쓰기·DM 등)에선 헤더가 조용해야 한다 */
  function syncByPage() {
    const page = (document.body && document.body.dataset.page) || "";
    const hash = (location.hash || "").replace(/^#\/?/, "").split("?")[0];
    const atHome = page === "index" || (page === "spa" && (hash === "" || hash === "index"));
    if (atHome) start(); else stop();
  }

  document.addEventListener("DOMContentLoaded", syncByPage);
  if (document.readyState !== "loading") syncByPage();
  window.addEventListener("hashchange", syncByPage);
  window.addEventListener("resize", place);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) place(); });
  /* SPA 판 전환 — 셸이 알리는 신호(있으면)와 스크롤 뒤 자리 보정 */
  window.addEventListener("galla:tab", syncByPage);
  window.addEventListener("scroll", place, { passive: true });

  window.GALLA_LogoPlay = { start, stop, tick, place };
})();
