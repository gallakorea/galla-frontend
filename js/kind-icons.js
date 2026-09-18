/* 🪪 갈라 콘텐츠 종류 표식 — 종류마다 SVG 아이콘 하나 + 색 하나 + 이름 하나(26.9.19 사장님: 「피드마다 이게 어떤 건지 SVG 로, 여기서 정립」).
   홈 피드가 기준이고, 다른 화면(검색·저장함·알림 등)도 이 표를 가져다 쓴다 — 아이콘·색·이름을 따로 만들지 말 것.
   이모지 금지(연출 톤 규칙) — 전부 선 굵기 2 의 24칸 SVG.

   GALLA_KIND.icon(kind, size)  → <svg> 문자열
   GALLA_KIND.tag(kind)         → <span class="ktag ktag-종류"><svg/>이름</span>
   GALLA_KIND.meta[kind]        → { name, color } */
(function () {
  const P = {
    // 이슈 — 마주 선 말풍선 둘(찬반이 붙는 판)
    issue: '<path d="M3 5.5A2.5 2.5 0 0 1 5.5 3h7A2.5 2.5 0 0 1 15 5.5v4A2.5 2.5 0 0 1 12.5 12H8l-3.5 3v-3.2A2.5 2.5 0 0 1 3 9.5z"/><path d="M17.5 8H18.5A2.5 2.5 0 0 1 21 10.5v4a2.5 2.5 0 0 1-2 2.45V20l-3.5-3H11.5A2.5 2.5 0 0 1 9 14.5V14"/>',
    // 숏판 — 세로 화면 + 재생
    short: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 9.2v5.6l4.4-2.8z" fill="currentColor" stroke="none"/>',
    // 롱판 — 가로 화면 + 재생
    long: '<rect x="2.5" y="5" width="19" height="12.5" rx="2.5"/><path d="M10.2 8.6v5.3l4.3-2.65z" fill="currentColor" stroke="none"/><path d="M8 21h8"/>',
    // 링크 — 사슬
    link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2"/>',
    // 광장 — 기둥 선 건물
    plaza: '<path d="M3 9.5 12 4l9 5.5"/><path d="M4.5 9.5h15"/><path d="M6.5 12v6M10.5 12v6M13.5 12v6M17.5 12v6"/><path d="M3.5 20.5h17"/>',
    // 갈라뉴스 — 접힌 신문
    news: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h11A1.5 1.5 0 0 1 18 5.5V18a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2z"/><path d="M18 9h1.5A1.5 1.5 0 0 1 21 10.5V18a2 2 0 0 1-2 2"/><path d="M7.5 8h7M7.5 11.5h7M7.5 15h4.5"/>',
    // 핫튜브 — 불꽃
    hottube: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    // 일기토 — 엇갈린 칼
    duel: '<path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="M13 19l6-6M16 16l4 4M19 21l2-2"/><path d="M14.5 6.5 18 3h3v3l-3.5 3.5"/><path d="M5 14l4 4M7 17l-3 3M3 19l2 2"/>',
    // 갈라예측 — 수정구
    predict: '<circle cx="12" cy="10.5" r="7"/><path d="M8.8 8.2a3.6 3.6 0 0 1 3-2.2"/><path d="M6.5 16.2 5 20.5h14l-1.5-4.3"/>',
  };
  const meta = {
    issue:   { name: "이슈",     color: "#ff6b57" },
    short:   { name: "숏판",     color: "#ff4fa3" },
    long:    { name: "롱판",     color: "#6f86ff" },
    link:    { name: "링크",     color: "#9aa0ae" },
    plaza:   { name: "광장",     color: "#36c2a0" },
    news:    { name: "갈라뉴스", color: "#5ab0ff" },
    hottube: { name: "핫튜브",   color: "#ff5a3d" },
    duel:    { name: "일기토",   color: "#ffb020" },
    predict: { name: "갈라예측", color: "#b07cff" },
  };
  function icon(kind, size) {
    const s = size || 14;
    return '<svg class="kic" viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[kind] || P.issue) + "</svg>";
  }
  function tag(kind, label) {
    const m = meta[kind] || meta.issue;
    return '<span class="ktag ktag-' + (meta[kind] ? kind : "issue") + '">' + icon(kind, 13) + "<b>" + (label || m.name) + "</b></span>";
  }
  window.GALLA_KIND = { icon, tag, meta };
})();
