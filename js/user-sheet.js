/* =========================================================
   유저 액션 시트 — 닉네임/프로필 클릭 시 뜨는 바텀시트
   규칙: [data-user-id]가 붙은 요소를 누르면 열림
         → 프로필 보기 / 메시지 보내기(DM)
   본인이면 메시지 버튼 숨김. window.GALLA_openUserSheet(id, nick)
   ========================================================= */
(function () {
  let sheet = null, ME = null, meResolved = false;

  const esc = s => (s == null ? "" : String(s).replace(/[&<>"]/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])));
  const avatarColor = id => {
    let h = 0; for (const c of (id || "")) h = (h * 31 + c.charCodeAt(0)) % 360;
    return `hsl(${h} 55% 45%)`;
  };

  async function resolveMe() {
    if (meResolved) return ME;
    try {
      const sb = window.supabaseClient;
      if (sb) { const { data } = await sb.auth.getSession(); ME = data?.session?.user?.id || null; }
    } catch (_) {}
    meResolved = true;
    return ME;
  }

  function build() {
    if (sheet) return sheet;
    sheet = document.createElement("div");
    sheet.id = "user-sheet";
    sheet.className = "us-sheet";
    sheet.innerHTML = `
      <div class="us-dim"></div>
      <div class="us-card" role="dialog" aria-label="사용자">
        <div class="us-grip"></div>
        <div class="us-head">
          <span class="us-ava" id="usAva"></span>
          <span class="us-name" id="usName"></span>
        </div>
        <div class="us-actions">
          <button class="us-btn" data-act="profile">👤 프로필 보기</button>
          <button class="us-btn" data-act="duel" id="usDuel">⚔️ 일기토 신청</button>
          <button class="us-btn primary" data-act="dm" id="usDm">✉️ 메시지 보내기</button>
        </div>
      </div>`;
    document.body.appendChild(sheet);
    const close = () => sheet.classList.remove("open");
    sheet.querySelector(".us-dim").addEventListener("click", close);
    sheet.addEventListener("click", e => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (!act) return;
      const uid = sheet.dataset.uid, nick = sheet.dataset.nick || "";
      if (act === "profile") { location.href = `mypage.html?user=${uid}`; }
      else if (act === "duel") { close(); location.href = `duel.html?challenge=${uid}`; }
      else if (act === "dm") {
        close();
        if (window.startDM) window.startDM(uid, nick);
        else location.href = `mypage.html?user=${uid}`; // dm 미로드 페이지 폴백
      }
    });
    return sheet;
  }

  window.GALLA_openUserSheet = async function (uid, nick) {
    if (!uid) return;
    build();
    const me = await resolveMe();
    sheet.dataset.uid = uid;
    sheet.dataset.nick = nick || "";
    const name = nick || "사용자";
    sheet.querySelector("#usName").textContent = name;
    const ava = sheet.querySelector("#usAva");
    ava.textContent = (name.charAt(0) || "?").toUpperCase();
    ava.style.background = avatarColor(uid);
    // 본인이면 메시지·일기토 버튼 숨김
    const self = (me && me === uid);
    sheet.querySelector("#usDm").style.display = self ? "none" : "";
    sheet.querySelector("#usDuel").style.display = self ? "none" : "";
    requestAnimationFrame(() => sheet.classList.add("open"));
  };

  // 전역 위임: [data-user-id]를 누르면 시트 오픈 (빈 id·익명 제외)
  document.addEventListener("click", e => {
    const el = e.target.closest("[data-user-id]");
    if (!el) return;
    const uid = el.getAttribute("data-user-id");
    if (!uid) return;
    e.preventDefault();
    e.stopPropagation();
    window.GALLA_openUserSheet(uid, el.getAttribute("data-user-nick") || el.textContent.trim());
  }, true); // capture: 다른 카드 클릭 핸들러보다 먼저
})();
