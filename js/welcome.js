/* =========================================================
   🎉 로그인/가입 환영 · 단계별 위트 메시지
   - login.js/signup.js가 localStorage.galla_welcome_pending 에 값을 남기면
     index 진입 시 상단 배너로 재치있게 인사하고 지운다.
   - "new" = 갓 가입 · 숫자 = 로그인 누적 횟수(단계)
   ========================================================= */
(function () {
  const KEY = "galla_welcome_pending";
  let pending = null;
  try { pending = localStorage.getItem(KEY); } catch (e) { return; }
  if (!pending) return;
  try { localStorage.removeItem(KEY); } catch (e) {}

  function pick(p) {
    if (p === "new") return { emoji: "🎉", title: "갈라에 오신 걸 환영해요!", body: "이제 당신의 진영을 정할 시간. 찬성이냐 반대냐, 세상에 한 방 날려보세요." };
    const n = parseInt(p, 10) || 1;
    const tiers = {
      1:  { emoji: "👋", title: "첫 로그인 완료!", body: "여론이 에너지가 되는 곳, 갈라. 오늘의 뜨거운 논쟁으로 바로 가볼까요?" },
      2:  { emoji: "👀", title: "또 오셨네요", body: "어제 그 논쟁, 아직 안 끝났어요. 당신의 한마디가 판을 뒤집을지도?" },
      3:  { emoji: "😏", title: "3일 차 갈라인", body: "슬슬 갈라 없이 못 사는 몸이 되어가는 중… 정상입니다." },
      5:  { emoji: "🔥", title: "벌써 5번째!", body: "여론 전사의 자질이 보입니다. 이제 진영을 이끌 때." },
      7:  { emoji: "⚡", title: "럭키 세븐 로그인", body: "이 정도면 갈라가 당신을 기다립니다. 오늘도 한 건 하시죠." },
      10: { emoji: "🏆", title: "10회 달성 · 갈라 고인물", body: "당신은 이제 여론의 베테랑. 후배들에게 논쟁의 맛을 보여주세요." },
      20: { emoji: "👑", title: "20회 · 갈라의 지배자", body: "이쯤 되면 갈라 지분 좀 드려야 하는 거 아닌가요?" },
      50: { emoji: "🐉", title: "50회 · 갈라 전설", body: "이제 당신 없는 광장은 상상할 수 없습니다." },
    };
    if (tiers[n]) return tiers[n];
    const pool = [
      { emoji: "🎯", title: "돌아오셨군요", body: "오늘은 어느 진영에 불을 지펴볼까요?" },
      { emoji: "💥", title: "등장!", body: "당신이 오니 광장이 다시 뜨거워지네요." },
      { emoji: "🧠", title: "어서오세요", body: "오늘의 갈라치기, 당신의 논리를 기다립니다." },
      { emoji: "🚀", title: "접속 완료", body: "여론의 판도를 바꿀 준비 되셨나요?" },
      { emoji: "☕", title: "왔군요", body: "커피 한 잔 하며 오늘의 논쟁 구경 어때요?" },
      { emoji: "🎭", title: "오늘의 주인공 입장", body: "찬성이든 반대든, 갈라는 뜨거운 쪽을 사랑합니다." },
    ];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function css() {
    if (document.getElementById("galwel-css")) return;
    const s = document.createElement("style"); s.id = "galwel-css";
    s.textContent =
      ".galwel{position:fixed;left:10px;right:10px;top:calc(10px + env(safe-area-inset-top,0px));z-index:2147483400;display:flex;justify-content:center;pointer-events:none}" +
      ".galwel-card{display:flex;align-items:center;gap:12px;max-width:460px;width:100%;padding:13px 15px;border-radius:16px;" +
      "background:linear-gradient(135deg,#1b1e2a,#111319);border:1px solid rgba(111,134,255,.35);box-shadow:0 18px 50px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.06);" +
      "transform:translateY(-140%);opacity:0;transition:transform .42s cubic-bezier(.2,.9,.3,1),opacity .3s}" +
      ".galwel.show .galwel-card{transform:translateY(0);opacity:1}" +
      ".galwel-emoji{flex:0 0 auto;font-size:26px;line-height:1;filter:drop-shadow(0 2px 6px rgba(111,134,255,.5))}" +
      ".galwel-tx{min-width:0}" +
      ".galwel-tt{font-size:14.5px;font-weight:900;color:#f3f4f6;letter-spacing:-.2px}" +
      ".galwel-bd{font-size:12.5px;color:#a9b0c0;line-height:1.45;margin-top:2px}";
    document.head.appendChild(s);
  }

  function show(m) {
    css();
    const t = document.createElement("div"); t.className = "galwel";
    t.innerHTML =
      '<div class="galwel-card"><div class="galwel-emoji">' + m.emoji + '</div>' +
      '<div class="galwel-tx"><div class="galwel-tt">' + m.title + '</div>' +
      '<div class="galwel-bd">' + m.body + '</div></div></div>';
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add("show"));
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 450); }, 4800);
  }

  const m = pick(pending);
  if (document.body) show(m); else document.addEventListener("DOMContentLoaded", () => show(m));
})();
