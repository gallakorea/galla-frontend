/* 🕒 시간 표시 한 벌 — 인스타식(26.9.19 사장님): 방금 → N분 전 → N시간 전 → 어제 → N일 전(일주일까지) → 9월 10일
   올해는 연도를 빼고, 지난해 이전만 「2025년 9월 10일」. 화면마다 따로 쓰던 시간 함수는 이게 있으면 이걸 쓴다. */
(function () {
  if (window.GALLA_ago) return;
  window.GALLA_ago = function (ts) {
    if (!ts) return "";
    const t = new Date(ts);
    if (isNaN(t.getTime())) return "";
    const s = (Date.now() - t.getTime()) / 1000;
    if (s < 60) return "방금";
    if (s < 3600) return Math.floor(s / 60) + "분 전";
    if (s < 86400) return Math.floor(s / 3600) + "시간 전";
    const now = new Date();
    const d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const d1 = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
    const days = Math.round((d0 - d1) / 86400000);
    if (days <= 1) return "어제";
    if (days < 7) return days + "일 전";
    return (t.getFullYear() === now.getFullYear() ? "" : t.getFullYear() + "년 ") + (t.getMonth() + 1) + "월 " + t.getDate() + "일";
  };
})();
