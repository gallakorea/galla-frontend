/* 🎁 후원 버튼 공용 — 액션바마다 갈비스 앞에 둔다(26.9.19 사장님: 「인덱스의 모든 액션바·상세 페이지에 후원, 갈비스 버튼 이전에」).
   마크업: <button data-support data-sp-kind="issue|post|plaza|market" data-sp-id="…" data-sp-uid="작성자 uid" data-sp-name="작성자 이름">
   눌림은 문서 캡처 단계 위임 한 곳에서 받는다 — 카드 전체 onclick(상세 이동)보다 먼저 잡아 멈춘다.
   후원 시트는 donate.js — 안 실린 화면이면 누를 때 싣는다.
   받는 사람이 우리 회원인 콘텐츠만 후원이 된다(이슈 발의자·숏판/롱판 창작자·광장 작성자).
   예측은 사람이 연 것만(예언자). 갈라뉴스(AI)·핫튜브(유튜브)·AI 예측은 받을 사람이 없어 버튼을 두지 않는다. */
(function () {
  if (window.GALLA_support) return;
  /* ₩ 코인 + 반짝임 — '돈을 보낸다'가 한눈에(사장님: 「저급하지 않고 멋지고 돈에 직관적」) */
  const GIFT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="13" r="8.2"/><path d="M6.9 9.6l1.8 7 2.3-5 2.3 5 1.8-7"/><path d="M6.2 12.4h9.6"/><path d="M19.6 1.8v4.4M17.4 4h4.4" stroke-width="1.6"/></svg>';
  const say = (m) => (window.GALLA_toast || window.showToast || console.log)(m);
  let loading = null;
  function loadDonate() {
    if (window.openDonate) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise((res) => {
      const s = document.createElement("script");
      s.src = "/js/donate.js?v=" + (window.GALLA_V || "1");
      s.onload = s.onerror = () => res();
      document.head.appendChild(s);
    });
    return loading;
  }
  async function myUid() {
    try { const { data } = await window.supabaseClient.auth.getSession(); return data?.session?.user?.id || null; }
    catch (_) { return null; }
  }
  async function open(kind, id, ownerUid, name) {
    if (!id) return;
    const uid = await myUid();
    if (!uid) { (window.GALLA_needLogin || say)("로그인하고 후원할 수 있어요"); return; }
    if (ownerUid && ownerUid === uid) { say("내 콘텐츠예요 — 후원은 받는 쪽이에요"); return; }
    await loadDonate();
    const fn = kind === "post" ? window.openDonatePost : kind === "plaza" ? window.openDonatePlaza
             : kind === "market" ? window.openDonateMarket : window.openDonate;
    if (fn) fn(isNaN(+id) ? id : +id, name || "");
    else say("후원 준비 중이에요");
  }
  window.GALLA_support = open;
  window.GALLA_SUPPORT_ICON = GIFT;
  /* 카드용 마크업 한 줄(홈 피드 액션바 .fi-btn 문법) */
  window.GALLA_supportBtn = (kind, id, ownerUid, name, cls) =>
    '<button type="button" class="' + (cls || "fi-btn support-btn") + '" data-support data-sp-kind="' + kind + '" data-sp-id="' + id +
    '" data-sp-uid="' + (ownerUid || "") + '" data-sp-name="' + String(name || "").replace(/[&<>"]/g, "") + '" aria-label="후원">' + GIFT.replace("<svg ", '<svg class="fi-ic" ') + "</button>";

  document.addEventListener("click", (e) => {
    const b = e.target && e.target.closest && e.target.closest("[data-support]");
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    try { window.BattleFX?.haptic?.("tap"); } catch (_) {}
    open(b.dataset.spKind || "issue", b.dataset.spId, b.dataset.spUid, b.dataset.spName);
  }, true);
})();
